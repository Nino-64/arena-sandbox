import { DAYS_PER_MONTH, START_MONEY, TAX } from "../core/config";
import type { MonthReport, ZoneType } from "../core/types";
import { Zone } from "../core/types";

export interface Ledger {
  income: { residential: number; commercial: number; industrial: number; transit: number };
  expenses: { roads: number; transit: number; parks: number };
  construction: number;
}

const emptyLedger = (): Ledger => ({
  income: { residential: 0, commercial: 0, industrial: 0, transit: 0 },
  expenses: { roads: 0, transit: 0, parks: 0 },
  construction: 0,
});

/**
 * Treasury, tax rates and the monthly books. Every coin that enters or leaves
 * the city goes through `earn`, `pay` or `spend`, so the report always adds up.
 */
export class Economy {
  money = START_MONEY;
  taxes: Record<ZoneType, number> = {
    [Zone.Residential]: TAX.default,
    [Zone.Commercial]: TAX.default,
    [Zone.Industrial]: TAX.default,
  };
  current: Ledger = emptyLedger();
  history: MonthReport[] = [];
  /** Money at the start of the current month, to show the monthly delta. */
  monthStartMoney = START_MONEY;

  reset(): void {
    this.money = START_MONEY;
    this.taxes = { [Zone.Residential]: TAX.default, [Zone.Commercial]: TAX.default, [Zone.Industrial]: TAX.default };
    this.current = emptyLedger();
    this.history = [];
    this.monthStartMoney = START_MONEY;
  }

  rate(zone: ZoneType): number {
    return this.taxes[zone] / 100;
  }

  setTax(zone: ZoneType, percent: number): void {
    this.taxes[zone] = Math.max(TAX.min, Math.min(TAX.max, Math.round(percent)));
  }

  canAfford(cost: number): boolean {
    return cost <= 0 || this.money >= cost;
  }

  /** Construction or demolition. Returns false (and charges nothing) if broke. */
  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    this.money -= cost;
    this.current.construction += cost;
    return true;
  }

  earn(kind: keyof Ledger["income"], amount: number): void {
    if (amount <= 0) return;
    this.money += amount;
    this.current.income[kind] += amount;
  }

  pay(kind: keyof Ledger["expenses"], amount: number): void {
    if (amount <= 0) return;
    this.money -= amount;
    this.current.expenses[kind] += amount;
  }

  /** Closes the month: archives the ledger and starts a new one. */
  closeMonth(month: number, year: number, population: number): MonthReport {
    const report: MonthReport = {
      month,
      year,
      income: { ...this.current.income },
      expenses: { ...this.current.expenses },
      construction: this.current.construction,
      balance: this.money,
      population,
    };
    this.history.push(report);
    if (this.history.length > 48) this.history.shift();
    this.current = emptyLedger();
    this.monthStartMoney = this.money;
    return report;
  }

  static totalIncome(l: Pick<Ledger, "income">): number {
    const i = l.income;
    return i.residential + i.commercial + i.industrial + i.transit;
  }

  static totalExpenses(l: Pick<Ledger, "expenses">): number {
    const e = l.expenses;
    return e.roads + e.transit + e.parks;
  }

  /**
   * Projected monthly net from the running month (operations only, no
   * construction), extrapolated from the days elapsed.
   */
  projectedMonthlyNet(dayOfMonth: number): number {
    const days = Math.max(1, dayOfMonth);
    const net = Economy.totalIncome(this.current) - Economy.totalExpenses(this.current);
    return (net / days) * DAYS_PER_MONTH;
  }
}
