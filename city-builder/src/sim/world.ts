import { MAP_SIZE } from "../core/config";
import { Rng, valueNoise } from "../core/rng";
import { Building, RoadFlag, Terrain, TileKind, Zone, ZoneType } from "../core/types";

export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * The tile grid and everything placed on it. Pure data plus integrity rules:
 * no economy, no agents. Systems read it and mutate it through these methods.
 */
export class World {
  readonly size: number;
  readonly count: number;
  readonly terrain: Uint8Array;
  readonly kind: Uint8Array;
  readonly zone: Uint8Array;
  readonly roadFlags: Uint8Array;
  readonly buildingAt: Int32Array;
  /** 1 when a road tile is connected to the highway (outside world). */
  readonly connected: Uint8Array;
  readonly buildings = new Map<number, Building>();
  nextBuildingId = 1;
  /** Bumped on every road change, so caches and routes know to refresh. */
  networkVersion = 0;
  /** Bumped on any change that affects the rendered ground. */
  version = 0;
  highwayEntry = -1;

  constructor(size = MAP_SIZE) {
    this.size = size;
    this.count = size * size;
    this.terrain = new Uint8Array(this.count);
    this.kind = new Uint8Array(this.count);
    this.zone = new Uint8Array(this.count);
    this.roadFlags = new Uint8Array(this.count);
    this.buildingAt = new Int32Array(this.count).fill(-1);
    this.connected = new Uint8Array(this.count);
  }

  idx(x: number, y: number): number {
    return y * this.size + x;
  }

  xOf(i: number): number {
    return i % this.size;
  }

