import { formatCurrency } from '@/lib/savings';

export type SavingsProduct = 'accumulation' | 'prosperity';

export default function ProductSwitcher({
  activeProduct,
  accumulationPrincipal,
  onChange,
  prosperityPrincipal,
}: {
  activeProduct: SavingsProduct;
  accumulationPrincipal: number;
  onChange: (product: SavingsProduct) => void;
  prosperityPrincipal: number;
}) {
  return (
    <section className='product-chooser' aria-labelledby='product-chooser-title'>
      <div className='product-chooser-heading'>
        <div>
          <span className='product-kicker'>HAI SẢN PHẨM · HAI SỔ RIÊNG</span>
          <h2 id='product-chooser-title'>Chọn cơ chế bạn muốn theo dõi</h2>
        </div>
        <p>
          Tích lũy và Phát lộc được lưu, tính lãi và thống kê độc lập; không
          cộng gộp số liệu của nhau.
        </p>
      </div>

      <div className='product-options' role='tablist' aria-label='Sản phẩm tiết kiệm'>
        <button
          type='button'
          role='tab'
          aria-selected={activeProduct === 'accumulation'}
          className={`product-option accumulation-option${activeProduct === 'accumulation' ? ' active' : ''}`}
          onClick={() => onChange('accumulation')}
        >
          <span className='product-option-icon' aria-hidden='true'>◇</span>
          <span className='product-option-copy'>
            <span className='product-option-title'>
              <strong>Tích lũy</strong>
              <small>Theo tháng</small>
            </span>
            <span className='product-option-balance'>
              <small>Tổng gốc riêng</small>
              <strong>{formatCurrency(accumulationPrincipal)}</strong>
            </span>
            <span className='product-mechanism'>
              Lãi kép theo ngày · khấu trừ 5% · có tái đầu tư
            </span>
          </span>
          <span className='product-option-arrow' aria-hidden='true'>→</span>
        </button>

        <button
          type='button'
          role='tab'
          aria-selected={activeProduct === 'prosperity'}
          className={`product-option prosperity-option${activeProduct === 'prosperity' ? ' active' : ''}`}
          onClick={() => onChange('prosperity')}
        >
          <span className='product-option-icon sprout-icon' aria-hidden='true'>♧</span>
          <span className='product-option-copy'>
            <span className='product-option-title'>
              <strong>Phát lộc</strong>
              <small>Theo tuần</small>
            </span>
            <span className='product-option-balance'>
              <small>Tổng gốc riêng</small>
              <strong>{formatCurrency(prosperityPrincipal)}</strong>
            </span>
            <span className='product-mechanism'>
              Lãi đơn theo ngày · thu hoạch một lần cuối kỳ
            </span>
          </span>
          <span className='product-option-arrow' aria-hidden='true'>→</span>
        </button>
      </div>
    </section>
  );
}
