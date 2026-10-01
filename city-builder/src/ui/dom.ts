type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

/** Minimal element builder: h("div.class.other", { attrs }, children). */
export function h<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}`,
  attrs: Attrs = {},
  children: Array<Node | string | null | undefined> | string = [],
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split(".") as [K, ...string[]];
  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(" ");
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, "").toLowerCase(), v as EventListener);
    else if (k === "html") el.innerHTML = String(v);
    else if (k === "style") el.setAttribute("style", String(v));
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  if (typeof children === "string") el.textContent = children;
  else for (const c of children) if (c !== null && c !== undefined) el.append(c);
  return el;
}

/** Sets text only when it changed, to avoid layout churn on frequent HUD updates. */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function fmt(n: number, digits = 0): string {
  return (digits === 0 ? nf0 : nf1).format(n);
}

export function money(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}${nf0.format(Math.abs(Math.round(n)))} $`;
}

export function signedMoney(n: number): string {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${nf0.format(Math.abs(r))} $`;
}

export function compactMoney(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}${nf1.format(a / 1_000_000)} M$`;
  if (a >= 10_000) return `${sign}${nf0.format(a / 1000)} k$`;
  return `${sign}${nf0.format(a)} $`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)} %`;
}

export const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
export const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Appends children, skipping null/undefined (for conditional UI pieces). */
export function append(el: Element, ...children: Array<Node | string | null | undefined>): void {
  for (const c of children) if (c !== null && c !== undefined) el.append(c);
}
