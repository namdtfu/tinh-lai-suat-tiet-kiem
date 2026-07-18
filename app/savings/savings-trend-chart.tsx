"use client";

import { useMemo, useState } from "react";
import {
  formatCompactMoney,
  formatCurrency,
  formatDate,
  formatRate,
  type SavingsItem,
} from "@/lib/savings";
import {
  buildDailySavingsTrend,
  type SavingsTrendPoint,
} from "@/lib/savings-trend";

const CHART = {
  bottom: 248,
  height: 270,
  left: 76,
  right: 902,
  top: 18,
  width: 920,
} as const;

const MIN_VISIBLE_POINTS = 7;
const MAX_RENDERED_POINTS = 180;

type TrendRangeId = "1w" | "1m" | "6m" | "1y" | "all";

const TREND_RANGES: Array<{
  days: number | null;
  id: TrendRangeId;
  label: string;
  title: string;
}> = [
  { days: 7, id: "1w", label: "1 tuần", title: "1 TUẦN QUA" },
  { days: 30, id: "1m", label: "1 tháng", title: "1 THÁNG QUA" },
  { days: 183, id: "6m", label: "6 tháng", title: "6 THÁNG QUA" },
  { days: 365, id: "1y", label: "1 năm", title: "1 NĂM QUA" },
  { days: null, id: "all", label: "Tất cả", title: "TOÀN BỘ LỊCH SỬ" },
];

function shiftIsoDays(date: string, dayOffset: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + dayOffset))
    .toISOString()
    .slice(0, 10);
}

function getEarliestSavingsDate(savings: SavingsItem[], today: string) {
  const dates = savings.flatMap((item) => [
    item.startDate,
    ...(item.history ?? []).map((cycle) => cycle.startDate),
  ]);
  return (
    dates
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today)
      .sort()[0] ?? shiftIsoDays(today, -364)
  );
}

function formatTrendDate(date: string, includeYear = false) {
  const [year, month, day] = date.split("-").map(Number);
  return includeYear
    ? `${day}/${month}/${String(year).slice(2)}`
    : `${day}/${month}`;
}

function getVisiblePointCount(length: number, zoomLevel: number) {
  if (!length) return 0;
  return Math.min(
    length,
    Math.max(MIN_VISIBLE_POINTS, Math.ceil(length / 2 ** zoomLevel)),
  );
}

function sampleTrend(
  points: SavingsTrendPoint[],
  selectedDate: string,
  maximum = MAX_RENDERED_POINTS,
) {
  if (points.length <= maximum) return points;

  const indexes = new Set<number>([0, points.length - 1]);
  const interval = (points.length - 1) / (maximum - 1);
  for (let index = 1; index < maximum - 1; index += 1) {
    indexes.add(Math.round(index * interval));
  }
  const selectedIndex = points.findIndex((point) => point.date === selectedDate);
  if (selectedIndex >= 0) indexes.add(selectedIndex);

  return [...indexes]
    .sort((left, right) => left - right)
    .map((index) => points[index]);
}

