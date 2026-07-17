import {
  addDays,
  daysBetween,
  getTodayIso,
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
  termWeeks: number;
  startDate: string;
  harvestDate: string;
  projectedProfit: number;
  projectedTotal: number;
  status: ProsperityStatus;
  harvestedAt?: string;
};

export type ProsperityCalculation = {
  days: number;
  harvestDate: string;
  projectedProfit: number;
  projectedTotal: number;
};

export function calculateProsperity(
  amount: number,
  annualInterestRate: number,
  termWeeks: number,
  startDate: string,
): ProsperityCalculation {
  const days = termWeeks * 7;
  const harvestDate = addDays(startDate, days);
  const projectedProfit =
    amount * (annualInterestRate / 100) * (days / 365);

  return {
    days,
    harvestDate,
    projectedProfit,
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
  const accruedProfit =
    item.amount * (item.annualInterestRate / 100) * (elapsedDays / 365);

  return {
    accruedProfit,
    calculationDate,
    elapsedDays,
    totalValue: item.amount + accruedProfit,
  };
}

export function getProsperityProgress(
  item: ProsperityItem,
  today = getTodayIso(),
) {
  const totalDays = Math.max(1, item.termWeeks * 7);
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
    ...calculateProsperity(
      item.amount,
      item.annualInterestRate,
      item.termWeeks,
      item.startDate,
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
  const termWeeks = Number(item.termWeeks);
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
    termWeeks < 1 ||
    termWeeks > 260 ||
    !isValidIsoDate(item.startDate)
  ) {
    return null;
  }

  return recalculateProsperityItem({
    id: id.slice(0, 120),
    name: (name || `Phát lộc ${termWeeks} tuần`).slice(0, 200),
    amount,
    annualInterestRate,
    termWeeks,
    startDate: item.startDate,
    harvestDate: '',
    projectedProfit: 0,
    projectedTotal: amount,
    status,
    ...(harvestedAt ? { harvestedAt } : {}),
  });
}
