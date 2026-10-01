import { TRANSIT } from "../core/config";
import type { BusLine, Vehicle } from "../core/types";
import { RoadRouter, shortestRoadPath } from "./pathfinding";
import type { Traffic } from "./traffic";
import type { World } from "./world";

export const LINE_COLORS = ["#ff5d73", "#3ec7ff", "#ffc24b", "#9b7bff", "#38e0a5", "#ff8a3d", "#f06bd8", "#7fd34e"];

export interface StopReach {
  /** Cost from the origin to each stop index (walk + ride + transfers). */
  cost: Float32Array;
  /** Boarding stop index used to reach each stop. */
  from: Int32Array;
}

export interface TransitTrip {
  cost: number;
  boardStop: number;
  alightStop: number;
}

/**
 * Bus network: lines, the stop-to-stop travel-cost matrix, walking coverage
 * and the buses that drive the loops. Citizens query it to compare a transit
 * commute with driving.
 */
export class Transit {
  lines: BusLine[] = [];
  nextLineId = 1;
  buses: Vehicle[] = [];

  /** Active stop tiles, indexed 0..n-1. */
  stopTiles: number[] = [];
  private stopIndex = new Map<number, number>();
  /** n*n travel cost between stops, Infinity when unreachable. */
  private matrix = new Float32Array(0);
  /** n*n next hop for path reconstruction. */
  private next = new Int32Array(0);
  /** n*n line id of the direct ride between two stops, -1 when none. */
  private directLine = new Int32Array(0);
  /** Per tile: flat list of [stopIndex, walkCost] pairs within walking range. */
  private near: Array<number[] | undefined> = [];
  /** 1 when a tile is within walking distance of an active stop. */
  readonly coverage: Uint8Array;
  /** Bumped whenever the network changes, so cached plans can refresh. */
  version = 0;

  private readonly router: RoadRouter;

  constructor(private readonly world: World) {
    this.coverage = new Uint8Array(world.count);
    this.router = new RoadRouter(world);
  }

  reset(): void {
    this.lines = [];
    this.nextLineId = 1;
    this.rebuild();
  }

  lineById(id: number): BusLine | undefined {
    return this.lines.find((l) => l.id === id);
  }

  /** Computes the loop path through the stops. Returns null if a leg has no road. */
  computePath(stops: number[]): { path: Int32Array; stopPathIndex: number[] } | null {
    if (stops.length < 2) return null;
    const parts: number[] = [];
    const stopPathIndex: number[] = [];
    for (let s = 0; s < stops.length; s++) {
      const a = stops[s]!;
      const b = stops[(s + 1) % stops.length]!;
      const leg = shortestRoadPath(this.router, a, b);
      if (!leg) return null;
      stopPathIndex.push(parts.length);
      // Drop the last tile of each leg: it is the first tile of the next leg.
      for (let k = 0; k < leg.length - 1; k++) parts.push(leg[k]!);
    }
    if (parts.length === 0) return null;
    return { path: Int32Array.from(parts), stopPathIndex };
  }

  /** Creates a line through `stops`. Returns the line or an error message (French UI). */
  createLine(stops: number[]): BusLine | string {
    const unique = stops.filter((s, k) => stops.indexOf(s) === k);
    if (unique.length < 2) return "Une ligne a besoin d'au moins 2 arrêts.";
    for (const s of unique) if (!this.world.isBusStop(s)) return "Chaque point de la ligne doit être un arrêt de bus.";
    const computed = this.computePath(unique);
    if (!computed) return "Les arrêts doivent être reliés par la route.";
    const id = this.nextLineId++;
    const line: BusLine = {
      id,
      name: `Ligne ${id}`,
      color: LINE_COLORS[(id - 1) % LINE_COLORS.length]!,
      stops: unique,
      path: computed.path,
      stopPathIndex: computed.stopPathIndex,
      buses: Math.min(TRANSIT.maxBusesPerLine, Math.max(2, Math.round(computed.path.length / 14))),
      broken: false,
      ridersToday: 0,
      ridersMonth: 0,
    };
    this.lines.push(line);
    this.rebuild();
    return line;
  }

  deleteLine(id: number): void {
    this.lines = this.lines.filter((l) => l.id !== id);
    this.rebuild();
  }

  setBusCount(id: number, buses: number): void {
    const line = this.lineById(id);
    if (!line) return;
    line.buses = Math.max(1, Math.min(TRANSIT.maxBusesPerLine, buses));
    this.rebuild();
  }

  /** A stop was removed from the map: drop it from every line. */
  onStopRemoved(tile: number): void {
    let changed = false;
    for (const line of this.lines) {
      if (line.stops.includes(tile)) {
        line.stops = line.stops.filter((s) => s !== tile);
        changed = true;
      }
    }
    if (changed) {
      this.lines = this.lines.filter((l) => l.stops.length >= 2);
      this.rebuild();
    }
  }

  /** Recompute every path (roads may have changed) and the cost matrix. */
  rebuild(): void {
    for (const line of this.lines) {
      const computed = this.computePath(line.stops);
      if (computed) {
        line.path = computed.path;
        line.stopPathIndex = computed.stopPathIndex;
        line.broken = false;
      } else {
        line.path = new Int32Array(0);
        line.stopPathIndex = [];
        line.broken = true;
      }
    }
    this.buildMatrix();
    this.buildCoverage();
    this.spawnBuses();
    this.version++;
  }

  waitCost(line: BusLine): number {
    return TRANSIT.waitBase + line.path.length / (Math.max(1, line.buses) * TRANSIT.headwayFactor);
  }

