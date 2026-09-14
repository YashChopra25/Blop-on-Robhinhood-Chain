import type { PaintFn } from "./ascii";

/**
 * Source drawings for the dot and ASCII fields.
 *
 * Each paints a white-on-transparent silhouette into a box of arbitrary size;
 * the samplers turn brightness into dot opacity or ramp characters, so soft
 * gradients here become dither there. Everything is expressed as a fraction of
 * the box so a paint works at any resolution.
 */

function shade(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  from = 1,
  to = 0.42
) {
  const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
  g.addColorStop(0, `rgba(255,255,255,${from})`);
  g.addColorStop(1, `rgba(255,255,255,${to})`);
  return g;
}

/** The vault wheel: concentric rings, spokes, bolt heads. */
export const paintVaultWheel: PaintFn = (ctx, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.44;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = shade(ctx, w, h, 0.95, 0.4);
  ctx.strokeStyle = shade(ctx, w, h, 1, 0.5);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.14;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.05;
  ctx.stroke();

  // Spokes.
  ctx.lineWidth = r * 0.11;
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66);
    ctx.lineTo(cx - Math.cos(a) * r * 0.66, cy - Math.sin(a) * r * 0.66);
    ctx.stroke();
  }

  // Hub.
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Bolt heads around the rim.
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12 + Math.PI / 12;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 1.12, cy + Math.sin(a) * r * 1.12, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** A key, for the custodian and claim sections. */
export const paintKey: PaintFn = (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const s = Math.min(w, h);
  const cy = h / 2;
  const bowR = s * 0.2;
  const bowX = w * 0.22;

  ctx.strokeStyle = shade(ctx, w, h, 1, 0.45);
  ctx.fillStyle = shade(ctx, w, h, 1, 0.45);

  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.arc(bowX, cy, bowR, 0, Math.PI * 2);
  ctx.stroke();

  // Shaft.
  ctx.lineWidth = s * 0.11;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(bowX + bowR, cy);
  ctx.lineTo(w * 0.9, cy);
  ctx.stroke();

  // Wards.
  ctx.lineWidth = s * 0.09;
  const teeth = [0.7, 0.78, 0.86];
  for (const t of teeth) {
    ctx.beginPath();
    ctx.moveTo(w * t, cy);
    ctx.lineTo(w * t, cy + s * 0.26);
    ctx.stroke();
  }
};

/** Hourglass — the inactivity window. */
export const paintHourglass: PaintFn = (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const top = h * 0.1;
  const bottom = h * 0.9;
  const half = Math.min(w, h) * 0.3;
  const waist = half * 0.1;

  ctx.fillStyle = shade(ctx, w, h, 1, 0.38);
  ctx.beginPath();
  ctx.moveTo(cx - half, top);
  ctx.lineTo(cx + half, top);
  ctx.lineTo(cx + waist, h / 2);
  ctx.lineTo(cx + half, bottom);
  ctx.lineTo(cx - half, bottom);
  ctx.lineTo(cx - waist, h / 2);
  ctx.closePath();
  ctx.fill();

  // Caps read as solid bars against the tapering glass.
  ctx.fillRect(cx - half * 1.18, top - h * 0.05, half * 2.36, h * 0.06);
  ctx.fillRect(cx - half * 1.18, bottom - h * 0.01, half * 2.36, h * 0.06);
};

/** A quorum: several nodes, one ring, edges to the centre. */
export const paintQuorum: PaintFn = (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const unit = Math.min(w, h);
  const r = unit * 0.33;

  ctx.strokeStyle = shade(ctx, w, h, 0.85, 0.4);
  ctx.fillStyle = shade(ctx, w, h, 1, 0.5);

  ctx.lineWidth = unit * 0.035;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  const nodes = 5;
  ctx.lineWidth = unit * 0.028;
  for (let i = 0; i < nodes; i++) {
    const a = (i * Math.PI * 2) / nodes - Math.PI / 2;
    const nx = cx + Math.cos(a) * r;
    const ny = cy + Math.sin(a) * r;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(nx, ny, unit * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, unit * 0.11, 0, Math.PI * 2);
  ctx.fill();
};

/** Stacked sealed documents, for the files section. */
export const paintSealedDocs: PaintFn = (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const pw = w * 0.44;
  const ph = h * 0.58;
  // One grid cell is roughly 4.5% of the width at the sizes these are used
  // at, so a hairline stroke would average away to nothing.
  const stroke = Math.max(1, Math.min(w, h) * 0.05);

  // Outlined rather than solid: at ~30 characters wide a filled page reduces
  // to one flat block of ▓, which says nothing. Edges and rules survive the
  // downsample.
  for (let i = 2; i >= 0; i--) {
    const x = w * 0.2 + i * w * 0.08;
    const y = h * 0.32 - i * h * 0.1;
    const tone = 0.45 + (2 - i) * 0.27;

    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fillRect(x, y, pw, ph);

    ctx.strokeStyle = `rgba(255,255,255,${tone})`;
    ctx.lineWidth = stroke;
    ctx.strokeRect(x, y, pw, ph);

    ctx.fillStyle = `rgba(255,255,255,${tone})`;
    for (let line = 0; line < 3; line++) {
      ctx.fillRect(
        x + pw * 0.16,
        y + ph * (0.26 + line * 0.2),
        pw * (line === 2 ? 0.4 : 0.68),
        stroke
      );
    }
  }

  // Wax seal on the front page.
  ctx.beginPath();
  ctx.arc(w * 0.2 + pw, h * 0.32 + ph * 0.82, Math.min(w, h) * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
};

/* --- Literal marks ---------------------------------------------------------
   Small enough to draw by hand, and hand-drawing keeps the character choices
   deliberate where a sampler would only ever approximate them. */

export const MARK_VAULT: string[] = [
  "    .-=========-.    ",
  "  ,'  .-------.  `.  ",
  " /   /    |    \\   \\ ",
  "|   |  ---+---  |   |",
  "|   |     |     |   |",
  " \\   \\    |    /   / ",
  "  `.  `-------'  ,'  ",
  "    `-=========-'    ",
];

export const MARK_SIGNAL: string[] = [
  "  ___ ",
  " /   \\   . . .",
  "|  o  | ~ ~ ~ ~",
  " \\___/   ' ' '",
];

export const MARK_CHAIN: string[] = [
  " [=]---[=]---[=] ",
  "  |     |     |  ",
  " (o)   (o)   (o) ",
];
