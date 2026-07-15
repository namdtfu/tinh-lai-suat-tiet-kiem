import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAccountBalance,
  formatFinanceAmountInput,
  normalizeFinanceState,
  parseFinanceAmountInput,
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