  private buildMatrix(): void {
    const active = this.lines.filter((l) => !l.broken);
    this.stopTiles = [];
    this.stopIndex.clear();
    for (const line of active) {
      for (const s of line.stops) {
        if (!this.stopIndex.has(s)) {
          this.stopIndex.set(s, this.stopTiles.length);
          this.stopTiles.push(s);
        }
      }
    }
    const n = this.stopTiles.length;
    this.matrix = new Float32Array(n * n).fill(Infinity);
    this.next = new Int32Array(n * n).fill(-1);
    this.directLine = new Int32Array(n * n).fill(-1);
    for (let a = 0; a < n; a++) {
      this.matrix[a * n + a] = 0;
      this.next[a * n + a] = a;
    }
    for (const line of active) {
      const L = line.path.length;
      const wait = this.waitCost(line);
      for (let i = 0; i < line.stops.length; i++) {
        for (let j = 0; j < line.stops.length; j++) {
          if (i === j) continue;
          const a = this.stopIndex.get(line.stops[i]!)!;
          const b = this.stopIndex.get(line.stops[j]!)!;
          const tiles = (line.stopPathIndex[j]! - line.stopPathIndex[i]! + L) % L;
          const cost = wait + tiles * TRANSIT.rideCostPerTile;
          if (cost < this.matrix[a * n + b]!) {
            this.matrix[a * n + b] = cost;
            this.next[a * n + b] = b;
            this.directLine[a * n + b] = line.id;
          }
        }
      }
    }
    // Floyd–Warshall with a transfer penalty at every intermediate stop.
    for (let k = 0; k < n; k++) {
      for (let a = 0; a < n; a++) {
        const ak = this.matrix[a * n + k]!;
        if (!Number.isFinite(ak) || a === k) continue;
        for (let b = 0; b < n; b++) {
          if (b === k || a === b) continue;
          const nd = ak + this.matrix[k * n + b]! + TRANSIT.transferPenalty;
          if (nd < this.matrix[a * n + b]!) {
            this.matrix[a * n + b] = nd;
            this.next[a * n + b] = this.next[a * n + k]!;
          }
        }
      }
    }
  }

  private buildCoverage(): void {
    const w = this.world;
    this.near = new Array(w.count);
    this.coverage.fill(0);
    const R = TRANSIT.walkRadius;
    this.stopTiles.forEach((tile, si) => {
      const sx = w.xOf(tile);
      const sy = w.yOf(tile);
      for (let y = sy - R; y <= sy + R; y++) {
        for (let x = sx - R; x <= sx + R; x++) {
          if (!w.inBounds(x, y)) continue;
          const d = Math.abs(x - sx) + Math.abs(y - sy);
          if (d > R) continue;
          const i = w.idx(x, y);
          (this.near[i] ??= []).push(si, d * TRANSIT.walkCost);
          this.coverage[i] = 1;
        }
      }
    });
  }

  private spawnBuses(): void {
    this.buses = [];
    for (const line of this.lines) {
      if (line.broken || line.path.length === 0) continue;
      for (let b = 0; b < line.buses; b++) {
        this.buses.push({
          kind: "bus",
          path: line.path,
          pos: (b / line.buses) * line.path.length,
          speed: TRANSIT.busSpeed,
          load: 0,
          targetId: -1,
          lineId: line.id,
          export: false,
          import: false,
          loop: true,
          color: line.color,
        });
      }
    }
  }

  /** Walk + ride cost from an origin tile to every active stop. */
  reachFrom(originTile: number): StopReach | null {
    const n = this.stopTiles.length;
    const near = this.near[originTile];
    if (!near || n === 0) return null;
    const cost = new Float32Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    for (let k = 0; k < near.length; k += 2) {
      const a = near[k]!;
      const walk = near[k + 1]!;
      for (let b = 0; b < n; b++) {
        const c = walk + this.matrix[a * n + b]!;
        if (c < cost[b]!) {
          cost[b] = c;
          from[b] = a;
        }
      }
    }
    return { cost, from };
  }

  /** Cheapest transit trip from a precomputed reach to a destination tile. */
  tripTo(reach: StopReach, destTile: number): TransitTrip | null {
    const near = this.near[destTile];
    if (!near) return null;
    let best: TransitTrip | null = null;
    for (let k = 0; k < near.length; k += 2) {
      const b = near[k]!;
      const c = reach.cost[b]! + near[k + 1]!;
      if (Number.isFinite(c) && (!best || c < best.cost)) {
        best = { cost: c, boardStop: reach.from[b]!, alightStop: b };
      }
    }
    return best;
  }

  /** Line ids ridden between two stop indices (empty when walking only). */
  linesBetween(a: number, b: number): number[] {
    const n = this.stopTiles.length;
    if (a === b || a < 0 || b < 0) return [];
    const out: number[] = [];
    let cur = a;
    let guard = 0;
    while (cur !== b && guard++ < n + 2) {
      const hop = this.next[cur * n + b]!;
      if (hop < 0) return [];
      const line = this.directLine[cur * n + hop]!;
      if (line >= 0 && out[out.length - 1] !== line) out.push(line);
      cur = hop;
    }
    return out;
  }

  /** Moves buses along their loops. `dtDays` is elapsed simulated time. */
  update(dtDays: number, traffic: Traffic): void {
    for (const bus of this.buses) {
      const L = bus.path.length;
      if (L === 0) continue;
      const tile = bus.path[Math.floor(bus.pos) % L]!;
      bus.pos = (bus.pos + bus.speed * dtDays * traffic.speedFactor(tile)) % L;
    }
  }

  totalBuses(): number {
    return this.lines.reduce((s, l) => s + (l.broken ? 0 : l.buses), 0);
  }

  busLoadPaths(): Array<{ path: Int32Array; buses: number }> {
    return this.lines.filter((l) => !l.broken).map((l) => ({ path: l.path, buses: l.buses }));
  }
}
