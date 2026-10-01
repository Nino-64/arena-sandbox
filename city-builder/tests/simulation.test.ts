import { describe, expect, it } from "vitest";
import { COSTS } from "../src/core/config";
import { CommuteMode, Zone } from "../src/core/types";
import { RoadRouter } from "../src/sim/pathfinding";
import { deserialize, serialize } from "../src/sim/save";
import { Simulation } from "../src/sim/simulation";
import { buildTestCity, line } from "./helpers";

describe("world & roads", () => {
  it("connects roads to the highway and routes around obstacles", () => {
    const sim = new Simulation(7);
    const hy = sim.world.yOf(sim.world.highwayEntry);
    sim.buildRoads(line(sim, 10, hy, 15, hy - 4));
    const end = sim.world.idx(15, hy - 4);
    expect(sim.world.connected[end]).toBe(1);
    const router = new RoadRouter(sim.world);
    router.run(sim.world.highwayEntry, () => 1);
    const path = router.pathTo(end)!;
    expect(path[0]).toBe(sim.world.highwayEntry);
    expect(path[path.length - 1]).toBe(end);
    expect(path.length).toBe(10 + 6 + 4);
  });

  it("charges construction and refuses work when broke", () => {
    const sim = new Simulation(3);
    const hy = sim.world.yOf(sim.world.highwayEntry);
    const before = sim.economy.money;
    const res = sim.buildRoads(line(sim, 10, hy, 14, hy));
    expect(res.ok).toBe(true);
    expect(sim.economy.money).toBe(before - 5 * COSTS.road);
    sim.economy.money = 10;
    expect(sim.buildRoads(line(sim, 10, hy + 1, 14, hy + 1)).ok).toBe(false);
    expect(sim.economy.money).toBe(10);
  });

  it("abandons buildings cut off from the highway", () => {
    const sim = new Simulation(11);
    const { hy } = buildTestCity(sim);
    for (let d = 0; d < 120; d++) sim.tick();
    expect(sim.world.buildings.size).toBeGreaterThan(0);
    // Cut the only link between the highway and the town.
    sim.bulldoze([sim.world.idx(10, hy)]);
    for (let d = 0; d < 60; d++) sim.tick();
    const anyAlive = [...sim.world.buildings.values()].some((b) => !b.abandoned);
    expect(anyAlive).toBe(false);
    expect(sim.citizens.stats.population).toBe(0);
  });
});

describe("full city loop", () => {
  const sim = new Simulation(42);
  buildTestCity(sim);
  let produced = 0;
  let delivered = 0;
  let sold = 0;
  let maxTrucks = 0;
  for (let d = 0; d < 400; d++) {
    sim.tick();
    for (let f = 0; f < 8; f++) sim.moveVehicles(1 / 8);
    produced += sim.production.stats.produced;
    delivered += sim.production.stats.delivered;
    sold += sim.production.stats.sold;
    maxTrucks = Math.max(maxTrucks, sim.production.trucks.length);
  }

  it("grows a population that finds jobs", () => {
    const o = sim.overview();
    expect(o.population).toBeGreaterThan(60);
    expect(o.employed).toBeGreaterThan(30);
    expect(o.happiness).toBeGreaterThan(30);
  });

  it("develops all three zone types and levels some up", () => {
    const zones = new Set([...sim.world.buildings.values()].map((b) => b.zone));
    expect(zones.has(Zone.Residential) && zones.has(Zone.Commercial) && zones.has(Zone.Industrial)).toBe(true);
    expect([...sim.world.buildings.values()].some((b) => b.level >= 2)).toBe(true);
  });

  it("moves goods from factories to shops by truck and sells them", () => {
    expect(produced).toBeGreaterThan(100);
    expect(maxTrucks).toBeGreaterThan(0);
    expect(delivered).toBeGreaterThan(50);
    expect(sold).toBeGreaterThan(50);
  });

  it("puts commuter traffic on the roads", () => {
    let maxLoad = 0;
    for (let i = 0; i < sim.world.count; i++) if (sim.world.isRoad(i)) maxLoad = Math.max(maxLoad, sim.traffic.load(i));
    expect(maxLoad).toBeGreaterThan(5);
  });

  it("collects taxes and keeps month reports", () => {
    expect(sim.economy.history.length).toBeGreaterThanOrEqual(13);
    const last = sim.economy.history[sim.economy.history.length - 1]!;
    expect(last.income.residential).toBeGreaterThan(0);
    expect(last.income.commercial).toBeGreaterThan(0);
    expect(last.income.industrial).toBeGreaterThan(0);
    expect(last.expenses.roads).toBeGreaterThan(0);
  });

  it("survives a save/load round trip", () => {
    const data = JSON.parse(JSON.stringify(serialize(sim)));
    const copy = new Simulation(1);
    deserialize(copy, data);
    expect(copy.world.buildings.size).toBe(sim.world.buildings.size);
    expect(copy.citizens.all.size).toBe(sim.citizens.all.size);
    expect(copy.economy.money).toBeCloseTo(sim.economy.money);
    expect(copy.cityName).toBe(sim.cityName);
    for (let d = 0; d < 30; d++) copy.tick();
    expect(copy.citizens.stats.employed).toBeGreaterThan(0);
  });
});

