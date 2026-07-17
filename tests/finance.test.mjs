import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAccountBalance,
  calculateBudgetPlanSnapshot,
  deleteFinanceAccount,
  deleteFinanceBudget,
  formatFinanceAmountInput,
  getFinanceCategoryBreakdown,
  getFinanceMonthDailyTrend,
  getFinanceTransactionsForMonth,
  normalizeFinanceState,
  parseFinanceAmountInput,
  reconcileProsperityFundingTransactions,
  reconcileSavingsFundingTransactions,
  saveFinanceAccount,
  saveFinanceBudget,
  saveFinanceTransaction,
  summarizeFinanceMonth,
} from "../lib/finance.ts";
import {
  calculateFinancialGoalProgress,
  calculateNetWorth,
} from "../lib/planning.ts";
import {
  buildSavingsTrend,
  getSavingsTrendSnapshot,
} from "../lib/savings-trend.ts";

test("amount inputs add Vietnamese thousand separators while keeping numeric value", () => {
  assert.equal(formatFinanceAmountInput("1"), "1");
  assert.equal(formatFinanceAmountInput("1000"), "1.000");
  assert.equal(formatFinanceAmountInput("1000000"), "1.000.000");
  assert.equal(formatFinanceAmountInput("1.000.000"), "1.000.000");
  assert.equal(formatFinanceAmountInput("₩ 1,000,000"), "1.000.000");
  assert.equal(formatFinanceAmountInput(""), "");
  assert.equal(parseFinanceAmountInput("1.000.000"), 1_000_000);
  assert.equal(parseFinanceAmountInput("₩ 1.000.000"), 1_000_000);
});

test("editing a budget replaces its old values without creating a duplicate", () => {
  const budgets = [
    { id: "food-krw", categoryId: "food", currency: "KRW", monthlyLimit: 300_000 },
    { id: "travel-krw", categoryId: "travel", currency: "KRW", monthlyLimit: 500_000 },
  ];
  const edited = {
    ...budgets[0],
    categoryId: "health",
    currency: "VND",
    monthlyLimit: 2_000_000,
  };

  assert.deepEqual(saveFinanceBudget(budgets, edited), [edited, budgets[1]]);
});

test("editing a budget into an existing category and currency keeps only the edited budget", () => {
  const budgets = [
    { id: "food-krw", categoryId: "food", currency: "KRW", monthlyLimit: 300_000 },
    { id: "travel-krw", categoryId: "travel", currency: "KRW", monthlyLimit: 500_000 },
  ];
  const edited = {
    ...budgets[0],
    categoryId: "travel",
    monthlyLimit: 750_000,
  };

  assert.deepEqual(saveFinanceBudget(budgets, edited), [edited]);
});

test("deleting a budget leaves every other budget untouched", () => {
  const budgets = [
    { id: "food-krw", categoryId: "food", currency: "KRW", monthlyLimit: 300_000 },
    { id: "travel-vnd", categoryId: "travel", currency: "VND", monthlyLimit: 5_000_000 },
  ];

  assert.deepEqual(deleteFinanceBudget(budgets, "food-krw"), [budgets[1]]);
  assert.deepEqual(deleteFinanceBudget(budgets, "missing"), budgets);
});

test("editing an account changes its opening balance while keeping transactions", () => {
  const expense = transaction({ amount: 1_500 });
  const editedAccount = {
    ...krwCash,
    name: "Ví sinh hoạt",
    openingBalance: 20_000,
  };
  const accounts = saveFinanceAccount([krwCash, krwBank], editedAccount);

  assert.deepEqual(accounts, [editedAccount, krwBank]);
  assert.equal(calculateAccountBalance(editedAccount, [expense]), 18_500);
});

