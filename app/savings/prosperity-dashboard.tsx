'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  calculateProsperity,
  calculateProsperityValueOnDate,
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
  name: string;
  startDate: string;
  termWeeks: string;
};

function createForm(today: string): ProsperityForm {
  return {
    amount: '',
    annualInterestRate: '7.5',
    name: '',
    startDate: today,
    termWeeks: '10',
  };
}

export default function ProsperityDashboard({
  items,
  onAdd,
  onDelete,
  onHarvest,
  today,
}: {
  items: ProsperityItem[];
  onAdd: (item: ProsperityItem) => void;
  onDelete: (id: string) => void;
  onHarvest: (id: string) => void;
  today: string;
}) {
  const [form, setForm] = useState<ProsperityForm>(() => createForm(today));
  const [message, setMessage] = useState('');

  const amount = parseAmount(form.amount);
  const annualInterestRate = Number(form.annualInterestRate);
  const termWeeks = Number(form.termWeeks);
  const preview = useMemo(() => {
    if (
      amount <= 0 ||
      annualInterestRate <= 0 ||
      annualInterestRate > 100 ||
      !Number.isInteger(termWeeks) ||
      termWeeks < 1 ||
      termWeeks > 260 ||
      !form.startDate
    ) {
      return null;
    }
    return calculateProsperity(
      amount,
      annualInterestRate,
      termWeeks,
      form.startDate,
    );
  }, [amount, annualInterestRate, form.startDate, termWeeks]);

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
      setMessage('Kiểm tra lại số tiền, lãi suất, số tuần và ngày bắt đầu.');
      return;
    }

    const item: ProsperityItem = {
      id: `prosperity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: form.name.trim() || `Phát lộc ${termWeeks} tuần`,
      amount,
      annualInterestRate,
      termWeeks,
      startDate: form.startDate,
      ...preview,
      status: 'growing',
    };
    onAdd(item);
    setForm(createForm(today));
    setMessage(`Đã gieo ${formatCurrency(amount)} trong ${termWeeks} tuần.`);
  }

  function confirmDelete(item: ProsperityItem) {
    if (
      window.confirm(
        `Xóa “${item.name}”? Thao tác này chỉ xóa khỏi sổ Phát lộc.`,
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
          <span className='prosperity-kicker'>GIEO MỘT KHOẢN MỚI</span>
          <h2 id='prosperity-create-title'>Nhập tiền, chọn số tuần</h2>
          <p>
            Không có chợ hay hạt giống ảo. Mỗi lần nhập là một khoản Phát lộc
            độc lập, có ngày thu hoạch và lợi nhuận dự kiến rõ ràng.
          </p>
          <div className='prosperity-formula'>
            <span>Cách tính</span>
            <strong>Gốc × lãi suất năm × (số tuần × 7) / 365</strong>
            <small>Lãi đơn dự kiến, chưa trừ phí hoặc thuế nếu có.</small>
          </div>
        </div>

        <form className='prosperity-form' onSubmit={handleSubmit}>
          <label>
            Tên khoản <small>(không bắt buộc)</small>
            <input
              value={form.name}
              maxLength={200}
              onChange={(event) => updateForm('name', event.target.value)}
              placeholder={`Ví dụ: Phát lộc ${form.termWeeks || 10} tuần`}
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
          <fieldset>
            <legend>Thời gian ươm</legend>
            <div className='week-presets'>
              {WEEK_PRESETS.map((weeks) => (
                <button
                  key={weeks}
                  type='button'
                  aria-pressed={form.termWeeks === String(weeks)}
                  onClick={() => updateForm('termWeeks', String(weeks))}
                >
                  {weeks} tuần
                </button>
              ))}
            </div>
            <label className='custom-week-field'>
              Hoặc nhập số tuần
              <input
                type='number'
                min='1'
                max='260'
                step='1'
                value={form.termWeeks}
                onChange={(event) => updateForm('termWeeks', event.target.value)}
              />
            </label>
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
                  value={form.annualInterestRate}
                  onChange={(event) =>
                    updateForm('annualInterestRate', event.target.value)
                  }
                />
                <span>%</span>
              </span>
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
          <button className='prosperity-submit' type='submit'>
            <span aria-hidden='true'>＋</span>
            Tạo khoản Phát lộc
          </button>
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
                        {item.termWeeks} tuần · bắt đầu {formatDate(item.startDate)}
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
                  </div>
                  <div className='prosperity-item-actions'>
                    {!harvested && progress.isReady && (
                      <button type='button' onClick={() => onHarvest(item.id)}>
                        Thu hoạch khoản này
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
