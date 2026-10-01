import { TRAFFIC } from "../core/config";
import { Building, CommuteMode, OverlayId, Terrain, TileKind, Vehicle, Zone } from "../core/types";
import type { Simulation } from "../sim/simulation";
import { Camera, project, TH, tileTop, TW } from "./camera";
import { heat, rgba } from "./colors";
import { Particles } from "./particles";
import { Sprite, SpriteBank } from "./sprites";

export interface TilePreview {
  tiles: number[];
  valid: boolean;
  color: string;
}

interface Car {
  route: Int32Array;
  pos: number;
  dir: 1 | -1;
  speed: number;
  color: string;
}

const CAR_COLORS = ["#e94f4f", "#f5f5f5", "#2d3142", "#4f86f7", "#ffcf56", "#6fcf97", "#b07cd8", "#c0c4cc"];

const hashTile = (i: number) => {
  let h = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) % 4;
};

/**
 * Draws the city: ground pass, overlay pass, object pass (buildings, trees,
 * vehicles) in painter order, then particles and tool previews. Everything
 * is in world pixels under a single camera transform.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly sprites = new SpriteBank();
  readonly particles = new Particles();
  overlay: OverlayId = "none";
  preview: TilePreview | null = null;
  /** Bus line being drawn: stops picked so far and their road path. */
  linePreview: { path: Int32Array | null; stops: number[]; color: string } | null = null;
  showLines = false;
  hoverTile = -1;
  selectedTile = -1;
  private cars: Car[] = [];
  private carRoutes: Int32Array[] = [];
  private routesRefreshAt = 0;
  private time = 0;
  private dpr = 1;
  private popIn = new Map<number, number>();
  private flashes = new Map<number, number>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sim: Simulation,
    readonly camera: Camera,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
  }

  resize(width: number, height: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.resize(width, height);
  }

  /** Visual feedback for simulation events. */
  onBuildingEvent(b: Building, kind: "built" | "leveled" | "abandoned" | "removed"): void {
    const c = project(b.x + 0.5, b.y + 0.5);
    if (kind === "built") {
      this.popIn.set(b.id, this.time);
      this.particles.burst(c.sx, c.sy, 10, ["#d8cfb8", "#bfb59c", "#e9e2cf"], 26, 2.2, 0.8);
    } else if (kind === "leveled") {
      this.popIn.set(b.id, this.time);
      this.flashes.set(b.id, this.time);
      this.particles.burst(c.sx, c.sy - 20, 22, ["#ffe066", "#ffffff", "#7ee8fa"], 44, 1.6, 1.1);
    } else if (kind === "removed") {
      this.particles.burst(c.sx, c.sy, 26, ["#9a8f7a", "#c9bfa8", "#6f6656"], 40, 2.6, 0.9);
    } else {
      this.particles.burst(c.sx, c.sy - 6, 8, ["#555", "#777"], 16, 2.4, 1.2);
    }
  }

  dustAt(tiles: number[]): void {
    const w = this.sim.world;
    for (const i of tiles.slice(0, 60)) {
      const c = project(w.xOf(i) + 0.5, w.yOf(i) + 0.5);
      this.particles.burst(c.sx, c.sy, 3, ["#d8cfb8", "#c5bca5"], 18, 1.8, 0.5);
    }
  }

  frame(dtSec: number, dtDays: number): void {
    this.time += dtSec;
    this.camera.update(dtSec);
    this.updateCars(dtDays);
    this.emitSmoke(dtSec, dtDays);
    this.particles.update(dtSec);

    const ctx = this.ctx;
    const cam = this.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    bg.addColorStop(0, "#0d1422");
    bg.addColorStop(1, "#1a2436");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const z = cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, (cam.width / 2 - cam.x * cam.zoom) * this.dpr, (cam.height / 2 - cam.y * cam.zoom) * this.dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    this.drawSlab();
    const view = cam.viewRect();
    const visible = this.visibleTiles(view);
    this.drawGround(visible);
    if (this.overlay !== "none") this.drawOverlay(visible);
    this.drawLines();
    this.drawPreview();
    this.drawObjects(visible);
    this.particles.draw(ctx);
    this.drawHover();
  }

  private visibleTiles(view: { x0: number; y0: number; x1: number; y1: number }): number[] {
    const w = this.sim.world;
    const out: number[] = [];
    for (let y = 0; y < w.size; y++) {
      for (let x = 0; x < w.size; x++) {
        const { sx, sy } = tileTop(x, y);
        if (sx + TW / 2 < view.x0 || sx - TW / 2 > view.x1 || sy + TH < view.y0 || sy - 170 > view.y1) continue;
        out.push(y * w.size + x);
      }
    }
    return out;
  }

  private blit(s: Sprite, sx: number, sy: number): void {
    this.ctx.drawImage(s.canvas, sx - s.ox, sy - s.oy, s.w, s.h);
  }

  /** Earth sides under the map edge, so the city reads as a floating diorama. */
  private drawSlab(): void {
    const n = this.sim.world.size;
    const ctx = this.ctx;
    const depth = 22;
    const a = project(0, n);
    const b = project(n, n);
    const c = project(n, 0);
    const left = ctx.createLinearGradient(0, a.sy, 0, a.sy + depth);
    left.addColorStop(0, "#5b4634");
    left.addColorStop(1, "#2e241c");
    ctx.fillStyle = left;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(b.sx, b.sy + depth);
    ctx.lineTo(a.sx, a.sy + depth);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#463626";
    ctx.beginPath();
    ctx.moveTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.lineTo(c.sx, c.sy + depth);
    ctx.lineTo(b.sx, b.sy + depth);
    ctx.closePath();
    ctx.fill();
  }

  private landMask(i: number, wantWater: boolean): number {
    const w = this.sim.world;
    const x = w.xOf(i);
    const y = w.yOf(i);
    let m = 0;
    const test = (nx: number, ny: number, bit: number) => {
      if (!w.inBounds(nx, ny)) return;
      const isWater = w.terrain[w.idx(nx, ny)] === Terrain.Water;
      if (isWater === wantWater) m |= bit;
    };
    test(x, y - 1, 1);
    test(x + 1, y, 2);
    test(x, y + 1, 4);
    test(x - 1, y, 8);
    return m;
  }

  private drawGround(tiles: number[]): void {
    const w = this.sim.world;
    const sp = this.sprites;
    for (const i of tiles) {
      const x = w.xOf(i);
      const y = w.yOf(i);
      const { sx, sy } = tileTop(x, y);
      const v = hashTile(i);
      const k = w.kind[i];
      let s: Sprite;
      if (k === TileKind.Road) s = sp.road(w.roadMask(i), w.isHighway(i), w.isBusStop(i));
      else if (w.buildingAt[i] !== -1) {
        const b = w.buildings.get(w.buildingAt[i]!)!;
        s = sp.lotBase(b.zone, v);
      } else if (k === TileKind.Zone) s = sp.zoneLot(w.zone[i]!, v);
      else if (w.terrain[i] === Terrain.Water) s = sp.water(this.landMask(i, false), v);
      else s = sp.grass(v, this.landMask(i, true));
      this.blit(s, sx, sy);
      if (w.terrain[i] === Terrain.Water) {
        // Gentle animated glints.
        const t = Math.sin(this.time * 1.6 + i * 1.7);
        if (t > 0.6) {
          this.ctx.fillStyle = `rgba(255,255,255,${(t - 0.6) * 0.6})`;
          this.ctx.fillRect(sx - 6 + v * 3, sy + TH / 2 - 1 + (v % 2) * 3, 7, 0.9);
        }
      }
      if (k === TileKind.Zone && w.buildingAt[i] === -1) {
        const access = w.accessRoad(i);
        if (access === -1 || !w.connected[access]) {
          // Warning pip: this lot can't develop without a connected road.
          this.ctx.fillStyle = "rgba(255,90,90,0.9)";
          this.ctx.beginPath();
          this.ctx.arc(sx, sy + TH / 2, 2.2, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }
  }

  private overlayValue(i: number): number | null {
    const sim = this.sim;
    const w = sim.world;
    switch (this.overlay) {
      case "traffic":
        return w.isRoad(i) ? Math.min(1, sim.traffic.congestion(i) / 1.2) : null;
      case "pollution":
        return w.terrain[i] === Terrain.Water ? null : sim.env.pollution[i]! / 70;
      case "landValue":
        return w.terrain[i] === Terrain.Water ? null : 1 - sim.env.landValue[i]! / 80;
      case "transit":
        return sim.transit.coverage[i] ? 0 : w.buildingAt[i] !== -1 ? 1 : null;
      case "happiness": {
        const bid = w.buildingAt[i]!;
        if (bid === -1) return null;
        const b = w.buildings.get(bid)!;
        if (b.zone !== Zone.Residential) return null;
        const ids = sim.citizens.residentsOf(b.id);
        if (ids.length === 0) return null;
        let s = 0;
        for (const id of ids) s += sim.citizens.all.get(id)?.happiness ?? 0;
        return 1 - s / ids.length / 100;
      }
      default:
        return null;
    }
  }

  private drawOverlay(tiles: number[]): void {
    const ctx = this.ctx;
    const w = this.sim.world;
    ctx.fillStyle = "rgba(8,14,26,0.45)";
    for (const i of tiles) {
      const { sx, sy } = tileTop(w.xOf(i), w.yOf(i));
      this.diamond(sx, sy);
      ctx.fill();
    }
    for (const i of tiles) {
      const v = this.overlayValue(i);
      if (v === null) continue;
      const { sx, sy } = tileTop(w.xOf(i), w.yOf(i));
      ctx.fillStyle = rgba(heat(v), this.overlay === "traffic" ? 0.85 : 0.6);
      this.diamond(sx, sy, this.overlay === "traffic" ? 0.12 : 0.02);
      ctx.fill();
    }
  }

  private diamond(sx: number, sy: number, inset = 0): void {
    const ctx = this.ctx;
    const ix = (TW / 2) * (1 - inset * 2);
    const iy = (TH / 2) * (1 - inset * 2);
    const cy = sy + TH / 2;
    ctx.beginPath();
    ctx.moveTo(sx, cy - iy);
    ctx.lineTo(sx + ix, cy);
    ctx.lineTo(sx, cy + iy);
    ctx.lineTo(sx - ix, cy);
    ctx.closePath();
  }

  private pathPolyline(path: Int32Array, offset: number, closed: boolean): void {
    const w = this.sim.world;
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < path.length; k++) {
      const i = path[k]!;
      const p = project(w.xOf(i) + 0.5 + offset, w.yOf(i) + 0.5 + offset);
      if (k === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    }
    if (closed) ctx.closePath();
  }

  private drawLines(): void {
    const ctx = this.ctx;
    const show = this.showLines || this.overlay === "transit";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (show) {
      this.sim.transit.lines.forEach((line, k) => {
        if (line.broken || line.path.length === 0) return;
        const off = ((k % 4) - 1.5) * 0.06;
        ctx.strokeStyle = "rgba(10,15,25,0.55)";
        ctx.lineWidth = 5;
        this.pathPolyline(line.path, off, true);
        ctx.stroke();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 3;
        this.pathPolyline(line.path, off, true);
        ctx.stroke();
      });
    }
    if (this.linePreview) {
      const { path, stops, color } = this.linePreview;
      if (path && path.length > 1) {
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        this.pathPolyline(path, 0, false);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const w = this.sim.world;
      stops.forEach((s, k) => {
        const c = project(w.xOf(s) + 0.5, w.yOf(s) + 0.5);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(c.sx, c.sy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0d1422";
        ctx.font = "bold 7px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(k + 1), c.sx, c.sy + 0.5);
      });
    }
  }

  private drawPreview(): void {
    if (!this.preview) return;
    const ctx = this.ctx;
    const w = this.sim.world;
    ctx.fillStyle = rgba(this.preview.valid ? this.preview.color : "#ff4d4d", 0.42);
    ctx.strokeStyle = rgba(this.preview.valid ? this.preview.color : "#ff4d4d", 0.95);
    ctx.lineWidth = 1;
    for (const i of this.preview.tiles) {
      const { sx, sy } = tileTop(w.xOf(i), w.yOf(i));
      this.diamond(sx, sy, 0.04);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawHover(): void {
    const ctx = this.ctx;
    const w = this.sim.world;
    const outline = (i: number, color: string, width: number) => {
      if (i < 0 || i >= w.count) return;
      const { sx, sy } = tileTop(w.xOf(i), w.yOf(i));
      this.diamond(sx, sy);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    outline(this.selectedTile, "#ffd23f", 2);
    outline(this.hoverTile, "rgba(255,255,255,0.85)", 1.2);
  }

  private drawObjects(tiles: number[]): void {
    const w = this.sim.world;
    const sp = this.sprites;
    const ctx = this.ctx;
    const buckets = this.bucketVehicles();
    const dim = this.overlay !== "none";
    for (const i of tiles) {
      const x = w.xOf(i);
      const y = w.yOf(i);
      const { sx, sy } = tileTop(x, y);
      const bid = w.buildingAt[i]!;
      if (bid !== -1) {
        const b = w.buildings.get(bid)!;
        const s = sp.building(b.zone, b.level, b.variant, b.abandoned);
        if (dim) ctx.globalAlpha = 0.82;
        const started = this.popIn.get(b.id);
        if (started !== undefined) {
          const t = Math.min(1, (this.time - started) / 0.45);
          const e = 1 - Math.pow(1 - t, 3);
          const squash = t < 1 ? e * (1 + 0.12 * Math.sin(t * Math.PI)) : 1;
          ctx.save();
          ctx.translate(sx, sy + TH);
          ctx.scale(1, squash);
          this.blit(s, 0, -TH);
          ctx.restore();
          if (t >= 1) this.popIn.delete(b.id);
        } else this.blit(s, sx, sy);
        const flash = this.flashes.get(b.id);
        if (flash !== undefined) {
          const t = (this.time - flash) / 0.6;
          if (t >= 1) this.flashes.delete(b.id);
          else {
            ctx.globalAlpha = (1 - t) * 0.5;
            ctx.globalCompositeOperation = "lighter";
            this.blit(s, sx, sy);
            ctx.globalCompositeOperation = "source-over";
          }
        }
        ctx.globalAlpha = 1;
      } else if (w.kind[i] === TileKind.Park) {
        this.blit(sp.park(hashTile(i)), sx, sy);
      } else if (w.terrain[i] === Terrain.Forest && w.kind[i] === TileKind.Empty) {
        this.blit(sp.forest(i % 7), sx, sy);
      } else if (w.isBusStop(i)) {
        this.blit(sp.busShelter(), sx, sy);
      }
      const vs = buckets.get(i);
      if (vs) for (const v of vs) this.blit(sp.vehicle(v.kind, v.color, v.alongU), v.sx - 0, v.sy);
    }
  }

  private bucketVehicles(): Map<number, Array<{ kind: "car" | "truck" | "bus"; color: string; alongU: boolean; sx: number; sy: number }>> {
    const w = this.sim.world;
    const out = new Map<number, Array<{ kind: "car" | "truck" | "bus"; color: string; alongU: boolean; sx: number; sy: number }>>();
    const place = (path: Int32Array, pos: number, dir: 1 | -1, kind: "car" | "truck" | "bus", color: string) => {
      const L = path.length;
      if (L === 0) return;
      let k = Math.floor(pos);
      let f = pos - k;
      if (dir === -1) {
        k = L - 1 - k;
        f = -f;
      }
      k = Math.max(0, Math.min(L - 1, k));
      const a = path[k]!;
      const nextK = dir === 1 ? Math.min(L - 1, k + 1) : Math.max(0, k - 1);
      const b = path[nextK]!;
      const ax = w.xOf(a);
      const ay = w.yOf(a);
      const du = w.xOf(b) - ax;
      const dv = w.yOf(b) - ay;
      const ff = Math.abs(f);
      const u = ax + 0.5 + du * ff;
      const v = ay + 0.5 + dv * ff;
      // Drive on the right: offset perpendicular to the direction of travel.
      const lane = 0.16;
      const pu = -dv * lane;
      const pv = du * lane;
      const p = project(u + pu - 0.5, v + pv - 0.5);
      const tile = Math.floor(u + pu) + Math.floor(v + pv) * w.size;
      const key = tile >= 0 && tile < w.count ? tile : a;
      const list = out.get(key);
      const item = { kind, color, alongU: du !== 0 || (du === 0 && dv === 0), sx: p.sx, sy: p.sy };
      if (list) list.push(item);
      else out.set(key, [item]);
    };
    for (const c of this.cars) place(c.route, c.pos, c.dir, "car", c.color);
    const vehicles: Vehicle[] = [...this.sim.production.trucks, ...this.sim.transit.buses];
    for (const v of vehicles) place(v.path, v.loop ? v.pos % v.path.length : v.pos, 1, v.kind, v.color);
    return out;
  }

  /** Ambient cars sampled from real commuter routes; density follows the traffic model. */
  private updateCars(dtDays: number): void {
    const sim = this.sim;
    if (this.time >= this.routesRefreshAt) {
      this.routesRefreshAt = this.time + 2;
      this.carRoutes = [];
      for (const c of sim.citizens.all.values()) if (c.mode === CommuteMode.Car && c.route && c.route.length > 2) this.carRoutes.push(c.route);
    }
    const target = Math.min(TRAFFIC.maxVisualCars, Math.round(this.carRoutes.length * 0.32));
    let spawns = 0;
    while (this.cars.length < target && spawns < 4 && this.carRoutes.length > 0) {
      const route = this.carRoutes[Math.floor(Math.random() * this.carRoutes.length)]!;
      this.cars.push({
        route,
        pos: Math.random() * (route.length - 1) * 0.5,
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: 5 + Math.random() * 2.5,
        color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]!,
      });
      spawns++;
    }
    if (this.cars.length > target + 10) this.cars.length = target;
    const w = sim.world;
    this.cars = this.cars.filter((c) => {
      const k = Math.floor(c.pos);
      const idx = c.dir === 1 ? k : c.route.length - 1 - k;
      const tile = c.route[Math.max(0, Math.min(c.route.length - 1, idx))]!;
      if (!w.isRoad(tile)) return false;
      c.pos += c.speed * dtDays * sim.traffic.speedFactor(tile);
      return c.pos < c.route.length - 1;
    });
  }

  private smokeClock = 0;

  private emitSmoke(dtSec: number, dtDays: number): void {
    if (dtDays <= 0) return;
    this.smokeClock += dtSec;
    if (this.smokeClock < 0.12) return;
    this.smokeClock = 0;
    const view = this.camera.viewRect(0);
    for (const b of this.sim.world.buildings.values()) {
      if (b.zone !== Zone.Industrial || b.abandoned || b.activity <= 0) continue;
      if (Math.random() > 0.55) continue;
      const stacks: Array<[number, number, number]> =
        b.level === 1 ? [[0.26, 0.31, 30]] : b.level === 2 ? [[0.76, 0.24, 50]] : [[0.18, 0.18, 62], [0.4, 0.18, 48]];
      for (const [u, v, z] of stacks) {
        const p = project(b.x + u, b.y + v);
        if (p.sx < view.x0 || p.sx > view.x1 || p.sy < view.y0 || p.sy > view.y1) continue;
        const grey = 190 + Math.floor(Math.random() * 40);
        this.particles.emit({
          x: p.sx + (Math.random() - 0.5) * 2,
          y: p.sy - z,
          vx: 4 + Math.random() * 4,
          vy: -10 - Math.random() * 6,
          maxLife: 2.2 + Math.random(),
          size: 2,
          grow: 2.6,
          color: `rgb(${grey},${grey},${grey + 5})`,
          alpha: 0.42,
        });
      }
    }
  }
}
