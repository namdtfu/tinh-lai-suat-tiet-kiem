import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAccountBalance,
  deleteFinanceAccount,
  deleteFinanceBudget,
  formatFinanceAmountInput,
  getFinanceCategoryBreakdown,
  getFinanceMonthDailyTrend,
  normalizeFinanceState,
  parseFinanceAmountInput,
  saveFinanceAccount,
  saveFinanceBudget,
  saveFinanceTransaction,
  summarizeFinanceMonth,
} from "../lib/finance.ts";

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
