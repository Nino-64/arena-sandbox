import { CAPACITY, CITIZENS, COSTS, ECONOMY, GROWTH, TRAFFIC, TRANSIT, UPKEEP_PER_DAY } from "../core/config";
import { CommuteMode, NotifyLevel, OverlayId, Terrain, TileKind, ToolId, Zone, ZoneType } from "../core/types";
import { TOOLS, ToolController } from "../input/tools";
import type { Renderer } from "../render/renderer";
import { capacityOf } from "../sim/citizens";
import { Economy } from "../sim/economy";
import { shelfCap, storageCap } from "../sim/production";
import { readSaveInfo } from "../sim/save";
import type { Simulation } from "../sim/simulation";
import { MiniChart } from "./charts";
import { append, fmt, h, MONTHS, MONTHS_SHORT, money, pct, setText, signedMoney } from "./dom";
import { ICONS } from "./icons";

export interface UiActions {
  newGame: (seed: number) => void;
  save: () => void;
  load: () => boolean;
}

type DockTab = "budget" | "city" | "transit";

const OVERLAYS: Array<{ id: OverlayId; label: string; legend: [string, string] }> = [
  { id: "none", label: "Normal", legend: ["", ""] },
  { id: "traffic", label: "Trafic", legend: ["Fluide", "Saturé"] },
  { id: "happiness", label: "Bonheur", legend: ["Heureux", "Mécontent"] },
  { id: "landValue", label: "Valeur foncière", legend: ["Élevée", "Faible"] },
  { id: "pollution", label: "Pollution", legend: ["Propre", "Polluée"] },
  { id: "transit", label: "Transports", legend: ["Desservi", "Non desservi"] },
];

const ZONE_META: Record<ZoneType, { name: string; color: string; icon: string }> = {
  [Zone.Residential]: { name: "Résidentiel", color: "var(--zone-r)", icon: ICONS.home },
  [Zone.Commercial]: { name: "Commerce", color: "var(--zone-c)", icon: ICONS.shop },
  [Zone.Industrial]: { name: "Industrie", color: "var(--zone-i)", icon: ICONS.factory },
};

const LEVEL_NAMES: Record<ZoneType, string[]> = {
  [Zone.Residential]: ["", "Maison", "Immeuble", "Tour résidentielle"],
  [Zone.Commercial]: ["", "Boutique", "Bureaux", "Gratte-ciel d'affaires"],
  [Zone.Industrial]: ["", "Atelier", "Entrepôt industriel", "Complexe industriel"],
};

/**
 * All DOM interface: top bar, tool palette, overlays, dock panels (budget,
 * city, transit), inspector, toasts and modals. It reads the simulation and
 * issues actions only through the Simulation / ToolController APIs.
 */
export class GameUI {
  private refs: Record<string, HTMLElement> = {};
  private toolButtons = new Map<ToolId, HTMLButtonElement>();
  private speedButtons: HTMLButtonElement[] = [];
  private overlayButtons = new Map<OverlayId, HTMLButtonElement>();
  private dockTab: DockTab | null = null;
  private dockTabButtons = new Map<DockTab, HTMLButtonElement>();
  private statButtons = new Map<DockTab, HTMLButtonElement>();
  private selected = -1;
  private balanceChart = new MiniChart("line", [{ name: "Trésorerie", color: "#4fd1ff" }], "Le graphique apparaît après deux mois de jeu.", "Trésorerie de fin de mois");
  private flowChart = new MiniChart(
    "bars",
    [
      { name: "Recettes", color: "#3987e5" },
      { name: "Dépenses", color: "#d95926" },
    ],
    "Le graphique apparaît après deux mois de jeu.",
    "Recettes et dépenses mensuelles",
  );
  private popChart = new MiniChart("line", [{ name: "Population", color: "#4fd18b" }], "La courbe apparaît après deux mois.", "Population de fin de mois");
  private lastHistoryLen = -1;
  private transitSignature = "";
  private modalOpen = false;
  private speedBeforeModal = 1;

  constructor(
    private readonly root: HTMLElement,
    private readonly sim: Simulation,
    private readonly tools: ToolController,
    private readonly renderer: Renderer,
    private readonly actions: UiActions,
  ) {
    this.root.append(
      this.buildTopbar(),
      this.buildToolbar(),
      this.buildOverlayBar(),
      this.buildHintbar(),
      this.buildDock(),
      this.buildInspector(),
      (this.refs.toasts = h("div.toasts", { "aria-live": "polite" })),
      this.buildModal(),
    );
    this.popChart.el.querySelector("canvas")!.setAttribute("aria-label", "Population");
    this.tools.onChange = () => this.updateHint();
    this.tools.onFeedback = (f) => this.toast(f.message, f.level);
    this.tools.onSelect = (i) => this.select(i);
    this.selectTool("inspect");
  }

  // ================================================================ top bar

