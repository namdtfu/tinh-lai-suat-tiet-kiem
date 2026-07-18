import {
  calculateAccountBalance,
  calculateTotalsByCurrency,
} from "./finance.ts";
import type {
  FinanceCurrency,
  FinanceState,
} from "./finance.ts";

export type ExchangeRateSource = "actual" | "reference";

export type ExchangeRateSettings = {
  baseCurrency: FinanceCurrency;
  krwToVndRate: number;
  source: ExchangeRateSource;
  updatedAt: string;
};

export type FinancialGoalType =
  | "emergency"
  | "home"
  | "travel"
  | "education"
  | "custom";

export type FinancialGoal = {
  id: string;
  name: string;
  type: FinancialGoalType;
  targetAmount: number;
  currency: FinanceCurrency;
  deadline?: string;
  linkedAccountIds: string[];
  linkedSavingsIds: number[];
  manualAmount: number;
  createdAt: string;
};

export type GoalSavingsSource = {
  id: number;
  name: string;
  currentValueVnd: number;
  bankName?: string;
};

export type NetWorthSnapshot = {
  accountKrw: number;
  accountVnd: number;
  baseCurrency: FinanceCurrency;
  liquidInBase: number;
  prosperityInBase: number;
  savingsInBase: number;
  totalInBase: number;
};

export type FinancialGoalProgress = {
  accountValue: number;
  currentAmount: number;
  manualAmount: number;
  percentage: number;
  remaining: number;
  savingsValue: number;
};

export const DEFAULT_EXCHANGE_SETTINGS: ExchangeRateSettings = {
  baseCurrency: "VND",
  krwToVndRate: 18,
  source: "reference",
  updatedAt: "",
};

const CURRENCIES = new Set<FinanceCurrency>(["KRW", "VND"]);
const GOAL_TYPES = new Set<FinancialGoalType>([
  "emergency",
  "home",
  "travel",
  "education",
  "custom",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeExchangeSettings(
  value: unknown,
): ExchangeRateSettings {
  if (!isRecord(value)) return { ...DEFAULT_EXCHANGE_SETTINGS };
  const rate = Number(value.krwToVndRate);
  return {
    baseCurrency: CURRENCIES.has(value.baseCurrency as FinanceCurrency)
      ? (value.baseCurrency as FinanceCurrency)
      : DEFAULT_EXCHANGE_SETTINGS.baseCurrency,
    krwToVndRate:
      Number.isFinite(rate) && rate > 0 && rate < 10_000
        ? rate
        : DEFAULT_EXCHANGE_SETTINGS.krwToVndRate,
    source: value.source === "actual" ? "actual" : "reference",
    updatedAt:
      typeof value.updatedAt === "string" ? value.updatedAt.slice(0, 40) : "",
  };
}

export function normalizeFinancialGoals(value: unknown): FinancialGoal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = typeof candidate.id === "string" ? candidate.id.slice(0, 120) : "";
    const name =
      typeof candidate.name === "string" ? candidate.name.trim().slice(0, 120) : "";
    const targetAmount = Number(candidate.targetAmount);
    const manualAmount = Number(candidate.manualAmount);
    if (!id || !name || !Number.isFinite(targetAmount) || targetAmount <= 0) {
      return [];
    }
    const linkedAccountIds = Array.isArray(candidate.linkedAccountIds)
      ? candidate.linkedAccountIds.flatMap((item) =>
          typeof item === "string" && item ? [item.slice(0, 100)] : [],
        )
      : [];
    const linkedSavingsIds = Array.isArray(candidate.linkedSavingsIds)
      ? candidate.linkedSavingsIds.flatMap((item) => {
          const idValue = Number(item);
          return Number.isFinite(idValue) && idValue > 0 ? [idValue] : [];
        })
      : [];
    const deadline =
      typeof candidate.deadline === "string" && candidate.deadline.length === 10
        ? candidate.deadline
        : undefined;
    return [{
      id,
      name,
      type: GOAL_TYPES.has(candidate.type as FinancialGoalType)
        ? (candidate.type as FinancialGoalType)
        : "custom",
      targetAmount,
      currency: CURRENCIES.has(candidate.currency as FinanceCurrency)
        ? (candidate.currency as FinanceCurrency)
        : "VND",
      ...(deadline ? { deadline } : {}),
      linkedAccountIds: [...new Set(linkedAccountIds)],
      linkedSavingsIds: [...new Set(linkedSavingsIds)],
      manualAmount:
        Number.isFinite(manualAmount) && manualAmount > 0 ? manualAmount : 0,
      createdAt:
        typeof candidate.createdAt === "string"
          ? candidate.createdAt.slice(0, 40)
          : new Date(0).toISOString(),
    }];
  });
}

export function convertCurrency(
  amount: number,
  from: FinanceCurrency,
  to: FinanceCurrency,
  settings: ExchangeRateSettings,
) {
  if (from === to) return amount;
  const rate = Math.max(0.000001, settings.krwToVndRate);
  return from === "KRW" ? amount * rate : amount / rate;
}

export function calculateNetWorth(
  finance: FinanceState,
  savingsValueVnd: number,
  settings: ExchangeRateSettings,
  prosperityValueVnd = 0,
): NetWorthSnapshot {
  const totals = calculateTotalsByCurrency(finance);
  const liquidInBase =
    convertCurrency(totals.KRW, "KRW", settings.baseCurrency, settings) +
    convertCurrency(totals.VND, "VND", settings.baseCurrency, settings);
  const savingsInBase = convertCurrency(
    savingsValueVnd,
    "VND",
    settings.baseCurrency,
    settings,
  );
  const prosperityInBase = convertCurrency(
    prosperityValueVnd,
    "VND",
    settings.baseCurrency,
    settings,
  );
  return {
    accountKrw: totals.KRW,
    accountVnd: totals.VND,
    baseCurrency: settings.baseCurrency,
    liquidInBase,
    prosperityInBase,
    savingsInBase,
    totalInBase: liquidInBase + savingsInBase + prosperityInBase,
  };
}

export function calculateFinancialGoalProgress(
  goal: FinancialGoal,
  finance: FinanceState,
  savingsSources: GoalSavingsSource[],
  settings: ExchangeRateSettings,
): FinancialGoalProgress {
  const accountIds = new Set(goal.linkedAccountIds);
  const accountValue = finance.accounts.reduce((sum, account) => {
    if (!accountIds.has(account.id)) return sum;
    const balance = calculateAccountBalance(account, finance.transactions);
    return sum + convertCurrency(balance, account.currency, goal.currency, settings);
  }, 0);
  const savingsIds = new Set(goal.linkedSavingsIds);
  const savingsValue = savingsSources.reduce((sum, item) => {
    if (!savingsIds.has(item.id)) return sum;
    return sum + convertCurrency(item.currentValueVnd, "VND", goal.currency, settings);
  }, 0);
  const currentAmount = accountValue + savingsValue + goal.manualAmount;
  return {
    accountValue,
    currentAmount,
    manualAmount: goal.manualAmount,
    percentage: Math.min(100, Math.max(0, (currentAmount / goal.targetAmount) * 100)),
    remaining: Math.max(0, goal.targetAmount - currentAmount),
    savingsValue,
  };
}