test("deleting an account removes every linked transaction and restores counterparties", () => {
  const unrelatedExpense = transaction({ id: "unrelated", amount: 500 });
  const state = {
    accounts: [krwCash, krwBank, vndBank],
    categories: [],
    budgets: [
      { id: "food-krw", categoryId: "food", currency: "KRW", monthlyLimit: 300_000 },
    ],
    transactions: [
      unrelatedExpense,
      transaction({ id: "bank-expense", accountId: krwBank.id }),
      transaction({
        id: "bank-to-vnd",
        type: "transfer",
        accountId: krwBank.id,
        toAccountId: vndBank.id,
        toAmount: 18_000,
        categoryId: undefined,
      }),
      transaction({
        id: "cash-to-bank",
        type: "transfer",
        accountId: krwCash.id,
        toAccountId: krwBank.id,
        categoryId: undefined,
      }),
    ],
  };

  const nextState = deleteFinanceAccount(state, krwBank.id);
  assert.deepEqual(nextState.accounts, [krwCash, vndBank]);
  assert.deepEqual(nextState.transactions, [unrelatedExpense]);
  assert.deepEqual(nextState.budgets, state.budgets);
  assert.equal(calculateAccountBalance(krwCash, nextState.transactions), 9_500);
  assert.equal(calculateAccountBalance(vndBank, nextState.transactions), 100_000);
});

test("the final finance account cannot be deleted", () => {
  const state = {
    accounts: [krwCash],
    categories: [],
    budgets: [],
    transactions: [transaction()],
  };

  assert.equal(deleteFinanceAccount(state, krwCash.id), state);
  assert.equal(deleteFinanceAccount(state, "missing"), state);
});

const krwCash = {
  id: "krw-cash",
  name: "Tiền mặt KRW",
  type: "cash",
  currency: "KRW",
  openingBalance: 10_000,
  color: "#27a77b",
  icon: "₩",
};

const krwBank = {
  id: "krw-bank",
  name: "Ngân hàng KRW",
  type: "bank",
  currency: "KRW",
  openingBalance: 5_000,
  color: "#6f4bd8",
  icon: "🏦",
};

const vndBank = {
  id: "vnd-bank",
  name: "Ngân hàng VND",
  type: "bank",
  currency: "VND",
  openingBalance: 100_000,
  color: "#e28b52",
  icon: "🏦",
};

