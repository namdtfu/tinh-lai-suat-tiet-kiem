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
