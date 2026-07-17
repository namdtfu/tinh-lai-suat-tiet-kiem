"use client";

import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { FinanceAccount } from "@/lib/finance";
import {
  calculateAccruedInterest,
  formatAmountInput,
  formatCurrency,
  formatDate,
  parseAmount,
  type SavingsItem,
} from "@/lib/savings";

export type SettlementDraft = {
  accountId: string;
  amount: string;
  date: string;
};

export default function SettlementModal({
  accounts,
  draft,
  item,
  onClose,
  onDraftChange,
  onSubmit,
}: {
  accounts: FinanceAccount[];
  draft: SettlementDraft;
  item?: SavingsItem;
  onClose: () => void;
  onDraftChange: Dispatch<SetStateAction<SettlementDraft>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!item) return null;

  const isOpenEnded = item.termType === "open-ended";
  const projected = isOpenEnded
    ? calculateAccruedInterest(item, draft.date || item.startDate)
    : {
        tax: item.tax,
        totalAmount: item.totalAmount,
      };
  const actualAmount = parseAmount(draft.amount);
  const actualInterest = Math.max(0, actualAmount - item.amount);
  const isEarlySettlement =
    !isOpenEnded && draft.date < item.maturityDate;

  return (
    <div
      className="settlement-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <form
        className="settlement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-title"
        onSubmit={onSubmit}
      >
        <div className="settlement-heading">
          <div>
            <span>GHI NHẬN THỰC TẾ</span>
            <h3 id="settlement-title">
              {isOpenEnded ? "Rút tiền" : "Tất toán"} “{item.name}”
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className="settlement-projection">
          <span>Dự kiến nhận sau thuế</span>
          <strong>{formatCurrency(projected.totalAmount)}</strong>
          <small>
            {isOpenEnded
              ? `Tính đến ${formatDate(draft.date || item.startDate)} · thuế lãi 5% ${formatCurrency(projected.tax)}`
              : `Đáo hạn ${formatDate(item.maturityDate)}`}
          </small>
        </div>
        {isEarlySettlement && (
          <p className="settlement-warning">
            Ngày tất toán trước ngày đáo hạn. Hãy nhập số thực nhận theo xác
            nhận của ngân hàng.
          </p>
        )}
        <div className="settlement-grid">
          <label>
            Số tiền thực nhận
            <div className="input-with-suffix">
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                required
                value={draft.amount}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    amount: formatAmountInput(event.target.value),
                  }))
                }
              />
              <span>₫</span>
            </div>
          </label>
          <label>
            {isOpenEnded ? "Ngày rút" : "Ngày tất toán"}
            <input
              type="date"
              required
              value={draft.date}
              onChange={(event) => {
                const date = event.target.value;
                onDraftChange((current) => ({
                  ...current,
                  date,
                  ...(isOpenEnded && date
                    ? {
                        amount: formatAmountInput(
                          Math.round(
                            calculateAccruedInterest(item, date).totalAmount,
                          ),
                        ),
                      }
                    : {}),
                }));
              }}
            />
          </label>
          <label className="settlement-account-field">
            Tài khoản nhận tiền
            <select
              value={draft.accountId}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  accountId: event.target.value,
                }))
              }
            >
              <option value="">Không cập nhật số dư tài khoản</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="settlement-actual-summary">
          <span>Gốc {formatCurrency(item.amount)}</span>
          <strong>Lãi ròng thực nhận +{formatCurrency(actualInterest)}</strong>
        </div>
        <div className="settlement-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>Hủy</button>
          <button type="submit" className="btn-primary">
            {isOpenEnded ? "Xác nhận rút tiền" : "Xác nhận tất toán"}
          </button>
        </div>
      </form>
    </div>
  );
}
