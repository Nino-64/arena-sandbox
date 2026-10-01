import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "./styles.css";
import { SPEED_MULTIPLIERS } from "./core/config";
import type { ToolId } from "./core/types";
import { TOOLS, ToolController } from "./input/tools";
import { Camera } from "./render/camera";
import { Renderer } from "./render/renderer";
import { loadFromStorage, saveToStorage } from "./sim/save";
import { Simulation } from "./sim/simulation";
import { GameUI } from "./ui/game-ui";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLElement;

const sim = new Simulation(Math.floor(Math.random() * 999_999) + 1);
const camera = new Camera(sim.world.size);
const renderer = new Renderer(canvas, sim, camera);
const tools = new ToolController(sim, renderer);

function centerOnHighway(): void {
  const hy = sim.world.yOf(sim.world.highwayEntry);
  camera.centerOn(12, hy + 0.5);
  camera.zoom = camera.targetZoom = 1.15;
}

function wireSimEvents(): void {
  sim.events = {
    onNotify: (n) => ui.toast(n.text, n.level),
    onMonth: () => {
      const res = saveToStorage(sim);
      if (!res.ok) ui.toast(`Sauvegarde automatique impossible : ${res.message}`, "warn");
    },
    onBuildingEvent: (b, kind) => renderer.onBuildingEvent(b, kind),
  };
}

const ui = new GameUI(uiRoot, sim, tools, renderer, {
  newGame: (seed) => {
    sim.newGame(seed);
    wireSimEvents();
    centerOnHighway();
    ui.resetView();
    ui.toast(`Bienvenue à ${sim.cityName} ! Reliez vos routes à l'autoroute, à l'ouest.`, "info");
  },
  save: () => {
    const res = saveToStorage(sim);
    ui.toast(res.ok ? "Partie sauvegardée." : `Sauvegarde impossible : ${res.message}`, res.ok ? "good" : "bad");
  },
  load: () => {
    const res = loadFromStorage(sim);
    if (!res.ok) {
      ui.toast(res.message ?? "Chargement impossible.", "bad");
      return false;
    }
    wireSimEvents();
    centerOnHighway();
    ui.resetView();
    ui.toast(`${sim.cityName} chargée.`, "good");
    return true;
  },
});
wireSimEvents();
centerOnHighway();

// ------------------------------------------------------------------ layout

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
}
window.addEventListener("resize", resize);
resize();

// ------------------------------------------------------------------- input

let panning: { x: number; y: number; id: number } | null = null;
let lastPointer = { x: 0, y: 0 };

const tileAt = (e: PointerEvent | MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  return camera.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
};

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  lastPointer = { x: e.clientX, y: e.clientY };
  if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
    panning = { x: e.clientX, y: e.clientY, id: e.pointerId };
    canvas.classList.add("panning");
    return;
  }
  if (e.button === 0) {
    const t = tileAt(e);
    tools.pointerDown(t.x, t.y);
  }
});

canvas.addEventListener("pointermove", (e) => {
  lastPointer = { x: e.clientX, y: e.clientY };
  if (panning && panning.id === e.pointerId) {
    camera.pan(e.clientX - panning.x, e.clientY - panning.y);
    panning.x = e.clientX;
    panning.y = e.clientY;
  }
  const t = tileAt(e);
  tools.pointerMove(t.x, t.y);
});

const endPointer = (e: PointerEvent) => {
  if (panning && panning.id === e.pointerId) {
    panning = null;
    canvas.classList.remove("panning");
    return;
  }
  tools.pointerUp();
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("pointerleave", () => tools.pointerLeave());

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    camera.zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
  },
  { passive: false },
);

const held = new Set<string>();
const PAN_KEYS: Record<string, [number, number]> = {
  arrowleft: [1, 0],
  arrowright: [-1, 0],
  arrowup: [0, 1],
  arrowdown: [0, -1],
  a: [1, 0],
  q: [1, 0],
  d: [-1, 0],
  w: [0, 1],
  z: [0, 1],
  s: [0, -1],
};

window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === "s") {
    e.preventDefault();
    const res = saveToStorage(sim);
    ui.toast(res.ok ? "Partie sauvegardée." : `Sauvegarde impossible : ${res.message}`, res.ok ? "good" : "bad");
    return;
  }
  if (ui.isModalOpen) {
    if (key === "escape" && !ui.firstOpen) ui.closeModal(false);
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (PAN_KEYS[key]) {
    held.add(key);
    e.preventDefault();
    return;
  }
  // Buttons handle their own Space/Enter when focused.
  const onButton = target.tagName === "BUTTON";
  if (key === " " && !onButton) {
    e.preventDefault();
    ui.setSpeed(sim.speed === 0 ? 1 : 0);
    return;
  }
  if (key === "+" || key === "=") return ui.setSpeed(Math.min(SPEED_MULTIPLIERS.length - 1, sim.speed + 1));
  if (key === "-") return ui.setSpeed(Math.max(0, sim.speed - 1));
  if (key === "escape") {
    tools.cancel();
    ui.selectTool(tools.tool);
    return;
  }
  if (key === "enter" && !onButton) return tools.finishLine();
  if (key === "backspace") {
    e.preventDefault();
    return tools.removeLastStop();
  }
  if (key === "o") return ui.cycleOverlay();
  if (key === "h") return ui.openModal("start");
  const tool = TOOLS.find((t) => t.key.toLowerCase() === key);
  if (tool) ui.selectTool(tool.id as ToolId);
});

window.addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => held.clear());

window.addEventListener("beforeunload", () => {
  if (!ui.firstOpen) saveToStorage(sim);
});

// -------------------------------------------------------------------- loop

let last = performance.now();
let uiClock = 0;

function loop(now: number): void {
  const dtMs = Math.min(100, now - last);
  last = now;
  const dt = dtMs / 1000;

  if (held.size > 0) {
    let dx = 0;
    let dy = 0;
    for (const k of held) {
      const v = PAN_KEYS[k];
      if (v) {
        dx += v[0];
        dy += v[1];
      }
    }
    camera.pan(dx * 620 * dt, dy * 620 * dt);
    const t = camera.screenToTile(lastPointer.x - canvas.getBoundingClientRect().left, lastPointer.y - canvas.getBoundingClientRect().top);
    tools.pointerMove(t.x, t.y);
  }

  const dtDays = ui.isModalOpen ? 0 : sim.update(dtMs);
  renderer.frame(dt, dtDays);

  uiClock += dtMs;
  if (uiClock > 220) {
    uiClock = 0;
    ui.update();
  }
  requestAnimationFrame(loop);
}

ui.update();
ui.openModal("start");
requestAnimationFrame(loop);

// Development-only handle for automated browser checks.
if (import.meta.env.DEV) {
  (window as unknown as { __metropolis: unknown }).__metropolis = { sim, camera, ui, renderer, tools };
}
