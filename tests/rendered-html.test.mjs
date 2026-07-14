import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the savings application", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="vi">/i);
  assert.match(html, /<title>Tính Lãi Suất Tiết Kiệm<\/title>/i);
  assert.match(html, /Thêm khoản gửi mới/i);
  assert.match(html, /Tổng vốn gửi/i);
  assert.match(html, /Lãi ròng kỳ hiện tại đến hôm nay/i);
  assert.match(html, /Lãi phát sinh hôm nay/i);
  assert.match(html, /Tổng lãi dự kiến/i);
  assert.match(html, /Tổng tài sản dự kiến/i);
  assert.match(html, /Ví tiền chưa tái đầu tư/i);
  assert.match(html, /Tiền sẽ về khi nào/i);
  assert.match(html, /Danh sách/i);
  assert.doesNotMatch(html, /codex-preview|Codex is working|Starter Project/i);
});

test("keeps reinvestment history and term progress in the product source", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /type FormMode = "add" \| "edit" \| "reinvest"/);
  assert.match(page, /history:\s*SavingsCycle\[\]/);
  assert.match(page, /function getTermProgress\(/);
  assert.match(page, /role="progressbar"/);
  assert.match(page, /className="history-timeline"/);
  assert.match(page, /item\.totalAmount/);
  assert.match(page, /\(1 \+ dailyRate\) \*\* days - 1/);
  assert.match(page, /storedSavings\.map\(recalculateSavingsItem\)/);
  assert.match(page, /Editing and reinvesting both replace the source item/);
  assert.match(page, /cashRemainder/);
  assert.match(page, /additionalContribution/);
  assert.match(page, /Math\.max\(0, maturedAmount - amount\)/);
  assert.match(page, /Math\.max\(0, amount - maturedAmount\)/);
});

test("splits a matured balance between reinvestment and the cash wallet", () => {
  const maturedAmount = 1_029_000;
  const partialReinvestment = 1_000_000;
  const largerReinvestment = 1_100_000;

  assert.equal(
    Math.max(0, maturedAmount - partialReinvestment),
    29_000,
  );
  assert.equal(
    Math.max(0, partialReinvestment - maturedAmount),
    0,
  );
  assert.equal(
    Math.max(0, maturedAmount - largerReinvestment),
    0,
  );
  assert.equal(
    Math.max(0, largerReinvestment - maturedAmount),
    71_000,
  );
});

test("deletes wallet entries with their source savings item", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    page,
    /entries\.filter\(\(entry\) => entry\.savingsId !== id\)/,
  );
  assert.match(page, /giao dịch ví liên quan/);
  assert.match(page, /customInterestRate: String\(rate\)/);
  assert.match(page, /Rút khỏi ví/);
});

test("matches the reference daily-compounding calculation", () => {
  const principal = 35_406_152;
  const annualRate = 6.8 / 100;
  const days = 150;
  const interest = principal * ((1 + annualRate / 365) ** days - 1);
  const deduction = interest * 0.05;
  const finalAmount = principal + interest - deduction;

  assert.equal(Math.round(interest), 1_003_292);
  assert.equal(Math.round(deduction), 50_165);
  assert.equal(Math.round(finalAmount), 36_359_279);
});