export default function SavingsTrendChart({
  savings,
  today,
}: {
  savings: SavingsItem[];
  today: string;
}) {
  const [rangeId, setRangeId] = useState<TrendRangeId>("1y");
  const [selectedDate, setSelectedDate] = useState(today);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [windowEndIndex, setWindowEndIndex] = useState(
    Number.MAX_SAFE_INTEGER,
  );

  const activeRange =
    TREND_RANGES.find((range) => range.id === rangeId) ?? TREND_RANGES[3];
  const earliestDate = useMemo(
    () => getEarliestSavingsDate(savings, today),
    [savings, today],
  );
  const rangeStartDate = activeRange.days
    ? shiftIsoDays(today, -(activeRange.days - 1))
    : earliestDate;
  const trend = useMemo(
    () => buildDailySavingsTrend(savings, rangeStartDate, today),
    [rangeStartDate, savings, today],
  );
  const maxZoomLevel = trend.length
    ? Math.max(
        0,
        Math.floor(Math.log2(trend.length / MIN_VISIBLE_POINTS)),
      )
    : 0;
  const normalizedZoomLevel = Math.min(zoomLevel, maxZoomLevel);
  const visiblePointCount = getVisiblePointCount(
    trend.length,
    normalizedZoomLevel,
  );
  const endIndex = trend.length
    ? Math.min(
        trend.length - 1,
        Math.max(visiblePointCount - 1, windowEndIndex),
      )
    : -1;
  const startIndex = Math.max(0, endIndex - visiblePointCount + 1);
  const visibleTrend = trend.slice(startIndex, endIndex + 1);
  const selected =
    visibleTrend.find((point) => point.date === selectedDate) ??
    visibleTrend.at(-1);
  const selectedIndex = selected
    ? trend.findIndex((point) => point.date === selected.date)
    : -1;
  const previous = selectedIndex > 0 ? trend[selectedIndex - 1] : null;
  const startValue = visibleTrend[0]?.value ?? 0;
  const currentValue = visibleTrend.at(-1)?.value ?? 0;
  const periodChange = currentValue - startValue;
  const periodPercent =
    startValue > 0 ? (periodChange / startValue) * 100 : null;
  const selectedChange =
    selected && previous ? selected.value - previous.value : null;
  const values = visibleTrend.map((point) => point.value);
  const hasData = values.some((value) => value > 0);
  const rawMin = hasData ? Math.min(...values) : 0;
  const rawMax = hasData ? Math.max(...values) : 1;
  const padding = Math.max(1, (rawMax - rawMin) * 0.12, rawMax * 0.015);
  const minValue = rawMin === 0 ? 0 : Math.max(0, rawMin - padding);
  const maxValue = rawMax + padding;
  const valueRange = Math.max(1, maxValue - minValue);
  const plotWidth = CHART.right - CHART.left;
  const plotHeight = CHART.bottom - CHART.top;
  const renderedTrend = sampleTrend(
    visibleTrend,
    selected?.date ?? selectedDate,
  );
  const visibleIndexByDate = new Map(
    visibleTrend.map((point, index) => [point.date, index]),
  );
  const chartPoints = renderedTrend.map((point) => {
    const index = visibleIndexByDate.get(point.date) ?? 0;
    return {
      ...point,
      x:
        CHART.left +
        (index / Math.max(1, visibleTrend.length - 1)) * plotWidth,
      y:
        CHART.top +
        ((maxValue - point.value) / valueRange) * plotHeight,
    };
  });
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
  const selectedPoint = selected
    ? chartPoints.find((point) => point.date === selected.date)
    : null;
  const tooltipX = selectedPoint
    ? selectedPoint.x > CHART.width - 226
      ? selectedPoint.x - 206
      : selectedPoint.x + 12
    : 0;
  const tooltipY = selectedPoint
    ? Math.max(8, Math.min(selectedPoint.y - 76, CHART.height - 76))
    : 0;
  const ticks = Array.from({ length: 4 }, (_, index) => ({
    value: maxValue - (index / 3) * valueRange,
    y: CHART.top + (index / 3) * plotHeight,
  }));
  const axisLabelInterval = Math.max(1, Math.ceil(chartPoints.length / 6));
  const includeAxisYear = visibleTrend.length > 365 || rangeId === "all";
  const canPan = trend.length > visiblePointCount;

  function changeRange(nextRange: TrendRangeId) {
    setRangeId(nextRange);
    setSelectedDate(today);
    setZoomLevel(0);
    setWindowEndIndex(Number.MAX_SAFE_INTEGER);
  }

  function changeZoom(nextZoomLevel: number) {
    const nextLevel = Math.max(0, Math.min(maxZoomLevel, nextZoomLevel));
    if (nextLevel === normalizedZoomLevel || !trend.length) return;

    const nextCount = getVisiblePointCount(trend.length, nextLevel);
    const anchorIndex = selected
      ? trend.findIndex((point) => point.date === selected.date)
      : endIndex;
    const nextStart = Math.max(
      0,
      Math.min(
        trend.length - nextCount,
        anchorIndex - Math.floor(nextCount / 2),
      ),
    );
    setZoomLevel(nextLevel);
    setWindowEndIndex(nextStart + nextCount - 1);
    if (trend[anchorIndex]) setSelectedDate(trend[anchorIndex].date);
  }

  function moveWindow(nextStartIndex: number) {
    const nextStart = Math.max(
      0,
      Math.min(trend.length - visiblePointCount, nextStartIndex),
    );
    const nextEnd = nextStart + visiblePointCount - 1;
    setWindowEndIndex(nextEnd);
    if (selectedIndex < nextStart || selectedIndex > nextEnd) {
      setSelectedDate(trend[nextEnd]?.date ?? today);
    }
  }

  return (
    <div
      className={`savings-trend-card ${periodChange < 0 ? "decline" : "growth"}`}
      aria-labelledby="savings-trend-title"
    >
      <div className="savings-trend-heading">
        <div>
          <span className="savings-trend-kicker">
            {activeRange.title}
            {normalizedZoomLevel > 0
              ? ` · ĐANG XEM ${visibleTrend.length} NGÀY`
              : ""}
          </span>
          <h3 id="savings-trend-title">Tăng trưởng tiền tiết kiệm</h3>
          <p>Giá trị gốc cộng lãi ròng tích lũy tại từng thời điểm.</p>
        </div>
        <div className="savings-trend-current">
          <span>Cuối khoảng xem</span>
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

      <div className="savings-trend-toolbar">
        <div className="savings-trend-ranges" role="group" aria-label="Khoảng thời gian biểu đồ">
          {TREND_RANGES.map((range) => (
            <button
              type="button"
              key={range.id}
              className={range.id === rangeId ? "active" : ""}
              aria-pressed={range.id === rangeId}
              onClick={() => changeRange(range.id)}
            >
              {range.label}
            </button>
          ))}
        </div>
        <div className="savings-trend-zoom" role="group" aria-label="Phóng to và thu nhỏ biểu đồ">
          <button
            type="button"
            onClick={() => changeZoom(normalizedZoomLevel - 1)}
            disabled={normalizedZoomLevel === 0}
            aria-label="Thu nhỏ để xem nhiều thời gian hơn"
          >
            −
          </button>
          <span>{visibleTrend.length} ngày</span>
          <button
            type="button"
            onClick={() => changeZoom(normalizedZoomLevel + 1)}
            disabled={normalizedZoomLevel >= maxZoomLevel}
            aria-label="Phóng to để xem chi tiết hơn"
          >
            +
          </button>
        </div>
      </div>

      <div
        className="savings-trend-plot"
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          changeZoom(
            normalizedZoomLevel + (event.deltaY < 0 ? 1 : -1),
          );
        }}
      >
        <svg
          className="savings-trend-svg"
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Biểu đồ giá trị tiền tiết kiệm từ ${formatDate(visibleTrend[0]?.date ?? today)} đến ${formatDate(visibleTrend.at(-1)?.date ?? today)}`}
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
            const isSelected = point.date === selected?.date;
            return (
              <g
                className={`savings-trend-point${isSelected ? " selected" : ""}`}
                key={point.date}
                role="button"
                tabIndex={0}
                aria-label={`${formatDate(point.date)}: ${formatCurrency(point.value)}, ${point.activeCount} khoản tiết kiệm`}
                onClick={() => setSelectedDate(point.date)}
                onFocus={() => setSelectedDate(point.date)}
                onPointerEnter={() => setSelectedDate(point.date)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedDate(point.date);
                  }
                }}
              >
                <circle className="savings-trend-hit" cx={point.x} cy={point.y} r="15" />
                <circle className="savings-trend-dot" cx={point.x} cy={point.y} r={isSelected ? 5 : 3} />
                {(index === 0 ||
                  index === chartPoints.length - 1 ||
                  index % axisLabelInterval === 0) && (
                  <text
                    className="savings-trend-month"
                    x={point.x}
                    y={CHART.height - 5}
                    textAnchor={index === 0 ? "start" : index === chartPoints.length - 1 ? "end" : "middle"}
                  >
                    {formatTrendDate(point.date, includeAxisYear)}
                  </text>
                )}
              </g>
            );
          })}

          {selectedPoint && selected && (
            <g className="savings-trend-tooltip" transform={`translate(${tooltipX} ${tooltipY})`} aria-hidden="true">
              <rect width="194" height="68" rx="9" />
              <text className="tooltip-month" x="12" y="18">{formatDate(selected.date)}</text>
              <text className="tooltip-value" x="12" y="39">{formatCompactMoney(selected.value)}</text>
              <text className="tooltip-change" x="12" y="57">
                {selectedChange === null
                  ? "Mốc đầu tiên"
                  : `So với ngày trước ${selectedChange >= 0 ? "+" : ""}${formatCompactMoney(selectedChange)}`}
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

      {canPan && (
        <div className="savings-trend-navigator">
          <span>{formatTrendDate(visibleTrend[0]?.date ?? today, true)}</span>
          <input
            type="range"
            min="0"
            max={Math.max(0, trend.length - visiblePointCount)}
            step="1"
            value={startIndex}
            onChange={(event) => moveWindow(Number(event.target.value))}
            aria-label="Di chuyển khoảng thời gian đang xem"
          />
          <span>{formatTrendDate(visibleTrend.at(-1)?.date ?? today, true)}</span>
        </div>
      )}

      {selected && (
        <div className="savings-trend-detail" aria-live="polite">
          <div><span>Ngày đang xem</span><strong>{formatDate(selected.date)}</strong></div>
          <div><span>Giá trị</span><strong>{formatCurrency(selected.value)}</strong></div>
          <div>
            <span>Thay đổi ngày</span>
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
        Dữ liệu được tính theo ngày. Chọn khoảng thời gian, dùng nút −/+ hoặc
        Ctrl + con lăn để thu nhỏ/phóng to; khi đã phóng to, kéo thanh thời gian
        để xem giai đoạn khác.
      </p>
    </div>
  );
}
