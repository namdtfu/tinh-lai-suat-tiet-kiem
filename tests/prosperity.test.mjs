import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateProsperity,
  calculateProsperityValueOnDate,
  getProsperityProgress,
  normalizeProsperityItem,
} from '../lib/prosperity.ts';
import {
  buildCashflowSchedule,
  calculateAccruedInterest,
  calculateSavings,
} from '../lib/savings.ts';

test('open-ended savings accrues until withdrawal and taxes only interest', () => {
  const calculation = calculateSavings(
    10_000_000,
    6,
    0,
    '2026-07-01',
    'open-ended',
  );
  const item = {
    id: 1,
    name: 'Tích lũy linh hoạt',
    amount: 10_000_000,
    interestRate: 6,
    term: 0,
    termType: 'open-ended',
    startDate: '2026-07-01',
    ...calculation,
    history: [],
    maturityInstruction: 'return',
    status: 'active',
  };

  assert.equal(calculation.maturityDate, '');
  assert.equal(calculation.totalAmount, 10_000_000);

  const afterThirtyDays = calculateAccruedInterest(item, '2026-07-31');
  const afterOneYear = calculateAccruedInterest(item, '2027-07-01');
  assert.equal(afterThirtyDays.elapsedDays, 30);
  assert.equal(afterThirtyDays.interest, 49_315);
  assert.equal(Math.round(afterThirtyDays.tax), 2_466);
  assert.equal(Math.round(afterThirtyDays.interestAfterTax), 46_849);
  assert.equal(afterOneYear.interest, 600_000);
  assert.equal(afterOneYear.tax, 30_000);
  assert.equal(afterOneYear.totalAmount, 10_570_000);
  assert.equal(buildCashflowSchedule([item], 12, '2026-07-31')
    .flatMap((month) => month.items).length, 0);
});

test('Phát lộc accepts 12 weeks 4 days and a two-decimal rate', () => {
  const result = calculateProsperity(
    9_817_800,
    7.69,
    12,
    '2026-07-13',
    4,
  );

  assert.equal(result.days, 88);
  assert.equal(result.harvestDate, '2026-10-09');
  assert.equal(Math.round(result.projectedGrossProfit), 182_025);
  assert.equal(Math.round(result.projectedTax), 9_101);
  assert.equal(Math.round(result.projectedProfit), 172_923);
  assert.equal(Math.round(result.projectedTotal), 9_990_723);
});

test('accrued Phát lộc profit stops at the harvest date', () => {
  const item = normalizeProsperityItem({
    id: 'prosperity-1',
    name: 'Mùa thu tháng 9',
    amount: 10_000_000,
    annualInterestRate: 7.5,
    termWeeks: 8,
    startDate: '2026-07-17',
    status: 'growing',
  });

  assert.ok(item);
  assert.equal(item.termDays, 0);
  const halfway = calculateProsperityValueOnDate(item, '2026-08-14');
  const afterHarvest = calculateProsperityValueOnDate(item, '2027-01-01');
  assert.equal(halfway.elapsedDays, 28);
  assert.equal(Math.round(halfway.accruedGrossProfit), 57_534);
  assert.equal(Math.round(halfway.accruedTax), 2_877);
  assert.equal(Math.round(halfway.accruedProfit), 54_658);
  assert.equal(
    Math.round(afterHarvest.accruedProfit),
    Math.round(item.projectedProfit),
  );
});

test('Phát lộc progress is measured in days but displayed as a weekly term', () => {
  const item = normalizeProsperityItem({
    id: 'prosperity-2',
    amount: 9_817_800,
    annualInterestRate: 7.69,
    fundingAccountId: 'vnd-bank',
    termDays: 4,
    termWeeks: 12,
    startDate: '2026-07-13',
    status: 'growing',
  });

  assert.ok(item);
  assert.equal(item.fundingAccountId, 'vnd-bank');
  const progress = getProsperityProgress(item, '2026-08-26');
  assert.equal(progress.totalDays, 88);
  assert.equal(progress.elapsedDays, 44);
  assert.equal(progress.percentage, 50);
  assert.equal(progress.remainingDays, 44);
});
