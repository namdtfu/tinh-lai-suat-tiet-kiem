"use client";

import { useMemo, useState } from "react";
import {
  formatCompactMoney,
  formatCurrency,
  formatMonthTitle,
  formatRate,
  getMonthKey,
  type SavingsItem,
} from "@/lib/savings";
import { buildSavingsTrend } from "@/lib/savings-trend";

const CHART = {
  bottom: 248,
  height: 270,
  left: 76,
  right: 902,
  top: 18,
  width: 920,
} as const;

function formatTrendMonth(monthKey: string, includeYear = false) {
  const [, month] = monthKey.split("-").map(Number);
  return includeYear
    ? `T${month}/${monthKey.slice(2, 4)}`
    : `T${month}`;
}

export default function SavingsTrendChart({
  savings,
  today,
}: {
  savings: SavingsItem[];
  today: string;
}) {
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(today));
  const trend = useMemo(
    () => buildSavingsTrend(savings, today, 12),
    [savings, today],
  );
  const selected =
    trend.find((point) => point.key === selectedMonth) ?? trend.at(-1);
  const selectedIndex = selected
    ? trend.findIndex((point) => point.key === selected.key)
    : -1;
  const previous = selectedIndex > 0 ? trend[selectedIndex - 1] : null;
  const startValue = trend[0]?.value ?? 0;
  const currentValue = trend.at(-1)?.value ?? 0;
  const periodChange = currentValue - startValue;
  const periodPercent =
    startValue > 0 ? (periodChange / startValue) * 100 : null;
  const selectedChange =
    selected && previous ? selected.value - previous.value : null;
  const values = trend.map((point) => point.value);
  const hasData = values.some((value) => value > 0);
  const rawMin = hasData ? Math.min(...values) : 0;
  const rawMax = hasData ? Math.max(...values) : 1;
  const padding = Math.max(
    1,
    (rawMax - rawMin) * 0.12,
    rawMax * 0.015,
  );
  const minValue = rawMin === 0 ? 0 : Math.max(0, rawMin - padding);
  const maxValue = rawMax + padding;
  const range = Math.max(1, maxValue - minValue);
  const plotWidth = CHART.right - CHART.left;
  const plotHeight = CHART.bottom - CHART.top;
  const chartPoints = trend.map((point, index) => ({
    ...point,
    x:
      CHART.left +
      (index / Math.max(1, trend.length - 1)) * plotWidth,
    y:
      CHART.top +
      ((maxValue - point.value) / range) * plotHeight,
  }));
  const linePath = chartPoints
    .map(
      (point, index) =>
        (index ? "L " : "M ") +
        point.x.toFixed(2) +
        " " +
        point.y.toFixed(2),
    )
    .join(" ");
  const areaPath = chartPoints.length
    ? linePath +
      " L " +
      chartPoints.at(-1)!.x.toFixed(2) +
      " " +
      CHART.bottom +
      " L " +
      chartPoints[0].x.toFixed(2) +
      " " +
      CHART.bottom +
      " Z"
    : "";
  const selectedPoint =
    selectedIndex >= 0 ? chartPoints[selectedIndex] : null;
  const tooltipX = selectedPoint
    ? selectedPoint.x > CHART.width - 226
      ? selectedPoint.x - 206
      : selectedPoint.x + 12
    : 0;
  const tooltipY = selectedPoint
    ? Math.max(8, Math.min(selectedPoint.y - 76, CHART.height - 76))
    : 0;
  const ticks = Array.from({ length: 4 }, (_, index) => ({
    value: maxValue - (index / 3) * range,
    y: CHART.top + (index / 3) * plotHeight,
  }));

  return (
    <div
      className={`savings-trend-card ${periodChange < 0 ? "decline" : "growth"}`}
      aria-labelledby="savings-trend-title"
    >
      <div className="savings-trend-heading">
        <div>
          <span className="savings-trend-kicker">12 THÁNG QUA</span>
          <h3 id="savings-trend-title">Tăng trưởng tiền tiết kiệm</h3>
          <p>Giá trị gốc cộng lãi ròng tích lũy tại từng thời điểm.</p>
        </div>
        <div className="savings-trend-current">
          <span>Hiện tại</span>
          <strong>{formatCurrency(currentValue)}</strong>
          <small>
            <span aria-hidden="true">{periodChange < 0 ? "▼" : "▲"}</span>{" "}
            {periodChange >= 0 ? "+" : ""}
            {formatCurrency(periodChange)}
            {periodPercent === null
              ? " · bắt đầu trong kỳ"
              : ` · ${periodPercent >= 0 ? "+" : ""}${formatRate(periodPercent)}%`}
          </small>
        </div>
      </div>

      <div className="savings-trend-plot">
        <svg
          className="savings-trend-svg"
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Biểu đồ giá trị tiền tiết kiệm trong 12 tháng, từ ${formatMonthTitle(trend[0]?.key ?? getMonthKey(today))} đến ${formatMonthTitle(trend.at(-1)?.key ?? getMonthKey(today))}`}
          aria-describedby="savings-trend-note"
        >
          <defs>
            <linearGradient id="savings-trend-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.015" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => (
            <g className="savings-trend-grid" key={tick.y}>
              <line x1={CHART.left} x2={CHART.right} y1={tick.y} y2={tick.y} />
              <text x={CHART.left - 11} y={tick.y + 4} textAnchor="end">
                {formatCompactMoney(tick.value)}
              </text>
            </g>
          ))}

          <path className="savings-trend-area" d={areaPath} fill="url(#savings-trend-area-fill)" />
          <path className="savings-trend-line" d={linePath} fill="none" />

          {selectedPoint && (
            <g className="savings-trend-selection" aria-hidden="true">
              <line x1={selectedPoint.x} x2={selectedPoint.x} y1={CHART.top} y2={CHART.bottom} />
              <circle cx={selectedPoint.x} cy={selectedPoint.y} r="6" />
            </g>
          )}

          {chartPoints.map((point, index) => {
            const isSelected = point.key === selected?.key;
            return (
              <g
                className={`savings-trend-point${isSelected ? " selected" : ""}`}
                key={point.key}
                role="button"
                tabIndex={0}
                aria-label={`${formatMonthTitle(point.key)}: ${formatCurrency(point.value)}, ${point.activeCount} khoản tiết kiệm`}
                onClick={() => setSelectedMonth(point.key)}
                onFocus={() => setSelectedMonth(point.key)}
                onPointerEnter={() => setSelectedMonth(point.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedMonth(point.key);
                  }
                }}
              >
                <circle className="savings-trend-hit" cx={point.x} cy={point.y} r="15" />
                <circle className="savings-trend-dot" cx={point.x} cy={point.y} r={isSelected ? 5 : 3} />
                {(index === 0 || index === chartPoints.length - 1 || index % 3 === 0) && (
                  <text
                    className="savings-trend-month"
                    x={point.x}
                    y={CHART.height - 5}
                    textAnchor={index === 0 ? "start" : index === chartPoints.length - 1 ? "end" : "middle"}
                  >
                    {formatTrendMonth(point.key, index === 0 || index === chartPoints.length - 1)}
                  </text>
                )}
              </g>
            );
          })}

          {selectedPoint && selected && (
            <g className="savings-trend-tooltip" transform={`translate(${tooltipX} ${tooltipY})`} aria-hidden="true">
              <rect width="194" height="68" rx="9" />
              <text className="tooltip-month" x="12" y="18">{formatMonthTitle(selected.key)}</text>
              <text className="tooltip-value" x="12" y="39">{formatCompactMoney(selected.value)}</text>
              <text className="tooltip-change" x="12" y="57">
                {selectedChange === null
                  ? "Mốc đầu tiên"
                  : `So với tháng trước ${selectedChange >= 0 ? "+" : ""}${formatCompactMoney(selectedChange)}`}
              </text>
            </g>
          )}
        </svg>
        {!hasData && (
          <div className="savings-trend-empty">
            <span aria-hidden="true">⌁</span>
            <p>Thêm khoản gửi để bắt đầu theo dõi đường tăng trưởng.</p>
          </div>
        )}
      </div>

      {selected && (
        <div className="savings-trend-detail" aria-live="polite">
          <div><span>Đang xem</span><strong>{formatMonthTitle(selected.key)}</strong></div>
          <div><span>Giá trị</span><strong>{formatCurrency(selected.value)}</strong></div>
          <div>
            <span>Thay đổi tháng</span>
            <strong className={selectedChange !== null && selectedChange < 0 ? "negative" : "positive"}>
              {selectedChange === null ? "—" : `${selectedChange >= 0 ? "+" : ""}${formatCurrency(selectedChange)}`}
            </strong>
          </div>
          <div>
            <span>Cấu thành</span>
            <strong>{formatCurrency(selected.principal)} gốc</strong>
            <small>+{formatCurrency(selected.interest)} lãi · {selected.activeCount} khoản</small>
          </div>
        </div>
      )}
      <p className="savings-trend-note" id="savings-trend-note">
        Mỗi điểm là cuối tháng; tháng hiện tại tính đến hôm nay. Khoản đã tất toán
        rời khỏi biểu đồ từ ngày tất toán, còn tái đầu tư tiếp tục theo kỳ mới.
      </p>
    </div>
  );
}
