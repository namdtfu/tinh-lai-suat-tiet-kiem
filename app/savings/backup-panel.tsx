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

export default function BackupPanel<TVersion extends VersionView>({
  backupStatus,
  onDismissStatus,
  onExport,
  onImport,
  onRestoreVersion,
  onUndoLatest,
  ready,
  versionHistory,
}: {
  backupStatus: BackupStatus | null;
  onDismissStatus: () => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onRestoreVersion: (version: TVersion) => void;
  onUndoLatest: () => void;
  ready: boolean;
  versionHistory: TVersion[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
        <section className="backup-section" aria-labelledby="backup-title">
          <div className="section-heading">
            <div>
              <span className="section-kicker">AN TOÀN DỮ LIỆU</span>
              <h2 id="backup-title">Sao lưu và khôi phục</h2>
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
              <h3>Mang dữ liệu sang thiết bị khác</h3>
              <p>
                Tải một tệp chứa toàn bộ khoản gửi, lịch sử tái đầu tư, ví tiền
                chưa tái đầu tư, tài khoản, giao dịch, ngân sách và mục tiêu.
                Trên thiết bị khác, mở ứng dụng rồi chọn khôi phục từ tệp.
              </p>
            </div>
            <div className="backup-actions">
              <button
                type="button"
                className="btn-primary backup-download"
                onClick={onExport}
                disabled={!ready}
              >
                <span aria-hidden="true">↓</span>
                Tải bản sao lưu
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
              Khôi phục sẽ thay thế toàn bộ dữ liệu MoneyMind trên thiết bị
              hiện tại. Tệp chỉ được xử lý trong trình duyệt và không được tải
              lên máy chủ.
            </p>
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
