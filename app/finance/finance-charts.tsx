import type {
  FinanceCategoryBreakdownItem,
  FinanceCurrency,
  FinanceDailyTrendItem,
} from "@/lib/finance";
import styles from "../finance-manager.module.css";
import { formatMoney } from "./formatters";

function getDonutGradient(items: FinanceCategoryBreakdownItem[]) {
  if (!items.length) return "#ece8f1";
  const visibleItems = items.slice(0, 4);
  let offset = 0;
  const stops = visibleItems.map((item) => {
    const start = offset;
    offset = Math.min(100, offset + item.percentage);
    return `${item.category.color} ${start}% ${offset}%`;
  });
  if (offset < 100) stops.push(`#d9d3e1 ${offset}% 100%`);
  return `conic-gradient(${stops.join(", ")})`;
}

export function CategoryBreakdownChart({
  currency,
  emptyLabel,
  items,
  title,
  total,
}: {
  currency: FinanceCurrency;
  emptyLabel: string;
  items: FinanceCategoryBreakdownItem[];
  title: string;
  total: number;
}) {
  return (
    <section className={styles.breakdownCard}>
      <div className={styles.breakdownHeading}>
        <span>{title}</span>
        <strong>{formatMoney(total, currency)}</strong>
      </div>
      {items.length ? (
        <>
          <div className={styles.donutRow}>
            <div
              className={styles.donut}
              style={{ background: getDonutGradient(items) }}
              role="img"
              aria-label={`Phân bổ ${title.toLowerCase()} theo nhóm`}
            >
              <span><b>{items.length}</b> nhóm</span>
            </div>
            <div className={styles.donutLegend}>
              {items.slice(0, 4).map((item) => (
                <div key={item.category.id}>
                  <i style={{ background: item.category.color }} />
                  <span>{item.category.icon} {item.category.name}</span>
                  <b>{Math.round(item.percentage)}%</b>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.breakdownList}>
            {items.map((item) => (
              <div key={item.category.id}>
                <span
                  className={styles.roundIcon}
                  style={{
                    background: `${item.category.color}20`,
                    color: item.category.color,
                  }}
                >
                  {item.category.icon}
                </span>
                <span>
                  <strong>{item.category.name}</strong>
                  <small>{item.transactionCount} giao dịch</small>
                </span>
                <b>{formatMoney(item.amount, currency)}</b>
                <em>{Math.round(item.percentage)}%</em>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.breakdownEmpty}>{emptyLabel}</div>
      )}
    </section>
  );
}

export function FinanceTrendChart({
  compact = false,
  currency,
  items,
}: {
  compact?: boolean;
  currency: FinanceCurrency;
  items: FinanceDailyTrendItem[];
}) {
  const maximum = Math.max(
    1,
    ...items.flatMap((item) => [
      item.cumulativeIncome,
      item.cumulativeExpense,
    ]),
  );
  return (
    <div
      className={`${styles.trendChart} ${compact ? styles.compactTrend : ""}`}
      role="img"
      aria-label="Xu hướng thu chi lũy kế theo ngày"
    >
      <div
        className={styles.trendColumns}
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(3px, 1fr))`,
        }}
      >
        {items.map((item) => (
          <span
            key={item.day}
            className={styles.trendColumn}
            title={`Ngày ${item.day}: thu ${formatMoney(item.cumulativeIncome, currency)}, chi ${formatMoney(item.cumulativeExpense, currency)}`}
          >
            <i
              className={styles.incomeTrend}
              style={{ height: `${Math.max(2, (item.cumulativeIncome / maximum) * 100)}%` }}
            />
            <i
              className={styles.expenseTrend}
              style={{ height: `${Math.max(2, (item.cumulativeExpense / maximum) * 100)}%` }}
            />
          </span>
        ))}
      </div>
      <div className={styles.trendAxis}>
        <span>01</span>
        <span>{String(Math.ceil(items.length / 2)).padStart(2, "0")}</span>
        <span>{String(items.length).padStart(2, "0")}</span>
      </div>
    </div>
  );
}
