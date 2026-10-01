import { Zone } from "../src/core/types";
import { Simulation } from "../src/sim/simulation";

/** Tiles of a straight or L-shaped run between two points (inclusive). */
export function line(sim: Simulation, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  let x = x0;
  let y = y0;
  out.push(sim.world.idx(x, y));
  while (x !== x1) {
    x += sx;
    out.push(sim.world.idx(x, y));
  }
  while (y !== y1) {
    y += sy;
    out.push(sim.world.idx(x, y));
  }
  return out;
}

export function rect(sim: Simulation, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push(sim.world.idx(x, y));
  return out;
}

/** A small but complete town next to the highway: homes, shops and factories. */
export function buildTestCity(sim: Simulation): { hy: number } {
  const hy = sim.world.yOf(sim.world.highwayEntry);
  sim.economy.money = 1_000_000;
  sim.buildRoads(line(sim, 10, hy, 19, hy));
  for (const x of [11, 14, 17]) sim.buildRoads(line(sim, x, hy - 6, x, hy + 6));
  sim.buildRoads(line(sim, 11, hy - 6, 17, hy - 6));
  sim.buildRoads(line(sim, 11, hy + 6, 17, hy + 6));
  sim.zoneTiles([...rect(sim, 12, hy - 5, 13, hy - 1), ...rect(sim, 15, hy - 5, 16, hy - 1)], Zone.Residential);
  sim.zoneTiles(rect(sim, 12, hy + 1, 13, hy + 5), Zone.Commercial);
  sim.zoneTiles([...rect(sim, 15, hy + 1, 16, hy + 5), ...rect(sim, 18, hy + 1, 18, hy + 5)], Zone.Industrial);
  return { hy };
}
