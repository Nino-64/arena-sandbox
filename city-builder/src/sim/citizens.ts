import { CAPACITY, CITIZENS, PRODUCTION, TAX } from "../core/config";
import { Building, Citizen, CommuteMode, Zone } from "../core/types";
import type { SimContext } from "./context";
import type { StopReach } from "./transit";

const TRIPS_PER_COMMUTE = 2;

export function capacityOf(b: Building): number {
  if (b.abandoned) return 0;
  if (b.zone === Zone.Residential) return CAPACITY.residential[b.level];
  if (b.zone === Zone.Commercial) return CAPACITY.commercial[b.level];
  return CAPACITY.industrial[b.level];
}

export interface CitizenStats {
  population: number;
  employed: number;
  unemployed: number;
  carCommuters: number;
  transitCommuters: number;
  avgHappiness: number;
  avgCommute: number;
  /** Residents without any reachable job (too far or disconnected). */
  stranded: number;
}

/**
 * Citizen agents: they move into homes, look for the best reachable job,
 * pick a commute mode (car or bus) by cost, and react to taxes, pollution,
 * shopping, commute length and parks. Unhappy citizens eventually leave.
 */
export class Citizens {
  readonly all = new Map<number, Citizen>();
  /** Residents by home building id. */
  readonly residents = new Map<number, number[]>();
  nextId = 1;
  stats: CitizenStats = emptyStats();
  /** Last network/transit versions seen, to refresh routes after edits. */
  private seenNetwork = -1;
  private seenTransit = -1;

  constructor(private readonly ctx: SimContext) {}

  reset(): void {
    this.all.clear();
    this.residents.clear();
    this.nextId = 1;
    this.stats = emptyStats();
  }

  residentsOf(homeId: number): number[] {
    return this.residents.get(homeId) ?? [];
  }

  moveIn(home: Building): Citizen | null {
    if (home.zone !== Zone.Residential || home.occupants >= capacityOf(home)) return null;
    const c: Citizen = {
      id: this.nextId++,
      homeId: home.id,
      jobId: -1,
      happiness: 62,
      mode: CommuteMode.None,
      commuteCost: 0,
      route: null,
      lines: [],
      lastRouteDay: -1_000_000,
      unhappyDays: 0,
    };
    this.all.set(c.id, c);
    const list = this.residents.get(home.id);
    if (list) list.push(c.id);
    else this.residents.set(home.id, [c.id]);
    home.occupants++;
    // Plan this home soon so the newcomer looks for work quickly.
    home.lastPlannedDay = Math.min(home.lastPlannedDay, this.ctx.day() - CITIZENS.routeRefreshDays);
    return c;
  }

  /** Removes a citizen from the city entirely. */
  leave(c: Citizen): void {
    this.quitJob(c);
    this.all.delete(c.id);
    const home = this.ctx.world.buildings.get(c.homeId);
    if (home) home.occupants = Math.max(0, home.occupants - 1);
    const list = this.residents.get(c.homeId);
    if (list) {
      const k = list.indexOf(c.id);
      if (k >= 0) list.splice(k, 1);
      if (list.length === 0) this.residents.delete(c.homeId);
    }
  }

  quitJob(c: Citizen): void {
    this.clearCommute(c);
    if (c.jobId !== -1) {
      const job = this.ctx.world.buildings.get(c.jobId);
      if (job) job.occupants = Math.max(0, job.occupants - 1);
      c.jobId = -1;
    }
  }

  private clearCommute(c: Citizen): void {
    if (c.route) this.ctx.traffic.removeRoute(c.route, TRIPS_PER_COMMUTE);
    c.route = null;
    c.lines = [];
    c.mode = CommuteMode.None;
    c.commuteCost = 0;
  }

  /** A building is gone (bulldozed) or abandoned: evict residents or fire workers. */
  onBuildingLost(b: Building): void {
    if (b.zone === Zone.Residential) {
      for (const id of [...this.residentsOf(b.id)]) {
        const c = this.all.get(id);
        if (c) this.leave(c);
      }
      this.residents.delete(b.id);
      b.occupants = 0;
    } else {
      for (const c of this.all.values()) if (c.jobId === b.id) this.quitJob(c);
      b.occupants = 0;
    }
  }

