/** Colour helpers and the shared palette for the procedural art. */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Positive amount lightens toward white, negative darkens toward black. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amount >= 0) return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  const k = 1 + amount;
  return rgbToHex(r * k, g * k, b * k);
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function desaturate(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  return rgbToHex(r + (l - r) * t, g + (l - g) * t, b + (l - b) * t);
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** 0..1 → green, yellow, red. Used by traffic/pollution/happiness overlays. */
export function heat(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.5) return mix("#3ddc84", "#ffd23f", x * 2);
  return mix("#ffd23f", "#ff4d4d", (x - 0.5) * 2);
}

export const PALETTE = {
  grass: ["#86b86b", "#7eb265", "#8bbd70", "#80b468"],
  grassDark: "#6a9c55",
  sand: "#e3d3a1",
  water: "#3d8fc9",
  waterDeep: "#2a6fa8",
  foam: "#bfe3f5",
  asphalt: "#555b68",
  asphaltDark: "#40454f",
  sidewalk: "#c3c6cc",
  marking: "#f3f0e6",
  highwayLine: "#f2c14e",
  zone: { 1: "#4fd18b", 2: "#4f9dff", 3: "#ffb23f" } as Record<number, string>,
  tree: ["#3f8f4a", "#4c9a45", "#357f45", "#5aa34b"],
  trunk: "#7a5236",
};
