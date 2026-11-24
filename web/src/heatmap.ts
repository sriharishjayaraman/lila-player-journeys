const GRID = 256;

// Density grid -> blurred, colour-mapped canvas the size of the map. Points are in 1024px map space.
export function renderHeatmap(points: Array<[number, number]>, mapPx: number, radius: number): HTMLCanvasElement | null {
  if (points.length === 0) return null;
  const grid = new Float32Array(GRID * GRID);
  const k = GRID / mapPx;
  for (const [x, y] of points) {
    const gx = Math.floor(x * k);
    const gy = Math.floor(y * k);
    if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID) grid[gy * GRID + gx] += 1;
  }
  const blurred = blur(grid, radius);

  // Scale to the 99th percentile of non-empty cells so one hotspot does not wash out the rest
  const nonZero = blurred.filter((v) => v > 1e-6).sort();
  const max = nonZero[Math.floor(nonZero.length * 0.99)] || 1;

  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(GRID, GRID);
  for (let i = 0; i < blurred.length; i++) {
    const v = Math.min(1, blurred[i] / max);
    if (v < 0.02) continue;
    const c = PALETTE[Math.round(v * 255)];
    img.data[i * 4] = c[0];
    img.data[i * 4 + 1] = c[1];
    img.data[i * 4 + 2] = c[2];
    img.data[i * 4 + 3] = Math.round(70 + 170 * Math.sqrt(v));
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Three box-blur passes in each direction approximate a gaussian
function blur(src: Float32Array, r: number): Float32Array {
  let a = src.slice();
  let b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, r, true);
    boxPass(b, a, r, false);
  }
  return a;
}

function boxPass(src: Float32Array, dst: Float32Array, r: number, horizontal: boolean) {
  const w = 2 * r + 1;
  for (let line = 0; line < GRID; line++) {
    let acc = 0;
    const at = (i: number) => (horizontal ? line * GRID + i : i * GRID + line);
    for (let i = -r; i <= r; i++) if (i >= 0 && i < GRID) acc += src[at(i)];
    for (let i = 0; i < GRID; i++) {
      dst[at(i)] = acc / w;
      const add = i + r + 1;
      const sub = i - r;
      if (add < GRID) acc += src[at(add)];
      if (sub >= 0) acc -= src[at(sub)];
    }
  }
}

const STOPS: Array<[number, [number, number, number]]> = [
  [0, [40, 20, 120]],
  [0.35, [190, 40, 140]],
  [0.65, [250, 120, 40]],
  [1, [255, 245, 160]],
];

function ramp(v: number): [number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    const [p0, c0] = STOPS[i - 1];
    if (v <= p1) {
      const f = (v - p0) / (p1 - p0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * f)) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

const PALETTE = Array.from({ length: 256 }, (_, i) => ramp(i / 255));

export const HEAT_GRADIENT = `linear-gradient(90deg, ${STOPS.map(([p, c]) => `rgb(${c.join(",")}) ${p * 100}%`).join(", ")})`;

// Flagged cells as crisp pixel squares, matching the blocky grid the stats use
export function renderCells(flags: Uint8Array, n: number, mapPx: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = mapPx;
  canvas.height = mapPx;
  const ctx = canvas.getContext("2d")!;
  const s = mapPx / n;
  ctx.fillStyle = color;
  flags.forEach((f, i) => f && ctx.fillRect((i % n) * s + 1, Math.floor(i / n) * s + 1, s - 2, s - 2));
  return canvas;
}
