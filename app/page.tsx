"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CloudConflictError,
  CloudSession,
  consumeMagicLinkSession,
  ensureCloudSession,
  isCloudConfigured,
  isNewerCloudUpdate,
  readCloudState,
  restoreCloudSession,
  sendMagicLink,
  signInWithPassword,
  signOutCloud,
  updateCloudPassword,
  writeCloudState,
} from "@/lib/supabase-rest";
import {
  CloudRealtimeStatus,
  subscribeToCloudState,
} from "@/lib/supabase-realtime";
import FinanceManager from "./finance-manager";
import FinancialGoals from "./financial-goals";
import {
  createDefaultFinanceState,
  FinanceState,
  getCategorySpent,
  hasMeaningfulFinanceData,
  normalizeFinanceState,
  reconcileSavingsFundingTransactions,
} from "@/lib/finance";
import {
  DEFAULT_EXCHANGE_SETTINGS,
  ExchangeRateSettings,
  FinancialGoal,
  GoalSavingsSource,
  normalizeExchangeSettings,
  normalizeFinancialGoals,
} from "@/lib/planning";
import { buildSavingsTrend } from "@/lib/savings-trend";

const DEFAULT_INTEREST_RATES = [9, 8.5, 8, 7.5, 7, 6.5, 6];
const SAVINGS_KEY = "savings";
const RATES_KEY = "interestRates";
const CASH_LEDGER_KEY = "cashLedger";
const GOAL_SETTINGS_KEY = "goalSettings";
const FINANCE_KEY = "financeState";
const EXCHANGE_SETTINGS_KEY = "exchangeSettings";
const FINANCIAL_GOALS_KEY = "financialGoals";
const VERSION_HISTORY_KEY = "versionHistory";
const WORKSPACE_KEY = "activeWorkspace";
const BACKUP_APP_ID = "tinh-lai-suat-tiet-kiem";
const BACKUP_FORMAT_VERSION = 6;
const MAX_BACKUP_SIZE = 5_000_000;
const INTEREST_DEDUCTION_RATE = 0.05;
const AVERAGE_DAYS_PER_MONTH = 365 / 12;
const MAX_GOAL_MONTHS = 1_200;
const SAVINGS_TREND_CHART = {
  bottom: 248,
  height: 270,
  left: 76,
  right: 902,
  top: 18,
  width: 920,
} as const;

type FormMode = "add" | "edit" | "reinvest";
type AppWorkspace = "savings" | "finance" | "goals";
type SavingsStatus = "active" | "settled";
type MaturityInstruction = "decide-later" | "return" | "reinvest-all";

type SavingsCycle = {
  amount: number;
  interestRate: number;
  term: number;
  startDate: string;
  maturityDate: string;
  interest: number;
  tax: number;
  interestAfterTax: number;
  totalAmount: number;
  reinvestedAmount?: number;
  cashRemainder?: number;
  additionalContribution?: number;
};

type SavingsItem = SavingsCycle & {
  id: number;
  name: string;
  history: SavingsCycle[];
  bankName?: string;
  fundingAccountId?: string;
  settlementAccountId?: string;
  maturityInstruction: MaturityInstruction;
  status: SavingsStatus;
  settledAt?: string;
  actualSettlementAmount?: number;
};

type SavingsForm = {
  name: string;
  amount: string;
  interestRate: string;
  customInterestRate: string;
  term: string;
  startDate: string;
  bankName: string;
  fundingAccountId: string;
  settlementAccountId: string;
  maturityInstruction: MaturityInstruction;
};

type GoalSettings = {
  interestRate: string;
  monthlyContribution: string;
  monthlyInterest: string;
};

type SettlementDraft = {
  accountId: string;
  amount: string;
  date: string;
};

type CashLedgerEntry = {
  id: string;
  amount: number;
  date: string;
  savingsId: number;
  savingsName: string;
  status: "available" | "used";
  type: "reinvestment-remainder";
  usedAt?: string;
};

type BackupPayload = {
  app: typeof BACKUP_APP_ID;
  version: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  savings: SavingsItem[];
  interestRates: number[];
  cashLedger: CashLedgerEntry[];
  finance: FinanceState;
  goal: GoalSettings;
  exchange: ExchangeRateSettings;
  financialGoals: FinancialGoal[];
  versionHistory: AppVersion[];
};

type BackupStatus = {
  kind: "success" | "error";
  text: string;
};

type CloudAppState = {
  cashLedger: CashLedgerEntry[];
  goal: GoalSettings;
  interestRates: number[];
  savings: SavingsItem[];
  finance: FinanceState;
  exchange: ExchangeRateSettings;
  financialGoals: FinancialGoal[];
  versionHistory: AppVersion[];
  schemaVersion: 5;
};

type AppStateCore = {
  cashLedger: CashLedgerEntry[];
  exchange: ExchangeRateSettings;
  finance: FinanceState;
  financialGoals: FinancialGoal[];
  goal: GoalSettings;
  interestRates: number[];
  savings: SavingsItem[];
};

type AppVersion = {
  id: string;
  createdAt: string;
  label: string;
  data: AppStateCore;
};

type CloudConflict = {
  remoteState: CloudAppState;
  updatedAt: string;
};

type AuthStatus = "checking" | "local" | "signed-in" | "signed-out";
type CloudSyncStatus = "idle" | "saving" | "saved" | "error";

type InterestGoalPlan = {
  capitalGap: number;
  currentMonthlyInterest: number;
  monthsToGoal: number | null;
  monthlyNetRate: number;
  progress: number;
  projectedContributions: number | null;
  projectedGrowth: number | null;
  requiredCapital: number;
  targetDate: string | null;
};

type CashflowPeriod = 12 | 24;

type CashflowMonth = {
  interest: number;
  items: SavingsItem[];
  key: string;
  principal: number;
  total: number;
};

const emptyForm = (startDate = ""): SavingsForm => ({
  name: "",
  amount: "",
  interestRate: "",
  customInterestRate: "",
  term: "",
  startDate,
  bankName: "",
  fundingAccountId: "",
  settlementAccountId: "",
  maturityInstruction: "decide-later",
});

const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function getTodayIso() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toLocalIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonthsClamped(startDate: string, months: number) {
  const source = parseLocalDate(startDate);
  const originalDay = source.getDate();
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(originalDay, lastDay));
  return toLocalIso(target);
}

function addDays(dateString: string, days: number) {
  const target = parseLocalDate(dateString);
  target.setDate(target.getDate() + days);
  return toLocalIso(target);
}

function daysBetween(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function signedDaysBetween(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((end - start) / 86_400_000);
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7);
}

function getMonthStart(dateString: string) {
  return `${getMonthKey(dateString)}-01`;
}

function getTermProgress(startDate: string, maturityDate: string) {
  const today = getTodayIso();
  const totalDays = Math.max(1, daysBetween(startDate, maturityDate));
  const isBeforeStart = today < startDate;
  const isComplete = today >= maturityDate;
  const elapsedDays = isBeforeStart
    ? 0
    : isComplete
      ? totalDays
      : Math.min(totalDays, daysBetween(startDate, today));
  const percentage = Math.min(
    100,
    Math.max(0, (elapsedDays / totalDays) * 100),
  );
  const remainingDays = Math.max(0, totalDays - elapsedDays);

  return {
    elapsedDays,
    isComplete,
    percentage,
    remainingDays,
    status: isBeforeStart
      ? "Chưa bắt đầu"
      : isComplete
        ? "Đã đến ngày đáo hạn"
        : `Còn ${remainingDays} ngày`,
    totalDays,
  };
}

function calculateSavings(
  amount: number,
  interestRate: number,
  term: number,
  startDate: string,
) {
  const maturityDate = addMonthsClamped(startDate, term);
  const days = daysBetween(startDate, maturityDate);
  const dailyRate = interestRate / 100 / 365;
  const interest = amount * ((1 + dailyRate) ** days - 1);
  const tax = interest * INTEREST_DEDUCTION_RATE;
  const interestAfterTax = interest - tax;

  return {
    maturityDate,
    interest,
    tax,
    interestAfterTax,
    totalAmount: amount + interestAfterTax,
  };
}

function calculateAccruedInterest(cycle: SavingsCycle, date: string) {
  const calculationDate =
    date <= cycle.startDate
      ? cycle.startDate
      : date < cycle.maturityDate
        ? date
        : cycle.maturityDate;
  const elapsedDays = daysBetween(cycle.startDate, calculationDate);
  const interest = Math.floor(
    cycle.amount * (cycle.interestRate / 100) * (elapsedDays / 365),
  );
  const tax = interest * INTEREST_DEDUCTION_RATE;
  const interestAfterTax = interest - tax;

  return {
    calculationDate,
    elapsedDays,
    interest,
    tax,
    interestAfterTax,
    totalAmount: cycle.amount + interestAfterTax,
  };
}

function calculateInterestToday(cycle: SavingsCycle, date: string) {
  const accruedToday = calculateAccruedInterest(cycle, date);
  const accruedYesterday = calculateAccruedInterest(cycle, addDays(date, -1));
  const interest = Math.max(
    0,
    accruedToday.interest - accruedYesterday.interest,
  );
  const tax = interest * INTEREST_DEDUCTION_RATE;

  return {
    interest,
    tax,
    interestAfterTax: interest - tax,
  };
}

function calculateCycleValueOnDate(cycle: SavingsCycle, date: string) {
  return calculateAccruedInterest(cycle, date).totalAmount;
}

function calculateMonthlyNetRate(annualInterestRate: number) {
  if (annualInterestRate <= 0 || annualInterestRate > 100) return 0;
  const monthlyGrossRate =
    (1 + annualInterestRate / 100 / 365) ** AVERAGE_DAYS_PER_MONTH - 1;
  return monthlyGrossRate * (1 - INTEREST_DEDUCTION_RATE);
}

function calculateInterestGoal(
  targetMonthlyInterest: number,
  annualInterestRate: number,
  currentCapital: number,
  monthlyContribution: number,
  startDate: string,
): InterestGoalPlan | null {
  if (
    targetMonthlyInterest <= 0 ||
    annualInterestRate <= 0 ||
    annualInterestRate > 100
  ) {
    return null;
  }

  const monthlyNetRate = calculateMonthlyNetRate(annualInterestRate);
  const requiredCapital = targetMonthlyInterest / monthlyNetRate;
  const capitalGap = Math.max(0, requiredCapital - currentCapital);
  const progress = Math.min(100, (currentCapital / requiredCapital) * 100);
  const currentMonthlyInterest = currentCapital * monthlyNetRate;

  let monthsToGoal: number | null = null;
  let projectedCapital = currentCapital;
  if (currentCapital >= requiredCapital) {
    monthsToGoal = 0;
  } else if (currentCapital > 0 || monthlyContribution > 0) {
    for (let month = 1; month <= MAX_GOAL_MONTHS; month += 1) {
      projectedCapital =
        projectedCapital * (1 + monthlyNetRate) + monthlyContribution;
      if (projectedCapital >= requiredCapital) {
        monthsToGoal = month;
        break;
      }
    }
  }

  const projectedContributions =
    monthsToGoal === null ? null : monthlyContribution * monthsToGoal;
  const projectedGrowth =
    projectedContributions === null
      ? null
      : Math.max(
          0,
          projectedCapital - currentCapital - projectedContributions,
        );

  return {
    capitalGap,
    currentMonthlyInterest,
    monthsToGoal,
    monthlyNetRate,
    progress,
    projectedContributions,
    projectedGrowth,
    requiredCapital,
    targetDate:
      monthsToGoal === null
        ? null
        : addMonthsClamped(startDate, monthsToGoal),
  };
}

function buildCashflowSchedule(
  savings: SavingsItem[],
  period: CashflowPeriod,
  today: string,
) {
  const startMonth = getMonthStart(today);
  const schedule: CashflowMonth[] = Array.from(
    { length: period },
    (_, index) => ({
      interest: 0,
      items: [],
      key: getMonthKey(addMonthsClamped(startMonth, index)),
      principal: 0,
      total: 0,
    }),
  );
  const monthMap = new Map(schedule.map((month) => [month.key, month]));

  savings.forEach((item) => {
    if (item.maturityDate < today) return;
    const month = monthMap.get(getMonthKey(item.maturityDate));
    if (!month) return;
    month.items.push(item);
    month.principal += item.amount;
    month.interest += item.interestAfterTax;
    month.total += item.totalAmount;
  });

  schedule.forEach((month) =>
    month.items.sort((a, b) => a.maturityDate.localeCompare(b.maturityDate)),
  );
  return schedule;
}

function recalculateSavingsItem(item: SavingsItem): SavingsItem {
  return {
    ...item,
    status: item.status === "settled" ? "settled" : "active",
    maturityInstruction:
      item.maturityInstruction === "return" ||
      item.maturityInstruction === "reinvest-all"
        ? item.maturityInstruction
        : "decide-later",
    ...calculateSavings(
      item.amount,
      item.interestRate,
      item.term,
      item.startDate,
    ),
    history: (item.history ?? []).map((cycle) => ({
      ...cycle,
      ...calculateSavings(
        cycle.amount,
        cycle.interestRate,
        cycle.term,
        cycle.startDate,
      ),
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = parseLocalDate(value);
  return !Number.isNaN(parsed.getTime()) && toLocalIso(parsed) === value;
}

function normalizeBackupCycle(value: unknown): SavingsCycle | null {
  if (!isRecord(value)) return null;

  const amount = Number(value.amount);
  const interestRate = Number(value.interestRate);
  const term = Number(value.term);
  const startDate = value.startDate;
  const reinvestedAmount =
    value.reinvestedAmount === undefined
      ? undefined
      : Number(value.reinvestedAmount);
  const cashRemainder =
    value.cashRemainder === undefined
      ? undefined
      : Number(value.cashRemainder);
  const additionalContribution =
    value.additionalContribution === undefined
      ? undefined
      : Number(value.additionalContribution);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(interestRate) ||
    interestRate <= 0 ||
    interestRate > 100 ||
    !Number.isInteger(term) ||
    term < 1 ||
    !isValidIsoDate(startDate) ||
    [reinvestedAmount, cashRemainder, additionalContribution].some(
      (amountValue) =>
        amountValue !== undefined &&
        (!Number.isFinite(amountValue) || amountValue < 0),
    )
  ) {
    return null;
  }

  return {
    amount,
    interestRate,
    term,
    startDate,
    ...calculateSavings(amount, interestRate, term, startDate),
    ...(reinvestedAmount === undefined ? {} : { reinvestedAmount }),
    ...(cashRemainder === undefined ? {} : { cashRemainder }),
    ...(additionalContribution === undefined
      ? {}
      : { additionalContribution }),
  };
}

function normalizeCashLedgerEntry(value: unknown): CashLedgerEntry | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const amount = Number(value.amount);
  const savingsId = Number(value.savingsId);
  const savingsName =
    typeof value.savingsName === "string" ? value.savingsName.trim() : "";
  const status = value.status;
  const usedAt = value.usedAt;

  if (
    !id ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !isValidIsoDate(value.date) ||
    !Number.isFinite(savingsId) ||
    savingsId <= 0 ||
    !savingsName ||
    (status !== "available" && status !== "used") ||
    value.type !== "reinvestment-remainder" ||
    (usedAt !== undefined && !isValidIsoDate(usedAt))
  ) {
    return null;
  }

  return {
    id,
    amount,
    date: value.date,
    savingsId,
    savingsName: savingsName.slice(0, 200),
    status,
    type: "reinvestment-remainder",
    ...(usedAt === undefined ? {} : { usedAt }),
  };
}

function normalizeBackupItem(value: unknown): SavingsItem | null {
  if (!isRecord(value)) return null;
  const cycle = normalizeBackupCycle(value);
  const id = Number(value.id);
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const rawHistory = value.history ?? [];
  const bankName = typeof value.bankName === "string" ? value.bankName.trim() : "";
  const fundingAccountId =
    typeof value.fundingAccountId === "string" ? value.fundingAccountId.trim() : "";
  const settlementAccountId =
    typeof value.settlementAccountId === "string"
      ? value.settlementAccountId.trim()
      : "";
  const status: SavingsStatus = value.status === "settled" ? "settled" : "active";
  const maturityInstruction: MaturityInstruction =
    value.maturityInstruction === "return" ||
    value.maturityInstruction === "reinvest-all"
      ? value.maturityInstruction
      : "decide-later";
  const settledAt = isValidIsoDate(value.settledAt) ? value.settledAt : undefined;
  const parsedActualSettlementAmount = Number(value.actualSettlementAmount);
  const actualSettlementAmount =
    Number.isFinite(parsedActualSettlementAmount) &&
    parsedActualSettlementAmount > 0
      ? parsedActualSettlementAmount
      : undefined;

  if (
    !cycle ||
    !Number.isFinite(id) ||
    id <= 0 ||
    !Array.isArray(rawHistory)
  ) {
    return null;
  }

  const history = rawHistory.map(normalizeBackupCycle);
  if (history.some((item) => item === null)) return null;

  return {
    ...cycle,
    id,
    name: (name || "Khoản tiết kiệm").slice(0, 200),
    history: history as SavingsCycle[],
    status,
    maturityInstruction,
    ...(bankName ? { bankName: bankName.slice(0, 120) } : {}),
    ...(fundingAccountId ? { fundingAccountId: fundingAccountId.slice(0, 100) } : {}),
    ...(settlementAccountId
      ? { settlementAccountId: settlementAccountId.slice(0, 100) }
      : {}),
    ...(settledAt ? { settledAt } : {}),
    ...(actualSettlementAmount ? { actualSettlementAmount } : {}),
  };
}

function normalizeGoalSettings(value: unknown): GoalSettings {
  const goal = isRecord(value) ? value : {};
  return {
    monthlyInterest:
      typeof goal.monthlyInterest === "string"
        ? goal.monthlyInterest.slice(0, 30)
        : "",
    interestRate:
      typeof goal.interestRate === "string"
        ? goal.interestRate.slice(0, 20)
        : "",
    monthlyContribution:
      typeof goal.monthlyContribution === "string"
        ? goal.monthlyContribution.slice(0, 30)
        : "",
  };
}

function normalizeAppStateCore(value: unknown): AppStateCore | null {
  if (!isRecord(value)) return null;
  const rawSavings = Array.isArray(value.savings) ? value.savings : null;
  const rawRates = Array.isArray(value.interestRates) ? value.interestRates : null;
  const rawCashLedger = Array.isArray(value.cashLedger) ? value.cashLedger : null;
  if (!rawSavings || !rawRates || !rawCashLedger) return null;

  const savings = rawSavings.map(normalizeBackupItem);
  const interestRates = rawRates.map(Number);
  const cashLedger = rawCashLedger.map(normalizeCashLedgerEntry);
  const savingsIds = new Set(
    savings.flatMap((item) => (item ? [item.id] : [])),
  );
  if (
    savings.some((item) => item === null) ||
    cashLedger.some((entry) => entry === null) ||
    savingsIds.size !== savings.length ||
    interestRates.some(
      (rate) => !Number.isFinite(rate) || rate <= 0 || rate > 100,
    )
  ) {
    return null;
  }

  return {
    savings: savings as SavingsItem[],
    interestRates: [...new Set(interestRates)],
    cashLedger: cashLedger as CashLedgerEntry[],
    finance: normalizeFinanceState(value.finance),
    goal: normalizeGoalSettings(value.goal),
    exchange: normalizeExchangeSettings(value.exchange),
    financialGoals: normalizeFinancialGoals(value.financialGoals),
  };
}

function normalizeVersionHistory(value: unknown): AppVersion[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const data = normalizeAppStateCore(candidate.data);
    const id = typeof candidate.id === "string" ? candidate.id.slice(0, 120) : "";
    const createdAt =
      typeof candidate.createdAt === "string"
        ? candidate.createdAt.slice(0, 40)
        : "";
    if (!data || !id || !createdAt) return [];
    return [{
      id,
      createdAt,
      label:
        typeof candidate.label === "string"
          ? candidate.label.slice(0, 120)
          : "Phiên bản tự động",
      data,
    }];
  });
}

