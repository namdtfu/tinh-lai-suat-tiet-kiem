"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  FinanceCurrency,
  FinanceState,
  formatFinanceAmountInput,
  parseFinanceAmountInput,
} from "@/lib/finance";
import {
  calculateFinancialGoalProgress,
  ExchangeRateSettings,
  FinancialGoal,
  FinancialGoalType,
  GoalSavingsSource,
} from "@/lib/planning";
import styles from "./financial-goals.module.css";

type FinancialGoalsProps = {
  exchangeSettings: ExchangeRateSettings;
  finance: FinanceState;
  goals: FinancialGoal[];
  onChange: (goals: FinancialGoal[]) => void;
  savingsSources: GoalSavingsSource[];
};

const goalTypeOptions: Array<{
  icon: string;
  label: string;
  value: FinancialGoalType;
}> = [
  { icon: "☂", label: "Quỹ khẩn cấp", value: "emergency" },
  { icon: "⌂", label: "Mua nhà", value: "home" },
  { icon: "✈", label: "Du lịch", value: "travel" },
  { icon: "◇", label: "Học phí", value: "education" },
  { icon: "◎", label: "Mục tiêu khác", value: "custom" },
];

const moneyFormatters: Record<FinanceCurrency, Intl.NumberFormat> = {
  KRW: new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }),
  VND: new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }),
};

function formatMoney(value: number, currency: FinanceCurrency) {
  return moneyFormatters[currency].format(Math.round(value));
}

