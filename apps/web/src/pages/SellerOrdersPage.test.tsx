import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';
import { SellerOrdersPage } from './SellerOrdersPage';

const fetchMock = vi.fn();
const order = {
  id: 'o1',
  orderNumber: 'MM-SELLER',
  status: 'CONFIRMED',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  subtotal: 1000,
  createdAt: '2026-10-27T00:00:00Z',
  address: {
    recipientName: 'Buyer',
    phone: '09123456789',
    address: 'Street',
    city: 'Yangon',
    region: 'Yangon',
  },
  items: [
    {
      id: 'i1',
      productName: 'Tea snapshot',
      quantity: 1,
      subtotal: 1000,
      fulfillmentStatus: 'CONFIRMED',
      allowedStatuses: ['PROCESSING'],
    },
  ],
};
function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(status === 200 ? { success: true, data } : { success: false }),
    { status },
  );
}
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fetchMock.mockImplementation((path: string, options: RequestInit) => {
    if (options.method === 'PATCH') return Promise.resolve(response({}));
    if (path.includes('sales-summary'))
      return Promise.resolve(
        response({ orderCount: 1, deliveredSubtotal: 0, activeSubtotal: 1000 }),
      );
    if (path.includes('payment-instructions'))
      return Promise.resolve(response({ KBZPAY: 'Account', WAVEPAY: '', BANK_TRANSFER: '' }));
    return Promise.resolve(
      response({ items: [order], page: 1, pageSize: 10, total: 2, totalPages: 2 }),
    );
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.location.hash = '';
});

describe('seller order board', () => {
  it('routes to owned items, summary and delivery details; confirms item updates', async () => {
    window.location.hash = '#/seller/orders';
    render(<App />);
    expect(await screen.findByText('MM-SELLER')).toBeInTheDocument();
    expect(screen.getByText('Tea snapshot × 1 — 1,000 MMK')).toBeInTheDocument();
    expect(screen.getByText('Buyer — 09123456789')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sales summary' })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Processing' });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fireEvent.click(button);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/seller/orders/o1/status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ itemId: 'i1', status: 'PROCESSING' }),
          credentials: 'include',
        }),
      ),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
  });
  it('edits instructions and paginates', async () => {
    render(<SellerOrdersPage />);
    fireEvent.change(await screen.findByLabelText('KBZPay (manual transfer)'), {
      target: { value: 'New account' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save instructions' }));
    expect(await screen.findByText('Payment instructions saved.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/seller/payment-instructions',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ KBZPAY: 'New account', WAVEPAY: '', BANK_TRANSFER: '' }),
      }),
    );
    await screen.findByText('MM-SELLER');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/seller/orders?page=2&pageSize=10',
        expect.anything(),
      ),
    );
  });
  it('shows authorization failure and retries', async () => {
    fetchMock.mockResolvedValueOnce(response({}, 403));
    render(<SellerOrdersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('required admin or seller role');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('MM-SELLER')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('recovers from uncertain writes by reading again without repeating the mutation', async () => {
    render(<SellerOrdersPage />);
    const button = await screen.findByRole('button', { name: 'Processing' });
    fetchMock.mockRejectedValueOnce(new TypeError('Connection lost'));
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh to check');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(
      1,
    );
  });
});
