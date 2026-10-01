import type { Rng } from "../core/rng";
import type { NotifyLevel } from "../core/types";
import type { Economy } from "./economy";
import type { Environment } from "./environment";
import type { RoadRouter } from "./pathfinding";
import type { Traffic } from "./traffic";
import type { Transit } from "./transit";
import type { World } from "./world";

/** Shared services every simulation system can use. */
export interface SimContext {
  world: World;
  traffic: Traffic;
  transit: Transit;
  env: Environment;
  economy: Economy;
  rng: Rng;
  router: RoadRouter;
  day: () => number;
  notify: (text: string, level: NotifyLevel) => void;
}
