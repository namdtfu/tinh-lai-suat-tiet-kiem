import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateProsperity,
  calculateProsperityValueOnDate,
  getProsperityProgress,
  normalizeProsperityItem,
} from '../lib/prosperity.ts';

test('Phát lộc uses simple daily interest over whole weeks', () => {
  const result = calculateProsperity(17_333_712, 8.01, 10, '2026-07-17');

  assert.equal(result.days, 70);
  assert.equal(result.harvestDate, '2026-09-25');
  assert.equal(Math.round(result.projectedProfit), 266_274);
  assert.equal(Math.round(result.projectedTotal), 17_599_986);
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
  const halfway = calculateProsperityValueOnDate(item, '2026-08-14');
  const afterHarvest = calculateProsperityValueOnDate(item, '2027-01-01');
  assert.equal(halfway.elapsedDays, 28);
  assert.equal(Math.round(halfway.accruedProfit), 57_534);
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
    termWeeks: 12,
    startDate: '2026-07-13',
    status: 'growing',
  });

  assert.ok(item);
  const progress = getProsperityProgress(item, '2026-08-24');
  assert.equal(progress.totalDays, 84);
  assert.equal(progress.elapsedDays, 42);
  assert.equal(progress.percentage, 50);
  assert.equal(progress.remainingDays, 42);
});
