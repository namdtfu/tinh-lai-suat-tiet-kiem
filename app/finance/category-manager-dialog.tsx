"use client";

import type { FormEvent } from "react";
import type {
  FinanceCategory,
  FinanceCategoryKind,
} from "@/lib/finance";
import styles from "../finance-manager.module.css";

export default function CategoryManagerDialog({
  categories,
  color,
  editingId,
  formError,
  icon,
  kind,
  name,
  onClose,
  onColorChange,
  onIconChange,
  onNameChange,
  onParentChange,
  onShowArchivedChange,
  onStartForm,
  onSubmit,
  onToggleArchived,
  open,
  parentId,
  showArchived,
}: {
  categories: FinanceCategory[];
  color: string;
  editingId: string;
  formError: string;
  icon: string;
  kind: FinanceCategoryKind;
  name: string;
  onClose: () => void;
  onColorChange: (value: string) => void;
  onIconChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onParentChange: (value: string) => void;
  onShowArchivedChange: (value: boolean) => void;
  onStartForm: (
    kind: FinanceCategoryKind,
    parentId?: string,
    source?: FinanceCategory,
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleArchived: (category: FinanceCategory) => void;
  open: boolean;
  parentId: string;
  showArchived: boolean;
}) {
  if (!open) return null;

  return (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={`${styles.modal} ${styles.categoryModal}`} role="dialog" aria-modal="true" aria-labelledby="category-title">
            <div className={styles.modalHeading}>
              <div><span>DANH MỤC CÁ NHÂN</span><h3 id="category-title">Nhóm giao dịch</h3></div>
              <button type="button" onClick={() => onClose()} aria-label="Đóng">×</button>
            </div>
            <div className={`${styles.segmented} ${styles.twoSegments}`}>
              {(["expense", "income"] as const).map((nextKind) => (
                <button key={nextKind} type="button" className={kind === nextKind ? styles.segmentActive : ""} onClick={() => onStartForm(nextKind)}>
                  {nextKind === "expense" ? "Khoản chi" : "Khoản thu"}
                </button>
              ))}
            </div>
            <div className={styles.categoryToolbar}>
              <p>Nhóm cha dùng để gom báo cáo; nhóm con giúp nhập chi tiết hơn.</p>
              <label><input type="checkbox" checked={showArchived} onChange={(event) => onShowArchivedChange(event.target.checked)} /> Hiện nhóm đã ẩn</label>
            </div>
            <div className={styles.categoryManagerGrid}>
              <div className={styles.categoryTree}>
                {categories
                  .filter((category) => category.kind === kind && !category.parentId && (showArchived || !category.archived))
                  .map((root) => (
                    <div key={root.id} className={`${styles.categoryTreeGroup} ${root.archived ? styles.archivedCategory : ""}`}>
                      <div className={styles.categoryTreeRow}>
                        <span className={styles.roundIcon} style={{ background: `${root.color}20`, color: root.color }}>{root.icon}</span>
                        <strong>{root.name}</strong>
                        <button type="button" onClick={() => onStartForm(root.kind, "", root)}>Sửa</button>
                        <button type="button" onClick={() => onToggleArchived(root)}>{root.archived ? "Khôi phục" : "Ẩn"}</button>
                      </div>
                      {categories
                        .filter((child) => child.parentId === root.id && (showArchived || !child.archived))
                        .map((child) => (
                          <div key={child.id} className={`${styles.categoryTreeRow} ${styles.childCategory} ${child.archived ? styles.archivedCategory : ""}`}>
                            <span className={styles.roundIcon} style={{ background: `${child.color}20`, color: child.color }}>{child.icon}</span>
                            <strong>{child.name}</strong>
                            <button type="button" onClick={() => onStartForm(child.kind, root.id, child)}>Sửa</button>
                            <button type="button" onClick={() => onToggleArchived(child)}>{child.archived ? "Khôi phục" : "Ẩn"}</button>
                          </div>
                        ))}
                      {!root.archived && (
                        <button className={styles.addChildButton} type="button" onClick={() => onStartForm(root.kind, root.id)}>＋ Thêm nhóm con cho {root.name}</button>
                      )}
                    </div>
                  ))}
              </div>
              <form className={styles.categoryForm} onSubmit={onSubmit}>
                <span>{editingId ? "CHỈNH SỬA NHÓM" : "NHÓM MỚI"}</span>
                <h4>{parentId ? "Nhóm con" : "Nhóm cha"}</h4>
                <label>Tên nhóm<input autoFocus value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Ví dụ: Ăn sáng" maxLength={100} required /></label>
                <div className={styles.formGrid}>
                  <label>Biểu tượng<input value={icon} onChange={(event) => onIconChange(event.target.value)} maxLength={12} /></label>
                  <label>Màu<input type="color" value={color} onChange={(event) => onColorChange(event.target.value)} /></label>
                </div>
                <label>Nhóm cha<select value={parentId} onChange={(event) => onParentChange(event.target.value)}><option value="">Không có — đây là nhóm cha</option>{categories.filter((category) => category.kind === kind && !category.parentId && !category.archived && category.id !== editingId).map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></label>
                {formError && <p className={styles.formError} role="alert">{formError}</p>}
                <button className={styles.saveButton} type="submit">{editingId ? "Lưu thay đổi" : "Thêm nhóm"}</button>
                {(editingId || name) && <button className={styles.resetButton} type="button" onClick={() => onStartForm(kind)}>Tạo nhóm khác</button>}
              </form>
            </div>
          </div>
        </div>
  );
}