  private buildTopbar(): HTMLElement {
    const speeds = [
      { icon: ICONS.pause, label: "Pause (Espace)" },
      { icon: ICONS.play, label: "Vitesse normale" },
      { icon: ICONS.fast, label: "Vitesse rapide" },
      { icon: ICONS.faster, label: "Vitesse maximale" },
    ];
    const timeControls = h(
      "div.time-controls",
      { role: "group", "aria-label": "Vitesse de la simulation" },
      speeds.map((s, k) => {
        const b = h("button.time-btn", { title: s.label, "aria-label": s.label, html: s.icon, onclick: () => this.setSpeed(k) });
        this.speedButtons.push(b);
        return b;
      }),
    );
    const stat = (tab: DockTab | null, icon: string, valueRef: string, subRef: string, label: string) => {
      const inner = [h("span.stat-icon", { html: icon }), h("div", {}, [(this.refs[valueRef] = h("div.stat-value.num")), (this.refs[subRef] = h("div.stat-sub.num"))])];
      if (!tab) return h("div.stat", { title: label }, inner);
      const b = h("button.stat", { title: label, "aria-label": label, onclick: () => this.toggleDock(tab) }, inner);
      this.statButtons.set(tab, b);
      return b;
    };
    const rci = h("div.rci", { title: "Demande RCI : résidentiel, commerce, industrie" }, (["R", "C", "I"] as const).map((l, k) => {
      const color = ["var(--zone-r)", "var(--zone-c)", "var(--zone-i)"][k]!;
      return h("div.rci-col", {}, [h("div.rci-track", {}, [(this.refs[`rci${l}`] = h("div.rci-fill", { style: `background:${color}` }))]), h("span.rci-label", {}, l)]);
    }));
    return h("header.topbar.glass", {}, [
      h("div.brand", {}, [
        h("div.brand-mark", { html: ICONS.logo }),
        h("div.brand-text", {}, [(this.refs.cityName = h("div.city-name")), (this.refs.date = h("div.city-date.num"))]),
        h("button.icon-btn", { title: "Sauvegarder (Ctrl+S)", "aria-label": "Sauvegarder", html: ICONS.save, style: "margin-left:6px;color:var(--text-2)", onclick: () => this.actions.save() }),
        h("button.icon-btn", { title: "Aide et menu (H)", "aria-label": "Aide et menu", html: ICONS.help, style: "color:var(--text-2)", onclick: () => this.openModal("start") }),
      ]),
      timeControls,
      h("div.stats", {}, [
        stat("budget", ICONS.money, "money", "moneySub", "Budget (cliquer pour ouvrir)"),
        stat("city", ICONS.people, "pop", "popSub", "Population et emploi"),
        stat("city", ICONS.smile, "happy", "happySub", "Bonheur moyen"),
        stat("transit", ICONS.bus, "transit", "transitSub", "Transports en commun"),
        rci,
      ]),
    ]);
  }

  setSpeed(k: number): void {
    this.sim.setSpeed(k);
    this.speedButtons.forEach((b, i) => b.classList.toggle("active", i === this.sim.speed));
  }

  // ================================================================ toolbar

  private buildToolbar(): HTMLElement {
    const bar = h("nav.toolbar.glass", { "aria-label": "Outils de construction" });
    const groups: ToolId[][] = [["inspect"], ["road", "zoneR", "zoneC", "zoneI", "park"], ["busStop", "busLine"], ["bulldoze"]];
    groups.forEach((group, gi) => {
      if (gi > 0) bar.append(h("div.tool-sep"));
      for (const id of group) {
        const t = TOOLS.find((x) => x.id === id)!;
        const b = h(
          "button.tool-btn",
          { "aria-label": `${t.label} (${t.key})`, style: `--tool-color:${t.color}`, onclick: () => this.selectTool(id) },
          [h("span", { html: ICONS[id] }), h("span.tool-key", {}, t.key), h("span.tool-tip", {}, [t.label, h("small", {}, t.key)])],
        );
        this.toolButtons.set(id, b);
        bar.append(b);
      }
    });
    return bar;
  }

  selectTool(id: ToolId): void {
    this.tools.setTool(id);
    this.toolButtons.forEach((b, k) => {
      b.classList.toggle("active", k === id);
      b.setAttribute("aria-pressed", String(k === id));
    });
    if (id === "busLine" || id === "busStop") this.openDock("transit");
    this.updateHint();
  }

  // ================================================================ overlay

  private buildOverlayBar(): HTMLElement {
    const bar = h("div.overlay-bar.glass", { role: "group", "aria-label": "Vues" });
    for (const o of OVERLAYS) {
      const b = h("button.chip", { onclick: () => this.setOverlay(o.id) }, o.label);
      this.overlayButtons.set(o.id, b);
      bar.append(b);
    }
    this.refs.legend = h("div.legend", {}, [(this.refs.legendLo = h("span")), h("div.legend-ramp"), (this.refs.legendHi = h("span"))]);
    bar.append(this.refs.legend);
    return bar;
  }

  setOverlay(id: OverlayId): void {
    this.renderer.overlay = id;
    this.overlayButtons.forEach((b, k) => b.classList.toggle("active", k === id));
    const o = OVERLAYS.find((x) => x.id === id)!;
    this.refs.legend!.style.display = id === "none" ? "none" : "flex";
    setText(this.refs.legendLo!, o.legend[0]);
    setText(this.refs.legendHi!, o.legend[1]);
  }

  cycleOverlay(): void {
    const k = OVERLAYS.findIndex((o) => o.id === this.renderer.overlay);
    this.setOverlay(OVERLAYS[(k + 1) % OVERLAYS.length]!.id);
  }

  // ================================================================ hint bar

  private buildHintbar(): HTMLElement {
    return (this.refs.hint = h("div.hintbar.glass", { role: "status" }, [
      (this.refs.hintSwatch = h("span.swatch")),
      (this.refs.hintText = h("span")),
      (this.refs.hintCost = h("span.cost.num")),
      (this.refs.hintActions = h("div.hint-actions")),
    ]));
  }

  private updateHint(): void {
    const t = TOOLS.find((x) => x.id === this.tools.tool)!;
    this.refs.hintSwatch!.style.background = t.color;
    let text = t.hint;
    if (t.id === "busLine" && this.tools.pendingStops > 0) text = `${this.tools.pendingStops} arrêt(s) sélectionné(s). Recliquez le premier arrêt ou validez.`;
    setText(this.refs.hintText!, text);
    const cost = this.tools.previewCost;
    setText(this.refs.hintCost!, cost > 0 ? `−${fmt(cost)} $` : "");
    this.refs.hintCost!.classList.toggle("bad", cost > 0 && !this.sim.economy.canAfford(cost));
    const actions = this.refs.hintActions!;
    actions.innerHTML = "";
    if (t.id === "busLine" && this.tools.pendingStops > 0) {
      actions.append(
        h("button.btn.small", { onclick: () => this.tools.removeLastStop() }, "Annuler l'arrêt"),
        h("button.btn.small.primary", { onclick: () => this.tools.finishLine(), disabled: this.tools.pendingStops < 2 }, `Créer (${fmt(COSTS.busLine)} $ + bus)`),
      );
    }
    this.refs.hintCost!.style.display = actions.childElementCount ? "none" : "";
  }

