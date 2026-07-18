'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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
  settlementAccountId: string;
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
    settlementAccountId: '',
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
  onEditorOpenChange,
  onOpenFinance,
  onSave,
  today,
}: {
  accounts: FinanceAccount[];
  items: ProsperityItem[];
  onDelete: (id: string) => void;
  onHarvest: (id: string) => boolean;
  onEditorOpenChange: (open: boolean) => void;
  onOpenFinance: () => void;
  onSave: (item: ProsperityItem) => void;
  today: string;
}) {
  const [form, setForm] = useState<ProsperityForm>(() => createForm(today));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
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
        totals.projectedTax += item.projectedTax;
        return totals;
      },
      {
        accruedProfit: 0,
        principal: 0,
        projectedProfit: 0,
        projectedTax: 0,
      },
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

  function closeForm() {
    setEditingId(null);
    setForm(createForm(today));
    setFormOpen(false);
    setMessage('');
    onEditorOpenChange(false);
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(createForm(today));
    setMessage('');
    setFormOpen(true);
    onEditorOpenChange(false);
  }

  useEffect(() => {
    if (!formOpen && !editingId) return;

    const previousOverflow = document.body.style.overflow;
    if (formOpen) document.body.style.overflow = 'hidden';

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setEditingId(null);
      setForm(createForm(today));
      setFormOpen(false);
      setMessage('');
      onEditorOpenChange(false);
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [editingId, formOpen, onEditorOpenChange, today]);

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
    if (!fundingAccountId) {
      setMessage(
        'Chọn tài khoản nguồn VND để tiền đầu tư được trừ và theo dõi đúng.',
      );
      return;
    }
    const settlementAccountId = accounts.some(
      (account) => account.id === form.settlementAccountId,
    )
      ? form.settlementAccountId
      : fundingAccountId;
    const item: ProsperityItem = {
      id:
        existingItem?.id ??
        `prosperity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name:
        form.name.trim() ||
        `Phát lộc ${formatProsperityTerm(termWeeks, termDays)}`,
      amount,
      annualInterestRate,
      fundingAccountId,
      settlementAccountId,
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
    setFormOpen(false);
    onEditorOpenChange(false);
    setMessage(
      existingItem
        ? `Đã lưu thay đổi cho “${item.name}”.`
        : `Đã gieo ${formatCurrency(amount)} trong ${formatProsperityTerm(termWeeks, termDays)}.`,
    );
  }

  function startEditing(item: ProsperityItem) {
    setEditingId(item.id);
    setFormOpen(false);
    onEditorOpenChange(true);
    setForm({
      amount: formatAmountInput(item.amount),
      annualInterestRate: String(item.annualInterestRate),
      fundingAccountId: item.fundingAccountId ?? '',
      name: item.name,
      settlementAccountId:
        item.settlementAccountId ?? item.fundingAccountId ?? '',
      startDate: item.startDate,
      termDays: String(item.termDays),
      termWeeks: String(item.termWeeks),
    });
    setMessage(`Đang chỉnh sửa “${item.name}”.`);
  }

  function cancelEditing() {
    closeForm();
  }

  function confirmDelete(item: ProsperityItem) {
    if (
      window.confirm(
        `Xóa “${item.name}”? Mọi giao dịch đầu tư và thu hoạch liên kết sẽ bị xóa, số dư tài khoản sẽ được tính lại.`,
      )
    ) {
      onDelete(item.id);
      if (editingId === item.id) closeForm();
      setMessage(`Đã xóa “${item.name}”.`);
    }
  }

  function harvest(item: ProsperityItem) {
    if (!onHarvest(item.id)) {
      startEditing(item);
      setMessage(
        'Chọn tài khoản nhận VND còn tồn tại rồi lưu lại trước khi thu hoạch.',
      );
      return;
    }
    const settlementAccount =
      accounts.find(
        (account) => account.id === item.settlementAccountId,
      ) ??
      accounts.find(
        (account) => account.id === item.fundingAccountId,
      );
    setMessage(
      `Đã thu hoạch “${item.name}” và trả ${formatCurrency(item.projectedTotal)} về ${settlementAccount?.name ?? 'tài khoản đã chọn'}.`,
    );
  }

  return (
    <div className='prosperity-workspace'>
      <section className='prosperity-command-bar' aria-label='Thao tác Phát lộc'>
        <div>
          <span className='prosperity-kicker'>PHÁT LỘC</span>
          <strong>Quản lý các khoản đang ươm</strong>
          <small>Gieo khoản mới ngay tại đây, không cần cuộn qua biểu mẫu dài.</small>
        </div>
        <button type='button' onClick={openCreateForm}>
          <span aria-hidden='true'>＋</span>
          Thêm khoản Phát lộc
        </button>
      </section>
      {message && !formOpen && !editingId && (
        <div className='prosperity-page-message' role='status'>
          <span aria-hidden='true'>✓</span>
          {message}
          <button
            type='button'
            onClick={() => setMessage('')}
            aria-label='Đóng thông báo'
          >
            ×
          </button>
        </div>
      )}

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
            <span>Lãi ròng đến hôm nay</span>
            <strong className='prosperity-positive'>
              +{formatCurrency(summary.accruedProfit)}
            </strong>
          </div>
          <div>
            <span>Lợi nhuận ròng dự kiến</span>
            <strong className='prosperity-positive'>
              +{formatCurrency(summary.projectedProfit)}
            </strong>
            <small>Thuế 5%: −{formatCurrency(summary.projectedTax)}</small>
          </div>
          <div>
            <span>Giá trị khi thu hoạch</span>
            <strong>
              {formatCurrency(summary.principal + summary.projectedProfit)}
            </strong>
          </div>
        </div>
      </section>

      {(formOpen || editingId) && (
        <div
          className={
            editingId ? 'prosperity-side-editor' : 'prosperity-modal-backdrop'
          }
          onMouseDown={(event) => {
            if (!editingId && event.currentTarget === event.target) closeForm();
          }}
        >
          <div
            className={
              editingId
                ? 'prosperity-side-editor-panel'
                : 'prosperity-form-modal'
            }
            role='dialog'
            aria-modal={editingId ? undefined : true}
            aria-label={
              editingId
                ? 'Chỉnh sửa khoản Phát lộc'
                : 'Thêm khoản Phát lộc mới'
            }
          >
            <button
              type='button'
              className='prosperity-form-close'
              onClick={closeForm}
              aria-label='Đóng biểu mẫu Phát lộc'
              autoFocus
            >
              ×
            </button>
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
              Gốc × lãi suất năm × số ngày / 365 × 95%
            </strong>
            <small>Lợi nhuận được khấu trừ 5% thuế khi thu hoạch.</small>
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
            Tài khoản nguồn
            <select
              required
              value={form.fundingAccountId}
              onChange={(event) =>
                updateForm('fundingAccountId', event.target.value)
              }
            >
              <option value=''>Chọn tài khoản trừ tiền</option>
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
          <label>
            Tài khoản nhận khi thu hoạch
            <select
              value={form.settlementAccountId}
              onChange={(event) =>
                updateForm('settlementAccountId', event.target.value)
              }
            >
              <option value=''>Cùng tài khoản nguồn</option>
              {form.settlementAccountId &&
                !accounts.some(
                  (account) => account.id === form.settlementAccountId,
                ) && (
                  <option value={form.settlementAccountId}>
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
              Khi thu hoạch, toàn bộ gốc và lãi ròng sau thuế sẽ quay về tài
              khoản này.
            </small>
          </label>
          <button
            className='prosperity-manage-accounts'
            type='button'
            onClick={() => {
              closeForm();
              onOpenFinance();
            }}
          >
            {accounts.length ? 'Quản lý tài khoản nguồn và nhận' : 'Tạo tài khoản VND để liên kết'}
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
                  <span>Lợi nhuận trước thuế</span>
                  <strong>
                    +{formatCurrency(preview.projectedGrossProfit)}
                  </strong>
                </div>
                <div>
                  <span>Thuế lợi nhuận (5%)</span>
                  <strong>−{formatCurrency(preview.projectedTax)}</strong>
                </div>
                <div>
                  <span>Lợi nhuận ròng</span>
                  <strong className='prosperity-positive'>
                    +{formatCurrency(preview.projectedProfit)}
                  </strong>
                </div>
                <div>
                  <span>Tổng nhận sau thuế</span>
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
            <button
              className='prosperity-cancel-edit'
              type='button'
              onClick={cancelEditing}
            >
              {editingId ? 'Hủy chỉnh sửa' : 'Hủy'}
            </button>
          </div>
        </form>
            </section>
          </div>
        </div>
      )}

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
            <p>Tạo khoản đầu tiên bằng nút “Thêm khoản Phát lộc” phía trên.</p>
          </div>
        ) : (
          <div className='prosperity-list'>
            {sortedItems.map((item) => {
              const progress = getProsperityProgress(item, today);
              const current = calculateProsperityValueOnDate(item, today);
              const fundingAccount = accounts.find(
                (account) => account.id === item.fundingAccountId,
              );
              const settlementAccount =
                accounts.find(
                  (account) => account.id === item.settlementAccountId,
                ) ??
                accounts.find(
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
                      <span>Lãi trước thuế</span>
                      <strong>
                        +{formatCurrency(item.projectedGrossProfit)}
                      </strong>
                    </div>
                    <div>
                      <span>Thuế lợi nhuận (5%)</span>
                      <strong>−{formatCurrency(item.projectedTax)}</strong>
                    </div>
                    <div>
                      <span>Lãi ròng</span>
                      <strong className='prosperity-positive'>
                        +{formatCurrency(item.projectedProfit)}
                      </strong>
                    </div>
                    <div>
                      <span>Thu hoạch sau thuế</span>
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
                        Giá trị ròng đến hôm nay: {formatCurrency(current.totalValue)}
                        {' · '}thuế tạm tính {formatCurrency(current.accruedTax)}
                      </small>
                    )}
                    <small className='prosperity-funding-source'>
                      Nguồn tiền: {fundingAccount
                        ? `${fundingAccount.icon} ${fundingAccount.name}`
                        : item.fundingAccountId
                          ? 'Tài khoản không còn tồn tại'
                          : 'Không liên kết tài khoản'}
                    </small>
                    <small className='prosperity-funding-source'>
                      {harvested ? 'Đã nhận về' : 'Sẽ nhận về'}:{' '}
                      {settlementAccount
                        ? `${settlementAccount.icon} ${settlementAccount.name}`
                        : 'Cần chọn tài khoản nhận'}
                    </small>
                  </div>
                  <div className='prosperity-item-actions'>
                    {!harvested && progress.isReady && (
                      <button type='button' onClick={() => harvest(item)}>
                        Thu hoạch khoản này
                      </button>
                    )}
                    {!harvested && (
                      <button
                        type='button'
                        className='prosperity-edit'
                        onClick={() => startEditing(item)}
                      >
                        Sửa
                      </button>
                    )}
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
