import { CITIZENS, ECONOMY, PRODUCTION } from "../core/config";
import { Building, Vehicle, Zone } from "../core/types";
import { capacityOf } from "./citizens";
import type { SimContext } from "./context";

export interface SupplyStats {
  produced: number;
  delivered: number;
  exported: number;
  imported: number;
  sold: number;
  unmetNeeds: number;
  trucksOnRoad: number;
}

export function storageCap(b: Building): number {
  return capacityOf(b) * PRODUCTION.storagePerJob;
}

export function shelfCap(b: Building): number {
  return Math.max(1, capacityOf(b)) * PRODUCTION.shelfPerJob;
}

const TRUCK_COLORS = ["#f2a541", "#e8e3d3", "#5bb0ff"];

/**
 * The goods chain: factories turn workers into goods, trucks physically drive
 * them to shops over the road network (adding freight traffic), shops sell to
 * residents. Surplus is exported by the highway; shortages are imported at a
 * premium, which is bad for the city's industry.
 */
export class Production {
  trucks: Vehicle[] = [];
  stats: SupplyStats = emptyStats();
  private today: SupplyStats = emptyStats();
  private rotate = 0;
  /** Factory id -> day before which it won't look for a buyer again (no route/buyer found). */
  private backoff = new Map<number, number>();

  constructor(private readonly ctx: SimContext) {}

  reset(): void {
    this.backoff.clear();
    this.trucks = [];
    this.stats = emptyStats();
    this.today = emptyStats();
  }

  daily(): void {
    const { world } = this.ctx;
    const factories: Building[] = [];
    const shops: Building[] = [];
    for (const b of world.buildings.values()) {
      if (b.abandoned) continue;
      if (b.zone === Zone.Industrial) factories.push(b);
      else if (b.zone === Zone.Commercial) shops.push(b);
    }
    for (const s of shops) {
      s.activity = 0;
      s.demand = 0;
      s.daysSinceDelivery++;
    }
    this.produce(factories);
    this.dispatch(factories, shops);
    this.importGoods(shops);
    this.shopping();
    this.today.trucksOnRoad = this.trucks.length;
    this.stats = this.today;
    this.today = emptyStats();
  }

  private connectedAccess(b: Building): number {
    const { world } = this.ctx;
    const access = world.accessRoad(world.idx(b.x, b.y));
    return access !== -1 && world.connected[access] ? access : -1;
  }

  private produce(factories: Building[]): void {
    for (const f of factories) {
      f.activity = 0;
      if (this.connectedAccess(f) === -1) continue;
      const made = f.occupants * PRODUCTION.goodsPerWorkerPerDay * PRODUCTION.levelMultiplier[f.level]!;
      const room = storageCap(f) - f.stock;
      const added = Math.max(0, Math.min(room, made));
      f.stock += added;
      f.activity = added;
      this.today.produced += added;
    }
  }

  private dispatch(factories: Building[], shops: Building[]): void {
    const { world, router, traffic } = this.ctx;
    const day = this.ctx.day();
    const ready = factories
      .filter((f) => f.stock >= PRODUCTION.truckLoad && (this.backoff.get(f.id) ?? -1) <= day)
      .sort((a, b) => b.stock - a.stock);
    let dispatched = 0;
    let routed = 0;
    for (const f of ready) {
      if (dispatched >= PRODUCTION.maxTruckDispatchesPerDay || routed >= PRODUCTION.maxTruckDispatchesPerDay + 4) break;
      const access = this.connectedAccess(f);
      if (access === -1) continue;
      router.run(access, (i) => traffic.carCost(i), 90);
      routed++;
      const before = dispatched;
      while (f.stock >= PRODUCTION.truckLoad && dispatched < PRODUCTION.maxTruckDispatchesPerDay) {
        let best: Building | null = null;
        let bestScore = 0;
        let bestAccess = -1;
        for (const s of shops) {
          const need = shelfCap(s) - s.stock - s.incoming;
          if (need < PRODUCTION.truckLoad * 0.5) continue;
          const sa = this.connectedAccess(s);
          if (sa === -1) continue;
          const d = router.field.dist[sa]!;
          if (!Number.isFinite(d)) continue;
          const staffed = s.occupants > 0 ? 1 : 0.35;
          const score = (need * staffed) / (1 + d * 0.06);
          if (score > bestScore) {
            bestScore = score;
            best = s;
            bestAccess = sa;
          }
        }
        if (best) {
          const load = Math.min(PRODUCTION.truckLoad, f.stock, shelfCap(best) - best.stock - best.incoming);
          const path = router.pathTo(bestAccess);
          if (!path) break;
          f.stock -= load;
          best.incoming += load;
          this.spawnTruck(path, load, best.id, false, false);
          dispatched++;
          continue;
        }
        // No local buyer: export surplus once storage is filling up.
        if (f.stock >= storageCap(f) * 0.7 && world.highwayEntry >= 0) {
          const path = router.pathTo(world.highwayEntry);
          if (!path) break;
          const load = Math.min(PRODUCTION.truckLoad, f.stock);
          f.stock -= load;
          this.spawnTruck(path, load, -1, true, false);
          dispatched++;
          continue;
        }
        break;
      }
      // Nothing could leave: wait a few days before paying for another search.
      if (dispatched === before) this.backoff.set(f.id, day + 3);
    }
  }

