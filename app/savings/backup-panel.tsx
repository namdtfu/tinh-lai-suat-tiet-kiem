"use client";

import { type ChangeEvent, useRef } from "react";

type BackupStatus = {
  kind: "success" | "error";
  text: string;
};

type VersionView = {
  id: string;
  createdAt: string;
  label: string;
};

type SafetySnapshotView = {
  id: string;
  createdAt: string;
  label: string;
};

export type FullBackupSummary = {
  accounts: number;
  budgets: number;
  cashLedger: number;
  financialGoals: number;
  prosperity: number;
  savings: number;
  transactions: number;
  versions: number;
};

export default function BackupPanel<TVersion extends VersionView>({
  backupStatus,
  backupSummary,
  onDismissStatus,
  onDownloadSafetySnapshot,
  onExport,
  onImport,
  onCreateSafetySnapshot,
  onRestoreSafetySnapshot,
  onRestoreVersion,
  onUndoLatest,
  ready,
  safetySnapshots,
  versionHistory,
}: {
  backupStatus: BackupStatus | null;
  backupSummary: FullBackupSummary;
  onDismissStatus: () => void;
  onDownloadSafetySnapshot: (id: string) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onCreateSafetySnapshot: () => void;
  onRestoreSafetySnapshot: (id: string) => void;
  onRestoreVersion: (version: TVersion) => void;
  onUndoLatest: () => void;
  ready: boolean;
  safetySnapshots: SafetySnapshotView[];
  versionHistory: TVersion[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
        <section className="backup-section" aria-labelledby="backup-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">AN TOÀN DỮ LIỆU</span>
              <h2 id="backup-title">Sao lưu toàn bộ MoneyMind</h2>
            </div>
            <span className="step-badge">05</span>
          </div>

          {backupStatus && (
            <div
              className={`backup-status ${backupStatus.kind}`}
              role={backupStatus.kind === "error" ? "alert" : "status"}
            >
              <span aria-hidden="true">
                {backupStatus.kind === "error" ? "!" : "✓"}
              </span>
              <p>{backupStatus.text}</p>
              <button
                type="button"
                onClick={() => onDismissStatus()}
                aria-label="Đóng thông báo sao lưu"
              >
                ×
              </button>
            </div>
          )}

          <div className="backup-card">
            <span className="backup-icon" aria-hidden="true">↕</span>
            <div className="backup-copy">
              <h3>Một tệp chứa toàn bộ dữ liệu</h3>
              <p>
                Bao gồm Tích lũy, Phát lộc, lịch sử tái đầu tư, ví tiền, tài
                khoản, giao dịch, ngân sách, tỷ giá, mục tiêu và lịch sử phiên bản.
              </p>
              <div className="backup-summary" aria-label="Nội dung bản sao lưu">
                <span>{backupSummary.savings} Tích lũy</span>
                <span>{backupSummary.prosperity} Phát lộc</span>
                <span>{backupSummary.accounts} tài khoản</span>
                <span>{backupSummary.transactions} giao dịch</span>
                <span>{backupSummary.cashLedger} khoản trong ví</span>
                <span>{backupSummary.budgets} ngân sách</span>
                <span>{backupSummary.financialGoals} mục tiêu</span>
                <span>{backupSummary.versions} mốc lịch sử</span>
              </div>
            </div>
            <div className="backup-actions">
              <button
                type="button"
                className="btn-primary backup-download"
                onClick={onExport}
                disabled={!ready}
              >
                <span aria-hidden="true">↓</span>
                Tải bản sao lưu toàn bộ
              </button>
              <button
                type="button"
                className="btn-secondary backup-restore"
                onClick={() => inputRef.current?.click()}
                disabled={!ready}
              >
                <span aria-hidden="true">↑</span>
                Khôi phục từ tệp
              </button>
              <input
                ref={inputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                onChange={onImport}
                tabIndex={-1}
              />
            </div>
            <p className="backup-note">
              Hãy giữ tệp ở nơi an toàn. Tệp có thể khôi phục dữ liệu sang tên
              miền, trình duyệt hoặc thiết bị khác.
            </p>
          </div>
          <div className="safety-card">
            <div className="version-heading">
              <div>
                <span className="backup-icon safety-icon" aria-hidden="true">◆</span>
                <div>
                  <h3>Bản sao an toàn trên thiết bị</h3>
                  <p>
                    Tự giữ tối đa 7 bản riêng, không bị xóa khi đồng bộ đám mây.
                    Bạn vẫn nên tải tệp toàn bộ để phòng mất trình duyệt hoặc thiết bị.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                disabled={!ready}
                onClick={onCreateSafetySnapshot}
              >
                Tạo bản sao ngay
              </button>
            </div>
            {safetySnapshots.length ? (
              <div className="safety-list">
                {[...safetySnapshots].reverse().map((snapshot) => (
                  <div key={snapshot.id}>
                    <span aria-hidden="true">●</span>
                    <div>
                      <strong>{snapshot.label}</strong>
                      <small>
                        {new Intl.DateTimeFormat("vi-VN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(snapshot.createdAt))}
                      </small>
                    </div>
                    <div className="safety-actions">
                      <button
                        type="button"
                        onClick={() => onDownloadSafetySnapshot(snapshot.id)}
                      >
                        Tải xuống
                      </button>
                      <button
                        type="button"
                        onClick={() => onRestoreSafetySnapshot(snapshot.id)}
                      >
                        Khôi phục
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="safety-empty">
                Bản sao đầu tiên sẽ được tạo khi có dữ liệu hoặc khi bạn bấm nút phía trên.
              </p>
            )}
          </div>
          <div className="version-card">
            <div className="version-heading">
              <div><span className="backup-icon" aria-hidden="true">↶</span><div><h3>Lịch sử phiên bản</h3><p>Tự lưu tối đa 20 mốc thay đổi. Bạn có thể hoàn tác mà không cần mở tệp sao lưu.</p></div></div>
              <button type="button" className="btn-secondary" disabled={versionHistory.length < 2} onClick={onUndoLatest}>Hoàn tác thao tác gần nhất</button>
            </div>
            <div className="version-list">
              {[...versionHistory].reverse().slice(0, 6).map((version, index) => (
                <div key={version.id}>
                  <span aria-hidden="true">{index === 0 ? "●" : "○"}</span>
                  <div><strong>{index === 0 ? "Hiện tại" : version.label}</strong><small>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(version.createdAt))}</small></div>
                  <button type="button" disabled={index === 0} onClick={() => onRestoreVersion(version)}>{index === 0 ? "Đang dùng" : "Khôi phục"}</button>
                </div>
              ))}
            </div>
          </div>
        </section>

  );
}
