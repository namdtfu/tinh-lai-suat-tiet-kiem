const INTEREST_DEDUCTION_RATE = 0.05;
const AVERAGE_DAYS_PER_MONTH = 365 / 12;
const MAX_GOAL_MONTHS = 1_200;

export type SavingsStatus = "active" | "settled";
export type MaturityInstruction = "decide-later" | "return" | "reinvest-all";

export type SavingsCycle = {
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

export type SavingsItem = SavingsCycle & {
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

export type SavingsForm = {
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

export type InterestGoalPlan = {
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

export type CashflowPeriod = 12 | 24;

export type CashflowMonth = {
  interest: number;
  items: SavingsItem[];
  key: string;
  principal: number;
  total: number;
};

const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function createEmptySavingsForm(startDate = ""): SavingsForm {
  return {
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
  };
}

export function getTodayIso() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

export function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toLocalIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addMonthsClamped(startDate: string, months: number) {
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

export function addDays(dateString: string, days: number) {
  const target = parseLocalDate(dateString);
  target.setDate(target.getDate() + days);
  return toLocalIso(target);
}

export function daysBetween(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function signedDaysBetween(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((end - start) / 86_400_000);
}

export function getMonthKey(dateString: string) {
  return dateString.slice(0, 7);
}

export function getMonthStart(dateString: string) {
  return `${getMonthKey(dateString)}-01`;
}

export function getTermProgress(startDate: string, maturityDate: string) {
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

export function calculateSavings(
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

export function calculateAccruedInterest(
  cycle: SavingsCycle,
  date: string,
) {
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

export function calculateInterestToday(cycle: SavingsCycle, date: string) {
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

export function calculateCycleValueOnDate(
  cycle: SavingsCycle,
  date: string,
) {
  return calculateAccruedInterest(cycle, date).totalAmount;
}

export function calculateMonthlyNetRate(annualInterestRate: number) {
  if (annualInterestRate <= 0 || annualInterestRate > 100) return 0;
  const monthlyGrossRate =
    (1 + annualInterestRate / 100 / 365) ** AVERAGE_DAYS_PER_MONTH - 1;
  return monthlyGrossRate * (1 - INTEREST_DEDUCTION_RATE);
}

export function calculateInterestGoal(
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

export function buildCashflowSchedule(
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

export function recalculateSavingsItem(item: SavingsItem): SavingsItem {
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

export function formatCurrency(amount: number) {
  return currencyFormatter.format(Math.round(amount));
}

export function formatDate(dateString: string) {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat("vi-VN").format(parseLocalDate(dateString));
}

export function formatRate(rate: number) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
  }).format(rate);
}

export function formatGoalDuration(months: number) {
  if (months === 0) return "Ngay bây giờ";
  if (months < 12) return `${months} tháng`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return remainingMonths
    ? `${years} năm ${remainingMonths} tháng`
    : `${years} năm`;
}

export function formatMonthTitle(monthKey: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(`${monthKey}-01`));
}

export function formatMonthShort(monthKey: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    month: "short",
    year: "2-digit",
  }).format(parseLocalDate(`${monthKey}-01`));
}

export function formatCompactMoney(amount: number) {
  if (!amount) return "—";
  return `${new Intl.NumberFormat("vi-VN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount)} ₫`;
}

export function formatMaturityDistance(date: string, today: string) {
  const difference = signedDaysBetween(today, date);
  if (difference < 0) return `Quá hạn ${Math.abs(difference)} ngày`;
  if (difference === 0) return "Đáo hạn hôm nay";
  if (difference === 1) return "Đáo hạn ngày mai";
  return `Còn ${difference} ngày`;
}

export function parseAmount(value: string) {
  return Number(value.replace(/\D/g, "")) || 0;
}

export function formatAmountInput(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(digits));
}

export function toSavingsCycle(
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