  /** Workers beyond a job building's capacity are let go (after a downgrade). */
  trimWorkers(b: Building): void {
    let excess = b.occupants - capacityOf(b);
    if (excess <= 0) return;
    for (const c of this.all.values()) {
      if (excess <= 0) break;
      if (c.jobId === b.id) {
        this.quitJob(c);
        excess--;
      }
    }
  }

  // ------------------------------------------------------------ planner

  /**
   * Processes a budget of home buildings per day: one Dijkstra per home
   * (congestion-aware), then every resident there gets a job and commute.
   */
  plan(): void {
    const { world, transit } = this.ctx;
    const day = this.ctx.day();
    if (world.networkVersion !== this.seenNetwork || transit.version !== this.seenTransit) {
      // Roads or bus lines changed: every commute must be re-evaluated soon.
      this.seenNetwork = world.networkVersion;
      this.seenTransit = transit.version;
      for (const b of world.buildings.values()) {
        if (b.zone === Zone.Residential) b.lastPlannedDay = Math.min(b.lastPlannedDay, day - CITIZENS.routeRefreshDays);
      }
    }
    const homes: Building[] = [];
    for (const b of world.buildings.values()) {
      if (b.zone === Zone.Residential && b.occupants > 0 && day - b.lastPlannedDay >= 1) homes.push(b);
    }
    if (homes.length === 0) return;
    homes.sort((a, b) => a.lastPlannedDay - b.lastPlannedDay);
    const jobs = this.jobCandidates();
    const shops = jobs.filter((j) => j.zone === Zone.Commercial);
    let processed = 0;
    for (const home of homes) {
      if (processed >= CITIZENS.plannerBudgetPerDay) break;
      // Only homes that need attention cost a pathfinding run: unemployed
      // residents, stale routes, or no shop yet.
      const ids = this.residentsOf(home.id);
      const needsWork = ids.some((id) => {
        const c = this.all.get(id)!;
        return c.jobId === -1 || day - c.lastRouteDay >= CITIZENS.routeRefreshDays;
      });
      const shopStale = home.shopId === -1 || day - home.lastPlannedDay >= CITIZENS.routeRefreshDays;
      if (needsWork || shopStale) {
        this.planHome(home, jobs, shops);
        processed++;
      }
      home.lastPlannedDay = day;
    }
  }

  private jobCandidates(): Building[] {
    const { world } = this.ctx;
    const out: Building[] = [];
    for (const b of world.buildings.values()) {
      if (b.zone === Zone.Residential || b.abandoned) continue;
      const access = world.accessRoad(world.idx(b.x, b.y));
      if (access === -1 || !world.connected[access]) continue;
      out.push(b);
    }
    return out;
  }

