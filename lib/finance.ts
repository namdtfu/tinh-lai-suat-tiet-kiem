export type FinanceAccountType = "cash" | "bank" | "ewallet";
export type FinanceCategoryKind = "income" | "expense";
export type FinanceTransactionType = "income" | "expense" | "transfer";
export type FinanceCurrency = "KRW" | "VND";

export type FinanceAccount = {
  id: string;
  name: string;
  type: FinanceAccountType;
  currency: FinanceCurrency;
  openingBalance: number;
  color: string;
  icon: string;
};

export type FinanceCategory = {
  id: string;
  name: string;
  kind: FinanceCategoryKind;
  color: string;
  icon: string;
  parentId?: string;
  archived?: boolean;
};

export type FinanceTransaction = {
  id: string;
  type: FinanceTransactionType;
  amount: number;
  date: string;
  accountId: string;
  categoryId?: string;
  toAccountId?: string;
  toAmount?: number;
  note: string;
  createdAt: string;
  updatedAt?: string;
};

export type FinanceBudget = {
  id: string;
  categoryId: string;
  currency: FinanceCurrency;
  monthlyLimit: number;
};

export type FinanceState = {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  budgets: FinanceBudget[];
};

export type FinanceMonthSummary = {
  currency: FinanceCurrency;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
};

export type FinanceCategoryBreakdownItem = {
  amount: number;
  category: FinanceCategory;
  percentage: number;
  transactionCount: number;
};

export type FinanceDailyTrendItem = {
  cumulativeExpense: number;
  cumulativeIncome: number;
  day: number;
  expense: number;
  income: number;
};

export const FINANCE_CURRENCIES: Array<{
  code: FinanceCurrency;
  label: string;
  shortLabel: string;
  locale: string;
  symbol: string;
  inputStep: number;
}> = [
  {
    code: "KRW",
    label: "Won Hàn Quốc",
    shortLabel: "Won",
    locale: "ko-KR",
    symbol: "₩",
    inputStep: 1000,
  },
  {
    code: "VND",
    label: "Đồng Việt Nam",
    shortLabel: "Việt Nam đồng",
    locale: "vi-VN",
    symbol: "₫",
    inputStep: 1000,
  },
];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_TYPES = new Set<FinanceAccountType>(["cash", "bank", "ewallet"]);
const CURRENCIES = new Set<FinanceCurrency>(["KRW", "VND"]);
const TRANSACTION_TYPES = new Set<FinanceTransactionType>([
  "income",
  "expense",
  "transfer",
]);
const AMOUNT_INPUT_FORMATTER = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

export function parseFinanceAmountInput(value: string) {
  return Number(value.replace(/\D/g, "")) || 0;
}

export function formatFinanceAmountInput(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return AMOUNT_INPUT_FORMATTER.format(Number(digits));
}

export const DEFAULT_FINANCE_CATEGORIES: FinanceCategory[] = [
  { id: "expense-food", name: "Ăn uống", kind: "expense", color: "#f28f61", icon: "🍜" },
  { id: "expense-food-groceries", parentId: "expense-food", name: "Đi chợ", kind: "expense", color: "#f28f61", icon: "🛒" },
  { id: "expense-food-restaurant", parentId: "expense-food", name: "Nhà hàng", kind: "expense", color: "#f28f61", icon: "🍽️" },
  { id: "expense-food-cafe", parentId: "expense-food", name: "Cafe", kind: "expense", color: "#f28f61", icon: "☕" },
  { id: "expense-transport", name: "Di chuyển", kind: "expense", color: "#6aa7d9", icon: "🚌" },
  { id: "expense-transport-public", parentId: "expense-transport", name: "Phương tiện công cộng", kind: "expense", color: "#6aa7d9", icon: "🚇" },
  { id: "expense-transport-taxi", parentId: "expense-transport", name: "Taxi", kind: "expense", color: "#6aa7d9", icon: "🚕" },
  { id: "expense-home", name: "Nhà cửa & tiện ích", kind: "expense", color: "#8d78d6", icon: "🏠" },
  { id: "expense-health", name: "Sức khỏe", kind: "expense", color: "#ef6c78", icon: "🩺" },
  { id: "expense-shopping", name: "Mua sắm", kind: "expense", color: "#e7b74d", icon: "🛍️" },
  { id: "expense-entertainment", name: "Giải trí", kind: "expense", color: "#bd73c6", icon: "🎬" },
  { id: "expense-saving", name: "Tiết kiệm & đầu tư", kind: "expense", color: "#27a77b", icon: "🌱" },
  { id: "expense-other", name: "Chi khác", kind: "expense", color: "#8b94a6", icon: "•••" },
  { id: "income-salary", name: "Lương", kind: "income", color: "#27a77b", icon: "💵" },
  { id: "income-interest", name: "Tiền lãi", kind: "income", color: "#6f4bd8", icon: "%" },
  { id: "income-bonus", name: "Thưởng", kind: "income", color: "#e4a62f", icon: "🏅" },
  { id: "income-gift", name: "Được tặng", kind: "income", color: "#47a7a0", icon: "🎁" },
  { id: "income-sale", name: "Bán đồ", kind: "income", color: "#5aa7d8", icon: "🏷️" },
  { id: "income-other", name: "Thu nhập khác", kind: "income", color: "#7586a8", icon: "+" },
];

