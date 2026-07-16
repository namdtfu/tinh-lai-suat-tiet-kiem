"use client";

import {
  formatAmountInput,
  formatCurrency,
  formatDate,
  formatGoalDuration,
  formatRate,
  type InterestGoalPlan,
} from "@/lib/savings";

export default function InterestGoalPlanner({
  currentMonthlyInterestEstimate,
  currentPortfolio,
  effectiveGoalRate,
  goalContribution,
  goalInterestRate,
  goalMonthlyContribution,
  goalMonthlyInterest,
  goalPlan,
  onGoalInterestRateChange,
  onGoalMonthlyContributionChange,
  onGoalMonthlyInterestChange,
  suggestedGoalRate,
}: {
  currentMonthlyInterestEstimate: number;
  currentPortfolio: number;
  effectiveGoalRate: number;
  goalContribution: number;
  goalInterestRate: string;
  goalMonthlyContribution: string;
  goalMonthlyInterest: string;
  goalPlan: InterestGoalPlan | null;
  onGoalInterestRateChange: (value: string) => void;
  onGoalMonthlyContributionChange: (value: string) => void;
  onGoalMonthlyInterestChange: (value: string) => void;
  suggestedGoalRate: number;
}) {
  return (
        <section className="goal-section" aria-labelledby="goal-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">MỤC TIÊU THU NHẬP</span>
              <h2 id="goal-title">Khi nào lãi đạt kỳ vọng mỗi tháng?</h2>
            </div>
            <span className="step-badge">04</span>
          </div>

          <div className="goal-layout">
            <div className="goal-form-card">
              <div className="goal-card-heading">
                <span aria-hidden="true">◎</span>
                <div>
                  <h3>Thiết lập mục tiêu</h3>
                  <p>Nhập số lãi ròng bạn muốn nhận trung bình mỗi tháng.</p>
                </div>
              </div>
              <div className="goal-current-income">
                <div>
                  <span>LÃI RÒNG ƯỚC TÍNH HIỆN TẠI/THÁNG</span>
                  <strong>
                    {formatCurrency(currentMonthlyInterestEstimate)}
                  </strong>
                  <small>
                    {currentPortfolio > 0
                      ? `Từ ${formatCurrency(currentPortfolio)} với mức ${formatRate(effectiveGoalRate)}%/năm.`
                      : "Thêm khoản gửi để ứng dụng tính mức lãi hiện tại."}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={currentMonthlyInterestEstimate <= 0}
                  onClick={() =>
                    onGoalMonthlyInterestChange(
                      formatAmountInput(
                        Math.round(currentMonthlyInterestEstimate),
                      ),
                    )
                  }
                >
                  Dùng làm mục tiêu
                </button>
              </div>
              <div className="goal-form-grid">
                <div className="form-group goal-field-wide">
                  <label htmlFor="goalMonthlyInterest">
                    Lãi ròng kỳ vọng mỗi tháng
                  </label>
                  <div className="input-with-suffix">
                    <input
                      type="text"
                      inputMode="numeric"
                      id="goalMonthlyInterest"
                      value={goalMonthlyInterest}
                      onChange={(event) =>
                        onGoalMonthlyInterestChange(
                          formatAmountInput(event.target.value),
                        )
                      }
                      placeholder="5.000.000"
                    />
                    <span>₫</span>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="goalInterestRate">
                    Lãi suất giả định (%/năm)
                  </label>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      id="goalInterestRate"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={goalInterestRate}
                      onChange={(event) => onGoalInterestRateChange(event.target.value)}
                      placeholder={formatRate(suggestedGoalRate)}
                    />
                    <span>%</span>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="goalMonthlyContribution">
                    Góp thêm mỗi tháng (không bắt buộc)
                  </label>
                  <div className="input-with-suffix">
                    <input
                      type="text"
                      inputMode="numeric"
                      id="goalMonthlyContribution"
                      value={goalMonthlyContribution}
                      onChange={(event) =>
                        onGoalMonthlyContributionChange(
                          formatAmountInput(event.target.value),
                        )
                      }
                      placeholder="0"
                    />
                    <span>₫</span>
                  </div>
                </div>
              </div>
              <p className="goal-rate-note">
                Mục tiêu vẫn do bạn chọn; nút phía trên chỉ giúp điền nhanh mức
                hiện tại. {" "}
                Để trống lãi suất sẽ dùng mức bình quân danh mục hiện tại là{
                " "}
                <strong>{formatRate(suggestedGoalRate)}%/năm</strong>.
              </p>
            </div>

            <div className={`goal-result-card${goalPlan ? " has-result" : ""}`}>
              {goalPlan ? (
                <>
                  <span className="goal-result-kicker">DỰ KIẾN ĐẠT MỤC TIÊU</span>
                  <h3>
                    {goalPlan.monthsToGoal === 0
                      ? "Bạn đã đạt mục tiêu"
                      : goalPlan.targetDate
                        ? formatDate(goalPlan.targetDate)
                        : "Cần thêm kế hoạch tích lũy"}
                  </h3>
                  <p className="goal-result-summary">
                    {goalPlan.monthsToGoal === 0
                      ? `Danh mục hiện tại đã có thể tạo khoảng ${formatCurrency(goalPlan.currentMonthlyInterest)} lãi ròng mỗi tháng.`
                      : goalPlan.monthsToGoal !== null
                        ? goalContribution > 0
                          ? `Còn khoảng ${formatGoalDuration(goalPlan.monthsToGoal)} với mức góp ${formatCurrency(goalContribution)} mỗi tháng và toàn bộ lãi được tái đầu tư.`
                          : `Còn khoảng ${formatGoalDuration(goalPlan.monthsToGoal)} nếu toàn bộ vốn và lãi tiếp tục được tái đầu tư.`
                        : goalContribution > 0
                          ? "Với mức góp hiện tại, thời gian đạt mục tiêu vượt quá 100 năm. Hãy tăng khoản góp hoặc lãi suất giả định."
                          : "Hãy thêm vốn hiện tại hoặc nhập khoản góp hàng tháng để tính thời điểm đạt mục tiêu."}
                  </p>

                  <div className="goal-metrics">
                    <div>
                      <span>Vốn hiện tại</span>
                      <strong>{formatCurrency(currentPortfolio)}</strong>
                    </div>
                    <div>
                      <span>Vốn cần có</span>
                      <strong>{formatCurrency(goalPlan.requiredCapital)}</strong>
                    </div>
                    <div>
                      <span>Còn thiếu hôm nay</span>
                      <strong>{formatCurrency(goalPlan.capitalGap)}</strong>
                    </div>
                    <div>
                      <span>Lãi hiện tại/tháng</span>
                      <strong>
                        {formatCurrency(goalPlan.currentMonthlyInterest)}
                      </strong>
                    </div>
                    {goalPlan.projectedContributions !== null && (
                      <div>
                        <span>Tổng tiền tự góp đến mục tiêu</span>
                        <strong>
                          {formatCurrency(goalPlan.projectedContributions)}
                        </strong>
                      </div>
                    )}
                    {goalPlan.projectedGrowth !== null && (
                      <div>
                        <span>Lãi tích lũy đến mục tiêu</span>
                        <strong>
                          {formatCurrency(goalPlan.projectedGrowth)}
                        </strong>
                      </div>
                    )}
                  </div>

                  <div className="goal-progress-block">
                    <div className="goal-progress-header">
                      <span>Tiến độ vốn hiện có</span>
                      <strong>{Math.round(goalPlan.progress)}%</strong>
                    </div>
                    <div
                      className="goal-progress-track"
                      role="progressbar"
                      aria-label="Tiến độ đạt vốn tạo lãi kỳ vọng"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(goalPlan.progress)}
                    >
                      <span style={{ width: `${goalPlan.progress}%` }} />
                    </div>
                    {goalContribution > 0 && (
                      <p className="goal-progress-note">
                        Khoản góp tương lai đã được dùng để tính ngày đạt mục
                        tiêu, nhưng chưa được cộng vào phần trăm vốn hiện có hôm
                        nay.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="goal-empty-state">
                  <span aria-hidden="true">₫</span>
                  <h3>Ví dụ: 5 triệu đồng mỗi tháng</h3>
                  <p>
                    Nhập mục tiêu để xem số vốn cần có, phần còn thiếu và ngày
                    dự kiến đạt được.
                  </p>
                </div>
              )}
            </div>
          </div>
          <p className="goal-calculation-note">
            Ước tính dùng lãi kép theo ngày, quy đổi một tháng bằng 365/12 ngày
            và trừ 5% trên tiền lãi. Kết quả giả định vốn được tái đầu tư liên
            tục; thực tế có thể khác theo kỳ hạn và chính sách ngân hàng.
          </p>
        </section>

  );
}
