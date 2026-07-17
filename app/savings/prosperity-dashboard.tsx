'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { FinanceAccount } from '@/lib/finance';
import {
  calculateProsperity,
  calculateProsperityValueOnDate,
  formatProsperityTerm,
  getProsperityProgress,
  type ProsperityItem,
} from '@/lib/prosperity';
import {
  formatAmountInput,
  formatCurrency,
  formatDate,
  formatRate,
  parseAmount,
} from '@/lib/savings';

const WEEK_PRESETS = [4, 8, 10, 12, 16];

type ProsperityForm = {
  amount: string;
  annualInterestRate: string;
  fundingAccountId: string;
  name: string;
  startDate: string;
  termDays: string;
  termWeeks: string;
};

function createForm(today: string): ProsperityForm {
  return {
    amount: '',
    annualInterestRate: '7.5',
    fundingAccountId: '',
    name: '',
    startDate: today,
    termDays: '0',
    termWeeks: '10',
  };
}

export default function ProsperityDashboard({
  accounts,
  items,
  onDelete,
  onHarvest,
  onOpenFinance,
  onSave,
  today,
}: {
  accounts: FinanceAccount[];
  items: ProsperityItem[];
  onDelete: (id: string) => void;
  onHarvest: (id: string) => void;
  onOpenFinance: () => void;
  onSave: (item: ProsperityItem) => void;
  today: string;
}) {
  const [form, setForm] = useState<ProsperityForm>(() => createForm(today));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const amount = parseAmount(form.amount);
  const annualInterestRateInput = Number(form.annualInterestRate);
  const annualInterestRate =
    Math.round(annualInterestRateInput * 100) / 100;
  const hasValidInterestRatePrecision =
    /^\d+(?:\.\d{0,2})?$/.test(form.annualInterestRate);
  const termDays = Number(form.termDays);
  const termWeeks = Number(form.termWeeks);
  const preview = useMemo(() => {
    if (
      amount <= 0 ||
      !hasValidInterestRatePrecision ||
      annualInterestRate <= 0 ||
      annualInterestRate > 100 ||
      !Number.isInteger(termWeeks) ||
      termWeeks < 0 ||
      termWeeks > 260 ||
      !Number.isInteger(termDays) ||
      termDays < 0 ||
      termDays > 6 ||
      termWeeks * 7 + termDays < 1 ||
      !form.startDate
    ) {
      return null;
    }
    return calculateProsperity(
      amount,
      annualInterestRate,
      termWeeks,
      form.startDate,
      termDays,
    );
  }, [
    amount,
    annualInterestRate,
    form.startDate,
    hasValidInterestRatePrecision,
    termDays,
    termWeeks,
  ]);

  const activeItems = useMemo(
    () => items.filter((item) => item.status === 'growing'),
    [items],
  );
  const summary = useMemo(() => {
    return activeItems.reduce(
      (totals, item) => {
        const current = calculateProsperityValueOnDate(item, today);
        totals.principal += item.amount;
        totals.accruedProfit += current.accruedProfit;
        totals.projectedProfit += item.projectedProfit;
        return totals;
      },
      { accruedProfit: 0, principal: 0, projectedProfit: 0 },
    );
  }, [activeItems, today]);

  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'growing' ? -1 : 1;
        }
        return left.harvestDate.localeCompare(right.harvestDate);
      }),
    [items],
  );

  function updateForm(field: keyof ProsperityForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) {
      setMessage('Kiểm tra lại số tiền, lãi suất, thời hạn và ngày bắt đầu.');
      return;
    }

    const existingItem = editingId
      ? items.find((item) => item.id === editingId)
      : undefined;
    const fundingAccountId = accounts.some(
      (account) => account.id === form.fundingAccountId,
    )
      ? form.fundingAccountId
      : '';
    const item: ProsperityItem = {
      id:
        existingItem?.id ??
        `prosperity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name:
        form.name.trim() ||
        `Phát lộc ${formatProsperityTerm(termWeeks, termDays)}`,
      amount,
      annualInterestRate,
      ...(fundingAccountId
        ? { fundingAccountId }
        : {}),
      termDays,
      termWeeks,
      startDate: form.startDate,
      ...preview,
      status: existingItem?.status ?? 'growing',
      ...(existingItem?.harvestedAt
        ? { harvestedAt: existingItem.harvestedAt }
        : {}),
    };
    onSave(item);
    setForm(createForm(today));
    setEditingId(null);
    setMessage(
      existingItem
        ? `Đã lưu thay đổi cho “${item.name}”.`
        : `Đã gieo ${formatCurrency(amount)} trong ${formatProsperityTerm(termWeeks, termDays)}.`,
    );
  }

  function startEditing(item: ProsperityItem) {
    setEditingId(item.id);
    setForm({
      amount: formatAmountInput(item.amount),
      annualInterestRate: String(item.annualInterestRate),
      fundingAccountId: item.fundingAccountId ?? '',
      name: item.name,
      startDate: item.startDate,
      termDays: String(item.termDays),
      termWeeks: String(item.termWeeks),
    });
    setMessage(`Đang chỉnh sửa “${item.name}”.`);
    document
      .getElementById('prosperity-form')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(createForm(today));
    setMessage('Đã hủy chỉnh sửa.');
  }

  function confirmDelete(item: ProsperityItem) {
    if (
      window.confirm(
        `Xóa “${item.name}”? Giao dịch đầu tư liên kết cũng sẽ bị xóa và số dư tài khoản nguồn được hoàn lại.`,
      )
    ) {
      onDelete(item.id);
    }
  }

  return (
    <div className='prosperity-workspace'>
      <section className='prosperity-vault' aria-labelledby='prosperity-vault-title'>
        <div className='prosperity-vault-heading'>
          <div>
            <span>KHO PHÁT LỘC</span>
            <h2 id='prosperity-vault-title'>Tiền đang ươm</h2>
          </div>
          <span className='prosperity-count'>{activeItems.length} khoản</span>
        </div>
        <div className='prosperity-summary-grid'>
          <div>
            <span>Tổng gốc riêng</span>
            <strong>{formatCurrency(summary.principal)}</strong>
          </div>
          <div>
            <span>Lãi đến hôm nay</span>
            <strong className='prosperity-positive'>
              +{formatCurrency(summary.accruedProfit)}
            </strong>
          </div>
          <div>
            <span>Lợi nhuận dự kiến</span>
            <strong className='prosperity-positive'>
              +{formatCurrency(summary.projectedProfit)}
            </strong>
          </div>
          <div>
            <span>Giá trị khi thu hoạch</span>
            <strong>
              {formatCurrency(summary.principal + summary.projectedProfit)}
            </strong>
          </div>
        </div>
      </section>

      <section className='prosperity-create-card' aria-labelledby='prosperity-create-title'>
        <div className='prosperity-create-copy'>
          <span className='prosperity-kicker'>
            {editingId ? 'CHỈNH SỬA KHOẢN PHÁT LỘC' : 'GIEO MỘT KHOẢN MỚI'}
          </span>
          <h2 id='prosperity-create-title'>
            {editingId ? 'Cập nhật khoản đang có' : 'Nhập tiền, chọn thời hạn'}
          </h2>
          <p>
            Không có chợ hay hạt giống ảo. Mỗi lần nhập là một khoản Phát lộc
            độc lập, có ngày thu hoạch và lợi nhuận dự kiến rõ ràng.
          </p>
          <div className='prosperity-formula'>
            <span>Cách tính</span>
            <strong>
              Gốc × lãi suất năm × ((số tuần × 7) + số ngày) / 365
            </strong>
            <small>Lãi đơn dự kiến, chưa trừ phí hoặc thuế nếu có.</small>
          </div>
        </div>

        <form className='prosperity-form' id='prosperity-form' onSubmit={handleSubmit}>
          <label>
            Tên khoản <small>(không bắt buộc)</small>
            <input
              value={form.name}
              maxLength={200}
              onChange={(event) => updateForm('name', event.target.value)}
              placeholder='Ví dụ: Phát lộc 12 tuần 4 ngày'
            />
          </label>
          <label>
            Số tiền gieo
            <span className='input-with-unit'>
              <input
                inputMode='numeric'
                value={form.amount}
                onChange={(event) =>
                  updateForm('amount', formatAmountInput(event.target.value))
                }
                placeholder='10.000.000'
                aria-label='Số tiền Phát lộc'
              />
              <span>₫</span>
            </span>
          </label>
          <label>
            Tài khoản nguồn <small>(không bắt buộc)</small>
            <select
              value={form.fundingAccountId}
              onChange={(event) =>
                updateForm('fundingAccountId', event.target.value)
              }
            >
              <option value=''>Không liên kết tài khoản</option>
              {form.fundingAccountId &&
                !accounts.some((account) => account.id === form.fundingAccountId) && (
                  <option value={form.fundingAccountId}>
                    Tài khoản không còn tồn tại
                  </option>
                )}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.icon} {account.name}
                </option>
              ))}
            </select>
            <small>
              Chọn tài khoản ngân hàng, ví điện tử hoặc tiền mặt. Khi lưu, số dư
              sẽ giảm đúng số tiền gieo.
            </small>
          </label>
          <button
            className='prosperity-manage-accounts'
            type='button'
            onClick={onOpenFinance}
          >
            {accounts.length ? 'Quản lý tài khoản nguồn' : 'Tạo tài khoản VND để liên kết'}
          </button>
          <fieldset>
            <legend>Thời gian ươm</legend>
            <div className='week-presets'>
              {WEEK_PRESETS.map((weeks) => (
                <button
                  key={weeks}
                  type='button'
                  aria-pressed={form.termWeeks === String(weeks)}
                  onClick={() => {
                    setForm((current) => ({
                      ...current,
                      termDays: '0',
                      termWeeks: String(weeks),
                    }));
                    setMessage('');
                  }}
                >
                  {weeks} tuần
                </button>
              ))}
            </div>
            <div className='prosperity-duration-fields'>
              <label>
                Số tuần
                <input
                  type='number'
                  min='0'
                  max='260'
                  step='1'
                  value={form.termWeeks}
                  onChange={(event) =>
                    updateForm('termWeeks', event.target.value)
                  }
                />
              </label>
              <label>
                Số ngày thêm
                <input
                  type='number'
                  min='0'
                  max='6'
                  step='1'
                  value={form.termDays}
                  onChange={(event) =>
                    updateForm('termDays', event.target.value)
                  }
                />
              </label>
            </div>
          </fieldset>
          <div className='prosperity-form-row'>
            <label>
              Lãi suất năm
              <span className='input-with-unit'>
                <input
                  type='number'
                  min='0.01'
                  max='100'
                  step='0.01'
                  placeholder='7.69'
                  value={form.annualInterestRate}
                  onChange={(event) =>
                    updateForm('annualInterestRate', event.target.value)
                  }
                />
                <span>%</span>
              </span>
              <small>Tối đa 2 chữ số sau dấu thập phân, ví dụ 7.69%.</small>
            </label>
            <label>
              Ngày bắt đầu
              <input
                type='date'
                value={form.startDate}
                onChange={(event) => updateForm('startDate', event.target.value)}
              />
            </label>
          </div>

          <div className='prosperity-preview' aria-live='polite'>
            {preview ? (
              <>
                <div>
                  <span>Thu hoạch ngày</span>
                  <strong>{formatDate(preview.harvestDate)}</strong>
                </div>
                <div>
                  <span>Lợi nhuận dự kiến</span>
                  <strong className='prosperity-positive'>
                    +{formatCurrency(preview.projectedProfit)}
                  </strong>
                </div>
                <div>
                  <span>Tổng nhận dự kiến</span>
                  <strong>{formatCurrency(preview.projectedTotal)}</strong>
                </div>
              </>
            ) : (
              <p>Nhập số tiền để xem ngày và lợi nhuận thu hoạch.</p>
            )}
          </div>
          {message && <p className='prosperity-message' role='status'>{message}</p>}
          <div className='prosperity-form-actions'>
            <button className='prosperity-submit' type='submit'>
              <span aria-hidden='true'>{editingId ? '✓' : '＋'}</span>
              {editingId ? 'Lưu thay đổi' : 'Tạo khoản Phát lộc'}
            </button>
            {editingId && (
              <button
                className='prosperity-cancel-edit'
                type='button'
                onClick={cancelEditing}
              >
                Hủy chỉnh sửa
              </button>
            )}
          </div>
        </form>
      </section>

      <section className='prosperity-list-section' aria-labelledby='prosperity-list-title'>
        <div className='prosperity-list-heading'>
          <div>
            <span>DANH SÁCH RIÊNG</span>
            <h2 id='prosperity-list-title'>Các khoản Phát lộc</h2>
          </div>
          <p>{items.length - activeItems.length} khoản đã thu hoạch</p>
        </div>

        {sortedItems.length === 0 ? (
          <div className='prosperity-empty'>
            <span aria-hidden='true'>♧</span>
            <h3>Kho Phát lộc đang trống</h3>
            <p>Tạo khoản đầu tiên ở biểu mẫu phía trên.</p>
          </div>
        ) : (
          <div className='prosperity-list'>
            {sortedItems.map((item) => {
              const progress = getProsperityProgress(item, today);
              const current = calculateProsperityValueOnDate(item, today);
              const fundingAccount = accounts.find(
                (account) => account.id === item.fundingAccountId,
              );
              const harvested = item.status === 'harvested';
              return (
                <article
                  className={`prosperity-item${harvested ? ' harvested' : ''}`}
                  key={item.id}
                >
                  <div className='prosperity-item-topline'>
                    <div className='prosperity-item-mark' aria-hidden='true'>♧</div>
                    <div>
                      <span className={`prosperity-status${progress.isReady && !harvested ? ' ready' : ''}`}>
                        {harvested
                          ? 'ĐÃ THU HOẠCH'
                          : progress.isReady
                            ? 'SẴN SÀNG THU HOẠCH'
                            : 'ĐANG ƯƠM'}
                      </span>
                      <h3>{item.name}</h3>
                    </div>
                    <strong className='prosperity-rate'>
                      {formatRate(item.annualInterestRate)}%/năm
                    </strong>
                  </div>
                  <div className='prosperity-item-values'>
                    <div>
                      <span>Gốc gieo</span>
                      <strong>{formatCurrency(item.amount)}</strong>
                    </div>
                    <div>
                      <span>Lãi dự kiến</span>
                      <strong className='prosperity-positive'>
                        +{formatCurrency(item.projectedProfit)}
                      </strong>
                    </div>
                    <div>
                      <span>Thu hoạch dự kiến</span>
                      <strong>{formatCurrency(item.projectedTotal)}</strong>
                    </div>
                  </div>
                  <div className='prosperity-timeline'>
                    <div className='prosperity-progress-copy'>
                      <span>
                        {formatProsperityTerm(item.termWeeks, item.termDays)} · bắt đầu{' '}
                        {formatDate(item.startDate)}
                      </span>
                      <strong>
                        {harvested
                          ? `Đã thu hoạch ${formatDate(item.harvestedAt ?? item.harvestDate)}`
                          : progress.isReady
                            ? `Đến hạn ${formatDate(item.harvestDate)}`
                            : `Còn ${progress.remainingDays} ngày · thu hoạch ${formatDate(item.harvestDate)}`}
                      </strong>
                    </div>
                    <div
                      className='prosperity-progress-track'
                      role='progressbar'
                      aria-label={`Tiến độ ${item.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress.percentage)}
                    >
                      <span style={{ width: `${progress.percentage}%` }} />
                    </div>
                    {!harvested && (
                      <small>
                        Giá trị đến hôm nay: {formatCurrency(current.totalValue)}
                      </small>
                    )}
                    <small className='prosperity-funding-source'>
                      Nguồn tiền: {fundingAccount
                        ? `${fundingAccount.icon} ${fundingAccount.name}`
                        : item.fundingAccountId
                          ? 'Tài khoản không còn tồn tại'
                          : 'Không liên kết tài khoản'}
                    </small>
                  </div>
                  <div className='prosperity-item-actions'>
                    {!harvested && progress.isReady && (
                      <button type='button' onClick={() => onHarvest(item.id)}>
                        Thu hoạch khoản này
                      </button>
                    )}
                    <button
                      type='button'
                      className='prosperity-edit'
                      onClick={() => startEditing(item)}
                    >
                      Sửa
                    </button>
                    <button
                      type='button'
                      className='prosperity-delete'
                      onClick={() => confirmDelete(item)}
                    >
                      Xóa
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