export function createDefaultFinanceState(): FinanceState {
  return {
    accounts: [
      {
        id: "account-krw-cash",
        name: "Tiền mặt Hàn Quốc",
        type: "cash",
        currency: "KRW",
        openingBalance: 0,
        color: "#27a77b",
        icon: "₩",
      },
    ],
    categories: DEFAULT_FINANCE_CATEGORIES.map((category) => ({ ...category })),
    transactions: [],
    budgets: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, fallback = "", maxLength = 120) {
  return typeof value === "string"
    ? (value.trim() || fallback).slice(0, maxLength)
    : fallback;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeCurrency(value: unknown, fallback: FinanceCurrency) {
  return CURRENCIES.has(value as FinanceCurrency)
    ? (value as FinanceCurrency)
    : fallback;
}

function normalizeAccount(value: unknown): FinanceAccount | null {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, "", 100);
  const name = cleanText(value.name, "", 100);
  const type = value.type;
  const openingBalance = Number(value.openingBalance);
  if (
    !id ||
    !name ||
    !ACCOUNT_TYPES.has(type as FinanceAccountType) ||
    !Number.isFinite(openingBalance)
  ) {
    return null;
  }
  return {
    id,
    name,
    type: type as FinanceAccountType,
    // Dữ liệu trước phiên bản đa tiền tệ luôn được hiểu là VND.
    currency: normalizeCurrency(value.currency, "VND"),
    openingBalance,
    color: cleanText(value.color, "#6f4bd8", 20),
    icon: cleanText(value.icon, "💳", 12),
  };
}

function normalizeCategory(value: unknown): FinanceCategory | null {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, "", 100);
  const name = cleanText(value.name, "", 100);
  const kind = value.kind;
  if (!id || !name || (kind !== "income" && kind !== "expense")) return null;
  const parentId = cleanText(value.parentId, "", 100);
  return {
    id,
    name,
    kind,
    color: cleanText(value.color, "#8b94a6", 20),
    icon: cleanText(value.icon, "•", 12),
    ...(parentId ? { parentId } : {}),
    ...(value.archived === true ? { archived: true } : {}),
  };
}

function normalizeTransaction(
  value: unknown,
  accountMap: Map<string, FinanceAccount>,
  categoryIds: Set<string>,
): FinanceTransaction | null {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, "", 120);
  const type = value.type;
  const amount = Number(value.amount);
  const accountId = cleanText(value.accountId, "", 100);
  const categoryId = cleanText(value.categoryId, "", 100);
  const toAccountId = cleanText(value.toAccountId, "", 100);
  if (
    !id ||
    !TRANSACTION_TYPES.has(type as FinanceTransactionType) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !isValidDate(value.date) ||
    !accountMap.has(accountId)
  ) {
    return null;
  }

  let toAmount: number | undefined;
  if (type === "transfer") {
    if (!toAccountId || toAccountId === accountId || !accountMap.has(toAccountId)) {
      return null;
    }
    const parsedToAmount = Number(value.toAmount);
    toAmount =
      Number.isFinite(parsedToAmount) && parsedToAmount > 0
        ? parsedToAmount
        : amount;
  } else if (!categoryId || !categoryIds.has(categoryId)) {
    return null;
  }

  return {
    id,
    type: type as FinanceTransactionType,
    amount,
    date: value.date,
    accountId,
    ...(categoryId ? { categoryId } : {}),
    ...(toAccountId ? { toAccountId } : {}),
    ...(toAmount ? { toAmount } : {}),
    note: cleanText(value.note, "", 240),
    createdAt:
      typeof value.createdAt === "string"
        ? value.createdAt.slice(0, 40)
        : new Date(0).toISOString(),
    ...(typeof value.updatedAt === "string"
      ? { updatedAt: value.updatedAt.slice(0, 40) }
      : {}),
  };
}

