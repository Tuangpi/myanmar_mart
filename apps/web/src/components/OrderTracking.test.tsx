import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OrdersPage } from '../pages/OrdersPage';

vi.mock('./OrderPayments', () => ({ OrderPayments: () => null }));
const fetchMock = vi.fn();
const order = {
  id: 'o1',
  orderNumber: 'MM-TRACK',
  status: 'PROCESSING',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  total: 1000,
  subtotal: 1000,
  deliveryFee: 0,
  createdAt: '2026-10-27T00:00:00Z',
  address: {},
  canCancel: false,
  sellerGroups: [
    {
      storeId: 's1',
      storeName: 'Store',
      subtotal: 1000,
      items: [
        {
          id: 'i1',
          productName: 'Tea',
          quantity: 1,
          unitPrice: 1000,
          subtotal: 1000,
          fulfillmentStatus: 'SHIPPED',
          fulfillmentHistory: [{ status: 'SHIPPED', createdAt: '2026-10-27T01:00:00Z' }],
        },
      ],
    },
  ],
  statusHistory: [
    { status: 'CONFIRMED', createdAt: '2026-10-27T00:00:00Z' },
    { status: 'PROCESSING', createdAt: '2026-10-27T01:00:00Z' },
  ],
};
function response(data = order) {
  return new Response(JSON.stringify({ success: true, data }));
}
beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('shows item and order timelines, polls and stops polling on unmount', async () => {
  vi.useFakeTimers();
  fetchMock
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(response({ ...order, status: 'SHIPPED' }));
  const { unmount } = render(<OrdersPage id="o1" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('Order timeline')).toBeInTheDocument();
  expect(screen.getByText('Item status: Shipped')).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('supports manual refresh and Burmese tracking labels', async () => {
  fetchMock.mockImplementation(() => Promise.resolve(response()));
  render(<OrdersPage id="o1" />);
  await screen.findByText('Order timeline');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Order timeline');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'MY' }));
  expect(screen.getByText('အော်ဒါမှတ်တမ်း')).toBeInTheDocument();
});
