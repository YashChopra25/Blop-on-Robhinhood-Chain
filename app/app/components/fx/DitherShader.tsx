"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * An ordered-dither shader that draws the vault monument as a field of dots.
 *
 * The scene is a signed-distance drawing evaluated per dot cell, quantised to
 * one bit through an 8x8 Bayer threshold — the same trick a 1980s printer used
 * to fake grey, which is why it reads as "on-chain" rather than "rendered".
 * The pointer pushes a blast wave through the sample coordinates and burns
 * dots out of the field; the blast decays to zero on its own, so the monument
 * always rebuilds itself without anything having to reset it.
 *
 * The render loop only runs while the field is disturbed. At rest a single
 * frame sits on the canvas costing nothing.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform vec2  uMouse;     // pixels, origin bottom-left to match gl_FragCoord
uniform float uBlast;     // 0 at rest, 1 the instant the pointer lands
uniform float uTime;
uniform float uPixel;     // dot pitch in device pixels
uniform vec3  uInk;
uniform vec3  uHot;
uniform vec3  uPaper;

// Recursive 2x2 -> 8x8 Bayer threshold. Cheaper than a texture lookup and
// exact enough that the dot pattern never drifts.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}

float box(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Solid slab helper: 1 inside, 0 outside, with a one-cell soft edge.
float slab(vec2 p, vec2 c, vec2 h) {
  return 1.0 - smoothstep(-0.004, 0.004, box(p - c, h));
}

float triangleMask(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 v0 = c - a, v1 = b - a, v2 = p - a;
  float d = v0.x * v1.y - v1.x * v0.y;
  float u = (v2.x * v1.y - v1.x * v2.y) / d;
  float v = (v0.x * v2.y - v2.x * v0.y) / d;
  return (u >= 0.0 && v >= 0.0 && u + v <= 1.0) ? 1.0 : 0.0;
}

/** The monument: stepped plinth, colonnade, pediment, vault wheel. */
float monument(vec2 p) {
  float m = 0.0;

  // Plinth — three receding steps.
  m = max(m, slab(p, vec2(0.0, -0.400), vec2(0.760, 0.026)));
  m = max(m, slab(p, vec2(0.0, -0.352), vec2(0.700, 0.024)));
  m = max(m, slab(p, vec2(0.0, -0.306), vec2(0.648, 0.024)));

  // Colonnade — seven bays on a fixed pitch, the middle three left open so the
  // vault door has a recess to sit in rather than fighting a column.
  for (int i = 0; i < 7; i++) {
    if (i > 1 && i < 5) continue;
    float x = (float(i) - 3.0) * 0.176;
    m = max(m, slab(p, vec2(x, 0.010), vec2(0.038, 0.276)));
    // Capital and base flare each column slightly.
    m = max(m, slab(p, vec2(x, 0.278), vec2(0.052, 0.014)));
    m = max(m, slab(p, vec2(x, -0.268), vec2(0.052, 0.014)));
  }

  // Architrave.
  m = max(m, slab(p, vec2(0.0, 0.318), vec2(0.680, 0.030)));

  // Pediment.
  m = max(m, triangleMask(p, vec2(-0.700, 0.348), vec2(0.700, 0.348), vec2(0.0, 0.560)));

  // Vault wheel set into the colonnade — the thing being guarded. Built as a
  // solid disc, then a ring of negative space with the spokes spared, so the
  // handle reads even at one dot per two pixels.
  vec2 wc = vec2(0.0, 0.010);
  float r = length(p - wc);
  m = max(m, 1.0 - smoothstep(0.222, 0.230, r));

  float inner = 1.0 - smoothstep(0.170, 0.178, r);
  float spokes = max(
    slab(p, wc, vec2(0.230, 0.024)),
    slab(p, wc, vec2(0.024, 0.230))
  );
  float hub = 1.0 - smoothstep(0.048, 0.056, r);
  m = min(m, 1.0 - inner * (1.0 - max(spokes, hub)));

  return m;
}

void main() {
  // Snap to the dot grid before doing anything else: every fragment inside a
  // cell must sample the same point or the dots shimmer.
  vec2 cellIndex = floor(gl_FragCoord.xy / uPixel);
  vec2 cellCentre = (cellIndex + 0.5) * uPixel;

  // Normalise against the SHORT edge so the monument keeps its margins in a
  // tall column and a wide banner alike.
  float unit = min(uRes.x, uRes.y);
  vec2 uv = (cellCentre - 0.5 * uRes) / unit;

  // Pointer blast: shove sample coordinates outward and burn brightness down,
  // hardest at the centre, gone past the radius.
  float radius = 0.30;
  vec2 mouseUv = (uMouse - 0.5 * uRes) / unit;
  vec2 delta = uv - mouseUv;
  float dist = length(delta);
  float wave = exp(-(dist * dist) / (radius * radius)) * uBlast;
  vec2 dir = dist > 0.0001 ? delta / dist : vec2(0.0);
  uv += dir * wave * 0.22;
  // Scatter, so the displaced dots break formation instead of sliding as a
  // rigid sheet.
  uv += (vec2(hash(cellIndex), hash(cellIndex + 7.3)) - 0.5) * wave * 0.09;

  // 2.0 leaves a margin on the short edge; the y shift centres the silhouette,
  // whose mass sits below the pediment.
  vec2 p = uv * 1.55 + vec2(0.0, 0.07);
  float m = monument(p);

  // Shading: light from the upper left, plus fbm grain, plus erosion that
  // eats the silhouette from the bottom up so the base dissolves into dots.
  float light = 0.42 + 0.46 * smoothstep(-0.5, 0.55, -p.x * 0.7 + p.y);
  float grain = fbm(p * 5.0 + uTime * 0.02);
  float erosion = smoothstep(-0.46, 0.06, p.y) * 0.55 + 0.45;
  float lum = m * light * erosion * (0.72 + 0.42 * grain);

  lum -= wave * 0.85;
  lum = clamp(lum, 0.0, 1.0);

  // Quantise against the Bayer threshold: this is the whole dither. The bias
  // matters — bayer8 returns exactly 0 for one cell in 64, and without it that
  // cell would light up across the empty background where lum is 0.
  float threshold = bayer8(gl_FragCoord.xy / uPixel);
  float on = step(threshold + 0.02, lum);

  // Round the lit cells into dots rather than filling the square.
  vec2 within = fract(gl_FragCoord.xy / uPixel) - 0.5;
  float dot_ = 1.0 - smoothstep(0.30, 0.42, length(within));

  float ink = on * dot_;
  vec3 colour = mix(uInk, uHot, clamp(wave * 2.2, 0.0, 1.0));
  gl_FragColor = vec4(mix(uPaper, colour, ink), ink);
}
`;

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // Surface the driver's own message; a silent black canvas is much harder
    // to diagnose than one broken build log.
    console.error("[DitherShader]", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface DitherShaderProps {
  className?: string;
  /** Dot pitch in CSS pixels. */
  pixel?: number;
  ink?: string;
  hot?: string;
  ariaLabel?: string;
}

export function DitherShader({
  className,
  pixel = 4,
  ink = "#e9e5dc",
  hot = "#d99a3a",
  ariaLabel = "Dithered vault monument",
}: DitherShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // `start` is filled in by the GL effect: reading the clock during render
  // would make the component's output depend on when React happened to call
  // it.
  const stateRef = useRef({
    blast: 0,
    targetBlast: 0,
    mx: -9999,
    my: -9999,
    start: 0,
  });
  const rafRef = useRef<number | null>(null);
  const renderRef = useRef<(() => void) | null>(null);

  const wake = useCallback(() => {
    if (rafRef.current !== null) return;
    const loop = () => {
      const s = stateRef.current;
      // Ease toward the target, then let it fall all the way to zero. The
      // resting state is the intact monument, so nothing has to restore it.
      s.blast += (s.targetBlast - s.blast) * 0.14;
      renderRef.current?.();
      if (s.blast > 0.002 || s.targetBlast > 0.002) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        s.blast = 0;
        renderRef.current?.();
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("[DitherShader]", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(program, "uRes"),
      mouse: gl.getUniformLocation(program, "uMouse"),
      blast: gl.getUniformLocation(program, "uBlast"),
      time: gl.getUniformLocation(program, "uTime"),
      pixel: gl.getUniformLocation(program, "uPixel"),
      ink: gl.getUniformLocation(program, "uInk"),
      hot: gl.getUniformLocation(program, "uHot"),
      paper: gl.getUniformLocation(program, "uPaper"),
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform3fv(u.ink, hexToRgb(ink));
    gl.uniform3fv(u.hot, hexToRgb(hot));
    gl.uniform3fv(u.paper, [0, 0, 0]);

    let dpr = 1;
    stateRef.current.start = performance.now();

    const render = () => {
      const s = stateRef.current;
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform2f(u.mouse, s.mx * dpr, canvas.height - s.my * dpr);
      gl.uniform1f(u.blast, s.blast);
      gl.uniform1f(u.time, (performance.now() - s.start) / 1000);
      gl.uniform1f(u.pixel, pixel * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    renderRef.current = render;

    const parent = canvas.parentElement;
    const resize = () => {
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w <= 0 || h <= 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      render();
    };
    resize();

    const ro = parent ? new ResizeObserver(resize) : null;
    if (parent) ro?.observe(parent);

    return () => {
      ro?.disconnect();
      renderRef.current = null;
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [pixel, ink, hot]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // The blast throws the whole monument apart; suppress it outright for
      // readers who have asked for less motion. The dithered scene still draws.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const s = stateRef.current;
      s.mx = e.clientX - rect.left;
      s.my = e.clientY - rect.top;
      s.targetBlast = 1;
      wake();
    },
    [wake]
  );

  const onPointerLeave = useCallback(() => {
    stateRef.current.targetBlast = 0;
    wake();
  }, [wake]);

  return (
    <canvas
      ref={canvasRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      className={className}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