function transaction(overrides = {}) {
  return {
    id: "transaction-1",
    type: "expense",
    amount: 1_000,
    date: "2026-07-15",
    accountId: krwCash.id,
    categoryId: "expense-food",
    note: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

test("editing an income replaces the old amount instead of adding twice", () => {
  const original = transaction({ type: "income", amount: 2_000, categoryId: "income-salary" });
  const edited = { ...original, amount: 500, updatedAt: "2026-07-15T01:00:00.000Z" };
  const transactions = saveFinanceTransaction([original], edited);

  assert.equal(transactions.length, 1);
  assert.equal(calculateAccountBalance(krwCash, transactions), 10_500);
});

test("editing an expense returns the old expense before applying the new one", () => {
  const original = transaction({ amount: 2_000 });
  const edited = { ...original, amount: 500 };
  const transactions = saveFinanceTransaction([original], edited);

  assert.equal(calculateAccountBalance(krwCash, transactions), 9_500);
});

test("moving an expense to another account restores the source account", () => {
  const original = transaction({ amount: 2_000 });
  const edited = { ...original, amount: 500, accountId: krwBank.id };
  const transactions = saveFinanceTransaction([original], edited);

  assert.equal(calculateAccountBalance(krwCash, transactions), 10_000);
  assert.equal(calculateAccountBalance(krwBank, transactions), 4_500);
});

test("changing an expense into income reverses its complete balance effect", () => {
  const original = transaction({ amount: 500 });
  const edited = {
    ...original,
    type: "income",
    categoryId: "income-salary",
  };
  const transactions = saveFinanceTransaction([original], edited);

  assert.equal(calculateAccountBalance(krwCash, transactions), 10_500);
});

test("editing a same-currency transfer recalculates both accounts", () => {
  const original = transaction({
    type: "transfer",
    amount: 2_000,
    categoryId: undefined,
    toAccountId: krwBank.id,
    toAmount: 2_000,
  });
  const edited = { ...original, amount: 500, toAmount: 500 };
  const transactions = saveFinanceTransaction([original], edited);

  assert.equal(calculateAccountBalance(krwCash, transactions), 9_500);
  assert.equal(calculateAccountBalance(krwBank, transactions), 5_500);
});

test("editing KRW to VND conversion uses source and received amounts separately", () => {
  const original = transaction({
    type: "transfer",
    amount: 1_000,
    categoryId: undefined,
    toAccountId: vndBank.id,
    toAmount: 18_000,
  });
  const edited = { ...original, amount: 600, toAmount: 11_000 };
  const transactions = saveFinanceTransaction([original], edited);

  assert.equal(calculateAccountBalance(krwCash, transactions), 9_400);
  assert.equal(calculateAccountBalance(vndBank, transactions), 111_000);
});

test("changing transfer destination restores the old destination", () => {
  const original = transaction({
    type: "transfer",
    amount: 1_000,
    categoryId: undefined,
    toAccountId: vndBank.id,
    toAmount: 18_000,
  });
  const edited = {
    ...original,
    amount: 400,
    toAccountId: krwBank.id,
    toAmount: 400,
  };
  const transactions = saveFinanceTransaction([original], edited);

  assert.equal(calculateAccountBalance(krwCash, transactions), 9_600);
  assert.equal(calculateAccountBalance(vndBank, transactions), 100_000);
  assert.equal(calculateAccountBalance(krwBank, transactions), 5_400);
});

test("moving an expense from KRW to VND restores KRW and charges VND", () => {
  const original = transaction({ amount: 1_000 });
  const edited = {
    ...original,
    amount: 20_000,
    accountId: vndBank.id,
  };
  const transactions = saveFinanceTransaction([original], edited);

  assert.equal(calculateAccountBalance(krwCash, transactions), 10_000);
  assert.equal(calculateAccountBalance(vndBank, transactions), 80_000);
});

test("changing a conversion into expense restores the old destination", () => {
  const original = transaction({
    type: "transfer",
    amount: 1_000,
    categoryId: undefined,
    toAccountId: vndBank.id,
    toAmount: 18_000,
  });
  const edited = transaction({ amount: 500 });
  const transactions = saveFinanceTransaction([original], edited);

  assert.equal(calculateAccountBalance(krwCash, transactions), 9_500);
  assert.equal(calculateAccountBalance(vndBank, transactions), 100_000);
});

test("deleting a transaction restores the account to its opening balance", () => {
  const original = transaction({ amount: 3_000 });
  assert.equal(calculateAccountBalance(krwCash, [original]), 7_000);
  assert.equal(calculateAccountBalance(krwCash, []), 10_000);
});

test("editing the date moves income to the correct monthly report", () => {
  const original = transaction({
    type: "income",
    amount: 2_000,
    date: "2026-06-30",
    categoryId: "income-salary",
  });
  const edited = { ...original, date: "2026-07-01" };
  const transactions = saveFinanceTransaction([original], edited);
  const state = {
    accounts: [krwCash, krwBank, vndBank],
    categories: [],
    transactions,
    budgets: [],
  };

  assert.equal(summarizeFinanceMonth(state, "2026-06", "KRW").income, 0);
  assert.equal(summarizeFinanceMonth(state, "2026-07", "KRW").income, 2_000);
});

test("monthly reports separate currencies and never count transfers as income", () => {
  const state = {
    accounts: [krwCash, krwBank, vndBank],
    categories: [],
    transactions: [
      transaction({
        id: "income-krw",
        type: "income",
        amount: 2_000,
        categoryId: "income-salary",
      }),
      transaction({
        id: "expense-vnd",
        amount: 20_000,
        accountId: vndBank.id,
      }),
      transaction({
        id: "conversion",
        type: "transfer",
        amount: 1_000,
        categoryId: undefined,
        toAccountId: vndBank.id,
        toAmount: 18_000,
      }),
    ],
    budgets: [],
  };

  const krw = summarizeFinanceMonth(state, "2026-07", "KRW");
  const vnd = summarizeFinanceMonth(state, "2026-07", "VND");
  assert.deepEqual(
    { income: krw.income, expense: krw.expense, count: krw.transactionCount },
    { income: 2_000, expense: 0, count: 2 },
  );
  assert.deepEqual(
    { income: vnd.income, expense: vnd.expense, count: vnd.transactionCount },
    { income: 0, expense: 20_000, count: 2 },
  );
  assert.deepEqual(
    getFinanceTransactionsForMonth(state, "2026-07", "KRW").map(
      (item) => item.id,
    ),
    ["income-krw", "conversion"],
  );
  assert.deepEqual(
    getFinanceTransactionsForMonth(state, "2026-07", "VND").map(
      (item) => item.id,
    ),
    ["expense-vnd", "conversion"],
  );
});

test("monthly category reports roll child groups into their parent", () => {
  const categories = [
    { id: "food", name: "Ăn uống", kind: "expense", color: "#f28f61", icon: "🍜" },
    { id: "cafe", parentId: "food", name: "Cafe", kind: "expense", color: "#f28f61", icon: "☕" },
    { id: "salary", name: "Lương", kind: "income", color: "#27a77b", icon: "💵" },
  ];
  const state = {
    accounts: [krwCash, vndBank],
    categories,
    budgets: [],
    transactions: [
      transaction({ id: "coffee", amount: 3_000, categoryId: "cafe" }),
      transaction({ id: "meal", amount: 1_000, categoryId: "food" }),
      transaction({ id: "vnd-meal", amount: 20_000, accountId: vndBank.id, categoryId: "food" }),
      transaction({ id: "salary", type: "income", amount: 8_000, categoryId: "salary" }),
    ],
  };

  const expenses = getFinanceCategoryBreakdown(
    state,
    "2026-07",
    "KRW",
    "expense",
  );
  const income = getFinanceCategoryBreakdown(
    state,
    "2026-07",
    "KRW",
    "income",
  );

  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].category.id, "food");
  assert.equal(expenses[0].amount, 4_000);
  assert.equal(expenses[0].transactionCount, 2);
  assert.equal(expenses[0].percentage, 100);
  assert.equal(income[0].amount, 8_000);
});