function parseBackupPayload(value: unknown): BackupPayload | null {
  const version = isRecord(value) ? Number(value.version) : 0;
  const rawCashLedger =
    isRecord(value) && version === 1 ? [] : isRecord(value) ? value.cashLedger : null;
  const rawFinance =
    isRecord(value) && version >= 3
      ? value.finance
      : createDefaultFinanceState();
  const rawGoal =
    isRecord(value) && version >= 5 ? value.goal : normalizeGoalSettings(null);
  const rawExchange =
    isRecord(value) && version >= 6 ? value.exchange : DEFAULT_EXCHANGE_SETTINGS;
  const rawFinancialGoals =
    isRecord(value) && version >= 6 ? value.financialGoals : [];
  const rawVersionHistory =
    isRecord(value) && version >= 6 ? value.versionHistory : [];

  if (
    !isRecord(value) ||
    value.app !== BACKUP_APP_ID ||
    ![1, 2, 3, 4, 5, BACKUP_FORMAT_VERSION].includes(version) ||
    typeof value.exportedAt !== "string" ||
    !Array.isArray(value.savings) ||
    !Array.isArray(value.interestRates) ||
    !Array.isArray(rawCashLedger)
  ) {
    return null;
  }

  const core = normalizeAppStateCore({
    savings: value.savings,
    interestRates: value.interestRates,
    cashLedger: rawCashLedger,
    finance: rawFinance,
    goal: rawGoal,
    exchange: rawExchange,
    financialGoals: rawFinancialGoals,
  });
  if (!core) return null;
  const repairedFinance = reconcileSavingsFundingTransactions(
    core.finance,
    core.savings,
  );

  return {
    app: BACKUP_APP_ID,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: value.exportedAt,
    ...core,
    finance: repairedFinance,
    versionHistory: normalizeVersionHistory(rawVersionHistory),
  };
}

function parseCloudAppState(value: unknown): CloudAppState | null {
  const schemaVersion = isRecord(value) ? Number(value.schemaVersion) : 0;
  if (
    !isRecord(value) ||
    ![1, 2, 3, 4, 5].includes(schemaVersion)
  ) {
    return null;
  }

  const backup = parseBackupPayload({
    app: BACKUP_APP_ID,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    savings: value.savings,
    interestRates: value.interestRates,
    cashLedger: value.cashLedger,
    finance: schemaVersion >= 2 ? value.finance : createDefaultFinanceState(),
    goal: value.goal,
    exchange: schemaVersion >= 5 ? value.exchange : DEFAULT_EXCHANGE_SETTINGS,
    financialGoals: schemaVersion >= 5 ? value.financialGoals : [],
    versionHistory: schemaVersion >= 5 ? value.versionHistory : [],
  });
  if (!backup) return null;

  return {
    schemaVersion: 5,
    savings: backup.savings,
    interestRates: backup.interestRates,
    cashLedger: backup.cashLedger,
    finance: backup.finance,
    goal: backup.goal,
    exchange: backup.exchange,
    financialGoals: backup.financialGoals,
    versionHistory: backup.versionHistory,
  };
}

function createCloudAppState(
  core: AppStateCore,
  versionHistory: AppVersion[],
): CloudAppState {
  return {
    schemaVersion: 5,
    ...core,
    versionHistory,
  };
}

function getCoreFromCloudState(state: CloudAppState): AppStateCore {
  return {
    savings: state.savings,
    interestRates: state.interestRates,
    cashLedger: state.cashLedger,
    finance: state.finance,
    goal: state.goal,
    exchange: state.exchange,
    financialGoals: state.financialGoals,
  };
}

function formatCurrency(amount: number) {
  return currencyFormatter.format(Math.round(amount));
}

function createSavingsFinanceTransaction({
  accountId,
  amount,
  date,
  id,
  note,
  savingsId,
  type,
  createdAt,
}: {
  accountId: string;
  amount: number;
  date: string;
  id: string;
  note: string;
  savingsId: number;
  type: "savings-deposit" | "savings-settlement";
  createdAt?: string;
}): FinanceState["transactions"][number] {
  return {
    id,
    type,
    amount,
    date,
    accountId,
    linkedSavingsId: savingsId,
    note,
    createdAt: createdAt ?? new Date().toISOString(),
  };
}

function formatDate(dateString: string) {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat("vi-VN").format(parseLocalDate(dateString));
}

function formatRate(rate: number) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
  }).format(rate);
}

function formatGoalDuration(months: number) {
  if (months === 0) return "Ngay bây giờ";
  if (months < 12) return `${months} tháng`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return remainingMonths
    ? `${years} năm ${remainingMonths} tháng`
    : `${years} năm`;
}

function formatMonthTitle(monthKey: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(`${monthKey}-01`));
}

function formatMonthShort(monthKey: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    month: "short",
    year: "2-digit",
  }).format(parseLocalDate(`${monthKey}-01`));
}

function formatCompactMoney(amount: number) {
  if (!amount) return "—";
  return `${new Intl.NumberFormat("vi-VN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount)} ₫`;
}

function formatTrendMonth(monthKey: string, includeYear = false) {
  const [, month] = monthKey.split("-").map(Number);
  return includeYear
    ? "T" + month + "/" + monthKey.slice(2, 4)
    : "T" + month;
}

function formatMaturityDistance(date: string, today: string) {
  const difference = signedDaysBetween(today, date);
  if (difference < 0) return `Quá hạn ${Math.abs(difference)} ngày`;
  if (difference === 0) return "Đáo hạn hôm nay";
  if (difference === 1) return "Đáo hạn ngày mai";
  return `Còn ${difference} ngày`;
}

function parseAmount(value: string) {
  return Number(value.replace(/\D/g, "")) || 0;
}

function formatAmountInput(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(digits));
}

function toSavingsCycle(
  item: SavingsCycle,
  transition: Pick<
    SavingsCycle,
    "reinvestedAmount" | "cashRemainder" | "additionalContribution"
  > = {},
): SavingsCycle {
  return {
    amount: item.amount,
    interestRate: item.interestRate,
    term: item.term,
    startDate: item.startDate,
    maturityDate: item.maturityDate,
    interest: item.interest,
    tax: item.tax,
    interestAfterTax: item.interestAfterTax,
    totalAmount: item.totalAmount,
    ...transition,
  };
}

