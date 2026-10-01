import { COSTS } from "../core/config";
import { ToolId, Zone, ZoneType } from "../core/types";
import { RoadRouter } from "../sim/pathfinding";
import type { Simulation } from "../sim/simulation";
import { LINE_COLORS } from "../sim/transit";
import type { Renderer } from "../render/renderer";

export interface ToolInfo {
  id: ToolId;
  label: string;
  key: string;
  hint: string;
  color: string;
}

export const TOOLS: ToolInfo[] = [
  { id: "inspect", label: "Inspecter", key: "I", hint: "Cliquez sur un bâtiment ou une route pour voir ses détails.", color: "#ffffff" },
  { id: "road", label: "Route", key: "R", hint: `Glissez pour tracer une route (${COSTS.road} $ / case). Relier à l'autoroute à l'ouest.`, color: "#c3c6cc" },
  { id: "zoneR", label: "Résidentiel", key: "1", hint: `Glissez un rectangle à zoner en résidentiel (${COSTS.zone} $ / case). Les parcelles doivent toucher une route.`, color: "#4fd18b" },
  { id: "zoneC", label: "Commercial", key: "2", hint: `Glissez un rectangle à zoner en commerce (${COSTS.zone} $ / case). Les magasins vendent les biens des usines.`, color: "#4f9dff" },
  { id: "zoneI", label: "Industriel", key: "3", hint: `Glissez un rectangle à zoner en industrie (${COSTS.zone} $ / case). Les usines polluent : éloignez-les des maisons.`, color: "#ffb23f" },
  { id: "park", label: "Parc", key: "P", hint: `Cliquez pour placer un parc (${COSTS.park} $). Augmente le bonheur et la valeur foncière.`, color: "#79c26a" },
  { id: "busStop", label: "Arrêt de bus", key: "B", hint: `Cliquez sur une route pour placer un arrêt (${COSTS.busStop} $). Cliquez sur un arrêt existant pour le retirer.`, color: "#ffd23f" },
  { id: "busLine", label: "Ligne de bus", key: "L", hint: "Cliquez des arrêts dans l'ordre. Recliquez le 1er arrêt ou Entrée pour valider, Retour arrière pour annuler le dernier, Échap pour abandonner.", color: "#ff5d73" },
  { id: "bulldoze", label: "Démolir", key: "X", hint: `Glissez pour démolir (${COSTS.bulldozeTile} $ / case, ${COSTS.bulldozeBuilding} $ / bâtiment).`, color: "#ff6b5b" },
];

const ZONE_OF: Partial<Record<ToolId, ZoneType>> = { zoneR: Zone.Residential, zoneC: Zone.Commercial, zoneI: Zone.Industrial };

export interface ToolFeedback {
  message: string;
  level: "info" | "good" | "warn" | "bad";
}

/**
 * Turns pointer gestures into simulation actions for the active tool, and
 * keeps the renderer's previews (tiles, cost, bus line path) up to date.
 */
export class ToolController {
  tool: ToolId = "inspect";
  private dragStart: { x: number; y: number } | null = null;
  private hover: { x: number; y: number } | null = null;
  private lineStops: number[] = [];
  private readonly router: RoadRouter;
  previewCost = 0;
  onFeedback: (f: ToolFeedback) => void = () => {};
  onSelect: (tile: number) => void = () => {};
  onChange: () => void = () => {};

  constructor(
    private readonly sim: Simulation,
    private readonly renderer: Renderer,
  ) {
    this.router = new RoadRouter(sim.world);
  }

  setTool(tool: ToolId): void {
    if (this.tool === "busLine" && tool !== "busLine") this.cancelLine();
    this.tool = tool;
    this.dragStart = null;
    this.renderer.showLines = tool === "busLine" || tool === "busStop";
    this.refreshPreview();
    this.onChange();
  }

  get dragging(): boolean {
    return this.dragStart !== null;
  }

  get pendingStops(): number {
    return this.lineStops.length;
  }

  private tileIndex(p: { x: number; y: number } | null): number {
    if (!p || !this.sim.world.inBounds(p.x, p.y)) return -1;
    return this.sim.world.idx(p.x, p.y);
  }

  pointerMove(tx: number, ty: number): void {
    const changed = !this.hover || this.hover.x !== tx || this.hover.y !== ty;
    this.hover = { x: tx, y: ty };
    this.renderer.hoverTile = this.tileIndex(this.hover);
    if (changed) this.refreshPreview();
  }