function normalizeBudget(
  value: unknown,
  expenseCategoryIds: Set<string>,
): FinanceBudget | null {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, "", 120);
  const categoryId = cleanText(value.categoryId, "", 100);
  const monthlyLimit = Number(value.monthlyLimit);
  if (
    !id ||
    !expenseCategoryIds.has(categoryId) ||
    !Number.isFinite(monthlyLimit) ||
    monthlyLimit <= 0
  ) {
    return null;
  }
  return {
    id,
    categoryId,
    currency: normalizeCurrency(value.currency, "VND"),
    monthlyLimit,
  };
}

function repairCategoryTree(categories: FinanceCategory[]) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  return categories.map((category) => {
    if (!category.parentId) return category;
    const parent = categoryMap.get(category.parentId);
    if (
      !parent ||
      parent.id === category.id ||
      parent.kind !== category.kind ||
      parent.parentId
    ) {
      const rootCategory = { ...category };
      delete rootCategory.parentId;
      return rootCategory;
    }
    return category;
  });
}

export function normalizeFinanceState(value: unknown): FinanceState {
  if (!isRecord(value)) return createDefaultFinanceState();

  const rawAccounts = Array.isArray(value.accounts) ? value.accounts : [];
  const rawCategories = Array.isArray(value.categories) ? value.categories : [];
  const accounts = rawAccounts.map(normalizeAccount).filter(Boolean) as FinanceAccount[];
  const customCategories = rawCategories
    .map(normalizeCategory)
    .filter(Boolean) as FinanceCategory[];

  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const categoryMap = new Map(
    DEFAULT_FINANCE_CATEGORIES.map((category) => [category.id, { ...category }]),
  );
  customCategories.forEach((category) => categoryMap.set(category.id, category));

  let normalizedAccounts =
    accountMap.size > 0
      ? [...accountMap.values()]
      : createDefaultFinanceState().accounts;
  const rawTransactions = Array.isArray(value.transactions)
    ? value.transactions
    : [];
  const rawBudgets = Array.isArray(value.budgets) ? value.budgets : [];
  const legacyAccount = rawAccounts[0];
  const isEmptyLegacyDefault =
    rawAccounts.length === 1 &&
    isRecord(legacyAccount) &&
    legacyAccount.id === "account-cash" &&
    !CURRENCIES.has(legacyAccount.currency as FinanceCurrency) &&
    Number(legacyAccount.openingBalance) === 0 &&
    rawTransactions.length === 0 &&
    rawBudgets.length === 0;
  if (isEmptyLegacyDefault) {
    normalizedAccounts = normalizedAccounts.map((account) =>
      account.id === "account-cash"
        ? {
            ...account,
            name: "Tiền mặt Hàn Quốc",
            currency: "KRW",
            icon: "₩",
          }
        : account,
    );
  }
  if (!normalizedAccounts.some((account) => account.currency === "KRW")) {
    const defaultKrwAccount = createDefaultFinanceState().accounts[0];
    normalizedAccounts = [
      ...normalizedAccounts,
      {
        ...defaultKrwAccount,
        id: normalizedAccounts.some(
          (account) => account.id === defaultKrwAccount.id,
        )
          ? "account-krw-cash-default"
          : defaultKrwAccount.id,
      },
    ];
  }
  const categories = repairCategoryTree([...categoryMap.values()]);
  const normalizedAccountMap = new Map(
    normalizedAccounts.map((account) => [account.id, account]),
  );
  const categoryIds = new Set(categories.map((category) => category.id));
  const expenseCategoryIds = new Set(
    categories
      .filter((category) => category.kind === "expense")
      .map((category) => category.id),
  );

  const transactions = rawTransactions
    .map((transaction) =>
      normalizeTransaction(transaction, normalizedAccountMap, categoryIds),
    )
    .filter(Boolean) as FinanceTransaction[];
  const budgets = rawBudgets
    .map((budget) => normalizeBudget(budget, expenseCategoryIds))
    .filter(Boolean) as FinanceBudget[];

  return {
    accounts: normalizedAccounts,
    categories,
    transactions,
    budgets: [
      ...new Map(
        budgets.map((budget) => [
          `${budget.categoryId}:${budget.currency}`,
          budget,
        ]),
      ).values(),
    ],
  };
}

export function monthKeyFromIso(date: string) {
  return date.slice(0, 7);
}

