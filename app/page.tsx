"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const DEFAULT_INTEREST_RATES = [9, 8.5, 8, 7.5, 7, 6.5, 6];
const SAVINGS_KEY = "savings";
const RATES_KEY = "interestRates";

type FormMode = "add" | "edit" | "reinvest";

type SavingsCycle = {
  amount: number;
  interestRate: number;
  term: number;
  startDate: string;
  maturityDate: string;
  interest: number;
  tax: number;
  interestAfterTax: number;
  totalAmount: number;
};

type SavingsItem = SavingsCycle & {
  id: number;
  name: string;
  history: SavingsCycle[];
};

type SavingsForm = {
  name: string;
  amount: string;
  interestRate: string;
  customInterestRate: string;
  term: string;
  startDate: string;
};

const emptyForm = (startDate = ""): SavingsForm => ({
  name: "",
  amount: "",
  interestRate: "",
  customInterestRate: "",
  term: "",
  startDate,
});

const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function getTodayIso() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toLocalIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonthsClamped(startDate: string, months: number) {
  const source = parseLocalDate(startDate);
  const originalDay = source.getDate();
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(originalDay, lastDay));
  return toLocalIso(target);
}

function daysBetween(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function getTermProgress(startDate: string, maturityDate: string) {
  const today = getTodayIso();
  const totalDays = Math.max(1, daysBetween(startDate, maturityDate));
  const isBeforeStart = today < startDate;
  const isComplete = today >= maturityDate;
  const elapsedDays = isBeforeStart
    ? 0
    : isComplete
      ? totalDays
      : Math.min(totalDays, daysBetween(startDate, today));
  const percentage = Math.min(
    100,
    Math.max(0, (elapsedDays / totalDays) * 100),
  );
  const remainingDays = Math.max(0, totalDays - elapsedDays);

  return {
    elapsedDays,
    isComplete,
    percentage,
    remainingDays,
    status: isBeforeStart
      ? "Chưa bắt đầu"
      : isComplete
        ? "Đã đến ngày đáo hạn"
        : `Còn ${remainingDays} ngày`,
    totalDays,
  };
}

function calculateSavings(
  amount: number,
  interestRate: number,
  term: number,
  startDate: string,
) {
  const maturityDate = addMonthsClamped(startDate, term);
  const days = daysBetween(startDate, maturityDate);
  const dailyRate = interestRate / 100 / 365;
  const interest = amount * ((1 + dailyRate) ** days - 1);
  const tax = interest * 0.05;
  const interestAfterTax = interest - tax;

  return {
    maturityDate,
    interest,
    tax,
    interestAfterTax,
    totalAmount: amount + interestAfterTax,
  };
}

function recalculateSavingsItem(item: SavingsItem): SavingsItem {
  return {
    ...item,
    ...calculateSavings(
      item.amount,
      item.interestRate,
      item.term,
      item.startDate,
    ),
    history: (item.history ?? []).map((cycle) => ({
      ...cycle,
      ...calculateSavings(
        cycle.amount,
        cycle.interestRate,
        cycle.term,
        cycle.startDate,
      ),
    })),
  };
}

function formatCurrency(amount: number) {
  return currencyFormatter.format(Math.round(amount));
}

function formatDate(dateString: string) {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat("vi-VN").format(parseLocalDate(dateString));
}

function formatRate(rate: number) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
  }).format(rate);
}

function parseAmount(value: string) {
  return Number(value.replace(/\D/g, "")) || 0;
}

function formatAmountInput(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(digits));
}

function toSavingsCycle(item: SavingsCycle): SavingsCycle {
  return {
    amount: item.amount,
    interestRate: item.interestRate,
    term: item.term,
    startDate: item.startDate,
    maturityDate: item.maturityDate,
    interest: item.interest,
    tax: item.tax,
    interestAfterTax: item.interestAfterTax,
    totalAmount: item.totalAmount,
  };
}

