/**
 * Shared plumbing for the ASCII renderers: density ramps, the glyph pool the
 * destruction effect draws from, and the offscreen sampler that turns a canvas
 * drawing into a character grid.
 */

export const RAMPS = {
  /** Classic luminance ramp — reads as a drawing. */
  ascii: " .:-=+*#%@",
  /** Quarter/half/full blocks — reads as a dithered photo. */
  blocks: " ░▒▓█",
  /** Sparse, for backgrounds and watermarks. */
  faint: "  .·:+",
} as const;

export type RampName = keyof typeof RAMPS;

/** What a character decays into while it is falling apart. */
export const NOISE = "!<>-_\\/[]{}=+*^?#%$&01";

export function noiseChar(): string {
  return NOISE[(Math.random() * NOISE.length) | 0];
}

export type PaintFn = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) => void;

/** Supersampling factor: paint big, average down, so the ramp gets real
 *  intermediate values instead of a hard stencil. */
const SS = 3;

/**
 * Rasterize `paint` and reduce it to one ramp character per cell.
 * Returns `rows` strings of length `cols`.
 */
export function sampleToAscii(
  paint: PaintFn,
  cols: number,
  rows: number,
  ramp: string,
  /** Cell aspect (charHeight / charWidth), so circles come out round. */
  cellAspect: number,
  /**
   * Multiplier on sampled luminance before it picks a ramp character.
   *
   * The paints are shaded for the dot fields, where brightness becomes dot
   * opacity. Averaged down to a couple of dozen characters those mid-greys all
   * land on `.` and `:` and the drawing dissolves into speckle. Gain pushes a
   * stroke up to `#`/`@` while leaving true background at zero, which is what
   * makes the art read as line work rather than noise.
   */
  gain = 1
): string[] {
  if (cols <= 0 || rows <= 0) return [];

  const w = cols * SS;
  // The paint callback works in square pixels; stretching the buffer by the
  // cell aspect is what keeps geometry undistorted once it lands on a grid of
  // tall, narrow character boxes.
  const h = Math.max(1, Math.round(rows * SS * cellAspect));

  const buf = document.createElement("canvas");
  buf.width = w;
  buf.height = h;
  const ctx = buf.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  paint(ctx, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const cellH = h / rows;
  const out: string[] = [];
  const last = ramp.length - 1;

  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor(r * cellH);
    const y1 = Math.max(y0 + 1, Math.floor((r + 1) * cellH));
    let line = "";
    for (let c = 0; c < cols; c++) {
      const x0 = c * SS;
      const x1 = x0 + SS;
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          const alpha = data[i + 3] / 255;
          const lum =
            (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
          sum += lum * alpha;
          n++;
        }
      }
      const v = n > 0 ? Math.min(1, (sum / n) * gain) : 0;
      line += ramp[Math.min(last, Math.round(v * last))];
    }
    out.push(line);
  }
  return out;
}

/** Advance of one character in the given CSS font, in pixels. */
export function measureCharWidth(font: string): number {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return 8;
  ctx.font = font;
  // 'M' is the widest glyph in most faces, but in a monospace every advance is
  // identical, so any character measures the cell.
  return ctx.measureText("M").width || 8;
}
