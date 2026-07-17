const INTEREST_DEDUCTION_RATE = 0.05;

export type SavingsTrendCycle = {
  amount: number;
  interestRate: number;
  startDate: string;
  maturityDate: string;
  termType?: "fixed" | "open-ended";
};

export type SavingsTrendItem = SavingsTrendCycle & {
  history?: SavingsTrendCycle[];
  status?: "active" | "settled";
  settledAt?: string;
};

export type SavingsTrendPoint = {
  activeCount: number;
  date: string;
  interest: number;
  key: string;
  principal: number;
  value: number;
};

function daysBetween(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getCycleSnapshot(cycle: SavingsTrendCycle, date: string) {
  const calculationDate =
    cycle.termType === "open-ended" || date < cycle.maturityDate
      ? date
      : cycle.maturityDate;
  const elapsedDays = daysBetween(cycle.startDate, calculationDate);
  const grossInterest = Math.floor(
    cycle.amount * (cycle.interestRate / 100) * (elapsedDays / 365),
  );
  const interest = grossInterest * (1 - INTEREST_DEDUCTION_RATE);

  return {
    interest,
    principal: cycle.amount,
    value: cycle.amount + interest,
  };
}

export function getSavingsTrendSnapshot(
  savings: SavingsTrendItem[],
  date: string,
) {
  return savings.reduce(
    (total, item) => {
      const exitDate =
        item.settledAt ||
        (item.termType === "open-ended" ? undefined : item.maturityDate);
      if (
        item.status === "settled" &&
        exitDate &&
        date >= exitDate
      ) {
        return total;
      }

      const cycles = [...(item.history ?? []), item]
        .filter((cycle) => cycle.startDate <= date)
        .sort((left, right) => left.startDate.localeCompare(right.startDate));
      const cycle = cycles.at(-1);
      if (!cycle) return total;

      const snapshot = getCycleSnapshot(cycle, date);
      total.activeCount += 1;
      total.interest += snapshot.interest;
      total.principal += snapshot.principal;
      total.value += snapshot.value;
      return total;
    },
    { activeCount: 0, interest: 0, principal: 0, value: 0 },
  );
}

export function buildSavingsTrend(
  savings: SavingsTrendItem[],
  today: string,
  monthCount = 12,
): SavingsTrendPoint[] {
  if (!Number.isInteger(monthCount) || monthCount <= 0) return [];

  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: monthCount }, (_, index) => {
    const monthOffset = index - (monthCount - 1);
    const targetMonth = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
    const isCurrentMonth = index === monthCount - 1;
    const snapshotDate = isCurrentMonth
      ? today
      : toIsoDate(
          new Date(
            Date.UTC(
              targetMonth.getUTCFullYear(),
              targetMonth.getUTCMonth() + 1,
              0,
            ),
          ),
        );
    const snapshot = getSavingsTrendSnapshot(savings, snapshotDate);

    return {
      ...snapshot,
      date: snapshotDate,
      key: snapshotDate.slice(0, 7),
    };
  });
}