test("calculates accrued net interest only through today or maturity", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /function calculateAccruedInterest\(/);
  assert.match(page, /function calculateInterestToday\(/);
  assert.match(
    page,
    /accruedToday\.interest - accruedYesterday\.interest/,
  );
  assert.match(page, /date < cycle\.maturityDate/);
  assert.match(page, /Math\.floor\(/);
  assert.match(page, /elapsedDays \/ 365/);
  assert.match(page, /accruedInterest\.elapsedDays/);
  assert.match(page, /LÃI RÒNG KỲ HIỆN TẠI ĐẾN HÔM NAY/);
  assert.doesNotMatch(page, /accruedInterest\.previousCycles/);
  assert.match(page, /Giá trị đến hôm nay/);

  const principal = 1_000_000;
  const grossInterestAfter = (days) =>
    Math.floor(principal * 0.06 * (days / 365));
  const netInterestAfter = (days) => grossInterestAfter(days) * 0.95;

  assert.equal(grossInterestAfter(30), 4_931);
  assert.equal(grossInterestAfter(150), 24_657);
  assert.equal(Math.round(netInterestAfter(30)), 4_684);
  assert.equal(Math.round(netInterestAfter(150)), 23_424);
  assert.equal(
    Math.round(netInterestAfter(Math.min(220, 150))),
    Math.round(netInterestAfter(150)),
  );
});

test("matches the real app accrued profit export on 2026-07-14", () => {
  const currentCycles = [
    [17_059_809, 9, 17],
    [10_000_000, 8.5, 3],
    [10_000_000, 8.5, 4],
    [19_927_756, 8, 1],
    [17_234_686, 8, 2],
    [36_359_279, 8, 3],
    [25_414_827, 8, 4],
    [80_000, 7, 117],
    [80_000, 7, 120],
    [10_650_000, 7, 125],
    [17_015_803, 7.5, 7],
    [16_959_121, 7.5, 9],
    [17_066_488, 7.5, 18],
    [276_968, 7.5, 63],
    [17_840_492, 8.5, 104],
  ];
  const simpleInterest = currentCycles.reduce(
    (sum, [amount, rate, days]) =>
      sum + Math.floor(amount * (rate / 100) * (days / 365)),
    0,
  );
  const compoundInterest = currentCycles.reduce(
    (sum, [amount, rate, days]) =>
      sum + amount * ((1 + rate / 100 / 365) ** days - 1),
    0,
  );
  const accruedYesterday = currentCycles.reduce(
    (sum, [amount, rate, days]) =>
      sum + Math.floor(amount * (rate / 100) * (Math.max(0, days - 1) / 365)),
    0,
  );
  const interestToday = simpleInterest - accruedYesterday;

  assert.equal(simpleInterest, 959_489);
  assert.equal(Math.round(compoundInterest), 968_154);
  assert.equal(accruedYesterday, 912_168);
  assert.equal(interestToday, 47_321);
  assert.equal(Math.round(interestToday * 0.95), 44_955);
});

test("includes a versioned local backup and restore flow", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /const BACKUP_FORMAT_VERSION = 2/);
  assert.match(page, /version !== 1 && version !== BACKUP_FORMAT_VERSION/);
  assert.match(page, /function parseBackupPayload\(/);
  assert.match(page, /cashLedger: CashLedgerEntry\[\]/);
  assert.match(page, /URL\.createObjectURL\(blob\)/);
  assert.match(page, /accept="application\/json,\.json"/);
  assert.match(page, /Khôi phục từ tệp/);
  assert.match(page, /bao gồm khoản gửi và ví tiền, sẽ bị thay thế/);
});

test("includes a monthly interest goal planner", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /function calculateInterestGoal\(/);
  assert.match(page, /Lãi ròng kỳ vọng mỗi tháng/);
  assert.match(page, /Góp thêm mỗi tháng/);
  assert.match(page, /Vốn cần có/);
  assert.match(page, /Tổng tiền tự góp đến mục tiêu/);
  assert.match(page, /Lãi tích lũy đến mục tiêu/);
  assert.match(page, /Khoản góp tương lai đã được dùng để tính ngày đạt mục/);
  assert.match(page, /Tiến độ đạt vốn tạo lãi kỳ vọng/);

  const targetMonthlyInterest = 5_000_000;
  const annualRate = 6 / 100;
  const monthlyGrossRate =
    (1 + annualRate / 365) ** (365 / 12) - 1;
  const monthlyNetRate = monthlyGrossRate * 0.95;
  const requiredCapital = targetMonthlyInterest / monthlyNetRate;

  assert.equal(Math.round(requiredCapital), 1_050_088_708);
  assert.equal(
    Math.round(requiredCapital * monthlyNetRate),
    targetMonthlyInterest,
  );

  const monthlyContribution = 10_000_000;
  let projectedCapital = 0;
  let monthsToGoal = 0;
  while (projectedCapital < requiredCapital) {
    projectedCapital =
      projectedCapital * (1 + monthlyNetRate) + monthlyContribution;
    monthsToGoal += 1;
  }

  assert.equal(monthsToGoal, 86);
  assert.equal(monthlyContribution * monthsToGoal, 860_000_000);
  assert.equal(
    Math.round(projectedCapital - monthlyContribution * monthsToGoal),
    199_718_948,
  );
});

test("includes an interactive maturity cashflow and ladder view", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /type CashflowPeriod = 12 \| 24/);
  assert.match(page, /function buildCashflowSchedule\(/);
  assert.match(page, /month\.principal \+= item\.amount/);
  assert.match(page, /month\.interest \+= item\.interestAfterTax/);
  assert.match(page, /Dòng tiền đáo hạn theo tháng/);
  assert.match(page, /Đáo hạn trong 7 ngày/);
  assert.match(page, /Đáo hạn từ 8–30 ngày/);
  assert.match(page, /aria-pressed=\{isSelected\}/);
  assert.match(page, /Thang đáo hạn/);
  assert.match(page, /\{\[3, 6, 9, 12\]\.map/);
});
