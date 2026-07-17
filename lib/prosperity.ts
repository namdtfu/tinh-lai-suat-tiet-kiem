import {
  addDays,
  daysBetween,
  getTodayIso,
  INTEREST_DEDUCTION_RATE,
  parseLocalDate,
  signedDaysBetween,
  toLocalIso,
} from './savings.ts';

export type ProsperityStatus = "growing" | "harvested";

export type ProsperityItem = {
  id: string;
  name: string;
  amount: number;
  annualInterestRate: number;
  fundingAccountId?: string;
  termDays: number;
  termWeeks: number;
  startDate: string;
  harvestDate: string;
  projectedGrossProfit: number;
  projectedProfit: number;
  projectedTax: number;
  projectedTotal: number;
  status: ProsperityStatus;
  harvestedAt?: string;
};

export type ProsperityCalculation = {
  days: number;
  harvestDate: string;
  projectedGrossProfit: number;
  projectedProfit: number;
  projectedTax: number;
  projectedTotal: number;
};

export function calculateProsperity(
  amount: number,
  annualInterestRate: number,
  termWeeks: number,
  startDate: string,
  termDays = 0,
): ProsperityCalculation {
  const days = termWeeks * 7 + termDays;
  const harvestDate = addDays(startDate, days);
  const projectedGrossProfit =
    amount * (annualInterestRate / 100) * (days / 365);
  const projectedTax = projectedGrossProfit * INTEREST_DEDUCTION_RATE;
  const projectedProfit = projectedGrossProfit - projectedTax;

  return {
    days,
    harvestDate,
    projectedGrossProfit,
    projectedProfit,
    projectedTax,
    projectedTotal: amount + projectedProfit,
  };
}

export function calculateProsperityValueOnDate(
  item: ProsperityItem,
  date: string,
) {
  const calculationDate =
    date <= item.startDate
      ? item.startDate
      : date < item.harvestDate
        ? date
        : item.harvestDate;
  const elapsedDays = daysBetween(item.startDate, calculationDate);
  const accruedGrossProfit =
    item.amount * (item.annualInterestRate / 100) * (elapsedDays / 365);
  const accruedTax = accruedGrossProfit * INTEREST_DEDUCTION_RATE;
  const accruedProfit = accruedGrossProfit - accruedTax;

  return {
    accruedGrossProfit,
    accruedProfit,
    accruedTax,
    calculationDate,
    elapsedDays,
    totalValue: item.amount + accruedProfit,
  };
}

export function getProsperityProgress(
  item: ProsperityItem,
  today = getTodayIso(),
) {
  const totalDays = Math.max(1, item.termWeeks * 7 + (item.termDays ?? 0));
  const elapsedDays = Math.min(
    totalDays,
    Math.max(0, signedDaysBetween(item.startDate, today)),
  );
  const remainingDays = Math.max(
    0,
    signedDaysBetween(today, item.harvestDate),
  );

  return {
    elapsedDays,
    isReady: today >= item.harvestDate,
    percentage: Math.min(100, (elapsedDays / totalDays) * 100),
    remainingDays,
    totalDays,
  };
}

export function recalculateProsperityItem(
  item: ProsperityItem,
): ProsperityItem {
  return {
    ...item,
    termDays: item.termDays ?? 0,
    ...calculateProsperity(
      item.amount,
      item.annualInterestRate,
      item.termWeeks,
      item.startDate,
      item.termDays ?? 0,
    ),
    status: item.status === "harvested" ? "harvested" : "growing",
  };
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = parseLocalDate(value);
  return !Number.isNaN(parsed.getTime()) && toLocalIso(parsed) === value;
}

export function normalizeProsperityItem(
  value: unknown,
): ProsperityItem | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const amount = Number(item.amount);
  const annualInterestRate = Number(item.annualInterestRate);
  const fundingAccountId =
    typeof item.fundingAccountId === 'string'
      ? item.fundingAccountId.trim()
      : '';
  const termWeeks = Number(item.termWeeks);
  const termDays = item.termDays === undefined ? 0 : Number(item.termDays);
  const status: ProsperityStatus =
    item.status === 'harvested' ? 'harvested' : 'growing';
  const harvestedAt = isValidIsoDate(item.harvestedAt)
    ? item.harvestedAt
    : undefined;

  if (
    !id ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(annualInterestRate) ||
    annualInterestRate <= 0 ||
    annualInterestRate > 100 ||
    !Number.isInteger(termWeeks) ||
    termWeeks < 0 ||
    termWeeks > 260 ||
    !Number.isInteger(termDays) ||
    termDays < 0 ||
    termDays > 6 ||
    termWeeks * 7 + termDays < 1 ||
    !isValidIsoDate(item.startDate)
  ) {
    return null;
  }

  return recalculateProsperityItem({
    id: id.slice(0, 120),
    name: (name || `Phát lộc ${formatProsperityTerm(termWeeks, termDays)}`).slice(0, 200),
    amount,
    annualInterestRate,
    ...(fundingAccountId
      ? { fundingAccountId: fundingAccountId.slice(0, 100) }
      : {}),
    termDays,
    termWeeks,
    startDate: item.startDate,
    harvestDate: '',
    projectedGrossProfit: 0,
    projectedProfit: 0,
    projectedTax: 0,
    projectedTotal: amount,
    status,
    ...(harvestedAt ? { harvestedAt } : {}),
  });
}

export function formatProsperityTerm(termWeeks: number, termDays = 0) {
  return [
    termWeeks > 0 ? `${termWeeks} tuần` : '',
    termDays > 0 ? `${termDays} ngày` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