  // =================================================================== dock

  private buildDock(): HTMLElement {
    const tabs: Array<[DockTab, string]> = [
      ["budget", "Budget"],
      ["city", "Ville"],
      ["transit", "Transports"],
    ];
    const tabBar = h("div.dock-tabs", { role: "tablist" }, [
      ...tabs.map(([id, label]) => {
        const b = h("button.dock-tab", { role: "tab", onclick: () => this.openDock(id) }, label);
        this.dockTabButtons.set(id, b);
        return b;
      }),
      h("button.dock-close", { "aria-label": "Fermer le panneau", html: ICONS.close, onclick: () => this.closeDock() }),
    ]);
    this.refs.dockBody = h("div.dock-body");
    this.refs.dock = h("aside.dock.glass.hidden", { "aria-label": "Panneau de gestion" }, [tabBar, this.refs.dockBody]);
    return this.refs.dock;
  }

  toggleDock(tab: DockTab): void {
    if (this.dockTab === tab) this.closeDock();
    else this.openDock(tab);
  }

  openDock(tab: DockTab): void {
    this.dockTab = tab;
    this.refs.dock!.classList.remove("hidden");
    this.dockTabButtons.forEach((b, k) => {
      b.classList.toggle("active", k === tab);
      b.setAttribute("aria-selected", String(k === tab));
    });
    this.statButtons.forEach((b, k) => b.classList.toggle("active", k === tab));
    this.renderDock(true);
  }

  closeDock(): void {
    this.dockTab = null;
    this.refs.dock!.classList.add("hidden");
    this.statButtons.forEach((b) => b.classList.remove("active"));
  }

  /** Full rebuild on tab switch; live values are refreshed in place afterwards. */
  private renderDock(rebuild: boolean): void {
    if (!this.dockTab) return;
    const body = this.refs.dockBody!;
    if (rebuild) {
      body.innerHTML = "";
      this.lastHistoryLen = -1;
      this.transitSignature = "";
      if (this.dockTab === "budget") body.append(...this.budgetPanel());
      else if (this.dockTab === "city") body.append(...this.cityPanel());
      else body.append(...this.transitPanel());
    }
    if (this.dockTab === "budget") this.updateBudget();
    else if (this.dockTab === "city") this.updateCity();
    else this.updateTransit();
  }

  // ---------------------------------------------------------------- budget

  private budgetPanel(): HTMLElement[] {
    const r = this.refs;
    const taxRow = (z: ZoneType) => {
      const meta = ZONE_META[z];
      const input = h("input", { type: "range", min: 0, max: 20, step: 1, value: this.sim.economy.taxes[z], "aria-label": `Impôt ${meta.name}`, style: `--fill:${meta.color}` }) as HTMLInputElement;
      const value = h("span.slider-value.num");
      const sync = () => {
        input.style.setProperty("--pct", `${(Number(input.value) / 20) * 100}%`);
        value.textContent = `${input.value} %`;
      };
      input.addEventListener("input", () => {
        this.sim.economy.setTax(z, Number(input.value));
        sync();
        this.updateBudget();
      });
      sync();
      return h("div.slider-row", {}, [h("label.slider-label", {}, [h("i.dot", { style: `background:${meta.color}` }), meta.name]), input, value]);
    };
    const kv = (rows: Array<[string, string, string?]>) =>
      h("dl.kv", {}, rows.flatMap(([label, ref, cls]) => [h(`dt${cls ? "." + cls : ""}` as "dt", {}, label), (r[ref] = h(`dd.num${cls ? "." + cls : ""}` as "dd"))]));
    return [
      h("section.section", {}, [
        h("h3.section-title", {}, "Trésorerie"),
        h("div.hero", {}, [(r.bMoney = h("span.hero-value.num")), (r.bNet = h("span.hero-sub.num"))]),
        (r.bWarn = h("p.note.warn", { style: "margin:8px 0 0" })),
      ]),
      h("section.section", {}, [
        h("h3.section-title", {}, "Impôts"),
        taxRow(Zone.Residential),
        taxRow(Zone.Commercial),
        taxRow(Zone.Industrial),
        h("p.note", {}, "Au-delà de 9 %, les impôts réduisent le bonheur et la demande. En dessous, la ville attire mais vos recettes baissent."),
      ]),
      h("section.section", {}, [
        h("h3.section-title", {}, "Mois en cours"),
        kv([
          ["Impôt résidentiel (salaires)", "bIncR"],
          ["Impôt commercial (ventes)", "bIncC"],
          ["Impôt industriel (production)", "bIncI"],
          ["Billets de bus", "bIncT"],
          ["Entretien des routes", "bExpRoads"],
          ["Transports en commun", "bExpTransit"],
          ["Parcs", "bExpParks"],
          ["Constructions", "bConstruction"],
          ["Solde d'exploitation", "bNetMonth", "total"],
        ]),
      ]),
      h("section.section", {}, [h("h3.section-title", {}, "Trésorerie de fin de mois"), this.balanceChart.el]),
      h("section.section", {}, [h("h3.section-title", {}, "Recettes et dépenses mensuelles"), this.flowChart.el]),
    ];
  }

