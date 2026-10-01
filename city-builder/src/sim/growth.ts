import { GROWTH, TAX } from "../core/config";
import { Building, TileKind, Zone, ZoneType } from "../core/types";
import { capacityOf, Citizens } from "./citizens";
import type { SimContext } from "./context";
import type { SupplyStats } from "./production";

export interface Demand {
  residential: number;
  commercial: number;
  industrial: number;
}

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

/**
 * RCI demand and zone development. Demand comes from the balance between
 * homes, jobs and goods; zoned lots with road access grow buildings when
 * there is demand, and buildings level up when they are full and the land is
 * valuable enough. Lots cut off from the highway are abandoned over time.
 */
export class Growth {
  demand: Demand = { residential: 0.8, commercial: 0.4, industrial: 0.8 };

  constructor(
    private readonly ctx: SimContext,
    private readonly citizens: Citizens,
  ) {}

  reset(): void {
    this.demand = { residential: 0.8, commercial: 0.4, industrial: 0.8 };
  }

  updateDemand(supply: SupplyStats): void {
    const { world, economy } = this.ctx;
    const st = this.citizens.stats;
    const pop = st.population;
    let jobsC = 0;
    let jobsI = 0;
    let vacancies = 0;
    for (const b of world.buildings.values()) {
      if (b.abandoned || b.zone === Zone.Residential) continue;
      const cap = capacityOf(b);
      if (b.zone === Zone.Commercial) jobsC += cap;
      else jobsI += cap;
      vacancies += Math.max(0, cap - b.occupants);
    }
    const taxEffect = (z: ZoneType) => (economy.taxes[z] - TAX.comfortable) * 0.05;

    // Homes are wanted when jobs are waiting; jobs are wanted when people are idle.
    let r = (vacancies - st.unemployed * 0.6 + 10) / Math.max(12, pop * 0.1);
    if (pop < 40) r += 0.6;
    if (pop > 0) r += (st.avgHappiness - 55) / 120;

    const norm = Math.max(8, pop * 0.12);
    const jobGap = pop * 0.95 - (jobsC + jobsI);
    // Commerce wants ~35% of jobs and grows faster when residents can't shop.
    const cShare = Math.max(0, pop * 0.95 * 0.35 - jobsC);
    let c = (jobGap * 0.35 + cShare * 0.5 + 3) / norm;
    c += Math.min(0.5, supply.unmetNeeds / Math.max(10, pop * 0.1));

    // Industry takes the rest, plus whatever the city has to import.
    let i = (jobGap * 0.65 + 4) / norm;
    i += Math.min(0.5, supply.imported * 0.02);

    // Taxes apply after the clamp, so they still bite when raw demand is saturated.
    const smooth = (prev: number, raw: number, z: ZoneType) => prev + (clamp(clamp(raw) - taxEffect(z)) - prev) * 0.2;
    this.demand = {
      residential: smooth(this.demand.residential, r, Zone.Residential),
      commercial: smooth(this.demand.commercial, c, Zone.Commercial),
      industrial: smooth(this.demand.industrial, i, Zone.Industrial),
    };
  }

  demandFor(z: ZoneType): number {
    return z === Zone.Residential ? this.demand.residential : z === Zone.Commercial ? this.demand.commercial : this.demand.industrial;
  }

  /** Grows new buildings on zoned lots with road access. Returns the new buildings. */
  develop(): Building[] {
    const { world, rng } = this.ctx;
    const lots: number[] = [];
    for (let i = 0; i < world.count; i++) {
      if (world.kind[i] !== TileKind.Zone || world.buildingAt[i] !== -1) continue;
      const access = world.accessRoad(i);
      if (access === -1 || !world.connected[access]) continue;
      lots.push(i);
    }
    const built: Building[] = [];
    for (let k = 0; k < GROWTH.spawnAttemptsPerDay && lots.length > 0; k++) {
      const pick = rng.int(lots.length);
      const tile = lots[pick]!;
      const z = world.zone[tile] as ZoneType;
      const d = this.demandFor(z);
      if (d <= 0.05 || !rng.chance(d * 0.85)) continue;
      lots.splice(pick, 1);
      built.push(world.addBuilding(tile, z, rng.int(4), this.ctx.day()));
    }
    return built;
  }

  /** Level ups and abandonment. Returns buildings that changed level. */
  evolve(): { leveled: Building[]; abandoned: Building[]; recovered: Building[] } {
    const { world, env } = this.ctx;
    const leveled: Building[] = [];
    const abandoned: Building[] = [];
    const recovered: Building[] = [];
    for (const b of world.buildings.values()) {
      const tile = world.idx(b.x, b.y);
      const access = world.accessRoad(tile);
      const connected = access !== -1 && world.connected[access] === 1;
      if (!connected) {
        b.disconnectedDays++;
        if (!b.abandoned && b.disconnectedDays >= GROWTH.abandonAfterDays) {
          b.abandoned = true;
          b.growth = 0;
          abandoned.push(b);
        }
        continue;
      }
      if (b.abandoned) {
        b.abandoned = false;
        recovered.push(b);
      }
      b.disconnectedDays = 0;
      if (b.level >= 3) continue;
      const cap = capacityOf(b);
      const full = b.occupants >= cap * GROWTH.levelUpOccupancy;
      const nextLevelValue = GROWTH.levelLandValue[b.level + 1]!;
      const lv = env.landValue[tile]!;
      const d = this.demandFor(b.zone);
      let ok = full && d > -0.15;
      if (b.zone === Zone.Residential) {
        ok = ok && lv >= nextLevelValue && this.avgHappiness(b) >= 50 && b.goodsSatisfaction > 0.5;
      } else if (b.zone === Zone.Commercial) {
        ok = ok && lv >= nextLevelValue * 0.8 && b.activity > 0;
      } else {
        ok = ok && b.stock < cap * 4.5;
      }
      if (ok) {
        b.growth += 1 / GROWTH.levelUpDays;
        if (b.growth >= 1) {
          b.level = (b.level + 1) as 2 | 3;
          b.growth = 0;
          leveled.push(b);
          world.version++;
        }
      } else {
        b.growth = Math.max(0, b.growth - 0.01);
      }
    }
    return { leveled, abandoned, recovered };
  }

  private avgHappiness(b: Building): number {
    const ids = this.citizens.residentsOf(b.id);
    if (ids.length === 0) return 0;
    let sum = 0;
    for (const id of ids) sum += this.citizens.all.get(id)?.happiness ?? 0;
    return sum / ids.length;
  }
}