function readStoredArray<T>(key: string): T[] | null {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function readStoredRecord<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [savings, setSavings] = useState<SavingsItem[]>([]);
  const [interestRates, setInterestRates] = useState(DEFAULT_INTEREST_RATES);
  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>([]);
  const [finance, setFinance] = useState<FinanceState>(() =>
    createDefaultFinanceState(),
  );
  const [exchangeSettings, setExchangeSettings] =
    useState<ExchangeRateSettings>({ ...DEFAULT_EXCHANGE_SETTINGS });
  const [financialGoals, setFinancialGoals] = useState<FinancialGoal[]>([]);
  const [versionHistory, setVersionHistory] = useState<AppVersion[]>([]);
  const [activeWorkspace, setActiveWorkspace] =
    useState<AppWorkspace>("savings");
  const [form, setForm] = useState<SavingsForm>(emptyForm());
  const [newInterestRate, setNewInterestRate] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mode, setMode] = useState<FormMode>("add");
  const [collapsedRates, setCollapsedRates] = useState<Set<number>>(new Set());
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(
    null,
  );
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [settlementDraft, setSettlementDraft] = useState<SettlementDraft>({
    accountId: "",
    amount: "",
    date: "",
  });
  const [message, setMessage] = useState("");
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [goalMonthlyInterest, setGoalMonthlyInterest] = useState("");
  const [goalInterestRate, setGoalInterestRate] = useState("");
  const [goalMonthlyContribution, setGoalMonthlyContribution] = useState("");
  const [cashflowPeriod, setCashflowPeriod] = useState<CashflowPeriod>(12);
  const [selectedCashflowMonth, setSelectedCashflowMonth] = useState(
    getMonthKey(getTodayIso()),
  );
  const [selectedSavingsTrendMonth, setSelectedSavingsTrendMonth] = useState(
    getMonthKey(getTodayIso()),
  );
  const cloudConfigured = isCloudConfigured();
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    cloudConfigured ? "checking" : "local",
  );
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<CloudSyncStatus>("idle");
  const [realtimeStatus, setRealtimeStatus] =
    useState<CloudRealtimeStatus>("disconnected");
  const [cloudError, setCloudError] = useState("");
  const [cloudConflict, setCloudConflict] = useState<CloudConflict | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [cloudActionBusy, setCloudActionBusy] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginMessageIsError, setLoginMessageIsError] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [ready, setReady] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const cloudSessionRef = useRef<CloudSession | null>(null);
  const lastCloudUpdatedAtRef = useRef("");
  const skipNextCloudWriteRef = useRef(false);
  const cloudWritePendingRef = useRef(false);
  const historyInitializedRef = useRef(false);
  const lastCoreSignatureRef = useRef("");

  const currentCore = useMemo<AppStateCore>(
    () => ({
      savings,
      interestRates,
      cashLedger,
      finance,
      exchange: exchangeSettings,
      financialGoals,
      goal: {
        monthlyInterest: goalMonthlyInterest,
        interestRate: goalInterestRate,
        monthlyContribution: goalMonthlyContribution,
      },
    }),
    [
      cashLedger,
      exchangeSettings,
      finance,
      financialGoals,
      goalInterestRate,
      goalMonthlyContribution,
      goalMonthlyInterest,
      interestRates,
      savings,
    ],
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage is client-only, so persisted data must be hydrated after mount. */
    const storedSavings = readStoredArray<SavingsItem>(SAVINGS_KEY);
    const storedRates = readStoredArray<number>(RATES_KEY);
    const storedCashLedger = readStoredArray<CashLedgerEntry>(CASH_LEDGER_KEY);
    const storedGoal = readStoredRecord<CloudAppState["goal"]>(
      GOAL_SETTINGS_KEY,
    );
    const storedFinance = readStoredRecord<FinanceState>(FINANCE_KEY);
    const storedExchange = readStoredRecord<ExchangeRateSettings>(
      EXCHANGE_SETTINGS_KEY,
    );
    const storedFinancialGoals = readStoredArray<FinancialGoal>(
      FINANCIAL_GOALS_KEY,
    );
    const storedVersionHistory = readStoredArray<AppVersion>(
      VERSION_HISTORY_KEY,
    );
    const storedWorkspace = localStorage.getItem(WORKSPACE_KEY);
    const localSavings = storedSavings
      ? storedSavings.map(recalculateSavingsItem)
      : [];
    const localRates = storedRates
      ? storedRates
          .filter(
            (rate) =>
              Number.isFinite(Number(rate)) &&
              Number(rate) > 0 &&
              Number(rate) <= 100,
          )
          .map(Number)
      : DEFAULT_INTEREST_RATES;
    const localCashLedger =
      storedCashLedger?.flatMap((entry) => {
        const normalizedEntry = normalizeCashLedgerEntry(entry);
        return normalizedEntry ? [normalizedEntry] : [];
      }) ?? [];
    const localGoal = {
      monthlyInterest: storedGoal?.monthlyInterest ?? "",
      interestRate: storedGoal?.interestRate ?? "",
      monthlyContribution: storedGoal?.monthlyContribution ?? "",
    };
    const localFinance = reconcileSavingsFundingTransactions(
      normalizeFinanceState(storedFinance),
      localSavings,
    );
    const localExchange = normalizeExchangeSettings(storedExchange);
    const localFinancialGoals = normalizeFinancialGoals(storedFinancialGoals);
    const localVersionHistory = normalizeVersionHistory(storedVersionHistory);

    setSavings(localSavings);
    setInterestRates(localRates);
    setCashLedger(localCashLedger);
    setFinance(localFinance);
    setExchangeSettings(localExchange);
    setFinancialGoals(localFinancialGoals);
    setVersionHistory(localVersionHistory);
    setActiveWorkspace(
      storedWorkspace === "finance" || storedWorkspace === "goals"
        ? storedWorkspace
        : "savings",
    );
    setGoalMonthlyInterest(localGoal.monthlyInterest);
    setGoalInterestRate(localGoal.interestRate);
    setGoalMonthlyContribution(localGoal.monthlyContribution);
    setForm(emptyForm(getTodayIso()));

    async function initializeCloud() {
      if (!cloudConfigured) {
        setAuthStatus("local");
        setReady(true);
        return;
      }

      let session: CloudSession | null = null;
      try {
        session =
          (await consumeMagicLinkSession()) ?? (await restoreCloudSession());
        if (!session) {
          setAuthStatus("signed-out");
          setReady(true);
          return;
        }

        session = await ensureCloudSession(session);
        setCloudSession(session);
        setAuthStatus("signed-in");
        const remoteRow = await readCloudState<unknown>(session);
        if (remoteRow) {
          const remoteState = parseCloudAppState(remoteRow.data);
          if (!remoteState) {
            throw new Error("Dữ liệu trên tài khoản không đúng định dạng.");
          }
          setSavings(remoteState.savings);
          setInterestRates(remoteState.interestRates);
          setCashLedger(remoteState.cashLedger);
          setFinance(remoteState.finance);
          setExchangeSettings(remoteState.exchange);
          setFinancialGoals(remoteState.financialGoals);
          setVersionHistory(remoteState.versionHistory);
          setGoalMonthlyInterest(remoteState.goal.monthlyInterest);
          setGoalInterestRate(remoteState.goal.interestRate);
          setGoalMonthlyContribution(remoteState.goal.monthlyContribution);
          lastCloudUpdatedAtRef.current = remoteRow.updated_at;
          skipNextCloudWriteRef.current = true;
          setCloudReady(true);
          setCloudSyncStatus("saved");
        } else {
          const hasCustomRates =
            JSON.stringify([...localRates].sort((a, b) => a - b)) !==
            JSON.stringify(
              [...DEFAULT_INTEREST_RATES].sort((a, b) => a - b),
            );
          const hasLocalData = Boolean(
            localSavings.length ||
              localCashLedger.length ||
              hasCustomRates ||
              localGoal.monthlyInterest ||
              localGoal.interestRate ||
              localGoal.monthlyContribution ||
              hasMeaningfulFinanceData(localFinance) ||
              localFinancialGoals.length ||
              localVersionHistory.length ||
              JSON.stringify(localExchange) !==
                JSON.stringify(DEFAULT_EXCHANGE_SETTINGS)
          );
          setMigrationPending(hasLocalData);
          setCloudReady(!hasLocalData);
        }
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message
            : "Không thể kết nối tài khoản lúc này.";
        if (session) {
          setCloudSession(session);
          setAuthStatus("signed-in");
          setCloudError(text);
          setCloudSyncStatus("error");
        } else {
          setAuthStatus("signed-out");
          setLoginMessage(text);
        }
      } finally {
        setReady(true);
      }
    }

    void initializeCloud();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cloudConfigured]);

  useEffect(() => {
    if (!ready) return;
    if (authStatus === "signed-in" && cloudReady && !migrationPending) {
      localStorage.removeItem(SAVINGS_KEY);
    } else if (authStatus === "local" || migrationPending) {
      localStorage.setItem(SAVINGS_KEY, JSON.stringify(savings));
    }
  }, [authStatus, cloudReady, migrationPending, ready, savings]);

  useEffect(() => {
    if (!ready) return;
    if (authStatus === "signed-in" && cloudReady && !migrationPending) {
      localStorage.removeItem(RATES_KEY);
    } else if (authStatus === "local" || migrationPending) {
      localStorage.setItem(RATES_KEY, JSON.stringify(interestRates));
    }
  }, [authStatus, cloudReady, interestRates, migrationPending, ready]);

  useEffect(() => {
    if (!ready) return;
    if (authStatus === "signed-in" && cloudReady && !migrationPending) {
      localStorage.removeItem(CASH_LEDGER_KEY);
    } else if (authStatus === "local" || migrationPending) {
      localStorage.setItem(CASH_LEDGER_KEY, JSON.stringify(cashLedger));
    }
  }, [authStatus, cashLedger, cloudReady, migrationPending, ready]);

  useEffect(() => {
    if (!ready) return;
    if (authStatus === "signed-in" && cloudReady && !migrationPending) {
      localStorage.removeItem(GOAL_SETTINGS_KEY);
    } else if (authStatus === "local" || migrationPending) {
      localStorage.setItem(
        GOAL_SETTINGS_KEY,
        JSON.stringify({
          monthlyInterest: goalMonthlyInterest,
          interestRate: goalInterestRate,
          monthlyContribution: goalMonthlyContribution,
        }),
      );
    }
  }, [
    authStatus,
    cloudReady,
    goalInterestRate,
    goalMonthlyContribution,
    goalMonthlyInterest,
    migrationPending,
    ready,
  ]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(WORKSPACE_KEY, activeWorkspace);
  }, [activeWorkspace, ready]);

  useEffect(() => {
    if (!ready) return;
    if (authStatus === "signed-in" && cloudReady && !migrationPending) {
      localStorage.removeItem(FINANCE_KEY);
    } else if (authStatus === "local" || migrationPending) {
      localStorage.setItem(FINANCE_KEY, JSON.stringify(finance));
    }
  }, [authStatus, cloudReady, finance, migrationPending, ready]);

  useEffect(() => {
    if (!ready) return;
    if (authStatus === "signed-in" && cloudReady && !migrationPending) {
      localStorage.removeItem(EXCHANGE_SETTINGS_KEY);
      localStorage.removeItem(FINANCIAL_GOALS_KEY);
      localStorage.removeItem(VERSION_HISTORY_KEY);
    } else if (authStatus === "local" || migrationPending) {
      localStorage.setItem(EXCHANGE_SETTINGS_KEY, JSON.stringify(exchangeSettings));
      localStorage.setItem(FINANCIAL_GOALS_KEY, JSON.stringify(financialGoals));
      localStorage.setItem(VERSION_HISTORY_KEY, JSON.stringify(versionHistory));
    }
  }, [
    authStatus,
    cloudReady,
    exchangeSettings,
    financialGoals,
    migrationPending,
    ready,
    versionHistory,
  ]);

  useEffect(() => {
    if (!ready) return;
    const signature = JSON.stringify(currentCore);
    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      lastCoreSignatureRef.current = signature;
      if (!versionHistory.length) {
        const now = new Date().toISOString();
        const initialHistoryTimeout = window.setTimeout(() => {
          setVersionHistory([{
            id: `version-${Date.now()}`,
            createdAt: now,
            label: "Bắt đầu lịch sử phiên bản",
            data: currentCore,
          }]);
        }, 0);
        return () => window.clearTimeout(initialHistoryTimeout);
      }
      return;
    }
    if (signature === lastCoreSignatureRef.current) return;

    const timeout = window.setTimeout(() => {
      lastCoreSignatureRef.current = signature;
      setVersionHistory((current) => {
        const latest = current[current.length - 1];
        if (latest && JSON.stringify(latest.data) === signature) return current;
        const workspaceLabel =
          activeWorkspace === "finance"
            ? "Cập nhật thu chi"
            : activeWorkspace === "goals"
              ? "Cập nhật mục tiêu"
              : "Cập nhật tiết kiệm";
        return [...current, {
          id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
          label: workspaceLabel,
          data: currentCore,
        }].slice(-20);
      });
    }, 1_200);

    return () => window.clearTimeout(timeout);
  }, [activeWorkspace, currentCore, ready, versionHistory.length]);

  useEffect(() => {
    cloudSessionRef.current = cloudSession;
  }, [cloudSession]);

  useEffect(() => {
    if (authStatus !== "signed-in" || !cloudSession) return;

    const refreshDelay = Math.max(
      1_000,
      cloudSession.expiresAt - Date.now() - 55_000,
    );
    const timeout = window.setTimeout(() => {
      void ensureCloudSession(cloudSession)
        .then((activeSession) => {
          if (activeSession !== cloudSession) setCloudSession(activeSession);
        })
        .catch((error: unknown) => {
          setRealtimeStatus("error");
          setCloudError(
            error instanceof Error
              ? error.message
              : "Không thể làm mới phiên đồng bộ realtime.",
          );
        });
    }, refreshDelay);

    return () => window.clearTimeout(timeout);
  }, [authStatus, cloudSession]);

  useEffect(() => {
    if (
      !ready ||
      authStatus !== "signed-in" ||
      !cloudSession ||
      !cloudReady ||
      migrationPending ||
      cloudConflict
    ) {
      return;
    }

    return subscribeToCloudState<unknown>({
      session: cloudSession,
      onStatus: setRealtimeStatus,
      onChange: (remoteRow) => {
        if (
          cloudWritePendingRef.current ||
          !isNewerCloudUpdate(
            lastCloudUpdatedAtRef.current,
            remoteRow.updated_at,
          )
        ) {
          return;
        }

        const remoteState = parseCloudAppState(remoteRow.data);
        if (!remoteState) {
          setCloudError("Dữ liệu realtime không đúng định dạng.");
          setCloudSyncStatus("error");
          return;
        }

        lastCloudUpdatedAtRef.current = remoteRow.updated_at;
        skipNextCloudWriteRef.current = true;
        const remoteCore = getCoreFromCloudState(remoteState);
        lastCoreSignatureRef.current = JSON.stringify(remoteCore);
        setSavings(remoteCore.savings);
        setInterestRates(remoteCore.interestRates);
        setCashLedger(remoteCore.cashLedger);
        setFinance(remoteCore.finance);
        setGoalMonthlyInterest(remoteCore.goal.monthlyInterest);
        setGoalInterestRate(remoteCore.goal.interestRate);
        setGoalMonthlyContribution(remoteCore.goal.monthlyContribution);
        setExchangeSettings(remoteCore.exchange);
        setFinancialGoals(remoteCore.financialGoals);
        setVersionHistory(remoteState.versionHistory);
        setCloudError("");
        setCloudSyncStatus("saved");
      },
    });
  }, [
    authStatus,
    cloudConflict,
    cloudReady,
    cloudSession,
    migrationPending,
    ready,
  ]);

  useEffect(() => {
    if (
      !ready ||
      authStatus !== "signed-in" ||
      !cloudReady ||
      migrationPending ||
      cloudConflict
    ) {
      return;
    }

    if (skipNextCloudWriteRef.current) {
      skipNextCloudWriteRef.current = false;
      cloudWritePendingRef.current = false;
      return;
    }

    let writeStarted = false;
    const sessionAtStart = cloudSessionRef.current;
    if (!sessionAtStart) return;
    cloudWritePendingRef.current = true;
    const timeout = window.setTimeout(() => {
      writeStarted = true;
      const state = createCloudAppState(currentCore, versionHistory);
      setCloudSyncStatus("saving");
      void ensureCloudSession(sessionAtStart)
        .then(async (activeSession) => ({
          activeSession,
          row: await writeCloudState(
            activeSession,
            state,
            lastCloudUpdatedAtRef.current || undefined,
          ),
        }))
        .then(({ activeSession, row }) => {
          if (activeSession !== sessionAtStart) setCloudSession(activeSession);
          if (row) lastCloudUpdatedAtRef.current = row.updated_at;
          cloudWritePendingRef.current = false;
          setCloudError("");
          setCloudSyncStatus("saved");
        })
        .catch(async (error: unknown) => {
          cloudWritePendingRef.current = false;
          if (error instanceof CloudConflictError) {
            try {
              const activeSession = await ensureCloudSession(sessionAtStart);
              const remoteRow = await readCloudState<unknown>(activeSession);
              const remoteState = remoteRow
                ? parseCloudAppState(remoteRow.data)
                : null;
              if (remoteRow && remoteState) {
                setCloudConflict({
                  remoteState,
                  updatedAt: remoteRow.updated_at,
                });
                setCloudError(
                  "Phát hiện một phiên bản mới hơn từ thiết bị khác.",
                );
                setCloudSyncStatus("error");
                return;
              }
            } catch {
              // Fall through to the regular sync error below.
            }
          }
          setCloudError(
            error instanceof Error
              ? error.message
              : "Không thể đồng bộ dữ liệu.",
          );
          setCloudSyncStatus("error");
        });
    }, 800);

    return () => {
      window.clearTimeout(timeout);
      if (!writeStarted) cloudWritePendingRef.current = false;
    };
  }, [
    authStatus,
    cloudConflict,
    cloudReady,
    currentCore,
    migrationPending,
    ready,
    versionHistory,
  ]);

  const sortedRates = useMemo(
    () => [...interestRates].sort((a, b) => b - a),
    [interestRates],
  );

  const activeSavings = useMemo(
    () => savings.filter((item) => item.status !== "settled"),
    [savings],
  );
  const settledSavingsCount = savings.length - activeSavings.length;
  const vndAccounts = useMemo(
    () => finance.accounts.filter((account) => account.currency === "VND"),
    [finance.accounts],
  );

  const groupedSavings = useMemo(() => {
    const groups = new Map<number, SavingsItem[]>();
    savings.forEach((item) => {
      const group = groups.get(item.interestRate) ?? [];
      group.push(item);
      groups.set(item.interestRate, group);
    });
    return [...groups.entries()].sort(([rateA], [rateB]) => rateB - rateA);
  }, [savings]);

  const cashBalance = useMemo(
    () =>
      cashLedger.reduce(
        (sum, entry) =>
          entry.status === "available" ? sum + entry.amount : sum,
        0,
      ),
    [cashLedger],
  );

  const today = getTodayIso();
  const savingsTrend = useMemo(
    () => buildSavingsTrend(savings, today, 12),
    [savings, today],
  );
  const selectedSavingsTrend =
    savingsTrend.find((point) => point.key === selectedSavingsTrendMonth) ??
    savingsTrend.at(-1);
  const selectedSavingsTrendIndex = selectedSavingsTrend
    ? savingsTrend.findIndex((point) => point.key === selectedSavingsTrend.key)
    : -1;
  const previousSavingsTrend =
    selectedSavingsTrendIndex > 0
      ? savingsTrend[selectedSavingsTrendIndex - 1]
      : null;
  const savingsTrendStart = savingsTrend[0]?.value ?? 0;
  const savingsTrendCurrent = savingsTrend.at(-1)?.value ?? 0;
  const savingsTrendChange = savingsTrendCurrent - savingsTrendStart;
  const savingsTrendPercent =
    savingsTrendStart > 0
      ? (savingsTrendChange / savingsTrendStart) * 100
      : null;
  const selectedSavingsTrendChange =
    selectedSavingsTrend && previousSavingsTrend
      ? selectedSavingsTrend.value - previousSavingsTrend.value
      : null;
  const savingsTrendValues = savingsTrend.map((point) => point.value);
  const savingsTrendHasData = savingsTrendValues.some((value) => value > 0);
  const savingsTrendRawMin = savingsTrendHasData
    ? Math.min(...savingsTrendValues)
    : 0;
  const savingsTrendRawMax = savingsTrendHasData
    ? Math.max(...savingsTrendValues)
    : 1;
  const savingsTrendPadding = Math.max(
    1,
    (savingsTrendRawMax - savingsTrendRawMin) * 0.12,
    savingsTrendRawMax * 0.015,
  );
  const savingsTrendMin =
    savingsTrendRawMin === 0
      ? 0
      : Math.max(0, savingsTrendRawMin - savingsTrendPadding);
  const savingsTrendMax = savingsTrendRawMax + savingsTrendPadding;
  const savingsTrendRange = Math.max(1, savingsTrendMax - savingsTrendMin);
  const savingsTrendPlotWidth =
    SAVINGS_TREND_CHART.right - SAVINGS_TREND_CHART.left;
  const savingsTrendPlotHeight =
    SAVINGS_TREND_CHART.bottom - SAVINGS_TREND_CHART.top;
  const savingsTrendChartPoints = savingsTrend.map((point, index) => ({
    ...point,
    x:
      SAVINGS_TREND_CHART.left +
      (index / Math.max(1, savingsTrend.length - 1)) * savingsTrendPlotWidth,
    y:
      SAVINGS_TREND_CHART.top +
      ((savingsTrendMax - point.value) / savingsTrendRange) *
        savingsTrendPlotHeight,
  }));
  const savingsTrendLinePath = savingsTrendChartPoints
    .map(
      (point, index) =>
        (index ? "L " : "M ") +
        point.x.toFixed(2) +
        " " +
        point.y.toFixed(2),
    )
    .join(" ");
  const savingsTrendAreaPath = savingsTrendChartPoints.length
    ? savingsTrendLinePath +
      " L " +
      savingsTrendChartPoints.at(-1)!.x.toFixed(2) +
      " " +
      SAVINGS_TREND_CHART.bottom +
      " L " +
      savingsTrendChartPoints[0].x.toFixed(2) +
      " " +
      SAVINGS_TREND_CHART.bottom +
      " Z"
    : "";
  const selectedSavingsTrendChartPoint =
    selectedSavingsTrendIndex >= 0
      ? savingsTrendChartPoints[selectedSavingsTrendIndex]
      : null;
  const savingsTrendTooltipX = selectedSavingsTrendChartPoint
    ? selectedSavingsTrendChartPoint.x > SAVINGS_TREND_CHART.width - 226
      ? selectedSavingsTrendChartPoint.x - 206
      : selectedSavingsTrendChartPoint.x + 12
    : 0;
  const savingsTrendTooltipY = selectedSavingsTrendChartPoint
    ? Math.max(
        8,
        Math.min(
          selectedSavingsTrendChartPoint.y - 76,
          SAVINGS_TREND_CHART.height - 76,
        ),
      )
    : 0;
  const savingsTrendTicks = Array.from({ length: 4 }, (_, index) => {
    const value = savingsTrendMax - (index / 3) * savingsTrendRange;
    return {
      value,
      y:
        SAVINGS_TREND_CHART.top +
        (index / 3) * savingsTrendPlotHeight,
    };
  });

  const summary = useMemo(() => {
    const principal = activeSavings.reduce((sum, item) => sum + item.amount, 0);
    const interest = activeSavings.reduce(
      (sum, item) => sum + item.interestAfterTax,
      0,
    );
    const accrued = activeSavings.reduce(
      (totals, item) => {
        const itemAccrued = calculateAccruedInterest(item, today);
        totals.interest += itemAccrued.interest;
        totals.tax += itemAccrued.tax;
        totals.interestAfterTax += itemAccrued.interestAfterTax;
        return totals;
      },
      { interest: 0, tax: 0, interestAfterTax: 0 },
    );
    const todayProfit = activeSavings.reduce(
      (totals, item) => {
        const itemProfit = calculateInterestToday(item, today);
        totals.interest += itemProfit.interest;
        totals.tax += itemProfit.tax;
        totals.interestAfterTax += itemProfit.interestAfterTax;
        return totals;
      },
      { interest: 0, tax: 0, interestAfterTax: 0 },
    );
    return {
      principal,
      interest,
      assets: principal + interest + cashBalance,
      accruedInterest: accrued.interest,
      accruedTax: accrued.tax,
      accruedInterestAfterTax: accrued.interestAfterTax,
      currentAssets: principal + accrued.interestAfterTax + cashBalance,
      todayInterest: todayProfit.interest,
      todayTax: todayProfit.tax,
      todayInterestAfterTax: todayProfit.interestAfterTax,
    };
  }, [activeSavings, cashBalance, today]);

  const monthlyInterestTarget = parseAmount(goalMonthlyInterest);
  const cashflowMonths = useMemo(
    () => buildCashflowSchedule(activeSavings, cashflowPeriod, today),
    [activeSavings, cashflowPeriod, today],
  );
  const cashflowSummary = useMemo(() => {
    const principal = cashflowMonths.reduce(
      (sum, month) => sum + month.principal,
      0,
    );
    const interest = cashflowMonths.reduce(
      (sum, month) => sum + month.interest,
      0,
    );
    const peakMonth = cashflowMonths.reduce<CashflowMonth | null>(
      (peak, month) => (!peak || month.total > peak.total ? month : peak),
      null,
    );
    return {
      activeMonths: cashflowMonths.filter((month) => month.items.length > 0)
        .length,
      interest,
      peakMonth: peakMonth?.total ? peakMonth : null,
      principal,
      total: principal + interest,
    };
  }, [cashflowMonths]);
  const selectedCashflow =
    cashflowMonths.find((month) => month.key === selectedCashflowMonth) ??
    cashflowMonths.find((month) => month.items.length > 0) ??
    cashflowMonths[0];
  const maxMonthlyCashflow = Math.max(
    1,
    ...cashflowMonths.map((month) => month.total),
  );
  const cashflowMonthsMeetingGoal = monthlyInterestTarget
    ? cashflowMonths.filter(
        (month) => month.interest >= monthlyInterestTarget,
      )
    : [];
  const maturityAlerts = useMemo(() => {
    const overdue: SavingsItem[] = [];
    const nextSevenDays: SavingsItem[] = [];
    const nextThirtyDays: SavingsItem[] = [];
    activeSavings.forEach((item) => {
      const difference = signedDaysBetween(today, item.maturityDate);
      if (difference < 0) overdue.push(item);
      else if (difference <= 7) nextSevenDays.push(item);
      else if (difference <= 30) nextThirtyDays.push(item);
    });
    return { nextSevenDays, nextThirtyDays, overdue };
  }, [activeSavings, today]);
  const budgetAlerts = useMemo(() => {
    const monthKey = getMonthKey(today);
    return finance.budgets.flatMap((budget) => {
      const spent = getCategorySpent(
        finance,
        budget.categoryId,
        monthKey,
        budget.currency,
      );
      const ratio = spent / budget.monthlyLimit;
      if (ratio < 0.8) return [];
      const category = finance.categories.find(
        (item) => item.id === budget.categoryId,
      );
      return [{
        budget,
        categoryName: category?.name ?? "Nhóm chi",
        ratio,
        spent,
      }];
    });
  }, [finance, today]);
  const reminderCount =
    maturityAlerts.overdue.length +
    maturityAlerts.nextSevenDays.length +
    budgetAlerts.length;
  const ladderRecommendation = useMemo(() => {
    if (activeSavings.length === 0) {
      return "Khi có khoản gửi, ứng dụng sẽ phân tích mức độ tập trung ngày đáo hạn và đề xuất cách chia kỳ hạn.";
    }
    if (!cashflowSummary.total || !cashflowSummary.peakMonth) {
      return `Chưa có khoản nào đáo hạn trong ${cashflowPeriod} tháng tới. Hãy kiểm tra các khoản quá hạn hoặc mở rộng khoảng xem.`;
    }
    const concentration =
      cashflowSummary.peakMonth.total / cashflowSummary.total;
    if (concentration >= 0.5) {
      return `${Math.round(concentration * 100)}% dòng tiền đang tập trung vào ${formatMonthTitle(cashflowSummary.peakMonth.key)}. Khi tái đầu tư, có thể chia số tiền thành các kỳ 3, 6, 9 và 12 tháng để vốn quay về đều hơn.`;
    }
    if (cashflowSummary.activeMonths <= 2) {
      return `Các khoản đáo hạn đang tập trung trong ${cashflowSummary.activeMonths} tháng. Chia lần tái đầu tư tiếp theo thành nhiều kỳ hạn sẽ giúp tăng số mốc có thể tiếp cận tiền.`;
    }
    return `Dòng tiền đang được phân bổ trên ${cashflowSummary.activeMonths} tháng khác nhau. Có thể duy trì nhịp này bằng cách tái đầu tư mỗi khoản vào kỳ hạn phù hợp thay vì gom chung một ngày.`;
  }, [activeSavings.length, cashflowPeriod, cashflowSummary]);

  const currentPortfolio = useMemo(() => {
    return activeSavings.reduce(
      (sum, item) => sum + calculateCycleValueOnDate(item, today),
      0,
    );
  }, [activeSavings, today]);
  const goalSavingsSources = useMemo<GoalSavingsSource[]>(
    () =>
      activeSavings.map((item) => ({
        id: item.id,
        name: item.name,
        currentValueVnd: calculateCycleValueOnDate(item, today),
        ...(item.bankName ? { bankName: item.bankName } : {}),
      })),
    [activeSavings, today],
  );

  const suggestedGoalRate = useMemo(() => {
    if (summary.principal <= 0) return 6;
    return activeSavings.reduce(
      (sum, item) => sum + item.amount * item.interestRate,
      0,
    ) / summary.principal;
  }, [activeSavings, summary.principal]);

  const effectiveGoalRate =
    Number(goalInterestRate) > 0
      ? Number(goalInterestRate)
      : suggestedGoalRate;
  const currentMonthlyInterestEstimate =
    currentPortfolio * calculateMonthlyNetRate(effectiveGoalRate);
  const goalContribution = parseAmount(goalMonthlyContribution);
  const goalPlan = useMemo(
    () =>
      calculateInterestGoal(
        monthlyInterestTarget,
        effectiveGoalRate,
        currentPortfolio,
        goalContribution,
        getTodayIso(),
      ),
    [
      currentPortfolio,
      effectiveGoalRate,
      goalContribution,
      monthlyInterestTarget,
    ],
  );

  function updateForm(field: keyof SavingsForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm(getTodayIso()));
    setEditingId(null);
    setMode("add");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(form.amount);
    const interestRate = Number(
      form.customInterestRate || form.interestRate,
    );
    const term = Number(form.term);

    if (
      !amount ||
      !interestRate ||
      interestRate <= 0 ||
      !Number.isInteger(term) ||
      term < 1 ||
      !form.startDate
    ) {
      setMessage("Vui lòng kiểm tra lại số tiền, lãi suất, kỳ hạn và ngày gửi.");
      return;
    }

    const calculation = calculateSavings(
      amount,
      interestRate,
      term,
      form.startDate,
    );
    const sourceItem =
      editingId === null
        ? undefined
        : savings.find((current) => current.id === editingId);
    const previousHistory = sourceItem?.history ?? [];
    const maturedAmount =
      mode === "reinvest" && sourceItem
        ? Math.round(sourceItem.totalAmount)
        : 0;
    const cashRemainder = Math.max(0, maturedAmount - amount);
    const additionalContribution = Math.max(0, amount - maturedAmount);
    const completedCycle =
      mode === "reinvest" && sourceItem
        ? toSavingsCycle(sourceItem, {
            reinvestedAmount: amount,
            cashRemainder,
            additionalContribution,
          })
        : null;
    const itemId = editingId ?? Date.now();
    const item: SavingsItem = {
      id: itemId,
      name: form.name.trim() || "Khoản tiết kiệm",
      amount,
      interestRate,
      term,
      startDate: form.startDate,
      ...calculation,
      history:
        completedCycle
          ? [...previousHistory, completedCycle]
          : previousHistory,
      bankName: form.bankName.trim().slice(0, 120) || undefined,
      fundingAccountId: form.fundingAccountId || undefined,
      settlementAccountId: form.settlementAccountId || undefined,
      maturityInstruction: form.maturityInstruction,
      status: "active",
    };

    if (mode === "add" || mode === "edit") {
      const fundingTransactionId = `savings-${item.id}-initial`;
      setFinance((current) => {
        const existing = current.transactions.find(
          (transaction) => transaction.id === fundingTransactionId,
        );
        const transactions = current.transactions.filter(
          (transaction) => transaction.id !== fundingTransactionId,
        );
        const account = current.accounts.find(
          (candidate) =>
            candidate.id === item.fundingAccountId &&
            candidate.currency === "VND",
        );
        if (!account) return { ...current, transactions };
        const historicalEntry =
          mode === "edit" && previousHistory.length > 0
            ? existing
            : undefined;
        return {
          ...current,
          transactions: [
            createSavingsFinanceTransaction({
              accountId: account.id,
              amount: historicalEntry?.amount ?? item.amount,
              date: historicalEntry?.date ?? item.startDate,
              id: fundingTransactionId,
              note: `Gửi ${item.name}${item.bankName ? ` · ${item.bankName}` : ""}`,
              savingsId: item.id,
              type: "savings-deposit",
              createdAt: existing?.createdAt,
            }),
            ...transactions,
          ],
        };
      });
    }

    if (mode !== "add" && editingId !== null) {
      setSavings((items) =>
        items.map((current) => (current.id === editingId ? item : current)),
      );
      if (mode === "reinvest" && sourceItem) {
        const cycleNumber = previousHistory.length + 1;
        setFinance((current) => {
          const nextTransactions = [...current.transactions];
          const fundingAccount = current.accounts.find(
            (account) =>
              account.id === item.fundingAccountId &&
              account.currency === "VND",
          );
          const settlementAccount = current.accounts.find(
            (account) =>
              account.id === item.settlementAccountId &&
              account.currency === "VND",
          );
          if (additionalContribution > 0 && fundingAccount) {
            nextTransactions.unshift(
              createSavingsFinanceTransaction({
                accountId: fundingAccount.id,
                amount: additionalContribution,
                date: item.startDate,
                id: `savings-${item.id}-contribution-${cycleNumber}`,
                note: `Bổ sung vốn cho ${item.name}`,
                savingsId: item.id,
                type: "savings-deposit",
              }),
            );
          }
          if (cashRemainder > 0 && settlementAccount) {
            nextTransactions.unshift(
              createSavingsFinanceTransaction({
                accountId: settlementAccount.id,
                amount: cashRemainder,
                date: item.startDate,
                id: `savings-${item.id}-remainder-${cycleNumber}`,
                note: `Tiền còn lại sau tái đầu tư ${item.name}`,
                savingsId: item.id,
                type: "savings-settlement",
              }),
            );
          }
          return { ...current, transactions: nextTransactions };
        });
        if (cashRemainder > 0) {
          if (!item.settlementAccountId) {
            setCashLedger((entries) => [
              ...entries,
              {
                id: `${Date.now()}-${sourceItem.id}-${previousHistory.length}`,
                amount: cashRemainder,
                date: item.startDate,
                savingsId: sourceItem.id,
                savingsName: item.name,
                status: "available",
                type: "reinvestment-remainder",
              },
            ]);
          }
          setMessage(
            item.settlementAccountId
              ? `Đã tái đầu tư ${formatCurrency(amount)} và chuyển ${formatCurrency(cashRemainder)} vào tài khoản nhận.`
              : `Đã tái đầu tư ${formatCurrency(amount)} và chuyển ${formatCurrency(cashRemainder)} vào Ví tiền chưa tái đầu tư.`,
          );
        } else if (additionalContribution > 0) {
          setMessage(
            `Đã tái đầu tư ${formatCurrency(amount)}, gồm ${formatCurrency(additionalContribution)} vốn bổ sung thêm.`,
          );
        } else {
          setMessage(
            `Đã chuyển ${formatCurrency(amount)} sang kỳ tái đầu tư mới.`,
          );
        }
        setExpandedHistoryId(item.id);
      } else {
        setMessage(`Đã cập nhật “${item.name}”.`);
      }
    } else {
      setSavings((items) => [...items, item]);
      setMessage(`Đã thêm “${item.name}”.`);
    }
    resetForm();
  }

  function openSettlement(item: SavingsItem) {
    setSettlingId(item.id);
    setSettlementDraft({
      accountId: item.settlementAccountId ?? "",
      amount: formatAmountInput(Math.round(item.totalAmount)),
      date: today,
    });
  }

  function closeSettlement() {
    setSettlingId(null);
    setSettlementDraft({ accountId: "", amount: "", date: "" });
  }

  function handleSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const item = savings.find((candidate) => candidate.id === settlingId);
    const actualAmount = parseAmount(settlementDraft.amount);
    if (!item || !actualAmount || !settlementDraft.date) return;

    setSavings((items) =>
      items.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              status: "settled",
              settledAt: settlementDraft.date,
              actualSettlementAmount: actualAmount,
              settlementAccountId: settlementDraft.accountId || undefined,
            }
          : candidate,
      ),
    );

    const settlementTransactionId = `savings-${item.id}-settlement`;
    setFinance((current) => {
      const existing = current.transactions.find(
        (transaction) => transaction.id === settlementTransactionId,
      );
      const transactions = current.transactions.filter(
        (transaction) => transaction.id !== settlementTransactionId,
      );
      const account = current.accounts.find(
        (candidate) =>
          candidate.id === settlementDraft.accountId &&
          candidate.currency === "VND",
      );
      if (!account) return { ...current, transactions };
      return {
        ...current,
        transactions: [
          createSavingsFinanceTransaction({
            accountId: account.id,
            amount: actualAmount,
            date: settlementDraft.date,
            id: settlementTransactionId,
            note: `Tất toán ${item.name}${item.bankName ? ` · ${item.bankName}` : ""}`,
            savingsId: item.id,
            type: "savings-settlement",
            createdAt: existing?.createdAt,
          }),
          ...transactions,
        ],
      };
    });

    setMessage(
      `Đã tất toán “${item.name}” với số tiền thực nhận ${formatCurrency(actualAmount)}.`,
    );
    closeSettlement();
  }

  function handleAddRate() {
    const rate = Number(newInterestRate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      setMessage("Lãi suất mới cần lớn hơn 0 và không vượt quá 100%.");
      return;
    }
    if (interestRates.includes(rate)) {
      setMessage("Lãi suất này đã có trong danh sách.");
      return;
    }
    setInterestRates((rates) => [...rates, rate]);
    setNewInterestRate("");
    setMessage(`Đã thêm mức lãi suất ${formatRate(rate)}%.`);
  }

  function handleDeleteRate(rate: number) {
    setInterestRates((rates) => rates.filter((current) => current !== rate));
    if (Number(form.interestRate) === rate) {
      setForm((current) => ({
        ...current,
        interestRate: "",
        customInterestRate: String(rate),
      }));
    }
    setMessage(
      `Đã xóa mức ${formatRate(rate)}% khỏi danh sách chọn nhanh. Các khoản gửi đang dùng mức này không bị thay đổi.`,
    );
  }

  function handleDelete(id: number) {
    const item = savings.find((current) => current.id === id);
    if (!item) return;

    const linkedWalletEntries = cashLedger.filter(
      (entry) => entry.savingsId === id,
    );
    const linkedWalletTotal = linkedWalletEntries.reduce(
      (sum, entry) => sum + entry.amount,
      0,
    );
    const walletWarning = linkedWalletEntries.length
      ? `\n\n${linkedWalletEntries.length} giao dịch ví liên quan, tổng ${formatCurrency(linkedWalletTotal)}, cũng sẽ được xóa.`
      : "";

    if (
      !window.confirm(
        `Xóa khoản gửi “${item.name}” cùng toàn bộ lịch sử tái đầu tư?${walletWarning}`,
      )
    ) {
      return;
    }

    setSavings((items) => items.filter((current) => current.id !== id));
    setCashLedger((entries) =>
      entries.filter((entry) => entry.savingsId !== id),
    );
    setFinance((current) => ({
      ...current,
      transactions: current.transactions.filter(
        (transaction) => transaction.linkedSavingsId !== id,
      ),
    }));
    if (editingId === id) resetForm();
    if (expandedHistoryId === id) setExpandedHistoryId(null);
    setMessage(
      linkedWalletEntries.length
        ? `Đã xóa “${item.name}” cùng ${linkedWalletEntries.length} giao dịch ví liên quan.`
        : `Đã xóa “${item.name}”.`,
    );
  }

  function toggleCashEntryStatus(id: string) {
    const entry = cashLedger.find((current) => current.id === id);
    if (!entry) return;

    const markAsUsed = entry.status === "available";
    setCashLedger((entries) =>
      entries.map((current) =>
        current.id === id
          ? {
              ...current,
              status: markAsUsed ? "used" : "available",
              usedAt: markAsUsed ? getTodayIso() : undefined,
            }
          : current,
      ),
    );
    setMessage(
      markAsUsed
        ? `Đã rút ${formatCurrency(entry.amount)} khỏi số dư ví.`
        : `Đã đưa ${formatCurrency(entry.amount)} trở lại số dư ví.`,
    );
  }

  function prepareItem(item: SavingsItem, nextMode: FormMode) {
    const isPreset = interestRates.includes(item.interestRate);
    setForm({
      name: item.name,
      amount: formatAmountInput(
        Math.round(nextMode === "reinvest" ? item.totalAmount : item.amount),
      ),
      interestRate: isPreset ? String(item.interestRate) : "",
      customInterestRate: isPreset ? "" : String(item.interestRate),
      term: String(item.term),
      startDate:
        nextMode === "reinvest" ? item.maturityDate : item.startDate,
      bankName: item.bankName ?? "",
      fundingAccountId: item.fundingAccountId ?? "",
      settlementAccountId: item.settlementAccountId ?? "",
      maturityInstruction: item.maturityInstruction ?? "decide-later",
    });
    setMode(nextMode);
    // Editing and reinvesting both replace the source item. Keeping its id
    // prevents the matured principal from being counted a second time.
    setEditingId(nextMode === "add" ? null : item.id);
    setMessage(
      nextMode === "reinvest"
        ? `Đã điền ${formatCurrency(item.totalAmount)} để tái đầu tư. Bạn có thể thay đổi kỳ hạn hoặc lãi suất.`
        : `Đang chỉnh sửa “${item.name}”.`,
    );
    document
      .getElementById("deposit-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateItemName(id: number, name: string) {
    setSavings((items) =>
      items.map((item) =>
        item.id === id ? { ...item, name } : item,
      ),
    );
  }

  function finalizeItemName(id: number, name: string) {
    const normalizedName = name.trim() || "Khoản tiết kiệm";
    updateItemName(id, normalizedName);
  }

  function toggleGroup(rate: number) {
    setCollapsedRates((current) => {
      const next = new Set(current);
      if (next.has(rate)) next.delete(rate);
      else next.add(rate);
      return next;
    });
  }

  function applyCoreState(core: AppStateCore) {
    const repairedCore = {
      ...core,
      finance: reconcileSavingsFundingTransactions(core.finance, core.savings),
    };
    lastCoreSignatureRef.current = JSON.stringify(repairedCore);
    setSavings(repairedCore.savings);
    setInterestRates(repairedCore.interestRates);
    setCashLedger(repairedCore.cashLedger);
    setFinance(repairedCore.finance);
    setGoalMonthlyInterest(repairedCore.goal.monthlyInterest);
    setGoalInterestRate(repairedCore.goal.interestRate);
    setGoalMonthlyContribution(repairedCore.goal.monthlyContribution);
    setExchangeSettings(repairedCore.exchange);
    setFinancialGoals(repairedCore.financialGoals);
  }

  function restoreVersion(version: AppVersion) {
    const versionIndex = versionHistory.findIndex((item) => item.id === version.id);
    if (versionIndex < 0) return;
    if (!window.confirm(`Khôi phục “${version.label}”? Trạng thái hiện tại sẽ được thay bằng phiên bản đã chọn.`)) return;
    applyCoreState(version.data);
    setVersionHistory((current) => current.slice(0, versionIndex + 1));
    setBackupStatus({
      kind: "success",
      text: `Đã hoàn tác về phiên bản lúc ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(version.createdAt))}.`,
    });
  }

  function handleUndoLatest() {
    const previous = versionHistory[versionHistory.length - 2];
    if (previous) restoreVersion(previous);
  }

  function handleExportBackup() {
    const payload: BackupPayload = {
      app: BACKUP_APP_ID,
      version: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      ...currentCore,
      versionHistory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `moneymind-backup-${getTodayIso()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    setBackupStatus({
      kind: "success",
      text: `Đã tạo bản sao lưu gồm ${savings.length} khoản gửi, ${cashLedger.length} giao dịch ví và ${finance.transactions.length} giao dịch thu chi. Hãy lưu tệp vào nơi bạn có thể mở trên thiết bị khác.`,
    });
  }

  async function handleImportBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_BACKUP_SIZE) {
      setBackupStatus({
        kind: "error",
        text: "Tệp sao lưu vượt quá 5 MB và không thể khôi phục.",
      });
      return;
    }

    try {
      const payload = parseBackupPayload(JSON.parse(await file.text()));
      if (!payload) throw new Error("Invalid backup");

      const shouldRestore = window.confirm(
        `Khôi phục ${payload.savings.length} khoản gửi, ${payload.cashLedger.length} giao dịch ví và ${payload.finance.transactions.length} giao dịch thu chi từ bản sao lưu? Toàn bộ dữ liệu hiện có trên thiết bị này sẽ bị thay thế.`,
      );
      if (!shouldRestore) return;

      applyCoreState(payload);
      setVersionHistory(payload.versionHistory);
      setCollapsedRates(new Set());
      setExpandedHistoryId(null);
      resetForm();
      setBackupStatus({
        kind: "success",
        text: `Đã khôi phục ${payload.savings.length} khoản gửi và ${payload.finance.transactions.length} giao dịch thu chi. Dữ liệu đã được lưu trên thiết bị này.`,
      });
    } catch {
      setBackupStatus({
        kind: "error",
        text: "Không thể đọc tệp này. Hãy chọn đúng tệp JSON được tạo từ ứng dụng.",
      });
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setLoginMessageIsError(true);
      setLoginMessage("Hãy nhập một địa chỉ email hợp lệ.");
      return;
    }
    if (!loginPassword) {
      setLoginMessageIsError(true);
      setLoginMessage("Hãy nhập mật khẩu đã được cấp.");
      return;
    }

    setCloudActionBusy(true);
    setLoginMessage("");
    setLoginMessageIsError(false);
    try {
      await signInWithPassword(email, loginPassword);
      window.location.reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Chưa thể đăng nhập.";
      setLoginMessageIsError(true);
      setLoginMessage(
        /invalid login credentials/i.test(message)
          ? "Email hoặc mật khẩu không đúng. Hãy kiểm tra tài khoản trong Supabase."
          : /email not confirmed/i.test(message)
            ? "Email này chưa được xác nhận trong Supabase."
            : message,
      );
    } finally {
      setCloudActionBusy(false);
    }
  }

  async function handleMagicLinkRequest() {
    const email = loginEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setLoginMessageIsError(true);
      setLoginMessage("Nhập email hợp lệ để nhận liên kết đăng nhập.");
      return;
    }
    setCloudActionBusy(true);
    setLoginMessage("");
    setLoginMessageIsError(false);
    try {
      await sendMagicLink(email, `${window.location.origin}${window.location.pathname}`);
      setLoginMessage("Đã gửi liên kết đăng nhập. Hãy kiểm tra hộp thư và thư rác.");
    } catch (error) {
      setLoginMessageIsError(true);
      setLoginMessage(error instanceof Error ? error.message : "Chưa thể gửi liên kết đăng nhập.");
    } finally {
      setCloudActionBusy(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cloudSession) return;
    if (newPassword.length < 8) {
      setPasswordMessage("Mật khẩu mới cần có ít nhất 8 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Hai lần nhập mật khẩu chưa khớp.");
      return;
    }
    setCloudActionBusy(true);
    setPasswordMessage("");
    try {
      const activeSession = await ensureCloudSession(cloudSession);
      await updateCloudPassword(activeSession, newPassword);
      setCloudSession(activeSession);
      setPasswordMessage("Đã đổi mật khẩu thành công.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Chưa thể đổi mật khẩu.");
    } finally {
      setCloudActionBusy(false);
    }
  }

  function handleUseRemoteConflict() {
    if (!cloudConflict) return;
    const remoteCore = getCoreFromCloudState(cloudConflict.remoteState);
    applyCoreState(remoteCore);
    setVersionHistory(cloudConflict.remoteState.versionHistory);
    lastCloudUpdatedAtRef.current = cloudConflict.updatedAt;
    skipNextCloudWriteRef.current = true;
    setCloudConflict(null);
    setCloudError("");
    setCloudSyncStatus("saved");
  }

  async function handleKeepLocalConflict() {
    if (!cloudSession) return;
    setCloudActionBusy(true);
    try {
      const activeSession = await ensureCloudSession(cloudSession);
      const row = await writeCloudState(
        activeSession,
        createCloudAppState(currentCore, versionHistory),
      );
      if (row) lastCloudUpdatedAtRef.current = row.updated_at;
      setCloudSession(activeSession);
      setCloudConflict(null);
      setCloudError("");
      setCloudSyncStatus("saved");
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : "Chưa thể giữ phiên bản trên thiết bị này.");
    } finally {
      setCloudActionBusy(false);
    }
  }

  async function handleCloudSignOut() {
    setCloudActionBusy(true);
    try {
      await signOutCloud(cloudSession);
    } finally {
      setCloudSession(null);
      setCloudReady(false);
      setMigrationPending(false);
      setCloudError("");
      setCloudConflict(null);
      setCloudSyncStatus("idle");
      setRealtimeStatus("disconnected");
      lastCloudUpdatedAtRef.current = "";
      skipNextCloudWriteRef.current = false;
      cloudWritePendingRef.current = false;
      setAuthStatus("signed-out");
      setCloudActionBusy(false);
    }
  }

  async function handleMigrateLocalData() {
    if (!cloudSession) return;
    setCloudActionBusy(true);
    setCloudError("");
    try {
      const activeSession = await ensureCloudSession(cloudSession);
      const state = createCloudAppState(currentCore, versionHistory);
      const row = await writeCloudState(activeSession, state);
      if (row) lastCloudUpdatedAtRef.current = row.updated_at;
      skipNextCloudWriteRef.current = true;
      setCloudSession(activeSession);
      setMigrationPending(false);
      setCloudReady(true);
      setCloudSyncStatus("saved");
    } catch (error) {
      setCloudError(
        error instanceof Error
          ? error.message
          : "Không thể chuyển dữ liệu lên tài khoản.",
      );
      setCloudSyncStatus("error");
    } finally {
      setCloudActionBusy(false);
    }
  }

  async function handleStartFreshAccount() {
    if (!cloudSession) return;
    if (
      !window.confirm(
        "Bắt đầu tài khoản trống? Dữ liệu cũ trên thiết bị sẽ không được đưa lên tài khoản. Hãy tải bản sao lưu trước nếu vẫn cần giữ dữ liệu đó.",
      )
    ) {
      return;
    }

    setCloudActionBusy(true);
    setCloudError("");
    try {
      const activeSession = await ensureCloudSession(cloudSession);
      const emptyCore: AppStateCore = {
        savings: [],
        interestRates: DEFAULT_INTEREST_RATES,
        cashLedger: [],
        finance: createDefaultFinanceState(),
        goal: normalizeGoalSettings(null),
        exchange: { ...DEFAULT_EXCHANGE_SETTINGS },
        financialGoals: [],
      };
      const emptyState = createCloudAppState(emptyCore, []);
      const row = await writeCloudState(activeSession, emptyState);
      if (row) lastCloudUpdatedAtRef.current = row.updated_at;
      skipNextCloudWriteRef.current = true;
      setSavings([]);
      setInterestRates(DEFAULT_INTEREST_RATES);
      setCashLedger([]);
      setFinance(createDefaultFinanceState());
      setExchangeSettings({ ...DEFAULT_EXCHANGE_SETTINGS });
      setFinancialGoals([]);
      setVersionHistory([]);
      setGoalMonthlyInterest("");
      setGoalInterestRate("");
      setGoalMonthlyContribution("");
      setCloudSession(activeSession);
      setMigrationPending(false);
      setCloudReady(true);
      setCloudSyncStatus("saved");
    } catch (error) {
      setCloudError(
        error instanceof Error
          ? error.message
          : "Không thể tạo tài khoản trống.",
      );
      setCloudSyncStatus("error");
    } finally {
      setCloudActionBusy(false);
    }
  }

  if (cloudConfigured && (!ready || authStatus === "checking")) {
    return (
      <main className="auth-shell">
        <section className="auth-card auth-loading" aria-live="polite">
          <span className="auth-mark" aria-hidden="true">₫</span>
          <h1>Đang mở sổ tiết kiệm của bạn</h1>
          <p>Ứng dụng đang kiểm tra phiên đăng nhập và dữ liệu đã lưu.</p>
        </section>
      </main>
    );
  }

  if (cloudConfigured && authStatus === "signed-out") {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <span className="auth-kicker">SỔ TIẾT KIỆM CÁ NHÂN</span>
          <span className="auth-mark" aria-hidden="true">₫</span>
          <h1>Đăng nhập vào dữ liệu của bạn</h1>
          <p>
            Nhập email và mật khẩu do chủ ứng dụng cấp. Mỗi tài khoản chỉ truy
            cập được dữ liệu của chính mình.
          </p>
          <form className="auth-form" onSubmit={handlePasswordSubmit}>
            <label htmlFor="loginEmail">Email</label>
            <input
              id="loginEmail"
              type="email"
              autoComplete="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="ban@example.com"
              required
            />
            <label htmlFor="loginPassword">Mật khẩu</label>
            <input
              id="loginPassword"
              type="password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="Mật khẩu được cấp"
              required
            />
            <button type="submit" disabled={cloudActionBusy}>
              {cloudActionBusy ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>
          <div className="auth-divider"><span>hoặc</span></div>
          <button
            type="button"
            className="auth-magic-link"
            disabled={cloudActionBusy}
            onClick={() => void handleMagicLinkRequest()}
          >
            Gửi liên kết đăng nhập qua email
          </button>
          <p className="auth-help">Quên mật khẩu? Liên kết này giúp bạn đăng nhập an toàn, sau đó có thể đặt mật khẩu mới trong tài khoản.</p>
          {loginMessage && (
            <div
              className={`auth-message${loginMessageIsError ? " auth-message-error" : ""}`}
              role={loginMessageIsError ? "alert" : "status"}
            >
              {loginMessage}
            </div>
          )}
          <small>
            Tài khoản được tạo trước trong Supabase Authentication. Ứng dụng
            không cho phép tự đăng ký.
          </small>
        </section>
      </main>
    );
  }

  if (
    cloudConfigured &&
    authStatus === "signed-in" &&
    cloudSession &&
    !cloudReady &&
    cloudError &&
    !migrationPending
  ) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <span className="auth-mark auth-mark-error" aria-hidden="true">!</span>
          <h1>Chưa tải được dữ liệu</h1>
          <p>{cloudError}</p>
          <div className="auth-actions">
            <button type="button" onClick={() => window.location.reload()}>
              Thử lại
            </button>
            <button
              type="button"
              className="auth-button-secondary"
              onClick={() => void handleCloudSignOut()}
            >
              Đăng xuất
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (
    cloudConfigured &&
    authStatus === "signed-in" &&
    cloudSession &&
    migrationPending
  ) {
    return (
      <main className="auth-shell">
        <section className="auth-card migration-card">
          <span className="auth-kicker">CHUYỂN DỮ LIỆU AN TOÀN</span>
          <span className="auth-mark" aria-hidden="true">⇧</span>
          <h1>Thiết bị này đang có dữ liệu cũ</h1>
          <p>
            Tìm thấy <strong>{savings.length} khoản gửi</strong> và{
            " "}<strong>{cashLedger.length} giao dịch ví</strong>, cùng{
            " "}<strong>{finance.transactions.length} giao dịch thu chi</strong>. Ứng dụng sẽ
            không tự ghi đè cho đến khi bạn chọn.
          </p>
          {cloudError && (
            <div className="auth-message auth-message-error" role="alert">
              {cloudError}
            </div>
          )}
          <div className="migration-actions">
            <button
              type="button"
              disabled={cloudActionBusy}
              onClick={() => void handleMigrateLocalData()}
            >
              {cloudActionBusy
                ? "Đang chuyển dữ liệu…"
                : "Đưa dữ liệu này lên tài khoản"}
            </button>
            <button
              type="button"
              className="auth-button-secondary"
              onClick={handleExportBackup}
            >
              Tải bản sao lưu trước
            </button>
            <button
              type="button"
              className="auth-button-text"
              disabled={cloudActionBusy}
              onClick={() => void handleStartFreshAccount()}
            >
              Bắt đầu bằng tài khoản trống
            </button>
          </div>
          <small>Đang đăng nhập bằng {cloudSession.user.email}.</small>
        </section>
      </main>
    );
  }

  const submitLabel =
    mode === "edit"
      ? "Lưu thay đổi"
      : mode === "reinvest"
        ? "Thêm khoản tái đầu tư"
        : "Thêm khoản gửi";

  const appHeader = (
    <>
      <header className={`hero${activeWorkspace === "finance" ? " finance-hero" : activeWorkspace === "goals" ? " goals-hero" : ""}`}>
        <div className="hero-copy">
          <span className="eyebrow">
            {activeWorkspace === "finance"
              ? "QUẢN LÝ TÀI CHÍNH CÁ NHÂN"
              : activeWorkspace === "goals"
                ? "MỤC TIÊU TÀI CHÍNH"
                : "SỔ TIẾT KIỆM CÁ NHÂN"}
          </span>
          <h1>
            {activeWorkspace === "finance"
              ? "Thu chi rõ ràng, quyết định nhẹ đầu"
              : activeWorkspace === "goals"
                ? "Mỗi mục tiêu đều có một đường đi"
                : "Tính lãi suất tiết kiệm"}
          </h1>
          <p>
            {activeWorkspace === "finance"
              ? "Theo dõi tiền vào, tiền ra, ngân sách và số dư từng tài khoản trong cùng một nơi."
              : activeWorkspace === "goals"
                ? "Gắn tài khoản và khoản tiết kiệm vào quỹ khẩn cấp, mua nhà, du lịch, học phí hoặc kế hoạch riêng của bạn."
                : "Theo dõi từng khoản gửi, lãi sau khấu trừ và số tiền dự kiến khi đáo hạn — tất cả trong một nơi."}
          </p>
        </div>
        {authStatus === "signed-in" && cloudSession ? (
          <div className="account-pill">
            <div>
              <span
                className={`sync-dot ${
                  cloudSyncStatus === "saving" || cloudSyncStatus === "error"
                    ? cloudSyncStatus
                    : realtimeStatus
                }`}
                aria-hidden="true"
              />
              <strong>
                {cloudSyncStatus === "saving"
                  ? "Đang đồng bộ"
                  : cloudSyncStatus === "error"
                    ? "Chưa đồng bộ"
                    : realtimeStatus === "connected"
                      ? "Realtime đang hoạt động"
                      : realtimeStatus === "connecting"
                        ? "Đang kết nối realtime"
                        : "Đã lưu · realtime gián đoạn"}
              </strong>
              <small>{cloudSession.user.email}</small>
            </div>
            <div className="account-actions">
              <button type="button" disabled={cloudActionBusy} onClick={() => { setPasswordMessage(""); setPasswordModalOpen(true); }}>Đổi mật khẩu</button>
              <button type="button" disabled={cloudActionBusy} onClick={() => void handleCloudSignOut()}>Đăng xuất</button>
            </div>
          </div>
        ) : (
          <div className="privacy-pill" aria-label="Dữ liệu được lưu cục bộ">
            <span aria-hidden="true">◉</span>
            Chế độ cục bộ · có sao lưu
          </div>
        )}
      </header>
      <nav className="workspace-switcher" aria-label="Phân hệ MoneyMind">
        <button
          type="button"
          aria-current={activeWorkspace === "savings" ? "page" : undefined}
          className={activeWorkspace === "savings" ? "active" : ""}
          onClick={() => setActiveWorkspace("savings")}
        >
          <span aria-hidden="true">◇</span>
          Tiết kiệm
        </button>
        <button
          type="button"
          aria-current={activeWorkspace === "finance" ? "page" : undefined}
          className={activeWorkspace === "finance" ? "active" : ""}
          onClick={() => setActiveWorkspace("finance")}
        >
          <span aria-hidden="true">↕</span>
          Thu chi
        </button>
        <button
          type="button"
          aria-current={activeWorkspace === "goals" ? "page" : undefined}
          className={activeWorkspace === "goals" ? "active" : ""}
          onClick={() => setActiveWorkspace("goals")}
        >
          <span aria-hidden="true">◎</span>
          Mục tiêu
        </button>
      </nav>
      {passwordModalOpen && (
        <div className="security-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPasswordModalOpen(false); }}>
          <form className="security-modal" role="dialog" aria-modal="true" aria-labelledby="password-title" onSubmit={handleChangePassword}>
            <div className="security-heading"><div><span>BẢO MẬT TÀI KHOẢN</span><h3 id="password-title">Thay đổi mật khẩu</h3></div><button type="button" onClick={() => setPasswordModalOpen(false)} aria-label="Đóng">×</button></div>
            <label>Mật khẩu mới<input type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            <label>Nhập lại mật khẩu<input type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
            {passwordMessage && <p role="status">{passwordMessage}</p>}
            <div className="security-actions"><button type="button" onClick={() => setPasswordModalOpen(false)}>Đóng</button><button type="submit" disabled={cloudActionBusy}>{cloudActionBusy ? "Đang lưu…" : "Đổi mật khẩu"}</button></div>
          </form>
        </div>
      )}
    </>
  );

  const cloudBanner = cloudError && cloudReady && (
    <div className="cloud-error-banner" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <strong>{cloudConflict ? "Có thay đổi từ hai thiết bị" : "Thay đổi vẫn còn trên màn hình này"}</strong>
        <p>{cloudError}{cloudConflict ? " Hãy chọn phiên bản bạn muốn tiếp tục sử dụng." : " Ứng dụng sẽ thử lại ở lần thay đổi tiếp theo."}</p>
        {cloudConflict && (
          <div className="conflict-actions">
            <button type="button" onClick={handleUseRemoteConflict}>Dùng bản mới nhất</button>
            <button type="button" disabled={cloudActionBusy} onClick={() => void handleKeepLocalConflict()}>Giữ bản trên thiết bị này</button>
          </div>
        )}
      </div>
    </div>
  );

  if (activeWorkspace === "finance") {
    return (
      <main className="page-shell">
        <div className="app-container">
          {appHeader}
          {cloudBanner}
          <FinanceManager
            state={finance}
            onChange={setFinance}
            savingsValueVnd={currentPortfolio}
            walletValueVnd={cashBalance}
            exchangeSettings={exchangeSettings}
            onExchangeSettingsChange={setExchangeSettings}
          />
          <footer>
            <p>MoneyMind · Dữ liệu thu chi được sao lưu và đồng bộ cùng tài khoản của bạn.</p>
          </footer>
        </div>
      </main>
    );
  }

  if (activeWorkspace === "goals") {
    return (
      <main className="page-shell">
        <div className="app-container">
          {appHeader}
          {cloudBanner}
          <FinancialGoals
            exchangeSettings={exchangeSettings}
            finance={finance}
            goals={financialGoals}
            onChange={setFinancialGoals}
            savingsSources={goalSavingsSources}
          />
          <footer><p>MoneyMind · Tiến độ mục tiêu dùng số dư và tỷ giá đã lưu trong tài khoản của bạn.</p></footer>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="app-container">
        {appHeader}
        {cloudBanner}

        <section className="action-center" aria-labelledby="action-center-title">
          <div className="action-center-heading">
            <div>
              <span className="section-kicker">NHẮC VIỆC</span>
              <h2 id="action-center-title">Việc cần chú ý hôm nay</h2>
            </div>
            <span className={reminderCount ? "reminder-count active" : "reminder-count"}>
              {reminderCount} việc
            </span>
          </div>
          <div className="reminder-summary">
            <article className={maturityAlerts.overdue.length ? "urgent" : ""}>
              <span>Quá ngày đáo hạn</span>
              <strong>{maturityAlerts.overdue.length}</strong>
            </article>
            <article className={maturityAlerts.nextSevenDays.length ? "soon" : ""}>
              <span>Trong 7 ngày</span>
              <strong>{maturityAlerts.nextSevenDays.length}</strong>
            </article>
            <article>
              <span>Trong 8–30 ngày</span>
              <strong>{maturityAlerts.nextThirtyDays.length}</strong>
            </article>
            <article className={budgetAlerts.length ? "budget" : ""}>
              <span>Ngân sách ≥ 80%</span>
              <strong>{budgetAlerts.length}</strong>
            </article>
          </div>
          {reminderCount ? (
            <div className="reminder-list">
              {[...maturityAlerts.overdue, ...maturityAlerts.nextSevenDays].map((item) => {
                const overdue = item.maturityDate < today;
                return (
                  <article key={item.id}>
                    <span className={overdue ? "reminder-icon urgent" : "reminder-icon soon"} aria-hidden="true">
                      {overdue ? "!" : "⌛"}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.bankName ? `${item.bankName} · ` : ""}
                        {overdue ? "Đã quá hạn" : "Đáo hạn"} {formatDate(item.maturityDate)}
                      </small>
                    </div>
                    <button type="button" onClick={() => openSettlement(item)}>
                      Ghi tất toán
                    </button>
                  </article>
                );
              })}
              {budgetAlerts.map((alert) => (
                <article key={alert.budget.id}>
                  <span className="reminder-icon budget" aria-hidden="true">%</span>
                  <div>
                    <strong>{alert.categoryName}</strong>
                    <small>
                      Đã dùng {Math.round(alert.ratio * 100)}% ngân sách {alert.budget.currency}
                    </small>
                  </div>
                  <button type="button" onClick={() => setActiveWorkspace("finance")}>
                    Xem ngân sách
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="reminder-empty">Không có việc gấp. Các khoản gửi và ngân sách đang trong kế hoạch.</p>
          )}
        </section>

        <section className="form-section" id="deposit-form">
          <div className="section-heading">
            <div>
              <span className="section-kicker">KHOẢN GỬI</span>
              <h2>
                {mode === "edit"
                  ? "Chỉnh sửa khoản gửi"
                  : mode === "reinvest"
                    ? "Tạo kỳ tái đầu tư"
                    : "Thêm khoản gửi mới"}
              </h2>
            </div>
            <span className="step-badge">01</span>
          </div>

          {message && (
            <div className="status-message" role="status">
              <span aria-hidden="true">✓</span>
              {message}
              <button
                type="button"
                onClick={() => setMessage("")}
                aria-label="Đóng thông báo"
              >
                ×
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group form-group-wide">
                <label htmlFor="savingsName">Tên khoản tiền</label>
                <input
                  type="text"
                  id="savingsName"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Ví dụ: Tiền tiết kiệm sinh nhật"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label htmlFor="bankName">Ngân hàng</label>
                <input
                  type="text"
                  id="bankName"
                  value={form.bankName}
                  onChange={(event) => updateForm("bankName", event.target.value)}
                  placeholder="Ví dụ: Vietcombank"
                  maxLength={120}
                />
              </div>

              <div className="form-group">
                <label htmlFor="maturityInstruction">Khi đáo hạn</label>
                <select
                  id="maturityInstruction"
                  value={form.maturityInstruction}
                  onChange={(event) =>
                    updateForm(
                      "maturityInstruction",
                      event.target.value as MaturityInstruction,
                    )
                  }
                >
                  <option value="decide-later">Nhắc tôi quyết định</option>
                  <option value="return">Nhận gốc và lãi</option>
                  <option value="reinvest-all">Dự kiến tái đầu tư toàn bộ</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="amount">Số tiền gửi (VNĐ)</label>
                <div className="input-with-suffix">
                  <input
                    type="text"
                    inputMode="numeric"
                    id="amount"
                    required
                    value={form.amount}
                    onChange={(event) =>
                      updateForm("amount", formatAmountInput(event.target.value))
                    }
                    placeholder="10.000.000"
                  />
                  <span>₫</span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="term">Kỳ hạn (tháng)</label>
                <input
                  type="number"
                  id="term"
                  required
                  min="1"
                  step="1"
                  value={form.term}
                  onChange={(event) => updateForm("term", event.target.value)}
                  placeholder="6"
                />
              </div>

              <div className="form-group">
                <label htmlFor="interestRate">Lãi suất (%/năm)</label>
                <select
                  id="interestRate"
                  required={!form.customInterestRate}
                  value={form.interestRate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      interestRate: event.target.value,
                      customInterestRate: event.target.value
                        ? ""
                        : current.customInterestRate,
                    }))
                  }
                >
                  <option value="">Chọn lãi suất</option>
                  {sortedRates.map((rate) => (
                    <option value={rate} key={rate}>
                      {formatRate(rate)}%
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="customInterestRate">Lãi suất khác</label>
                <div className="input-with-suffix">
                  <input
                    type="number"
                    id="customInterestRate"
                    min="0.01"
                    max="100"
                    step="0.01"
                    required={!form.interestRate}
                    value={form.customInterestRate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        customInterestRate: event.target.value,
                        interestRate: event.target.value
                          ? ""
                          : current.interestRate,
                      }))
                    }
                    placeholder="Ví dụ: 5,8"
                  />
                  <span>%</span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="startDate">Ngày gửi</label>
                <input
                  type="date"
                  id="startDate"
                  required
                  value={form.startDate}
                  onChange={(event) =>
                    updateForm("startDate", event.target.value)
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="fundingAccountId">
                  {mode === "reinvest" ? "Tài khoản góp thêm" : "Tài khoản trừ tiền gửi"}
                </label>
                <select
                  id="fundingAccountId"
                  value={form.fundingAccountId}
                  onChange={(event) =>
                    updateForm("fundingAccountId", event.target.value)
                  }
                >
                  <option value="">Không liên kết tài khoản</option>
                  {vndAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group form-group-wide">
                <label htmlFor="settlementAccountId">Tài khoản nhận tiền đáo hạn</label>
                <select
                  id="settlementAccountId"
                  value={form.settlementAccountId}
                  onChange={(event) =>
                    updateForm("settlementAccountId", event.target.value)
                  }
                >
                  <option value="">Chọn khi tất toán</option>
                  {vndAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="account-link-note">
              <span aria-hidden="true">↔</span>
              <p>
                {vndAccounts.length
                  ? "Khi liên kết, tiền gửi và tiền tất toán sẽ tự cập nhật số dư tài khoản nhưng không bị tính thành thu hoặc chi."
                  : "Chưa có tài khoản VND. Hãy tạo một tài khoản VND trong phân hệ Thu chi để tự động cập nhật số dư."}
              </p>
              {!vndAccounts.length && (
                <button type="button" onClick={() => setActiveWorkspace("finance")}>
                  Tạo tài khoản VND
                </button>
              )}
            </div>

            <div className="rate-manager">
              <div className="rate-manager-copy">
                <h3>Quản lý lãi suất nhanh</h3>
                <p>Thêm các mức bạn thường dùng để chọn nhanh cho lần sau.</p>
              </div>
              <div className="rate-add-row">
                <div className="input-with-suffix compact-input">
                  <input
                    type="number"
                    id="newInterestRate"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={newInterestRate}
                    onChange={(event) => setNewInterestRate(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddRate();
                      }
                    }}
                    placeholder="Thêm lãi suất"
                    aria-label="Lãi suất mới"
                  />
                  <span>%</span>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleAddRate}
                >
                  + Thêm mức
                </button>
              </div>
              <div className="interest-rate-list" aria-label="Lãi suất đã lưu">
                {sortedRates.map((rate) => (
                  <span className="interest-rate-tag" key={rate}>
                    {formatRate(rate)}%
                    <button
                      type="button"
                      onClick={() => handleDeleteRate(rate)}
                      aria-label={`Xóa lãi suất ${formatRate(rate)}%`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {sortedRates.length === 0 && (
                  <span className="muted-copy">Chưa có mức lãi suất lưu sẵn.</span>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                <span>{mode === "edit" ? "✓" : "+"}</span>
                {submitLabel}
              </button>
              {mode !== "add" && (
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    resetForm();
                    setMessage("Đã hủy thay đổi.");
                  }}
                >
                  Hủy
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="summary-section" aria-labelledby="summary-title">
          <div className="section-heading summary-heading">
            <div>
              <span className="section-kicker">TỔNG QUAN</span>
              <h2 id="summary-title">Tài sản hôm nay và dự kiến</h2>
            </div>
            <span className="step-badge">02</span>
          </div>
          <div className="summary-cards">
            <article className="summary-card principal-card">
              <span className="card-icon" aria-hidden="true">↗</span>
              <div>
                <h3>Tổng vốn gửi</h3>
                <p>{formatCurrency(summary.principal)}</p>
              </div>
            </article>
            <article className="summary-card accrued-card">
              <span className="card-icon" aria-hidden="true">≈</span>
              <div>
                <h3>Lãi ròng kỳ hiện tại đến hôm nay</h3>
                <p>+{formatCurrency(summary.accruedInterestAfterTax)}</p>
                <small>
                  Trước khấu trừ: {formatCurrency(summary.accruedInterest)}
                </small>
                <small>
                  Khấu trừ 5%: −{formatCurrency(summary.accruedTax)}
                </small>
              </div>
            </article>
            <article className="summary-card interest-card">
              <span className="card-icon" aria-hidden="true">+</span>
              <div>
                <h3>Tổng lãi dự kiến</h3>
                <p>{formatCurrency(summary.interest)}</p>
                <small>Sau khấu trừ giả định</small>
              </div>
            </article>
            <article className="summary-card assets-card">
              <span className="card-icon" aria-hidden="true">◆</span>
              <div>
                <h3>Tổng tài sản dự kiến</h3>
                <p>{formatCurrency(summary.assets)}</p>
                <small>Vốn + lãi + tiền đang giữ trong ví</small>
                <small>
                  Giá trị đến hôm nay: {formatCurrency(summary.currentAssets)}
                </small>
              </div>
            </article>
          </div>
          <div
            className={
              "savings-trend-card " +
              (savingsTrendChange < 0 ? "decline" : "growth")
            }
            aria-labelledby="savings-trend-title"
          >
            <div className="savings-trend-heading">
              <div>
                <span className="savings-trend-kicker">12 THÁNG QUA</span>
                <h3 id="savings-trend-title">Tăng trưởng tiền tiết kiệm</h3>
                <p>Giá trị gốc cộng lãi ròng tích lũy tại từng thời điểm.</p>
              </div>
              <div className="savings-trend-current">
                <span>Hiện tại</span>
                <strong>{formatCurrency(savingsTrendCurrent)}</strong>
                <small>
                  <span aria-hidden="true">
                    {savingsTrendChange < 0 ? "▼" : "▲"}
                  </span>{" "}
                  {savingsTrendChange >= 0 ? "+" : ""}
                  {formatCurrency(savingsTrendChange)}
                  {savingsTrendPercent === null
                    ? " · bắt đầu trong kỳ"
                    : " · " +
                      (savingsTrendPercent >= 0 ? "+" : "") +
                      formatRate(savingsTrendPercent) +
                      "%"}
                </small>
              </div>
            </div>

            <div className="savings-trend-plot">
              <svg
                className="savings-trend-svg"
                viewBox={
                  "0 0 " +
                  SAVINGS_TREND_CHART.width +
                  " " +
                  SAVINGS_TREND_CHART.height
                }
                preserveAspectRatio="none"
                role="img"
                aria-label={
                  "Biểu đồ giá trị tiền tiết kiệm trong 12 tháng, từ " +
                  formatMonthTitle(savingsTrend[0]?.key ?? getMonthKey(today)) +
                  " đến " +
                  formatMonthTitle(savingsTrend.at(-1)?.key ?? getMonthKey(today))
                }
                aria-describedby="savings-trend-note"
              >
                <defs>
                  <linearGradient
                    id="savings-trend-area-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0.015" />
                  </linearGradient>
                </defs>

                {savingsTrendTicks.map((tick) => (
                  <g className="savings-trend-grid" key={tick.y}>
                    <line
                      x1={SAVINGS_TREND_CHART.left}
                      x2={SAVINGS_TREND_CHART.right}
                      y1={tick.y}
                      y2={tick.y}
                    />
                    <text
                      x={SAVINGS_TREND_CHART.left - 11}
                      y={tick.y + 4}
                      textAnchor="end"
                    >
                      {formatCompactMoney(tick.value)}
                    </text>
                  </g>
                ))}

                <path
                  className="savings-trend-area"
                  d={savingsTrendAreaPath}
                  fill="url(#savings-trend-area-fill)"
                />
                <path
                  className="savings-trend-line"
                  d={savingsTrendLinePath}
                  fill="none"
                />

                {selectedSavingsTrendChartPoint && (
                  <g className="savings-trend-selection" aria-hidden="true">
                    <line
                      x1={selectedSavingsTrendChartPoint.x}
                      x2={selectedSavingsTrendChartPoint.x}
                      y1={SAVINGS_TREND_CHART.top}
                      y2={SAVINGS_TREND_CHART.bottom}
                    />
                    <circle
                      cx={selectedSavingsTrendChartPoint.x}
                      cy={selectedSavingsTrendChartPoint.y}
                      r="6"
                    />
                  </g>
                )}

                {savingsTrendChartPoints.map((point, index) => {
                  const isSelected =
                    point.key === selectedSavingsTrend?.key;
                  return (
                    <g
                      className={
                        "savings-trend-point" +
                        (isSelected ? " selected" : "")
                      }
                      key={point.key}
                      role="button"
                      tabIndex={0}
                      aria-label={
                        formatMonthTitle(point.key) +
                        ": " +
                        formatCurrency(point.value) +
                        ", " +
                        point.activeCount +
                        " khoản tiết kiệm"
                      }
                      onClick={() => setSelectedSavingsTrendMonth(point.key)}
                      onFocus={() => setSelectedSavingsTrendMonth(point.key)}
                      onPointerEnter={() =>
                        setSelectedSavingsTrendMonth(point.key)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedSavingsTrendMonth(point.key);
                        }
                      }}
                    >
                      <circle
                        className="savings-trend-hit"
                        cx={point.x}
                        cy={point.y}
                        r="15"
                      />
                      <circle
                        className="savings-trend-dot"
                        cx={point.x}
                        cy={point.y}
                        r={isSelected ? 5 : 3}
                      />
                      {(index === 0 ||
                        index === savingsTrendChartPoints.length - 1 ||
                        index % 3 === 0) && (
                        <text
                          className="savings-trend-month"
                          x={point.x}
                          y={SAVINGS_TREND_CHART.height - 5}
                          textAnchor={
                            index === 0
                              ? "start"
                              : index === savingsTrendChartPoints.length - 1
                                ? "end"
                                : "middle"
                          }
                        >
                          {formatTrendMonth(
                            point.key,
                            index === 0 ||
                              index === savingsTrendChartPoints.length - 1,
                          )}
                        </text>
                      )}
                    </g>
                  );
                })}

                {selectedSavingsTrendChartPoint && selectedSavingsTrend && (
                  <g
                    className="savings-trend-tooltip"
                    transform={
                      "translate(" +
                      savingsTrendTooltipX +
                      " " +
                      savingsTrendTooltipY +
                      ")"
                    }
                    aria-hidden="true"
                  >
                    <rect width="194" height="68" rx="9" />
                    <text className="tooltip-month" x="12" y="18">
                      {formatMonthTitle(selectedSavingsTrend.key)}
                    </text>
                    <text className="tooltip-value" x="12" y="39">
                      {formatCompactMoney(selectedSavingsTrend.value)}
                    </text>
                    <text className="tooltip-change" x="12" y="57">
                      {selectedSavingsTrendChange === null
                        ? "Mốc đầu tiên"
                        : "So với tháng trước " +
                          (selectedSavingsTrendChange >= 0 ? "+" : "") +
                          formatCompactMoney(selectedSavingsTrendChange)}
                    </text>
                  </g>
                )}
              </svg>
              {!savingsTrendHasData && (
                <div className="savings-trend-empty">
                  <span aria-hidden="true">⌁</span>
                  <p>Thêm khoản gửi để bắt đầu theo dõi đường tăng trưởng.</p>
                </div>
              )}
            </div>

            {selectedSavingsTrend && (
              <div className="savings-trend-detail" aria-live="polite">
                <div>
                  <span>Đang xem</span>
                  <strong>{formatMonthTitle(selectedSavingsTrend.key)}</strong>
                </div>
                <div>
                  <span>Giá trị</span>
                  <strong>{formatCurrency(selectedSavingsTrend.value)}</strong>
                </div>
                <div>
                  <span>Thay đổi tháng</span>
                  <strong
                    className={
                      selectedSavingsTrendChange !== null &&
                      selectedSavingsTrendChange < 0
                        ? "negative"
                        : "positive"
                    }
                  >
                    {selectedSavingsTrendChange === null
                      ? "—"
                      : (selectedSavingsTrendChange >= 0 ? "+" : "") +
                        formatCurrency(selectedSavingsTrendChange)}
                  </strong>
                </div>
                <div>
                  <span>Cấu thành</span>
                  <strong>
                    {formatCurrency(selectedSavingsTrend.principal)} gốc
                  </strong>
                  <small>
                    +{formatCurrency(selectedSavingsTrend.interest)} lãi ·{" "}
                    {selectedSavingsTrend.activeCount} khoản
                  </small>
                </div>
              </div>
            )}
            <p className="savings-trend-note" id="savings-trend-note">
              Mỗi điểm là cuối tháng; tháng hiện tại tính đến hôm nay. Khoản đã
              tất toán rời khỏi biểu đồ từ ngày tất toán, còn tái đầu tư tiếp tục
              theo kỳ mới.
            </p>
          </div>
          <article className="today-interest-card">
            <div className="today-interest-heading">
              <span className="today-interest-icon" aria-hidden="true">↟</span>
              <div>
                <span>RIÊNG NGÀY {formatDate(today)}</span>
                <h3>Lãi phát sinh hôm nay</h3>
                <p>
                  Phần tăng thêm so với tổng lãi đã ghi nhận đến hết hôm qua.
                </p>
              </div>
            </div>
            <div className="today-interest-values">
              <div className="today-interest-gross">
                <span>Trước khấu trừ</span>
                <strong>+{formatCurrency(summary.todayInterest)}</strong>
              </div>
              <div>
                <span>Tạm khấu trừ 5%</span>
                <strong>−{formatCurrency(summary.todayTax)}</strong>
              </div>
              <div>
                <span>Lãi ròng hôm nay</span>
                <strong>
                  +{formatCurrency(summary.todayInterestAfterTax)}
                </strong>
              </div>
            </div>
          </article>
          <div className="cash-wallet">
            <div className="wallet-overview">
              <span className="wallet-icon" aria-hidden="true">₫</span>
              <div className="wallet-copy">
                <span>VÍ TIỀN CHƯA TÁI ĐẦU TƯ</span>
                <h3>Phần tiền đáo hạn đang được giữ lại</h3>
                <p>
                  Tiền không đưa vào kỳ mới sẽ nằm ở đây, không bị tính nhầm
                  là vốn đang gửi.
                </p>
              </div>
              <div className="wallet-balance">
                <span>Số dư khả dụng</span>
                <strong>{formatCurrency(cashBalance)}</strong>
                <small>
                  {cashLedger.filter((entry) => entry.status === "available").length}{" "}
                  khoản đang giữ
                </small>
              </div>
            </div>

            {cashLedger.length > 0 ? (
              <details className="wallet-history">
                <summary>
                  <span>Lịch sử ví ({cashLedger.length})</span>
                  <span aria-hidden="true">⌄</span>
                </summary>
                <div className="wallet-entry-list">
                  {[...cashLedger].reverse().map((entry) => (
                    <article
                      className={`wallet-entry ${entry.status}`}
                      key={entry.id}
                    >
                      <div>
                        <strong>{entry.savingsName}</strong>
                        <span>
                          Tách ra khi tái đầu tư ngày {formatDate(entry.date)}
                          {entry.usedAt
                            ? ` · Đã rút ngày ${formatDate(entry.usedAt)}`
                            : ""}
                        </span>
                      </div>
                      <strong>{formatCurrency(entry.amount)}</strong>
                      <button
                        type="button"
                        onClick={() => toggleCashEntryStatus(entry.id)}
                      >
                        {entry.status === "available"
                          ? "Rút khỏi ví"
                          : "Đưa lại vào ví"}
                      </button>
                    </article>
                  ))}
                </div>
              </details>
            ) : (
              <p className="wallet-empty">
                Chưa có tiền giữ lại. Khi tái đầu tư ít hơn số nhận cuối kỳ,
                phần chênh lệch sẽ tự động xuất hiện tại đây.
              </p>
            )}
          </div>
          <p className="calculation-note">
            Lãi đến hôm nay dùng lãi đơn: gốc × lãi suất năm × số ngày/365 và
            làm tròn xuống từng khoản để khớp app thực tế. Lãi riêng hôm nay là
            phần chênh lệch giữa tổng lãi hôm nay và tổng đến hết hôm qua. Lãi
            dự kiến khi đáo hạn vẫn dùng lãi kép theo ngày. Gốc kỳ hiện tại đã
            bao gồm phần tái đầu tư từ các kỳ trước nên lãi cũ không được cộng
            lại. Mức khấu trừ 5% chỉ mang tính tham khảo.
          </p>
        </section>

        <section
          className="cashflow-section"
          aria-labelledby="cashflow-title"
        >
          <div className="section-heading cashflow-section-heading">
            <div>
              <span className="section-kicker">LỊCH DÒNG TIỀN</span>
              <h2 id="cashflow-title">Tiền sẽ về khi nào?</h2>
            </div>
            <div className="section-heading-actions">
              <div
                className="cashflow-period-toggle"
                role="group"
                aria-label="Khoảng thời gian dòng tiền"
              >
                {([12, 24] as CashflowPeriod[]).map((period) => (
                  <button
                    type="button"
                    key={period}
                    className={cashflowPeriod === period ? "active" : ""}
                    aria-pressed={cashflowPeriod === period}
                    onClick={() => setCashflowPeriod(period)}
                  >
                    {period} tháng
                  </button>
                ))}
              </div>
              <span className="step-badge">03</span>
            </div>
          </div>

          <div className="cashflow-overview">
            <article>
              <span>Tổng tiền về trong {cashflowPeriod} tháng</span>
              <strong>{formatCurrency(cashflowSummary.total)}</strong>
              <small>{cashflowSummary.activeMonths} tháng có đáo hạn</small>
            </article>
            <article>
              <span>Lãi ròng sẽ nhận</span>
              <strong>{formatCurrency(cashflowSummary.interest)}</strong>
              <small>Đã trừ khấu trừ giả định 5%</small>
            </article>
            <article>
              <span>Tháng dòng tiền lớn nhất</span>
              <strong>
                {cashflowSummary.peakMonth
                  ? formatMonthTitle(cashflowSummary.peakMonth.key)
                  : "Chưa có"}
              </strong>
              <small>
                {cashflowSummary.peakMonth
                  ? formatCurrency(cashflowSummary.peakMonth.total)
                  : "Thêm khoản gửi để bắt đầu"}
              </small>
            </article>
          </div>

          <div className="maturity-alerts" aria-label="Cảnh báo đáo hạn">
            <article className={maturityAlerts.overdue.length ? "urgent" : ""}>
              <span className="alert-symbol" aria-hidden="true">!</span>
              <div>
                <strong>{maturityAlerts.overdue.length}</strong>
                <span>Đã quá ngày đáo hạn</span>
              </div>
            </article>
            <article className={maturityAlerts.nextSevenDays.length ? "soon" : ""}>
              <span className="alert-symbol" aria-hidden="true">7</span>
              <div>
                <strong>{maturityAlerts.nextSevenDays.length}</strong>
                <span>Đáo hạn trong 7 ngày</span>
              </div>
            </article>
            <article>
              <span className="alert-symbol" aria-hidden="true">30</span>
              <div>
                <strong>{maturityAlerts.nextThirtyDays.length}</strong>
                <span>Đáo hạn từ 8–30 ngày</span>
              </div>
            </article>
          </div>

          <div className="cashflow-chart-card">
            <div className="cashflow-chart-header">
              <div>
                <h3>Dòng tiền đáo hạn theo tháng</h3>
                <p>Chọn một cột để xem từng khoản tạo nên dòng tiền.</p>
              </div>
              <div className="cashflow-legend" aria-label="Chú giải biểu đồ">
                <span><i className="principal-swatch" />Gốc</span>
                <span><i className="interest-swatch" />Lãi ròng</span>
                {monthlyInterestTarget > 0 && (
                  <span><i className="goal-swatch" />Đạt mục tiêu lãi</span>
                )}
              </div>
            </div>

            <div className="cashflow-chart-scroll">
              <div
                className="cashflow-bars"
                style={{
                  gridTemplateColumns: `repeat(${cashflowMonths.length}, minmax(58px, 1fr))`,
                  minWidth: `${cashflowMonths.length * 64}px`,
                }}
                role="group"
                aria-label={`Biểu đồ dòng tiền đáo hạn ${cashflowPeriod} tháng, tổng ${formatCurrency(cashflowSummary.total)}`}
              >
                {cashflowMonths.map((month) => {
                  const isSelected = selectedCashflow?.key === month.key;
                  const meetsInterestGoal =
                    monthlyInterestTarget > 0 &&
                    month.interest >= monthlyInterestTarget;
                  const principalHeight =
                    (month.principal / maxMonthlyCashflow) * 100;
                  const interestHeight =
                    (month.interest / maxMonthlyCashflow) * 100;
                  return (
                    <button
                      type="button"
                      className={`cashflow-bar${isSelected ? " selected" : ""}${meetsInterestGoal ? " meets-goal" : ""}`}
                      key={month.key}
                      aria-pressed={isSelected}
                      aria-label={`${formatMonthTitle(month.key)}: ${month.items.length} khoản đáo hạn, tổng ${formatCurrency(month.total)}${meetsInterestGoal ? ", lãi đáo hạn đạt mục tiêu tháng" : ""}`}
                      onClick={() => setSelectedCashflowMonth(month.key)}
                    >
                      <span className="cashflow-bar-value">
                        {formatCompactMoney(month.total)}
                      </span>
                      <span className="cashflow-bar-stack" aria-hidden="true">
                        <i
                          className="cashflow-interest-bar"
                          style={{ height: `${interestHeight}%` }}
                        />
                        <i
                          className="cashflow-principal-bar"
                          style={{ height: `${principalHeight}%` }}
                        />
                      </span>
                      <span className="cashflow-month-label">
                        {formatMonthShort(month.key)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {monthlyInterestTarget > 0 && (
              <p className="cashflow-goal-note">
                <strong>{cashflowMonthsMeetingGoal.length} tháng</strong> có
                tổng lãi đáo hạn đạt hoặc vượt mục tiêu{
                " "}
                {formatCurrency(monthlyInterestTarget)}.
              </p>
            )}
          </div>

          <div className="cashflow-detail-grid">
            <div className="cashflow-month-detail">
              <div className="cashflow-detail-header">
                <div>
                  <span>CHI TIẾT THÁNG</span>
                  <h3>
                    {selectedCashflow
                      ? formatMonthTitle(selectedCashflow.key)
                      : "Chưa có dữ liệu"}
                  </h3>
                </div>
                <div className="cashflow-detail-meta">
                  <strong>
                    {selectedCashflow?.items.length ?? 0} khoản đáo hạn
                  </strong>
                  {selectedCashflow &&
                    monthlyInterestTarget > 0 &&
                    selectedCashflow.interest >= monthlyInterestTarget && (
                      <span className="cashflow-goal-badge">
                        Lãi đáo hạn đạt mục tiêu
                      </span>
                    )}
                </div>
              </div>

              {selectedCashflow && selectedCashflow.items.length > 0 ? (
                <div className="cashflow-detail-list">
                  {selectedCashflow.items.map((item) => (
                    <article key={item.id}>
                      <div className="cashflow-item-main">
                        <span className="cashflow-item-date">
                          {formatDate(item.maturityDate)}
                        </span>
                        <h4>{item.name}</h4>
                        <p>
                          {formatMaturityDistance(item.maturityDate, today)} ·{
                          " "}
                          {formatRate(item.interestRate)}%/năm
                        </p>
                      </div>
                      <div className="cashflow-item-values">
                        <span>Gốc {formatCurrency(item.amount)}</span>
                        <span>Lãi +{formatCurrency(item.interestAfterTax)}</span>
                        <strong>{formatCurrency(item.totalAmount)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="cashflow-detail-empty">
                  <span aria-hidden="true">○</span>
                  <p>Không có khoản nào đáo hạn trong tháng này.</p>
                </div>
              )}
            </div>

            <aside className="ladder-card" aria-labelledby="ladder-title">
              <div className="ladder-card-heading">
                <span aria-hidden="true">≋</span>
                <div>
                  <span>GỢI Ý PHÂN BỔ</span>
                  <h3 id="ladder-title">Thang đáo hạn</h3>
                </div>
              </div>
              <p>{ladderRecommendation}</p>
              <div className="ladder-rungs" aria-label="Ví dụ bốn bậc kỳ hạn">
                {[3, 6, 9, 12].map((term, index) => (
                  <div key={term}>
                    <span>Bậc {index + 1}</span>
                    <strong>{term} tháng</strong>
                  </div>
                ))}
              </div>
              <small>
                Đây là gợi ý tham khảo và không tự thay đổi các khoản gửi.
              </small>
            </aside>
          </div>
        </section>

        <section className="goal-section" aria-labelledby="goal-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">MỤC TIÊU THU NHẬP</span>
              <h2 id="goal-title">Khi nào lãi đạt kỳ vọng mỗi tháng?</h2>
            </div>
            <span className="step-badge">04</span>
          </div>

          <div className="goal-layout">
            <div className="goal-form-card">
              <div className="goal-card-heading">
                <span aria-hidden="true">◎</span>
                <div>
                  <h3>Thiết lập mục tiêu</h3>
                  <p>Nhập số lãi ròng bạn muốn nhận trung bình mỗi tháng.</p>
                </div>
              </div>
              <div className="goal-current-income">
                <div>
                  <span>LÃI RÒNG ƯỚC TÍNH HIỆN TẠI/THÁNG</span>
                  <strong>
                    {formatCurrency(currentMonthlyInterestEstimate)}
                  </strong>
                  <small>
                    {currentPortfolio > 0
                      ? `Từ ${formatCurrency(currentPortfolio)} với mức ${formatRate(effectiveGoalRate)}%/năm.`
                      : "Thêm khoản gửi để ứng dụng tính mức lãi hiện tại."}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={currentMonthlyInterestEstimate <= 0}
                  onClick={() =>
                    setGoalMonthlyInterest(
                      formatAmountInput(
                        Math.round(currentMonthlyInterestEstimate),
                      ),
                    )
                  }
                >
                  Dùng làm mục tiêu
                </button>
              </div>
              <div className="goal-form-grid">
                <div className="form-group goal-field-wide">
                  <label htmlFor="goalMonthlyInterest">
                    Lãi ròng kỳ vọng mỗi tháng
                  </label>
                  <div className="input-with-suffix">
                    <input
                      type="text"
                      inputMode="numeric"
                      id="goalMonthlyInterest"
                      value={goalMonthlyInterest}
                      onChange={(event) =>
                        setGoalMonthlyInterest(
                          formatAmountInput(event.target.value),
                        )
                      }
                      placeholder="5.000.000"
                    />
                    <span>₫</span>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="goalInterestRate">
                    Lãi suất giả định (%/năm)
                  </label>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      id="goalInterestRate"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={goalInterestRate}
                      onChange={(event) => setGoalInterestRate(event.target.value)}
                      placeholder={formatRate(suggestedGoalRate)}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="goalMonthlyContribution">
                    Góp thêm mỗi tháng (không bắt buộc)
                  </label>
                  <div className="input-with-suffix">
                    <input
                      type="text"
                      inputMode="numeric"
                      id="goalMonthlyContribution"
                      value={goalMonthlyContribution}
                      onChange={(event) =>
                        setGoalMonthlyContribution(
                          formatAmountInput(event.target.value),
                        )
                      }
                      placeholder="0"
                    />
                    <span>₫</span>
                  </div>
                </div>
              </div>
              <p className="goal-rate-note">
                Mục tiêu vẫn do bạn chọn; nút phía trên chỉ giúp điền nhanh mức
                hiện tại. {" "}
                Để trống lãi suất sẽ dùng mức bình quân danh mục hiện tại là{
                " "}
                <strong>{formatRate(suggestedGoalRate)}%/năm</strong>.
              </p>
            </div>

            <div className={`goal-result-card${goalPlan ? " has-result" : ""}`}>
              {goalPlan ? (
                <>
                  <span className="goal-result-kicker">DỰ KIẾN ĐẠT MỤC TIÊU</span>
                  <h3>
                    {goalPlan.monthsToGoal === 0
                      ? "Bạn đã đạt mục tiêu"
                      : goalPlan.targetDate
                        ? formatDate(goalPlan.targetDate)
                        : "Cần thêm kế hoạch tích lũy"}
                  </h3>
                  <p className="goal-result-summary">
                    {goalPlan.monthsToGoal === 0
                      ? `Danh mục hiện tại đã có thể tạo khoảng ${formatCurrency(goalPlan.currentMonthlyInterest)} lãi ròng mỗi tháng.`
                      : goalPlan.monthsToGoal !== null
                        ? goalContribution > 0
                          ? `Còn khoảng ${formatGoalDuration(goalPlan.monthsToGoal)} với mức góp ${formatCurrency(goalContribution)} mỗi tháng và toàn bộ lãi được tái đầu tư.`
                          : `Còn khoảng ${formatGoalDuration(goalPlan.monthsToGoal)} nếu toàn bộ vốn và lãi tiếp tục được tái đầu tư.`
                        : goalContribution > 0
                          ? "Với mức góp hiện tại, thời gian đạt mục tiêu vượt quá 100 năm. Hãy tăng khoản góp hoặc lãi suất giả định."
                          : "Hãy thêm vốn hiện tại hoặc nhập khoản góp hàng tháng để tính thời điểm đạt mục tiêu."}
                  </p>

                  <div className="goal-metrics">
                    <div>
                      <span>Vốn hiện tại</span>
                      <strong>{formatCurrency(currentPortfolio)}</strong>
                    </div>
                    <div>
                      <span>Vốn cần có</span>
                      <strong>{formatCurrency(goalPlan.requiredCapital)}</strong>
                    </div>
                    <div>
                      <span>Còn thiếu hôm nay</span>
                      <strong>{formatCurrency(goalPlan.capitalGap)}</strong>
                    </div>
                    <div>
                      <span>Lãi hiện tại/tháng</span>
                      <strong>
                        {formatCurrency(goalPlan.currentMonthlyInterest)}
                      </strong>
                    </div>
                    {goalPlan.projectedContributions !== null && (
                      <div>
                        <span>Tổng tiền tự góp đến mục tiêu</span>
                        <strong>
                          {formatCurrency(goalPlan.projectedContributions)}
                        </strong>
                      </div>
                    )}
                    {goalPlan.projectedGrowth !== null && (
                      <div>
                        <span>Lãi tích lũy đến mục tiêu</span>
                        <strong>
                          {formatCurrency(goalPlan.projectedGrowth)}
                        </strong>
                      </div>
                    )}
                  </div>

                  <div className="goal-progress-block">
                    <div className="goal-progress-header">
                      <span>Tiến độ vốn hiện có</span>
                      <strong>{Math.round(goalPlan.progress)}%</strong>
                    </div>
                    <div
                      className="goal-progress-track"
                      role="progressbar"
                      aria-label="Tiến độ đạt vốn tạo lãi kỳ vọng"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(goalPlan.progress)}
                    >
                      <span style={{ width: `${goalPlan.progress}%` }} />
                    </div>
                    {goalContribution > 0 && (
                      <p className="goal-progress-note">
                        Khoản góp tương lai đã được dùng để tính ngày đạt mục
                        tiêu, nhưng chưa được cộng vào phần trăm vốn hiện có hôm
                        nay.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="goal-empty-state">
                  <span aria-hidden="true">₫</span>
                  <h3>Ví dụ: 5 triệu đồng mỗi tháng</h3>
                  <p>
                    Nhập mục tiêu để xem số vốn cần có, phần còn thiếu và ngày
                    dự kiến đạt được.
                  </p>
                </div>
              )}
            </div>
          </div>
          <p className="goal-calculation-note">
            Ước tính dùng lãi kép theo ngày, quy đổi một tháng bằng 365/12 ngày
            và trừ 5% trên tiền lãi. Kết quả giả định vốn được tái đầu tư liên
            tục; thực tế có thể khác theo kỳ hạn và chính sách ngân hàng.
          </p>
        </section>

        <section className="backup-section" aria-labelledby="backup-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">AN TOÀN DỮ LIỆU</span>
              <h2 id="backup-title">Sao lưu và khôi phục</h2>
            </div>
            <span className="step-badge">05</span>
          </div>

          {backupStatus && (
            <div
              className={`backup-status ${backupStatus.kind}`}
              role={backupStatus.kind === "error" ? "alert" : "status"}
            >
              <span aria-hidden="true">
                {backupStatus.kind === "error" ? "!" : "✓"}
              </span>
              <p>{backupStatus.text}</p>
              <button
                type="button"
                onClick={() => setBackupStatus(null)}
                aria-label="Đóng thông báo sao lưu"
              >
                ×
              </button>
            </div>
          )}

          <div className="backup-card">
            <span className="backup-icon" aria-hidden="true">↕</span>
            <div className="backup-copy">
              <h3>Mang dữ liệu sang thiết bị khác</h3>
              <p>
                Tải một tệp chứa toàn bộ khoản gửi, lịch sử tái đầu tư, ví tiền
                chưa tái đầu tư, tài khoản, giao dịch, ngân sách và mục tiêu.
                Trên thiết bị khác, mở ứng dụng rồi chọn khôi phục từ tệp.
              </p>
            </div>
            <div className="backup-actions">
              <button
                type="button"
                className="btn-primary backup-download"
                onClick={handleExportBackup}
                disabled={!ready}
              >
                <span aria-hidden="true">↓</span>
                Tải bản sao lưu
              </button>
              <button
                type="button"
                className="btn-secondary backup-restore"
                onClick={() => backupInputRef.current?.click()}
                disabled={!ready}
              >
                <span aria-hidden="true">↑</span>
                Khôi phục từ tệp
              </button>
              <input
                ref={backupInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                onChange={handleImportBackup}
                tabIndex={-1}
              />
            </div>
            <p className="backup-note">
              Khôi phục sẽ thay thế toàn bộ dữ liệu MoneyMind trên thiết bị
              hiện tại. Tệp chỉ được xử lý trong trình duyệt và không được tải
              lên máy chủ.
            </p>
          </div>
          <div className="version-card">
            <div className="version-heading">
              <div><span className="backup-icon" aria-hidden="true">↶</span><div><h3>Lịch sử phiên bản</h3><p>Tự lưu tối đa 20 mốc thay đổi. Bạn có thể hoàn tác mà không cần mở tệp sao lưu.</p></div></div>
              <button type="button" className="btn-secondary" disabled={versionHistory.length < 2} onClick={handleUndoLatest}>Hoàn tác thao tác gần nhất</button>
            </div>
            <div className="version-list">
              {[...versionHistory].reverse().slice(0, 6).map((version, index) => (
                <div key={version.id}>
                  <span aria-hidden="true">{index === 0 ? "●" : "○"}</span>
                  <div><strong>{index === 0 ? "Hiện tại" : version.label}</strong><small>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(version.createdAt))}</small></div>
                  <button type="button" disabled={index === 0} onClick={() => restoreVersion(version)}>{index === 0 ? "Đang dùng" : "Khôi phục"}</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="list-section" aria-labelledby="list-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">DANH SÁCH</span>
              <h2 id="list-title">Các khoản gửi của bạn</h2>
            </div>
            <span className="deposit-count">
              {activeSavings.length} đang gửi
              {settledSavingsCount ? ` · ${settledSavingsCount} đã tất toán` : ""}
            </span>
          </div>

          {savings.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">₫</span>
              <h3>Chưa có khoản gửi nào</h3>
              <p>Thêm khoản gửi đầu tiên để xem lãi và ngày đáo hạn dự kiến.</p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  document
                    .getElementById("deposit-form")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Bắt đầu ngay
              </button>
            </div>
          ) : (
            <div className="savings-list">
              {groupedSavings.map(([rate, items]) => {
                const isCollapsed = collapsedRates.has(rate);
                const activeGroupItems = items.filter(
                  (item) => item.status !== "settled",
                );
                const groupPrincipal = activeGroupItems.reduce(
                  (sum, item) => sum + item.amount,
                  0,
                );
                const groupInterest = activeGroupItems.reduce(
                  (sum, item) => sum + item.interestAfterTax,
                  0,
                );
                const groupAccruedInterest = activeGroupItems.reduce(
                  (sum, item) =>
                    sum +
                    calculateAccruedInterest(item, today).interestAfterTax,
                  0,
                );

                return (
                  <article className="savings-group" key={rate}>
                    <div className="group-header">
                      <div className="group-title">
                        <span className="rate-orb" aria-hidden="true">%</span>
                        <div>
                          <h3>Lãi suất {formatRate(rate)}%/năm</h3>
                          <p>
                            {activeGroupItems.length} đang gửi
                            {items.length > activeGroupItems.length
                              ? ` · ${items.length - activeGroupItems.length} đã tất toán`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="group-summary">
                        <div>
                          <span>Lãi kỳ hiện tại đến hôm nay</span>
                          <strong>
                            +{formatCurrency(groupAccruedInterest)}
                          </strong>
                        </div>
                        <div>
                          <span>Tổng nhận dự kiến</span>
                          <strong>
                            {formatCurrency(groupPrincipal + groupInterest)}
                          </strong>
                        </div>
                        <button
                          type="button"
                          className="btn-toggle"
                          onClick={() => toggleGroup(rate)}
                          aria-expanded={!isCollapsed}
                          aria-label={
                            isCollapsed ? "Mở nhóm khoản gửi" : "Thu gọn nhóm"
                          }
                        >
                          {isCollapsed ? "+" : "−"}
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="group-items">
                        {items.map((item) => {
                          const history = item.history ?? [];
                          const cycles: SavingsCycle[] = [...history, item];
                          const isSettled = item.status === "settled";
                          const isHistoryExpanded =
                            expandedHistoryId === item.id;
                          const progress = getTermProgress(
                            item.startDate,
                            item.maturityDate,
                          );
                          const accruedInterest = calculateAccruedInterest(
                            item,
                            today,
                          );
                          const todayInterest = calculateInterestToday(
                            item,
                            today,
                          );
                          const fundingAccount = finance.accounts.find(
                            (account) => account.id === item.fundingAccountId,
                          );
                          const settlementAccount = finance.accounts.find(
                            (account) => account.id === item.settlementAccountId,
                          );

                          return (
                          <div className="savings-item" key={item.id}>
                            <div className="savings-item-header">
                              <div className="item-name-section">
                                <label htmlFor={`name-${item.id}`}>
                                  Tên khoản gửi
                                </label>
                                <input
                                  id={`name-${item.id}`}
                                  type="text"
                                  className="item-name-input"
                                  value={item.name}
                                  onChange={(event) =>
                                    updateItemName(item.id, event.target.value)
                                  }
                                  onBlur={(event) =>
                                    finalizeItemName(
                                      item.id,
                                      event.target.value,
                                    )
                                  }
                                />
                                <div className="item-status-line">
                                  <span className={isSettled ? "status-badge settled" : item.maturityDate <= today ? "status-badge matured" : "status-badge active"}>
                                    {isSettled
                                      ? "Đã tất toán"
                                      : item.maturityDate <= today
                                        ? "Đã đáo hạn"
                                        : "Đang gửi"}
                                  </span>
                                  {item.bankName && <small>{item.bankName}</small>}
                                </div>
                              </div>
                              <div className="item-amount">
                                <span>Vốn gửi</span>
                                <strong>{formatCurrency(item.amount)}</strong>
                              </div>
                              <div className="item-actions">
                                {!isSettled && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-settle"
                                      onClick={() => openSettlement(item)}
                                    >
                                      ✓ Tất toán
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-reinvest"
                                      onClick={() => prepareItem(item, "reinvest")}
                                    >
                                      ↻ Tái đầu tư
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-edit"
                                      onClick={() => prepareItem(item, "edit")}
                                    >
                                      Sửa
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="btn-delete"
                                  onClick={() => handleDelete(item.id)}
                                >
                                  Xóa
                                </button>
                              </div>
                            </div>
                            {isSettled ? (
                              <div className="settled-result-strip">
                                <div>
                                  <span>THỰC NHẬN KHI TẤT TOÁN</span>
                                  <strong>{formatCurrency(item.actualSettlementAmount ?? item.totalAmount)}</strong>
                                  <small>
                                    {item.settledAt ? `Ngày ${formatDate(item.settledAt)}` : "Đã ghi nhận tất toán"}
                                  </small>
                                </div>
                                <div>
                                  <span>Lãi thực nhận</span>
                                  <strong>
                                    +{formatCurrency(Math.max(0, (item.actualSettlementAmount ?? item.totalAmount) - item.amount))}
                                  </strong>
                                  <small>{settlementAccount?.name ?? "Không liên kết tài khoản nhận"}</small>
                                </div>
                              </div>
                            ) : (
                            <div className="accrued-interest-strip">
                              <div className="accrued-interest-main">
                                <span>LÃI RÒNG KỲ HIỆN TẠI ĐẾN HÔM NAY</span>
                                <strong>
                                  +
                                  {formatCurrency(
                                    accruedInterest.interestAfterTax,
                                  )}
                                </strong>
                                <small>
                                  Sau {accruedInterest.elapsedDays} ngày sinh lãi
                                </small>
                              </div>
                              <div className="accrued-interest-breakdown">
                                <span className="today-item-interest">
                                  <small>Lãi riêng hôm nay</small>
                                  <strong>
                                    +{formatCurrency(todayInterest.interest)}
                                  </strong>
                                </span>
                                <span>
                                  <small>Lãi trước khấu trừ</small>
                                  <strong>
                                    {formatCurrency(accruedInterest.interest)}
                                  </strong>
                                </span>
                                <span>
                                  <small>Khấu trừ 5%</small>
                                  <strong className="accrued-tax">
                                    −{formatCurrency(accruedInterest.tax)}
                                  </strong>
                                </span>
                                <span>
                                  <small>Giá trị đến hôm nay</small>
                                  <strong>
                                    {formatCurrency(accruedInterest.totalAmount)}
                                  </strong>
                                </span>
                              </div>
                            </div>
                            )}
                            <div className="savings-details">
                              <div className="detail-item">
                                <span>Kỳ hạn</span>
                                <strong>{item.term} tháng</strong>
                              </div>
                              <div className="detail-item">
                                <span>Ngày gửi</span>
                                <strong>{formatDate(item.startDate)}</strong>
                              </div>
                              <div className="detail-item">
                                <span>Ngày đáo hạn</span>
                                <strong>{formatDate(item.maturityDate)}</strong>
                              </div>
                              <div className="detail-item">
                                <span>Lãi trước khấu trừ</span>
                                <strong>{formatCurrency(item.interest)}</strong>
                              </div>
                              <div className="detail-item tax-detail">
                                <span>Khấu trừ (5%)</span>
                                <strong>−{formatCurrency(item.tax)}</strong>
                              </div>
                              <div className="detail-item positive-detail">
                                <span>Lãi ròng</span>
                                <strong>
                                  +{formatCurrency(item.interestAfterTax)}
                                </strong>
                              </div>
                              <div className="detail-item highlight-detail">
                                <span>Tổng nhận được</span>
                                <strong>{formatCurrency(item.totalAmount)}</strong>
                              </div>
                              <div className="detail-item">
                                <span>Tài khoản nguồn</span>
                                <strong>{fundingAccount?.name ?? "Không liên kết"}</strong>
                              </div>
                              <div className="detail-item">
                                <span>Tài khoản nhận</span>
                                <strong>{settlementAccount?.name ?? "Chọn khi tất toán"}</strong>
                              </div>
                              <div className="detail-item">
                                <span>Chỉ thị đáo hạn</span>
                                <strong>
                                  {item.maturityInstruction === "return"
                                    ? "Nhận gốc và lãi"
                                    : item.maturityInstruction === "reinvest-all"
                                      ? "Tái đầu tư toàn bộ"
                                      : "Chờ quyết định"}
                                </strong>
                              </div>
                            </div>
                            {!isSettled && <div
                              className={
                                progress.isComplete
                                  ? "term-progress complete"
                                  : "term-progress"
                              }
                            >
                              <div className="term-progress-header">
                                <div>
                                  <span>TIẾN ĐỘ KỲ HIỆN TẠI</span>
                                  <strong>{progress.status}</strong>
                                </div>
                                <strong>
                                  {Math.round(progress.percentage)}%
                                </strong>
                              </div>
                              <div
                                className="progress-track"
                                role="progressbar"
                                aria-label={`Tiến độ kỳ gửi của ${item.name}`}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(progress.percentage)}
                                aria-valuetext={`${Math.round(progress.percentage)}%, ${progress.status}`}
                              >
                                <span
                                  className="progress-fill"
                                  style={{
                                    width: `${progress.percentage}%`,
                                  }}
                                />
                              </div>
                              <div className="progress-dates">
                                <span>
                                  <small>Bắt đầu</small>
                                  {formatDate(item.startDate)}
                                </span>
                                <span>
                                  {progress.elapsedDays}/{progress.totalDays} ngày
                                </span>
                                <span>
                                  <small>Đáo hạn</small>
                                  {formatDate(item.maturityDate)}
                                </span>
                              </div>
                            </div>}
                            <>
                                <button
                                  type="button"
                                  className="history-toggle"
                                  onClick={() =>
                                    setExpandedHistoryId((current) =>
                                      current === item.id ? null : item.id,
                                    )
                                  }
                                  aria-expanded={isHistoryExpanded}
                                >
                                  <span>
                                    <strong>Lịch sử nguồn tiền</strong>
                                    <small>
                                      {cycles.length} kỳ gửi · Xem gốc, lãi và
                                      các lần tái đầu tư
                                    </small>
                                  </span>
                                  <span aria-hidden="true">
                                    {isHistoryExpanded ? "−" : "+"}
                                  </span>
                                </button>

                                {isHistoryExpanded && (
                                  <div className="history-panel">
                                    <div className="history-panel-header">
                                      <div>
                                        <span>HÀNH TRÌNH NGUỒN TIỀN</span>
                                        <h4>{item.name}</h4>
                                      </div>
                                      <strong>{cycles.length} kỳ liên tiếp</strong>
                                    </div>

                                    {history.length === 0 && (
                                      <p className="history-origin-note">
                                        Đây là kỳ đầu tiên đang được theo dõi.
                                        Mỗi lần tái đầu tư tiếp theo sẽ tự động
                                        được nối vào dòng lịch sử này.
                                      </p>
                                    )}

                                    <div className="history-timeline">
                                      {cycles.map((cycle, cycleIndex) => {
                                        const isCurrentCycle =
                                          cycleIndex === cycles.length - 1;
                                        const nextCyclePrincipal =
                                          cycle.reinvestedAmount ??
                                          cycle.totalAmount;

                                        return (
                                          <div
                                            className="history-cycle"
                                            key={`${item.id}-${cycleIndex}-${cycle.startDate}`}
                                          >
                                            <span className="cycle-marker">
                                              {cycleIndex + 1}
                                            </span>
                                            <div className="cycle-card">
                                              <div className="cycle-card-header">
                                                <div>
                                                  <span>KỲ {cycleIndex + 1}</span>
                                                  <strong>
                                                    {formatDate(cycle.startDate)} →{" "}
                                                    {formatDate(cycle.maturityDate)}
                                                  </strong>
                                                </div>
                                                <span
                                                  className={
                                                    isCurrentCycle
                                                      ? "cycle-status current"
                                                      : "cycle-status"
                                                  }
                                                >
                                                  {isCurrentCycle
                                                    ? "Kỳ hiện tại"
                                                    : "Đã đáo hạn"}
                                                </span>
                                              </div>
                                              <div className="cycle-metrics">
                                                <div>
                                                  <span>Gốc đầu kỳ</span>
                                                  <strong>
                                                    {formatCurrency(cycle.amount)}
                                                  </strong>
                                                </div>
                                                <div>
                                                  <span>Lãi suất</span>
                                                  <strong>
                                                    {formatRate(
                                                      cycle.interestRate,
                                                    )}
                                                    %/năm
                                                  </strong>
                                                </div>
                                                <div>
                                                  <span>Kỳ hạn</span>
                                                  <strong>
                                                    {cycle.term} tháng
                                                  </strong>
                                                </div>
                                                <div>
                                                  <span>Lãi trước khấu trừ</span>
                                                  <strong>
                                                    {formatCurrency(
                                                      cycle.interest,
                                                    )}
                                                  </strong>
                                                </div>
                                                <div>
                                                  <span>Khấu trừ 5%</span>
                                                  <strong className="cycle-tax">
                                                    −{formatCurrency(cycle.tax)}
                                                  </strong>
                                                </div>
                                                <div>
                                                  <span>Lãi ròng</span>
                                                  <strong className="cycle-profit">
                                                    +
                                                    {formatCurrency(
                                                      cycle.interestAfterTax,
                                                    )}
                                                  </strong>
                                                </div>
                                                <div className="cycle-total">
                                                  <span>
                                                    {isCurrentCycle
                                                      ? "Dự kiến cuối kỳ"
                                                      : "Nhận cuối kỳ"}
                                                  </span>
                                                  <strong>
                                                    {formatCurrency(
                                                      cycle.totalAmount,
                                                    )}
                                                  </strong>
                                                </div>
                                              </div>
                                            </div>

                                            {!isCurrentCycle && (
                                              <div className="cycle-transition">
                                                <div className="transition-heading">
                                                  <span aria-hidden="true">↓</span>
                                                  <strong>
                                                    Phân bổ sau đáo hạn
                                                  </strong>
                                                </div>
                                                <div className="transition-values">
                                                  <span>
                                                    <small>
                                                      Gốc kỳ {cycleIndex + 2}
                                                    </small>
                                                    <strong>
                                                      {formatCurrency(
                                                        nextCyclePrincipal,
                                                      )}
                                                    </strong>
                                                  </span>
                                                  {(cycle.cashRemainder ?? 0) >
                                                    0 && (
                                                    <span className="transition-wallet">
                                                      <small>Chuyển vào ví</small>
                                                      <strong>
                                                        {formatCurrency(
                                                          cycle.cashRemainder ?? 0,
                                                        )}
                                                      </strong>
                                                    </span>
                                                  )}
                                                  {(cycle.additionalContribution ??
                                                    0) > 0 && (
                                                    <span className="transition-extra">
                                                      <small>Vốn bổ sung</small>
                                                      <strong>
                                                        +
                                                        {formatCurrency(
                                                          cycle.additionalContribution ??
                                                            0,
                                                        )}
                                                      </strong>
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                            </>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {settlingId !== null && (() => {
          const item = savings.find((candidate) => candidate.id === settlingId);
          if (!item) return null;
          const actualAmount = parseAmount(settlementDraft.amount);
          const actualInterest = Math.max(0, actualAmount - item.amount);
          const isEarlySettlement = settlementDraft.date < item.maturityDate;
          return (
            <div
              className="settlement-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) closeSettlement();
              }}
            >
              <form
                className="settlement-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settlement-title"
                onSubmit={handleSettlement}
              >
                <div className="settlement-heading">
                  <div>
                    <span>GHI NHẬN THỰC TẾ</span>
                    <h3 id="settlement-title">Tất toán “{item.name}”</h3>
                  </div>
                  <button type="button" onClick={closeSettlement} aria-label="Đóng">×</button>
                </div>
                <div className="settlement-projection">
                  <span>Dự kiến nhận</span>
                  <strong>{formatCurrency(item.totalAmount)}</strong>
                  <small>Đáo hạn {formatDate(item.maturityDate)}</small>
                </div>
                {isEarlySettlement && (
                  <p className="settlement-warning">
                    Ngày tất toán trước ngày đáo hạn. Hãy nhập số thực nhận theo xác nhận của ngân hàng.
                  </p>
                )}
                <div className="settlement-grid">
                  <label>
                    Số tiền thực nhận
                    <div className="input-with-suffix">
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        required
                        value={settlementDraft.amount}
                        onChange={(event) =>
                          setSettlementDraft((current) => ({
                            ...current,
                            amount: formatAmountInput(event.target.value),
                          }))
                        }
                      />
                      <span>₫</span>
                    </div>
                  </label>
                  <label>
                    Ngày tất toán
                    <input
                      type="date"
                      required
                      value={settlementDraft.date}
                      onChange={(event) =>
                        setSettlementDraft((current) => ({
                          ...current,
                          date: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="settlement-account-field">
                    Tài khoản nhận tiền
                    <select
                      value={settlementDraft.accountId}
                      onChange={(event) =>
                        setSettlementDraft((current) => ({
                          ...current,
                          accountId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Không cập nhật số dư tài khoản</option>
                      {vndAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="settlement-actual-summary">
                  <span>Gốc {formatCurrency(item.amount)}</span>
                  <strong>Lãi thực nhận +{formatCurrency(actualInterest)}</strong>
                </div>
                <div className="settlement-actions">
                  <button type="button" className="btn-cancel" onClick={closeSettlement}>Hủy</button>
                  <button type="submit" className="btn-primary">Xác nhận tất toán</button>
                </div>
              </form>
            </div>
          );
        })()}

        <footer>
          <p>
            Công cụ lập kế hoạch cá nhân · Kết quả là ước tính và có thể khác
            cách tính của từng ngân hàng.
          </p>
        </footer>
      </div>
    </main>
  );
}