test("monthly daily trend is cumulative and excludes transfers and other currencies", () => {
  const state = {
    accounts: [krwCash, krwBank, vndBank],
    categories: [],
    budgets: [],
    transactions: [
      transaction({ id: "income-day-1", type: "income", amount: 5_000, date: "2026-07-01" }),
      transaction({ id: "expense-day-2", amount: 2_000, date: "2026-07-02" }),
      transaction({
        id: "transfer-day-3",
        type: "transfer",
        amount: 1_000,
        date: "2026-07-03",
        categoryId: undefined,
        toAccountId: krwBank.id,
      }),
      transaction({ id: "vnd-day-2", amount: 20_000, date: "2026-07-02", accountId: vndBank.id }),
    ],
  };

  const trend = getFinanceMonthDailyTrend(state, "2026-07", "KRW");

  assert.equal(trend.length, 31);
  assert.deepEqual(
    trend.slice(0, 3).map((item) => [
      item.day,
      item.cumulativeIncome,
      item.cumulativeExpense,
    ]),
    [
      [1, 5_000, 0],
      [2, 5_000, 2_000],
      [3, 5_000, 2_000],
    ],
  );
  assert.deepEqual(getFinanceMonthDailyTrend(state, "invalid", "KRW"), []);
});

test("new transactions are prepended while edits keep the same list position", () => {
  const first = transaction({ id: "first" });
  const second = transaction({ id: "second", amount: 200 });
  const created = transaction({ id: "created", amount: 300 });

  assert.deepEqual(
    saveFinanceTransaction([first, second], created).map((item) => item.id),
    ["created", "first", "second"],
  );
  assert.deepEqual(
    saveFinanceTransaction([first, second], { ...second, amount: 900 }).map(
      (item) => [item.id, item.amount],
    ),
    [["first", 1_000], ["second", 900]],
  );
});

test("legacy transfers receive a destination amount and invalid transfers are removed", () => {
  const baseState = {
    accounts: [krwCash, vndBank],
    categories: [],
    budgets: [],
  };
  const legacy = normalizeFinanceState({
    ...baseState,
    transactions: [
      transaction({
        type: "transfer",
        amount: 1_000,
        categoryId: undefined,
        toAccountId: vndBank.id,
        toAmount: undefined,
      }),
    ],
  });
  assert.equal(legacy.transactions[0].toAmount, 1_000);

  const invalid = normalizeFinanceState({
    ...baseState,
    transactions: [
      transaction({
        type: "transfer",
        toAccountId: krwCash.id,
        categoryId: undefined,
      }),
      transaction({ amount: 0 }),
    ],
  });
  assert.equal(invalid.transactions.length, 0);
});

