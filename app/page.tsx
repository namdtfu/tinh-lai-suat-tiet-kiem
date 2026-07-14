"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const DEFAULT_INTEREST_RATES = [9, 8.5, 8, 7.5, 7, 6.5, 6];
const SAVINGS_KEY = "savings";
const RATES_KEY = "interestRates";
const CASH_LEDGER_KEY = "cashLedger";
const BACKUP_APP_ID = "tinh-lai-suat-tiet-kiem";
const BACKUP_FORMAT_VERSION = 2;
const MAX_BACKUP_SIZE = 5_000_000;
const INTEREST_DEDUCTION_RATE = 0.05;
const AVERAGE_DAYS_PER_MONTH = 365 / 12;
const MAX_GOAL_MONTHS = 1_200;

type FormMode = "add" | "edit" | "reinvest";

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
};

type SavingsForm = {
  name: string;
  amount: string;
  interestRate: string;
  customInterestRate: string;
  term: string;
  startDate: string;
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
};

type BackupStatus = {
  kind: "success" | "error";
  text: string;
};

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

  const monthlyGrossRate =
    (1 + annualInterestRate / 100 / 365) ** AVERAGE_DAYS_PER_MONTH - 1;
  const monthlyNetRate = monthlyGrossRate * (1 - INTEREST_DEDUCTION_RATE);
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
  };
}

function parseBackupPayload(value: unknown): BackupPayload | null {
  const version = isRecord(value) ? Number(value.version) : 0;
  const rawCashLedger =
    isRecord(value) && version === 1 ? [] : isRecord(value) ? value.cashLedger : null;

  if (
    !isRecord(value) ||
    value.app !== BACKUP_APP_ID ||
    (version !== 1 && version !== BACKUP_FORMAT_VERSION) ||
    typeof value.exportedAt !== "string" ||
    !Array.isArray(value.savings) ||
    !Array.isArray(value.interestRates) ||
    !Array.isArray(rawCashLedger)
  ) {
    return null;
  }

  const savings = value.savings.map(normalizeBackupItem);
  const interestRates = value.interestRates.map(Number);
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
    app: BACKUP_APP_ID,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: value.exportedAt,
    savings: savings as SavingsItem[],
    interestRates: [...new Set(interestRates)],
    cashLedger: cashLedger as CashLedgerEntry[],
  };
}