  pointerLeave(): void {
    this.hover = null;
    this.renderer.hoverTile = -1;
    if (!this.dragStart) this.refreshPreview();
  }

  pointerDown(tx: number, ty: number): void {
    if (!this.sim.world.inBounds(tx, ty)) return;
    this.hover = { x: tx, y: ty };
    const t = this.tool;
    if (t === "road" || t === "bulldoze" || ZONE_OF[t] !== undefined) {
      this.dragStart = { x: tx, y: ty };
      this.refreshPreview();
      return;
    }
    const i = this.sim.world.idx(tx, ty);
    if (t === "inspect") this.onSelect(i);
    else if (t === "park") this.report(this.sim.placePark(i), "Parc construit.", [i]);
    else if (t === "busStop") {
      if (this.sim.world.isBusStop(i)) this.report(this.sim.removeBusStop(i), "Arrêt retiré.", [i]);
      else this.report(this.sim.placeBusStop(i), "Arrêt de bus placé.", [i]);
    } else if (t === "busLine") this.addLineStop(i);
  }

  pointerUp(): void {
    if (!this.dragStart) return;
    const tiles = this.dragTiles();
    const t = this.tool;
    this.dragStart = null;
    if (t === "road") this.report(this.sim.buildRoads(tiles), "Route construite.", tiles);
    else if (t === "bulldoze") this.report(this.sim.bulldoze(tiles), "Démolition effectuée.", tiles);
    else {
      const z = ZONE_OF[t];
      if (z !== undefined) this.report(this.sim.zoneTiles(tiles, z), "Zone délimitée.", tiles);
    }
    this.refreshPreview();
  }

  cancel(): void {
    if (this.dragStart) {
      this.dragStart = null;
      this.refreshPreview();
      return;
    }
    if (this.tool === "busLine" && this.lineStops.length > 0) {
      this.cancelLine();
      return;
    }
    this.setTool("inspect");
  }

  private report(res: { ok: boolean; cost: number; message?: string; changed: number }, success: string, tiles: number[]): void {
    if (res.ok) {
      this.renderer.dustAt(tiles);
      this.onFeedback({ message: res.cost > 0 ? `${success} −${Math.round(res.cost).toLocaleString("fr-FR")} $` : success, level: "good" });
    } else if (res.message) {
      this.onFeedback({ message: res.message, level: "warn" });
    }
    this.onChange();
  }

  // ------------------------------------------------------------ bus line

  private addLineStop(i: number): void {
    const w = this.sim.world;
    if (!w.isBusStop(i)) {
      this.onFeedback({ message: "Cliquez sur un arrêt de bus (posez-en avec l'outil Arrêt).", level: "warn" });
      return;
    }
    if (this.lineStops.length >= 2 && i === this.lineStops[0]) {
      this.finishLine();
      return;
    }
    if (this.lineStops.includes(i)) {
      this.onFeedback({ message: "Cet arrêt est déjà sur la ligne.", level: "warn" });
      return;
    }
    if (this.lineStops.length > 0) {
      this.router.run(this.lineStops[this.lineStops.length - 1]!, () => 1);
      if (!this.router.pathTo(i)) {
        this.onFeedback({ message: "Aucune route ne relie ces deux arrêts.", level: "warn" });
        return;
      }
    }
    this.lineStops.push(i);
    this.updateLinePreview();
    this.onChange();
  }

  removeLastStop(): void {
    if (this.tool !== "busLine" || this.lineStops.length === 0) return;
    this.lineStops.pop();
    this.updateLinePreview();
    this.onChange();
  }

  finishLine(): void {
    if (this.tool !== "busLine") return;
    if (this.lineStops.length < 2) {
      this.onFeedback({ message: "Une ligne a besoin d'au moins 2 arrêts.", level: "warn" });
      return;
    }
    const res = this.sim.createBusLine(this.lineStops);
    if (res.ok && res.line) {
      this.onFeedback({ message: `${res.line.name} ouverte avec ${res.line.buses} bus. −${res.cost.toLocaleString("fr-FR")} $`, level: "good" });
      this.cancelLine();
    } else {
      this.onFeedback({ message: res.message ?? "Impossible de créer la ligne.", level: "warn" });
    }
    this.onChange();
  }

  private cancelLine(): void {
    this.lineStops = [];
    this.renderer.linePreview = null;
    this.onChange();
  }

