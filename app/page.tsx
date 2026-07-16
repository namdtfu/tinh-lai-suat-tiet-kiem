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
import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  MAX_BACKUP_SIZE,
  type AppStateCore,
  type AppVersion,
  type AppWorkspace,
  type AuthStatus,
  type BackupPayload,
  type BackupStatus,
  type CashLedgerEntry,
  type CloudAppState,
  type CloudConflict,
  type CloudSyncStatus,
  createCloudAppState,
  getCoreFromCloudState,
  isRecord,
  normalizeCashLedgerEntry,
  normalizeGoalSettings,
  normalizeVersionHistory,
  parseBackupPayload,
  parseCloudAppState,
} from "@/lib/app-state";
import FinanceManager from "./finance-manager";
import FinancialGoals from "./financial-goals";
import ActionCenter from "./savings/action-center";
import DepositForm, {
  type SavingsFormMode,
} from "./savings/deposit-form";
import BackupPanel from "./savings/backup-panel";
import InterestGoalPlanner from "./savings/interest-goal-planner";
import MaturityCashflow from "./savings/maturity-cashflow";
import SavingsList from "./savings/savings-list";
import SavingsOverview from "./savings/savings-overview";
import SettlementModal, {
  type SettlementDraft,
} from "./savings/settlement-modal";
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
import {
  calculateAccruedInterest,
  calculateCycleValueOnDate,
  calculateInterestGoal,
  calculateInterestToday,
  calculateMonthlyNetRate,
  calculateSavings,
  createEmptySavingsForm,
  formatAmountInput,
  formatCurrency,
  formatRate,
  getMonthKey,
  getTodayIso,
  parseAmount,
  recalculateSavingsItem,
  type SavingsForm,
  type SavingsItem,
  signedDaysBetween,
  toSavingsCycle,
} from "@/lib/savings";

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
  const [form, setForm] = useState<SavingsForm>(createEmptySavingsForm());
  const [newInterestRate, setNewInterestRate] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mode, setMode] = useState<SavingsFormMode>("add");
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
    setForm(createEmptySavingsForm(getTodayIso()));

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
  const vndAccounts = useMemo(
    () => finance.accounts.filter((account) => account.currency === "VND"),
    [finance.accounts],
  );

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
    setForm(createEmptySavingsForm(getTodayIso()));
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

  function prepareItem(item: SavingsItem, nextMode: SavingsFormMode) {
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

        <ActionCenter
          budgetAlerts={budgetAlerts}
          maturityAlerts={maturityAlerts}
          onOpenFinance={() => setActiveWorkspace("finance")}
          onOpenSettlement={openSettlement}
          reminderCount={reminderCount}
          today={today}
        />
        <DepositForm
          accounts={vndAccounts}
          form={form}
          message={message}
          mode={mode}
          newInterestRate={newInterestRate}
          onAddRate={handleAddRate}
          onDeleteRate={handleDeleteRate}
          onFormChange={setForm}
          onMessageChange={setMessage}
          onNewInterestRateChange={setNewInterestRate}
          onOpenFinance={() => setActiveWorkspace("finance")}
          onReset={resetForm}
          onSubmit={handleSubmit}
          onUpdateForm={updateForm}
          sortedRates={sortedRates}
        />
        <SavingsOverview
          cashBalance={cashBalance}
          cashLedger={cashLedger}
          onToggleCashEntryStatus={toggleCashEntryStatus}
          savings={savings}
          summary={summary}
          today={today}
        />
        <MaturityCashflow
          activeSavings={activeSavings}
          maturityAlerts={maturityAlerts}
          monthlyInterestTarget={monthlyInterestTarget}
          today={today}
        />
        <InterestGoalPlanner
          currentMonthlyInterestEstimate={currentMonthlyInterestEstimate}
          currentPortfolio={currentPortfolio}
          effectiveGoalRate={effectiveGoalRate}
          goalContribution={goalContribution}
          goalInterestRate={goalInterestRate}
          goalMonthlyContribution={goalMonthlyContribution}
          goalMonthlyInterest={goalMonthlyInterest}
          goalPlan={goalPlan}
          onGoalInterestRateChange={setGoalInterestRate}
          onGoalMonthlyContributionChange={setGoalMonthlyContribution}
          onGoalMonthlyInterestChange={setGoalMonthlyInterest}
          suggestedGoalRate={suggestedGoalRate}
        />
        <BackupPanel
          backupStatus={backupStatus}
          onDismissStatus={() => setBackupStatus(null)}
          onExport={handleExportBackup}
          onImport={handleImportBackup}
          onRestoreVersion={restoreVersion}
          onUndoLatest={handleUndoLatest}
          ready={ready}
          versionHistory={versionHistory}
        />
        <SavingsList
          accounts={finance.accounts}
          collapsedRates={collapsedRates}
          expandedHistoryId={expandedHistoryId}
          onDelete={handleDelete}
          onFinalizeItemName={finalizeItemName}
          onOpenSettlement={openSettlement}
          onPrepareItem={prepareItem}
          onToggleGroup={toggleGroup}
          onToggleHistory={(id) =>
            setExpandedHistoryId((current) => (current === id ? null : id))
          }
          onUpdateItemName={updateItemName}
          savings={savings}
          today={today}
        />
        {settlingId !== null && (
          <SettlementModal
            accounts={vndAccounts}
            draft={settlementDraft}
            item={savings.find((candidate) => candidate.id === settlingId)}
            onClose={closeSettlement}
            onDraftChange={setSettlementDraft}
            onSubmit={handleSettlement}
          />
        )}
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