function createId() {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function FinancialGoals({
  exchangeSettings,
  finance,
  goals,
  onChange,
  savingsSources,
}: FinancialGoalsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<FinancialGoalType>("emergency");
  const [targetAmount, setTargetAmount] = useState("");
  const [currency, setCurrency] = useState<FinanceCurrency>("VND");
  const [deadline, setDeadline] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [linkedAccountIds, setLinkedAccountIds] = useState<string[]>([]);
  const [linkedSavingsIds, setLinkedSavingsIds] = useState<number[]>([]);

  const goalProgress = useMemo(
    () =>
      goals.map((goal) => ({
        goal,
        progress: calculateFinancialGoalProgress(
          goal,
          finance,
          savingsSources,
          exchangeSettings,
        ),
      })),
    [exchangeSettings, finance, goals, savingsSources],
  );
  const completedCount = goalProgress.filter(
    ({ progress }) => progress.percentage >= 100,
  ).length;
  const linkedSourceCount = new Set([
    ...goals.flatMap((goal) => goal.linkedAccountIds.map((id) => `a:${id}`)),
    ...goals.flatMap((goal) => goal.linkedSavingsIds.map((id) => `s:${id}`)),
  ]).size;

  function resetForm() {
    setEditingId("");
    setName("");
    setType("emergency");
    setTargetAmount("");
    setCurrency("VND");
    setDeadline("");
    setManualAmount("");
    setLinkedAccountIds([]);
    setLinkedSavingsIds([]);
  }

  function openNewGoal() {
    resetForm();
    setModalOpen(true);
  }

  function editGoal(goal: FinancialGoal) {
    setEditingId(goal.id);
    setName(goal.name);
    setType(goal.type);
    setTargetAmount(formatFinanceAmountInput(goal.targetAmount));
    setCurrency(goal.currency);
    setDeadline(goal.deadline ?? "");
    setManualAmount(
      goal.manualAmount ? formatFinanceAmountInput(goal.manualAmount) : "",
    );
    setLinkedAccountIds(goal.linkedAccountIds);
    setLinkedSavingsIds(goal.linkedSavingsIds);
    setModalOpen(true);
  }

  function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedTarget = parseFinanceAmountInput(targetAmount);
    if (!name.trim() || !parsedTarget) return;
    const existing = goals.find((goal) => goal.id === editingId);
    const nextGoal: FinancialGoal = {
      id: existing?.id ?? createId(),
      name: name.trim().slice(0, 120),
      type,
      targetAmount: parsedTarget,
      currency,
      ...(deadline ? { deadline } : {}),
      linkedAccountIds,
      linkedSavingsIds,
      manualAmount: parseFinanceAmountInput(manualAmount),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    onChange(
      existing
        ? goals.map((goal) => (goal.id === existing.id ? nextGoal : goal))
        : [nextGoal, ...goals],
    );
    setModalOpen(false);
    resetForm();
  }

  function removeGoal(goal: FinancialGoal) {
    if (!window.confirm(`Xóa mục tiêu “${goal.name}”?`)) return;
    onChange(goals.filter((item) => item.id !== goal.id));
  }

  function toggleAccount(id: string) {
    setLinkedAccountIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSavings(id: number) {
    setLinkedSavingsIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <section className={styles.shell} aria-label="Mục tiêu tài chính">
      <div className={styles.hero}>
        <div>
          <span className={styles.kicker}>BẢN ĐỒ MỤC TIÊU</span>
          <h2>Biến từng khoản tiền thành một kế hoạch cụ thể</h2>
          <p>
            Gắn tài khoản và khoản tiết kiệm vào mục tiêu. Tiến độ tự cập nhật
            theo số dư thực tế và tỷ giá bạn đã chọn.
          </p>
        </div>
        <button type="button" onClick={openNewGoal}>＋ Thêm mục tiêu</button>
      </div>

      <div className={styles.summary}>
        <article><span>Mục tiêu đang theo dõi</span><strong>{goals.length}</strong></article>
        <article><span>Đã hoàn thành</span><strong>{completedCount}</strong></article>
        <article><span>Nguồn tiền đã liên kết</span><strong>{linkedSourceCount}</strong></article>
        <article><span>Tỷ giá quy đổi</span><strong>1 KRW = {exchangeSettings.krwToVndRate.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} VND</strong></article>
      </div>

      {goalProgress.length ? (
        <div className={styles.grid}>
          {goalProgress.map(({ goal, progress }) => {
            const meta =
              goalTypeOptions.find((item) => item.value === goal.type) ??
              goalTypeOptions[4];
            const sourceCount =
              goal.linkedAccountIds.length + goal.linkedSavingsIds.length;
            return (
              <article className={styles.goalCard} key={goal.id}>
                <div className={styles.cardHeading}>
                  <span className={styles.goalIcon} aria-hidden="true">{meta.icon}</span>
                  <div><small>{meta.label}</small><h3>{goal.name}</h3></div>
                  <div className={styles.cardActions}>
                    <button type="button" onClick={() => editGoal(goal)} aria-label={`Sửa ${goal.name}`}>Sửa</button>
                    <button type="button" onClick={() => removeGoal(goal)} aria-label={`Xóa ${goal.name}`}>×</button>
                  </div>
                </div>
                <div className={styles.amountRow}>
                  <div><span>Đã có</span><strong>{formatMoney(progress.currentAmount, goal.currency)}</strong></div>
                  <div><span>Mục tiêu</span><strong>{formatMoney(goal.targetAmount, goal.currency)}</strong></div>
                </div>
                <div className={styles.progressHeader}>
                  <span>{Math.round(progress.percentage)}% hoàn thành</span>
                  <span>Còn {formatMoney(progress.remaining, goal.currency)}</span>
                </div>
                <div className={styles.progressTrack} role="progressbar" aria-label={`Tiến độ ${goal.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percentage)}>
                  <span style={{ width: `${progress.percentage}%` }} />
                </div>
                <div className={styles.sourceBreakdown}>
                  <span>Tài khoản <b>{formatMoney(progress.accountValue, goal.currency)}</b></span>
                  <span>Tiết kiệm <b>{formatMoney(progress.savingsValue, goal.currency)}</b></span>
                  {progress.manualAmount > 0 && <span>Ngoài hệ thống <b>{formatMoney(progress.manualAmount, goal.currency)}</b></span>}
                </div>
                <footer>
                  <span>{sourceCount ? `${sourceCount} nguồn tiền liên kết` : "Chưa liên kết nguồn tiền"}</span>
                  <span>{goal.deadline ? `Hạn ${new Intl.DateTimeFormat("vi-VN").format(new Date(`${goal.deadline}T00:00:00`))}` : "Không đặt thời hạn"}</span>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <span aria-hidden="true">◎</span>
          <h3>Bắt đầu với quỹ khẩn cấp</h3>
          <p>Hoặc tạo kế hoạch mua nhà, du lịch, học phí và bất kỳ mục tiêu nào của bạn.</p>
          <button type="button" onClick={openNewGoal}>Tạo mục tiêu đầu tiên</button>
        </div>
      )}

      {modalOpen && (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setModalOpen(false); }}>
          <form className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="financial-goal-title" onSubmit={submitGoal}>
            <div className={styles.modalHeading}>
              <div><span>{editingId ? "CHỈNH SỬA" : "MỤC TIÊU MỚI"}</span><h3 id="financial-goal-title">{editingId ? "Cập nhật kế hoạch" : "Bạn đang hướng tới điều gì?"}</h3></div>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Đóng">×</button>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.wide}>Tên mục tiêu<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Quỹ khẩn cấp 6 tháng" /></label>
              <label>Loại mục tiêu<select value={type} onChange={(event) => setType(event.target.value as FinancialGoalType)}>{goalTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.icon} {item.label}</option>)}</select></label>
              <label>Đơn vị<select value={currency} onChange={(event) => setCurrency(event.target.value as FinanceCurrency)}><option value="VND">VND</option><option value="KRW">KRW</option></select></label>
              <label>Số tiền mục tiêu<input required inputMode="numeric" value={targetAmount} onChange={(event) => setTargetAmount(formatFinanceAmountInput(event.target.value))} placeholder="100.000.000" /></label>
              <label>Thời hạn (không bắt buộc)<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
              <label className={styles.wide}>Đã tích lũy ngoài các tài khoản bên dưới<input inputMode="numeric" value={manualAmount} onChange={(event) => setManualAmount(formatFinanceAmountInput(event.target.value))} placeholder="0" /></label>
            </div>
            <div className={styles.sourcePicker}>
              <div><span>TÀI KHOẢN</span><small>Số dư được quy đổi tự động</small></div>
              <div className={styles.checkGrid}>
                {finance.accounts.map((account) => <label key={account.id}><input type="checkbox" checked={linkedAccountIds.includes(account.id)} onChange={() => toggleAccount(account.id)} /><span>{account.icon} {account.name}<small>{account.currency}</small></span></label>)}
                {!finance.accounts.length && <p>Chưa có tài khoản để liên kết.</p>}
              </div>
            </div>
            <div className={styles.sourcePicker}>
              <div><span>KHOẢN TIẾT KIỆM</span><small>Giá trị hiện tại gồm lãi tích lũy</small></div>
              <div className={styles.checkGrid}>
                {savingsSources.map((item) => <label key={item.id}><input type="checkbox" checked={linkedSavingsIds.includes(item.id)} onChange={() => toggleSavings(item.id)} /><span>◇ {item.name}<small>{item.bankName || formatMoney(item.currentValueVnd, "VND")}</small></span></label>)}
                {!savingsSources.length && <p>Chưa có khoản tiết kiệm đang hoạt động.</p>}
              </div>
            </div>
            <div className={styles.modalActions}><button type="button" onClick={() => setModalOpen(false)}>Hủy</button><button type="submit">{editingId ? "Lưu thay đổi" : "Tạo mục tiêu"}</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
