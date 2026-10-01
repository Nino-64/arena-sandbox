export enum Terrain {
  Grass = 0,
  Water = 1,
  Forest = 2,
}

export enum TileKind {
  Empty = 0,
  Road = 1,
  Zone = 2,
  Park = 3,
}

export enum Zone {
  None = 0,
  Residential = 1,
  Commercial = 2,
  Industrial = 3,
}

export const RoadFlag = {
  Highway: 1,
  BusStop: 2,
} as const;

export type ZoneType = Zone.Residential | Zone.Commercial | Zone.Industrial;
export type Level = 1 | 2 | 3;

export interface Building {
  id: number;
  x: number;
  y: number;
  zone: ZoneType;
  level: Level;
  variant: number;
  /** Residents (R) or workers (C, I) currently in the building. */
  occupants: number;
  /** Goods in storage (I) or on the shelves (C). */
  stock: number;
  /** Goods already on their way to this shop (C), to avoid over-dispatching. */
  incoming: number;
  /** Progress toward the next level, 0..1. */
  growth: number;
  /** Days without a road connection to the highway. */
  disconnectedDays: number;
  abandoned: boolean;
  /** Assigned shop for residents (R). -1 when none is reachable. */
  shopId: number;
  /** Share of residents' daily goods needs met, smoothed, 0..1. */
  goodsSatisfaction: number;
  /** Day the planner last processed this home building. */
  lastPlannedDay: number;
  /** Goods sold today (C) or produced today (I), for the inspector. */
  activity: number;
  /** Goods residents asked this shop for today (C), to spread shoppers out. */
  demand: number;
  /** Days since the shop last got a domestic delivery (C). */
  daysSinceDelivery: number;
  builtDay: number;
}

export enum CommuteMode {
  None = 0,
  Car = 1,
  Transit = 2,
}

export interface Citizen {
  id: number;
  homeId: number;
  jobId: number;
  happiness: number;
  mode: CommuteMode;
  commuteCost: number;
  /** Road tiles driven for a car commute (one way). */
  route: Int32Array | null;
  /** Lines used for a transit commute. */
  lines: number[];
  lastRouteDay: number;
  unhappyDays: number;
}

export interface BusLine {
  id: number;
  name: string;
  color: string;
  /** Road tile index of every stop, in visiting order (the line loops). */
  stops: number[];
  /** Full road path of one loop, as tile indices. */
  path: Int32Array;
  /** Index in `path` where each stop sits. */
  stopPathIndex: number[];
  buses: number;
  /** True when a road between two stops was removed: the line stops running. */
  broken: boolean;
  ridersToday: number;
  ridersMonth: number;
}

export interface Vehicle {
  kind: "truck" | "bus";
  path: Int32Array;
  /** Position along the path, in tiles (fractional). */
  pos: number;
  speed: number;
  /** Truck: load and destination. Bus: line id. */
  load: number;
  targetId: number;
  lineId: number;
  export: boolean;
  import: boolean;
  /** Bus: loops forever. */
  loop: boolean;
  color: string;
}

export type ToolId =
  | "inspect"
  | "road"
  | "zoneR"
  | "zoneC"
  | "zoneI"
  | "park"
  | "busStop"
  | "busLine"
  | "bulldoze";

export type OverlayId = "none" | "traffic" | "happiness" | "landValue" | "pollution" | "transit";

export interface MonthReport {
  month: number;
  year: number;
  income: { residential: number; commercial: number; industrial: number; transit: number };
  expenses: { roads: number; transit: number; parks: number };
  construction: number;
  balance: number;
  population: number;
}

export type NotifyLevel = "info" | "good" | "warn" | "bad";

export interface Notification {
  id: number;
  text: string;
  level: NotifyLevel;
  day: number;
}
