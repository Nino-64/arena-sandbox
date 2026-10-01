/** Isometric tile footprint in world pixels (2:1 diamond). */
export const TW = 64;
export const TH = 32;

/** Screen-space (world px) position of a tile's top vertex. */
export function tileTop(x: number, y: number): { sx: number; sy: number } {
  return { sx: ((x - y) * TW) / 2, sy: ((x + y) * TH) / 2 };
}

/** World px of a fractional tile coordinate (u, v); (x+0.5, y+0.5) is a tile centre. */
export function project(u: number, v: number): { sx: number; sy: number } {
  return { sx: ((u - v) * TW) / 2, sy: ((u + v) * TH) / 2 };
}

/**
 * Pan/zoom camera. `x, y` is the world-pixel point at the screen centre.
 * Zoom eases toward its target so wheel zooming feels smooth.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  targetZoom = 1;
  /** Zoom anchor in screen px while easing, so the point under the cursor stays put. */
  private anchor: { px: number; py: number } | null = null;
  width = 1;
  height = 1;
  readonly minZoom = 0.35;
  readonly maxZoom = 2.6;

  constructor(private readonly mapSize: number) {
    const c = project(mapSize / 2, mapSize / 2);
    this.x = c.sx;
    this.y = c.sy;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  screenToWorld(px: number, py: number): { wx: number; wy: number } {
    return { wx: (px - this.width / 2) / this.zoom + this.x, wy: (py - this.height / 2) / this.zoom + this.y };
  }

  worldToScreen(wx: number, wy: number): { px: number; py: number } {
    return { px: (wx - this.x) * this.zoom + this.width / 2, py: (wy - this.y) * this.zoom + this.height / 2 };
  }

  /** Fractional tile coordinates under a screen point. */
  screenToTileF(px: number, py: number): { u: number; v: number } {
    const { wx, wy } = this.screenToWorld(px, py);
    const a = wx / (TW / 2);
    const b = wy / (TH / 2);
    return { u: (a + b) / 2, v: (b - a) / 2 };
  }

  screenToTile(px: number, py: number): { x: number; y: number } {
    const { u, v } = this.screenToTileF(px, py);
    return { x: Math.floor(u), y: Math.floor(v) };
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clamp();
  }

  zoomAt(factor: number, px: number, py: number): void {
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * factor));
    this.anchor = { px, py };
  }

  centerOn(u: number, v: number): void {
    const p = project(u, v);
    this.x = p.sx;
    this.y = p.sy;
    this.clamp();
  }

  update(dtSec: number): void {
    if (Math.abs(this.targetZoom - this.zoom) < 0.0005) {
      this.zoom = this.targetZoom;
      this.anchor = null;
      return;
    }
    const a = this.anchor ?? { px: this.width / 2, py: this.height / 2 };
    const before = this.screenToWorld(a.px, a.py);
    const k = 1 - Math.exp(-dtSec * 14);
    this.zoom += (this.targetZoom - this.zoom) * k;
    const after = this.screenToWorld(a.px, a.py);
    this.x += before.wx - after.wx;
    this.y += before.wy - after.wy;
    this.clamp();
  }

  private clamp(): void {
    const n = this.mapSize;
    const minX = project(0, n).sx;
    const maxX = project(n, 0).sx;
    this.x = Math.max(minX, Math.min(maxX, this.x));
    this.y = Math.max(0, Math.min(project(n, n).sy, this.y));
  }

  /** Visible world-pixel rectangle, padded for tall buildings. */
  viewRect(pad = 140): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.screenToWorld(0, 0);
    const b = this.screenToWorld(this.width, this.height);
    return { x0: a.wx - pad, y0: a.wy - pad, x1: b.wx + pad, y1: b.wy + pad * 1.6 };
  }
}
