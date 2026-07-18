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
  archived,
  currency,
  editingId,
  formError,
  includeInNetWorth,
  name,
  onArchive,
  onBalanceChange,
  onClose,
  onCurrencyChange,
  onDelete,
  onIncludeInNetWorthChange,
  onNameChange,
  onSubmit,
  onTypeChange,
  openingBalance,
  open,
  type,
}: {
  archived: boolean;
  currency: FinanceCurrency;
  editingId: string;
  formError: string;
  includeInNetWorth: boolean;
  name: string;
  onArchive: (id: string, archived: boolean) => void;
  onBalanceChange: (value: string) => void;
  onClose: () => void;
  onCurrencyChange: (value: FinanceCurrency) => void;
  onDelete: (id: string) => void;
  onIncludeInNetWorthChange: (value: boolean) => void;
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
            <span>{archived ? "VÍ ĐÃ LƯU TRỮ" : editingId ? "CHỈNH SỬA TÀI KHOẢN" : "TÀI KHOẢN MỚI"}</span>
            <h3 id="account-title">{archived ? "Ví đang được đóng băng" : editingId ? "Cập nhật nơi giữ tiền" : "Thêm nơi giữ tiền"}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <label>
          Tên tài khoản
          <input autoFocus value={name} disabled={archived} onChange={(event) => onNameChange(event.target.value)} placeholder="Ví dụ: Vietcombank" required maxLength={100} />
        </label>
        <label>
          Loại tài khoản
          <select value={type} disabled={archived} onChange={(event) => onTypeChange(event.target.value as FinanceAccountType)}>
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
            disabled={archived}
            value={openingBalance}
            onChange={(event) => onBalanceChange(formatFinanceAmountInput(event.target.value))}
            placeholder={currency === "KRW" ? "1.000.000 ₩" : "1.000.000 ₫"}
          />
        </label>
        <label className={styles.accountTotalToggle}>
          <input
            type="checkbox"
            checked={includeInNetWorth}
            disabled={archived}
            onChange={(event) => onIncludeInNetWorthChange(event.target.checked)}
          />
          <span>
            <strong>Tính số dư vào tổng tài sản</strong>
            <small>Tắt lựa chọn này nếu ví vẫn có tiền nhưng không muốn cộng vào tài sản thanh khoản và tài sản ròng.</small>
          </span>
        </label>
        <p className={styles.formHint}>
          {archived
            ? "Ví đã được đóng băng: số dư và lịch sử vẫn được giữ nguyên, nhưng ví không thể phát sinh giao dịch mới cho đến khi khôi phục."
            : editingId
            ? "Đổi số dư ban đầu sẽ làm số dư hiện tại tăng hoặc giảm tương ứng. Các giao dịch cũ vẫn được giữ nguyên."
            : "Đơn vị tiền của tài khoản không đổi sau khi tạo để lịch sử luôn chính xác."}
        </p>
        {formError && <p className={styles.formError} role="alert">{formError}</p>}
        <div className={styles.accountModalActions}>
          {!archived && <button className={styles.saveButton} type="submit">{editingId ? "Lưu thay đổi" : "Thêm tài khoản"}</button>}
          {editingId && (
            <button
              className={styles.archiveAction}
              type="button"
              onClick={() => onArchive(editingId, !archived)}
            >
              {archived ? "Khôi phục ví" : "Lưu trữ ví"}
            </button>
          )}
          {editingId && <button className={styles.dangerAction} type="button" onClick={() => onDelete(editingId)}>Xóa tài khoản</button>}
        </div>
      </form>
    </div>
  );
}