  private updateLinePreview(): void {
    const color = LINE_COLORS[(this.sim.transit.nextLineId - 1) % LINE_COLORS.length]!;
    if (this.lineStops.length === 0) {
      this.renderer.linePreview = null;
      return;
    }
    const parts: number[] = [];
    for (let k = 0; k + 1 < this.lineStops.length; k++) {
      this.router.run(this.lineStops[k]!, () => 1);
      const leg = this.router.pathTo(this.lineStops[k + 1]!);
      if (leg) for (let j = parts.length ? 1 : 0; j < leg.length; j++) parts.push(leg[j]!);
    }
    this.renderer.linePreview = { stops: [...this.lineStops], path: parts.length ? Int32Array.from(parts) : null, color };
  }

  // ------------------------------------------------------------- preview

  /** Tiles covered by the current drag: an L-shaped path for roads, a rectangle otherwise. */
  private dragTiles(): number[] {
    const a = this.dragStart;
    const b = this.hover ?? a;
    if (!a || !b) return [];
    const w = this.sim.world;
    const clampX = (v: number) => Math.max(0, Math.min(w.size - 1, v));
    const bx = clampX(b.x);
    const by = clampX(b.y);
    const out: number[] = [];
    if (this.tool === "road") {
      // Go along the longer axis first, then turn.
      const horizontalFirst = Math.abs(bx - a.x) >= Math.abs(by - a.y);
      const sx = Math.sign(bx - a.x);
      const sy = Math.sign(by - a.y);
      let x = a.x;
      let y = a.y;
      out.push(w.idx(x, y));
      if (horizontalFirst) {
        while (x !== bx) out.push(w.idx((x += sx), y));
        while (y !== by) out.push(w.idx(x, (y += sy)));
      } else {
        while (y !== by) out.push(w.idx(x, (y += sy)));
        while (x !== bx) out.push(w.idx((x += sx), y));
      }
      return out;
    }
    for (let y = Math.min(a.y, by); y <= Math.max(a.y, by); y++)
      for (let x = Math.min(a.x, bx); x <= Math.max(a.x, bx); x++) out.push(w.idx(x, y));
    return out;
  }

  refreshPreview(): void {
    const r = this.renderer;
    const tool = TOOLS.find((t) => t.id === this.tool)!;
    this.previewCost = 0;
    const hoverIdx = this.tileIndex(this.hover);
    if (this.dragStart) {
      const tiles = this.dragTiles();
      let valid: number[] = tiles;
      if (this.tool === "road") {
        const rc = this.sim.roadCost(tiles);
        this.previewCost = rc.cost;
        valid = rc.valid;
      } else if (this.tool === "bulldoze") {
        this.previewCost = this.sim.bulldozeCost(tiles);
      } else {
        const z = ZONE_OF[this.tool];
        if (z !== undefined) {
          const zc = this.sim.zoneCost(tiles, z);
          this.previewCost = zc.cost;
          valid = zc.valid;
        }
      }
      const affordable = this.sim.economy.canAfford(this.previewCost);
      r.preview = { tiles: this.tool === "bulldoze" ? tiles : valid, valid: affordable && (this.tool === "bulldoze" ? this.previewCost > 0 : valid.length > 0), color: tool.color };
    } else if (hoverIdx >= 0 && this.tool !== "inspect" && this.tool !== "busLine") {
      let valid = true;
      const w = this.sim.world;
      if (this.tool === "park") {
        valid = w.canBuildOn(hoverIdx) && w.kind[hoverIdx] === 0;
        this.previewCost = COSTS.park;
      } else if (this.tool === "busStop") {
        valid = w.isRoad(hoverIdx) && !w.isHighway(hoverIdx);
        this.previewCost = w.isBusStop(hoverIdx) ? 0 : COSTS.busStop;
      } else if (this.tool === "road") {
        this.previewCost = this.sim.roadCost([hoverIdx]).cost;
        valid = this.previewCost > 0;
      } else if (this.tool === "bulldoze") {
        this.previewCost = this.sim.bulldozeCost([hoverIdx]);
      } else {
        const z = ZONE_OF[this.tool];
        if (z !== undefined) {
          this.previewCost = this.sim.zoneCost([hoverIdx], z).cost;
          valid = this.previewCost > 0;
        }
      }
      r.preview = { tiles: [hoverIdx], valid: valid && this.sim.economy.canAfford(this.previewCost), color: tool.color };
    } else {
      r.preview = null;
    }
    this.onChange();
  }
}
