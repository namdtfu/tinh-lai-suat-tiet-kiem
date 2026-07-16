"use client";

import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { FinanceAccount } from "@/lib/finance";
import {
  formatAmountInput,
  formatRate,
  type MaturityInstruction,
  type SavingsForm,
} from "@/lib/savings";

export type SavingsFormMode = "add" | "edit" | "reinvest";

export default function DepositForm({
  accounts,
  form,
  message,
  mode,
  newInterestRate,
  onAddRate,
  onDeleteRate,
  onFormChange,
  onMessageChange,
  onNewInterestRateChange,
  onOpenFinance,
  onReset,
  onSubmit,
  onUpdateForm,
  sortedRates,
}: {
  accounts: FinanceAccount[];
  form: SavingsForm;
  message: string;
  mode: SavingsFormMode;
  newInterestRate: string;
  onAddRate: () => void;
  onDeleteRate: (rate: number) => void;
  onFormChange: Dispatch<SetStateAction<SavingsForm>>;
  onMessageChange: (message: string) => void;
  onNewInterestRateChange: (value: string) => void;
  onOpenFinance: () => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateForm: (field: keyof SavingsForm, value: string) => void;
  sortedRates: number[];
}) {
  const submitLabel =
    mode === "edit"
      ? "Lưu thay đổi"
      : mode === "reinvest"
        ? "Tạo kỳ tái đầu tư"
        : "Thêm khoản gửi";

  return (
        <section className="form-section" id="deposit-form">
          <div className="section-heading">
            <div>
              <span className="section-kicker">KHOẢN GỬI</span>
              <h2>
                {mode === "edit"
                  ? "Chỉnh sửa khoản gửi"
                  : mode === "reinvest"
                    ? "Tạo kỳ tái đầu tư"
                    : "Thêm khoản gửi mới"}
              </h2>
            </div>
            <span className="step-badge">01</span>
          </div>

          {message && (
            <div className="status-message" role="status">
              <span aria-hidden="true">✓</span>
              {message}
              <button
                type="button"
                onClick={() => onMessageChange("")}
                aria-label="Đóng thông báo"
              >
                ×
              </button>
            </div>
          )}

          <form onSubmit={onSubmit}>
            <div className="form-grid">
              <div className="form-group form-group-wide">
                <label htmlFor="savingsName">Tên khoản tiền</label>
                <input
                  type="text"
                  id="savingsName"
                  value={form.name}
                  onChange={(event) => onUpdateForm("name", event.target.value)}
                  placeholder="Ví dụ: Tiền tiết kiệm sinh nhật"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label htmlFor="bankName">Ngân hàng</label>
                <input
                  type="text"
                  id="bankName"
                  value={form.bankName}
                  onChange={(event) => onUpdateForm("bankName", event.target.value)}
                  placeholder="Ví dụ: Vietcombank"
                  maxLength={120}
                />
              </div>

              <div className="form-group">
                <label htmlFor="maturityInstruction">Khi đáo hạn</label>
                <select
                  id="maturityInstruction"
                  value={form.maturityInstruction}
                  onChange={(event) =>
                    onUpdateForm(
                      "maturityInstruction",
                      event.target.value as MaturityInstruction,
                    )
                  }
                >
                  <option value="decide-later">Nhắc tôi quyết định</option>
                  <option value="return">Nhận gốc và lãi</option>
                  <option value="reinvest-all">Dự kiến tái đầu tư toàn bộ</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="amount">Số tiền gửi (VNĐ)</label>
                <div className="input-with-suffix">
                  <input
                    type="text"
                    inputMode="numeric"
                    id="amount"
                    required
                    value={form.amount}
                    onChange={(event) =>
                      onUpdateForm("amount", formatAmountInput(event.target.value))
                    }
                    placeholder="10.000.000"
                  />
                  <span>₫</span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="term">Kỳ hạn (tháng)</label>
                <input
                  type="number"
                  id="term"
                  required
                  min="1"
                  step="1"
                  value={form.term}
                  onChange={(event) => onUpdateForm("term", event.target.value)}
                  placeholder="6"
                />
              </div>

              <div className="form-group">
                <label htmlFor="interestRate">Lãi suất (%/năm)</label>
                <select
                  id="interestRate"
                  required={!form.customInterestRate}
                  value={form.interestRate}
                  onChange={(event) =>
                    onFormChange((current) => ({
                      ...current,
                      interestRate: event.target.value,
                      customInterestRate: event.target.value
                        ? ""
                        : current.customInterestRate,
                    }))
                  }
                >
                  <option value="">Chọn lãi suất</option>
                  {sortedRates.map((rate) => (
                    <option value={rate} key={rate}>
                      {formatRate(rate)}%
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="customInterestRate">Lãi suất khác</label>
                <div className="input-with-suffix">
                  <input
                    type="number"
                    id="customInterestRate"
                    min="0.01"
                    max="100"
                    step="0.01"
                    required={!form.interestRate}
                    value={form.customInterestRate}
                    onChange={(event) =>
                      onFormChange((current) => ({
                        ...current,
                        customInterestRate: event.target.value,
                        interestRate: event.target.value
                          ? ""
                          : current.interestRate,
                      }))
                    }
                    placeholder="Ví dụ: 5,8"
                  />
                  <span>%</span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="startDate">Ngày gửi</label>
                <input
                  type="date"
                  id="startDate"
                  required
                  value={form.startDate}
                  onChange={(event) =>
                    onUpdateForm("startDate", event.target.value)
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="fundingAccountId">
                  {mode === "reinvest" ? "Tài khoản góp thêm" : "Tài khoản trừ tiền gửi"}
                </label>
                <select
                  id="fundingAccountId"
                  value={form.fundingAccountId}
                  onChange={(event) =>
                    onUpdateForm("fundingAccountId", event.target.value)
                  }
                >
                  <option value="">Không liên kết tài khoản</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group form-group-wide">
                <label htmlFor="settlementAccountId">Tài khoản nhận tiền đáo hạn</label>
                <select
                  id="settlementAccountId"
                  value={form.settlementAccountId}
                  onChange={(event) =>
                    onUpdateForm("settlementAccountId", event.target.value)
                  }
                >
                  <option value="">Chọn khi tất toán</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="account-link-note">
              <span aria-hidden="true">↔</span>
              <p>
                {accounts.length
                  ? "Khi liên kết, tiền gửi và tiền tất toán sẽ tự cập nhật số dư tài khoản nhưng không bị tính thành thu hoặc chi."
                  : "Chưa có tài khoản VND. Hãy tạo một tài khoản VND trong phân hệ Thu chi để tự động cập nhật số dư."}
              </p>
              {!accounts.length && (
                <button type="button" onClick={() => onOpenFinance()}>
                  Tạo tài khoản VND
                </button>
              )}
            </div>

            <div className="rate-manager">
              <div className="rate-manager-copy">
                <h3>Quản lý lãi suất nhanh</h3>
                <p>Thêm các mức bạn thường dùng để chọn nhanh cho lần sau.</p>
              </div>
              <div className="rate-add-row">
                <div className="input-with-suffix compact-input">
                  <input
                    type="number"
                    id="newInterestRate"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={newInterestRate}
                    onChange={(event) => onNewInterestRateChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onAddRate();
                      }
                    }}
                    placeholder="Thêm lãi suất"
                    aria-label="Lãi suất mới"
                  />
                  <span>%</span>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onAddRate}
                >
                  + Thêm mức
                </button>
              </div>
              <div className="interest-rate-list" aria-label="Lãi suất đã lưu">
                {sortedRates.map((rate) => (
                  <span className="interest-rate-tag" key={rate}>
                    {formatRate(rate)}%
                    <button
                      type="button"
                      onClick={() => onDeleteRate(rate)}
                      aria-label={`Xóa lãi suất ${formatRate(rate)}%`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {sortedRates.length === 0 && (
                  <span className="muted-copy">Chưa có mức lãi suất lưu sẵn.</span>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                <span>{mode === "edit" ? "✓" : "+"}</span>
                {submitLabel}
              </button>
              {mode !== "add" && (
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    onReset();
                    onMessageChange("Đã hủy thay đổi.");
                  }}
                >
                  Hủy
                </button>
              )}
            </div>
          </form>
        </section>

  );
}
