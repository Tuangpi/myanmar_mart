import { CURRENCY } from '@myanmart/shared';

export function formatMMK(amount: number): string {
  return `${new Intl.NumberFormat('en-US').format(amount)} ${CURRENCY}`;
}
