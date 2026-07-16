"use client";

import { useMemo } from "react";
import type { FinanceAccount } from "@/lib/finance";
import {
  calculateAccruedInterest,
  calculateInterestToday,
  formatCurrency,
  formatDate,
  formatRate,
  getTermProgress,
  type SavingsCycle,
  type SavingsItem,
} from "@/lib/savings";
import type { SavingsFormMode } from "./deposit-form";

export default function SavingsList({
  accounts,
  collapsedRates,
  expandedHistoryId,
  onDelete,
  onFinalizeItemName,
  onOpenSettlement,
  onPrepareItem,
  onToggleGroup,
  onToggleHistory,
  onUpdateItemName,
  savings,
  today,
}: {
  accounts: FinanceAccount[];
  collapsedRates: Set<number>;
  expandedHistoryId: number | null;
  onDelete: (id: number) => void;
  onFinalizeItemName: (id: number, name: string) => void;
  onOpenSettlement: (item: SavingsItem) => void;
  onPrepareItem: (item: SavingsItem, mode: SavingsFormMode) => void;
  onToggleGroup: (rate: number) => void;
  onToggleHistory: (id: number) => void;
  onUpdateItemName: (id: number, name: string) => void;
  savings: SavingsItem[];
  today: string;
}) {
  const activeSavings = useMemo(
    () => savings.filter((item) => item.status !== "settled"),
    [savings],
  );
  const settledSavingsCount = savings.length - activeSavings.length;
  const groupedSavings = useMemo(() => {
    const groups = new Map<number, SavingsItem[]>();
    savings.forEach((item) => {
      const group = groups.get(item.interestRate) ?? [];
      group.push(item);
      groups.set(item.interestRate, group);
    });
    return [...groups.entries()].sort(([rateA], [rateB]) => rateB - rateA);
  }, [savings]);

  return (
        <section className="list-section" aria-labelledby="list-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">DANH SÁCH</span>
              <h2 id="list-title">Các khoản gửi của bạn</h2>
            </div>
            <span className="deposit-count">
              {activeSavings.length} đang gửi
              {settledSavingsCount ? ` · ${settledSavingsCount} đã tất toán` : ""}
            </span>
          </div>

          {savings.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">₫</span>
              <h3>Chưa có khoản gửi nào</h3>
              <p>Thêm khoản gửi đầu tiên để xem lãi và ngày đáo hạn dự kiến.</p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  document
                    .getElementById("deposit-form")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Bắt đầu ngay
              </button>
            </div>
          ) : (
            <div className="savings-list">
              {groupedSavings.map(([rate, items]) => {
                const isCollapsed = collapsedRates.has(rate);
                const activeGroupItems = items.filter(
                  (item) => item.status !== "settled",
                );
                const groupPrincipal = activeGroupItems.reduce(
                  (sum, item) => sum + item.amount,
                  0,
                );
                const groupInterest = activeGroupItems.reduce(
                  (sum, item) => sum + item.interestAfterTax,
                  0,
                );
                const groupAccruedInterest = activeGroupItems.reduce(
                  (sum, item) =>
                    sum +
                    calculateAccruedInterest(item, today).interestAfterTax,
                  0,
                );

                return (
                  <article className="savings-group" key={rate}>
                    <div className="group-header">
                      <div className="group-title">
                        <span className="rate-orb" aria-hidden="true">%</span>
                        <div>
                          <h3>Lãi suất {formatRate(rate)}%/năm</h3>
                          <p>
                            {activeGroupItems.length} đang gửi
                            {items.length > activeGroupItems.length
                              ? ` · ${items.length - activeGroupItems.length} đã tất toán`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="group-summary">
                        <div>
                          <span>Lãi kỳ hiện tại đến hôm nay</span>
                          <strong>
                            +{formatCurrency(groupAccruedInterest)}
                          </strong>
                        </div>
                        <div>
                          <span>Tổng nhận dự kiến</span>
                          <strong>
                            {formatCurrency(groupPrincipal + groupInterest)}
                          </strong>
                        </div>
                        <button
                          type="button"
                          className="btn-toggle"
                          onClick={() => onToggleGroup(rate)}
                          aria-expanded={!isCollapsed}
                          aria-label={
                            isCollapsed ? "Mở nhóm khoản gửi" : "Thu gọn nhóm"
                          }
                        >
                          {isCollapsed ? "+" : "−"}
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="group-items">
                        {items.map((item) => {
                          const history = item.history ?? [];
                          const cycles: SavingsCycle[] = [...history, item];
                          const isSettled = item.status === "settled";
                          const isHistoryExpanded =
                            expandedHistoryId === item.id;
                          const progress = getTermProgress(
                            item.startDate,
                            item.maturityDate,
                          );
                          const accruedInterest = calculateAccruedInterest(
                            item,
                            today,
                          );
                          const todayInterest = calculateInterestToday(
                            item,
                            today,
                          );
                          const fundingAccount = accounts.find(
                            (account) => account.id === item.fundingAccountId,
                          );
                          const settlementAccount = accounts.find(
                            (account) => account.id === item.settlementAccountId,
                          );

                          return (
                          <div className="savings-item" key={item.id}>
                            <div className="savings-item-header">
                              <div className="item-name-section">
                                <label htmlFor={`name-${item.id}`}>
                                  Tên khoản gửi
                                </label>
                                <input
                                  id={`name-${item.id}`}
                                  type="text"
                                  className="item-name-input"
                                  value={item.name}
                                  onChange={(event) =>
                                    onUpdateItemName(item.id, event.target.value)
                                  }
                                  onBlur={(event) =>
                                    onFinalizeItemName(
                                      item.id,
                                      event.target.value,
                                    )
                                  }
                                />
                                <div className="item-status-line">
                                  <span className={isSettled ? "status-badge settled" : item.maturityDate <= today ? "status-badge matured" : "status-badge active"}>
                                    {isSettled
                                      ? "Đã tất toán"
                                      : item.maturityDate <= today
                                        ? "Đã đáo hạn"
                                        : "Đang gửi"}
                                  </span>
                                  {item.bankName && <small>{item.bankName}</small>}
                                </div>
                              </div>
                              <div className="item-amount">
                                <span>Vốn gửi</span>
                                <strong>{formatCurrency(item.amount)}</strong>
                              </div>
                              <div className="item-actions">
                                {!isSettled && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-settle"
                                      onClick={() => onOpenSettlement(item)}
                                    >
                                      ✓ Tất toán
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-reinvest"
                                      onClick={() => onPrepareItem(item, "reinvest")}
                                    >
                                      ↻ Tái đầu tư
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-edit"
                                      onClick={() => onPrepareItem(item, "edit")}
                                    >
                                      Sửa
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="btn-delete"
                                  onClick={() => onDelete(item.id)}
                                >
                                  Xóa
                                </button>
                              </div>
                            </div>
                            {isSettled ? (
                              <div className="settled-result-strip">
                                <div>
                                  <span>THỰC NHẬN KHI TẤT TOÁN</span>
                                  <strong>{formatCurrency(item.actualSettlementAmount ?? item.totalAmount)}</strong>
                                  <small>
                                    {item.settledAt ? `Ngày ${formatDate(item.settledAt)}` : "Đã ghi nhận tất toán"}
                                  </small>
                                </div>
                                <div>
                                  <span>Lãi thực nhận</span>
                                  <strong>
                                    +{formatCurrency(Math.max(0, (item.actualSettlementAmount ?? item.totalAmount) - item.amount))}
                                  </strong>
                                  <small>{settlementAccount?.name ?? "Không liên kết tài khoản nhận"}</small>
                                </div>
                              </div>
                            ) : (
                            <div className="accrued-interest-strip">
                              <div className="accrued-interest-main">
                                <span>LÃI RÒNG KỲ HIỆN TẠI ĐẾN HÔM NAY</span>
                                <strong>
                                  +
                                  {formatCurrency(
                                    accruedInterest.interestAfterTax,
                                  )}
                                </strong>
                                <small>
                                  Sau {accruedInterest.elapsedDays} ngày sinh lãi
                                </small>
                              </div>
                              <div className="accrued-interest-breakdown">
                                <span className="today-item-interest">
                                  <small>Lãi riêng hôm nay</small>
                                  <strong>
                                    +{formatCurrency(todayInterest.interest)}
                                  </strong>
                                </span>
                                <span>
                                  <small>Lãi trước khấu trừ</small>
                                  <strong>
                                    {formatCurrency(accruedInterest.interest)}
                                  </strong>
                                </span>
                                <span>
                                  <small>Khấu trừ 5%</small>
                                  <strong className="accrued-tax">
                                    −{formatCurrency(accruedInterest.tax)}
                                  </strong>
                                </span>
                                <span>
                                  <small>Giá trị đến hôm nay</small>
                                  <strong>
                                    {formatCurrency(accruedInterest.totalAmount)}
                                  </strong>
                                </span>
                              </div>
                            </div>
                            )}
                            <div className="savings-details">
                              <div className="detail-item">
                                <span>Kỳ hạn</span>
                                <strong>{item.term} tháng</strong>
                              </div>
                              <div className="detail-item">
                                <span>Ngày gửi</span>
                                <strong>{formatDate(item.startDate)}</strong>
                              </div>
                              <div className="detail-item">
                                <span>Ngày đáo hạn</span>
                                <strong>{formatDate(item.maturityDate)}</strong>
                              </div>
                              <div className="detail-item">
                                <span>Lãi trước khấu trừ</span>
                                <strong>{formatCurrency(item.interest)}</strong>
                              </div>
                              <div className="detail-item tax-detail">
                                <span>Khấu trừ (5%)</span>
                                <strong>−{formatCurrency(item.tax)}</strong>
                              </div>
                              <div className="detail-item positive-detail">
                                <span>Lãi ròng</span>
                                <strong>
                                  +{formatCurrency(item.interestAfterTax)}
                                </strong>
                              </div>
                              <div className="detail-item highlight-detail">
                                <span>Tổng nhận được</span>
                                <strong>{formatCurrency(item.totalAmount)}</strong>
                              </div>
                              <div className="detail-item">
                                <span>Tài khoản nguồn</span>
                                <strong>{fundingAccount?.name ?? "Không liên kết"}</strong>
                              </div>
                              <div className="detail-item">
                                <span>Tài khoản nhận</span>
                                <strong>{settlementAccount?.name ?? "Chọn khi tất toán"}</strong>
                              </div>
                              <div className="detail-item">
                                <span>Chỉ thị đáo hạn</span>
                                <strong>
                                  {item.maturityInstruction === "return"
                                    ? "Nhận gốc và lãi"
                                    : item.maturityInstruction === "reinvest-all"
                                      ? "Tái đầu tư toàn bộ"
                                      : "Chờ quyết định"}
                                </strong>
                              </div>
                            </div>
                            {!isSettled && <div
                              className={
                                progress.isComplete
                                  ? "term-progress complete"
                                  : "term-progress"
                              }
                            >
                              <div className="term-progress-header">
                                <div>
                                  <span>TIẾN ĐỘ KỲ HIỆN TẠI</span>
                                  <strong>{progress.status}</strong>
                                </div>
                                <strong>
                                  {Math.round(progress.percentage)}%
                                </strong>
                              </div>
                              <div
                                className="progress-track"
                                role="progressbar"
                                aria-label={`Tiến độ kỳ gửi của ${item.name}`}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(progress.percentage)}
                                aria-valuetext={`${Math.round(progress.percentage)}%, ${progress.status}`}
                              >
                                <span
                                  className="progress-fill"
                                  style={{
                                    width: `${progress.percentage}%`,
                                  }}
                                />
                              </div>
                              <div className="progress-dates">
                                <span>
                                  <small>Bắt đầu</small>
                                  {formatDate(item.startDate)}
                                </span>
                                <span>
                                  {progress.elapsedDays}/{progress.totalDays} ngày
                                </span>
                                <span>
                                  <small>Đáo hạn</small>
                                  {formatDate(item.maturityDate)}
                                </span>
                              </div>
                            </div>}
                            <>
                                <button
                                  type="button"
                                  className="history-toggle"
                                  onClick={() => onToggleHistory(item.id)}
                                  aria-expanded={isHistoryExpanded}
                                >
                                  <span>
                                    <strong>Lịch sử nguồn tiền</strong>
                                    <small>
                                      {cycles.length} kỳ gửi · Xem gốc, lãi và
                                      các lần tái đầu tư
                                    </small>
                                  </span>
                                  <span aria-hidden="true">
                                    {isHistoryExpanded ? "−" : "+"}
                                  </span>
                                </button>

                                {isHistoryExpanded && (
                                  <div className="history-panel">
                                    <div className="history-panel-header">
                                      <div>
                                        <span>HÀNH TRÌNH NGUỒN TIỀN</span>
                                        <h4>{item.name}</h4>
                                      </div>
                                      <strong>{cycles.length} kỳ liên tiếp</strong>
                                    </div>

                                    {history.length === 0 && (
                                      <p className="history-origin-note">
                                        Đây là kỳ đầu tiên đang được theo dõi.
                                        Mỗi lần tái đầu tư tiếp theo sẽ tự động
                                        được nối vào dòng lịch sử này.
                                      </p>
                                    )}

                                    <div className="history-timeline">
                                      {cycles.map((cycle, cycleIndex) => {
                                        const isCurrentCycle =
                                          cycleIndex === cycles.length - 1;
                                        const nextCyclePrincipal =
                                          cycle.reinvestedAmount ??
                                          cycle.totalAmount;

                                        return (
                                          <div
                                            className="history-cycle"
                                            key={`${item.id}-${cycleIndex}-${cycle.startDate}`}
                                          >
                                            <span className="cycle-marker">
                                              {cycleIndex + 1}
                                            </span>
                                            <div className="cycle-card">
                                              <div className="cycle-card-header">
                                                <div>
                                                  <span>KỲ {cycleIndex + 1}</span>
                                                  <strong>
                                                    {formatDate(cycle.startDate)} →{" "}
                                                    {formatDate(cycle.maturityDate)}
                                                  </strong>
                                                </div>
                                                <span
                                                  className={
                                                    isCurrentCycle
                                                      ? "cycle-status current"
                                                      : "cycle-status"
                                                  }
                                                >
                                                  {isCurrentCycle
                                                    ? "Kỳ hiện tại"
                                                    : "Đã đáo hạn"}
                                                </span>
                                              </div>
                                              <div className="cycle-metrics">
                                                <div>
                                                  <span>Gốc đầu kỳ</span>
                                                  <strong>
                                                    {formatCurrency(cycle.amount)}
                                                  </strong>
                                                </div>
                                                <div>
                                                  <span>Lãi suất</span>
                                                  <strong>
                                                    {formatRate(
                                                      cycle.interestRate,
                                                    )}
                                                    %/năm
                                                  </strong>
                                                </div>
                                                <div>
                                                  <span>Kỳ hạn</span>
                                                  <strong>
                                                    {cycle.term} tháng
                                                  </strong>
                                                </div>
                                                <div>
                                                  <span>Lãi trước khấu trừ</span>
                                                  <strong>
                                                    {formatCurrency(
                                                      cycle.interest,
                                                    )}
                                                  </strong>
                                                </div>
                                                <div>
                                                  <span>Khấu trừ 5%</span>
                                                  <strong className="cycle-tax">
                                                    −{formatCurrency(cycle.tax)}
                                                  </strong>
                                                </div>
                                                <div>
                                                  <span>Lãi ròng</span>
                                                  <strong className="cycle-profit">
                                                    +
                                                    {formatCurrency(
                                                      cycle.interestAfterTax,
                                                    )}
                                                  </strong>
                                                </div>
                                                <div className="cycle-total">
                                                  <span>
                                                    {isCurrentCycle
                                                      ? "Dự kiến cuối kỳ"
                                                      : "Nhận cuối kỳ"}
                                                  </span>
                                                  <strong>
                                                    {formatCurrency(
                                                      cycle.totalAmount,
                                                    )}
                                                  </strong>
                                                </div>
                                              </div>
                                            </div>

                                            {!isCurrentCycle && (
                                              <div className="cycle-transition">
                                                <div className="transition-heading">
                                                  <span aria-hidden="true">↓</span>
                                                  <strong>
                                                    Phân bổ sau đáo hạn
                                                  </strong>
                                                </div>
                                                <div className="transition-values">
                                                  <span>
                                                    <small>
                                                      Gốc kỳ {cycleIndex + 2}
                                                    </small>
                                                    <strong>
                                                      {formatCurrency(
                                                        nextCyclePrincipal,
                                                      )}
                                                    </strong>
                                                  </span>
                                                  {(cycle.cashRemainder ?? 0) >
                                                    0 && (
                                                    <span className="transition-wallet">
                                                      <small>Chuyển vào ví</small>
                                                      <strong>
                                                        {formatCurrency(
                                                          cycle.cashRemainder ?? 0,
                                                        )}
                                                      </strong>
                                                    </span>
                                                  )}
                                                  {(cycle.additionalContribution ??
                                                    0) > 0 && (
                                                    <span className="transition-extra">
                                                      <small>Vốn bổ sung</small>
                                                      <strong>
                                                        +
                                                        {formatCurrency(
                                                          cycle.additionalContribution ??
                                                            0,
                                                        )}
                                                      </strong>
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                            </>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

  );
}
