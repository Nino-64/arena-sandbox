import type { World } from "./world";

/** Binary min-heap keyed by float priority, storing int node ids. Allocation-free once grown. */
export class MinHeap {
  private nodes: Int32Array;
  private prio: Float64Array;
  size = 0;

  constructor(capacity: number) {
    this.nodes = new Int32Array(capacity);
    this.prio = new Float64Array(capacity);
  }

  clear(): void {
    this.size = 0;
  }

  push(node: number, priority: number): void {
    if (this.size === this.nodes.length) this.grow();
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= priority) break;
      this.nodes[i] = this.nodes[parent]!;
      this.prio[i] = this.prio[parent]!;
      i = parent;
    }
    this.nodes[i] = node;
    this.prio[i] = priority;
  }

  /** Pops the minimum node. Read `lastPriority` for its key. */
  pop(): number {
    const top = this.nodes[0]!;
    this.lastPriority = this.prio[0]!;
    const n = --this.size;
    if (n > 0) {
      const node = this.nodes[n]!;
      const p = this.prio[n]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && this.prio[r]! < this.prio[l]! ? r : l;
        if (this.prio[c]! >= p) break;
        this.nodes[i] = this.nodes[c]!;
        this.prio[i] = this.prio[c]!;
        i = c;
      }
      this.nodes[i] = node;
      this.prio[i] = p;
    }
    return top;
  }

  lastPriority = 0;

  private grow(): void {
    const nodes = new Int32Array(this.nodes.length * 2);
    nodes.set(this.nodes);
    const prio = new Float64Array(this.prio.length * 2);
    prio.set(this.prio);
    this.nodes = nodes;
    this.prio = prio;
  }
}

export interface PathField {
  dist: Float64Array;
  prev: Int32Array;
}

/**
 * Single-source Dijkstra over road tiles. `enterCost(i)` is the cost of
 * driving onto tile i (congestion-aware for cars). Unreached tiles stay at +Infinity.
 */
export class RoadRouter {
  private readonly heap: MinHeap;
  readonly field: PathField;

  constructor(private readonly world: World) {
    this.heap = new MinHeap(world.count);
    this.field = {
      dist: new Float64Array(world.count),
      prev: new Int32Array(world.count),
    };
  }

  run(source: number, enterCost: (i: number) => number, maxCost = Infinity): PathField {
    const { dist, prev } = this.field;
    const w = this.world;
    dist.fill(Infinity);
    prev.fill(-1);
    this.heap.clear();
    if (source < 0 || !w.isRoad(source)) return this.field;
    dist[source] = 0;
    this.heap.push(source, 0);
    const size = w.size;
    while (this.heap.size > 0) {
      const cur = this.heap.pop();
      const d = this.heap.lastPriority;
      if (d > dist[cur]! || d > maxCost) continue;
      const x = cur % size;
      // Unrolled neighbour loop: north, east, south, west.
      if (cur >= size) this.relax(cur, cur - size, d, enterCost);
      if (x < size - 1) this.relax(cur, cur + 1, d, enterCost);
      if (cur < w.count - size) this.relax(cur, cur + size, d, enterCost);
      if (x > 0) this.relax(cur, cur - 1, d, enterCost);
    }
    return this.field;
  }

  private relax(from: number, to: number, d: number, enterCost: (i: number) => number): void {
    if (!this.world.isRoad(to)) return;
    const nd = d + enterCost(to);
    if (nd < this.field.dist[to]!) {
      this.field.dist[to] = nd;
      this.field.prev[to] = from;
      this.heap.push(to, nd);
    }
  }

  /** Path from the last run's source to `target`, inclusive of both ends. */
  pathTo(target: number): Int32Array | null {
    const { dist, prev } = this.field;
    if (target < 0 || !Number.isFinite(dist[target]!)) return null;
    let len = 1;
    for (let c = target; prev[c] !== -1; c = prev[c]!) len++;
    const out = new Int32Array(len);
    let k = len - 1;
    for (let c = target; c !== -1; c = prev[c]!) out[k--] = c;
    return out;
  }
}

/** Unweighted shortest road path between two tiles (used for bus lines). */
export function shortestRoadPath(router: RoadRouter, from: number, to: number): Int32Array | null {
  router.run(from, () => 1);
  return router.pathTo(to);
}
