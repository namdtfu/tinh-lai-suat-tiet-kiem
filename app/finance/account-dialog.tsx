"use client";

import type { FormEvent } from "react";
import {
  FINANCE_CURRENCIES,
  type FinanceAccountType,
  type FinanceCurrency,
  formatFinanceAmountInput,
} from "@/lib/finance";
import styles from "../finance-manager.module.css";
import { accountTypeLabels } from "./formatters";

export default function AccountDialog({
  currency,
  editingId,
  formError,
  name,
  onBalanceChange,
  onClose,
  onCurrencyChange,
  onDelete,
  onNameChange,
  onSubmit,
  onTypeChange,
  openingBalance,
  open,
  type,
}: {
  currency: FinanceCurrency;
  editingId: string;
  formError: string;
  name: string;
  onBalanceChange: (value: string) => void;
  onClose: () => void;
  onCurrencyChange: (value: FinanceCurrency) => void;
  onDelete: (id: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTypeChange: (value: FinanceAccountType) => void;
  openingBalance: string;
  open: boolean;
  type: FinanceAccountType;
}) {
  if (!open) return null;

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <form
        className={`${styles.modal} ${styles.smallModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        onSubmit={onSubmit}
      >
        <div className={styles.modalHeading}>
          <div>
            <span>{editingId ? "CHỈNH SỬA TÀI KHOẢN" : "TÀI KHOẢN MỚI"}</span>
            <h3 id="account-title">{editingId ? "Cập nhật nơi giữ tiền" : "Thêm nơi giữ tiền"}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <label>
          Tên tài khoản
          <input autoFocus value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Ví dụ: Vietcombank" required maxLength={100} />
        </label>
        <label>
          Loại tài khoản
          <select value={type} onChange={(event) => onTypeChange(event.target.value as FinanceAccountType)}>
            {Object.entries(accountTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Đơn vị tiền
          <select value={currency} disabled={Boolean(editingId)} onChange={(event) => onCurrencyChange(event.target.value as FinanceCurrency)}>
            {FINANCE_CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label} ({item.code})</option>)}
          </select>
        </label>
        <label>
          Số dư ban đầu
          <input
            inputMode="numeric"
            type="text"
            value={openingBalance}
            onChange={(event) => onBalanceChange(formatFinanceAmountInput(event.target.value))}
            placeholder={currency === "KRW" ? "1.000.000 ₩" : "1.000.000 ₫"}
          />
        </label>
        <p className={styles.formHint}>
          {editingId
            ? "Đổi số dư ban đầu sẽ làm số dư hiện tại tăng hoặc giảm tương ứng. Các giao dịch cũ vẫn được giữ nguyên."
            : "Đơn vị tiền của tài khoản không đổi sau khi tạo để lịch sử luôn chính xác."}
        </p>
        {formError && <p className={styles.formError} role="alert">{formError}</p>}
        <div className={styles.budgetModalActions}>
          {editingId && <button className={styles.dangerAction} type="button" onClick={() => onDelete(editingId)}>Xóa tài khoản</button>}
          <button className={styles.saveButton} type="submit">{editingId ? "Lưu thay đổi" : "Thêm tài khoản"}</button>
        </div>
      </form>
    </div>
  );
}
