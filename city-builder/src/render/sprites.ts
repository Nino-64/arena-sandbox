import { Level, ZoneType, Zone } from "../core/types";
import { TH, TW } from "./camera";
import { desaturate, PALETTE, rgba, shade } from "./colors";

/** Sprites are rasterised at this multiple of world pixels, so they stay sharp when zoomed in. */
const SCALE = 2;

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Offset of the tile's top vertex inside the sprite, in world px. */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

type Ctx = CanvasRenderingContext2D;

interface Pt {
  x: number;
  y: number;
}

/** Tile-local (u, v, height) to sprite-local world px, relative to the tile top vertex. */
const P = (u: number, v: number, z = 0): Pt => ({ x: ((u - v) * TW) / 2, y: ((u + v) * TH) / 2 - z });

function poly(ctx: Ctx, pts: Pt[], fill: string | CanvasGradient | null, stroke?: string, lw = 0.6): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k]!.x, pts[k]!.y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Deterministic hash for per-sprite details. */
function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h ^= v | 0;
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

interface BoxColors {
  top: string;
  left: string;
  right: string;
}

function boxColors(base: string): BoxColors {
  return { top: shade(base, 0.18), right: base, left: shade(base, -0.22) };
}

/** Extruded box on the tile, from (u0,v0) to (u1,v1), from height z0 up by h. */
function box(ctx: Ctx, u0: number, v0: number, u1: number, v1: number, z0: number, h: number, c: BoxColors): void {
  const z1 = z0 + h;
  poly(ctx, [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], c.left);
  poly(ctx, [P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, z1), P(u1, v1, z1)], c.right);
  poly(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], c.top);
  // Crisp vertical edge where the two lit faces meet.
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  const a = P(u1, v1, z0);
  const b = P(u1, v1, z1);
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** Grid of windows on the left (v = v1) or right (u = u1) face of a box. */
function windows(
  ctx: Ctx,
  face: "left" | "right",
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  z0: number,
  h: number,
  rows: number,
  cols: number,
  color: string,
  lit: string,
  seed: number,
  litChance = 0.25,
): void {
  const pad = 0.16;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s0 = (c + pad) / cols;
      const s1 = (c + 1 - pad) / cols;
      const t0 = (r + 0.22) / rows;
      const t1 = (r + 0.78) / rows;
      const pt = (s: number, t: number) =>
        face === "left" ? P(u0 + (u1 - u0) * s, v1, z0 + h * t) : P(u1, v1 + (v0 - v1) * s, z0 + h * t);
      const isLit = hash(seed, r, c) < litChance;
      poly(ctx, [pt(s0, t0), pt(s1, t0), pt(s1, t1), pt(s0, t1)], isLit ? lit : color);
    }
  }
}

function groundShadow(ctx: Ctx, u0: number, v0: number, u1: number, v1: number, spread: number): void {
  poly(
    ctx,
    [P(u0 - 0.04, v0 + 0.02), P(u1 + spread, v0 + 0.02), P(u1 + spread, v1 + spread), P(u0 - 0.04, v1 + spread)],
    "rgba(20,30,20,0.28)",
  );
}

