import type {
  FinanceAccountType,
  FinanceCurrency,
} from "@/lib/finance";

const moneyFormatters: Record<FinanceCurrency, Intl.NumberFormat> = {
  KRW: new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }),
  VND: new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }),
};

const shortDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

export const accountTypeLabels: Record<FinanceAccountType, string> = {
  cash: "Tiền mặt",
  bank: "Ngân hàng",
  ewallet: "Ví điện tử",
};

export function todayIso() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

export function createFinanceId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatMoney(amount: number, currency: FinanceCurrency) {
  return moneyFormatters[currency].format(Math.round(amount));
}

export function formatMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

export function formatShortDate(date: string) {
  return shortDateFormatter.format(new Date(`${date}T00:00:00`));
}
