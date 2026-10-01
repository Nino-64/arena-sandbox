import { TRAFFIC, TRANSIT } from "../core/config";
import type { World } from "./world";

/**
 * Road flow model. Each road tile carries a number of daily trips, split by
 * source: commuting cars (added and removed exactly as routes change),
 * freight trucks (an exponential moving average of real truck passes) and
 * buses (a fixed load per bus on its line). Congestion feeds back into the
 * car routing cost, so traffic spreads out as roads saturate.
 */
export class Traffic {
  readonly commute: Float32Array;
  readonly freight: Float32Array;
  readonly bus: Float32Array;
  private readonly freightToday: Float32Array;

  constructor(private readonly world: World) {
    this.commute = new Float32Array(world.count);
    this.freight = new Float32Array(world.count);
    this.bus = new Float32Array(world.count);
    this.freightToday = new Float32Array(world.count);
  }

  reset(): void {
    this.commute.fill(0);
    this.freight.fill(0);
    this.bus.fill(0);
    this.freightToday.fill(0);
  }

  capacity(i: number): number {
    return this.world.isHighway(i) ? TRAFFIC.highwayCapacity : TRAFFIC.roadCapacity;
  }

  load(i: number): number {
    return this.commute[i]! + this.freight[i]! + this.bus[i]!;
  }

  congestion(i: number): number {
    return this.load(i) / this.capacity(i);
  }

  /** Cost of driving onto tile i, rising quadratically with congestion. */
  carCost(i: number): number {
    const c = Math.min(this.congestion(i), 3);
    return 1 + TRAFFIC.congestionK * c * c;
  }

  /** Speed factor (0..1] used by moving vehicles on tile i. */
  speedFactor(i: number): number {
    const c = this.congestion(i);
    return c <= 0.6 ? 1 : 1 / (1 + 1.6 * (c - 0.6));
  }

  addRoute(route: Int32Array, tripsPerDay: number): void {
    for (let k = 0; k < route.length; k++) this.commute[route[k]!]! += tripsPerDay;
  }

  removeRoute(route: Int32Array, tripsPerDay: number): void {
    for (let k = 0; k < route.length; k++) {
      const i = route[k]!;
      this.commute[i] = Math.max(0, this.commute[i]! - tripsPerDay);
    }
  }

  recordFreightPass(i: number): void {
    this.freightToday[i]! += 1;
  }

  setBusLoad(paths: ReadonlyArray<{ path: Int32Array; buses: number }>): void {
    this.bus.fill(0);
    for (const { path, buses } of paths) {
      // Each bus passes a tile (speed / loop length) times a day, and weighs
      // like several cars.
      const passesPerDay = (buses * TRANSIT.busSpeed) / Math.max(1, path.length);
      const load = passesPerDay * TRANSIT.busTrafficLoad;
      for (let k = 0; k < path.length; k++) this.bus[path[k]!]! += load;
    }
  }

  endOfDay(): void {
    for (let i = 0; i < this.world.count; i++) {
      this.freight[i] = this.freight[i]! * 0.7 + this.freightToday[i]! * 0.3 * 2;
      this.freightToday[i] = 0;
      if (!this.world.isRoad(i)) {
        this.commute[i] = 0;
        this.freight[i] = 0;
      }
    }
  }

  stats(): { avgCongestion: number; jammedTiles: number; roadTiles: number } {
    let sum = 0;
    let n = 0;
    let jammed = 0;
    for (let i = 0; i < this.world.count; i++) {
      if (!this.world.isRoad(i)) continue;
      const c = this.congestion(i);
      n++;
      sum += Math.min(c, 2);
      if (c > 1) jammed++;
    }
    return { avgCongestion: n ? sum / n : 0, jammedTiles: jammed, roadTiles: n };
  }
}
