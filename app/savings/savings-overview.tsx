"use client";

import {
  formatCurrency,
  formatDate,
  type SavingsItem,
} from "@/lib/savings";
import SavingsTrendChart from "./savings-trend-chart";

type CashLedgerEntryView = {
  id: string;
  amount: number;
  date: string;
  savingsName: string;
  status: "available" | "used";
  usedAt?: string;
};

export type SavingsOverviewSummary = {
  principal: number;
  interest: number;
  assets: number;
  accruedInterest: number;
  accruedTax: number;
  accruedInterestAfterTax: number;
  currentAssets: number;
  todayInterest: number;
  todayTax: number;
  todayInterestAfterTax: number;
};

export default function SavingsOverview({
  cashBalance,
  cashLedger,
  onToggleCashEntryStatus,
  savings,
  summary,
  today,
}: {
  cashBalance: number;
  cashLedger: CashLedgerEntryView[];
  onToggleCashEntryStatus: (id: string) => void;
  savings: SavingsItem[];
  summary: SavingsOverviewSummary;
  today: string;
}) {
  return (
        <section className="summary-section" aria-labelledby="summary-title">
          <div className="section-heading summary-heading">
            <div>
              <span className="section-kicker">TỔNG QUAN</span>
              <h2 id="summary-title">Tài sản hôm nay và dự kiến</h2>
            </div>
            <span className="step-badge">02</span>
          </div>
          <div className="summary-cards">
            <article className="summary-card principal-card">
              <span className="card-icon" aria-hidden="true">↗</span>
              <div>
                <h3>Tổng vốn gửi</h3>
                <p>{formatCurrency(summary.principal)}</p>
              </div>
            </article>
            <article className="summary-card accrued-card">
              <span className="card-icon" aria-hidden="true">≈</span>
              <div>
                <h3>Lãi ròng kỳ hiện tại đến hôm nay</h3>
                <p>+{formatCurrency(summary.accruedInterestAfterTax)}</p>
                <small>
                  Trước khấu trừ: {formatCurrency(summary.accruedInterest)}
                </small>
                <small>
                  Khấu trừ 5%: −{formatCurrency(summary.accruedTax)}
                </small>
              </div>
            </article>
            <article className="summary-card interest-card">
              <span className="card-icon" aria-hidden="true">+</span>
              <div>
                <h3>Tổng lãi dự kiến</h3>
                <p>{formatCurrency(summary.interest)}</p>
                <small>Sau khấu trừ giả định</small>
              </div>
            </article>
            <article className="summary-card assets-card">
              <span className="card-icon" aria-hidden="true">◆</span>
              <div>
                <h3>Tổng tài sản dự kiến</h3>
                <p>{formatCurrency(summary.assets)}</p>
                <small>Vốn + lãi + tiền đang giữ trong ví</small>
                <small>
                  Giá trị đến hôm nay: {formatCurrency(summary.currentAssets)}
                </small>
              </div>
            </article>
          </div>
          <SavingsTrendChart savings={savings} today={today} />
          <article className="today-interest-card">
            <div className="today-interest-heading">
              <span className="today-interest-icon" aria-hidden="true">↟</span>
              <div>
                <span>RIÊNG NGÀY {formatDate(today)}</span>
                <h3>Lãi phát sinh hôm nay</h3>
                <p>
                  Phần tăng thêm so với tổng lãi đã ghi nhận đến hết hôm qua.
                </p>
              </div>
            </div>
            <div className="today-interest-values">
              <div className="today-interest-gross">
                <span>Trước khấu trừ</span>
                <strong>+{formatCurrency(summary.todayInterest)}</strong>
              </div>
              <div>
                <span>Tạm khấu trừ 5%</span>
                <strong>−{formatCurrency(summary.todayTax)}</strong>
              </div>
              <div>
                <span>Lãi ròng hôm nay</span>
                <strong>
                  +{formatCurrency(summary.todayInterestAfterTax)}
                </strong>
              </div>
            </div>
          </article>
          <div className="cash-wallet">
            <div className="wallet-overview">
              <span className="wallet-icon" aria-hidden="true">₫</span>
              <div className="wallet-copy">
                <span>VÍ TIỀN CHƯA TÁI ĐẦU TƯ</span>
                <h3>Phần tiền đáo hạn đang được giữ lại</h3>
                <p>
                  Tiền không đưa vào kỳ mới sẽ nằm ở đây, không bị tính nhầm
                  là vốn đang gửi.
                </p>
              </div>
              <div className="wallet-balance">
                <span>Số dư khả dụng</span>
                <strong>{formatCurrency(cashBalance)}</strong>
                <small>
                  {cashLedger.filter((entry) => entry.status === "available").length}{" "}
                  khoản đang giữ
                </small>
              </div>
            </div>

            {cashLedger.length > 0 ? (
              <details className="wallet-history">
                <summary>
                  <span>Lịch sử ví ({cashLedger.length})</span>
                  <span aria-hidden="true">⌄</span>
                </summary>
                <div className="wallet-entry-list">
                  {[...cashLedger].reverse().map((entry) => (
                    <article
                      className={`wallet-entry ${entry.status}`}
                      key={entry.id}
                    >
                      <div>
                        <strong>{entry.savingsName}</strong>
                        <span>
                          Tách ra khi tái đầu tư ngày {formatDate(entry.date)}
                          {entry.usedAt
                            ? ` · Đã rút ngày ${formatDate(entry.usedAt)}`
                            : ""}
                        </span>
                      </div>
                      <strong>{formatCurrency(entry.amount)}</strong>
                      <button
                        type="button"
                        onClick={() => onToggleCashEntryStatus(entry.id)}
                      >
                        {entry.status === "available"
                          ? "Rút khỏi ví"
                          : "Đưa lại vào ví"}
                      </button>
                    </article>
                  ))}
                </div>
              </details>
            ) : (
              <p className="wallet-empty">
                Chưa có tiền giữ lại. Khi tái đầu tư ít hơn số nhận cuối kỳ,
                phần chênh lệch sẽ tự động xuất hiện tại đây.
              </p>
            )}
          </div>
          <p className="calculation-note">
            Lãi đến hôm nay dùng lãi đơn: gốc × lãi suất năm × số ngày/365 và
            làm tròn xuống từng khoản để khớp app thực tế. Lãi riêng hôm nay là
            phần chênh lệch giữa tổng lãi hôm nay và tổng đến hết hôm qua. Lãi
            dự kiến khi đáo hạn vẫn dùng lãi kép theo ngày. Gốc kỳ hiện tại đã
            bao gồm phần tái đầu tư từ các kỳ trước nên lãi cũ không được cộng
            lại. Mức khấu trừ 5% chỉ mang tính tham khảo.
          </p>
        </section>

  );
}
