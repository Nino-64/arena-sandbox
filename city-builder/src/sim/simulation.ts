import {
  COSTS,
  DAY_MS,
  DAYS_PER_MONTH,
  ECONOMY,
  ENV,
  MONTHS_PER_YEAR,
  SPEED_MULTIPLIERS,
  START_YEAR,
  UPKEEP_PER_DAY,
} from "../core/config";
import { Rng } from "../core/rng";
import {
  Building,
  BusLine,
  MonthReport,
  Notification,
  NotifyLevel,
  TileKind,
  Zone,
  ZoneType,
} from "../core/types";
import { Citizens } from "./citizens";
import type { SimContext } from "./context";
import { Economy } from "./economy";
import { Environment } from "./environment";
import { Growth } from "./growth";
import { RoadRouter } from "./pathfinding";
import { Production } from "./production";
import { Traffic } from "./traffic";
import { Transit } from "./transit";
import { World } from "./world";

export interface ActionResult {
  ok: boolean;
  cost: number;
  message?: string;
  changed: number;
}

export interface SimEvents {
  onNotify?: (n: Notification) => void;
  onMonth?: (report: MonthReport) => void;
  onBuildingEvent?: (b: Building, kind: "built" | "leveled" | "abandoned" | "removed") => void;
}

const MILESTONES = [50, 250, 500, 1000, 2500, 5000, 10000];
const NAME_A = ["Belle", "Clair", "Haut", "Mont", "Val", "Port", "Saint-", "Bois", "Roche", "Fleur"];
const NAME_B = ["rive", "mont", "lac", "ville", "champ", "fort", "bourg", "pré", "val", "marais"];

/**
 * The orchestrator. Owns every system, advances time, and is the single
 * entry point for player actions, so costs and side effects stay consistent
 * no matter which UI or test drives it.
 */
export class Simulation {
  readonly world: World;
  readonly traffic: Traffic;
  readonly transit: Transit;
  readonly env: Environment;
  readonly economy: Economy;
  readonly router: RoadRouter;
  readonly citizens: Citizens;
  readonly production: Production;
  readonly growth: Growth;
  readonly ctx: SimContext;
  rng: Rng;
  seed: number;
  cityName: string;

  day = 0;
  speed = 1;
  private accumulator = 0;
  notifications: Notification[] = [];
  private nextNotifyId = 1;
  private milestones = new Set<number>();
  private busLoadVersion = -1;
  events: SimEvents = {};