describe("transit", () => {
  it("builds a line, computes stop-to-stop trips and carries riders when roads are jammed", () => {
    const sim = new Simulation(42);
    const { hy } = buildTestCity(sim);
    for (let d = 0; d < 200; d++) sim.tick();
    const a = sim.world.idx(14, hy - 4);
    const b = sim.world.idx(14, hy + 4);
    expect(sim.placeBusStop(a).ok).toBe(true);
    expect(sim.placeBusStop(b).ok).toBe(true);
    const res = sim.createBusLine([a, b]);
    expect(res.ok).toBe(true);
    expect(sim.transit.buses.length).toBeGreaterThan(0);

    const reach = sim.transit.reachFrom(sim.world.idx(13, hy - 4))!;
    const trip = sim.transit.tripTo(reach, sim.world.idx(13, hy + 4))!;
    expect(Number.isFinite(trip.cost)).toBe(true);
    expect(sim.transit.linesBetween(trip.boardStop, trip.alightStop)).toEqual([res.line!.id]);

    // Gridlock every road: cars become far more expensive than the bus.
    for (let i = 0; i < sim.world.count; i++) if (sim.world.isRoad(i)) sim.traffic.freight[i] = 400;
    for (const bld of sim.world.buildings.values()) bld.lastPlannedDay = -1_000_000;
    for (const c of sim.citizens.all.values()) c.lastRouteDay = -1_000_000;
    for (let k = 0; k < 10; k++) sim.citizens.plan();
    const riders = [...sim.citizens.all.values()].filter((c) => c.mode === CommuteMode.Transit);
    expect(riders.length).toBeGreaterThan(0);
    sim.citizens.daily();
    expect(sim.transit.lines[0]!.ridersToday).toBeGreaterThan(0);
  });

  it("drops a stop from its line when the road is bulldozed", () => {
    const sim = new Simulation(5);
    const hy = sim.world.yOf(sim.world.highwayEntry);
    sim.economy.money = 1e6;
    sim.buildRoads(line(sim, 10, hy, 18, hy));
    const s = [12, 14, 16].map((x) => sim.world.idx(x, hy));
    s.forEach((t) => sim.placeBusStop(t));
    expect(sim.createBusLine(s).ok).toBe(true);
    sim.bulldoze([s[2]!]);
    expect(sim.transit.lines[0]!.stops).toEqual([s[0], s[1]]);
    sim.bulldoze([s[1]!]);
    expect(sim.transit.lines.length).toBe(0);
  });
});
