"use client";

import type { FormEvent, ReactNode } from "react";
import {
  FINANCE_CURRENCIES,
  type FinanceCurrency,
  formatFinanceAmountInput,
} from "@/lib/finance";
import styles from "../finance-manager.module.css";

export default function BudgetDialog({
  category,
  categoryOptions,
  currency,
  editingId,
  formError,
  limit,
  onCategoryChange,
  onClose,
  onCurrencyChange,
  onDelete,
  onLimitChange,
  onSubmit,
  open,
}: {
  category: string;
  categoryOptions: ReactNode;
  currency: FinanceCurrency;
  editingId: string;
  formError: string;
  limit: string;
  onCategoryChange: (value: string) => void;
  onClose: () => void;
  onCurrencyChange: (value: FinanceCurrency) => void;
  onDelete: (id: string) => void;
  onLimitChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  open: boolean;
}) {
  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <form className={`${styles.modal} ${styles.smallModal}`} role="dialog" aria-modal="true" aria-labelledby="budget-title" onSubmit={onSubmit}>
        <div className={styles.modalHeading}>
          <div><span>{editingId ? "CHỈNH SỬA NGÂN SÁCH" : "NGÂN SÁCH THÁNG"}</span><h3 id="budget-title">{editingId ? "Cập nhật giới hạn chi" : "Đặt giới hạn chi"}</h3></div>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        {editingId && <p className={styles.formHint}>Bạn có thể đổi nhóm, đơn vị tiền hoặc giới hạn. Nếu trùng với một ngân sách khác, bản đang sửa sẽ thay thế ngân sách đó.</p>}
        <label>Đơn vị ngân sách<select value={currency} onChange={(event) => onCurrencyChange(event.target.value as FinanceCurrency)}>{FINANCE_CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label} ({item.code})</option>)}</select></label>
        <label>Nhóm chi<select autoFocus value={category} onChange={(event) => onCategoryChange(event.target.value)} required><option value="">Chọn nhóm</option>{categoryOptions}</select></label>
        <label>Giới hạn mỗi tháng<input inputMode="numeric" type="text" value={limit} onChange={(event) => onLimitChange(formatFinanceAmountInput(event.target.value))} placeholder={currency === "KRW" ? "1.000.000 ₩" : "1.000.000 ₫"} required /></label>
        {formError && <p className={styles.formError} role="alert">{formError}</p>}
        <div className={styles.budgetModalActions}>
          {editingId && <button className={styles.dangerAction} type="button" onClick={() => onDelete(editingId)}>Xóa ngân sách</button>}
          <button className={styles.saveButton} type="submit">{editingId ? "Lưu thay đổi" : "Lưu ngân sách"}</button>
        </div>
      </form>
    </div>
  );
}
