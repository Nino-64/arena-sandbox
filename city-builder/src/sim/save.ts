import { SAVE_KEY, SAVE_VERSION } from "../core/config";
import { Building, Citizen, CommuteMode, Level, ZoneType } from "../core/types";
import type { Simulation } from "./simulation";

interface SavedLine {
  id: number;
  name: string;
  color: string;
  stops: number[];
  buses: number;
}

interface SaveData {
  version: number;
  savedAt: number;
  seed: number;
  cityName: string;
  day: number;
  rng: number;
  world: {
    size: number;
    terrain: string;
    kind: string;
    zone: string;
    roadFlags: string;
    highwayEntry: number;
    nextBuildingId: number;
  };
  buildings: Array<[number, number, number, ZoneType, Level, number, number, number, number, boolean, number, number]>;
  citizens: Array<[number, number, number, number, number]>;
  nextCitizenId: number;
  lines: SavedLine[];
  nextLineId: number;
  economy: {
    money: number;
    taxes: Record<number, number>;
    history: Simulation["economy"]["history"];
    current: Simulation["economy"]["current"];
    monthStartMoney: number;
  };
}

function toB64(arr: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) s += String.fromCharCode(...arr.subarray(i, i + chunk));
  return btoa(s);
}

function fromB64(s: string, into: Uint8Array): void {
  const bin = atob(s);
  if (bin.length !== into.length) throw new Error("Taille de carte incompatible.");
  for (let i = 0; i < bin.length; i++) into[i] = bin.charCodeAt(i);
}

export function serialize(sim: Simulation): SaveData {
  const w = sim.world;
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    seed: sim.seed,
    cityName: sim.cityName,
    day: sim.day,
    rng: sim.rng.getState(),
    world: {
      size: w.size,
      terrain: toB64(w.terrain),
      kind: toB64(w.kind),
      zone: toB64(w.zone),
      roadFlags: toB64(w.roadFlags),
      highwayEntry: w.highwayEntry,
      nextBuildingId: w.nextBuildingId,
    },
    buildings: [...w.buildings.values()].map((b) => [
      b.id,
      b.x,
      b.y,
      b.zone,
      b.level,
      b.variant,
      Math.round(b.stock * 10) / 10,
      Math.round(b.growth * 1000) / 1000,
      b.disconnectedDays,
      b.abandoned,
      b.builtDay,
      Math.round(b.goodsSatisfaction * 100) / 100,
    ]),
    citizens: [...sim.citizens.all.values()].map((c) => [c.id, c.homeId, c.jobId, Math.round(c.happiness), c.unhappyDays]),
    nextCitizenId: sim.citizens.nextId,
    lines: sim.transit.lines.map((l) => ({ id: l.id, name: l.name, color: l.color, stops: l.stops, buses: l.buses })),
    nextLineId: sim.transit.nextLineId,
    economy: {
      money: sim.economy.money,
      taxes: { ...sim.economy.taxes },
      history: sim.economy.history,
      current: sim.economy.current,
      monthStartMoney: sim.economy.monthStartMoney,
    },
  };
}

/** Restores a save into an existing simulation. Throws on incompatible data. */
export function deserialize(sim: Simulation, data: SaveData): void {
  if (data.version !== SAVE_VERSION) throw new Error("Version de sauvegarde incompatible.");
  if (data.world.size !== sim.world.size) throw new Error("Taille de carte incompatible.");
  sim.newGame(data.seed);
  const w = sim.world;
  fromB64(data.world.terrain, w.terrain);
  fromB64(data.world.kind, w.kind);
  fromB64(data.world.zone, w.zone);
  fromB64(data.world.roadFlags, w.roadFlags);
  w.highwayEntry = data.world.highwayEntry;
  w.buildings.clear();
  w.buildingAt.fill(-1);
  for (const [id, x, y, zone, level, variant, stock, growth, disc, abandoned, builtDay, gs] of data.buildings) {
    const b: Building = {
      id,
      x,
      y,
      zone,
      level,
      variant,
      occupants: 0,
      stock,
      incoming: 0,
      growth,
      disconnectedDays: disc,
      abandoned,
      shopId: -1,
      goodsSatisfaction: gs,
      lastPlannedDay: -1_000_000,
      activity: 0,
      demand: 0,
      daysSinceDelivery: 0,
      builtDay,
    };
    w.buildings.set(id, b);
    w.buildingAt[w.idx(x, y)] = id;
  }
  w.nextBuildingId = data.world.nextBuildingId;
  w.networkChanged();

  sim.day = data.day;
  sim.cityName = data.cityName;
  sim.rng.setState(data.rng);

  const cz = sim.citizens;
  cz.reset();
  for (const [id, homeId, jobId, happiness, unhappyDays] of data.citizens) {
    const home = w.buildings.get(homeId);
    if (!home) continue;
    const job = jobId !== -1 ? w.buildings.get(jobId) : undefined;
    const c: Citizen = {
      id,
      homeId,
      jobId: job ? jobId : -1,
      happiness,
      mode: CommuteMode.None,
      commuteCost: 0,
      route: null,
      lines: [],
      lastRouteDay: -1_000_000,
      unhappyDays,
    };
    cz.all.set(id, c);
    const list = cz.residents.get(homeId);
    if (list) list.push(id);
    else cz.residents.set(homeId, [id]);
    home.occupants++;
    if (job) job.occupants++;
  }
  cz.nextId = data.nextCitizenId;
  sim.restoreMilestones(cz.all.size);

  sim.transit.lines = data.lines.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    stops: l.stops,
    path: new Int32Array(0),
    stopPathIndex: [],
    buses: l.buses,
    broken: false,
    ridersToday: 0,
    ridersMonth: 0,
  }));
  sim.transit.nextLineId = data.nextLineId;
  sim.transit.rebuild();

  const e = sim.economy;
  e.money = data.economy.money;
  e.taxes = { 1: data.economy.taxes[1] ?? 9, 2: data.economy.taxes[2] ?? 9, 3: data.economy.taxes[3] ?? 9 };
  e.history = data.economy.history;
  e.current = data.economy.current;
  e.monthStartMoney = data.economy.monthStartMoney;

  sim.env.recompute(sim.traffic, sim.transit);
  // Commutes are re-planned over the next days; plan everyone quickly now.
  for (let k = 0; k < 6; k++) sim.citizens.plan();
}

export interface SaveSlotInfo {
  cityName: string;
  savedAt: number;
  population: number;
  day: number;
}

export function saveToStorage(sim: Simulation): { ok: boolean; message?: string } {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(sim)));
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Sauvegarde impossible." };
  }
}

export function readSaveInfo(): SaveSlotInfo | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return { cityName: data.cityName, savedAt: data.savedAt, population: data.citizens.length, day: data.day };
  } catch {
    return null;
  }
}

export function loadFromStorage(sim: Simulation): { ok: boolean; message?: string } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ok: false, message: "Aucune sauvegarde trouvée." };
    deserialize(sim, JSON.parse(raw) as SaveData);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Sauvegarde illisible." };
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable: nothing to delete */
  }
}