  private updateBudget(): void {
    const r = this.refs;
    if (!r.bMoney) return;
    const e = this.sim.economy;
    const dom = this.sim.date.day;
    const proj = e.projectedMonthlyNet(dom);
    setText(r.bMoney, money(e.money));
    r.bMoney.classList.toggle("neg", e.money < 0);
    setText(r.bNet!, `${signedMoney(proj)} / mois (projection)`);
    setText(r.bWarn!, e.money < 0 ? "Budget négatif : plus aucune construction n'est possible tant que la trésorerie n'est pas positive." : proj < 0 ? "La ville perd de l'argent chaque mois : ajustez les impôts ou réduisez les dépenses." : "");
    const c = e.current;
    setText(r.bIncR!, signedMoney(c.income.residential));
    setText(r.bIncC!, signedMoney(c.income.commercial));
    setText(r.bIncI!, signedMoney(c.income.industrial));
    setText(r.bIncT!, signedMoney(c.income.transit));
    setText(r.bExpRoads!, signedMoney(-c.expenses.roads));
    setText(r.bExpTransit!, signedMoney(-c.expenses.transit));
    setText(r.bExpParks!, signedMoney(-c.expenses.parks));
    setText(r.bConstruction!, signedMoney(-c.construction));
    setText(r.bNetMonth!, signedMoney(Economy.totalIncome(c) - Economy.totalExpenses(c)));
    if (e.history.length !== this.lastHistoryLen) {
      this.lastHistoryLen = e.history.length;
      const recent = e.history.slice(-18);
      const label = (m: { month: number; year: number }) => `${MONTHS_SHORT[m.month]} ${String(m.year).slice(2)}`;
      this.balanceChart.setData(recent.map((m) => ({ label: label(m), values: [m.balance] })));
      this.flowChart.setData(recent.map((m) => ({ label: label(m), values: [Economy.totalIncome(m), Economy.totalExpenses(m)] })));
    }
  }

  // ------------------------------------------------------------------ city

  private cityPanel(): HTMLElement[] {
    const r = this.refs;
    const tile = (label: string, ref: string, subRef: string) =>
      h("div.tile", {}, [h("div.tile-label", {}, label), (r[ref] = h("div.tile-value.num")), (r[subRef] = h("div.tile-sub.num"))]);
    const kv = (rows: Array<[string, string]>) => h("dl.kv", {}, rows.flatMap(([label, ref]) => [h("dt", {}, label), (r[ref] = h("dd.num"))]));
    const demandRow = (label: string, ref: string, color: string) =>
      h("div", { style: "display:grid;grid-template-columns:92px 1fr 44px;gap:10px;align-items:center;margin-bottom:8px" }, [
        h("span.slider-label", {}, [h("i.dot", { style: `background:${color}` }), label]),
        h("div.meter", {}, [(r[ref] = h("span", { style: `background:${color}` }))]),
        (r[ref + "V"] = h("span.slider-value.num")),
      ]);
    return [
      h("section.section", {}, [
        h("h3.section-title", {}, "Habitants"),
        h("div.tiles", {}, [tile("Population", "cPop", "cPopSub"), tile("Bonheur", "cHappy", "cHappySub"), tile("Emploi", "cEmp", "cEmpSub"), tile("Trajet moyen", "cCommute", "cCommuteSub")]),
      ]),
      h("section.section", {}, [
        h("h3.section-title", {}, "Mode de transport domicile-travail"),
        (r.cSplit = h("div.split", {}, [(r.cSplitCar = h("span", { style: "background:#9aa6bb" })), (r.cSplitBus = h("span", { style: "background:#ff5d73" }))])),
        h("div.split-legend", {}, [h("span", {}, [h("i.dot", { style: "background:#9aa6bb" }), (r.cCarLbl = h("span.num"))]), h("span", {}, [h("i.dot", { style: "background:#ff5d73" }), (r.cBusLbl = h("span.num"))])]),
      ]),
      h("section.section", {}, [
        h("h3.section-title", {}, "Demande"),
        demandRow("Résidentiel", "dR", "var(--zone-r)"),
        demandRow("Commerce", "dC", "var(--zone-c)"),
        demandRow("Industrie", "dI", "var(--zone-i)"),
        (r.dNote = h("p.note")),
      ]),
      h("section.section", {}, [
        h("h3.section-title", {}, "Chaîne de production (par jour)"),
        kv([
          ["Biens produits par les usines", "pProduced"],
          ["Livrés aux commerces", "pDelivered"],
          ["Vendus aux habitants", "pSold"],
          ["Besoins non satisfaits", "pUnmet"],
          ["Importés (au prix fort)", "pImported"],
          ["Exportés par l'autoroute", "pExported"],
          ["Camions en circulation", "pTrucks"],
        ]),
      ]),
      h("section.section", {}, [
        h("h3.section-title", {}, "Trafic"),
        kv([
          ["Congestion moyenne", "tAvg"],
          ["Tronçons saturés", "tJam"],
          ["Routes", "tRoads"],
        ]),
      ]),
      h("section.section", {}, [h("h3.section-title", {}, "Population de fin de mois"), this.popChart.el]),
    ];
  }