export function shiftMonthKey(monthKey: string, offset: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function calculateAccountBalance(
  account: FinanceAccount,
  transactions: FinanceTransaction[],
) {
  return transactions.reduce((balance, transaction) => {
    if (transaction.type === "income" && transaction.accountId === account.id) {
      return balance + transaction.amount;
    }
    if (transaction.type === "expense" && transaction.accountId === account.id) {
      return balance - transaction.amount;
    }
    if (transaction.type === "transfer") {
      if (transaction.accountId === account.id) return balance - transaction.amount;
      if (transaction.toAccountId === account.id) {
        return balance + (transaction.toAmount ?? transaction.amount);
      }
    }
    return balance;
  }, account.openingBalance);
}

export function saveFinanceTransaction(
  transactions: FinanceTransaction[],
  transaction: FinanceTransaction,
) {
  const existingIndex = transactions.findIndex(
    (item) => item.id === transaction.id,
  );
  if (existingIndex === -1) return [transaction, ...transactions];
  return transactions.map((item, index) =>
    index === existingIndex ? transaction : item,
  );
}

export function calculateTotalBalance(
  state: FinanceState,
  currency: FinanceCurrency,
) {
  return state.accounts
    .filter((account) => account.currency === currency)
    .reduce(
      (total, account) =>
        total + calculateAccountBalance(account, state.transactions),
      0,
    );
}

export function calculateTotalsByCurrency(state: FinanceState) {
  return FINANCE_CURRENCIES.reduce<Record<FinanceCurrency, number>>(
    (totals, { code }) => {
      totals[code] = calculateTotalBalance(state, code);
      return totals;
    },
    { KRW: 0, VND: 0 },
  );
}

export function summarizeFinanceMonth(
  state: FinanceState,
  monthKey: string,
  currency: FinanceCurrency,
): FinanceMonthSummary {
  const accountMap = new Map(state.accounts.map((account) => [account.id, account]));
  return state.transactions.reduce<FinanceMonthSummary>(
    (summary, transaction) => {
      if (monthKeyFromIso(transaction.date) !== monthKey) return summary;
      const sourceCurrency = accountMap.get(transaction.accountId)?.currency;
      const destinationCurrency = transaction.toAccountId
        ? accountMap.get(transaction.toAccountId)?.currency
        : undefined;
      if (transaction.type === "income" && sourceCurrency === currency) {
        summary.income += transaction.amount;
      }
      if (transaction.type === "expense" && sourceCurrency === currency) {
        summary.expense += transaction.amount;
      }
      if (sourceCurrency === currency || destinationCurrency === currency) {
        summary.transactionCount += 1;
      }
      summary.net = summary.income - summary.expense;
      return summary;
    },
    { currency, income: 0, expense: 0, net: 0, transactionCount: 0 },
  );
}

export function findRootCategory(
  categories: FinanceCategory[],
  categoryId: string,
) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const category = categoryMap.get(categoryId);
  return category?.parentId ? categoryMap.get(category.parentId) ?? category : category;
}

