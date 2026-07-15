"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  calculateAccountBalance,
  calculateTotalsByCurrency,
  deleteFinanceAccount,
  deleteFinanceBudget,
  FINANCE_CURRENCIES,
  FinanceAccountType,
  FinanceCategoryBreakdownItem,
  FinanceCategory,
  FinanceCategoryKind,
  FinanceCurrency,
  FinanceDailyTrendItem,
  FinanceState,
  FinanceTransactionType,
  formatFinanceAmountInput,
  getCategoryPath,
  getCategorySpent,
  getFinanceCategoryBreakdown,
  getFinanceMonthDailyTrend,
  monthKeyFromIso,
  parseFinanceAmountInput,
  saveFinanceAccount,
  saveFinanceBudget,
  saveFinanceTransaction,
  shiftMonthKey,
  summarizeFinanceMonth,
} from "@/lib/finance";
import styles from "./finance-manager.module.css";

type FinanceTab = "overview" | "transactions" | "budgets" | "accounts";
type TransactionFilter = "all" | FinanceTransactionType;

type FinanceManagerProps = {
  state: FinanceState;
  onChange: (state: FinanceState) => void;
};

const moneyFormatters: Record<FinanceCurrency, Intl.NumberFormat> = {
  KRW: new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }),
  VND: new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }),
};

const shortDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const accountTypeLabels: Record<FinanceAccountType, string> = {
  cash: "Tiền mặt",
  bank: "Ngân hàng",
  ewallet: "Ví điện tử",
};

function todayIso() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatMoney(amount: number, currency: FinanceCurrency) {
  return moneyFormatters[currency].format(Math.round(amount));
}

function formatMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function formatShortDate(date: string) {
  return shortDateFormatter.format(new Date(`${date}T00:00:00`));
}

function getDonutGradient(items: FinanceCategoryBreakdownItem[]) {
  if (!items.length) return "#ece8f1";
  const visibleItems = items.slice(0, 4);
  let offset = 0;
  const stops = visibleItems.map((item) => {
    const start = offset;
    offset = Math.min(100, offset + item.percentage);
    return `${item.category.color} ${start}% ${offset}%`;
  });
  if (offset < 100) stops.push(`#d9d3e1 ${offset}% 100%`);
  return `conic-gradient(${stops.join(", ")})`;
}