  private updateCity(): void {
    const r = this.refs;
    if (!r.cPop) return;
    const o = this.sim.overview();
    setText(r.cPop, fmt(o.population));
    setText(r.cPopSub!, `${fmt(o.buildings)} bâtiments`);
    setText(r.cHappy!, `${Math.round(o.happiness)} %`);
    setText(r.cHappySub!, o.happiness >= 65 ? "Ville épanouie" : o.happiness >= 45 ? "Satisfaisant" : o.happiness >= 30 ? "Tensions" : "Mécontentement");
    setText(r.cEmp!, pct(o.employmentRate));
    setText(r.cEmpSub!, `${fmt(o.unemployed)} sans emploi`);
    setText(r.cCommute!, o.avgCommute ? `${fmt(o.avgCommute, 1)}` : "—");
    setText(r.cCommuteSub!, "unités de coût (cases)");
    const total = o.carCommuters + o.transitCommuters;
    r.cSplitCar!.style.flex = String(total ? o.carCommuters : 1);
    r.cSplitBus!.style.flex = String(total ? o.transitCommuters : 0);
    setText(r.cCarLbl!, `Voiture ${total ? pct(o.carCommuters / total) : "—"}`);
    setText(r.cBusLbl!, `Bus ${total ? pct(o.transitCommuters / total) : "—"}`);
    const d = o.demand;
    const bar = (ref: string, v: number) => {
      r[ref]!.style.width = `${Math.max(0, v) * 100}%`;
      setText(r[ref + "V"]!, `${v > 0 ? "+" : ""}${Math.round(v * 100)}`);
    };
    bar("dR", d.residential);
    bar("dC", d.commercial);
    bar("dI", d.industrial);
    const best = [
      ["résidentielles", d.residential],
      ["commerciales", d.commercial],
      ["industrielles", d.industrial],
    ].sort((a, b) => (b[1] as number) - (a[1] as number))[0]!;
    setText(r.dNote!, (best[1] as number) > 0.15 ? `La ville réclame surtout des zones ${best[0]}.` : "La demande est équilibrée : améliorez la qualité de vie pour faire grandir les bâtiments.");
    const s = o.supply;
    setText(r.pProduced!, fmt(s.produced, 1));
    setText(r.pDelivered!, fmt(s.delivered, 1));
    setText(r.pSold!, fmt(s.sold, 1));
    setText(r.pUnmet!, fmt(s.unmetNeeds, 1));
    setText(r.pImported!, fmt(s.imported, 1));
    setText(r.pExported!, fmt(s.exported, 1));
    setText(r.pTrucks!, fmt(this.sim.production.trucks.length));
    setText(r.tAvg!, pct(o.traffic.avgCongestion));
    setText(r.tJam!, fmt(o.traffic.jammedTiles));
    setText(r.tRoads!, `${fmt(o.traffic.roadTiles)} cases`);
    if (this.sim.economy.history.length !== this.lastHistoryLen) {
      this.lastHistoryLen = this.sim.economy.history.length;
      this.popChart.setData(this.sim.economy.history.slice(-18).map((m) => ({ label: `${MONTHS_SHORT[m.month]} ${String(m.year).slice(2)}`, values: [m.population] })));
    }
  }

  // --------------------------------------------------------------- transit