test("date validation is stable in Korea timezone and rejects impossible dates", () => {
  const normalized = normalizeFinanceState({
    accounts: [krwCash],
    categories: [],
    budgets: [],
    transactions: [
      transaction({ id: "valid", date: "2026-07-15" }),
      transaction({ id: "invalid", date: "2026-02-30" }),
    ],
  });

  assert.deepEqual(normalized.transactions.map((item) => item.id), ["valid"]);
});

test("linked savings movements update account balance without changing income or expense", () => {
  const savingsDeposit = transaction({
    id: "savings-deposit",
    type: "savings-deposit",
    amount: 60_000,
    accountId: vndBank.id,
    categoryId: undefined,
    linkedSavingsId: 101,
  });
  const savingsSettlement = transaction({
    id: "savings-settlement",
    type: "savings-settlement",
    amount: 63_000,
    accountId: vndBank.id,
    categoryId: undefined,
    linkedSavingsId: 101,
  });
  const state = normalizeFinanceState({
    accounts: [vndBank],
    categories: [],
    budgets: [],
    transactions: [savingsDeposit, savingsSettlement],
  });

  assert.equal(state.transactions.length, 2);
  assert.equal(calculateAccountBalance(vndBank, state.transactions), 103_000);
  assert.deepEqual(summarizeFinanceMonth(state, "2026-07", "VND"), {
    currency: "VND",
    income: 0,
    expense: 0,
    net: 0,
    transactionCount: 2,
  });
});

test("linked Phát lộc funding and harvest update the VND account without becoming income or expense", () => {
  const prosperityDeposit = transaction({
    id: "prosperity-funding",
    type: "prosperity-deposit",
    amount: 25_000,
    accountId: vndBank.id,
    categoryId: undefined,
    linkedProsperityId: "prosperity-101",
  });
  const prosperitySettlement = transaction({
    id: "prosperity-settlement",
    type: "prosperity-settlement",
    amount: 26_000,
    accountId: vndBank.id,
    categoryId: undefined,
    linkedProsperityId: "prosperity-101",
  });
  const state = normalizeFinanceState({
    accounts: [vndBank],
    categories: [],
    budgets: [],
    transactions: [prosperityDeposit, prosperitySettlement],
  });

  assert.equal(state.transactions.length, 2);
  assert.equal(state.transactions[0].linkedProsperityId, "prosperity-101");
  assert.equal(state.transactions[1].linkedProsperityId, "prosperity-101");
  assert.equal(calculateAccountBalance(vndBank, state.transactions), 101_000);
  assert.deepEqual(summarizeFinanceMonth(state, "2026-07", "VND"), {
    currency: "VND",
    income: 0,
    expense: 0,
    net: 0,
    transactionCount: 2,
  });
});

test("repairs missing Phát lộc funding and harvest transactions without creating duplicates", () => {
  const state = {
    accounts: [vndBank],
    categories: [],
    transactions: [],
    budgets: [],
    budgetPlans: [],
  };
  const sources = [{
    id: "prosperity-202",
    name: "Phát lộc 12 tuần 4 ngày",
    amount: 25_000,
    startDate: "2026-07-17",
    fundingAccountId: vndBank.id,
    settlementAccountId: vndBank.id,
    status: "harvested",
    harvestedAt: "2026-09-25",
    projectedTotal: 26_000,
  }];

  const repaired = reconcileProsperityFundingTransactions(state, sources);
  assert.equal(repaired.transactions.length, 2);
  assert.equal(repaired.transactions[0].type, "prosperity-deposit");
  assert.equal(repaired.transactions[0].linkedProsperityId, "prosperity-202");
  assert.equal(repaired.transactions[1].type, "prosperity-settlement");
  assert.equal(repaired.transactions[1].linkedProsperityId, "prosperity-202");
  assert.equal(calculateAccountBalance(vndBank, repaired.transactions), 101_000);

  const repairedAgain = reconcileProsperityFundingTransactions(repaired, sources);
  assert.equal(repairedAgain.transactions.length, 2);
});

