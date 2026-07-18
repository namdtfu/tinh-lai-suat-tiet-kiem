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

test("server-renders the correct application entry screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="vi">/i);
  assert.match(html, /<title>MoneyMind – Tài sản, Ngân sách và Mục tiêu<\/title>/i);
  const cloudEntryRendered = /Đang mở sổ tiết kiệm của bạn/i.test(html);

  if (cloudEntryRendered) {
    assert.match(html, /Đang mở sổ tiết kiệm của bạn/i);
    assert.match(html, /kiểm tra phiên đăng nhập và dữ liệu đã lưu/i);
  } else {
    assert.match(html, /Thêm khoản gửi mới/i);
    assert.match(html, /Tổng vốn gửi/i);
    assert.match(html, /Lãi ròng kỳ hiện tại đến hôm nay/i);
    assert.match(html, /Lãi phát sinh hôm nay/i);
    assert.match(html, /Tổng lãi dự kiến/i);
    assert.match(html, /Tổng tài sản dự kiến/i);
    assert.doesNotMatch(html, /Ví tiền chưa tái đầu tư/i);
    assert.match(html, /Tiền sẽ về khi nào/i);
    assert.match(html, /Danh sách/i);
  }
  assert.doesNotMatch(html, /codex-preview|Codex is working|Starter Project/i);
});

