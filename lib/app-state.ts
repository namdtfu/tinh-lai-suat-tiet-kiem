import {
  normalizeProsperityItem,
  type ProsperityItem,
} from './prosperity.ts';

import {
  createDefaultFinanceState,
  type FinanceState,
  hasMeaningfulFinanceData,
  normalizeFinanceState,
  reconcileProsperityFundingTransactions,
  reconcileSavingsFundingTransactions,
} from "./finance.ts";
import {
  DEFAULT_EXCHANGE_SETTINGS,
  type ExchangeRateSettings,
  type FinancialGoal,
  normalizeExchangeSettings,
  normalizeFinancialGoals,
} from "./planning.ts";
import {
  calculateSavings,
  type MaturityInstruction,
  parseLocalDate,
  type SavingsCycle,
  type SavingsItem,
  type SavingsStatus,
  toLocalIso,
} from "./savings.ts";
export const BACKUP_APP_ID = "tinh-lai-suat-tiet-kiem";
export const BACKUP_FORMAT_VERSION = 8;
export const MAX_BACKUP_SIZE = 5_000_000;
export const SAFETY_SNAPSHOT_LIMIT = 7;
const DEFAULT_INTEREST_RATES = [9, 8.5, 8, 7.5, 7, 6.5, 6];

export type AppWorkspace = "savings" | "finance" | "goals" | "backup";

export type GoalSettings = {
  interestRate: string;
  monthlyContribution: string;
  monthlyInterest: string;
};

export type CashLedgerEntry = {
  id: string;
  amount: number;
  date: string;
  savingsId: number;
  savingsName: string;
  status: "available" | "used";
  type: "reinvestment-remainder";
  usedAt?: string;
};

export type BackupPayload = {
  app: typeof BACKUP_APP_ID;
  version: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  savings: SavingsItem[];
  prosperity: ProsperityItem[];
  interestRates: number[];
  cashLedger: CashLedgerEntry[];
  finance: FinanceState;
  goal: GoalSettings;
  exchange: ExchangeRateSettings;
  financialGoals: FinancialGoal[];
  versionHistory: AppVersion[];
};

export type BackupStatus = {
  kind: "success" | "error";
  text: string;
};

export type CloudAppState = {
  cashLedger: CashLedgerEntry[];
  goal: GoalSettings;
  interestRates: number[];
  savings: SavingsItem[];
  prosperity: ProsperityItem[];
  finance: FinanceState;
  exchange: ExchangeRateSettings;
  financialGoals: FinancialGoal[];
  versionHistory: AppVersion[];
  schemaVersion: 6;
};

export type AppStateCore = {
  cashLedger: CashLedgerEntry[];
  exchange: ExchangeRateSettings;
  finance: FinanceState;
  financialGoals: FinancialGoal[];
  goal: GoalSettings;
  interestRates: number[];
  savings: SavingsItem[];
  prosperity: ProsperityItem[];
};

export type AppVersion = {
  id: string;
  createdAt: string;
  label: string;
  data: AppStateCore;
};

export type SafetySnapshot = {
  id: string;
  createdAt: string;
  label: string;
  data: AppStateCore;
};

export type CloudConflict = {
  remoteState: CloudAppState;
  updatedAt: string;
};

export type AuthStatus = "checking" | "local" | "signed-in" | "signed-out";
export type CloudSyncStatus = "idle" | "saving" | "saved" | "error";


export function isRecord(value: unknown): value is Record<string, unknown> {
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
  const termType = value.termType === "open-ended" ? "open-ended" : "fixed";
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
    (termType === "fixed" ? term < 1 : term !== 0) ||
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
    termType,
    startDate,
    ...calculateSavings(amount, interestRate, term, startDate, termType),
    ...(reinvestedAmount === undefined ? {} : { reinvestedAmount }),
    ...(cashRemainder === undefined ? {} : { cashRemainder }),
    ...(additionalContribution === undefined
      ? {}
      : { additionalContribution }),
  };
}