test("repairs missing deposits for active reinvested savings without creating duplicates", () => {
  const account = {
    ...vndBank,
    openingBalance: 285_480_706,
  };
  const recordedDeposit = transaction({
    id: "recorded-deposits",
    type: "savings-deposit",
    amount: 203_778_844,
    accountId: account.id,
    categoryId: undefined,
    linkedSavingsId: 1,
  });
  const state = {
    accounts: [account],
    categories: [],
    transactions: [recordedDeposit],
    budgets: [],
    budgetPlans: [],
  };
  const sources = [
    { id: 2, name: "2tr won", amount: 36_359_279, startDate: "2026-07-11", fundingAccountId: account.id, status: "active" },
    { id: 3, name: "1.5tr won", amount: 25_414_827, startDate: "2026-07-10", fundingAccountId: account.id, status: "active" },
    { id: 4, name: "Tiền của Linh", amount: 19_927_756, startDate: "2026-07-13", fundingAccountId: account.id, status: "active" },
  ];

  const repaired = reconcileSavingsFundingTransactions(state, sources);
  assert.equal(repaired.transactions.length, 4);
  assert.equal(calculateAccountBalance(account, repaired.transactions), 0);
  assert.deepEqual(
    repaired.transactions.slice(0, 3).map((item) => item.linkedSavingsId),
    [2, 3, 4],
  );

  const repairedAgain = reconcileSavingsFundingTransactions(repaired, sources);
  assert.equal(repairedAgain.transactions.length, 4);
});

test("builds exactly 12 month-end savings trend points ending today", () => {
  const trend = buildSavingsTrend([], "2026-07-16");

  assert.equal(trend.length, 12);
  assert.equal(trend[0].key, "2025-08");
  assert.equal(trend[0].date, "2025-08-31");
  assert.equal(trend[10].date, "2026-06-30");
  assert.equal(trend[11].date, "2026-07-16");
});

test("savings trend follows reinvested cycles without double counting maturity", () => {
  const savings = [{
    amount: 110_000_000,
    interestRate: 6,
    startDate: "2026-03-01",
    maturityDate: "2026-09-01",
    status: "active",
    history: [{
      amount: 100_000_000,
      interestRate: 6,
      startDate: "2026-01-01",
      maturityDate: "2026-03-01",
    }],
  }];

  const beforeReinvestment = getSavingsTrendSnapshot(savings, "2026-02-28");
  const afterReinvestment = getSavingsTrendSnapshot(savings, "2026-03-31");

  assert.equal(beforeReinvestment.activeCount, 1);
  assert.equal(beforeReinvestment.principal, 100_000_000);
  assert.equal(afterReinvestment.activeCount, 1);
  assert.equal(afterReinvestment.principal, 110_000_000);
  assert.ok(afterReinvestment.value > 110_000_000);
});

test("settled savings leave the trend from the settlement date", () => {
  const savings = [{
    amount: 50_000_000,
    interestRate: 7,
    startDate: "2026-01-01",
    maturityDate: "2026-06-01",
    status: "settled",
    settledAt: "2026-06-15",
    history: [],
  }];

  assert.equal(
    getSavingsTrendSnapshot(savings, "2026-06-14").activeCount,
    1,
  );
  assert.deepEqual(
    getSavingsTrendSnapshot(savings, "2026-06-15"),
    { activeCount: 0, interest: 0, principal: 0, value: 0 },
  );
});

test("open-ended savings trend keeps accruing without a maturity date", () => {
  const savings = [{
    amount: 10_000_000,
    interestRate: 6,
    startDate: "2026-07-01",
    maturityDate: "",
    termType: "open-ended",
    status: "active",
    history: [],
  }];

  const july = getSavingsTrendSnapshot(savings, "2026-07-31");
  const nextJuly = getSavingsTrendSnapshot(savings, "2027-07-01");

  assert.equal(july.activeCount, 1);
  assert.equal(july.principal, 10_000_000);
  assert.equal(Math.round(july.interest), 46_849);
  assert.equal(nextJuly.activeCount, 1);
  assert.equal(nextJuly.principal, 10_000_000);
  assert.equal(nextJuly.interest, 570_000);
});