function formatCurrency(amount: number) {
  return currencyFormatter.format(Math.round(amount));
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

export default function Home() {
  const [savings, setSavings] = useState<SavingsItem[]>([]);
  const [interestRates, setInterestRates] = useState(DEFAULT_INTEREST_RATES);
  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>([]);
  const [form, setForm] = useState<SavingsForm>(emptyForm());
  const [newInterestRate, setNewInterestRate] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mode, setMode] = useState<FormMode>("add");
  const [collapsedRates, setCollapsedRates] = useState<Set<number>>(new Set());
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [goalMonthlyInterest, setGoalMonthlyInterest] = useState("");
  const [goalInterestRate, setGoalInterestRate] = useState("");
  const [goalMonthlyContribution, setGoalMonthlyContribution] = useState("");
  const [cashflowPeriod, setCashflowPeriod] = useState<CashflowPeriod>(12);
  const [selectedCashflowMonth, setSelectedCashflowMonth] = useState(
    getMonthKey(getTodayIso()),
  );
  const [ready, setReady] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage is client-only, so persisted data must be hydrated after mount. */
    const storedSavings = readStoredArray<SavingsItem>(SAVINGS_KEY);
    const storedRates = readStoredArray<number>(RATES_KEY);
    const storedCashLedger = readStoredArray<CashLedgerEntry>(CASH_LEDGER_KEY);

    if (storedSavings) {
      setSavings(storedSavings.map(recalculateSavingsItem));
    }
    if (storedRates) {
      setInterestRates(
        storedRates
          .filter((rate) => Number.isFinite(Number(rate)) && Number(rate) > 0)
          .map(Number),
      );
    }
    if (storedCashLedger) {
      setCashLedger(
        storedCashLedger.flatMap((entry) => {
          const normalizedEntry = normalizeCashLedgerEntry(entry);
          return normalizedEntry ? [normalizedEntry] : [];
        }),
      );
    }
    setForm(emptyForm(getTodayIso()));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(SAVINGS_KEY, JSON.stringify(savings));
  }, [ready, savings]);

  useEffect(() => {
    if (ready) localStorage.setItem(RATES_KEY, JSON.stringify(interestRates));
  }, [interestRates, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(CASH_LEDGER_KEY, JSON.stringify(cashLedger));
  }, [cashLedger, ready]);

  const sortedRates = useMemo(
    () => [...interestRates].sort((a, b) => b - a),
    [interestRates],
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

  const summary = useMemo(() => {
    const principal = savings.reduce((sum, item) => sum + item.amount, 0);
    const interest = savings.reduce(
      (sum, item) => sum + item.interestAfterTax,
      0,
    );
    const accrued = savings.reduce(
      (totals, item) => {
        const itemAccrued = calculateAccruedInterest(item, today);
        totals.interest += itemAccrued.interest;
        totals.tax += itemAccrued.tax;
        totals.interestAfterTax += itemAccrued.interestAfterTax;
        return totals;
      },
      { interest: 0, tax: 0, interestAfterTax: 0 },
    );
    const todayProfit = savings.reduce(
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
  }, [cashBalance, savings, today]);

  const monthlyInterestTarget = parseAmount(goalMonthlyInterest);
  const cashflowMonths = useMemo(
    () => buildCashflowSchedule(savings, cashflowPeriod, today),
    [cashflowPeriod, savings, today],
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
    savings.forEach((item) => {
      const difference = signedDaysBetween(today, item.maturityDate);
      if (difference < 0) overdue.push(item);
      else if (difference <= 7) nextSevenDays.push(item);
      else if (difference <= 30) nextThirtyDays.push(item);
    });
    return { nextSevenDays, nextThirtyDays, overdue };
  }, [savings, today]);
  const ladderRecommendation = useMemo(() => {
    if (savings.length === 0) {
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
  }, [cashflowPeriod, cashflowSummary, savings.length]);

  const currentPortfolio = useMemo(() => {
    return savings.reduce(
      (sum, item) => sum + calculateCycleValueOnDate(item, today),
      0,
    );
  }, [savings, today]);

  const suggestedGoalRate = useMemo(() => {
    if (summary.principal <= 0) return 6;
    return savings.reduce(
      (sum, item) => sum + item.amount * item.interestRate,
      0,
    ) / summary.principal;
  }, [savings, summary.principal]);

  const effectiveGoalRate =
    Number(goalInterestRate) > 0
      ? Number(goalInterestRate)
      : suggestedGoalRate;
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
    const item: SavingsItem = {
      id: editingId ?? Date.now(),
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
    };

    if (mode !== "add" && editingId !== null) {
      setSavings((items) =>
        items.map((current) => (current.id === editingId ? item : current)),
      );
      if (mode === "reinvest" && sourceItem) {
        if (cashRemainder > 0) {
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
          setMessage(
            `Đã tái đầu tư ${formatCurrency(amount)} và chuyển ${formatCurrency(cashRemainder)} vào Ví tiền chưa tái đầu tư.`,
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

  function handleExportBackup() {
    const payload: BackupPayload = {
      app: BACKUP_APP_ID,
      version: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      savings,
      interestRates,
      cashLedger,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `tiet-kiem-backup-${getTodayIso()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    setBackupStatus({
      kind: "success",
      text: `Đã tạo bản sao lưu gồm ${savings.length} khoản gửi và ${cashLedger.length} giao dịch ví. Hãy lưu tệp vào nơi bạn có thể mở trên thiết bị khác.`,
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
        `Khôi phục ${payload.savings.length} khoản gửi và ${payload.cashLedger.length} giao dịch ví từ bản sao lưu? Dữ liệu hiện có trên thiết bị này, bao gồm khoản gửi và ví tiền, sẽ bị thay thế.`,
      );
      if (!shouldRestore) return;

      setSavings(payload.savings);
      setInterestRates(payload.interestRates);
      setCashLedger(payload.cashLedger);
      setCollapsedRates(new Set());
      setExpandedHistoryId(null);
      resetForm();
      setBackupStatus({
        kind: "success",
        text: `Đã khôi phục ${payload.savings.length} khoản gửi. Dữ liệu đã được lưu trên thiết bị này.`,
      });
    } catch {
      setBackupStatus({
        kind: "error",
        text: "Không thể đọc tệp này. Hãy chọn đúng tệp JSON được tạo từ ứng dụng.",
      });
    }
  }

  const submitLabel =
    mode === "edit"
      ? "Lưu thay đổi"
      : mode === "reinvest"
        ? "Thêm khoản tái đầu tư"
        : "Thêm khoản gửi";

  return (
    <main className="page-shell">
      <div className="app-container">
        <header className="hero">
          <div className="hero-copy">
            <span className="eyebrow">SỔ TIẾT KIỆM CÁ NHÂN</span>
            <h1>Tính lãi suất tiết kiệm</h1>
            <p>
              Theo dõi từng khoản gửi, lãi sau khấu trừ và số tiền dự kiến khi
              đáo hạn — tất cả trong một nơi.
            </p>
          </div>
          <div className="privacy-pill" aria-label="Dữ liệu được lưu cục bộ">
            <span aria-hidden="true">◉</span>
            Lưu cục bộ · có sao lưu
          </div>
        </header>

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

              <div className="form-group form-group-wide">
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
                chưa tái đầu tư và danh sách lãi suất. Trên thiết bị khác, mở
                ứng dụng rồi chọn khôi phục từ tệp.
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
              Khôi phục sẽ thay thế toàn bộ khoản gửi và ví tiền trên thiết bị
              hiện tại. Tệp chỉ được xử lý trong trình duyệt và không được tải
              lên máy chủ.
            </p>
          </div>
        </section>

        <section className="list-section" aria-labelledby="list-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">DANH SÁCH</span>
              <h2 id="list-title">Các khoản gửi của bạn</h2>
            </div>
            <span className="deposit-count">
              {savings.length} {savings.length === 1 ? "khoản" : "khoản gửi"}
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
                const groupPrincipal = items.reduce(
                  (sum, item) => sum + item.amount,
                  0,
                );
                const groupInterest = items.reduce(
                  (sum, item) => sum + item.interestAfterTax,
                  0,
                );
                const groupAccruedInterest = items.reduce(
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
                          <p>{items.length} khoản gửi</p>
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
                              </div>
                              <div className="item-amount">
                                <span>Vốn gửi</span>
                                <strong>{formatCurrency(item.amount)}</strong>
                              </div>
                              <div className="item-actions">
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
                                <button
                                  type="button"
                                  className="btn-delete"
                                  onClick={() => handleDelete(item.id)}
                                >
                                  Xóa
                                </button>
                              </div>
                            </div>
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
                            </div>
                            <div
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
                            </div>
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