function readStoredArray<T>(key: string): T[] | null {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [savings, setSavings] = useState<SavingsItem[]>([]);
  const [interestRates, setInterestRates] = useState(DEFAULT_INTEREST_RATES);
  const [form, setForm] = useState<SavingsForm>(emptyForm());
  const [newInterestRate, setNewInterestRate] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mode, setMode] = useState<FormMode>("add");
  const [collapsedRates, setCollapsedRates] = useState<Set<number>>(new Set());
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage is client-only, so persisted data must be hydrated after mount. */
    const storedSavings = readStoredArray<SavingsItem>(SAVINGS_KEY);
    const storedRates = readStoredArray<number>(RATES_KEY);

    if (storedSavings) {
      setSavings(storedSavings.map(recalculateSavingsItem));
    }
    if (storedRates) {
      setInterestRates(
        storedRates
          .filter((rate) => Number.isFinite(Number(rate)) && Number(rate) > 0)
          .map(Number),
      );
    }
    setForm(emptyForm(getTodayIso()));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(SAVINGS_KEY, JSON.stringify(savings));
  }, [ready, savings]);

  useEffect(() => {
    if (ready) localStorage.setItem(RATES_KEY, JSON.stringify(interestRates));
  }, [interestRates, ready]);

  const sortedRates = useMemo(
    () => [...interestRates].sort((a, b) => b - a),
    [interestRates],
  );

  const groupedSavings = useMemo(() => {
    const groups = new Map<number, SavingsItem[]>();
    savings.forEach((item) => {
      const group = groups.get(item.interestRate) ?? [];
      group.push(item);
      groups.set(item.interestRate, group);
    });
    return [...groups.entries()].sort(([rateA], [rateB]) => rateB - rateA);
  }, [savings]);

  const summary = useMemo(() => {
    const principal = savings.reduce((sum, item) => sum + item.amount, 0);
    const interest = savings.reduce(
      (sum, item) => sum + item.interestAfterTax,
      0,
    );
    return { principal, interest, assets: principal + interest };
  }, [savings]);

  function updateForm(field: keyof SavingsForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm(getTodayIso()));
    setEditingId(null);
    setMode("add");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(form.amount);
    const interestRate = Number(
      form.customInterestRate || form.interestRate,
    );
    const term = Number(form.term);

    if (
      !amount ||
      !interestRate ||
      interestRate <= 0 ||
      !Number.isInteger(term) ||
      term < 1 ||
      !form.startDate
    ) {
      setMessage("Vui lòng kiểm tra lại số tiền, lãi suất, kỳ hạn và ngày gửi.");
      return;
    }

    const calculation = calculateSavings(
      amount,
      interestRate,
      term,
      form.startDate,
    );
    const sourceItem =
      editingId === null
        ? undefined
        : savings.find((current) => current.id === editingId);
    const previousHistory = sourceItem?.history ?? [];
    const item: SavingsItem = {
      id: editingId ?? Date.now(),
      name: form.name.trim() || "Khoản tiết kiệm",
      amount,
      interestRate,
      term,
      startDate: form.startDate,
      ...calculation,
      history:
        mode === "reinvest" && sourceItem
          ? [...previousHistory, toSavingsCycle(sourceItem)]
          : previousHistory,
    };

    if (mode !== "add" && editingId !== null) {
      setSavings((items) =>
        items.map((current) => (current.id === editingId ? item : current)),
      );
      setMessage(
        mode === "reinvest"
          ? `Đã chuyển toàn bộ gốc và lãi ròng của “${item.name}” sang kỳ tái đầu tư mới.`
          : `Đã cập nhật “${item.name}”.`,
      );
      if (mode === "reinvest") setExpandedHistoryId(item.id);
    } else {
      setSavings((items) => [...items, item]);
      setMessage(`Đã thêm “${item.name}”.`);
    }
    resetForm();
  }

  function handleAddRate() {
    const rate = Number(newInterestRate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      setMessage("Lãi suất mới cần lớn hơn 0 và không vượt quá 100%.");
      return;
    }
    if (interestRates.includes(rate)) {
      setMessage("Lãi suất này đã có trong danh sách.");
      return;
    }
    setInterestRates((rates) => [...rates, rate]);
    setNewInterestRate("");
    setMessage(`Đã thêm mức lãi suất ${formatRate(rate)}%.`);
  }

  function handleDeleteRate(rate: number) {
    setInterestRates((rates) => rates.filter((current) => current !== rate));
    if (Number(form.interestRate) === rate) updateForm("interestRate", "");
    setMessage(`Đã xóa mức lãi suất ${formatRate(rate)}%.`);
  }

  function handleDelete(id: number) {
    const item = savings.find((current) => current.id === id);
    if (!item || !window.confirm(`Xóa khoản gửi “${item.name}”?`)) return;
    setSavings((items) => items.filter((current) => current.id !== id));
    if (editingId === id) resetForm();
    if (expandedHistoryId === id) setExpandedHistoryId(null);
    setMessage(`Đã xóa “${item.name}”.`);
  }

  function prepareItem(item: SavingsItem, nextMode: FormMode) {
    const isPreset = interestRates.includes(item.interestRate);
    setForm({
      name: item.name,
      amount: formatAmountInput(
        Math.round(nextMode === "reinvest" ? item.totalAmount : item.amount),
      ),
      interestRate: isPreset ? String(item.interestRate) : "",
      customInterestRate: isPreset ? "" : String(item.interestRate),
      term: String(item.term),
      startDate:
        nextMode === "reinvest" ? item.maturityDate : item.startDate,
    });
    setMode(nextMode);
    // Editing and reinvesting both replace the source item. Keeping its id
    // prevents the matured principal from being counted a second time.
    setEditingId(nextMode === "add" ? null : item.id);
    setMessage(
      nextMode === "reinvest"
        ? `Đã điền ${formatCurrency(item.totalAmount)} để tái đầu tư. Bạn có thể thay đổi kỳ hạn hoặc lãi suất.`
        : `Đang chỉnh sửa “${item.name}”.`,
    );
    document
      .getElementById("deposit-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateItemName(id: number, name: string) {
    setSavings((items) =>
      items.map((item) =>
        item.id === id ? { ...item, name } : item,
      ),
    );
  }

  function finalizeItemName(id: number, name: string) {
    const normalizedName = name.trim() || "Khoản tiết kiệm";
    updateItemName(id, normalizedName);
  }

  function toggleGroup(rate: number) {
    setCollapsedRates((current) => {
      const next = new Set(current);
      if (next.has(rate)) next.delete(rate);
      else next.add(rate);
      return next;
    });
  }

  const submitLabel =
    mode === "edit"
      ? "Lưu thay đổi"
      : mode === "reinvest"
        ? "Thêm khoản tái đầu tư"
        : "Thêm khoản gửi";

  return (
    <main className="page-shell">
      <div className="app-container">
        <header className="hero">
          <div className="hero-copy">
            <span className="eyebrow">SỔ TIẾT KIỆM CÁ NHÂN</span>
            <h1>Tính lãi suất tiết kiệm</h1>
            <p>
              Theo dõi từng khoản gửi, lãi sau khấu trừ và số tiền dự kiến khi
              đáo hạn — tất cả trong một nơi.
            </p>
          </div>
          <div className="privacy-pill" aria-label="Dữ liệu được lưu cục bộ">
            <span aria-hidden="true">◉</span>
            Lưu tự động trên thiết bị
          </div>
        </header>

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
                onClick={() => setMessage("")}
                aria-label="Đóng thông báo"
              >
                ×
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group form-group-wide">
                <label htmlFor="savingsName">Tên khoản tiền</label>
                <input
                  type="text"
                  id="savingsName"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Ví dụ: Tiền tiết kiệm sinh nhật"
                  autoComplete="off"
                />
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
                      updateForm("amount", formatAmountInput(event.target.value))
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
                  onChange={(event) => updateForm("term", event.target.value)}
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
                    setForm((current) => ({
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
                      setForm((current) => ({
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

              <div className="form-group form-group-wide">
                <label htmlFor="startDate">Ngày gửi</label>
                <input
                  type="date"
                  id="startDate"
                  required
                  value={form.startDate}
                  onChange={(event) =>
                    updateForm("startDate", event.target.value)
                  }
                />
              </div>
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
                    onChange={(event) => setNewInterestRate(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddRate();
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
                  onClick={handleAddRate}
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
                      onClick={() => handleDeleteRate(rate)}
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
                    resetForm();
                    setMessage("Đã hủy thay đổi.");
                  }}
                >
                  Hủy
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="summary-section" aria-labelledby="summary-title">
          <div className="section-heading summary-heading">
            <div>
              <span className="section-kicker">TỔNG QUAN</span>
              <h2 id="summary-title">Bức tranh tài chính dự kiến</h2>
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
                <small>Vốn + lãi sau khấu trừ</small>
              </div>
            </article>
          </div>
          <p className="calculation-note">
            Lãi kép được tính theo ngày: gốc × (1 + lãi suất năm/365)^số ngày.
            Mức khấu trừ 5% được giữ theo công thức bạn cung cấp và chỉ mang
            tính tham khảo.
          </p>
        </section>

        <section className="list-section" aria-labelledby="list-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">DANH SÁCH</span>
              <h2 id="list-title">Các khoản gửi của bạn</h2>
            </div>
            <span className="deposit-count">
              {savings.length} {savings.length === 1 ? "khoản" : "khoản gửi"}
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
                const groupPrincipal = items.reduce(
                  (sum, item) => sum + item.amount,
                  0,
                );
                const groupInterest = items.reduce(
                  (sum, item) => sum + item.interestAfterTax,
                  0,
                );

                return (
                  <article className="savings-group" key={rate}>
                    <div className="group-header">
                      <div className="group-title">
                        <span className="rate-orb" aria-hidden="true">%</span>
                        <div>
                          <h3>Lãi suất {formatRate(rate)}%/năm</h3>
                          <p>{items.length} khoản gửi</p>
                        </div>
                      </div>
                      <div className="group-summary">
                        <div>
                          <span>Tổng nhận dự kiến</span>
                          <strong>
                            {formatCurrency(groupPrincipal + groupInterest)}
                          </strong>
                        </div>
                        <button
                          type="button"
                          className="btn-toggle"
                          onClick={() => toggleGroup(rate)}
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
                          const isHistoryExpanded =
                            expandedHistoryId === item.id;
                          const progress = getTermProgress(
                            item.startDate,
                            item.maturityDate,
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
                                    updateItemName(item.id, event.target.value)
                                  }
                                  onBlur={(event) =>
                                    finalizeItemName(
                                      item.id,
                                      event.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="item-amount">
                                <span>Vốn gửi</span>
                                <strong>{formatCurrency(item.amount)}</strong>
                              </div>
                              <div className="item-actions">
                                <button
                                  type="button"
                                  className="btn-reinvest"
                                  onClick={() => prepareItem(item, "reinvest")}
                                >
                                  ↻ Tái đầu tư
                                </button>
                                <button
                                  type="button"
                                  className="btn-edit"
                                  onClick={() => prepareItem(item, "edit")}
                                >
                                  Sửa
                                </button>
                                <button
                                  type="button"
                                  className="btn-delete"
                                  onClick={() => handleDelete(item.id)}
                                >
                                  Xóa
                                </button>
                              </div>
                            </div>
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
                            </div>
                            <div
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
                            </div>
                            <>
                                <button
                                  type="button"
                                  className="history-toggle"
                                  onClick={() =>
                                    setExpandedHistoryId((current) =>
                                      current === item.id ? null : item.id,
                                    )
                                  }
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
                                              <div className="rollover-link">
                                                <span aria-hidden="true">↓</span>
                                                Tái đầu tư{" "}
                                                <strong>
                                                  {formatCurrency(
                                                    cycle.totalAmount,
                                                  )}
                                                </strong>{" "}
                                                vào kỳ {cycleIndex + 2}
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

        <footer>
          <p>
            Công cụ lập kế hoạch cá nhân · Kết quả là ước tính và có thể khác
            cách tính của từng ngân hàng.
          </p>
        </footer>
      </div>
    </main>
  );
}