test("net worth converts KRW accounts and combines liquid cash with savings", () => {
  const finance = {
    accounts: [krwCash, vndBank],
    categories: [],
    transactions: [],
    budgets: [],
    budgetPlans: [],
  };
  const snapshot = calculateNetWorth(
    finance,
    200_000,
    50_000,
    { baseCurrency: "VND", krwToVndRate: 20, source: "actual", updatedAt: "" },
    80_000,
  );

  assert.equal(snapshot.liquidInBase, 300_000);
  assert.equal(snapshot.savingsInBase, 200_000);
  assert.equal(snapshot.prosperityInBase, 80_000);
  assert.equal(snapshot.walletInBase, 50_000);
  assert.equal(snapshot.totalInBase, 630_000);
});

test("net worth stays continuous when Phát lộc moves out of and back into an account", () => {
  const settings = {
    baseCurrency: "VND",
    krwToVndRate: 20,
    source: "actual",
    updatedAt: "",
  };
  const initialFinance = {
    accounts: [vndBank],
    categories: [],
    transactions: [],
    budgets: [],
    budgetPlans: [],
  };
  const growingFinance = {
    ...initialFinance,
    transactions: [transaction({
      id: "prosperity-flow-funding",
      type: "prosperity-deposit",
      amount: 25_000,
      accountId: vndBank.id,
      categoryId: undefined,
      linkedProsperityId: "prosperity-flow",
    })],
  };
  const harvestedFinance = {
    ...growingFinance,
    transactions: [
      ...growingFinance.transactions,
      transaction({
        id: "prosperity-flow-settlement",
        type: "prosperity-settlement",
        amount: 26_000,
        accountId: vndBank.id,
        categoryId: undefined,
        linkedProsperityId: "prosperity-flow",
      }),
    ],
  };

  assert.equal(calculateNetWorth(initialFinance, 0, 0, settings).totalInBase, 100_000);
  assert.equal(calculateNetWorth(growingFinance, 0, 0, settings, 26_000).totalInBase, 101_000);
  assert.equal(calculateNetWorth(harvestedFinance, 0, 0, settings).totalInBase, 101_000);
});

test("monthly budget rolls unused money forward and forecasts month end", () => {
  const finance = {
    accounts: [krwCash],
    categories: [],
    budgets: [],
    budgetPlans: [
      { currency: "KRW", monthlyLimit: 1_000, rollover: true, startMonth: "2026-06" },
    ],
    transactions: [
      transaction({ id: "june", date: "2026-06-20", amount: 600 }),
      transaction({ id: "july", date: "2026-07-10", amount: 200 }),
    ],
  };
  const snapshot = calculateBudgetPlanSnapshot(
    finance,
    "2026-07",
    "KRW",
    "2026-07-16",
  );

  assert.equal(snapshot.carryIn, 400);
  assert.equal(snapshot.available, 1_400);
  assert.equal(snapshot.remaining, 1_200);
  assert.equal(snapshot.dailyAllowance, 75);
  assert.equal(snapshot.forecastExpense, 387.5);
});

test("financial goals combine linked accounts, savings and manual progress", () => {
  const finance = {
    accounts: [krwCash],
    categories: [],
    transactions: [],
    budgets: [],
    budgetPlans: [],
  };
  const goal = {
    id: "emergency",
    name: "Quỹ khẩn cấp",
    type: "emergency",
    targetAmount: 500_000,
    currency: "VND",
    linkedAccountIds: [krwCash.id],
    linkedSavingsIds: [101],
    manualAmount: 50_000,
    createdAt: "2026-07-16T00:00:00.000Z",
  };
  const progress = calculateFinancialGoalProgress(
    goal,
    finance,
    [{ id: 101, name: "Tiết kiệm", currentValueVnd: 200_000 }],
    { baseCurrency: "VND", krwToVndRate: 20, source: "actual", updatedAt: "" },
  );

  assert.equal(progress.accountValue, 200_000);
  assert.equal(progress.savingsValue, 200_000);
  assert.equal(progress.currentAmount, 450_000);
  assert.equal(progress.percentage, 90);
  assert.equal(progress.remaining, 50_000);
});