  private planHome(home: Building, jobs: Building[], shops: Building[]): void {
    const { world, traffic, router, transit, rng } = this.ctx;
    const day = this.ctx.day();
    const homeTile = world.idx(home.x, home.y);
    const access = world.accessRoad(homeTile);
    const residents = this.residentsOf(home.id).map((id) => this.all.get(id)!);
    if (access === -1 || !world.connected[access]) {
      for (const c of residents) this.quitJob(c);
      home.shopId = -1;
      return;
    }
    // Remove this home's own car load first, so residents don't avoid their own traffic.
    for (const c of residents) if (c.route) traffic.removeRoute(c.route, TRIPS_PER_COMMUTE);
    const field = router.run(access, (i) => traffic.carCost(i), CITIZENS.maxTransitCommute + 10);
    for (const c of residents) if (c.route) traffic.addRoute(c.route, TRIPS_PER_COMMUTE);
    const reach = transit.reachFrom(homeTile);

    const costTo = (b: Building): { cost: number; mode: CommuteMode; trip: ReturnType<typeof transit.tripTo>; access: number } => {
      const tile = world.idx(b.x, b.y);
      const jobAccess = world.accessRoad(tile);
      const car = jobAccess >= 0 ? field.dist[jobAccess]! + 1 : Infinity;
      const trip = reach ? transit.tripTo(reach as StopReach, tile) : null;
      const transitCost = trip ? trip.cost : Infinity;
      const carOk = car <= CITIZENS.maxCarCommute;
      const transitOk = transitCost <= CITIZENS.maxTransitCommute;
      if (transitOk && (!carOk || transitCost <= car)) return { cost: transitCost, mode: CommuteMode.Transit, trip, access: jobAccess };
      if (carOk) return { cost: car, mode: CommuteMode.Car, trip: null, access: jobAccess };
      return { cost: Infinity, mode: CommuteMode.None, trip: null, access: jobAccess };
    };

    for (const c of residents) {
      const stale = day - c.lastRouteDay >= CITIZENS.routeRefreshDays;
      if (c.jobId !== -1 && !stale) continue;
      if (c.jobId !== -1) {
        const job = world.buildings.get(c.jobId);
        const opt = job && !job.abandoned ? costTo(job) : null;
        if (!opt || opt.mode === CommuteMode.None) {
          this.quitJob(c);
        } else {
          this.applyCommute(c, opt.mode, opt.cost, opt.access, opt.trip);
          continue;
        }
      }
      // Job search: best (cheapest commute, higher level preferred) vacancy.
      let best: Building | null = null;
      let bestScore = Infinity;
      let bestOpt: ReturnType<typeof costTo> | null = null;
      for (const job of jobs) {
        if (job.occupants >= capacityOf(job)) continue;
        const opt = costTo(job);
        if (opt.mode === CommuteMode.None) continue;
        const score = opt.cost - job.level * 2 + rng.next() * 4;
        if (score < bestScore) {
          bestScore = score;
          best = job;
          bestOpt = opt;
        }
      }
      if (best && bestOpt) {
        best.occupants++;
        c.jobId = best.id;
        this.applyCommute(c, bestOpt.mode, bestOpt.cost, bestOpt.access, bestOpt.trip);
      } else {
        c.lastRouteDay = day;
      }
    }

    // Shop: the nearest staffed shop, nudged toward the ones with stock.
    let shop = -1;
    let shopScore = Infinity;
    for (const s of shops) {
      if (s.occupants === 0) continue;
      const opt = costTo(s);
      if (opt.mode === CommuteMode.None || opt.cost > CITIZENS.maxShopDistance) continue;
      // Spread shoppers: a shop already asked for more than it can sell scores worse.
      const sellCap = Math.max(1, s.occupants * PRODUCTION.salesPerWorkerPerDay);
      const crowding = Math.max(0, s.demand / sellCap - 0.7);
      const score = opt.cost + (s.stock < 2 ? 10 : 0) + crowding * 18;
      if (score < shopScore) {
        shopScore = score;
        shop = s.id;
      }
    }
    home.shopId = shop;
  }

  private applyCommute(
    c: Citizen,
    mode: CommuteMode,
    cost: number,
    jobAccess: number,
    trip: { boardStop: number; alightStop: number } | null,
  ): void {
    this.clearCommute(c);
    c.mode = mode;
    c.commuteCost = cost;
    c.lastRouteDay = this.ctx.day();
    if (mode === CommuteMode.Car) {
      const route = this.ctx.router.pathTo(jobAccess);
      if (route) {
        c.route = route;
        this.ctx.traffic.addRoute(route, TRIPS_PER_COMMUTE);
      }
    } else if (mode === CommuteMode.Transit && trip) {
      c.lines = this.ctx.transit.linesBetween(trip.boardStop, trip.alightStop);
    }
  }

  // --------------------------------------------------------------- daily