function tree(ctx: Ctx, u: number, v: number, size: number, variant: number): void {
  const base = P(u, v);
  const green = PALETTE.tree[variant % PALETTE.tree.length]!;
  ctx.fillStyle = "rgba(20,40,20,0.25)";
  ctx.beginPath();
  ctx.ellipse(base.x + 2 * size, base.y + 0.5, 6 * size, 3 * size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.trunk;
  ctx.fillRect(base.x - 0.9 * size, base.y - 6 * size, 1.8 * size, 6 * size);
  if (variant % 3 === 0) {
    // Conifer.
    poly(ctx, [{ x: base.x, y: base.y - 22 * size }, { x: base.x + 6.5 * size, y: base.y - 4 * size }, { x: base.x - 6.5 * size, y: base.y - 4 * size }], shade(green, -0.15));
    poly(ctx, [{ x: base.x, y: base.y - 22 * size }, { x: base.x + 6.5 * size, y: base.y - 4 * size }, { x: base.x, y: base.y - 6 * size }], shade(green, 0.05));
  } else {
    ctx.fillStyle = shade(green, -0.12);
    ctx.beginPath();
    ctx.arc(base.x, base.y - 11 * size, 7 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(green, 0.12);
    ctx.beginPath();
    ctx.arc(base.x + 2 * size, base.y - 13 * size, 4.2 * size, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Procedural sprite factory with a cache. Every sprite is drawn once with
 * canvas paths, then blitted with drawImage each frame.
 */
export class SpriteBank {
  private cache = new Map<string, Sprite>();

  private make(key: string, w: number, h: number, ox: number, oy: number, draw: (ctx: Ctx) => void): Sprite {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * SCALE);
    canvas.height = Math.ceil(h * SCALE);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.translate(ox, oy);
    ctx.lineJoin = "round";
    draw(ctx);
    const sprite = { canvas, ox, oy, w, h };
    this.cache.set(key, sprite);
    return sprite;
  }

  private flat(key: string, draw: (ctx: Ctx) => void): Sprite {
    return this.make(key, TW, TH + 1, TW / 2, 0, draw);
  }

  // ------------------------------------------------------------- ground

  grass(variant: number, shoreMask: number): Sprite {
    return this.flat(`grass-${variant}-${shoreMask}`, (ctx) => {
      const base = PALETTE.grass[variant % PALETTE.grass.length]!;
      poly(ctx, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], base);
      for (let k = 0; k < 9; k++) {
        const u = 0.1 + hash(variant, k, 1) * 0.8;
        const v = 0.1 + hash(variant, k, 2) * 0.8;
        const p = P(u, v);
        ctx.fillStyle = hash(variant, k, 3) > 0.5 ? shade(base, 0.12) : shade(base, -0.1);
        ctx.fillRect(p.x, p.y, 1.6, 1);
      }
      this.shore(ctx, shoreMask);
      poly(ctx, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], null, "rgba(0,0,0,0.05)", 0.5);
    });
  }

  /** Sand bands on the edges facing water. Bits: 1 north, 2 east, 4 south, 8 west. */
  private shore(ctx: Ctx, mask: number): void {
    const w = 0.16;
    if (mask & 1) poly(ctx, [P(0, 0), P(1, 0), P(1, w), P(0, w)], PALETTE.sand);
    if (mask & 2) poly(ctx, [P(1, 0), P(1, 1), P(1 - w, 1), P(1 - w, 0)], PALETTE.sand);
    if (mask & 4) poly(ctx, [P(0, 1), P(1, 1), P(1, 1 - w), P(0, 1 - w)], PALETTE.sand);
    if (mask & 8) poly(ctx, [P(0, 0), P(0, 1), P(w, 1), P(w, 0)], PALETTE.sand);
  }

  water(landMask: number, variant: number): Sprite {
    return this.flat(`water-${landMask}-${variant}`, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, TH);
      g.addColorStop(0, shade(PALETTE.water, 0.05));
      g.addColorStop(1, PALETTE.waterDeep);
      poly(ctx, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], g);
      ctx.strokeStyle = rgba(PALETTE.foam, 0.8);
      ctx.lineWidth = 1.2;
      const edge = (a: Pt, b: Pt) => {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      };
      const f = 0.07;
      if (landMask & 1) edge(P(0, f), P(1, f));
      if (landMask & 2) edge(P(1 - f, 0), P(1 - f, 1));
      if (landMask & 4) edge(P(0, 1 - f), P(1, 1 - f));
      if (landMask & 8) edge(P(f, 0), P(f, 1));
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 0.8;
      for (let k = 0; k < 2; k++) {
        const u = 0.25 + hash(variant, k) * 0.5;
        const v = 0.25 + hash(variant, k, 9) * 0.5;
        const p = P(u, v);
        edge({ x: p.x - 4, y: p.y }, { x: p.x + 4, y: p.y });
      }
    });
  }

  zoneLot(zone: number, variant: number): Sprite {
    return this.flat(`lot-${zone}-${variant}`, (ctx) => {
      const base = PALETTE.grass[variant % PALETTE.grass.length]!;
      const c = PALETTE.zone[zone]!;
      poly(ctx, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], base);
      poly(ctx, [P(0.08, 0.08), P(0.92, 0.08), P(0.92, 0.92), P(0.08, 0.92)], rgba(c, 0.28));
      ctx.setLineDash([3, 2.5]);
      poly(ctx, [P(0.08, 0.08), P(0.92, 0.08), P(0.92, 0.92), P(0.08, 0.92)], null, rgba(c, 0.95), 0.9);
      ctx.setLineDash([]);
    });
  }

  /** Paved or planted base under a building. */
  lotBase(zone: ZoneType, variant: number): Sprite {
    return this.flat(`base-${zone}-${variant}`, (ctx) => {
      const grass = PALETTE.grass[variant % PALETTE.grass.length]!;
      poly(ctx, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], grass);
      const pave = zone === Zone.Residential ? shade(grass, 0.08) : zone === Zone.Commercial ? "#c9ccd2" : "#a3a29b";
      poly(ctx, [P(0.05, 0.05), P(0.95, 0.05), P(0.95, 0.95), P(0.05, 0.95)], pave);
      poly(ctx, [P(0.05, 0.05), P(0.95, 0.05), P(0.95, 0.95), P(0.05, 0.95)], null, rgba(PALETTE.zone[zone]!, 0.55), 0.8);
    });
  }

  road(mask: number, highway: boolean, busStop: boolean): Sprite {
    return this.flat(`road-${mask}-${highway ? 1 : 0}-${busStop ? 1 : 0}`, (ctx) => {
      poly(ctx, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], highway ? "#8e9198" : PALETTE.sidewalk);
      const hw = highway ? 0.44 : 0.33;
      const a0 = 0.5 - hw;
      const a1 = 0.5 + hw;
      const asphalt = highway ? "#474c57" : PALETTE.asphalt;
      // Centre square plus one arm per connected side.
      poly(ctx, [P(a0, a0), P(a1, a0), P(a1, a1), P(a0, a1)], asphalt);
      if (mask & 1) poly(ctx, [P(a0, 0), P(a1, 0), P(a1, 0.5), P(a0, 0.5)], asphalt);
      if (mask & 2) poly(ctx, [P(0.5, a0), P(1, a0), P(1, a1), P(0.5, a1)], asphalt);
      if (mask & 4) poly(ctx, [P(a0, 0.5), P(a1, 0.5), P(a1, 1), P(a0, 1)], asphalt);
      if (mask & 8) poly(ctx, [P(0, a0), P(0.5, a0), P(0.5, a1), P(0, a1)], asphalt);

      const arms = [1, 2, 4, 8].filter((b) => mask & b).length;
      const line = (from: Pt, to: Pt, color: string, width: number, dash: number[]) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      const straightNS = (mask & 5) === 5 && !(mask & 10);
      const straightEW = (mask & 10) === 10 && !(mask & 5);
      if (highway) {
        const y = PALETTE.highwayLine;
        if (mask & 10 || mask === 0) {
          line(P(0, 0.48), P(1, 0.48), y, 0.7, []);
          line(P(0, 0.52), P(1, 0.52), y, 0.7, []);
          line(P(0, a0 + 0.06), P(1, a0 + 0.06), "rgba(255,255,255,0.7)", 0.6, [4, 3]);
          line(P(0, a1 - 0.06), P(1, a1 - 0.06), "rgba(255,255,255,0.7)", 0.6, [4, 3]);
        }
        if (mask & 5 && !(mask & 10)) {
          line(P(0.48, 0), P(0.48, 1), y, 0.7, []);
          line(P(0.52, 0), P(0.52, 1), y, 0.7, []);
        }
      } else if (straightNS) {
        line(P(0.5, 0), P(0.5, 1), PALETTE.marking, 0.8, [3.5, 3]);
      } else if (straightEW) {
        line(P(0, 0.5), P(1, 0.5), PALETTE.marking, 0.8, [3.5, 3]);
      } else if (arms >= 3) {
        // Zebra crossings at each arm of an intersection.
        const zebra = (side: number) => {
          for (let k = 0; k < 5; k++) {
            const t = a0 + 0.04 + ((a1 - a0 - 0.08) * (k + 0.5)) / 5;
            const d = 0.035;
            if (side === 1) poly(ctx, [P(t - d, 0.04), P(t + d, 0.04), P(t + d, 0.14), P(t - d, 0.14)], "rgba(255,255,255,0.75)");
            if (side === 2) poly(ctx, [P(0.86, t - d), P(0.96, t - d), P(0.96, t + d), P(0.86, t + d)], "rgba(255,255,255,0.75)");
            if (side === 4) poly(ctx, [P(t - d, 0.86), P(t + d, 0.86), P(t + d, 0.96), P(t - d, 0.96)], "rgba(255,255,255,0.75)");
            if (side === 8) poly(ctx, [P(0.04, t - d), P(0.14, t - d), P(0.14, t + d), P(0.04, t + d)], "rgba(255,255,255,0.75)");
          }
        };
        for (const b of [1, 2, 4, 8]) if (mask & b) zebra(b);
      }
      if (busStop) {
        poly(ctx, [P(0.36, 0.36), P(0.64, 0.36), P(0.64, 0.64), P(0.36, 0.64)], "rgba(255,210,63,0.85)");
        ctx.fillStyle = "#1d2433";
        ctx.font = "bold 6px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const c = P(0.5, 0.5);
        ctx.fillText("BUS", c.x, c.y + 0.3);
      }
    });
  }

  // ------------------------------------------------------------ objects

  private object(key: string, height: number, draw: (ctx: Ctx) => void): Sprite {
    return this.make(key, TW + 8, height + TH, TW / 2 + 4, height, draw);
  }

  forest(variant: number): Sprite {
    return this.object(`forest-${variant}`, 34, (ctx) => {
      const spots: Array<[number, number, number]> = [];
      const n = 2 + Math.floor(hash(variant, 7) * 3);
      for (let k = 0; k < n; k++) spots.push([0.22 + hash(variant, k, 1) * 0.56, 0.22 + hash(variant, k, 2) * 0.56, 0.75 + hash(variant, k, 3) * 0.45]);
      spots.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
      for (const [u, v, s] of spots) tree(ctx, u, v, s, Math.floor(hash(variant, u * 100) * 10));
    });
  }

  park(variant: number): Sprite {
    return this.object(`park-${variant}`, 34, (ctx) => {
      poly(ctx, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], "#79c26a");
      poly(ctx, [P(0.42, 0), P(0.58, 0), P(0.58, 1), P(0.42, 1)], "#e8dcb9");
      poly(ctx, [P(0, 0.42), P(1, 0.42), P(1, 0.58), P(0, 0.58)], "#e8dcb9");
      // Fountain.
      const c = P(0.5, 0.5);
      ctx.fillStyle = "#d9d4c7";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 7, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6cc3ec";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 5.2, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(c.x - 0.6, c.y - 6, 1.2, 6);
      // Flower beds and trees.
      for (const [u, v] of [[0.2, 0.75], [0.78, 0.22]] as const) {
        const p = P(u, v);
        ctx.fillStyle = variant % 2 ? "#f28fb1" : "#ffd166";
        for (let k = 0; k < 6; k++) ctx.fillRect(p.x - 4 + hash(variant, k) * 8, p.y - 1.5 + hash(k, variant) * 3, 1.4, 1.4);
      }
      tree(ctx, 0.2, 0.2, 0.9, variant + 1);
      tree(ctx, 0.8, 0.8, 1, variant + 2);
      tree(ctx, 0.78, 0.2, 0.8, variant + 4);
    });
  }

  busShelter(): Sprite {
    return this.object("shelter", 22, (ctx) => {
      box(ctx, 0.08, 0.7, 0.3, 0.92, 0, 9, boxColors("#3a6ea5"));
      box(ctx, 0.05, 0.67, 0.33, 0.95, 9, 1.2, boxColors("#e9eef5"));
      const pole = P(0.1, 0.62);
      ctx.fillStyle = "#e9eef5";
      ctx.fillRect(pole.x - 0.5, pole.y - 16, 1, 16);
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.arc(pole.x, pole.y - 16, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  building(zone: ZoneType, level: Level, variant: number, abandoned: boolean): Sprite {
    const key = `b-${zone}-${level}-${variant}-${abandoned ? 1 : 0}`;
    const height = 150;
    return this.object(key, height, (ctx) => {
      const tint = (c: string) => (abandoned ? shade(desaturate(c, 0.85), -0.25) : c);
      if (zone === Zone.Residential) this.residential(ctx, level, variant, tint, abandoned);
      else if (zone === Zone.Commercial) this.commercial(ctx, level, variant, tint, abandoned);
      else this.industrial(ctx, level, variant, tint, abandoned);
      if (abandoned) {
        ctx.strokeStyle = "rgba(60,40,30,0.85)";
        ctx.lineWidth = 1.2;
        const a = P(0.3, 0.95, 4);
        const b = P(0.7, 0.95, 10);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.moveTo(a.x, b.y);
        ctx.lineTo(b.x, a.y);
        ctx.stroke();
      }
    });
  }

  private residential(ctx: Ctx, level: Level, variant: number, tint: (c: string) => string, dark: boolean): void {
    const walls = ["#f3e3c3", "#e6d3c3", "#dce6ee", "#f0d6a6"];
    const roofs = ["#c8553d", "#8f5b3e", "#56697d", "#b0463a"];
    const wall = tint(walls[variant % 4]!);
    const glass = dark ? "#3c3f45" : "#5a7ea6";
    const lit = dark ? "#3c3f45" : "#ffe59a";
    if (level === 1) {
      groundShadow(ctx, 0.2, 0.25, 0.8, 0.8, 0.12);
      tree(ctx, 0.85, 0.22, 0.7, variant + 3);
      box(ctx, 0.22, 0.28, 0.78, 0.8, 0, 13, boxColors(wall));
      // Gabled roof along u.
      const roof = tint(roofs[variant % 4]!);
      const rh = 9;
      poly(ctx, [P(0.2, 0.82, 13), P(0.8, 0.82, 13), P(0.8, 0.54, 13 + rh), P(0.2, 0.54, 13 + rh)], shade(roof, -0.15));
      poly(ctx, [P(0.2, 0.26, 13), P(0.8, 0.26, 13), P(0.8, 0.54, 13 + rh), P(0.2, 0.54, 13 + rh)], shade(roof, 0.1));
      poly(ctx, [P(0.8, 0.82, 13), P(0.8, 0.26, 13), P(0.8, 0.54, 13 + rh)], tint(shade(walls[variant % 4]!, -0.05)));
      windows(ctx, "left", 0.22, 0.28, 0.78, 0.8, 2, 9, 1, 3, glass, lit, variant, 0.3);
      windows(ctx, "right", 0.22, 0.28, 0.78, 0.8, 2, 9, 1, 2, glass, lit, variant + 5, 0.3);
      const door = P(0.5, 0.8, 0);
      ctx.fillStyle = tint("#6b4a32");
      ctx.fillRect(door.x - 1.8, door.y - 6.5, 3.2, 6);
    } else if (level === 2) {
      groundShadow(ctx, 0.12, 0.15, 0.88, 0.88, 0.3);
      const h = 34;
      box(ctx, 0.14, 0.16, 0.86, 0.86, 0, h, boxColors(wall));
      windows(ctx, "left", 0.14, 0.16, 0.86, 0.86, 2, h - 4, 4, 4, glass, lit, variant, 0.28);
      windows(ctx, "right", 0.14, 0.16, 0.86, 0.86, 2, h - 4, 4, 4, glass, lit, variant + 9, 0.28);
      box(ctx, 0.12, 0.14, 0.88, 0.88, h, 2, boxColors(tint(shade(wall, -0.2))));
      box(ctx, 0.5, 0.25, 0.7, 0.45, h + 2, 5, boxColors(tint("#9aa4ae")));
      if (variant % 2 === 0) {
        // Balconies.
        for (let r = 1; r < 4; r++) box(ctx, 0.3, 0.86, 0.7, 0.92, (h * r) / 4, 1.2, boxColors(tint("#e9ecef")));
      }
    } else {
      groundShadow(ctx, 0.18, 0.18, 0.82, 0.82, 0.55);
      const h = 82;
      const wall3 = tint(["#d4dbe3", "#e3d4c4", "#c9d6cf", "#d8cbe0"][variant % 4]!);
      box(ctx, 0.12, 0.12, 0.88, 0.88, 0, 8, boxColors(tint("#b7bcc4")));
      box(ctx, 0.2, 0.2, 0.8, 0.8, 8, h, boxColors(wall3));
      windows(ctx, "left", 0.2, 0.2, 0.8, 0.8, 10, h - 4, 10, 4, glass, lit, variant, 0.32);
      windows(ctx, "right", 0.2, 0.2, 0.8, 0.8, 10, h - 4, 10, 4, glass, lit, variant + 3, 0.32);
      box(ctx, 0.18, 0.18, 0.82, 0.82, 8 + h, 2.5, boxColors(tint(shade(wall3, -0.25))));
      box(ctx, 0.38, 0.38, 0.62, 0.62, 10.5 + h, 7, boxColors(tint("#8d96a3")));
      if (!dark) {
        const top = P(0.5, 0.5, 17.5 + h);
        ctx.fillStyle = "#ff5d5d";
        ctx.beginPath();
        ctx.arc(top.x, top.y - 1, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private commercial(ctx: Ctx, level: Level, variant: number, tint: (c: string) => string, dark: boolean): void {
    const awnings = ["#e4572e", "#2e86ab", "#f6ae2d", "#9b5de5"];
    const glassC = dark ? "#3c3f45" : "#7cc6e8";
    if (level === 1) {
      groundShadow(ctx, 0.1, 0.15, 0.9, 0.9, 0.15);
      const wall = tint(["#f5efe6", "#efe7dc", "#e8edf2", "#f3e9e1"][variant % 4]!);
      box(ctx, 0.12, 0.18, 0.88, 0.88, 0, 15, boxColors(wall));
      windows(ctx, "left", 0.12, 0.18, 0.88, 0.88, 1, 9, 1, 3, glassC, glassC, variant, 0);
      windows(ctx, "right", 0.12, 0.18, 0.88, 0.88, 1, 9, 1, 3, glassC, glassC, variant, 0);
      const aw = tint(awnings[variant % 4]!);
      // Striped awning on both visible faces.
      for (let k = 0; k < 6; k++) {
        const s0 = 0.12 + (0.76 * k) / 6;
        const s1 = 0.12 + (0.76 * (k + 1)) / 6;
        const col = k % 2 ? "#ffffff" : aw;
        poly(ctx, [P(s0, 0.88, 11), P(s1, 0.88, 11), P(s1, 0.96, 8), P(s0, 0.96, 8)], tint(col));
        const t0 = 0.88 - (0.7 * k) / 6;
        const t1 = 0.88 - (0.7 * (k + 1)) / 6;
        poly(ctx, [P(0.88, t0, 11), P(0.88, t1, 11), P(0.96, t1, 8), P(0.96, t0, 8)], tint(shade(col, -0.08)));
      }
      box(ctx, 0.3, 0.86, 0.7, 0.9, 15, 5, boxColors(aw));
    } else if (level === 2) {
      groundShadow(ctx, 0.12, 0.12, 0.88, 0.88, 0.35);
      const h = 46;
      const wall = tint(["#9fb3c8", "#b9b0a5", "#a7b8b0", "#b4a9c4"][variant % 4]!);
      box(ctx, 0.14, 0.14, 0.86, 0.86, 0, h, boxColors(wall));
      // Horizontal glass bands.
      for (let r = 0; r < 5; r++) {
        const z = 4 + r * 8.5;
        poly(ctx, [P(0.14, 0.86, z), P(0.86, 0.86, z), P(0.86, 0.86, z + 5), P(0.14, 0.86, z + 5)], dark ? "#3c3f45" : shade(glassC, -0.25));
        poly(ctx, [P(0.86, 0.86, z), P(0.86, 0.14, z), P(0.86, 0.14, z + 5), P(0.86, 0.86, z + 5)], dark ? "#45484e" : glassC);
      }
      box(ctx, 0.3, 0.3, 0.55, 0.55, h, 4, boxColors(tint("#8c96a1")));
      box(ctx, 0.12, 0.12, 0.88, 0.88, h, 1.5, boxColors(tint(shade(wall, -0.25))));
    } else {
      groundShadow(ctx, 0.15, 0.15, 0.85, 0.85, 0.65);
      const h = 108;
      const glass = tint(["#4aa3c7", "#5c7fd6", "#3cb3a6", "#7a8fb0"][variant % 4]!);
      box(ctx, 0.1, 0.1, 0.9, 0.9, 0, 10, boxColors(tint("#c6cbd3")));
      const c = boxColors(glass);
      const z0 = 10;
      const left = [P(0.18, 0.82, z0), P(0.82, 0.82, z0), P(0.82, 0.82, z0 + h), P(0.18, 0.82, z0 + h)];
      const right = [P(0.82, 0.82, z0), P(0.82, 0.18, z0), P(0.82, 0.18, z0 + h), P(0.82, 0.82, z0 + h)];
      const gl = ctx.createLinearGradient(0, -h, 0, 0);
      gl.addColorStop(0, shade(c.left, 0.25));
      gl.addColorStop(1, c.left);
      poly(ctx, left, gl);
      const gr = ctx.createLinearGradient(0, -h, 0, 0);
      gr.addColorStop(0, shade(c.right, 0.35));
      gr.addColorStop(1, c.right);
      poly(ctx, right, gr);
      poly(ctx, [P(0.18, 0.18, z0 + h), P(0.82, 0.18, z0 + h), P(0.82, 0.82, z0 + h), P(0.18, 0.82, z0 + h)], c.top);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 0.6;
      for (let k = 1; k < 5; k++) {
        const s = 0.18 + (0.64 * k) / 5;
        const a = P(s, 0.82, z0);
        const b = P(s, 0.82, z0 + h);
        const d = P(0.82, s, z0);
        const e = P(0.82, s, z0 + h);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
      }
      for (let r = 1; r < 14; r++) {
        const z = z0 + (h * r) / 14;
        const a = P(0.18, 0.82, z);
        const b = P(0.82, 0.82, z);
        const d = P(0.82, 0.18, z);
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
      }
      box(ctx, 0.32, 0.32, 0.68, 0.68, z0 + h, 6, boxColors(tint("#aeb6c1")));
      const top = P(0.5, 0.5, z0 + h + 6);
      ctx.strokeStyle = tint("#d9dde3");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(top.x, top.y - 16);
      ctx.stroke();
      if (!dark) {
        ctx.fillStyle = "#ff5d5d";
        ctx.beginPath();
        ctx.arc(top.x, top.y - 16, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private industrial(ctx: Ctx, level: Level, variant: number, tint: (c: string) => string, dark: boolean): void {
    const walls = ["#b9a99a", "#a9adb1", "#c2b08f", "#9eaab3"];
    const wall = tint(walls[variant % 4]!);
    const stripe = (u: number, v: number, z: number, h: number) => {
      // Red-and-white chimney.
      const c = boxColors(tint("#d9d9d9"));
      box(ctx, u, v, u + 0.12, v + 0.12, z, h, c);
      box(ctx, u, v, u + 0.12, v + 0.12, z + h * 0.7, h * 0.12, boxColors(tint("#d64545")));
      box(ctx, u, v, u + 0.12, v + 0.12, z + h * 0.9, h * 0.1, boxColors(tint("#d64545")));
    };
    if (level === 1) {
      groundShadow(ctx, 0.12, 0.15, 0.88, 0.88, 0.2);
      box(ctx, 0.14, 0.2, 0.86, 0.86, 0, 14, boxColors(wall));
      // Sawtooth roof.
      for (let k = 0; k < 3; k++) {
        const u0 = 0.14 + (0.72 * k) / 3;
        const u1 = 0.14 + (0.72 * (k + 1)) / 3;
        poly(ctx, [P(u0, 0.86, 14), P(u0, 0.2, 14), P(u1, 0.2, 21), P(u1, 0.86, 21)], tint(shade("#6b7078", 0.1)));
        poly(ctx, [P(u1, 0.86, 14), P(u1, 0.2, 14), P(u1, 0.2, 21), P(u1, 0.86, 21)], dark ? "#3c3f45" : "#8fc2de");
      }
      box(ctx, 0.4, 0.86, 0.62, 0.87, 0, 9, boxColors(tint("#6f7680")));
      stripe(0.2, 0.25, 14, 16);
    } else if (level === 2) {
      groundShadow(ctx, 0.08, 0.1, 0.92, 0.92, 0.3);
      box(ctx, 0.08, 0.12, 0.92, 0.9, 0, 22, boxColors(wall));
      // Corrugated cladding.
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 0.5;
      for (let k = 1; k < 14; k++) {
        const s = 0.08 + (0.84 * k) / 14;
        const a = P(s, 0.9, 0);
        const b = P(s, 0.9, 22);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      box(ctx, 0.2, 0.89, 0.42, 0.91, 0, 12, boxColors(tint("#5d646d")));
      box(ctx, 0.55, 0.89, 0.77, 0.91, 0, 12, boxColors(tint("#5d646d")));
      box(ctx, 0.06, 0.1, 0.94, 0.92, 22, 2, boxColors(tint("#7d838b")));
      stripe(0.7, 0.18, 24, 26);
      box(ctx, 0.22, 0.22, 0.4, 0.4, 24, 6, boxColors(tint("#9aa1a9")));
    } else {
      groundShadow(ctx, 0.05, 0.05, 0.95, 0.95, 0.45);
      box(ctx, 0.06, 0.4, 0.66, 0.94, 0, 30, boxColors(wall));
      windows(ctx, "left", 0.06, 0.4, 0.66, 0.94, 4, 22, 2, 5, dark ? "#3c3f45" : "#8fc2de", "#ffe59a", variant, 0.2);
      box(ctx, 0.04, 0.38, 0.68, 0.96, 30, 2, boxColors(tint("#6f757d")));
      // Silos.
      for (const [u, v] of [[0.72, 0.62], [0.72, 0.84]] as const) {
        const base = P(u + 0.1, v, 0);
        const r = 6.5;
        const h = 34;
        const col = tint("#e6e2d8");
        const g = ctx.createLinearGradient(base.x - r, 0, base.x + r, 0);
        g.addColorStop(0, shade(col, -0.25));
        g.addColorStop(0.6, col);
        g.addColorStop(1, shade(col, -0.1));
        ctx.fillStyle = g;
        ctx.fillRect(base.x - r, base.y - h, r * 2, h);
        ctx.beginPath();
        ctx.ellipse(base.x, base.y, r, r / 2, 0, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = shade(col, 0.1);
        ctx.beginPath();
        ctx.ellipse(base.x, base.y - h, r, r / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      stripe(0.12, 0.12, 0, 62);
      stripe(0.34, 0.12, 0, 48);
      box(ctx, 0.5, 0.1, 0.7, 0.3, 0, 14, boxColors(tint("#8a949e")));
    }
  }

  // ----------------------------------------------------------- vehicles

  vehicle(kind: "car" | "truck" | "bus", color: string, alongU: boolean): Sprite {
    return this.object(`veh-${kind}-${color}-${alongU ? 1 : 0}`, 14, (ctx) => {
      const len = kind === "car" ? 0.2 : kind === "truck" ? 0.3 : 0.4;
      const wid = kind === "car" ? 0.11 : 0.13;
      const h = kind === "car" ? 4 : kind === "truck" ? 6.5 : 7;
      const u0 = 0.5 - (alongU ? len : wid) / 2;
      const u1 = 0.5 + (alongU ? len : wid) / 2;
      const v0 = 0.5 - (alongU ? wid : len) / 2;
      const v1 = 0.5 + (alongU ? wid : len) / 2;
      poly(ctx, [P(u0, v0 + 0.03), P(u1 + 0.03, v0 + 0.03), P(u1 + 0.03, v1 + 0.03), P(u0, v1 + 0.03)], "rgba(0,0,0,0.3)");
      if (kind === "truck") {
        box(ctx, u0, v0, u1, v1, 0.8, h, boxColors(color));
        poly(ctx, [P(u0, v0, h + 0.8), P(u1, v0, h + 0.8), P(u1, v1, h + 0.8), P(u0, v1, h + 0.8)], shade("#f4f4f4", -0.05));
      } else if (kind === "bus") {
        box(ctx, u0, v0, u1, v1, 0.8, h, boxColors("#f5f6f8"));
        const band = boxColors(color);
        box(ctx, u0 - 0.002, v0 - 0.002, u1 + 0.002, v1 + 0.002, 3.4, 2.2, { ...band, top: band.top });
        poly(ctx, [P(u0, v0, h + 0.8), P(u1, v0, h + 0.8), P(u1, v1, h + 0.8), P(u0, v1, h + 0.8)], "#e1e4ea");
      } else {
        box(ctx, u0, v0, u1, v1, 0.6, h * 0.55, boxColors(color));
        const s = 0.25;
        const cu0 = u0 + (u1 - u0) * s;
        const cu1 = u1 - (u1 - u0) * s;
        const cv0 = v0 + (v1 - v0) * (alongU ? 0.1 : s);
        const cv1 = v1 - (v1 - v0) * (alongU ? 0.1 : s);
        box(ctx, alongU ? cu0 : u0 + 0.01, cv0, alongU ? cu1 : u1 - 0.01, cv1, 0.6 + h * 0.55, h * 0.45, boxColors("#2a3342"));
      }
    });
  }
}