function CategoryBreakdownChart({
  currency,
  emptyLabel,
  items,
  title,
  total,
}: {
  currency: FinanceCurrency;
  emptyLabel: string;
  items: FinanceCategoryBreakdownItem[];
  title: string;
  total: number;
}) {
  return (
    <section className={styles.breakdownCard}>
      <div className={styles.breakdownHeading}>
        <span>{title}</span>
        <strong>{formatMoney(total, currency)}</strong>
      </div>
      {items.length ? (
        <>
          <div className={styles.donutRow}>
            <div
              className={styles.donut}
              style={{ background: getDonutGradient(items) }}
              role="img"
              aria-label={`Phân bổ ${title.toLowerCase()} theo nhóm`}
            >
              <span><b>{items.length}</b> nhóm</span>
            </div>
            <div className={styles.donutLegend}>
              {items.slice(0, 4).map((item) => (
                <div key={item.category.id}>
                  <i style={{ background: item.category.color }} />
                  <span>{item.category.icon} {item.category.name}</span>
                  <b>{Math.round(item.percentage)}%</b>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.breakdownList}>
            {items.map((item) => (
              <div key={item.category.id}>
                <span
                  className={styles.roundIcon}
                  style={{
                    background: `${item.category.color}20`,
                    color: item.category.color,
                  }}
                >
                  {item.category.icon}
                </span>
                <span>
                  <strong>{item.category.name}</strong>
                  <small>{item.transactionCount} giao dịch</small>
                </span>
                <b>{formatMoney(item.amount, currency)}</b>
                <em>{Math.round(item.percentage)}%</em>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.breakdownEmpty}>{emptyLabel}</div>
      )}
    </section>
  );
}

function FinanceTrendChart({
  compact = false,
  currency,
  items,
}: {
  compact?: boolean;
  currency: FinanceCurrency;
  items: FinanceDailyTrendItem[];
}) {
  const maximum = Math.max(
    1,
    ...items.flatMap((item) => [
      item.cumulativeIncome,
      item.cumulativeExpense,
    ]),
  );
  return (
    <div
      className={`${styles.trendChart} ${compact ? styles.compactTrend : ""}`}
      role="img"
      aria-label="Xu hướng thu chi lũy kế theo ngày"
    >
      <div
        className={styles.trendColumns}
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(3px, 1fr))`,
        }}
      >
        {items.map((item) => (
          <span
            key={item.day}
            className={styles.trendColumn}
            title={`Ngày ${item.day}: thu ${formatMoney(item.cumulativeIncome, currency)}, chi ${formatMoney(item.cumulativeExpense, currency)}`}
          >
            <i
              className={styles.incomeTrend}
              style={{ height: `${Math.max(2, (item.cumulativeIncome / maximum) * 100)}%` }}
            />
            <i
              className={styles.expenseTrend}
              style={{ height: `${Math.max(2, (item.cumulativeExpense / maximum) * 100)}%` }}
            />
          </span>
        ))}
      </div>
      <div className={styles.trendAxis}>
        <span>01</span>
        <span>{String(Math.ceil(items.length / 2)).padStart(2, "0")}</span>
        <span>{String(items.length).padStart(2, "0")}</span>
      </div>
    </div>
  );
}

export default function FinanceManager({ state, onChange }: FinanceManagerProps) {
  const [activeTab, setActiveTab] = useState<FinanceTab>("overview");
  const [selectedMonth, setSelectedMonth] = useState(monthKeyFromIso(todayIso()));
  const [reportingCurrency, setReportingCurrency] = useState<FinanceCurrency>(
    state.accounts.some((account) => account.currency === "KRW") ? "KRW" : "VND",
  );
  const [transactionFilter, setTransactionFilter] =
    useState<TransactionFilter>("all");
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState("");
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState("");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [transactionType, setTransactionType] =
    useState<FinanceTransactionType>("expense");
  const [transactionCurrency, setTransactionCurrency] =
    useState<FinanceCurrency>("KRW");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionToAmount, setTransactionToAmount] = useState("");
  const [transactionAccount, setTransactionAccount] = useState(
    state.accounts[0]?.id ?? "",
  );
  const [transactionToAccount, setTransactionToAccount] = useState("");
  const [transactionCategory, setTransactionCategory] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [transactionNote, setTransactionNote] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<FinanceAccountType>("bank");
  const [accountCurrency, setAccountCurrency] =
    useState<FinanceCurrency>("KRW");
  const [accountOpeningBalance, setAccountOpeningBalance] = useState("");
  const [budgetCategory, setBudgetCategory] = useState("");
  const [budgetCurrency, setBudgetCurrency] =
    useState<FinanceCurrency>(reportingCurrency);
  const [budgetLimit, setBudgetLimit] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryKind, setCategoryKind] =
    useState<FinanceCategoryKind>("expense");
  const [categoryParent, setCategoryParent] = useState("");
  const [categoryIcon, setCategoryIcon] = useState("•");
  const [categoryColor, setCategoryColor] = useState("#6f4bd8");
  const [showArchivedCategories, setShowArchivedCategories] = useState(false);
  const [monthlyReportOpen, setMonthlyReportOpen] = useState(false);

  const summary = useMemo(
    () => summarizeFinanceMonth(state, selectedMonth, reportingCurrency),
    [reportingCurrency, selectedMonth, state],
  );
  const totalsByCurrency = useMemo(
    () => calculateTotalsByCurrency(state),
    [state],
  );
  const accountBalances = useMemo(
    () =>
      state.accounts.map((account) => ({
        account,
        balance: calculateAccountBalance(account, state.transactions),
      })),
    [state.accounts, state.transactions],
  );
  const incomeBreakdown = useMemo(
    () =>
      getFinanceCategoryBreakdown(
        state,
        selectedMonth,
        reportingCurrency,
        "income",
      ),
    [reportingCurrency, selectedMonth, state],
  );
  const expenseBreakdown = useMemo(
    () =>
      getFinanceCategoryBreakdown(
        state,
        selectedMonth,
        reportingCurrency,
        "expense",
      ),
    [reportingCurrency, selectedMonth, state],
  );
  const dailyTrend = useMemo(
    () => getFinanceMonthDailyTrend(state, selectedMonth, reportingCurrency),
    [reportingCurrency, selectedMonth, state],
  );
  const previousSummary = useMemo(
    () =>
      summarizeFinanceMonth(
        state,
        shiftMonthKey(selectedMonth, -1),
        reportingCurrency,
      ),
    [reportingCurrency, selectedMonth, state],
  );
  const threeMonthAverage = useMemo(() => {
    const summaries = [-1, -2, -3].map((offset) =>
      summarizeFinanceMonth(
        state,
        shiftMonthKey(selectedMonth, offset),
        reportingCurrency,
      ),
    );
    return {
      income:
        summaries.reduce((total, item) => total + item.income, 0) /
        summaries.length,
      expense:
        summaries.reduce((total, item) => total + item.expense, 0) /
        summaries.length,
    };
  }, [reportingCurrency, selectedMonth, state]);
  const monthTransactions = useMemo(
    () =>
      state.transactions
        .filter(
          (transaction) =>
            monthKeyFromIso(transaction.date) === selectedMonth &&
            (transactionFilter === "all" || transaction.type === transactionFilter),
        )
        .sort(
          (left, right) =>
            right.date.localeCompare(left.date) ||
            right.createdAt.localeCompare(left.createdAt),
        ),
    [selectedMonth, state.transactions, transactionFilter],
  );
  const sourceAccount = state.accounts.find(
    (account) => account.id === transactionAccount,
  );
  const destinationAccount = state.accounts.find(
    (account) => account.id === transactionToAccount,
  );
  const isCurrencyConversion =
    transactionType === "transfer" &&
    sourceAccount &&
    destinationAccount &&
    sourceAccount.currency !== destinationAccount.currency;
  const parsedSourceAmount = parseFinanceAmountInput(transactionAmount);
  const parsedDestinationAmount = parseFinanceAmountInput(transactionToAmount);
  const effectiveExchangeRate =
    isCurrencyConversion && parsedSourceAmount > 0 && parsedDestinationAmount > 0
      ? parsedDestinationAmount / parsedSourceAmount
      : 0;

  function openTransaction(type: FinanceTransactionType = "expense") {
    const preferredAccount =
      state.accounts.find((account) => account.currency === "KRW") ??
      state.accounts[0];
    const firstAccount = preferredAccount?.id ?? "";
    const firstOtherAccount = state.accounts.find(
      (account) => account.id !== firstAccount,
    )?.id;
    setTransactionType(type);
    setEditingTransactionId("");
    setTransactionCurrency(preferredAccount?.currency ?? "KRW");
    setTransactionAmount("");
    setTransactionToAmount("");
    setTransactionAccount(firstAccount);
    setTransactionToAccount(firstOtherAccount ?? "");
    setTransactionCategory(
      state.categories.find(
        (category) =>
          !category.archived &&
          (type === "income"
            ? category.kind === "income"
            : category.kind === "expense"),
      )?.id ?? "",
    );
    setTransactionDate(todayIso());
    setTransactionNote("");
    setTransactionOpen(true);
  }

  function editTransaction(
    transaction: FinanceState["transactions"][number],
  ) {
    const account = state.accounts.find(
      (item) => item.id === transaction.accountId,
    );
    if (!account) return;
    setEditingTransactionId(transaction.id);
    setTransactionType(transaction.type);
    setTransactionCurrency(account.currency);
    setTransactionAmount(formatFinanceAmountInput(transaction.amount));
    setTransactionToAmount(
      transaction.type === "transfer"
        ? formatFinanceAmountInput(
            transaction.toAmount ?? transaction.amount,
          )
        : "",
    );
    setTransactionAccount(transaction.accountId);
    setTransactionToAccount(transaction.toAccountId ?? "");
    setTransactionCategory(transaction.categoryId ?? "");
    setTransactionDate(transaction.date);
    setTransactionNote(transaction.note);
    setTransactionOpen(true);
  }

  function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseFinanceAmountInput(transactionAmount);
    if (!amount || !transactionAccount) return;
    if (
      transactionType === "transfer" &&
      (!transactionToAccount || transactionToAccount === transactionAccount)
    )
      return;
    if (transactionType !== "transfer" && !transactionCategory) return;
    const destinationAmount =
      transactionType === "transfer"
        ? isCurrencyConversion
          ? parseFinanceAmountInput(transactionToAmount)
          : amount
        : undefined;
    if (transactionType === "transfer" && !destinationAmount) return;

    const existingTransaction = state.transactions.find(
      (transaction) => transaction.id === editingTransactionId,
    );
    const now = new Date().toISOString();
    const nextTransaction: FinanceState["transactions"][number] = {
      id: existingTransaction?.id ?? createId("transaction"),
      type: transactionType,
      amount,
      date: transactionDate,
      accountId: transactionAccount,
      ...(transactionType === "transfer"
        ? {
            toAccountId: transactionToAccount,
            toAmount: destinationAmount,
          }
        : { categoryId: transactionCategory }),
      note: transactionNote.trim(),
      createdAt: existingTransaction?.createdAt ?? now,
      ...(existingTransaction ? { updatedAt: now } : {}),
    };

    onChange({
      ...state,
      transactions: saveFinanceTransaction(
        state.transactions,
        nextTransaction,
      ),
    });
    setEditingTransactionId("");
    setTransactionOpen(false);
  }

  function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = accountName.trim();
    if (!name) return;
    const accountVisual = {
      cash: { color: "#27a77b", icon: "💵" },
      bank: { color: "#6f4bd8", icon: "🏦" },
      ewallet: { color: "#e28b52", icon: "👛" },
    }[accountType];
    const existingAccount = state.accounts.find(
      (account) => account.id === editingAccountId,
    );
    const nextAccount = {
      id: existingAccount?.id ?? createId("account"),
      name,
      type: accountType,
      currency: existingAccount?.currency ?? accountCurrency,
      openingBalance: parseFinanceAmountInput(accountOpeningBalance),
      ...accountVisual,
    };
    onChange({
      ...state,
      accounts: saveFinanceAccount(state.accounts, nextAccount),
    });
    setReportingCurrency(nextAccount.currency);
    closeAccount();
  }

  function openNewAccount() {
    setEditingAccountId("");
    setAccountName("");
    setAccountType("bank");
    setAccountCurrency(reportingCurrency);
    setAccountOpeningBalance("");
    setAccountOpen(true);
  }

  function editAccount(accountId: string) {
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) return;
    setEditingAccountId(account.id);
    setAccountName(account.name);
    setAccountType(account.type);
    setAccountCurrency(account.currency);
    setAccountOpeningBalance(formatFinanceAmountInput(account.openingBalance));
    setAccountOpen(true);
  }

  function closeAccount() {
    setEditingAccountId("");
    setAccountName("");
    setAccountOpeningBalance("");
    setAccountOpen(false);
  }

  function deleteAccount(accountId: string) {
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) return;
    if (state.accounts.length <= 1) {
      window.alert("Cần giữ lại ít nhất một tài khoản để tiếp tục ghi giao dịch.");
      return;
    }
    const relatedTransactions = state.transactions.filter(
      (transaction) =>
        transaction.accountId === accountId ||
        transaction.toAccountId === accountId,
    );
    const transactionWarning = relatedTransactions.length
      ? ` và ${relatedTransactions.length} giao dịch liên quan? Các giao dịch này sẽ bị xóa khỏi báo cáo; số dư tài khoản đối ứng sẽ tự phục hồi`
      : "? Ngân sách theo nhóm vẫn được giữ nguyên";
    if (!window.confirm(`Xóa tài khoản ${account.name}${transactionWarning}.`)) {
      return;
    }
    const nextState = deleteFinanceAccount(state, accountId);
    const fallbackAccount = nextState.accounts[0];
    onChange(nextState);
    if (
      !nextState.accounts.some(
        (item) => item.currency === reportingCurrency,
      ) &&
      fallbackAccount
    ) {
      setReportingCurrency(fallbackAccount.currency);
    }
    if (transactionAccount === accountId) {
      setTransactionAccount(fallbackAccount?.id ?? "");
    }
    if (transactionToAccount === accountId) {
      setTransactionToAccount("");
    }
    if (editingAccountId === accountId) closeAccount();
  }

  function submitBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const monthlyLimit = parseFinanceAmountInput(budgetLimit);
    if (!budgetCategory || !monthlyLimit) return;
    const existingForSelection = state.budgets.find(
      (budget) =>
        budget.categoryId === budgetCategory &&
        budget.currency === budgetCurrency,
    );
    const nextBudget = {
      id: editingBudgetId || existingForSelection?.id || createId("budget"),
      categoryId: budgetCategory,
      currency: budgetCurrency,
      monthlyLimit,
    };
    onChange({
      ...state,
      budgets: saveFinanceBudget(state.budgets, nextBudget),
    });
    setEditingBudgetId("");
    setBudgetCategory("");
    setBudgetLimit("");
    setReportingCurrency(budgetCurrency);
    setBudgetOpen(false);
  }

  function openNewBudget() {
    setEditingBudgetId("");
    setBudgetCategory("");
    setBudgetCurrency(reportingCurrency);
    setBudgetLimit("");
    setBudgetOpen(true);
  }

  function editBudget(budgetId: string) {
    const budget = state.budgets.find((item) => item.id === budgetId);
    if (!budget) return;
    setEditingBudgetId(budget.id);
    setBudgetCategory(budget.categoryId);
    setBudgetCurrency(budget.currency);
    setBudgetLimit(formatFinanceAmountInput(budget.monthlyLimit));
    setBudgetOpen(true);
  }

  function closeBudget() {
    setEditingBudgetId("");
    setBudgetCategory("");
    setBudgetLimit("");
    setBudgetOpen(false);
  }

  function deleteBudget(budgetId: string) {
    const budget = state.budgets.find((item) => item.id === budgetId);
    if (!budget) return;
    const category = state.categories.find(
      (item) => item.id === budget.categoryId,
    );
    if (
      !window.confirm(
        `Xóa ngân sách ${category?.name ?? "nhóm chi"} (${budget.currency})? Giao dịch đã ghi sẽ không bị xóa.`,
      )
    ) {
      return;
    }
    onChange({
      ...state,
      budgets: deleteFinanceBudget(state.budgets, budgetId),
    });
    if (editingBudgetId === budgetId) closeBudget();
  }

  function startCategoryForm(
    kind: FinanceCategoryKind,
    parentId = "",
    category?: FinanceCategory,
  ) {
    setCategoryId(category?.id ?? "");
    setCategoryKind(category?.kind ?? kind);
    setCategoryParent(category?.parentId ?? parentId);
    setCategoryName(category?.name ?? "");
    setCategoryIcon(category?.icon ?? "•");
    setCategoryColor(category?.color ?? "#6f4bd8");
  }

  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    const existing = state.categories.find((category) => category.id === categoryId);
    const nextCategory: FinanceCategory = {
      id: existing?.id ?? createId("category"),
      name,
      kind: categoryKind,
      color: categoryColor,
      icon: categoryIcon.trim().slice(0, 12) || "•",
      ...(categoryParent ? { parentId: categoryParent } : {}),
      ...(existing?.archived ? { archived: true } : {}),
    };
    onChange({
      ...state,
      categories: [
        ...state.categories.filter((category) => category.id !== nextCategory.id),
        nextCategory,
      ],
    });
    startCategoryForm(categoryKind);
  }

  function toggleCategoryArchived(category: FinanceCategory) {
    const willArchive = !category.archived;
    if (
      willArchive &&
      !window.confirm(
        category.parentId
          ? `Ẩn nhóm “${category.name}” khỏi danh sách chọn?`
          : `Ẩn nhóm “${category.name}” và các nhóm con khỏi danh sách chọn?`,
      )
    ) {
      return;
    }
    const affectedIds = new Set([
      category.id,
      ...(willArchive && !category.parentId
        ? state.categories
            .filter((item) => item.parentId === category.id)
            .map((item) => item.id)
        : []),
    ]);
    onChange({
      ...state,
      categories: state.categories.map((item) =>
        affectedIds.has(item.id)
          ? { ...item, archived: willArchive || undefined }
          : item,
      ),
    });
  }

  function deleteTransaction(id: string) {
    if (!window.confirm("Xóa giao dịch này?")) return;
    onChange({
      ...state,
      transactions: state.transactions.filter((transaction) => transaction.id !== id),
    });
  }

  function getTransactionMeta(transaction: FinanceState["transactions"][number]) {
    if (transaction.type === "transfer") {
      const destination = state.accounts.find(
        (account) => account.id === transaction.toAccountId,
      );
      return { icon: "↔", name: "Chuyển khoản", detail: destination?.name ?? "Tài khoản" };
    }
    const category = state.categories.find(
      (item) => item.id === transaction.categoryId,
    );
    return {
      icon: category?.icon ?? "•",
      name:
        (transaction.categoryId &&
          getCategoryPath(state.categories, transaction.categoryId)) ||
        (transaction.type === "income" ? "Khoản thu" : "Khoản chi"),
      detail: transaction.note,
    };
  }

  function getTransactionValue(
    transaction: FinanceState["transactions"][number],
  ) {
    const account = state.accounts.find(
      (item) => item.id === transaction.accountId,
    );
    if (!account) return "";
    if (transaction.type !== "transfer") {
      const sign = transaction.type === "income" ? "+" : "−";
      return `${sign}${formatMoney(transaction.amount, account.currency)}`;
    }
    const destination = state.accounts.find(
      (item) => item.id === transaction.toAccountId,
    );
    if (!destination) return formatMoney(transaction.amount, account.currency);
    return `${formatMoney(transaction.amount, account.currency)} → ${formatMoney(
      transaction.toAmount ?? transaction.amount,
      destination.currency,
    )}`;
  }

  function renderCategoryOptions(
    kind: FinanceCategoryKind,
    includedCategoryId = "",
  ) {
    const includedCategory = state.categories.find(
      (category) => category.id === includedCategoryId,
    );
    const includedIds = new Set([
      includedCategoryId,
      includedCategory?.parentId ?? "",
    ]);
    const availableCategories = state.categories.filter(
      (category) =>
        category.kind === kind &&
        (!category.archived || includedIds.has(category.id)),
    );
    const roots = availableCategories.filter(
      (category) => !category.parentId,
    );
    return roots.map((root) => {
      const children = availableCategories.filter(
        (category) => category.parentId === root.id,
      );
      return (
        <optgroup key={root.id} label={`${root.icon} ${root.name}`}>
          <option value={root.id}>{root.name} (nhóm cha)</option>
          {children.map((child) => (
            <option key={child.id} value={child.id}>
              ↳ {child.icon} {child.name}
            </option>
          ))}
        </optgroup>
      );
    });
  }

  return (
    <section className={styles.financeShell} aria-label="Quản lý thu chi">
      <div className={styles.financeTopbar}>
        <div>
          <span className={styles.kicker}>DÒNG TIỀN CÁ NHÂN</span>
          <h2>{formatMoney(totalsByCurrency[reportingCurrency], reportingCurrency)}</h2>
          <p>
            Tổng số dư {reportingCurrency} · không cộng gộp với tiền tệ khác
          </p>
        </div>
        <button className={styles.primaryAction} type="button" onClick={() => openTransaction()}>
          <span aria-hidden="true">＋</span> Thêm giao dịch
        </button>
      </div>

      <nav className={styles.tabList} aria-label="Khu vực quản lý thu chi">
        {([
          ["overview", "Tổng quan"],
          ["transactions", "Giao dịch"],
          ["budgets", "Ngân sách"],
          ["accounts", "Tài khoản"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            aria-current={activeTab === tab ? "page" : undefined}
            className={activeTab === tab ? styles.activeTab : ""}
            onClick={() => {
              setActiveTab(tab);
              setMonthlyReportOpen(false);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className={styles.reportControls}>
        <div className={styles.currencySwitch} aria-label="Đơn vị báo cáo">
          {FINANCE_CURRENCIES.map((currency) => (
            <button
              key={currency.code}
              type="button"
              className={
                reportingCurrency === currency.code
                  ? styles.activeCurrency
                  : ""
              }
              onClick={() => setReportingCurrency(currency.code)}
            >
              <span>{currency.code}</span>
              <strong>
                {formatMoney(totalsByCurrency[currency.code], currency.code)}
              </strong>
            </button>
          ))}
        </div>
        <div className={styles.monthPicker}>
          <button type="button" aria-label="Tháng trước" onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, -1))}>‹</button>
          <strong>{formatMonth(selectedMonth)}</strong>
          <button type="button" aria-label="Tháng sau" onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, 1))}>›</button>
        </div>
      </div>

      {activeTab === "overview" && !monthlyReportOpen && (
        <div className={styles.overviewGrid}>
          <div className={styles.summaryStrip}>
            <article>
              <span>Thu nhập</span>
              <strong className={styles.income}>+{formatMoney(summary.income, reportingCurrency)}</strong>
            </article>
            <article>
              <span>Chi tiêu</span>
              <strong className={styles.expense}>−{formatMoney(summary.expense, reportingCurrency)}</strong>
            </article>
            <article>
              <span>Thu nhập ròng</span>
              <strong className={summary.net >= 0 ? styles.income : styles.expense}>
                {summary.net >= 0 ? "+" : "−"}{formatMoney(Math.abs(summary.net), reportingCurrency)}
              </strong>
            </article>
            <article>
              <span>Giao dịch</span>
              <strong>{summary.transactionCount}</strong>
            </article>
          </div>

          <article className={`${styles.panel} ${styles.accountsPanel}`}>
            <div className={styles.panelHeading}>
              <div><span>TÀI KHOẢN</span><h3>Ví của tôi</h3></div>
              <button type="button" onClick={() => setActiveTab("accounts")}>Xem tất cả</button>
            </div>
            <div className={styles.accountList}>
              {accountBalances.slice(0, 4).map(({ account, balance }) => (
                <div key={account.id} className={styles.accountRow}>
                  <span className={styles.roundIcon} style={{ background: `${account.color}20`, color: account.color }}>{account.icon}</span>
                  <div><strong>{account.name}</strong><small>{accountTypeLabels[account.type]} · {account.currency}</small></div>
                  <b>{formatMoney(balance, account.currency)}</b>
                </div>
              ))}
            </div>
          </article>

          <article className={`${styles.panel} ${styles.flowPanel}`}>
            <div className={styles.panelHeading}>
              <div><span>BÁO CÁO THÁNG</span><h3>Tiền vào và tiền ra</h3></div>
              <button type="button" onClick={() => setMonthlyReportOpen(true)}>Xem báo cáo</button>
            </div>
            <div className={styles.netSnapshot}>
              <span>Thu nhập ròng</span>
              <strong className={summary.net >= 0 ? styles.income : styles.expense}>
                {summary.net >= 0 ? "+" : "−"}{formatMoney(Math.abs(summary.net), reportingCurrency)}
              </strong>
              <small>{summary.transactionCount} giao dịch trong {formatMonth(selectedMonth)}</small>
            </div>
            <div className={styles.flowBars}>
              <div><span>Khoản thu</span><b className={styles.income}>{formatMoney(summary.income, reportingCurrency)}</b><i style={{ width: `${summary.income || summary.expense ? Math.max(8, (summary.income / Math.max(summary.income, summary.expense)) * 100) : 0}%` }} /></div>
              <div className={styles.expenseBar}><span>Khoản chi</span><b className={styles.expense}>{formatMoney(summary.expense, reportingCurrency)}</b><i style={{ width: `${summary.income || summary.expense ? Math.max(8, (summary.expense / Math.max(summary.income, summary.expense)) * 100) : 0}%` }} /></div>
            </div>
            <FinanceTrendChart compact currency={reportingCurrency} items={dailyTrend} />
            <button className={styles.panelLink} type="button" onClick={() => setMonthlyReportOpen(true)}>Xem báo cáo chi tiết <span>→</span></button>
          </article>

          <article className={`${styles.panel} ${styles.categoryPanel}`}>
            <div className={styles.panelHeading}>
              <div><span>BÁO CÁO THEO NHÓM</span><h3>Khoản thu và khoản chi</h3></div>
              <button type="button" onClick={() => setMonthlyReportOpen(true)}>Xem chi tiết</button>
            </div>
            <div className={styles.categoryPreviewGrid}>
              <CategoryBreakdownChart
                currency={reportingCurrency}
                emptyLabel="Chưa có khoản thu"
                items={incomeBreakdown.slice(0, 4)}
                title="Khoản thu"
                total={summary.income}
              />
              <CategoryBreakdownChart
                currency={reportingCurrency}
                emptyLabel="Chưa có khoản chi"
                items={expenseBreakdown.slice(0, 4)}
                title="Khoản chi"
                total={summary.expense}
              />
            </div>
          </article>

          <article className={`${styles.panel} ${styles.recentPanel}`}>
            <div className={styles.panelHeading}>
              <div><span>MỚI NHẤT</span><h3>Giao dịch gần đây</h3></div>
              <button type="button" onClick={() => setActiveTab("transactions")}>Xem tất cả</button>
            </div>
            {state.transactions.length ? (
              <div className={styles.transactionList}>
                {state.transactions.slice(0, 5).map((transaction) => {
                  const meta = getTransactionMeta(transaction);
                  return <div key={transaction.id} className={styles.transactionRow}>
                    <span className={styles.roundIcon}>{meta.icon}</span>
                    <div><strong>{meta.name}</strong><small>{formatShortDate(transaction.date)}{meta.detail ? ` · ${meta.detail}` : ""}{transaction.updatedAt ? " · Đã sửa" : ""}</small></div>
                    <b className={transaction.type === "income" ? styles.income : transaction.type === "expense" ? styles.expense : ""}>{getTransactionValue(transaction)}</b>
                  </div>;
                })}
              </div>
            ) : (
              <div className={styles.emptyState}><span>＋</span><strong>Chưa có giao dịch</strong><p>Ghi khoản thu hoặc chi để bắt đầu theo dõi dòng tiền.</p><button type="button" onClick={() => openTransaction()}>Thêm giao dịch</button></div>
            )}
          </article>
        </div>
      )}

      {activeTab === "overview" && monthlyReportOpen && (
        <div className={styles.monthlyReport}>
          <div className={styles.reportHeader}>
            <button type="button" onClick={() => setMonthlyReportOpen(false)} aria-label="Quay lại tổng quan">←</button>
            <div>
              <span>BÁO CÁO THÁNG</span>
              <h3>Chi tiết {formatMonth(selectedMonth)}</h3>
              <p>{reportingCurrency} · dữ liệu không cộng gộp với tiền tệ khác</p>
            </div>
            <button type="button" onClick={() => setActiveTab("transactions")}>Xem giao dịch</button>
          </div>

          <section className={styles.reportHero}>
            <div className={styles.reportNet}>
              <span>Thu nhập ròng</span>
              <strong className={summary.net >= 0 ? styles.income : styles.expense}>
                {summary.net >= 0 ? "+" : "−"}{formatMoney(Math.abs(summary.net), reportingCurrency)}
              </strong>
              <small>Số dư dòng tiền của {summary.transactionCount} giao dịch</small>
            </div>
            <div className={styles.reportMetrics}>
              <article>
                <span>Khoản thu</span>
                <strong className={styles.income}>+{formatMoney(summary.income, reportingCurrency)}</strong>
                <small>
                  Tháng trước {formatMoney(previousSummary.income, reportingCurrency)}
                </small>
              </article>
              <article>
                <span>Khoản chi</span>
                <strong className={styles.expense}>−{formatMoney(summary.expense, reportingCurrency)}</strong>
                <small>
                  Tháng trước {formatMoney(previousSummary.expense, reportingCurrency)}
                </small>
              </article>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.trendPanel}`}>
            <div className={styles.panelHeading}>
              <div><span>XU HƯỚNG TRONG THÁNG</span><h3>Dòng tiền lũy kế theo ngày</h3></div>
              <div className={styles.trendLegend}>
                <span><i className={styles.incomeTrend} />Khoản thu</span>
                <span><i className={styles.expenseTrend} />Khoản chi</span>
              </div>
            </div>
            <FinanceTrendChart currency={reportingCurrency} items={dailyTrend} />
            <div className={styles.comparisonGrid}>
              <div>
                <span>Trung bình thu 3 tháng trước</span>
                <b>{formatMoney(threeMonthAverage.income, reportingCurrency)}</b>
              </div>
              <div>
                <span>Trung bình chi 3 tháng trước</span>
                <b>{formatMoney(threeMonthAverage.expense, reportingCurrency)}</b>
              </div>
              <div>
                <span>Chênh lệch chi so với tháng trước</span>
                <b className={summary.expense <= previousSummary.expense ? styles.income : styles.expense}>
                  {previousSummary.expense
                    ? `${summary.expense <= previousSummary.expense ? "Giảm" : "Tăng"} ${Math.abs(Math.round(((summary.expense - previousSummary.expense) / previousSummary.expense) * 100))}%`
                    : summary.expense
                      ? "Chưa có dữ liệu đối chiếu"
                      : "Không thay đổi"}
                </b>
              </div>
            </div>
          </section>

          <section className={styles.fullBreakdownPanel}>
            <div className={styles.sectionTitle}>
              <div><span>PHÂN BỔ DÒNG TIỀN</span><h3>Báo cáo theo nhóm</h3></div>
              <p>Nhóm con được cộng vào nhóm cha để tỷ lệ luôn phản ánh đúng tổng tháng.</p>
            </div>
            <div className={styles.reportBreakdownGrid}>
              <CategoryBreakdownChart
                currency={reportingCurrency}
                emptyLabel="Chưa có khoản thu trong tháng này"
                items={incomeBreakdown}
                title="Khoản thu"
                total={summary.income}
              />
              <CategoryBreakdownChart
                currency={reportingCurrency}
                emptyLabel="Chưa có khoản chi trong tháng này"
                items={expenseBreakdown}
                title="Khoản chi"
                total={summary.expense}
              />
            </div>
          </section>
        </div>
      )}

      {activeTab === "transactions" && (
        <article className={`${styles.panel} ${styles.fullPanel}`}>
          <div className={styles.panelHeading}>
            <div><span>SỔ GIAO DỊCH</span><h3>{formatMonth(selectedMonth)}</h3></div>
            <div className={styles.headingActions}>
              <button
                className={styles.secondaryAction}
                type="button"
                onClick={() => {
                  startCategoryForm("expense");
                  setCategoryManagerOpen(true);
                }}
              >
                Quản lý nhóm
              </button>
              <select value={transactionFilter} onChange={(event) => setTransactionFilter(event.target.value as TransactionFilter)} aria-label="Lọc giao dịch">
                <option value="all">Tất cả</option><option value="income">Khoản thu</option><option value="expense">Khoản chi</option><option value="transfer">Chuyển khoản</option>
              </select>
            </div>
          </div>
          {monthTransactions.length ? (
            <div className={styles.transactionList}>
              {monthTransactions.map((transaction) => {
                const meta = getTransactionMeta(transaction);
                const account = state.accounts.find((item) => item.id === transaction.accountId);
                return <div key={transaction.id} className={styles.transactionRow}>
                  <span className={styles.roundIcon}>{meta.icon}</span>
                  <div><strong>{meta.name}</strong><small>{formatShortDate(transaction.date)} · {transaction.note || account?.name}{transaction.updatedAt ? " · Đã sửa" : ""}</small></div>
                  <b className={transaction.type === "income" ? styles.income : transaction.type === "expense" ? styles.expense : ""}>{getTransactionValue(transaction)}</b>
                  <div className={styles.rowActions}>
                    <button className={styles.editButton} type="button" onClick={() => editTransaction(transaction)} aria-label={`Sửa giao dịch ${meta.name}`}>✎</button>
                    <button className={styles.deleteButton} type="button" onClick={() => deleteTransaction(transaction.id)} aria-label={`Xóa giao dịch ${meta.name}`}>×</button>
                  </div>
                </div>;
              })}
            </div>
          ) : <div className={styles.emptyState}><span>⌁</span><strong>Không có giao dịch phù hợp</strong><p>Đổi bộ lọc hoặc thêm một giao dịch mới.</p></div>}
        </article>
      )}

      {activeTab === "budgets" && (
        <article className={`${styles.panel} ${styles.fullPanel}`}>
          <div className={styles.panelHeading}>
            <div><span>KẾ HOẠCH THÁNG</span><h3>Ngân sách theo nhóm</h3></div>
            <button className={styles.compactAction} type="button" onClick={openNewBudget}>＋ Đặt ngân sách</button>
          </div>
          {state.budgets.length ? <div className={styles.budgetGrid}>
            {state.budgets.map((budget) => {
              const category = state.categories.find((item) => item.id === budget.categoryId);
              const spent = getCategorySpent(
                state,
                budget.categoryId,
                selectedMonth,
                budget.currency,
              );
              const progress = Math.min(100, (spent / budget.monthlyLimit) * 100);
              return <div key={budget.id} className={styles.budgetCard}>
                <div className={styles.budgetSummary}><span className={styles.roundIcon}>{category?.icon ?? "•"}</span><span><strong>{category?.name ?? "Nhóm chi"} · {budget.currency}</strong><small>Còn {formatMoney(Math.max(0, budget.monthlyLimit - spent), budget.currency)}</small></span><b>{Math.round(progress)}%</b></div>
                <i><b className={progress >= 100 ? styles.overBudget : ""} style={{ width: `${progress}%`, background: category?.color }} /></i>
                <p><span>Đã chi {formatMoney(spent, budget.currency)}</span><span>Giới hạn {formatMoney(budget.monthlyLimit, budget.currency)}</span></p>
                <div className={styles.budgetActions}>
                  <button type="button" onClick={() => editBudget(budget.id)} aria-label={`Sửa ngân sách ${category?.name ?? "nhóm chi"}`}>Sửa</button>
                  <button type="button" onClick={() => deleteBudget(budget.id)} aria-label={`Xóa ngân sách ${category?.name ?? "nhóm chi"}`}>Xóa</button>
                </div>
              </div>;
            })}
          </div> : <div className={styles.emptyState}><span>◔</span><strong>Chưa đặt ngân sách</strong><p>Đặt giới hạn theo nhóm để biết mình còn có thể chi bao nhiêu.</p><button type="button" onClick={openNewBudget}>Đặt ngân sách đầu tiên</button></div>}
        </article>
      )}

      {activeTab === "accounts" && (
        <article className={`${styles.panel} ${styles.fullPanel}`}>
          <div className={styles.panelHeading}>
            <div><span>TÀI SẢN THANH KHOẢN</span><h3>Tài khoản của tôi</h3></div>
            <button className={styles.compactAction} type="button" onClick={openNewAccount}>＋ Thêm tài khoản</button>
          </div>
          <div className={styles.accountCards}>
            {accountBalances.map(({ account, balance }) => (
              <div key={account.id} className={styles.accountCard} style={{ borderTopColor: account.color }}>
                <span className={styles.roundIcon} style={{ background: `${account.color}20`, color: account.color }}>{account.icon}</span>
                <div className={styles.accountCardMain}><small>{accountTypeLabels[account.type]} · {account.currency}</small><strong>{account.name}</strong><b>{formatMoney(balance, account.currency)}</b></div>
                <div className={styles.accountActions}>
                  <button className={styles.editButton} type="button" onClick={() => editAccount(account.id)} aria-label={`Sửa tài khoản ${account.name}`}>✎</button>
                  <button className={styles.deleteButton} type="button" onClick={() => deleteAccount(account.id)} aria-label={`Xóa tài khoản ${account.name}`}>×</button>
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      {transactionOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) { setTransactionOpen(false); setEditingTransactionId(""); } }}>
          <form className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="transaction-title" onSubmit={submitTransaction}>
            <div className={styles.modalHeading}><div><span>{editingTransactionId ? "CHỈNH SỬA GIAO DỊCH" : "GIAO DỊCH MỚI"}</span><h3 id="transaction-title">{editingTransactionId ? "Cập nhật dòng tiền" : "Ghi nhận dòng tiền"}</h3></div><button type="button" onClick={() => { setTransactionOpen(false); setEditingTransactionId(""); }} aria-label="Đóng">×</button></div>
            {editingTransactionId && (
              <div className={styles.editFlowNotice}>
                <strong>Cách cập nhật số dư</strong>
                <p>Ứng dụng hoàn lại toàn bộ tác động của giao dịch cũ, sau đó áp dụng thông tin mới. Giao dịch không bị cộng hai lần.</p>
              </div>
            )}
            <div className={styles.segmented}>
              {(["expense", "income", "transfer"] as const).map((type) => <button key={type} type="button" className={transactionType === type ? styles.segmentActive : ""} onClick={() => { setTransactionType(type); setTransactionToAmount(""); setTransactionCategory(state.categories.find((category) => !category.archived && (type === "income" ? category.kind === "income" : category.kind === "expense"))?.id ?? ""); }}>{type === "expense" ? "Khoản chi" : type === "income" ? "Khoản thu" : "Chuyển khoản"}</button>)}
            </div>
            <div className={styles.currencyInputBlock}>
              <span>ĐƠN VỊ NHẬP</span>
              <div className={styles.currencyInputSwitch} aria-label="Chọn đơn vị giao dịch">
                {FINANCE_CURRENCIES.map((currency) => (
                  <button
                    key={currency.code}
                    type="button"
                    className={transactionCurrency === currency.code ? styles.activeInputCurrency : ""}
                    onClick={() => {
                      const nextAccount = state.accounts.find(
                        (account) => account.currency === currency.code,
                      );
                      if (!nextAccount) return;
                      setTransactionCurrency(currency.code);
                      setTransactionAccount(nextAccount.id);
                      setTransactionAmount("");
                      setTransactionToAmount("");
                      if (nextAccount.id === transactionToAccount) {
                        setTransactionToAccount(
                          state.accounts.find(
                            (account) => account.id !== nextAccount.id,
                          )?.id ?? "",
                        );
                      }
                    }}
                  >
                    <strong>{currency.symbol} {currency.code}</strong>
                    <small>{currency.shortLabel}</small>
                  </button>
                ))}
              </div>
            </div>
            <label>
              Số tiền {sourceAccount ? `(${sourceAccount.currency})` : ""}
              <input autoFocus inputMode="numeric" type="text" value={transactionAmount} onChange={(event) => setTransactionAmount(formatFinanceAmountInput(event.target.value))} placeholder={sourceAccount?.currency === "KRW" ? "1.000.000 ₩" : "1.000.000 ₫"} required />
            </label>
            <div className={styles.formGrid}>
              <label>{transactionType === "transfer" ? "Từ tài khoản" : "Tài khoản"}<select value={transactionAccount} onChange={(event) => { const nextAccount = event.target.value; setTransactionAccount(nextAccount); setTransactionToAmount(""); if (nextAccount === transactionToAccount) setTransactionToAccount(state.accounts.find((account) => account.id !== nextAccount)?.id ?? ""); }} required>{state.accounts.filter((account) => account.currency === transactionCurrency).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label>
              {transactionType === "transfer" ? <label>Đến tài khoản<select value={transactionToAccount} onChange={(event) => { setTransactionToAccount(event.target.value); setTransactionToAmount(""); }} required><option value="">Chọn tài khoản</option>{state.accounts.filter((account) => account.id !== transactionAccount).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label> : <label>Nhóm<select value={transactionCategory} onChange={(event) => setTransactionCategory(event.target.value)} required><option value="">Chọn nhóm</option>{renderCategoryOptions(transactionType === "income" ? "income" : "expense", transactionCategory)}</select></label>}
              <label>Ngày<input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} required /></label>
              <label>Ghi chú<input value={transactionNote} onChange={(event) => setTransactionNote(event.target.value)} placeholder="Không bắt buộc" maxLength={240} /></label>
            </div>
            {isCurrencyConversion && sourceAccount && destinationAccount && (
              <div className={styles.exchangeBox}>
                <label>
                  Số tiền thực nhận ({destinationAccount.currency})
                  <input
                    inputMode="numeric"
                    type="text"
                    value={transactionToAmount}
                    onChange={(event) => setTransactionToAmount(formatFinanceAmountInput(event.target.value))}
                    placeholder={destinationAccount.currency === "KRW" ? "1.000.000 ₩" : "1.000.000 ₫"}
                    required
                  />
                </label>
                <p>
                  {effectiveExchangeRate > 0
                    ? `Tỷ giá thực tế: 1 ${sourceAccount.currency} ≈ ${effectiveExchangeRate.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} ${destinationAccount.currency}`
                    : "Nhập số thực nhận; tỷ giá sẽ được tính tự động."}
                </p>
              </div>
            )}
            {transactionType !== "transfer" && (
              <button
                className={styles.inlineLink}
                type="button"
                onClick={() => {
                  startCategoryForm(
                    transactionType === "income" ? "income" : "expense",
                  );
                  setCategoryManagerOpen(true);
                }}
              >
                ＋ Thêm hoặc chỉnh sửa nhóm
              </button>
            )}
            <button className={styles.saveButton} type="submit">{editingTransactionId ? "Lưu thay đổi" : "Lưu giao dịch"}</button>
          </form>
        </div>
      )}

      {accountOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeAccount(); }}>
          <form className={`${styles.modal} ${styles.smallModal}`} role="dialog" aria-modal="true" aria-labelledby="account-title" onSubmit={submitAccount}>
            <div className={styles.modalHeading}><div><span>{editingAccountId ? "CHỈNH SỬA TÀI KHOẢN" : "TÀI KHOẢN MỚI"}</span><h3 id="account-title">{editingAccountId ? "Cập nhật nơi giữ tiền" : "Thêm nơi giữ tiền"}</h3></div><button type="button" onClick={closeAccount} aria-label="Đóng">×</button></div>
            <label>Tên tài khoản<input autoFocus value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Ví dụ: Vietcombank" required maxLength={100} /></label>
            <label>Loại tài khoản<select value={accountType} onChange={(event) => setAccountType(event.target.value as FinanceAccountType)}>{Object.entries(accountTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Đơn vị tiền<select value={accountCurrency} disabled={Boolean(editingAccountId)} onChange={(event) => setAccountCurrency(event.target.value as FinanceCurrency)}>{FINANCE_CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.label} ({currency.code})</option>)}</select></label>
            <label>Số dư ban đầu<input inputMode="numeric" type="text" value={accountOpeningBalance} onChange={(event) => setAccountOpeningBalance(formatFinanceAmountInput(event.target.value))} placeholder={accountCurrency === "KRW" ? "1.000.000 ₩" : "1.000.000 ₫"} /></label>
            <p className={styles.formHint}>{editingAccountId ? "Đổi số dư ban đầu sẽ làm số dư hiện tại tăng hoặc giảm tương ứng. Các giao dịch cũ vẫn được giữ nguyên." : "Đơn vị tiền của tài khoản không đổi sau khi tạo để lịch sử luôn chính xác."}</p>
            <div className={styles.budgetModalActions}>
              {editingAccountId && <button className={styles.dangerAction} type="button" onClick={() => deleteAccount(editingAccountId)}>Xóa tài khoản</button>}
              <button className={styles.saveButton} type="submit">{editingAccountId ? "Lưu thay đổi" : "Thêm tài khoản"}</button>
            </div>
          </form>
        </div>
      )}

      {budgetOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeBudget(); }}>
          <form className={`${styles.modal} ${styles.smallModal}`} role="dialog" aria-modal="true" aria-labelledby="budget-title" onSubmit={submitBudget}>
            <div className={styles.modalHeading}><div><span>{editingBudgetId ? "CHỈNH SỬA NGÂN SÁCH" : "NGÂN SÁCH THÁNG"}</span><h3 id="budget-title">{editingBudgetId ? "Cập nhật giới hạn chi" : "Đặt giới hạn chi"}</h3></div><button type="button" onClick={closeBudget} aria-label="Đóng">×</button></div>
            {editingBudgetId && <p className={styles.formHint}>Bạn có thể đổi nhóm, đơn vị tiền hoặc giới hạn. Nếu trùng với một ngân sách khác, bản đang sửa sẽ thay thế ngân sách đó.</p>}
            <label>Đơn vị ngân sách<select value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.target.value as FinanceCurrency)}>{FINANCE_CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.label} ({currency.code})</option>)}</select></label>
            <label>Nhóm chi<select autoFocus value={budgetCategory} onChange={(event) => setBudgetCategory(event.target.value)} required><option value="">Chọn nhóm</option>{renderCategoryOptions("expense", budgetCategory)}</select></label>
            <label>Giới hạn mỗi tháng<input inputMode="numeric" type="text" value={budgetLimit} onChange={(event) => setBudgetLimit(formatFinanceAmountInput(event.target.value))} placeholder={budgetCurrency === "KRW" ? "1.000.000 ₩" : "1.000.000 ₫"} required /></label>
            <div className={styles.budgetModalActions}>
              {editingBudgetId && <button className={styles.dangerAction} type="button" onClick={() => deleteBudget(editingBudgetId)}>Xóa ngân sách</button>}
              <button className={styles.saveButton} type="submit">{editingBudgetId ? "Lưu thay đổi" : "Lưu ngân sách"}</button>
            </div>
          </form>
        </div>
      )}

      {categoryManagerOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={`${styles.modal} ${styles.categoryModal}`} role="dialog" aria-modal="true" aria-labelledby="category-title">
            <div className={styles.modalHeading}>
              <div><span>DANH MỤC CÁ NHÂN</span><h3 id="category-title">Nhóm giao dịch</h3></div>
              <button type="button" onClick={() => setCategoryManagerOpen(false)} aria-label="Đóng">×</button>
            </div>
            <div className={`${styles.segmented} ${styles.twoSegments}`}>
              {(["expense", "income"] as const).map((kind) => (
                <button key={kind} type="button" className={categoryKind === kind ? styles.segmentActive : ""} onClick={() => startCategoryForm(kind)}>
                  {kind === "expense" ? "Khoản chi" : "Khoản thu"}
                </button>
              ))}
            </div>
            <div className={styles.categoryToolbar}>
              <p>Nhóm cha dùng để gom báo cáo; nhóm con giúp nhập chi tiết hơn.</p>
              <label><input type="checkbox" checked={showArchivedCategories} onChange={(event) => setShowArchivedCategories(event.target.checked)} /> Hiện nhóm đã ẩn</label>
            </div>
            <div className={styles.categoryManagerGrid}>
              <div className={styles.categoryTree}>
                {state.categories
                  .filter((category) => category.kind === categoryKind && !category.parentId && (showArchivedCategories || !category.archived))
                  .map((root) => (
                    <div key={root.id} className={`${styles.categoryTreeGroup} ${root.archived ? styles.archivedCategory : ""}`}>
                      <div className={styles.categoryTreeRow}>
                        <span className={styles.roundIcon} style={{ background: `${root.color}20`, color: root.color }}>{root.icon}</span>
                        <strong>{root.name}</strong>
                        <button type="button" onClick={() => startCategoryForm(root.kind, "", root)}>Sửa</button>
                        <button type="button" onClick={() => toggleCategoryArchived(root)}>{root.archived ? "Khôi phục" : "Ẩn"}</button>
                      </div>
                      {state.categories
                        .filter((child) => child.parentId === root.id && (showArchivedCategories || !child.archived))
                        .map((child) => (
                          <div key={child.id} className={`${styles.categoryTreeRow} ${styles.childCategory} ${child.archived ? styles.archivedCategory : ""}`}>
                            <span className={styles.roundIcon} style={{ background: `${child.color}20`, color: child.color }}>{child.icon}</span>
                            <strong>{child.name}</strong>
                            <button type="button" onClick={() => startCategoryForm(child.kind, root.id, child)}>Sửa</button>
                            <button type="button" onClick={() => toggleCategoryArchived(child)}>{child.archived ? "Khôi phục" : "Ẩn"}</button>
                          </div>
                        ))}
                      {!root.archived && (
                        <button className={styles.addChildButton} type="button" onClick={() => startCategoryForm(root.kind, root.id)}>＋ Thêm nhóm con cho {root.name}</button>
                      )}
                    </div>
                  ))}
              </div>
              <form className={styles.categoryForm} onSubmit={submitCategory}>
                <span>{categoryId ? "CHỈNH SỬA NHÓM" : "NHÓM MỚI"}</span>
                <h4>{categoryParent ? "Nhóm con" : "Nhóm cha"}</h4>
                <label>Tên nhóm<input autoFocus value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Ví dụ: Ăn sáng" maxLength={100} required /></label>
                <div className={styles.formGrid}>
                  <label>Biểu tượng<input value={categoryIcon} onChange={(event) => setCategoryIcon(event.target.value)} maxLength={12} /></label>
                  <label>Màu<input type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} /></label>
                </div>
                <label>Nhóm cha<select value={categoryParent} onChange={(event) => setCategoryParent(event.target.value)}><option value="">Không có — đây là nhóm cha</option>{state.categories.filter((category) => category.kind === categoryKind && !category.parentId && !category.archived && category.id !== categoryId).map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></label>
                <button className={styles.saveButton} type="submit">{categoryId ? "Lưu thay đổi" : "Thêm nhóm"}</button>
                {(categoryId || categoryName) && <button className={styles.resetButton} type="button" onClick={() => startCategoryForm(categoryKind)}>Tạo nhóm khác</button>}
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