  private transitPanel(): HTMLElement[] {
    const r = this.refs;
    return [
      h("section.section", {}, [
        h("h3.section-title", {}, "Réseau de bus"),
        h("div.tiles", {}, [
          h("div.tile", {}, [h("div.tile-label", {}, "Usagers quotidiens"), (r.trRiders = h("div.tile-value.num")), (r.trRidersSub = h("div.tile-sub.num"))]),
          h("div.tile", {}, [h("div.tile-label", {}, "Couverture"), (r.trCoverage = h("div.tile-value.num")), h("div.tile-sub", {}, "des bâtiments à pied d'un arrêt")]),
        ]),
      ]),
      h("section.section", {}, [
        h("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:10px" }, [
          h("h3.section-title", { style: "margin:0" }, "Lignes"),
          h("div", { style: "display:flex;gap:6px" }, [
            h("button.btn.small", { onclick: () => this.selectTool("busStop") }, "Poser des arrêts"),
            h("button.btn.small.primary", { onclick: () => this.selectTool("busLine") }, "Nouvelle ligne"),
          ]),
        ]),
        (r.trList = h("div")),
      ]),
      h("section.section", {}, [
        h("h3.section-title", {}, "Comment ça marche"),
        h(
          "p.note",
          {},
          `Les habitants comparent la voiture et le bus. Le bus ignore les embouteillages et ils acceptent des trajets plus longs en bus (${CITIZENS.maxTransitCommute} contre ${CITIZENS.maxCarCommute} en voiture) : il les aide à travailler plus loin. Chaque usager retire une voiture de la route. Un arrêt dessert ${TRANSIT.walkRadius} cases à pied. Plus de bus = moins d'attente. Billet : ${ECONOMY.busFare} $ ; entretien : ${UPKEEP_PER_DAY.bus} $ par bus et par jour.`,
        ),
      ]),
    ];
  }

  private updateTransit(): void {
    const r = this.refs;
    if (!r.trList) return;
    const o = this.sim.overview();
    const t = this.sim.transit;
    const total = o.carCommuters + o.transitCommuters;
    setText(r.trRiders!, fmt(o.transitCommuters * 2));
    setText(r.trRidersSub!, total ? `${pct(o.transitCommuters / total)} des actifs` : "aucun actif");
    let covered = 0;
    let n = 0;
    for (const b of this.sim.world.buildings.values()) {
      n++;
      if (t.coverage[this.sim.world.idx(b.x, b.y)]) covered++;
    }
    setText(r.trCoverage!, n ? pct(covered / n) : "—");
    const sig = t.lines.map((l) => `${l.id}:${l.buses}:${l.stops.length}:${l.broken}:${l.ridersMonth}`).join("|");
    if (sig === this.transitSignature) return;
    this.transitSignature = sig;
    const list = r.trList;
    list.innerHTML = "";
    if (t.lines.length === 0) {
      list.append(
        h("div.empty", {}, [
          "Aucune ligne. Posez au moins deux arrêts sur des routes (outil ",
          h("kbd", {}, "B"),
          "), puis tracez une ligne en les cliquant dans l'ordre (outil ",
          h("kbd", {}, "L"),
          ").",
        ]),
      );
      return;
    }
    for (const line of t.lines) {
      const meta = line.broken
        ? h("div.line-meta.bad", {}, "Interrompue : une route entre deux arrêts a disparu")
        : h("div.line-meta.num", {}, `${line.stops.length} arrêts · ${line.path.length} cases · ${fmt(line.ridersMonth)} trajets ce mois`);
      list.append(
        h("div.line-card", {}, [
          h("div.line-badge", { style: `background:${line.color}` }, String(line.id)),
          h("div.line-name", {}, line.name),
          h("div.stepper", {}, [
            h("button", { "aria-label": "Retirer un bus", html: ICONS.minus, onclick: () => this.busCount(line.id, line.buses - 1) }),
            h("span.num", { title: "Bus en service" }, `${line.buses} bus`),
            h("button", { "aria-label": `Ajouter un bus (${COSTS.bus} $)`, title: `Ajouter un bus (${COSTS.bus} $)`, html: ICONS.plus, onclick: () => this.busCount(line.id, line.buses + 1) }),
          ]),
          meta,
          h("button.icon-btn", {
            "aria-label": `Supprimer ${line.name}`,
            title: "Supprimer la ligne",
            html: ICONS.trash,
            style: "grid-column:3;justify-self:end",
            onclick: () => {
              this.sim.deleteBusLine(line.id);
              this.toast(`${line.name} supprimée.`, "info");
              this.renderDock(false);
            },
          }),
        ]),
      );
    }
  }

  private busCount(lineId: number, n: number): void {
    const res = this.sim.setBusCount(lineId, n);
    if (!res.ok && res.message) this.toast(res.message, "warn");
    this.renderDock(false);
  }

  // ============================================================== inspector

  private buildInspector(): HTMLElement {
    const r = this.refs;
    r.inspector = h("div.inspector.glass.hidden", { role: "dialog", "aria-label": "Inspecteur" }, [
      h("div.insp-head", {}, [
        (r.inspIcon = h("div.insp-icon")),
        h("div", {}, [(r.inspTitle = h("div.insp-title")), (r.inspSub = h("div.insp-sub"))]),
        h("button.insp-close", { "aria-label": "Fermer", html: ICONS.close, onclick: () => this.select(-1) }),
      ]),
      (r.inspBody = h("dl.kv")),
      (r.inspFoot = h("div", { style: "margin-top:12px" })),
    ]);
    return r.inspector;
  }

  select(i: number): void {
    this.selected = i;
    this.renderer.selectedTile = i;
    this.refs.inspector!.classList.toggle("hidden", i < 0);
    this.updateInspector();
  }

  private updateInspector(): void {
    const i = this.selected;
    if (i < 0) return;
    const r = this.refs;
    const sim = this.sim;
    const w = sim.world;
    const rows: Array<[string, string]> = [];
    let icon = ICONS.leaf;
    let color = "#79c26a";
    let title = "Terrain";
    let sub = `Case ${w.xOf(i)}, ${w.yOf(i)}`;
    let foot: HTMLElement | null = null;
    const env = (): void => {
      rows.push(["Valeur foncière", `${Math.round(sim.env.landValue[i]!)} / 100`]);
      rows.push(["Pollution", `${Math.round(sim.env.pollution[i]!)} / 100`]);
      rows.push(["Desserte bus", sim.transit.coverage[i] ? "Oui" : "Non"]);
    };
    const bid = w.buildingAt[i]!;
    if (bid !== -1) {
      const b = w.buildings.get(bid)!;
      const meta = ZONE_META[b.zone];
      icon = meta.icon;
      color = meta.color;
      title = b.abandoned ? `${LEVEL_NAMES[b.zone][b.level]} (abandonné)` : LEVEL_NAMES[b.zone][b.level]!;
      sub = `${meta.name} · niveau ${b.level}`;
      const cap = capacityOf(b);
      if (b.zone === Zone.Residential) {
        const ids = sim.citizens.residentsOf(b.id);
        let happy = 0;
        let employed = 0;
        let bus = 0;
        for (const id of ids) {
          const c = sim.citizens.all.get(id)!;
          happy += c.happiness;
          if (c.jobId !== -1) employed++;
          if (c.mode === CommuteMode.Transit) bus++;
        }
        rows.push(["Habitants", `${b.occupants} / ${cap || CAPACITY.residential[b.level]}`]);
        rows.push(["Bonheur moyen", ids.length ? `${Math.round(happy / ids.length)} %` : "—"]);
        rows.push(["Actifs employés", `${employed} / ${ids.length}`]);
        rows.push(["Vont travailler en bus", `${bus}`]);
        rows.push(["Besoins en biens couverts", pct(b.goodsSatisfaction)]);
        rows.push(["Commerce attitré", b.shopId !== -1 ? "Oui" : "Aucun à portée"]);
      } else if (b.zone === Zone.Commercial) {
        rows.push(["Employés", `${b.occupants} / ${cap}`]);
        rows.push(["Stock en rayon", `${fmt(b.stock, 1)} / ${fmt(shelfCap(b))}`]);
        rows.push(["En cours de livraison", fmt(b.incoming, 1)]);
        rows.push(["Ventes aujourd'hui", fmt(b.activity, 1)]);
        rows.push(["Dernière livraison locale", b.daysSinceDelivery > 400 ? "jamais" : `il y a ${b.daysSinceDelivery} j`]);
      } else {
        rows.push(["Ouvriers", `${b.occupants} / ${cap}`]);
        rows.push(["Production aujourd'hui", fmt(b.activity, 1)]);
        rows.push(["Stock", `${fmt(b.stock, 1)} / ${fmt(storageCap(b))}`]);
      }
      if (b.level < 3 && !b.abandoned) rows.push(["Progression niveau suivant", pct(b.growth)]);
      env();
      if (b.abandoned) foot = h("p.note.warn", {}, "Plus aucun accès routier à l'autoroute. Reconnectez-le ou démolissez-le.");
      else if (b.level < 3 && b.zone === Zone.Residential && sim.env.landValue[i]! < GROWTH.levelLandValue[b.level + 1]!)
        foot = h("p.note", {}, "Pour monter de niveau : plus de valeur foncière (parcs, eau, arrêts de bus, moins de pollution).");
    } else if (w.isRoad(i)) {
      icon = ICONS.road2;
      color = "#c3c6cc";
      title = w.isHighway(i) ? "Autoroute" : w.isBusStop(i) ? "Route avec arrêt de bus" : "Route";
      sub = w.connected[i] ? "Reliée à l'autoroute" : "Non reliée à l'autoroute !";
      const load = sim.traffic.load(i);
      const cap = sim.traffic.capacity(i);
      rows.push(["Trafic (trajets/jour)", fmt(load)]);
      rows.push(["Dont camions", fmt(sim.traffic.freight[i]!)]);
      rows.push(["Dont bus", fmt(sim.traffic.bus[i]!)]);
      rows.push(["Capacité", fmt(cap)]);
      rows.push(["Congestion", pct(load / cap)]);
      const lines = sim.transit.lines.filter((l) => l.path.includes(i)).map((l) => l.name);
      if (lines.length) rows.push(["Lignes", lines.join(", ")]);
      if (load / cap > 1) foot = h("p.note.warn", {}, "Tronçon saturé : ajoutez des routes parallèles ou une ligne de bus.");
      else if (load > TRAFFIC.roadCapacity * 0.7 && !w.isHighway(i)) foot = h("p.note", {}, "Trafic dense.");
    } else if (w.kind[i] === TileKind.Zone) {
      const z = w.zone[i] as ZoneType;
      const meta = ZONE_META[z];
      icon = meta.icon;
      color = meta.color;
      title = `Parcelle ${meta.name.toLowerCase()}`;
      const access = w.accessRoad(i);
      sub = access === -1 ? "Aucune route adjacente" : w.connected[access] ? "Prête à construire" : "Route non reliée à l'autoroute";
      rows.push(["Demande", `${Math.round(sim.growth.demandFor(z) * 100)}`]);
      env();
      if (access === -1 || !w.connected[access]) foot = h("p.note.warn", {}, "Une parcelle a besoin d'une route adjacente reliée à l'autoroute pour se développer.");
    } else if (w.kind[i] === TileKind.Park) {
      title = "Parc";
      sub = `Entretien ${UPKEEP_PER_DAY.park} $ / jour`;
      env();
    } else {
      if (w.terrain[i] === Terrain.Water) {
        icon = ICONS.water;
        color = "#3d8fc9";
        title = "Eau";
      } else if (w.terrain[i] === Terrain.Forest) title = "Forêt";
      env();
    }
    r.inspIcon!.innerHTML = icon;
    r.inspIcon!.style.background = color;
    setText(r.inspTitle!, title);
    setText(r.inspSub!, sub);
    const body = r.inspBody!;
    body.innerHTML = "";
    for (const [k, v] of rows) body.append(h("dt", {}, k), h("dd.num", {}, v));
    r.inspFoot!.innerHTML = "";
    if (foot) r.inspFoot!.append(foot);
  }

  // ================================================================ toasts

  toast(text: string, level: NotifyLevel | "info" = "info"): void {
    const colors = { info: "var(--accent)", good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" };
    const el = h("div.toast.glass", {}, [h("span.pip", { style: `background:${colors[level]}` }), text]);
    const box = this.refs.toasts!;
    box.append(el);
    while (box.childElementCount > 4) box.firstElementChild!.remove();
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 320);
    }, 3600);
  }

  // ================================================================= modal

  private buildModal(): HTMLElement {
    this.refs.modalInner = h("div.modal.glass", { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-title" });
    this.refs.modal = h("div.modal-backdrop.hidden", {}, [this.refs.modalInner]);
    return this.refs.modal;
  }

  get isModalOpen(): boolean {
    return this.modalOpen;
  }

  openModal(kind: "start" | "help"): void {
    const m = this.refs.modalInner!;
    m.innerHTML = "";
    if (!this.modalOpen) {
      this.speedBeforeModal = this.sim.speed || 1;
      this.setSpeed(0);
    }
    this.modalOpen = true;
    this.refs.modal!.classList.remove("hidden");
    const info = readSaveInfo();
    let seed = Math.floor(Math.random() * 999_999) + 1;
    const seedLabel = h("span.num", {}, `Carte n° ${seed}`);
    if (kind === "start") {
      append(m, 
        h("div.brand-mark", { html: ICONS.logo, style: "width:44px;height:44px" }),
        h("h1", { id: "modal-title" }, "Metropolis"),
        h("p", {}, "Tracez les routes, zonez, et regardez votre ville vivre : les habitants cherchent un emploi, les usines produisent, les camions livrent les commerces, et le trafic se fluidifie grâce à vos lignes de bus."),
        info
          ? h("div.save-card", {}, [
              h("span", { html: ICONS.save }),
              h("div", {}, [h("div", { style: "font-weight:700" }, info.cityName), h("div.meta.num", {}, `${fmt(info.population)} habitants · ${MONTHS[Math.floor(info.day / 30) % 12]} ${2030 + Math.floor(info.day / 360)} · sauvegardé le ${new Date(info.savedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`)]),
            ])
          : null,
        h("div.modal-actions", {}, [
          info
            ? h("button.btn.primary", {
                onclick: () => {
                  if (this.actions.load()) this.closeModal(true);
                },
              }, "Continuer la partie")
            : null,
          h(
            `button.btn${info ? "" : ".primary"}` as "button",
            {
              onclick: () => {
                this.actions.newGame(seed);
                this.closeModal(true);
              },
            },
            "Nouvelle ville",
          ),
          h("button.btn", {
            title: "Générer une autre carte",
            onclick: () => {
              seed = Math.floor(Math.random() * 999_999) + 1;
              seedLabel.textContent = `Carte n° ${seed}`;
            },
          }, [h("span", { html: ICONS.dice }), seedLabel]),
          h("button.btn", { onclick: () => this.openModal("help") }, "Comment jouer"),
          !this.firstOpen ? h("button.btn", { onclick: () => this.closeModal(false) }, "Reprendre") : null,
        ]),
      );
    } else {
      const step = (n: number, html: string) => h("li", {}, [h("span.step", {}, String(n)), h("span", { html })]);
      append(m, 
        h("h2", { id: "modal-title" }, "Comment jouer"),
        h("ol.howto", {}, [
          step(1, "<b>Routes.</b> L'autoroute arrive par l'ouest : c'est par là qu'arrivent les habitants et que partent les marchandises. Tracez vos routes à partir d'elle."),
          step(2, "<b>Zonez</b> le long des routes : <b style='color:var(--zone-r)'>résidentiel</b>, <b style='color:var(--zone-c)'>commerce</b>, <b style='color:var(--zone-i)'>industrie</b>. Suivez les jauges de demande RCI en haut à droite."),
          step(3, "<b>Les habitants</b> cherchent un emploi accessible, achètent des biens dans un commerce proche et réagissent aux impôts, à la pollution, aux parcs et à la durée du trajet."),
          step(4, "<b>Les usines</b> produisent des biens que des camions livrent aux commerces. Sans industrie locale, les commerces importent au prix fort ; le surplus est exporté."),
          step(5, "<b>Le trafic</b> ralentit les trajets quand une route sature (vue Trafic). Posez des <b>arrêts</b> puis tracez des <b>lignes de bus</b> pour soulager les routes et relier des quartiers éloignés."),
          step(6, "<b>Le budget</b> : impôts sur les salaires, les ventes et la production, moins l'entretien. Les bâtiments montent de niveau s'ils sont pleins et si la valeur foncière suit."),
        ]),
        h("div.keys", {}, [
          h("span", { html: "<kbd>I</kbd> <kbd>R</kbd> <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>P</kbd> <kbd>B</kbd> <kbd>L</kbd> <kbd>X</kbd> outils" }),
          h("span", { html: "<kbd>Espace</kbd> pause · <kbd>+</kbd> <kbd>−</kbd> vitesse" }),
          h("span", { html: "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> ou flèches : déplacer" }),
          h("span", { html: "Molette : zoom · clic droit glissé : déplacer" }),
          h("span", { html: "<kbd>O</kbd> changer de vue · <kbd>Échap</kbd> annuler" }),
          h("span", { html: "<kbd>Ctrl</kbd>+<kbd>S</kbd> sauvegarder · <kbd>H</kbd> menu" }),
        ]),
        h("div.modal-actions", {}, [h("button.btn.primary", { onclick: () => this.openModal("start") }, "Retour")]),
      );
    }
    (m.querySelector("button.primary") as HTMLButtonElement | null)?.focus();
  }

  /** True until the player has started or loaded a city once. */
  firstOpen = true;

  closeModal(started: boolean): void {
    this.modalOpen = false;
    this.refs.modal!.classList.add("hidden");
    if (started) this.firstOpen = false;
    this.setSpeed(started ? 1 : this.speedBeforeModal);
  }

  // ================================================================ updates

  /** Called a few times per second. */
  update(): void {
    const sim = this.sim;
    const r = this.refs;
    const d = sim.date;
    setText(r.cityName!, sim.cityName);
    setText(r.date!, `${d.day} ${MONTHS[d.month]} ${d.year}`);
    const e = sim.economy;
    setText(r.money!, money(e.money));
    r.money!.classList.toggle("neg", e.money < 0);
    const proj = e.projectedMonthlyNet(d.day);
    setText(r.moneySub!, `${signedMoney(proj)} / mois`);
    r.moneySub!.className = `stat-sub num ${proj >= 0 ? "pos" : "neg"}`;
    const o = sim.citizens.stats;
    setText(r.pop!, fmt(o.population));
    setText(r.popSub!, o.population ? `${pct(o.employed / o.population)} employés` : "aucun habitant");
    setText(r.happy!, o.population ? `${Math.round(o.avgHappiness)} %` : "—");
    setText(r.happySub!, o.population ? (o.avgHappiness >= 60 ? "épanouis" : o.avgHappiness >= 40 ? "satisfaits" : "mécontents") : "");
    setText(r.transit!, `${sim.transit.lines.length} ligne${sim.transit.lines.length > 1 ? "s" : ""}`);
    setText(r.transitSub!, `${fmt(o.transitCommuters * 2)} trajets/j`);
    const dm = sim.growth.demand;
    const rci = (ref: string, v: number) => {
      const el = r[ref]!;
      const hgt = Math.min(50, Math.abs(v) * 50);
      el.style.height = `${hgt}%`;
      el.style.top = v >= 0 ? `${50 - hgt}%` : "50%";
      el.style.opacity = v >= 0 ? "1" : "0.45";
    };
    rci("rciR", dm.residential);
    rci("rciC", dm.commercial);
    rci("rciI", dm.industrial);
    this.speedButtons.forEach((b, i) => b.classList.toggle("active", i === sim.speed));
    if (this.dockTab) this.renderDock(false);
    if (this.selected >= 0) this.updateInspector();
    this.updateHintCostOnly();
  }

  private updateHintCostOnly(): void {
    const cost = this.tools.previewCost;
    this.refs.hintCost!.classList.toggle("bad", cost > 0 && !this.sim.economy.canAfford(cost));
  }

  /** Re-renders everything that depends on the city as a whole (after new game / load). */
  resetView(): void {
    this.select(-1);
    this.setOverlay("none");
    this.selectTool("inspect");
    if (this.dockTab) this.renderDock(true);
    this.update();
  }
}
