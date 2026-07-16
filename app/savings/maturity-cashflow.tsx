"use client";

import { useMemo, useState } from "react";
import {
  buildCashflowSchedule,
  type CashflowMonth,
  type CashflowPeriod,
  formatCompactMoney,
  formatCurrency,
  formatDate,
  formatMaturityDistance,
  formatMonthShort,
  formatMonthTitle,
  formatRate,
  getMonthKey,
  type SavingsItem,
} from "@/lib/savings";

export type MaturityAlerts = {
  overdue: SavingsItem[];
  nextSevenDays: SavingsItem[];
  nextThirtyDays: SavingsItem[];
};

export default function MaturityCashflow({
  activeSavings,
  maturityAlerts,
  monthlyInterestTarget,
  today,
}: {
  activeSavings: SavingsItem[];
  maturityAlerts: MaturityAlerts;
  monthlyInterestTarget: number;
  today: string;
}) {
  const [period, setPeriod] = useState<CashflowPeriod>(12);
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(today));
  const months = useMemo(
    () => buildCashflowSchedule(activeSavings, period, today),
    [activeSavings, period, today],
  );
  const summary = useMemo(() => {
    const principal = months.reduce(
      (sum, month) => sum + month.principal,
      0,
    );
    const interest = months.reduce(
      (sum, month) => sum + month.interest,
      0,
    );
    const peakMonth = months.reduce<CashflowMonth | null>(
      (peak, month) => (!peak || month.total > peak.total ? month : peak),
      null,
    );
    return {
      activeMonths: months.filter((month) => month.items.length > 0).length,
      interest,
      peakMonth: peakMonth?.total ? peakMonth : null,
      principal,
      total: principal + interest,
    };
  }, [months]);
  const selected =
    months.find((month) => month.key === selectedMonth) ??
    months.find((month) => month.items.length > 0) ??
    months[0];
  const maxMonthlyCashflow = Math.max(1, ...months.map((month) => month.total));
  const monthsMeetingGoal = monthlyInterestTarget
    ? months.filter((month) => month.interest >= monthlyInterestTarget)
    : [];
  const recommendation = useMemo(() => {
    if (activeSavings.length === 0) {
      return "Khi có khoản gửi, ứng dụng sẽ phân tích mức độ tập trung ngày đáo hạn và đề xuất cách chia kỳ hạn.";
    }
    if (!summary.total || !summary.peakMonth) {
      return `Chưa có khoản nào đáo hạn trong ${period} tháng tới. Hãy kiểm tra các khoản quá hạn hoặc mở rộng khoảng xem.`;
    }
    const concentration = summary.peakMonth.total / summary.total;
    if (concentration >= 0.5) {
      return `${Math.round(concentration * 100)}% dòng tiền đang tập trung vào ${formatMonthTitle(summary.peakMonth.key)}. Khi tái đầu tư, có thể chia số tiền thành các kỳ 3, 6, 9 và 12 tháng để vốn quay về đều hơn.`;
    }
    if (summary.activeMonths <= 2) {
      return `Các khoản đáo hạn đang tập trung trong ${summary.activeMonths} tháng. Chia lần tái đầu tư tiếp theo thành nhiều kỳ hạn sẽ giúp tăng số mốc có thể tiếp cận tiền.`;
    }
    return `Dòng tiền đang được phân bổ trên ${summary.activeMonths} tháng khác nhau. Có thể duy trì nhịp này bằng cách tái đầu tư mỗi khoản vào kỳ hạn phù hợp thay vì gom chung một ngày.`;
  }, [activeSavings.length, period, summary]);

  return (
        <section
          className="cashflow-section"
          aria-labelledby="cashflow-title"
        >
          <div className="section-heading cashflow-section-heading">
            <div>
              <span className="section-kicker">LỊCH DÒNG TIỀN</span>
              <h2 id="cashflow-title">Tiền sẽ về khi nào?</h2>
            </div>
            <div className="section-heading-actions">
              <div
                className="cashflow-period-toggle"
                role="group"
                aria-label="Khoảng thời gian dòng tiền"
              >
                {([12, 24] as CashflowPeriod[]).map((period) => (
                  <button
                    type="button"
                    key={period}
                    className={period === period ? "active" : ""}
                    aria-pressed={period === period}
                    onClick={() => setPeriod(period)}
                  >
                    {period} tháng
                  </button>
                ))}
              </div>
              <span className="step-badge">03</span>
            </div>
          </div>

          <div className="cashflow-overview">
            <article>
              <span>Tổng tiền về trong {period} tháng</span>
              <strong>{formatCurrency(summary.total)}</strong>
              <small>{summary.activeMonths} tháng có đáo hạn</small>
            </article>
            <article>
              <span>Lãi ròng sẽ nhận</span>
              <strong>{formatCurrency(summary.interest)}</strong>
              <small>Đã trừ khấu trừ giả định 5%</small>
            </article>
            <article>
              <span>Tháng dòng tiền lớn nhất</span>
              <strong>
                {summary.peakMonth
                  ? formatMonthTitle(summary.peakMonth.key)
                  : "Chưa có"}
              </strong>
              <small>
                {summary.peakMonth
                  ? formatCurrency(summary.peakMonth.total)
                  : "Thêm khoản gửi để bắt đầu"}
              </small>
            </article>
          </div>

          <div className="maturity-alerts" aria-label="Cảnh báo đáo hạn">
            <article className={maturityAlerts.overdue.length ? "urgent" : ""}>
              <span className="alert-symbol" aria-hidden="true">!</span>
              <div>
                <strong>{maturityAlerts.overdue.length}</strong>
                <span>Đã quá ngày đáo hạn</span>
              </div>
            </article>
            <article className={maturityAlerts.nextSevenDays.length ? "soon" : ""}>
              <span className="alert-symbol" aria-hidden="true">7</span>
              <div>
                <strong>{maturityAlerts.nextSevenDays.length}</strong>
                <span>Đáo hạn trong 7 ngày</span>
              </div>
            </article>
            <article>
              <span className="alert-symbol" aria-hidden="true">30</span>
              <div>
                <strong>{maturityAlerts.nextThirtyDays.length}</strong>
                <span>Đáo hạn từ 8–30 ngày</span>
              </div>
            </article>
          </div>

          <div className="cashflow-chart-card">
            <div className="cashflow-chart-header">
              <div>
                <h3>Dòng tiền đáo hạn theo tháng</h3>
                <p>Chọn một cột để xem từng khoản tạo nên dòng tiền.</p>
              </div>
              <div className="cashflow-legend" aria-label="Chú giải biểu đồ">
                <span><i className="principal-swatch" />Gốc</span>
                <span><i className="interest-swatch" />Lãi ròng</span>
                {monthlyInterestTarget > 0 && (
                  <span><i className="goal-swatch" />Đạt mục tiêu lãi</span>
                )}
              </div>
            </div>

            <div className="cashflow-chart-scroll">
              <div
                className="cashflow-bars"
                style={{
                  gridTemplateColumns: `repeat(${months.length}, minmax(58px, 1fr))`,
                  minWidth: `${months.length * 64}px`,
                }}
                role="group"
                aria-label={`Biểu đồ dòng tiền đáo hạn ${period} tháng, tổng ${formatCurrency(summary.total)}`}
              >
                {months.map((month) => {
                  const isSelected = selected?.key === month.key;
                  const meetsInterestGoal =
                    monthlyInterestTarget > 0 &&
                    month.interest >= monthlyInterestTarget;
                  const principalHeight =
                    (month.principal / maxMonthlyCashflow) * 100;
                  const interestHeight =
                    (month.interest / maxMonthlyCashflow) * 100;
                  return (
                    <button
                      type="button"
                      className={`cashflow-bar${isSelected ? " selected" : ""}${meetsInterestGoal ? " meets-goal" : ""}`}
                      key={month.key}
                      aria-pressed={isSelected}
                      aria-label={`${formatMonthTitle(month.key)}: ${month.items.length} khoản đáo hạn, tổng ${formatCurrency(month.total)}${meetsInterestGoal ? ", lãi đáo hạn đạt mục tiêu tháng" : ""}`}
                      onClick={() => setSelectedMonth(month.key)}
                    >
                      <span className="cashflow-bar-value">
                        {formatCompactMoney(month.total)}
                      </span>
                      <span className="cashflow-bar-stack" aria-hidden="true">
                        <i
                          className="cashflow-interest-bar"
                          style={{ height: `${interestHeight}%` }}
                        />
                        <i
                          className="cashflow-principal-bar"
                          style={{ height: `${principalHeight}%` }}
                        />
                      </span>
                      <span className="cashflow-month-label">
                        {formatMonthShort(month.key)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {monthlyInterestTarget > 0 && (
              <p className="cashflow-goal-note">
                <strong>{monthsMeetingGoal.length} tháng</strong> có
                tổng lãi đáo hạn đạt hoặc vượt mục tiêu{
                " "}
                {formatCurrency(monthlyInterestTarget)}.
              </p>
            )}
          </div>

          <div className="cashflow-detail-grid">
            <div className="cashflow-month-detail">
              <div className="cashflow-detail-header">
                <div>
                  <span>CHI TIẾT THÁNG</span>
                  <h3>
                    {selected
                      ? formatMonthTitle(selected.key)
                      : "Chưa có dữ liệu"}
                  </h3>
                </div>
                <div className="cashflow-detail-meta">
                  <strong>
                    {selected?.items.length ?? 0} khoản đáo hạn
                  </strong>
                  {selected &&
                    monthlyInterestTarget > 0 &&
                    selected.interest >= monthlyInterestTarget && (
                      <span className="cashflow-goal-badge">
                        Lãi đáo hạn đạt mục tiêu
                      </span>
                    )}
                </div>
              </div>

              {selected && selected.items.length > 0 ? (
                <div className="cashflow-detail-list">
                  {selected.items.map((item) => (
                    <article key={item.id}>
                      <div className="cashflow-item-main">
                        <span className="cashflow-item-date">
                          {formatDate(item.maturityDate)}
                        </span>
                        <h4>{item.name}</h4>
                        <p>
                          {formatMaturityDistance(item.maturityDate, today)} ·{
                          " "}
                          {formatRate(item.interestRate)}%/năm
                        </p>
                      </div>
                      <div className="cashflow-item-values">
                        <span>Gốc {formatCurrency(item.amount)}</span>
                        <span>Lãi +{formatCurrency(item.interestAfterTax)}</span>
                        <strong>{formatCurrency(item.totalAmount)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="cashflow-detail-empty">
                  <span aria-hidden="true">○</span>
                  <p>Không có khoản nào đáo hạn trong tháng này.</p>
                </div>
              )}
            </div>

            <aside className="ladder-card" aria-labelledby="ladder-title">
              <div className="ladder-card-heading">
                <span aria-hidden="true">≋</span>
                <div>
                  <span>GỢI Ý PHÂN BỔ</span>
                  <h3 id="ladder-title">Thang đáo hạn</h3>
                </div>
              </div>
              <p>{recommendation}</p>
              <div className="ladder-rungs" aria-label="Ví dụ bốn bậc kỳ hạn">
                {[3, 6, 9, 12].map((term, index) => (
                  <div key={term}>
                    <span>Bậc {index + 1}</span>
                    <strong>{term} tháng</strong>
                  </div>
                ))}
              </div>
              <small>
                Đây là gợi ý tham khảo và không tự thay đổi các khoản gửi.
              </small>
            </aside>
          </div>
        </section>

  );
}