export function getCategoryPath(
  categories: FinanceCategory[],
  categoryId: string,
) {
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return "";
  const parent = category.parentId
    ? categories.find((item) => item.id === category.parentId)
    : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

export function getExpenseByCategory(
  state: FinanceState,
  monthKey: string,
  currency: FinanceCurrency,
) {
  const totals = new Map<string, number>();
  const accountMap = new Map(state.accounts.map((account) => [account.id, account]));
  state.transactions.forEach((transaction) => {
    if (
      transaction.type !== "expense" ||
      !transaction.categoryId ||
      monthKeyFromIso(transaction.date) !== monthKey ||
      accountMap.get(transaction.accountId)?.currency !== currency
    ) {
      return;
    }
    const root = findRootCategory(state.categories, transaction.categoryId);
    if (!root) return;
    totals.set(root.id, (totals.get(root.id) ?? 0) + transaction.amount);
  });
  return totals;
}

export function getFinanceCategoryBreakdown(
  state: FinanceState,
  monthKey: string,
  currency: FinanceCurrency,
  kind: FinanceCategoryKind,
) {
  const accountMap = new Map(state.accounts.map((account) => [account.id, account]));
  const totals = new Map<string, { amount: number; transactionCount: number }>();

  state.transactions.forEach((transaction) => {
    if (
      transaction.type !== kind ||
      !transaction.categoryId ||
      monthKeyFromIso(transaction.date) !== monthKey ||
      accountMap.get(transaction.accountId)?.currency !== currency
    ) {
      return;
    }
    const root = findRootCategory(state.categories, transaction.categoryId);
    if (!root) return;
    const current = totals.get(root.id) ?? { amount: 0, transactionCount: 0 };
    current.amount += transaction.amount;
    current.transactionCount += 1;
    totals.set(root.id, current);
  });

  const total = [...totals.values()].reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  return [...totals.entries()]
    .flatMap(([categoryId, item]) => {
      const category = state.categories.find(
        (candidate) => candidate.id === categoryId,
      );
      return category
        ? [{
            ...item,
            category,
            percentage: total ? (item.amount / total) * 100 : 0,
          }]
        : [];
    })
    .sort((left, right) => right.amount - left.amount);
}

export function getFinanceMonthDailyTrend(
  state: FinanceState,
  monthKey: string,
  currency: FinanceCurrency,
) {
  const [year, month] = monthKey.split("-").map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return [];
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const trend: FinanceDailyTrendItem[] = Array.from(
    { length: daysInMonth },
    (_, index) => ({
      cumulativeExpense: 0,
      cumulativeIncome: 0,
      day: index + 1,
      expense: 0,
      income: 0,
    }),
  );
  const accountMap = new Map(state.accounts.map((account) => [account.id, account]));

  state.transactions.forEach((transaction) => {
    if (
      monthKeyFromIso(transaction.date) !== monthKey ||
      accountMap.get(transaction.accountId)?.currency !== currency ||
      (transaction.type !== "income" && transaction.type !== "expense")
    ) {
      return;
    }
    const dayIndex = Number(transaction.date.slice(8, 10)) - 1;
    const item = trend[dayIndex];
    if (!item) return;
    item[transaction.type] += transaction.amount;
  });

  let cumulativeIncome = 0;
  let cumulativeExpense = 0;
  return trend.map((item) => {
    cumulativeIncome += item.income;
    cumulativeExpense += item.expense;
    return {
      ...item,
      cumulativeExpense,
      cumulativeIncome,
    };
  });
}

export function getCategorySpent(
  state: FinanceState,
  categoryId: string,
  monthKey: string,
  currency: FinanceCurrency,
) {
  const categoryIds = new Set([
    categoryId,
    ...state.categories
      .filter((category) => category.parentId === categoryId)
      .map((category) => category.id),
  ]);
  const accountMap = new Map(state.accounts.map((account) => [account.id, account]));
  return state.transactions.reduce((total, transaction) => {
    if (
      transaction.type !== "expense" ||
      !transaction.categoryId ||
      !categoryIds.has(transaction.categoryId) ||
      monthKeyFromIso(transaction.date) !== monthKey ||
      accountMap.get(transaction.accountId)?.currency !== currency
    ) {
      return total;
    }
    return total + transaction.amount;
  }, 0);
}

export function saveFinanceBudget(
  budgets: FinanceBudget[],
  nextBudget: FinanceBudget,
) {
  const currentIndex = budgets.findIndex(
    (budget) => budget.id === nextBudget.id,
  );
  const withoutCurrentOrDuplicate = budgets.filter(
    (budget) =>
      budget.id !== nextBudget.id &&
      (budget.categoryId !== nextBudget.categoryId ||
        budget.currency !== nextBudget.currency),
  );
  const insertionIndex =
    currentIndex < 0
      ? withoutCurrentOrDuplicate.length
      : Math.min(currentIndex, withoutCurrentOrDuplicate.length);
  const nextBudgets = [...withoutCurrentOrDuplicate];
  nextBudgets.splice(insertionIndex, 0, nextBudget);
  return nextBudgets;
}

export function deleteFinanceBudget(
  budgets: FinanceBudget[],
  budgetId: string,
) {
  return budgets.filter((budget) => budget.id !== budgetId);
}

export function saveFinanceAccount(
  accounts: FinanceAccount[],
  nextAccount: FinanceAccount,
) {
  const currentIndex = accounts.findIndex(
    (account) => account.id === nextAccount.id,
  );
  if (currentIndex < 0) return [...accounts, nextAccount];
  return accounts.map((account, index) =>
    index === currentIndex ? nextAccount : account,
  );
}

export function deleteFinanceAccount(
  state: FinanceState,
  accountId: string,
) {
  if (
    state.accounts.length <= 1 ||
    !state.accounts.some((account) => account.id === accountId)
  ) {
    return state;
  }
  return {
    ...state,
    accounts: state.accounts.filter((account) => account.id !== accountId),
    transactions: state.transactions.filter(
      (transaction) =>
        transaction.accountId !== accountId &&
        transaction.toAccountId !== accountId,
    ),
  };
}

export function hasMeaningfulFinanceData(state: FinanceState) {
  return Boolean(
    state.transactions.length ||
      state.budgets.length ||
      state.accounts.length > 1 ||
      state.accounts.some(
        (account) =>
          !["account-cash", "account-krw-cash"].includes(account.id) ||
          account.openingBalance !== 0,
      ),
  );
}
