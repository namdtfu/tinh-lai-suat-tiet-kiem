"use client";

import type { FinanceBudget } from "@/lib/finance";
import { formatDate, type SavingsItem } from "@/lib/savings";
import type { MaturityAlerts } from "./maturity-cashflow";

type BudgetAlert = {
  budget: FinanceBudget;
  categoryName: string;
  ratio: number;
  spent: number;
};

export default function ActionCenter({
  budgetAlerts,
  maturityAlerts,
  onOpenFinance,
  onOpenSettlement,
  reminderCount,
  today,
}: {
  budgetAlerts: BudgetAlert[];
  maturityAlerts: MaturityAlerts;
  onOpenFinance: () => void;
  onOpenSettlement: (item: SavingsItem) => void;
  reminderCount: number;
  today: string;
}) {
  return (
        <section className="action-center" aria-labelledby="action-center-title">
          <div className="action-center-heading">
            <div>
              <span className="section-kicker">NHẮC VIỆC</span>
              <h2 id="action-center-title">Việc cần chú ý hôm nay</h2>
            </div>
            <span className={reminderCount ? "reminder-count active" : "reminder-count"}>
              {reminderCount} việc
            </span>
          </div>
          <div className="reminder-summary">
            <article className={maturityAlerts.overdue.length ? "urgent" : ""}>
              <span>Quá ngày đáo hạn</span>
              <strong>{maturityAlerts.overdue.length}</strong>
            </article>
            <article className={maturityAlerts.nextSevenDays.length ? "soon" : ""}>
              <span>Trong 7 ngày</span>
              <strong>{maturityAlerts.nextSevenDays.length}</strong>
            </article>
            <article>
              <span>Trong 8–30 ngày</span>
              <strong>{maturityAlerts.nextThirtyDays.length}</strong>
            </article>
            <article className={budgetAlerts.length ? "budget" : ""}>
              <span>Ngân sách ≥ 80%</span>
              <strong>{budgetAlerts.length}</strong>
            </article>
          </div>
          {reminderCount ? (
            <div className="reminder-list">
              {[...maturityAlerts.overdue, ...maturityAlerts.nextSevenDays].map((item) => {
                const overdue = item.maturityDate < today;
                return (
                  <article key={item.id}>
                    <span className={overdue ? "reminder-icon urgent" : "reminder-icon soon"} aria-hidden="true">
                      {overdue ? "!" : "⌛"}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.bankName ? `${item.bankName} · ` : ""}
                        {overdue ? "Đã quá hạn" : "Đáo hạn"} {formatDate(item.maturityDate)}
                      </small>
                    </div>
                    <button type="button" onClick={() => onOpenSettlement(item)}>
                      Ghi tất toán
                    </button>
                  </article>
                );
              })}
              {budgetAlerts.map((alert) => (
                <article key={alert.budget.id}>
                  <span className="reminder-icon budget" aria-hidden="true">%</span>
                  <div>
                    <strong>{alert.categoryName}</strong>
                    <small>
                      Đã dùng {Math.round(alert.ratio * 100)}% ngân sách {alert.budget.currency}
                    </small>
                  </div>
                  <button type="button" onClick={() => onOpenFinance()}>
                    Xem ngân sách
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="reminder-empty">Không có việc gấp. Các khoản gửi và ngân sách đang trong kế hoạch.</p>
          )}
        </section>

  );
}