  /** Happiness, ridership, departures and statistics. */
  daily(): void {
    const { world, env, transit, economy, rng } = this.ctx;
    const taxR = economy.taxes[Zone.Residential];
    const taxMood = (TAX.comfortable - taxR) * 2.2;
    const lineById = new Map(transit.lines.map((l) => [l.id, l]));
    const leaving: Citizen[] = [];
    const s = emptyStats();
    let happySum = 0;
    let commuteSum = 0;
    let commuters = 0;

    // Per-home factors are shared by every resident.
    const homeMood = new Map<number, number>();
    for (const b of world.buildings.values()) {
      if (b.zone !== Zone.Residential) continue;
      const i = world.idx(b.x, b.y);
      let m = 52 + taxMood;
      m += (b.goodsSatisfaction - 0.6) * 25;
      m += Math.min(12, env.parkBonus[i]! * 0.45);
      m -= Math.min(26, env.pollution[i]! * 0.32);
      m += env.landValue[i]! * 0.08;
      if (transit.coverage[i]) m += 4;
      homeMood.set(b.id, m);
    }

    for (const c of this.all.values()) {
      let target = homeMood.get(c.homeId) ?? 40;
      if (c.jobId !== -1) {
        target += 12;
        target -= Math.min(18, Math.max(0, c.commuteCost - 12) * 0.45);
        s.employed++;
        commuteSum += c.commuteCost;
        commuters++;
        if (c.mode === CommuteMode.Car) s.carCommuters++;
        else if (c.mode === CommuteMode.Transit) {
          s.transitCommuters++;
          target += 2;
          for (const id of c.lines) {
            const line = lineById.get(id);
            if (line) line.ridersToday += TRIPS_PER_COMMUTE;
          }
        }
      } else {
        target -= 14;
        s.unemployed++;
        if (this.ctx.day() - c.lastRouteDay < CITIZENS.routeRefreshDays) s.stranded++;
      }
      target = Math.max(0, Math.min(100, target));
      c.happiness += (target - c.happiness) * 0.08;
      happySum += c.happiness;
      if (c.happiness < CITIZENS.leaveHappiness) {
        c.unhappyDays++;
        if (c.unhappyDays > CITIZENS.leaveAfterDays && rng.chance(0.25)) leaving.push(c);
      } else {
        c.unhappyDays = Math.max(0, c.unhappyDays - 2);
      }
    }
    for (const c of leaving) this.leave(c);
    if (leaving.length >= 5) this.ctx.notify(`${leaving.length} habitants mécontents ont quitté la ville.`, "warn");

    s.population = this.all.size;
    s.avgHappiness = s.population ? happySum / (s.population + leaving.length) : 0;
    s.avgCommute = commuters ? commuteSum / commuters : 0;
    this.stats = s;
  }

  /** Newcomers arrive by the highway when homes are free and the city is attractive. */
  immigrate(rDemand: number): void {
    const { world, rng } = this.ctx;
    if (rDemand <= -0.2) return;
    const vacant: Building[] = [];
    let free = 0;
    for (const b of world.buildings.values()) {
      if (b.zone !== Zone.Residential || b.abandoned) continue;
      const access = world.accessRoad(world.idx(b.x, b.y));
      if (access === -1 || !world.connected[access]) continue;
      const room = capacityOf(b) - b.occupants;
      if (room > 0) {
        vacant.push(b);
        free += room;
      }
    }
    if (free === 0) return;
    const attract = Math.max(0, rDemand + 0.35);
    let arrivals = Math.round(CITIZENS.immigrationPerDayBase * attract + free * 0.05 * attract);
    arrivals = Math.min(arrivals, free);
    for (let k = 0; k < arrivals && vacant.length > 0; k++) {
      const idx = rng.int(vacant.length);
      const home = vacant[idx]!;
      this.moveIn(home);
      if (home.occupants >= capacityOf(home)) vacant.splice(idx, 1);
    }
  }

  /** Recomputes commute traffic from scratch (after loading a save). */
  rebuildTraffic(): void {
    this.ctx.traffic.commute.fill(0);
    for (const c of this.all.values()) if (c.route) this.ctx.traffic.addRoute(c.route, TRIPS_PER_COMMUTE);
  }
}

function emptyStats(): CitizenStats {
  return {
    population: 0,
    employed: 0,
    unemployed: 0,
    carCommuters: 0,
    transitCommuters: 0,
    avgHappiness: 0,
    avgCommute: 0,
    stranded: 0,
  };
}
