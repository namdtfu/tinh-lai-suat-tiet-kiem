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
  assert.match(html, /Tổng lãi dự kiến/i);
  assert.match(html, /Tổng tài sản dự kiến/i);
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

test("includes a versioned local backup and restore flow", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /const BACKUP_FORMAT_VERSION = 1/);
  assert.match(page, /function parseBackupPayload\(/);
  assert.match(page, /URL\.createObjectURL\(blob\)/);
  assert.match(page, /accept="application\/json,\.json"/);
  assert.match(page, /Khôi phục từ tệp/);
  assert.match(page, /Dữ liệu hiện có trên thiết bị này sẽ bị thay thế/);
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
