"use client";

import {
  type Dispatch,
  FormEvent,
  type SetStateAction,
  useMemo,
  useState,
} from "react";
import {
  calculateAccountBalance,
  calculateBudgetPlanSnapshot,
  calculateTotalsByCurrency,
  deleteFinanceAccount,
  deleteFinanceBudget,
  FINANCE_CURRENCIES,
  FinanceAccountType,
  FinanceCategory,
  FinanceCategoryKind,
  FinanceCurrency,
  FinanceState,
  formatFinanceAmountInput,
  getCategoryPath,
  getCategorySpent,
  getFinanceCategoryBreakdown,
  getFinanceMonthDailyTrend,
  getFinanceTransactionsForMonth,
  monthKeyFromIso,
  parseFinanceAmountInput,
  saveFinanceAccount,
  saveFinanceBudget,
  saveFinanceBudgetPlan,
  saveFinanceTransaction,
  shiftMonthKey,
  summarizeFinanceMonth,
} from "@/lib/finance";
import {
  calculateNetWorth,
  ExchangeRateSettings,
} from "@/lib/planning";
import AccountDialog from "./finance/account-dialog";
import BudgetDialog from "./finance/budget-dialog";
import CategoryManagerDialog from "./finance/category-manager-dialog";
import TransactionDialog, {
  type EditableFinanceTransactionType,
} from "./finance/transaction-dialog";
import {
  CategoryBreakdownChart,
  FinanceTrendChart,
} from "./finance/finance-charts";
import {
  accountTypeLabels,
  createFinanceId,
  formatMoney,
  formatMonth,
  formatShortDate,
  todayIso,
} from "./finance/formatters";
import styles from "./finance-manager.module.css";

type FinanceTab = "overview" | "transactions" | "budgets" | "accounts";
type TransactionFilter = "all" | EditableFinanceTransactionType | "savings";

type FinanceManagerProps = {
  state: FinanceState;
  onChange: Dispatch<SetStateAction<FinanceState>>;
  prosperityValueVnd: number;
  savingsValueVnd: number;
  walletValueVnd: number;
  exchangeSettings: ExchangeRateSettings;
  onExchangeSettingsChange: (settings: ExchangeRateSettings) => void;
};