export function normalizeCashLedgerEntry(value: unknown): CashLedgerEntry | null {
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

export function normalizeGoalSettings(value: unknown): GoalSettings {
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
  const rawProsperity =
    value.prosperity === undefined
      ? []
      : Array.isArray(value.prosperity)
        ? value.prosperity
        : null;
  const rawRates = Array.isArray(value.interestRates) ? value.interestRates : null;
  const rawCashLedger = Array.isArray(value.cashLedger) ? value.cashLedger : null;
  if (!rawSavings || !rawProsperity || !rawRates || !rawCashLedger) return null;

  const savings = rawSavings.map(normalizeBackupItem);
  const prosperity = rawProsperity.map(normalizeProsperityItem);
  const interestRates = rawRates.map(Number);
  const cashLedger = rawCashLedger.map(normalizeCashLedgerEntry);
  const savingsIds = new Set(
    savings.flatMap((item) => (item ? [item.id] : [])),
  );
  if (
    savings.some((item) => item === null) ||
    prosperity.some((item) => item === null) ||
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
    prosperity: prosperity as ProsperityItem[],
    interestRates: [...new Set(interestRates)],
    cashLedger: cashLedger as CashLedgerEntry[],
    finance: normalizeFinanceState(value.finance),
    goal: normalizeGoalSettings(value.goal),
    exchange: normalizeExchangeSettings(value.exchange),
    financialGoals: normalizeFinancialGoals(value.financialGoals),
  };
}

export function hasMeaningfulAppState(core: AppStateCore) {
  const hasCustomInterestRates =
    JSON.stringify([...core.interestRates].sort((left, right) => left - right)) !==
    JSON.stringify([...DEFAULT_INTEREST_RATES].sort((left, right) => left - right));
  return Boolean(
    core.savings.length ||
      core.prosperity.length ||
      core.cashLedger.length ||
      core.financialGoals.length ||
      hasCustomInterestRates ||
      hasMeaningfulFinanceData(core.finance) ||
      core.goal.monthlyInterest ||
      core.goal.interestRate ||
      core.goal.monthlyContribution ||
      JSON.stringify(core.exchange) !== JSON.stringify(DEFAULT_EXCHANGE_SETTINGS)
  );
}

export function createSafetySnapshot(
  data: AppStateCore,
  label: string,
  createdAt = new Date().toISOString(),
): SafetySnapshot {
  return {
    id: `safety-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt,
    label: label.slice(0, 120),
    data,
  };
}

export function normalizeSafetySnapshots(value: unknown): SafetySnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-SAFETY_SNAPSHOT_LIMIT).flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const data = normalizeAppStateCore(candidate.data);
    const id = typeof candidate.id === "string" ? candidate.id.slice(0, 120) : "";
    const createdAt =
      typeof candidate.createdAt === "string"
        ? candidate.createdAt.slice(0, 40)
        : "";
    if (!data || !id || !createdAt || Number.isNaN(Date.parse(createdAt))) {
      return [];
    }
    return [{
      id,
      createdAt,
      label:
        typeof candidate.label === "string"
          ? candidate.label.slice(0, 120)
          : "Bản sao an toàn",
      data,
    }];
  });
}

export function appendSafetySnapshot(
  snapshots: SafetySnapshot[],
  snapshot: SafetySnapshot,
) {
  const normalized = normalizeSafetySnapshots(snapshots);
  const normalizedSnapshot = normalizeSafetySnapshots([snapshot])[0];
  if (!normalizedSnapshot) return normalized;
  const latest = normalized.at(-1);
  if (
    latest &&
    JSON.stringify(latest.data) === JSON.stringify(normalizedSnapshot.data)
  ) {
    return normalized;
  }
  return [...normalized, normalizedSnapshot].slice(-SAFETY_SNAPSHOT_LIMIT);
}

export function normalizeVersionHistory(value: unknown): AppVersion[] {
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

export function parseBackupPayload(value: unknown): BackupPayload | null {
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
  const rawProsperity =
    isRecord(value) && version >= 7 ? value.prosperity : [];
  const rawVersionHistory =
    isRecord(value) && version >= 6 ? value.versionHistory : [];

  if (
    !isRecord(value) ||
    value.app !== BACKUP_APP_ID ||
    ![1, 2, 3, 4, 5, 6, 7, BACKUP_FORMAT_VERSION].includes(version) ||
    typeof value.exportedAt !== "string" ||
    !Array.isArray(value.savings) ||
    !Array.isArray(value.interestRates) ||
    !Array.isArray(rawCashLedger)
  ) {
    return null;
  }

  const core = normalizeAppStateCore({
    savings: value.savings,
    prosperity: rawProsperity,
    interestRates: value.interestRates,
    cashLedger: rawCashLedger,
    finance: rawFinance,
    goal: rawGoal,
    exchange: rawExchange,
    financialGoals: rawFinancialGoals,
  });
  if (!core) return null;
  const repairedFinance = reconcileProsperityFundingTransactions(
    reconcileSavingsFundingTransactions(core.finance, core.savings),
    core.prosperity,
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

export function parseCloudAppState(value: unknown): CloudAppState | null {
  const schemaVersion = isRecord(value) ? Number(value.schemaVersion) : 0;
  if (
    !isRecord(value) ||
    ![1, 2, 3, 4, 5, 6].includes(schemaVersion)
  ) {
    return null;
  }

  const backup = parseBackupPayload({
    app: BACKUP_APP_ID,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    savings: value.savings,
    prosperity: schemaVersion >= 6 ? value.prosperity : [],
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
    schemaVersion: 6,
    savings: backup.savings,
    prosperity: backup.prosperity,
    interestRates: backup.interestRates,
    cashLedger: backup.cashLedger,
    finance: backup.finance,
    goal: backup.goal,
    exchange: backup.exchange,
    financialGoals: backup.financialGoals,
    versionHistory: backup.versionHistory,
  };
}

export function createCloudAppState(
  core: AppStateCore,
  versionHistory: AppVersion[],
): CloudAppState {
  return {
    schemaVersion: 6,
    ...core,
    versionHistory,
  };
}

export function createBackupPayload(
  core: AppStateCore,
  versionHistory: AppVersion[],
  exportedAt = new Date().toISOString(),
): BackupPayload {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_FORMAT_VERSION,
    exportedAt,
    ...core,
    versionHistory,
  };
}

export function getCoreFromCloudState(state: CloudAppState): AppStateCore {
  return {
    savings: state.savings,
    prosperity: state.prosperity,
    interestRates: state.interestRates,
    cashLedger: state.cashLedger,
    finance: state.finance,
    goal: state.goal,
    exchange: state.exchange,
    financialGoals: state.financialGoals,
  };
}
