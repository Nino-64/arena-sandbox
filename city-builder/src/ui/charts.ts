import { compactMoney, h, money } from "./dom";

export interface ChartPoint {
  label: string;
  values: number[];
}

export interface SeriesDef {
  name: string;
  color: string;
}

const INK_MUTED = "#7f8ba1";
const GRID = "rgba(255,255,255,0.07)";

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

/**
 * Small canvas chart with a hover layer. `kind: "line"` draws one series as a
 * 2px line with a crosshair; `kind: "bars"` draws grouped bars per period.
 * Text stays in neutral ink; colour only marks the data.
 */
export class MiniChart {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private tip: HTMLDivElement;
  private empty: HTMLDivElement;
  private data: ChartPoint[] = [];
  private hover = -1;
  private layout = { left: 44, right: 8, top: 8, bottom: 18, w: 0, h: 0 };

  constructor(
    private readonly kind: "line" | "bars",
    private readonly series: SeriesDef[],
    emptyText: string,
    ariaLabel: string,
  ) {
    this.canvas = h("canvas", { role: "img", "aria-label": ariaLabel });
    this.tip = h("div.chart-tip");
    this.empty = h("div.chart-empty", {}, emptyText);
    const legend =
      series.length > 1
        ? h(
            "div.chart-legend",
            {},
            series.map((s) => h("span", {}, [h("i.dot", { style: `background:${s.color}` }), s.name])),
          )
        : null;
    this.el = h("div.chart", {}, [legend, this.canvas, this.empty, this.tip]);
    this.canvas.addEventListener("pointermove", (e) => this.onMove(e));
    this.canvas.addEventListener("pointerleave", () => {
      this.hover = -1;
      this.tip.style.opacity = "0";
      this.draw();
    });
  }

  setData(data: ChartPoint[]): void {
    this.data = data;
    const hasData = data.length >= 2;
    this.canvas.style.display = hasData ? "block" : "none";
    this.empty.style.display = hasData ? "none" : "grid";
    if (hasData) this.draw();
  }

  private scale(): { min: number; max: number } {
    let min = 0;
    let max = 0;
    for (const p of this.data) for (const v of p.values) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    return { min: min < 0 ? -niceMax(-min) : 0, max: niceMax(max) };
  }

  draw(): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0) return;
    if (c.width !== Math.round(rect.width * dpr) || c.height !== Math.round(rect.height * dpr)) {
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const L = this.layout;
    L.w = rect.width - L.left - L.right;
    L.h = rect.height - L.top - L.bottom;
    const { min, max } = this.scale();
    const y = (v: number) => L.top + L.h - ((v - min) / (max - min || 1)) * L.h;

    // Recessive grid and axis labels.
    ctx.font = "500 10px Inter, system-ui, sans-serif";
    ctx.fillStyle = INK_MUTED;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const ticks = 3;
    for (let k = 0; k <= ticks; k++) {
      const v = min + ((max - min) * k) / ticks;
      ctx.strokeStyle = Math.abs(v) < 1e-9 && min < 0 ? "rgba(255,255,255,0.25)" : GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L.left, Math.round(y(v)) + 0.5);
      ctx.lineTo(L.left + L.w, Math.round(y(v)) + 0.5);
      ctx.stroke();
      ctx.fillText(compactMoney(v), L.left - 6, y(v));
    }
    const n = this.data.length;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const step = L.w / n;
    // Label every Nth period, always the latest one, and never two labels closer than ~56px.
    const labelEvery = Math.max(1, Math.ceil(56 / step));
    let lastX = Infinity;
    for (let k = n - 1; k >= 0; k--) {
      const x = L.left + step * (k + 0.5);
      if ((n - 1 - k) % labelEvery !== 0 || lastX - x < 56) continue;
      ctx.fillText(this.data[k]!.label, x, L.top + L.h + 5);
      lastX = x;
    }

    if (this.kind === "bars") {
      const groupW = Math.min(26, step * 0.78);
      const gap = 2;
      const barW = (groupW - gap * (this.series.length - 1)) / this.series.length;
      this.data.forEach((p, k) => {
        const x0 = L.left + step * (k + 0.5) - groupW / 2;
        p.values.forEach((v, s) => {
          const top = y(v);
          const base = y(0);
          const hgt = Math.max(1, base - top);
          ctx.fillStyle = this.series[s]!.color;
          ctx.globalAlpha = this.hover === -1 || this.hover === k ? 1 : 0.45;
          const x = x0 + s * (barW + gap);
          const r = Math.min(4, barW / 2, hgt);
          ctx.beginPath();
          ctx.moveTo(x, base);
          ctx.lineTo(x, top + r);
          ctx.quadraticCurveTo(x, top, x + r, top);
          ctx.lineTo(x + barW - r, top);
          ctx.quadraticCurveTo(x + barW, top, x + barW, top + r);
          ctx.lineTo(x + barW, base);
          ctx.closePath();
          ctx.fill();
        });
      });
      ctx.globalAlpha = 1;
    } else {
      const color = this.series[0]!.color;
      const px = (k: number) => L.left + step * (k + 0.5);
      const grad = ctx.createLinearGradient(0, L.top, 0, L.top + L.h);
      grad.addColorStop(0, color + "40");
      grad.addColorStop(1, color + "00");
      ctx.beginPath();
      this.data.forEach((p, k) => (k === 0 ? ctx.moveTo(px(k), y(p.values[0]!)) : ctx.lineTo(px(k), y(p.values[0]!))));
      ctx.lineTo(px(n - 1), y(Math.max(min, 0)));
      ctx.lineTo(px(0), y(Math.max(min, 0)));
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      this.data.forEach((p, k) => (k === 0 ? ctx.moveTo(px(k), y(p.values[0]!)) : ctx.lineTo(px(k), y(p.values[0]!))));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
      const mark = this.hover >= 0 ? this.hover : n - 1;
      if (this.hover >= 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px(mark) + 0.5, L.top);
        ctx.lineTo(px(mark) + 0.5, L.top + L.h);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.strokeStyle = "#131a27";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(mark), y(this.data[mark]!.values[0]!), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.data.length < 2) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.layout.left;
    const k = Math.max(0, Math.min(this.data.length - 1, Math.floor((x / this.layout.w) * this.data.length)));
    if (k !== this.hover) {
      this.hover = k;
      this.draw();
    }
    const p = this.data[k]!;
    this.tip.innerHTML = "";
    this.tip.append(h("b", {}, p.label));
    p.values.forEach((v, s) => {
      this.tip.append(h("div", {}, [h("i.dot", { style: `background:${this.series[s]!.color}` }), `${this.series[s]!.name} : `, h("strong.num", {}, money(v))]));
    });
    const tipW = this.tip.offsetWidth;
    const left = Math.min(rect.width - tipW - 4, Math.max(4, e.clientX - rect.left + 12));
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${e.clientY - rect.top - 10}px`;
    this.tip.style.opacity = "1";
  }
}