  constructor(seed = Date.now() % 1_000_000) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.world = new World();
    this.traffic = new Traffic(this.world);
    this.transit = new Transit(this.world);
    this.env = new Environment(this.world);
    this.economy = new Economy();
    this.router = new RoadRouter(this.world);
    this.ctx = {
      world: this.world,
      traffic: this.traffic,
      transit: this.transit,
      env: this.env,
      economy: this.economy,
      rng: this.rng,
      router: this.router,
      day: () => this.day,
      notify: (text, level) => this.notify(text, level),
    };
    this.citizens = new Citizens(this.ctx);
    this.production = new Production(this.ctx);
    this.growth = new Growth(this.ctx, this.citizens);
    this.cityName = this.makeName();
    this.newGame(seed);
  }

  newGame(seed: number): void {
    this.seed = seed;
    this.rng.setState(seed);
    this.world.generate(seed);
    this.traffic.reset();
    this.transit.reset();
    this.economy.reset();
    this.citizens.reset();
    this.production.reset();
    this.growth.reset();
    this.day = 0;
    this.accumulator = 0;
    this.notifications = [];
    this.milestones.clear();
    this.busLoadVersion = -1;
    this.cityName = this.makeName();
    this.env.recompute(this.traffic, this.transit);
  }

  private makeName(): string {
    return this.rng.pick(NAME_A) + this.rng.pick(NAME_B);
  }

  // ----------------------------------------------------------------- time

  get date(): { day: number; month: number; year: number } {
    const monthIndex = Math.floor(this.day / DAYS_PER_MONTH);
    return {
      day: (this.day % DAYS_PER_MONTH) + 1,
      month: monthIndex % MONTHS_PER_YEAR,
      year: START_YEAR + Math.floor(monthIndex / MONTHS_PER_YEAR),
    };
  }

  setSpeed(index: number): void {
    this.speed = Math.max(0, Math.min(SPEED_MULTIPLIERS.length - 1, index));
  }

  /** Advances by real elapsed milliseconds. Returns simulated days elapsed (fractional). */
  update(realMs: number): number {
    const mult = SPEED_MULTIPLIERS[this.speed] ?? 0;
    if (mult === 0) return 0;
    const ms = Math.min(realMs, 250) * mult;
    const dtDays = ms / DAY_MS;
    this.moveVehicles(dtDays);
    this.accumulator += ms;
    let steps = 0;
    while (this.accumulator >= DAY_MS && steps < 4) {
      this.accumulator -= DAY_MS;
      this.tick();
      steps++;
    }
    if (steps === 4) this.accumulator = 0;
    return dtDays;
  }

  /** Fraction of the current day elapsed, for smooth animation. */
  get dayFraction(): number {
    return this.accumulator / DAY_MS;
  }

  moveVehicles(dtDays: number): void {
    this.production.update(dtDays);
    this.transit.update(dtDays, this.traffic);
  }

  /** One simulated day. */
  tick(): void {
    this.day++;
    if (this.busLoadVersion !== this.transit.version) {
      this.traffic.setBusLoad(this.transit.busLoadPaths());
      this.busLoadVersion = this.transit.version;
    }
    this.citizens.plan();
    this.production.daily();
    this.citizens.daily();
    this.growth.updateDemand(this.production.stats);
    this.citizens.immigrate(this.growth.demand.residential);

    for (const b of this.growth.develop()) this.events.onBuildingEvent?.(b, "built");
    const { leveled, abandoned, recovered } = this.growth.evolve();
    for (const b of leveled) {
      this.events.onBuildingEvent?.(b, "leveled");
      if (b.level === 3 && this.rng.chance(0.35)) {
        const label = b.zone === Zone.Residential ? "Une tour résidentielle" : b.zone === Zone.Commercial ? "Un centre d'affaires" : "Un complexe industriel";
        this.notify(`${label} vient d'atteindre le niveau 3.`, "good");
      }
    }
    for (const b of abandoned) {
      this.citizens.onBuildingLost(b);
      this.events.onBuildingEvent?.(b, "abandoned");
    }
    if (abandoned.length > 0) this.notify(`${abandoned.length} bâtiment(s) abandonné(s) : plus d'accès routier à l'autoroute.`, "bad");
    for (const b of recovered) this.events.onBuildingEvent?.(b, "built");

    this.collectDaily();
    this.traffic.endOfDay();
    if (this.day % ENV.envRecomputeDays === 0) this.env.recompute(this.traffic, this.transit);
    this.checkMilestones();

    if (this.day % DAYS_PER_MONTH === 0) this.closeMonth();
  }

  private collectDaily(): void {
    const e = this.economy;
    // Residential tax on wages, weighted by the level of each job.
    let wages = 0;
    for (const c of this.citizens.all.values()) {
      if (c.jobId === -1) continue;
      const job = this.world.buildings.get(c.jobId);
      wages += ECONOMY.wage * (1 + 0.25 * ((job?.level ?? 1) - 1));
    }
    e.earn("residential", wages * e.rate(Zone.Residential));

    let rides = 0;
    for (const line of this.transit.lines) {
      rides += line.ridersToday;
      line.ridersMonth += line.ridersToday;
      line.ridersToday = 0;
    }
    e.earn("transit", rides * ECONOMY.busFare);

    let roads = 0;
    let parks = 0;
    let stops = 0;
    for (let i = 0; i < this.world.count; i++) {
      const k = this.world.kind[i];
      if (k === TileKind.Road && !this.world.isHighway(i)) {
        roads++;
        if (this.world.isBusStop(i)) stops++;
      } else if (k === TileKind.Park) parks++;
    }
    e.pay("roads", roads * UPKEEP_PER_DAY.road);
    e.pay("parks", parks * UPKEEP_PER_DAY.park);
    e.pay("transit", stops * UPKEEP_PER_DAY.busStop + this.transit.totalBuses() * UPKEEP_PER_DAY.bus);
  }

  private closeMonth(): void {
    const prev = this.date;
    // `date` already points at the new month; report the one that just ended.
    const monthIndex = Math.floor((this.day - 1) / DAYS_PER_MONTH);
    const report = this.economy.closeMonth(monthIndex % MONTHS_PER_YEAR, START_YEAR + Math.floor(monthIndex / MONTHS_PER_YEAR), this.citizens.stats.population);
    for (const line of this.transit.lines) line.ridersMonth = 0;
    const net = Economy.totalIncome(report) - Economy.totalExpenses(report);
    if (this.economy.money < 0) this.notify("Le budget est dans le rouge ! Augmentez les impôts ou réduisez les dépenses.", "bad");
    else if (net < 0 && prev.month % 3 === 0) this.notify(`Déficit d'exploitation ce mois-ci : ${Math.round(net).toLocaleString("fr-FR")} $.`, "warn");
    this.events.onMonth?.(report);
  }

  /** Marks milestones already reached (after loading a save) without announcing them. */
  restoreMilestones(population: number): void {
    for (const m of MILESTONES) if (population >= m) this.milestones.add(m);
  }

  private checkMilestones(): void {
    const pop = this.citizens.stats.population;
    for (const m of MILESTONES) {
      if (pop >= m && !this.milestones.has(m)) {
        this.milestones.add(m);
        this.notify(`Cap des ${m.toLocaleString("fr-FR")} habitants franchi !`, "good");
      }
    }
  }

  notify(text: string, level: NotifyLevel): void {
    const n: Notification = { id: this.nextNotifyId++, text, level, day: this.day };
    this.notifications.push(n);
    if (this.notifications.length > 30) this.notifications.shift();
    this.events.onNotify?.(n);
  }

  // -------------------------------------------------------------- actions

  /** Cost of building roads on these tiles (skips tiles that can't take a road). */
  roadCost(tiles: number[]): { cost: number; valid: number[] } {
    const valid = tiles.filter(
      (i) => this.world.canBuildOn(i) && !this.world.isRoad(i) && this.world.buildingAt[i] === -1 && this.world.kind[i] !== TileKind.Park,
    );
    return { cost: valid.length * COSTS.road, valid };
  }

  buildRoads(tiles: number[]): ActionResult {
    const { cost, valid } = this.roadCost(tiles);
    if (valid.length === 0) return { ok: false, cost: 0, changed: 0, message: "Rien à construire ici." };
    if (!this.economy.spend(cost)) return { ok: false, cost, changed: 0, message: "Fonds insuffisants." };
    for (const i of valid) this.world.placeRoad(i);
    this.afterNetworkChange();
    return { ok: true, cost, changed: valid.length };
  }

  zoneCost(tiles: number[], z: ZoneType): { cost: number; valid: number[] } {
    const w = this.world;
    const valid = tiles.filter(
      (i) =>
        w.canBuildOn(i) &&
        w.buildingAt[i] === -1 &&
        (w.kind[i] === TileKind.Empty || (w.kind[i] === TileKind.Zone && w.zone[i] !== z)),
    );
    return { cost: valid.length * COSTS.zone, valid };
  }

  zoneTiles(tiles: number[], z: ZoneType): ActionResult {
    const { cost, valid } = this.zoneCost(tiles, z);
    if (valid.length === 0) return { ok: false, cost: 0, changed: 0, message: "Aucune parcelle libre dans la sélection." };
    if (!this.economy.spend(cost)) return { ok: false, cost, changed: 0, message: "Fonds insuffisants." };
    for (const i of valid) this.world.placeZone(i, z);
    return { ok: true, cost, changed: valid.length };
  }

  placePark(tile: number): ActionResult {
    const w = this.world;
    if (!w.canBuildOn(tile) || w.kind[tile] !== TileKind.Empty) return { ok: false, cost: 0, changed: 0, message: "Un parc se place sur un terrain libre." };
    if (!this.economy.spend(COSTS.park)) return { ok: false, cost: COSTS.park, changed: 0, message: "Fonds insuffisants." };
    w.placePark(tile);
    return { ok: true, cost: COSTS.park, changed: 1 };
  }

  placeBusStop(tile: number): ActionResult {
    const w = this.world;
    if (!w.isRoad(tile) || w.isHighway(tile)) return { ok: false, cost: 0, changed: 0, message: "Un arrêt se place sur une route (pas sur l'autoroute)." };
    if (w.isBusStop(tile)) return { ok: false, cost: 0, changed: 0, message: "Il y a déjà un arrêt ici." };
    if (!this.economy.spend(COSTS.busStop)) return { ok: false, cost: COSTS.busStop, changed: 0, message: "Fonds insuffisants." };
    w.setBusStop(tile, true);
    return { ok: true, cost: COSTS.busStop, changed: 1 };
  }

  createBusLine(stops: number[]): ActionResult & { line?: BusLine } {
    const cost = COSTS.busLine;
    if (!this.economy.canAfford(cost)) return { ok: false, cost, changed: 0, message: "Fonds insuffisants." };
    const res = this.transit.createLine(stops);
    if (typeof res === "string") return { ok: false, cost: 0, changed: 0, message: res };
    this.economy.spend(cost + res.buses * COSTS.bus);
    return { ok: true, cost: cost + res.buses * COSTS.bus, changed: 1, line: res };
  }

  setBusCount(lineId: number, buses: number): ActionResult {
    const line = this.transit.lineById(lineId);
    if (!line) return { ok: false, cost: 0, changed: 0 };
    const added = Math.max(0, buses - line.buses);
    const cost = added * COSTS.bus;
    if (!this.economy.spend(cost)) return { ok: false, cost, changed: 0, message: "Fonds insuffisants." };
    this.transit.setBusCount(lineId, buses);
    return { ok: true, cost, changed: 1 };
  }

  deleteBusLine(lineId: number): void {
    this.transit.deleteLine(lineId);
  }

  bulldozeCost(tiles: number[]): number {
    let cost = 0;
    for (const i of tiles) {
      if (this.world.buildingAt[i] !== -1) cost += COSTS.bulldozeBuilding;
      else if (this.world.kind[i] !== TileKind.Empty && !this.world.isHighway(i)) cost += COSTS.bulldozeTile;
      else if (this.world.terrain[i] === 2) cost += COSTS.bulldozeTile;
    }
    return cost;
  }

  bulldoze(tiles: number[]): ActionResult {
    const cost = this.bulldozeCost(tiles);
    if (cost === 0) return { ok: false, cost: 0, changed: 0, message: "Rien à démolir." };
    if (!this.economy.spend(cost)) return { ok: false, cost, changed: 0, message: "Fonds insuffisants." };
    let changed = 0;
    let roadsChanged = false;
    for (const i of tiles) {
      const bid = this.world.buildingAt[i]!;
      if (bid !== -1) {
        const b = this.world.buildings.get(bid);
        if (b) {
          this.citizens.onBuildingLost(b);
          this.production.onBuildingLost(b.id);
          this.world.removeBuilding(b.id);
          this.events.onBuildingEvent?.(b, "removed");
        }
      }
      const wasStop = this.world.isBusStop(i);
      const removed = this.world.clearTile(i);
      if (removed) changed++;
      if (removed === "road") {
        roadsChanged = true;
        if (wasStop) this.transit.onStopRemoved(i);
      }
    }
    if (roadsChanged) this.afterNetworkChange();
    return { ok: true, cost, changed };
  }

  removeBusStop(tile: number): ActionResult {
    if (!this.world.isBusStop(tile)) return { ok: false, cost: 0, changed: 0 };
    this.world.setBusStop(tile, false);
    this.transit.onStopRemoved(tile);
    return { ok: true, cost: 0, changed: 1 };
  }

  private afterNetworkChange(): void {
    this.transit.rebuild();
    this.production.onNetworkChanged();
  }

  // ---------------------------------------------------------------- stats

  overview() {
    const st = this.citizens.stats;
    const traffic = this.traffic.stats();
    let buildings = 0;
    let jobs = 0;
    for (const b of this.world.buildings.values()) {
      buildings++;
      if (b.zone !== Zone.Residential && !b.abandoned) jobs += b.occupants;
    }
    return {
      population: st.population,
      employed: st.employed,
      unemployed: st.unemployed,
      employmentRate: st.population ? st.employed / st.population : 0,
      happiness: st.avgHappiness,
      avgCommute: st.avgCommute,
      carCommuters: st.carCommuters,
      transitCommuters: st.transitCommuters,
      buildings,
      filledJobs: jobs,
      traffic,
      supply: this.production.stats,
      demand: this.growth.demand,
    };
  }
}

export { Economy };
