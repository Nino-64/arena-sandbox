import { describe, expect, it } from "vitest";
import { CITIZENS, TAX } from "../src/core/config";
import { CommuteMode, Zone } from "../src/core/types";
import { Economy } from "../src/sim/economy";
import { RoadRouter } from "../src/sim/pathfinding";
import { Simulation } from "../src/sim/simulation";
import { line, rect } from "./helpers";

describe("transit extends the commute range", () => {
  it("lets residents reach a job too far to drive to", () => {
    const sim = new Simulation(17);
    const w = sim.world;
    w.terrain.fill(0); // flat dry map, so the long road is unbroken
    const hy = w.yOf(w.highwayEntry);
    sim.economy.money = 1e6;
    sim.buildRoads(line(sim, 10, hy, 56, hy));
    sim.zoneTiles([w.idx(11, hy - 1)], Zone.Residential);
    sim.zoneTiles([w.idx(55, hy - 1)], Zone.Industrial);
    for (let d = 0; d < 80; d++) sim.tick();
    const home = [...w.buildings.values()].find((b) => b.zone === Zone.Residential)!;
    expect(home).toBeDefined();
    expect(sim.citizens.stats.population).toBeGreaterThan(0);
    // 44 tiles away: beyond the car limit, so nobody can work there yet.
    expect(sim.citizens.stats.employed).toBe(0);

    const a = w.idx(12, hy);
    const b = w.idx(54, hy);
    sim.placeBusStop(a);
    sim.placeBusStop(b);
    const res = sim.createBusLine([a, b]);
    expect(res.ok).toBe(true);
    sim.setBusCount(res.line!.id, 8);
    for (let d = 0; d < 40; d++) sim.tick();
    const riders = [...sim.citizens.all.values()].filter((c) => c.jobId !== -1);
    expect(riders.length).toBeGreaterThan(0);
    for (const c of riders) {
      expect(c.mode).toBe(CommuteMode.Transit);
      expect(c.commuteCost).toBeGreaterThan(CITIZENS.maxCarCommute);
      expect(c.commuteCost).toBeLessThanOrEqual(CITIZENS.maxTransitCommute);
    }
  });
});

describe("congestion-aware routing", () => {
  it("routes around a jammed road", () => {
    const sim = new Simulation(23);
    const w = sim.world;
    w.terrain.fill(0);
    const hy = w.yOf(w.highwayEntry);
    sim.economy.money = 1e6;
    // Two parallel streets between x=10 and x=20, joined at both ends.
    sim.buildRoads(line(sim, 10, hy, 20, hy));
    sim.buildRoads(line(sim, 10, hy, 10, hy + 2));
    sim.buildRoads(line(sim, 10, hy + 2, 20, hy + 2));
    sim.buildRoads(line(sim, 20, hy + 2, 20, hy));
    const router = new RoadRouter(w);
    const cost = (i: number) => sim.traffic.carCost(i);
    router.run(w.idx(10, hy), cost);
    const free = router.pathTo(w.idx(20, hy))!;
    expect([...free].every((i) => w.yOf(i) === hy)).toBe(true);
    for (let x = 12; x <= 18; x++) sim.traffic.commute[w.idx(x, hy)] = 600;
    router.run(w.idx(10, hy), cost);
    const detour = router.pathTo(w.idx(20, hy))!;
    expect([...detour].some((i) => w.yOf(i) === hy + 2)).toBe(true);
  });
});

describe("economy", () => {
  it("clamps taxes and archives balanced monthly reports", () => {
    const e = new Economy();
    e.setTax(Zone.Residential, 99);
    e.setTax(Zone.Commercial, -4);
    expect(e.taxes[Zone.Residential]).toBe(TAX.max);
    expect(e.taxes[Zone.Commercial]).toBe(TAX.min);
    const start = e.money;
    e.earn("residential", 300);
    e.earn("transit", 50);
    e.pay("roads", 120);
    expect(e.spend(1000)).toBe(true);
    expect(e.spend(1e9)).toBe(false);
    const report = e.closeMonth(0, 2030, 42);
    expect(Economy.totalIncome(report)).toBe(350);
    expect(Economy.totalExpenses(report)).toBe(120);
    expect(report.construction).toBe(1000);
    expect(report.balance).toBe(start + 350 - 120 - 1000);
    expect(e.current.income.residential).toBe(0);
  });

  it("raises residential demand when jobs wait and lowers it with heavy taxes", () => {
    const sim = new Simulation(31);
    const w = sim.world;
    const hy = w.yOf(w.highwayEntry);
    sim.economy.money = 1e6;
    sim.buildRoads(line(sim, 10, hy, 16, hy));
    sim.zoneTiles(rect(sim, 11, hy + 1, 15, hy + 1), Zone.Industrial);
    for (let d = 0; d < 40; d++) sim.tick();
    const lowTax = sim.growth.demand.residential;
    expect(lowTax).toBeGreaterThan(0.3);
    sim.economy.setTax(Zone.Residential, 20);
    for (let d = 0; d < 30; d++) sim.tick();
    expect(sim.growth.demand.residential).toBeLessThan(lowTax);
  });
});
