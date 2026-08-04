import type {Price} from '../shared/types';

const SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  INR: '₹',
  ZAR: 'R',
};

export function formatPrice(price: Price | null | undefined): string {
  if (!price) return '';
  const symbol = SYMBOLS[price.currency.toUpperCase()];
  const amount =
    price.amount % 1 === 0 ? String(price.amount) : price.amount.toFixed(2);
  return symbol ? `${symbol}${amount}` : `${amount} ${price.currency}`;
}

export function formatAmount(amount: number, currency: string): string {
  return formatPrice({amount, currency});
}