  private importGoods(shops: Building[]): void {
    const { world, router, traffic } = this.ctx;
    if (world.highwayEntry < 0) return;
    const needy = shops.filter(
      (s) =>
        s.occupants > 0 &&
        s.daysSinceDelivery > 4 &&
        s.stock + s.incoming < shelfCap(s) * PRODUCTION.importThreshold &&
        this.connectedAccess(s) !== -1,
    );
    if (needy.length === 0) return;
    router.run(world.highwayEntry, (i) => traffic.carCost(i));
    let count = 0;
    const maxImports = Math.max(6, Math.ceil(shops.length / 4));
    for (const s of needy) {
      if (count >= maxImports) break;
      const path = router.pathTo(this.connectedAccess(s));
      if (!path) continue;
      const load = PRODUCTION.truckLoad;
      s.incoming += load;
      this.spawnTruck(path, load, s.id, false, true);
      this.today.imported += load;
      count++;
    }
  }

  private spawnTruck(path: Int32Array, load: number, targetId: number, isExport: boolean, isImport: boolean): void {
    this.trucks.push({
      kind: "truck",
      path,
      pos: 0,
      speed: PRODUCTION.truckSpeed,
      load,
      targetId,
      lineId: -1,
      export: isExport,
      import: isImport,
      loop: false,
      color: isImport ? TRUCK_COLORS[2]! : isExport ? TRUCK_COLORS[1]! : TRUCK_COLORS[0]!,
    });
  }

  /** Residents buy goods from their assigned shop; shops pay commercial tax on sales. */
  private shopping(): void {
    const { world, economy } = this.ctx;
    const homes: Building[] = [];
    for (const b of world.buildings.values()) if (b.zone === Zone.Residential && b.occupants > 0) homes.push(b);
    if (homes.length === 0) return;
    const start = this.rotate++ % homes.length;
    const taxC = economy.rate(Zone.Commercial);
    for (let k = 0; k < homes.length; k++) {
      const h = homes[(start + k) % homes.length]!;
      const need = h.occupants * CITIZENS.goodsPerDay;
      const shop = h.shopId !== -1 ? world.buildings.get(h.shopId) : undefined;
      let bought = 0;
      if (shop && !shop.abandoned && shop.zone === Zone.Commercial) {
        shop.demand += need;
        const sellCap = shop.occupants * PRODUCTION.salesPerWorkerPerDay * (1 + 0.15 * (shop.level - 1)) - shop.activity;
        bought = Math.max(0, Math.min(need, shop.stock, sellCap));
        shop.stock -= bought;
        shop.activity += bought;
        economy.earn("commercial", bought * ECONOMY.retailPrice * taxC);
      }
      this.today.sold += bought;
      this.today.unmetNeeds += need - bought;
      const ratio = need > 0 ? bought / need : 1;
      h.goodsSatisfaction += (ratio - h.goodsSatisfaction) * 0.15;
    }
  }

  /** Moves trucks; delivers goods on arrival. */
  update(dtDays: number): void {
    const { world, traffic, economy } = this.ctx;
    const taxI = economy.rate(Zone.Industrial);
    const arrived: Vehicle[] = [];
    for (const t of this.trucks) {
      const last = t.path.length - 1;
      const before = Math.floor(t.pos);
      const tile = t.path[Math.min(before, last)]!;
      t.pos += t.speed * dtDays * traffic.speedFactor(tile);
      const after = Math.floor(Math.min(t.pos, last));
      for (let k = before + 1; k <= after; k++) traffic.recordFreightPass(t.path[k]!);
      if (t.pos >= last) arrived.push(t);
    }
    if (arrived.length === 0) return;
    for (const t of arrived) {
      if (t.export) {
        economy.earn("industrial", t.load * ECONOMY.exportPrice * taxI);
        this.today.exported += t.load;
        continue;
      }
      const shop = world.buildings.get(t.targetId);
      if (!shop || shop.zone !== Zone.Commercial) continue;
      shop.incoming = Math.max(0, shop.incoming - t.load);
      shop.stock = Math.min(shelfCap(shop), shop.stock + t.load);
      if (!t.import) {
        shop.daysSinceDelivery = 0;
        economy.earn("industrial", t.load * ECONOMY.wholesalePrice * taxI);
        this.today.delivered += t.load;
      }
    }
    const done = new Set(arrived);
    this.trucks = this.trucks.filter((t) => !done.has(t));
  }

  /** Trucks heading to a removed building are dropped. */
  onBuildingLost(id: number): void {
    this.trucks = this.trucks.filter((t) => t.targetId !== id || t.export);
  }

  /** Roads changed: trucks whose path crosses a removed tile vanish. */
  onNetworkChanged(): void {
    const { world } = this.ctx;
    const survivors: Vehicle[] = [];
    for (const t of this.trucks) {
      let ok = true;
      for (let k = Math.floor(t.pos); k < t.path.length; k++) {
        if (!world.isRoad(t.path[k]!)) {
          ok = false;
          break;
        }
      }
      if (ok) survivors.push(t);
      else if (!t.export) {
        const shop = world.buildings.get(t.targetId);
        if (shop) shop.incoming = Math.max(0, shop.incoming - t.load);
      }
    }
    this.trucks = survivors;
  }
}

function emptyStats(): SupplyStats {
  return { produced: 0, delivered: 0, exported: 0, imported: 0, sold: 0, unmetNeeds: 0, trucksOnRoad: 0 };
}
