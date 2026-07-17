import assert from "node:assert/strict";
import test from "node:test";

import {
  appendSafetySnapshot,
  createBackupPayload,
  createSafetySnapshot,
  hasMeaningfulAppState,
  normalizeSafetySnapshots,
  parseBackupPayload,
  SAFETY_SNAPSHOT_LIMIT,
} from "../lib/app-state.ts";
import { createDefaultFinanceState } from "../lib/finance.ts";
import { DEFAULT_EXCHANGE_SETTINGS } from "../lib/planning.ts";
import { isNewerCloudUpdate } from "../lib/supabase-rest.ts";

function createCore() {
  return {
    savings: [],
    prosperity: [],
    interestRates: [9, 8.5, 8, 7.5, 7, 6.5, 6],
    cashLedger: [],
    finance: createDefaultFinanceState(),
    goal: {
      monthlyInterest: "",
      interestRate: "",
      monthlyContribution: "",
    },
    exchange: { ...DEFAULT_EXCHANGE_SETTINGS },
    financialGoals: [],
  };
}

test("accepts the first valid realtime database timestamp", () => {
  assert.equal(
    isNewerCloudUpdate("", "2026-07-15T01:00:00.000Z"),
    true,
  );
});

test("only accepts realtime rows newer than the currently applied row", () => {
  const current = "2026-07-15T01:00:00.000Z";

  assert.equal(
    isNewerCloudUpdate(current, "2026-07-15T01:00:00.001Z"),
    true,
  );
  assert.equal(
    isNewerCloudUpdate(current, "2026-07-15T00:59:59.999Z"),
    false,
  );
  assert.equal(isNewerCloudUpdate(current, current), false);
});

test("rejects invalid realtime timestamps", () => {
  assert.equal(isNewerCloudUpdate("", ""), false);
  assert.equal(isNewerCloudUpdate("", "not-a-date"), false);
});

test("full backup payload preserves every application data section", () => {
  const core = createCore();
  core.savings.push({
    id: 1,
    name: "Tích lũy linh hoạt",
    amount: 10_000_000,
    interestRate: 6,
    term: 0,
    termType: "open-ended",
    startDate: "2026-07-01",
    maturityDate: "",
    interest: 0,
    tax: 0,
    interestAfterTax: 0,
    totalAmount: 10_000_000,
    history: [],
    maturityInstruction: "return",
    status: "active",
  });
  core.finance.accounts[0].openingBalance = 1_000_000;
  const payload = createBackupPayload(
    core,
    [],
    "2026-07-17T08:00:00.000Z",
  );
  const parsed = parseBackupPayload(payload);

  assert.ok(parsed);
  assert.equal(parsed.exportedAt, "2026-07-17T08:00:00.000Z");
  assert.equal(parsed.savings.length, 1);
  assert.equal(parsed.savings[0].termType, "open-ended");
  assert.equal(parsed.savings[0].maturityDate, "");
  assert.deepEqual(parsed.prosperity, []);
  assert.deepEqual(parsed.cashLedger, []);
  assert.equal(parsed.finance.accounts[0].openingBalance, 1_000_000);
  assert.deepEqual(parsed.financialGoals, []);
  assert.deepEqual(parsed.versionHistory, []);
});

test("safety snapshots keep meaningful data, deduplicate, and retain seven versions", () => {
  const emptyCore = createCore();
  assert.equal(hasMeaningfulAppState(emptyCore), false);

  const meaningfulCore = createCore();
  meaningfulCore.finance.accounts[0].openingBalance = 1_000_000;
  assert.equal(hasMeaningfulAppState(meaningfulCore), true);

  const first = createSafetySnapshot(
    meaningfulCore,
    "Trước khi đồng bộ",
    "2026-07-17T08:00:00.000Z",
  );
  let snapshots = appendSafetySnapshot([], first);
  snapshots = appendSafetySnapshot(snapshots, {
    ...first,
    id: "duplicate",
  });
  assert.equal(snapshots.length, 1);

  for (let index = 1; index <= 9; index += 1) {
    snapshots = appendSafetySnapshot(
      snapshots,
      createSafetySnapshot(
        {
          ...meaningfulCore,
          goal: { ...meaningfulCore.goal, monthlyInterest: String(index) },
        },
        `Bản sao ${index}`,
        `2026-07-${String(17 + index).padStart(2, "0")}T08:00:00.000Z`,
      ),
    );
  }

  assert.equal(snapshots.length, SAFETY_SNAPSHOT_LIMIT);
  assert.equal(snapshots.at(-1).label, "Bản sao 9");
  assert.equal(
    normalizeSafetySnapshots([...snapshots.slice(0, 6), {}]).length,
    6,
  );
});