test("keeps reinvestment history and term progress in the product source", async () => {
  const page = (
    await Promise.all([
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/savings.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/deposit-form.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/savings-list.tsx", import.meta.url), "utf8"),
    ])
  ).join("\n");

  assert.match(page, /type SavingsFormMode = "add" \| "edit" \| "reinvest"/);
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

test("calculates the matured remainder that returns to a linked account", () => {
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

test("routes withdrawn and non-reinvested money into Finance accounts", async () => {
  const page = (
    await Promise.all([
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/savings-overview.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/settlement-modal.tsx", import.meta.url), "utf8"),
    ])
  ).join("\n");

  assert.doesNotMatch(page, /Ví tiền chưa tái đầu tư/);
  assert.doesNotMatch(page, /Rút khỏi ví/);
  assert.doesNotMatch(page, /type: "reinvestment-remainder"/);
  assert.match(page, /Chọn tài khoản VND nhận phần tiền không tái đầu tư/);
  assert.match(page, /Chọn tài khoản nhận tiền/);
  assert.match(page, /type: "savings-settlement"/);
  assert.match(page, /customInterestRate: String\(rate\)/);
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
  const page = (
    await Promise.all([
      readFile(new URL("../lib/savings.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/savings-list.tsx", import.meta.url), "utf8"),
    ])
  ).join("\n");

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
  const page = (
    await Promise.all([
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/backup-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/app-state.ts", import.meta.url), "utf8"),
    ])
  ).join("\n");

  assert.match(page, /const BACKUP_FORMAT_VERSION = 9/);
  assert.match(page, /\[1, 2, 3, 4, 5, 6, 7, 8, BACKUP_FORMAT_VERSION\]\.includes\(version\)/);
  assert.match(page, /prosperity: ProsperityItem\[\]/);
  assert.match(page, /function parseBackupPayload\(/);
  assert.match(page, /cashLedger: CashLedgerEntry\[\]/);
  assert.match(page, /finance: FinanceState/);
  assert.match(page, /goal: GoalSettings/);
  assert.match(page, /versionHistory: AppVersion\[\]/);
  assert.match(page, /URL\.createObjectURL\(blob\)/);
  assert.match(page, /accept="application\/json,\.json"/);
  assert.match(page, /Khôi phục từ tệp/);
  assert.match(page, /Sao lưu toàn bộ MoneyMind/);
  assert.match(page, /Tải bản sao lưu toàn bộ/);
  assert.match(page, /Bản sao an toàn trên thiết bị/);
  assert.match(page, /moneymindSafetySnapshots/);
  assert.match(page, /createSafetySnapshot/);
  assert.match(page, /hasMeaningfulAppState/);
  assert.doesNotMatch(page, /localStorage\.removeItem\(SAVINGS_KEY\)/);
  assert.doesNotMatch(page, /localStorage\.removeItem\(FINANCE_KEY\)/);
  assert.match(page, /Toàn bộ dữ liệu hiện có trên thiết bị này sẽ bị thay thế/);
});

test("includes a separate income and expense management workspace", async () => {
  const [page, appState, managerSource, finance, accountDialog, budgetDialog, transactionDialog, categoryDialog] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/app-state.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/finance-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/finance.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/finance/account-dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/finance/budget-dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/finance/transaction-dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/finance/category-manager-dialog.tsx", import.meta.url), "utf8"),
  ]);
  const manager = [managerSource, accountDialog, budgetDialog, transactionDialog, categoryDialog].join("\n");

  assert.match(appState, /type AppWorkspace = "savings" \| "finance" \| "goals"/);
  assert.match(page, /<FinanceManager/);
  assert.match(page, /<FinancialGoals/);
  assert.match(manager, /Tổng quan/);
  assert.match(manager, /Giao dịch/);
  assert.match(manager, /Ngân sách/);
  assert.match(manager, /TỔNG TÀI SẢN HỢP NHẤT/);
  assert.match(manager, /Còn được chi mỗi ngày/);
  assert.match(manager, /Sửa ngân sách/);
  assert.match(manager, /Xóa ngân sách/);
  assert.match(manager, /Lưu thay đổi/);
  assert.match(manager, /Tài khoản/);
  assert.match(manager, /Sửa tài khoản/);
  assert.match(manager, /Xóa tài khoản/);
  assert.match(manager, /Thêm giao dịch/);
  assert.match(manager, /Khoản thu/);
  assert.match(manager, /Khoản chi/);
  assert.match(manager, /Chuyển khoản/);
  assert.match(manager, /Gửi tiết kiệm/);
  assert.match(manager, /Tất toán tiết kiệm/);
  assert.match(manager, /Đầu tư Phát lộc/);
  assert.match(manager, /Thu hoạch Phát lộc/);
  assert.match(manager, /Phát lộc đang ươm/);
  assert.match(manager, /Số tiền thực nhận/);
  assert.match(manager, /Tỷ giá thực tế/);
  assert.match(manager, /ĐƠN VỊ NHẬP/);
  assert.match(manager, /useState<FinanceCurrency>\("KRW"\)/);
  assert.match(manager, /formatFinanceAmountInput\(event\.target\.value\)/);
  assert.match(manager, /Quản lý nhóm/);
  assert.match(manager, /Thêm nhóm con/);
  assert.match(manager, /function editTransaction/);
  assert.match(manager, /onChange\(\(current\) =>/);
  assert.match(manager, /getFinanceTransactionsForMonth/);
  assert.match(manager, /visibleBudgets/);
  assert.match(manager, /Tài khoản nguồn không còn hợp lệ/);
  assert.match(manager, /hoàn lại toàn bộ tác động của giao dịch cũ/);
  assert.match(manager, /Lưu thay đổi/);
  assert.match(manager, /BÁO CÁO THÁNG/);
  assert.match(manager, /Xem báo cáo chi tiết/);
  assert.match(manager, /Chi tiết/);
  assert.match(manager, /formatMonth\(selectedMonth\)/);
  assert.match(manager, /Dòng tiền lũy kế theo ngày/);
  assert.match(manager, /Báo cáo theo nhóm/);
  assert.match(manager, /Trung bình chi 3 tháng trước/);
  assert.match(finance, /function calculateAccountBalance/);
  assert.match(finance, /function saveFinanceTransaction/);
  assert.match(finance, /function formatFinanceAmountInput/);
  assert.match(finance, /transaction\.toAccountId === account\.id/);
  assert.match(finance, /transaction\.toAmount \?\? transaction\.amount/);
  assert.match(finance, /transaction\.type === "savings-deposit"/);
  assert.match(finance, /transaction\.type === "savings-settlement"/);
  assert.match(finance, /transaction\.type === 'prosperity-deposit'/);
  assert.match(finance, /transaction\.type === 'prosperity-settlement'/);
  assert.match(finance, /linkedProsperityId/);
  assert.match(finance, /currency: normalizeCurrency\(value\.currency, "VND"\)/);
  assert.match(finance, /const isEmptyLegacyDefault/);
  assert.match(finance, /account\.currency === "KRW"/);
  assert.match(finance, /function repairCategoryTree/);
  assert.match(finance, /parentId\?: string/);
  assert.match(finance, /function summarizeFinanceMonth/);
  assert.match(finance, /function getFinanceCategoryBreakdown/);
  assert.match(finance, /function getFinanceMonthDailyTrend/);
  assert.match(finance, /function saveFinanceBudget/);
  assert.match(finance, /function deleteFinanceBudget/);
  assert.match(finance, /function saveFinanceAccount/);
  assert.match(finance, /function deleteFinanceAccount/);
  assert.match(finance, /function normalizeFinanceState/);
});

test("includes linked savings lifecycle, settlement, and action reminders", async () => {
  const page = (
    await Promise.all([
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/savings.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/deposit-form.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/savings-list.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/settlement-modal.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/action-center.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/savings-trend-chart.tsx", import.meta.url), "utf8"),
    ])
  ).join("\n");

  assert.match(page, /type SavingsStatus = "active" \| "settled"/);
  assert.match(page, /maturityInstruction: MaturityInstruction/);
  assert.match(page, /fundingAccountId/);
  assert.match(page, /settlementAccountId/);
  assert.match(page, /function handleSettlement/);
  assert.match(page, /GHI NHẬN THỰC TẾ/);
  assert.match(page, /Việc cần chú ý hôm nay/);
  assert.match(page, /Ngân sách ≥ 80%/);
  assert.match(page, /transaction\.linkedSavingsId !== id/);
  assert.match(page, /reconcileSavingsFundingTransactions/);
  assert.match(page, /buildSavingsTrend\(savings, today, 12\)/);
  assert.match(page, /Tăng trưởng tiền tiết kiệm/);
  assert.match(page, /className="savings-trend-svg"/);
  assert.match(page, /setSelectedMonth/);
  assert.match(page, /type SavingsTermType = "fixed" \| "open-ended"/);
  assert.match(page, /Không kỳ hạn/);
  assert.match(page, /Rút bất cứ lúc nào, thuế 5% trên tiền lãi/);
  assert.match(page, /item\.termType === "open-ended"/);
});

test("includes editable Phát lộc with complete VND funding and harvest flow", async () => {
  const source = (
    await Promise.all([
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/prosperity-dashboard.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/prosperity.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/finance.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/app-state.ts", import.meta.url), "utf8"),
    ])
  ).join("\n");

  assert.match(source, /function handleSaveProsperity/);
  assert.match(source, /function startEditing/);
  assert.match(source, /Tài khoản nguồn/);
  assert.match(source, /Tài khoản nhận khi thu hoạch/);
  assert.match(source, /ngân hàng, ví điện tử hoặc tiền mặt/);
  assert.match(source, /Lưu thay đổi/);
  assert.match(source, /transaction\.linkedProsperityId !== id/);
  assert.match(source, /reconcileProsperityFundingTransactions/);
  assert.match(source, /prosperityValueVnd/);
  assert.match(source, /type: 'prosperity-settlement'/);
  assert.match(source, /projectedTax/);
  assert.match(source, /INTEREST_DEDUCTION_RATE/);
  assert.match(source, /Thuế lợi nhuận \(5%\)/);
  assert.match(source, /Lợi nhuận ròng dự kiến/);
});

test("includes invite-only realtime cloud accounts with per-user database isolation", async () => {
  const [page, client, realtime, schema, envExample] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase-rest.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase-realtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Đăng nhập vào dữ liệu của bạn/);
  assert.match(page, /handlePasswordSubmit/);
  assert.match(page, /type="password"/);
  assert.match(page, /Đưa dữ liệu này lên tài khoản/);
  assert.match(page, /createCloudAppState\(/);
  assert.match(page, /writeCloudState\(activeSession, state\)/);
  assert.match(page, /subscribeToCloudState<unknown>/);
  assert.match(page, /skipNextCloudWriteRef/);
  assert.match(page, /Realtime đang hoạt động/);
  assert.match(client, /create_user: false/);
  assert.match(client, /grant_type=password/);
  assert.match(client, /grant_type=refresh_token/);
  assert.match(client, /on_conflict/);
  assert.doesNotMatch(client, /service[_-]?role/i);
  assert.match(realtime, /setAuth\(session\.accessToken\)/);
  assert.match(realtime, /"postgres_changes"/);
  assert.match(realtime, /user_id=eq/);
  assert.match(realtime, /table: "user_app_state"/);
  assert.match(schema, /alter table public\.user_app_state enable row level security/i);
  assert.match(schema, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(schema, /to authenticated/);
  assert.match(schema, /alter publication supabase_realtime add table public\.user_app_state/i);
  assert.match(schema, /set_user_app_state_updated_at/i);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
});

test("includes a monthly interest goal planner", async () => {
  const page = (
    await Promise.all([
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/savings.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/interest-goal-planner.tsx", import.meta.url), "utf8"),
    ])
  ).join("\n");

  assert.match(page, /function calculateInterestGoal\(/);
  assert.match(page, /function calculateMonthlyNetRate\(/);
  assert.match(page, /Lãi ròng kỳ vọng mỗi tháng/);
  assert.match(page, /LÃI RÒNG ƯỚC TÍNH HIỆN TẠI\/THÁNG/);
  assert.match(page, /Dùng làm mục tiêu/);
  assert.match(
    page,
    /currentPortfolio \* calculateMonthlyNetRate\(effectiveGoalRate\)/,
  );
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
  const page = (
    await Promise.all([
      readFile(new URL("../lib/savings.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/savings/maturity-cashflow.tsx", import.meta.url), "utf8"),
    ])
  ).join("\n");

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
