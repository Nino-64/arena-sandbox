/**
 * Every tunable number of the simulation lives here, so balancing the game
 * never means hunting through system code.
 */

export const MAP_SIZE = 64;

/** Real-time duration of one simulated day at 1x speed, in milliseconds. */
export const DAY_MS = 800;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const SPEED_MULTIPLIERS = [0, 1, 2, 4] as const;

export const START_MONEY = 60_000;
export const START_YEAR = 2030;

export const COSTS = {
  road: 25,
  zone: 10,
  park: 400,
  busStop: 200,
  bulldozeTile: 5,
  bulldozeBuilding: 40,
  busLine: 500,
  bus: 300,
} as const;

/** Daily upkeep, charged every day and summed into the monthly report. */
export const UPKEEP_PER_DAY = {
  road: 0.6,
  park: 1.2,
  busStop: 0.4,
  bus: 2.2,
} as const;

export const TAX = {
  min: 0,
  max: 20,
  default: 9,
  /** Taxes above this rate start hurting happiness and demand. */
  comfortable: 9,
} as const;

/** Capacity per level: residents for R, jobs for C and I. */
export const CAPACITY = {
  residential: [0, 8, 22, 48],
  commercial: [0, 5, 12, 24],
  industrial: [0, 8, 18, 32],
} as const;

export const ECONOMY = {
  /** Daily wage earned by one worker, taxed by the residential rate. */
  wage: 10,
  /** Price a shop charges citizens for one unit of goods. */
  retailPrice: 10,
  /** Price a factory receives from a local shop for one unit. */
  wholesalePrice: 6,
  /** Price a factory receives when goods are exported via the highway. */
  exportPrice: 4,
  /** Price a shop pays for imported goods (higher than local wholesale). */
  importPrice: 8,
  busFare: 2,
} as const;

export const CITIZENS = {
  goodsPerDay: 0.2,
  /** Max car commute cost (tile-equivalents) a citizen accepts. */
  maxCarCommute: 38,
  /** Transit trips are tolerated longer: people can read on the bus. */
  maxTransitCommute: 62,
  maxShopDistance: 26,
  /** Days below the threshold before a citizen leaves the city. */
  leaveAfterDays: 25,
  leaveHappiness: 22,
  /** A citizen re-plans their commute at least this often. */
  routeRefreshDays: 40,
  /** Home buildings processed per day by the job/route planner. */
  plannerBudgetPerDay: 18,
  immigrationPerDayBase: 2,
} as const;

export const PRODUCTION = {
  goodsPerWorkerPerDay: 0.55,
  levelMultiplier: [0, 1, 1.2, 1.45],
  /** Storage capacity = capacity(jobs) * this. */
  storagePerJob: 5,
  truckLoad: 12,
  /** Shop shelf capacity = capacity(jobs) * this. */
  shelfPerJob: 6,
  /** Goods a single shop worker can sell per day. */
  salesPerWorkerPerDay: 1.6,
  maxTruckDispatchesPerDay: 14,
  /** Truck speed in tiles per day on a free road. */
  truckSpeed: 7,
  importThreshold: 0.25,
} as const;

export const TRAFFIC = {
  /** Daily trips a road tile carries before it is considered saturated. */
  roadCapacity: 240,
  highwayCapacity: 900,
  /** Cost multiplier at saturation: cost = 1 + k * (load/cap)^2. */
  congestionK: 2.4,
  /** Visual cars spawned per 100 daily trips on screen. */
  carsPer100Trips: 2.2,
  maxVisualCars: 450,
} as const;

export const TRANSIT = {
  /** Walking cost per tile (walking is slower than driving). */
  walkCost: 1.6,
  walkRadius: 5,
  /** Riding cost per tile: buses are slower than a free car, but ignore jams. */
  rideCostPerTile: 0.85,
  /** Wait penalty = base + loopLength / (buses * k). */
  waitBase: 2,
  headwayFactor: 3,
  transferPenalty: 3,
  busSpeed: 6,
  maxBusesPerLine: 12,
  /** Each bus adds this many trips/day of load to the roads it drives on. */
  busTrafficLoad: 6,
} as const;

export const GROWTH = {
  spawnAttemptsPerDay: 10,
  /** Land value thresholds for levels 2 and 3. */
  levelLandValue: [0, 0, 30, 56],
  levelUpOccupancy: 0.85,
  levelUpDays: 25,
  abandonAfterDays: 35,
} as const;

export const ENV = {
  pollutionRadius: 6,
  pollutionPerLevel: 22,
  parkRadius: 5,
  parkValue: 26,
  waterValue: 10,
  envRecomputeDays: 5,
} as const;

export const SAVE_KEY = "metropolis.save.v1";
export const SAVE_VERSION = 1;
