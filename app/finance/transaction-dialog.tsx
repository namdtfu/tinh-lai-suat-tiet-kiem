"use client";

import type { FormEvent, ReactNode } from "react";
import {
  FINANCE_CURRENCIES,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceCategoryKind,
  type FinanceCurrency,
  formatFinanceAmountInput,
} from "@/lib/finance";
import styles from "../finance-manager.module.css";

export type EditableFinanceTransactionType =
  | "income"
  | "expense"
  | "transfer";

export default function TransactionDialog({
  account,
  accounts,
  amount,
  categories,
  category,
  currency,
  date,
  destinationAccount,
  editingId,
  effectiveExchangeRate,
  formError,
  isCurrencyConversion,
  note,
  onAccountChange,
  onAmountChange,
  onCategoryChange,
  onClose,
  onCurrencyChange,
  onDateChange,
  onManageCategories,
  onNoteChange,
  onSubmit,
  onToAccountChange,
  onToAmountChange,
  onTypeChange,
  open,
  renderCategoryOptions,
  sourceAccount,
  toAccount,
  toAmount,
  type,
}: {
  account: string;
  accounts: FinanceAccount[];
  amount: string;
  categories: FinanceCategory[];
  category: string;
  currency: FinanceCurrency;
  date: string;
  destinationAccount?: FinanceAccount;
  editingId: string;
  effectiveExchangeRate: number;
  formError: string;
  isCurrencyConversion: boolean;
  note: string;
  onAccountChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onClose: () => void;
  onCurrencyChange: (value: FinanceCurrency) => void;
  onDateChange: (value: string) => void;
  onManageCategories: (kind: FinanceCategoryKind) => void;
  onNoteChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToAccountChange: (value: string) => void;
  onToAmountChange: (value: string) => void;
  onTypeChange: (value: EditableFinanceTransactionType) => void;
  open: boolean;
  renderCategoryOptions: (
    kind: FinanceCategoryKind,
    selectedId: string,
  ) => ReactNode;
  sourceAccount?: FinanceAccount;
  toAccount: string;
  toAmount: string;
  type: EditableFinanceTransactionType;
}) {
  if (!open) return null;

  return (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) { onClose(); } }}>
          <form className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="transaction-title" onSubmit={onSubmit}>
            <div className={styles.modalHeading}><div><span>{editingId ? "CHỈNH SỬA GIAO DỊCH" : "GIAO DỊCH MỚI"}</span><h3 id="transaction-title">{editingId ? "Cập nhật dòng tiền" : "Ghi nhận dòng tiền"}</h3></div><button type="button" onClick={onClose} aria-label="Đóng">×</button></div>
            {editingId && (
              <div className={styles.editFlowNotice}>
                <strong>Cách cập nhật số dư</strong>
                <p>Ứng dụng hoàn lại toàn bộ tác động của giao dịch cũ, sau đó áp dụng thông tin mới. Giao dịch không bị cộng hai lần.</p>
              </div>
            )}
            <div className={styles.segmented}>
              {(["expense", "income", "transfer"] as const).map((nextType) => <button key={nextType} type="button" className={type === nextType ? styles.segmentActive : ""} onClick={() => { onTypeChange(nextType); onToAmountChange(""); onCategoryChange(categories.find((category) => !category.archived && (nextType === "income" ? category.kind === "income" : category.kind === "expense"))?.id ?? ""); }}>{nextType === "expense" ? "Khoản chi" : nextType === "income" ? "Khoản thu" : "Chuyển khoản"}</button>)}
            </div>
            <div className={styles.currencyInputBlock}>
              <span>ĐƠN VỊ NHẬP</span>
              <div className={styles.currencyInputSwitch} aria-label="Chọn đơn vị giao dịch">
                {FINANCE_CURRENCIES.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    className={currency === option.code ? styles.activeInputCurrency : ""}
                    onClick={() => {
                      const nextAccount = accounts.find(
                        (account) => account.currency === option.code,
                      );
                      if (!nextAccount) return;
                      onCurrencyChange(option.code);
                      onAccountChange(nextAccount.id);
                      onAmountChange("");
                      onToAmountChange("");
                      if (nextAccount.id === toAccount) {
                        onToAccountChange(
                          accounts.find(
                            (account) => account.id !== nextAccount.id,
                          )?.id ?? "",
                        );
                      }
                    }}
                  >
                    <strong>{option.symbol} {option.code}</strong>
                    <small>{option.shortLabel}</small>
                  </button>
                ))}
              </div>
            </div>
            <label>
              Số tiền {sourceAccount ? `(${sourceAccount.currency})` : ""}
              <input autoFocus inputMode="numeric" type="text" value={amount} onChange={(event) => onAmountChange(formatFinanceAmountInput(event.target.value))} placeholder={sourceAccount?.currency === "KRW" ? "1.000.000 ₩" : "1.000.000 ₫"} required />
            </label>
            <div className={styles.formGrid}>
              <label>{type === "transfer" ? "Từ tài khoản" : "Tài khoản"}<select value={account} onChange={(event) => { const nextAccount = event.target.value; onAccountChange(nextAccount); onToAmountChange(""); if (nextAccount === toAccount) onToAccountChange(accounts.find((account) => account.id !== nextAccount)?.id ?? ""); }} required>{accounts.filter((account) => account.currency === currency).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label>
              {type === "transfer" ? <label>Đến tài khoản<select value={toAccount} onChange={(event) => { onToAccountChange(event.target.value); onToAmountChange(""); }} required><option value="">Chọn tài khoản</option>{accounts.filter((candidate) => candidate.id !== account).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.currency})</option>)}</select></label> : <label>Nhóm<select value={category} onChange={(event) => onCategoryChange(event.target.value)} required><option value="">Chọn nhóm</option>{renderCategoryOptions(type === "income" ? "income" : "expense", category)}</select></label>}
              <label>Ngày<input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} required /></label>
              <label>Ghi chú<input value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Không bắt buộc" maxLength={240} /></label>
            </div>
            {isCurrencyConversion && sourceAccount && destinationAccount && (
              <div className={styles.exchangeBox}>
                <label>
                  Số tiền thực nhận ({destinationAccount.currency})
                  <input
                    inputMode="numeric"
                    type="text"
                    value={toAmount}
                    onChange={(event) => onToAmountChange(formatFinanceAmountInput(event.target.value))}
                    placeholder={destinationAccount.currency === "KRW" ? "1.000.000 ₩" : "1.000.000 ₫"}
                    required
                  />
                </label>
                <p>
                  {effectiveExchangeRate > 0
                    ? `Tỷ giá thực tế: 1 ${sourceAccount.currency} ≈ ${effectiveExchangeRate.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} ${destinationAccount.currency}`
                    : "Nhập số thực nhận; tỷ giá sẽ được tính tự động."}
                </p>
              </div>
            )}
            {type !== "transfer" && (
              <button
                className={styles.inlineLink}
                type="button"
                onClick={() => {
                  onManageCategories(
                    type === "income" ? "income" : "expense",
                  );
                }}
              >
                ＋ Thêm hoặc chỉnh sửa nhóm
              </button>
            )}
            {formError && <p className={styles.formError} role="alert">{formError}</p>}
            <button className={styles.saveButton} type="submit">{editingId ? "Lưu thay đổi" : "Lưu giao dịch"}</button>
          </form>
        </div>

  );
}