  yOf(i: number): number {
    return Math.floor(i / this.size);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  isRoad(i: number): boolean {
    return this.kind[i] === TileKind.Road;
  }

  isHighway(i: number): boolean {
    return (this.roadFlags[i]! & RoadFlag.Highway) !== 0;
  }

  isBusStop(i: number): boolean {
    return (this.roadFlags[i]! & RoadFlag.BusStop) !== 0;
  }

  /** Bitmask of road neighbours: 1 = north (y-1), 2 = east, 4 = south, 8 = west. */
  roadMask(i: number): number {
    const x = this.xOf(i);
    const y = this.yOf(i);
    let mask = 0;
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d]!;
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && this.isRoad(this.idx(nx, ny))) mask |= 1 << d;
    }
    // A highway leaving the map keeps its exit stub drawn.
    if (this.isHighway(i) && x === 0) mask |= 8;
    return mask;
  }

  forNeighbors(i: number, fn: (n: number) => void): void {
    const x = this.xOf(i);
    const y = this.yOf(i);
    if (y > 0) fn(i - this.size);
    if (x < this.size - 1) fn(i + 1);
    if (y < this.size - 1) fn(i + this.size);
    if (x > 0) fn(i - 1);
  }

  /** First orthogonal road tile next to a tile, or -1. Prefers connected roads. */
  accessRoad(i: number): number {
    let best = -1;
    this.forNeighbors(i, (n) => {
      if (!this.isRoad(n)) return;
      if (best === -1 || (this.connected[n] && !this.connected[best])) best = n;
    });
    return best;
  }

  canBuildOn(i: number): boolean {
    return this.terrain[i] !== Terrain.Water;
  }

  // ---------------------------------------------------------------- edits

  /** Returns true if the tile changed. Clears zones (not buildings) under the road. */
  placeRoad(i: number): boolean {
    if (!this.canBuildOn(i) || this.isRoad(i) || this.buildingAt[i] !== -1) return false;
    this.kind[i] = TileKind.Road;
    this.zone[i] = Zone.None;
    this.terrain[i] = Terrain.Grass;
    this.roadFlags[i] = 0;
    this.networkChanged();
    return true;
  }

  placeZone(i: number, z: ZoneType): boolean {
    if (!this.canBuildOn(i)) return false;
    const k = this.kind[i];
    if (k === TileKind.Road || k === TileKind.Park) return false;
    if (this.buildingAt[i] !== -1) return false;
    if (k === TileKind.Zone && this.zone[i] === z) return false;
    this.kind[i] = TileKind.Zone;
    this.zone[i] = z;
    this.version++;
    return true;
  }

  placePark(i: number): boolean {
    if (!this.canBuildOn(i) || this.kind[i] !== TileKind.Empty) return false;
    this.kind[i] = TileKind.Park;
    this.terrain[i] = Terrain.Grass;
    this.version++;
    return true;
  }

  setBusStop(i: number, on: boolean): boolean {
    if (!this.isRoad(i) || this.isHighway(i)) return false;
    const has = this.isBusStop(i);
    if (has === on) return false;
    this.roadFlags[i] = on ? this.roadFlags[i]! | RoadFlag.BusStop : this.roadFlags[i]! & ~RoadFlag.BusStop;
    this.version++;
    return true;
  }

  addBuilding(i: number, zone: ZoneType, variant: number, day: number): Building {
    const b: Building = {
      id: this.nextBuildingId++,
      x: this.xOf(i),
      y: this.yOf(i),
      zone,
      level: 1,
      variant,
      occupants: 0,
      stock: 0,
      incoming: 0,
      growth: 0,
      disconnectedDays: 0,
      abandoned: false,
      shopId: -1,
      goodsSatisfaction: 1,
      lastPlannedDay: -1_000_000,
      activity: 0,
      demand: 0,
      daysSinceDelivery: 0,
      builtDay: day,
    };
    this.buildings.set(b.id, b);
    this.buildingAt[i] = b.id;
    if (this.terrain[i] === Terrain.Forest) this.terrain[i] = Terrain.Grass;
    this.version++;
    return b;
  }

  removeBuilding(id: number): Building | undefined {
    const b = this.buildings.get(id);
    if (!b) return undefined;
    this.buildings.delete(id);
    this.buildingAt[this.idx(b.x, b.y)] = -1;
    this.version++;
    return b;
  }

  /** Clears a tile completely, except the highway. Returns what was removed. */
  clearTile(i: number): "road" | "zone" | "park" | "forest" | null {
    const k = this.kind[i];
    if (k === TileKind.Road) {
      if (this.isHighway(i)) return null;
      this.kind[i] = TileKind.Empty;
      this.roadFlags[i] = 0;
      this.networkChanged();
      return "road";
    }
    if (k === TileKind.Zone) {
      this.kind[i] = TileKind.Empty;
      this.zone[i] = Zone.None;
      this.version++;
      return "zone";
    }
    if (k === TileKind.Park) {
      this.kind[i] = TileKind.Empty;
      this.version++;
      return "park";
    }
    if (this.terrain[i] === Terrain.Forest) {
      this.terrain[i] = Terrain.Grass;
      this.version++;
      return "forest";
    }
    return null;
  }

  networkChanged(): void {
    this.networkVersion++;
    this.version++;
    this.recomputeConnectivity();
  }

  /** Flood fill from every highway tile over the road network. */
  recomputeConnectivity(): void {
    this.connected.fill(0);
    const queue: number[] = [];
    for (let i = 0; i < this.count; i++) {
      if (this.isRoad(i) && this.isHighway(i)) {
        this.connected[i] = 1;
        queue.push(i);
      }
    }
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++]!;
      this.forNeighbors(cur, (n) => {
        if (!this.connected[n] && this.isRoad(n)) {
          this.connected[n] = 1;
          queue.push(n);
        }
      });
    }
  }

  // ----------------------------------------------------------- generation

  /**
   * Builds a fresh map: rolling meadows, forests, a river with a lake, and a
   * highway entering from the west edge. The highway is the city's link to the
   * outside world (immigration, imports, exports).
   */
  generate(seed: number): void {
    const rng = new Rng(seed);
    const n1 = valueNoise(seed);
    const n2 = valueNoise(seed + 101);
    const s = this.size;
    this.kind.fill(TileKind.Empty);
    this.zone.fill(Zone.None);
    this.roadFlags.fill(0);
    this.buildingAt.fill(-1);
    this.buildings.clear();
    this.nextBuildingId = 1;

    const highwayY = Math.floor(s / 2) + rng.int(7) - 3;
    // River: a meandering band flowing north-south in the eastern half.
    const riverBase = Math.floor(s * 0.68) + rng.int(6);
    const lakeX = Math.floor(s * 0.25) + rng.int(Math.floor(s * 0.2));
    const lakeY = Math.floor(s * 0.2) + rng.int(6);

    for (let y = 0; y < s; y++) {
      const meander = Math.sin(y / 7 + seed) * 3 + (n2(y / 9, 3.3) - 0.5) * 6;
      const riverX = riverBase + meander;
      const width = 1.6 + n2(y / 5, 8.1) * 1.4;
      for (let x = 0; x < s; x++) {
        const i = this.idx(x, y);
        let t: Terrain = Terrain.Grass;
        if (Math.abs(x - riverX) < width) t = Terrain.Water;
        const lakeD = Math.hypot((x - lakeX) / 1.4, y - lakeY);
        if (lakeD < 3.2 + n1(x / 3, y / 3) * 2) t = Terrain.Water;
        if (t === Terrain.Grass) {
          const f = n1(x / 7, y / 7) * 0.7 + n2(x / 3, y / 3) * 0.3;
          if (f > 0.62) t = Terrain.Forest;
        }
        this.terrain[i] = t;
      }
    }

    // Keep the starting area around the highway open and dry.
    for (let y = highwayY - 7; y <= highwayY + 7; y++) {
      for (let x = 0; x < 20; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        if (this.terrain[i] === Terrain.Water) this.terrain[i] = Terrain.Grass;
        if (x < 14 && this.terrain[i] === Terrain.Forest && rng.chance(0.8)) this.terrain[i] = Terrain.Grass;
      }
    }

    for (let x = 0; x < 10; x++) {
      const i = this.idx(x, highwayY);
      this.terrain[i] = Terrain.Grass;
      this.kind[i] = TileKind.Road;
      this.roadFlags[i] = RoadFlag.Highway;
    }
    this.highwayEntry = this.idx(0, highwayY);
    this.networkChanged();
  }
}