export default function FinanceManager({
  exchangeSettings,
  onChange,
  onExchangeSettingsChange,
  prosperityValueVnd,
  savingsValueVnd,
  state,
  walletValueVnd,
}: FinanceManagerProps) {
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
    useState<EditableFinanceTransactionType>("expense");
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
  const [netWorthSettingsOpen, setNetWorthSettingsOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  const summary = useMemo(
    () => summarizeFinanceMonth(state, selectedMonth, reportingCurrency),
    [reportingCurrency, selectedMonth, state],
  );
  const totalsByCurrency = useMemo(
    () => calculateTotalsByCurrency(state),
    [state],
  );
  const netWorth = useMemo(
    () =>
      calculateNetWorth(
        state,
        savingsValueVnd,
        walletValueVnd,
        exchangeSettings,
        prosperityValueVnd,
      ),
    [
      exchangeSettings,
      prosperityValueVnd,
      savingsValueVnd,
      state,
      walletValueVnd,
    ],
  );
  const latestActualRate = useMemo(() => {
    const accounts = new Map(state.accounts.map((account) => [account.id, account]));
    for (const transaction of state.transactions) {
      if (transaction.type !== "transfer" || !transaction.toAccountId) continue;
      const source = accounts.get(transaction.accountId);
      const destination = accounts.get(transaction.toAccountId);
      const received = transaction.toAmount ?? transaction.amount;
      if (!source || !destination || source.currency === destination.currency) continue;
      if (source.currency === "KRW" && transaction.amount > 0) {
        return received / transaction.amount;
      }
      if (destination.currency === "KRW" && received > 0) {
        return transaction.amount / received;
      }
    }
    return 0;
  }, [state.accounts, state.transactions]);
  const budgetPlan = (state.budgetPlans ?? []).find(
    (plan) => plan.currency === reportingCurrency,
  );
  const budgetPlanSnapshot = useMemo(
    () =>
      calculateBudgetPlanSnapshot(
        state,
        selectedMonth,
        reportingCurrency,
        todayIso(),
      ),
    [reportingCurrency, selectedMonth, state],
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
      getFinanceTransactionsForMonth(state, selectedMonth, reportingCurrency)
        .filter(
          (transaction) =>
            transactionFilter === "all" ||
              (transactionFilter === "savings"
                ? transaction.type === "savings-deposit" ||
                  transaction.type === "savings-settlement" ||
                  transaction.type === 'prosperity-deposit' ||
                  transaction.type === 'prosperity-settlement'
                : transaction.type === transactionFilter),
        )
        .sort(
          (left, right) =>
            right.date.localeCompare(left.date) ||
            right.createdAt.localeCompare(left.createdAt),
        ),
    [reportingCurrency, selectedMonth, state, transactionFilter],
  );
  const visibleBudgets = useMemo(
    () => state.budgets.filter((budget) => budget.currency === reportingCurrency),
    [reportingCurrency, state.budgets],
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

  function openTransaction(type: EditableFinanceTransactionType = "expense") {
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
    setFormError("");
    setTransactionOpen(true);
  }

  function editTransaction(
    transaction: FinanceState["transactions"][number],
  ) {
    if (
      transaction.type === "savings-deposit" ||
      transaction.type === "savings-settlement" ||
      transaction.type === 'prosperity-deposit' ||
      transaction.type === 'prosperity-settlement'
    ) {
      return;
    }
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
    setFormError("");
    setTransactionOpen(true);
  }

  function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseFinanceAmountInput(transactionAmount);
    const source = state.accounts.find(
      (account) => account.id === transactionAccount,
    );
    if (!amount) {
      setFormError("Số tiền phải lớn hơn 0.");
      return;
    }
    if (!source || source.currency !== transactionCurrency) {
      setFormError("Tài khoản nguồn không còn hợp lệ. Hãy chọn lại tài khoản.");
      return;
    }
    if (
      transactionType === "transfer" &&
      (!transactionToAccount || transactionToAccount === transactionAccount)
    ) {
      setFormError("Hãy chọn một tài khoản nhận khác tài khoản nguồn.");
      return;
    }
    const destination = state.accounts.find(
      (account) => account.id === transactionToAccount,
    );
    if (transactionType === "transfer" && !destination) {
      setFormError("Tài khoản nhận không còn tồn tại. Hãy chọn lại.");
      return;
    }
    if (transactionType !== "transfer") {
      const expectedKind = transactionType === "income" ? "income" : "expense";
      const category = state.categories.find(
        (item) =>
          item.id === transactionCategory && item.kind === expectedKind,
      );
      if (!category) {
        setFormError("Nhóm giao dịch không còn hợp lệ. Hãy chọn lại nhóm.");
        return;
      }
    }
    if (!transactionDate) {
      setFormError("Hãy chọn ngày giao dịch.");
      return;
    }
    const destinationAmount =
      transactionType === "transfer"
        ? source.currency !== destination?.currency
          ? parseFinanceAmountInput(transactionToAmount)
          : amount
        : undefined;
    if (transactionType === "transfer" && !destinationAmount) {
      setFormError("Số tiền tài khoản nhận phải lớn hơn 0.");
      return;
    }

    const transactionId =
      editingTransactionId || createFinanceId("transaction");
    const now = new Date().toISOString();
    onChange((current) => {
      const existingTransaction = current.transactions.find(
        (transaction) => transaction.id === transactionId,
      );
      const nextTransaction: FinanceState["transactions"][number] = {
        id: transactionId,
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
      return {
        ...current,
        transactions: saveFinanceTransaction(
          current.transactions,
          nextTransaction,
        ),
      };
    });
    setFormError("");
    setActionNotice(
      editingTransactionId
        ? "Đã cập nhật giao dịch."
        : "Đã thêm giao dịch mới.",
    );
    setEditingTransactionId("");
    setTransactionOpen(false);
  }

  function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = accountName.trim();
    if (!name) {
      setFormError("Hãy nhập tên tài khoản.");
      return;
    }
    const accountVisual = {
      cash: { color: "#27a77b", icon: "💵" },
      bank: { color: "#6f4bd8", icon: "🏦" },
      ewallet: { color: "#e28b52", icon: "👛" },
    }[accountType];
    const accountId = editingAccountId || createFinanceId("account");
    const savedCurrency =
      state.accounts.find((account) => account.id === editingAccountId)
        ?.currency ?? accountCurrency;
    onChange((current) => {
      const existingAccount = current.accounts.find(
        (account) => account.id === accountId,
      );
      const nextAccount = {
        id: accountId,
        name,
        type: accountType,
        currency: existingAccount?.currency ?? savedCurrency,
        openingBalance: parseFinanceAmountInput(accountOpeningBalance),
        ...accountVisual,
      };
      return {
        ...current,
        accounts: saveFinanceAccount(current.accounts, nextAccount),
      };
    });
    setReportingCurrency(savedCurrency);
    setActionNotice(
      editingAccountId
        ? `Đã cập nhật tài khoản “${name}”.`
        : `Đã thêm tài khoản “${name}”.`,
    );
    closeAccount();
  }

  function openNewAccount() {
    setEditingAccountId("");
    setAccountName("");
    setAccountType("bank");
    setAccountCurrency(reportingCurrency);
    setAccountOpeningBalance("");
    setFormError("");
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
    setFormError("");
    setAccountOpen(true);
  }

  function closeAccount() {
    setEditingAccountId("");
    setAccountName("");
    setAccountOpeningBalance("");
    setFormError("");
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
    onChange((current) => deleteFinanceAccount(current, accountId));
    setActionNotice(`Đã xóa tài khoản “${account.name}” và các giao dịch liên quan.`);
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
    if (!budgetCategory || !monthlyLimit) {
      setFormError("Hãy chọn nhóm chi và nhập giới hạn lớn hơn 0.");
      return;
    }
    const budgetId = editingBudgetId || createFinanceId("budget");
    onChange((current) => {
      const existingForSelection = current.budgets.find(
        (budget) =>
          budget.categoryId === budgetCategory &&
          budget.currency === budgetCurrency,
      );
      const nextBudget = {
        id: editingBudgetId || existingForSelection?.id || budgetId,
        categoryId: budgetCategory,
        currency: budgetCurrency,
        monthlyLimit,
      };
      return {
        ...current,
        budgets: saveFinanceBudget(current.budgets, nextBudget),
      };
    });
    setFormError("");
    setActionNotice(
      editingBudgetId ? "Đã cập nhật ngân sách." : "Đã thêm ngân sách.",
    );
    setEditingBudgetId("");
    setBudgetCategory("");
    setBudgetLimit("");
    setReportingCurrency(budgetCurrency);
    setBudgetOpen(false);
  }

  function submitBudgetPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const monthlyLimit = parseFinanceAmountInput(
      String(formData.get("monthlyLimit") ?? ""),
    );
    if (!monthlyLimit) {
      setActionNotice("Giới hạn ngân sách tổng phải lớn hơn 0.");
      return;
    }
    onChange((current) => {
      const currentPlan = (current.budgetPlans ?? []).find(
        (plan) => plan.currency === reportingCurrency,
      );
      return {
        ...current,
        budgetPlans: saveFinanceBudgetPlan(current.budgetPlans ?? [], {
          currency: reportingCurrency,
          monthlyLimit,
          rollover: formData.get("rollover") === "on",
          startMonth: currentPlan?.startMonth ?? selectedMonth,
        }),
      };
    });
    setActionNotice(`Đã lưu kế hoạch ngân sách ${reportingCurrency}.`);
  }

  function openNewBudget() {
    setEditingBudgetId("");
    setBudgetCategory("");
    setBudgetCurrency(reportingCurrency);
    setBudgetLimit("");
    setFormError("");
    setBudgetOpen(true);
  }

  function editBudget(budgetId: string) {
    const budget = state.budgets.find((item) => item.id === budgetId);
    if (!budget) return;
    setEditingBudgetId(budget.id);
    setBudgetCategory(budget.categoryId);
    setBudgetCurrency(budget.currency);
    setBudgetLimit(formatFinanceAmountInput(budget.monthlyLimit));
    setFormError("");
    setBudgetOpen(true);
  }

  function closeBudget() {
    setEditingBudgetId("");
    setBudgetCategory("");
    setBudgetLimit("");
    setFormError("");
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
    onChange((current) => ({
      ...current,
      budgets: deleteFinanceBudget(current.budgets, budgetId),
    }));
    setActionNotice("Đã xóa ngân sách. Giao dịch cũ được giữ nguyên.");
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
    setFormError("");
  }

  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) {
      setFormError("Hãy nhập tên nhóm.");
      return;
    }
    const nextCategoryId = categoryId || createFinanceId("category");
    onChange((current) => {
      const existing = current.categories.find(
        (category) => category.id === nextCategoryId,
      );
      const nextCategory: FinanceCategory = {
        id: nextCategoryId,
        name,
        kind: categoryKind,
        color: categoryColor,
        icon: categoryIcon.trim().slice(0, 12) || "•",
        ...(categoryParent ? { parentId: categoryParent } : {}),
        ...(existing?.archived ? { archived: true } : {}),
      };
      return {
        ...current,
        categories: [
          ...current.categories.filter(
            (category) => category.id !== nextCategory.id,
          ),
          nextCategory,
        ],
      };
    });
    setActionNotice(categoryId ? "Đã cập nhật nhóm." : "Đã thêm nhóm mới.");
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
    onChange((current) => {
      const affectedIds = new Set([
        category.id,
        ...(willArchive && !category.parentId
          ? current.categories
              .filter((item) => item.parentId === category.id)
              .map((item) => item.id)
          : []),
      ]);
      return {
        ...current,
        categories: current.categories.map((item) =>
          affectedIds.has(item.id)
            ? { ...item, archived: willArchive || undefined }
            : item,
        ),
      };
    });
    setActionNotice(willArchive ? "Đã ẩn nhóm." : "Đã khôi phục nhóm.");
  }

  function deleteTransaction(id: string) {
    if (!window.confirm("Xóa giao dịch này?")) return;
    onChange((current) => ({
      ...current,
      transactions: current.transactions.filter(
        (transaction) => transaction.id !== id,
      ),
    }));
    setActionNotice("Đã xóa giao dịch và hoàn lại tác động lên số dư.");
  }

  function getTransactionMeta(transaction: FinanceState["transactions"][number]) {
    if (transaction.type === 'prosperity-deposit') {
      return { icon: '♧', name: 'Đầu tư Phát lộc', detail: transaction.note };
    }
    if (transaction.type === 'prosperity-settlement') {
      return { icon: '✓', name: 'Thu hoạch Phát lộc', detail: transaction.note };
    }
    if (transaction.type === "savings-deposit") {
      return { icon: "↗", name: "Gửi tiết kiệm", detail: transaction.note };
    }
    if (transaction.type === "savings-settlement") {
      return { icon: "✓", name: "Tất toán tiết kiệm", detail: transaction.note };
    }
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
    if (
      transaction.type === "savings-deposit" ||
      transaction.type === 'prosperity-deposit'
    ) {
      return `−${formatMoney(transaction.amount, account.currency)}`;
    }
    if (
      transaction.type === "savings-settlement" ||
      transaction.type === 'prosperity-settlement'
    ) {
      return `+${formatMoney(transaction.amount, account.currency)}`;
    }
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
          <span className={styles.kicker}>GIÁ TRỊ TÀI SẢN RÒNG</span>
          <h2>{formatMoney(netWorth.totalInBase, netWorth.baseCurrency)}</h2>
          <p>Tài khoản, tiền mặt và tiết kiệm · quy đổi về {netWorth.baseCurrency}</p>
        </div>
        <button className={styles.primaryAction} type="button" onClick={() => openTransaction()}>
          <span aria-hidden="true">＋</span> Thêm giao dịch
        </button>
      </div>
      {actionNotice && (
        <div className={styles.actionNotice} role="status">
          <span>{actionNotice}</span>
          <button
            type="button"
            onClick={() => setActionNotice("")}
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      )}

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
        <section className={styles.netWorthCard} aria-labelledby="net-worth-title">
          <div className={styles.netWorthHeading}>
            <div><span>TỔNG TÀI SẢN HỢP NHẤT</span><h3 id="net-worth-title">Một con số cho toàn bộ tài sản</h3></div>
            <button type="button" onClick={() => setNetWorthSettingsOpen((current) => !current)}>{netWorthSettingsOpen ? "Đóng cấu hình" : "Cấu hình quy đổi"}</button>
          </div>
          <div className={styles.netWorthGrid}>
            <article><span>Tài khoản & tiền mặt</span><strong>{formatMoney(netWorth.liquidInBase, netWorth.baseCurrency)}</strong><small>{formatMoney(netWorth.accountKrw, "KRW")} · {formatMoney(netWorth.accountVnd, "VND")}</small></article>
            <article><span>Khoản tiết kiệm</span><strong>{formatMoney(netWorth.savingsInBase, netWorth.baseCurrency)}</strong><small>Giá trị hiện tại gồm lãi tích lũy</small></article>
            <article><span>Phát lộc đang ươm</span><strong>{formatMoney(netWorth.prosperityInBase, netWorth.baseCurrency)}</strong><small>Gốc và lãi ròng tạm tính sau thuế</small></article>
            <article><span>Ví chờ tái đầu tư</span><strong>{formatMoney(netWorth.walletInBase, netWorth.baseCurrency)}</strong><small>Tiền dư đang khả dụng</small></article>
            <article className={styles.netWorthTotal}><span>Tài sản ròng</span><strong>{formatMoney(netWorth.totalInBase, netWorth.baseCurrency)}</strong><small>Theo tỷ giá đã lưu</small></article>
          </div>
          {netWorthSettingsOpen && (
            <div className={styles.exchangeSettings}>
              <label>Đồng tiền quy đổi chính<select value={exchangeSettings.baseCurrency} onChange={(event) => onExchangeSettingsChange({ ...exchangeSettings, baseCurrency: event.target.value as FinanceCurrency })}><option value="VND">VND</option><option value="KRW">KRW</option></select></label>
              <label>1 KRW bằng bao nhiêu VND<input type="number" min="0.0001" step="0.0001" value={exchangeSettings.krwToVndRate} onChange={(event) => { const rate = Number(event.target.value); if (rate > 0) onExchangeSettingsChange({ ...exchangeSettings, krwToVndRate: rate, updatedAt: new Date().toISOString() }); }} /></label>
              <label>Nguồn tỷ giá<select value={exchangeSettings.source} onChange={(event) => onExchangeSettingsChange({ ...exchangeSettings, source: event.target.value as ExchangeRateSettings["source"], updatedAt: new Date().toISOString() })}><option value="reference">Tỷ giá tham chiếu</option><option value="actual">Tỷ giá giao dịch thực tế</option></select></label>
              <button type="button" disabled={!latestActualRate} onClick={() => onExchangeSettingsChange({ ...exchangeSettings, krwToVndRate: latestActualRate, source: "actual", updatedAt: new Date().toISOString() })}>Dùng giao dịch quy đổi gần nhất</button>
              <small>{exchangeSettings.updatedAt ? `Cập nhật ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(exchangeSettings.updatedAt))}` : "Tỷ giá khởi tạo — hãy cập nhật theo tỷ giá bạn thực dùng."}</small>
            </div>
          )}
        </section>
      )}

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
                    <b className={transaction.type === "income" || transaction.type === "savings-settlement" || transaction.type === 'prosperity-settlement' ? styles.income : transaction.type === "expense" || transaction.type === "savings-deposit" || transaction.type === 'prosperity-deposit' ? styles.expense : ""}>{getTransactionValue(transaction)}</b>
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
                <option value="all">Tất cả</option><option value="income">Khoản thu</option><option value="expense">Khoản chi</option><option value="transfer">Chuyển khoản</option><option value="savings">Tiết kiệm & Phát lộc</option>
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
                  <b className={transaction.type === "income" || transaction.type === "savings-settlement" || transaction.type === 'prosperity-settlement' ? styles.income : transaction.type === "expense" || transaction.type === "savings-deposit" || transaction.type === 'prosperity-deposit' ? styles.expense : ""}>{getTransactionValue(transaction)}</b>
                  {transaction.type === "savings-deposit" || transaction.type === "savings-settlement" || transaction.type === 'prosperity-deposit' || transaction.type === 'prosperity-settlement' ? (
                    <span className={styles.systemEntry}>Tự động</span>
                  ) : (
                    <div className={styles.rowActions}>
                      <button className={styles.editButton} type="button" onClick={() => editTransaction(transaction)} aria-label={`Sửa giao dịch ${meta.name}`}>✎</button>
                      <button className={styles.deleteButton} type="button" onClick={() => deleteTransaction(transaction.id)} aria-label={`Xóa giao dịch ${meta.name}`}>×</button>
                    </div>
                  )}
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
          <section className={styles.totalBudgetPanel}>
            <form key={`${reportingCurrency}-${budgetPlan?.monthlyLimit ?? 0}-${budgetPlan?.rollover ?? false}`} onSubmit={submitBudgetPlan}>
              <div><span>NGÂN SÁCH TỔNG · {reportingCurrency}</span><strong>{budgetPlan ? formatMoney(budgetPlan.monthlyLimit, reportingCurrency) : "Chưa thiết lập"}</strong></div>
              <label>Giới hạn tháng<input name="monthlyLimit" inputMode="numeric" required defaultValue={budgetPlan ? formatFinanceAmountInput(budgetPlan.monthlyLimit) : ""} placeholder="3.000.000" onInput={(event) => { event.currentTarget.value = formatFinanceAmountInput(event.currentTarget.value); }} /></label>
              <label className={styles.rolloverToggle}><input name="rollover" type="checkbox" defaultChecked={budgetPlan?.rollover ?? true} /> Chuyển phần dư sang tháng sau</label>
              <button type="submit">Lưu kế hoạch</button>
            </form>
            {budgetPlanSnapshot ? (
              <div className={styles.budgetForecastGrid}>
                <article><span>Kế hoạch khả dụng</span><strong>{formatMoney(budgetPlanSnapshot.available, reportingCurrency)}</strong><small>{budgetPlanSnapshot.carryIn > 0 ? `Gồm ${formatMoney(budgetPlanSnapshot.carryIn, reportingCurrency)} chuyển sang` : "Không có phần dư chuyển sang"}</small></article>
                <article><span>Thực tế đã chi</span><strong>{formatMoney(budgetPlanSnapshot.spent, reportingCurrency)}</strong><small>{Math.round((budgetPlanSnapshot.spent / Math.max(1, budgetPlanSnapshot.available)) * 100)}% kế hoạch</small></article>
                <article><span>Còn được chi mỗi ngày</span><strong>{formatMoney(budgetPlanSnapshot.dailyAllowance, reportingCurrency)}</strong><small>{budgetPlanSnapshot.daysRemaining} ngày còn lại</small></article>
                <article className={budgetPlanSnapshot.variance >= 0 ? styles.forecastGood : styles.forecastRisk}><span>Dự báo cuối tháng</span><strong>{formatMoney(budgetPlanSnapshot.forecastExpense, reportingCurrency)}</strong><small>{budgetPlanSnapshot.variance >= 0 ? `Thấp hơn kế hoạch ${formatMoney(budgetPlanSnapshot.variance, reportingCurrency)}` : `Vượt kế hoạch ${formatMoney(Math.abs(budgetPlanSnapshot.variance), reportingCurrency)}`}</small></article>
              </div>
            ) : <p className={styles.totalBudgetEmpty}>Đặt ngân sách tổng để xem số tiền còn được chi mỗi ngày và dự báo cuối tháng.</p>}
          </section>
          {visibleBudgets.length ? <div className={styles.budgetGrid}>
            {visibleBudgets.map((budget) => {
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

      <TransactionDialog
        account={transactionAccount}
        accounts={state.accounts}
        amount={transactionAmount}
        categories={state.categories}
        category={transactionCategory}
        currency={transactionCurrency}
        date={transactionDate}
        destinationAccount={destinationAccount}
        editingId={editingTransactionId}
        effectiveExchangeRate={effectiveExchangeRate}
        formError={formError}
        isCurrencyConversion={Boolean(isCurrencyConversion)}
        note={transactionNote}
        onAccountChange={setTransactionAccount}
        onAmountChange={setTransactionAmount}
        onCategoryChange={setTransactionCategory}
        onClose={() => {
          setTransactionOpen(false);
          setEditingTransactionId("");
          setFormError("");
        }}
        onCurrencyChange={setTransactionCurrency}
        onDateChange={setTransactionDate}
        onManageCategories={(kind) => {
          startCategoryForm(kind);
          setCategoryManagerOpen(true);
        }}
        onNoteChange={setTransactionNote}
        onSubmit={submitTransaction}
        onToAccountChange={setTransactionToAccount}
        onToAmountChange={setTransactionToAmount}
        onTypeChange={setTransactionType}
        open={transactionOpen}
        renderCategoryOptions={renderCategoryOptions}
        sourceAccount={sourceAccount}
        toAccount={transactionToAccount}
        toAmount={transactionToAmount}
        type={transactionType}
      />
      <AccountDialog
        currency={accountCurrency}
        editingId={editingAccountId}
        formError={formError}
        name={accountName}
        onBalanceChange={setAccountOpeningBalance}
        onClose={closeAccount}
        onCurrencyChange={setAccountCurrency}
        onDelete={deleteAccount}
        onNameChange={setAccountName}
        onSubmit={submitAccount}
        onTypeChange={setAccountType}
        openingBalance={accountOpeningBalance}
        open={accountOpen}
        type={accountType}
      />
      <BudgetDialog
        category={budgetCategory}
        categoryOptions={renderCategoryOptions("expense", budgetCategory)}
        currency={budgetCurrency}
        editingId={editingBudgetId}
        formError={formError}
        limit={budgetLimit}
        onCategoryChange={setBudgetCategory}
        onClose={closeBudget}
        onCurrencyChange={setBudgetCurrency}
        onDelete={deleteBudget}
        onLimitChange={setBudgetLimit}
        onSubmit={submitBudget}
        open={budgetOpen}
      />
      <CategoryManagerDialog
        categories={state.categories}
        color={categoryColor}
        editingId={categoryId}
        formError={formError}
        icon={categoryIcon}
        kind={categoryKind}
        name={categoryName}
        onClose={() => {
          setCategoryManagerOpen(false);
          setFormError("");
        }}
        onColorChange={setCategoryColor}
        onIconChange={setCategoryIcon}
        onNameChange={setCategoryName}
        onParentChange={setCategoryParent}
        onShowArchivedChange={setShowArchivedCategories}
        onStartForm={startCategoryForm}
        onSubmit={submitCategory}
        onToggleArchived={toggleCategoryArchived}
        open={categoryManagerOpen}
        parentId={categoryParent}
        showArchived={showArchivedCategories}
      />
    </section>
  );
}
