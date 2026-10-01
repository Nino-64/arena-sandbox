import { CAPACITY, ENV } from "../core/config";
import { Terrain, TileKind, Zone } from "../core/types";
import type { Traffic } from "./traffic";
import type { Transit } from "./transit";
import type { World } from "./world";

/**
 * Spatial fields recomputed every few days: pollution (factories and jammed
 * roads) and land value (parks, water, transit, minus pollution). Land value
 * gates building levels; both feed citizen happiness.
 */
export class Environment {
  readonly pollution: Float32Array;
  readonly landValue: Float32Array;
  readonly parkBonus: Float32Array;

  constructor(private readonly world: World) {
    this.pollution = new Float32Array(world.count);
    this.landValue = new Float32Array(world.count);
    this.parkBonus = new Float32Array(world.count);
  }

  recompute(traffic: Traffic, transit: Transit): void {
    const w = this.world;
    const s = w.size;
    this.pollution.fill(0);
    this.parkBonus.fill(0);

    const splat = (cx: number, cy: number, radius: number, amount: number, field: Float32Array) => {
      const r = Math.ceil(radius);
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= s || y >= s) continue;
          const d = Math.hypot(x - cx, y - cy);
          if (d > radius) continue;
          field[y * s + x]! += amount * (1 - d / (radius + 1));
        }
      }
    };

    for (const b of w.buildings.values()) {
      if (b.zone !== Zone.Industrial || b.abandoned) continue;
      const staffing = b.occupants / CAPACITY.industrial[b.level];
      splat(b.x, b.y, ENV.pollutionRadius + b.level - 1, ENV.pollutionPerLevel * b.level * (0.35 + 0.65 * staffing), this.pollution);
    }
    for (let i = 0; i < w.count; i++) {
      if (w.isRoad(i)) {
        const c = traffic.congestion(i);
        if (c > 0.5) splat(w.xOf(i), w.yOf(i), 1.5, Math.min(14, (c - 0.5) * 12), this.pollution);
      } else if (w.kind[i] === TileKind.Park) {
        splat(w.xOf(i), w.yOf(i), ENV.parkRadius, ENV.parkValue, this.parkBonus);
      } else if (w.terrain[i] === Terrain.Forest) {
        // Trees soak up a little pollution around them.
        this.pollution[i] = Math.max(0, this.pollution[i]! - 6);
      }
    }

    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        this.pollution[i] = Math.min(100, this.pollution[i]!);
        let v = 30;
        v += Math.min(30, this.parkBonus[i]!);
        if (this.nearTerrain(x, y, 3, Terrain.Water)) v += ENV.waterValue;
        if (this.nearTerrain(x, y, 1, Terrain.Forest)) v += 4;
        if (transit.coverage[i]) v += 9;
        v -= this.pollution[i]! * 0.75;
        this.landValue[i] = Math.max(0, Math.min(100, v));
      }
    }
    // Thriving commerce raises nearby land value a little.
    for (const b of w.buildings.values()) {
      if (b.zone !== Zone.Commercial || b.abandoned || b.level < 2) continue;
      for (let y = b.y - 3; y <= b.y + 3; y++) {
        for (let x = b.x - 3; x <= b.x + 3; x++) {
          if (!w.inBounds(x, y)) continue;
          const i = w.idx(x, y);
          this.landValue[i] = Math.min(100, this.landValue[i]! + 3 * (b.level - 1));
        }
      }
    }
  }

  private nearTerrain(cx: number, cy: number, r: number, t: Terrain): boolean {
    const w = this.world;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (w.inBounds(x, y) && w.terrain[w.idx(x, y)] === t) return true;
      }
    }
    return false;
  }
}
