import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { OrderResponse } from '@myanmart/shared';
import { OrdersPage } from './OrdersPage';
import { App } from '../App';

const fetchMock = vi.fn();
// Payment submission has its own component tests and independent API requests.
vi.mock('../components/OrderPayments', () => ({
  OrderPayments: () => null,
  PaymentAttempts: () => null,
}));
const order: OrderResponse = {
  canCancel: true,
  id: 'order-1',
  orderNumber: 'MM-ONE',
  address: {
    recipientName: 'Buyer',
    phone: '09123456789',
    address: '123 Street',
    city: 'Yangon',
    region: 'Yangon',
    notes: 'Call first',
  },
  subtotal: 7000,
  deliveryFee: 2500,
  total: 9500,
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  status: 'CONFIRMED',
  createdAt: '2026-10-26T00:00:00Z',
  sellerGroups: [
    {
      storeId: 's1',
      storeName: 'Tea store',
      storeSlug: 'tea',
      subtotal: 3000,
      items: [
        {
          id: 'i1',
          productId: null,
          productName: 'Tea snapshot',
          unitPrice: 1500,
          quantity: 2,
          subtotal: 3000,
        },
      ],
    },
    {
      storeId: 's2',
      storeName: 'Rice store',
      storeSlug: 'rice',
      subtotal: 4000,
      items: [
        {
          id: 'i2',
          productId: 'p2',
          productName: 'Rice',
          unitPrice: 4000,
          quantity: 1,
          subtotal: 4000,
        },
      ],
    },
  ],
};
const list = { items: [order], page: 1, pageSize: 10, total: 1, totalPages: 1 };
function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status === 200
        ? { success: true, data }
        : { success: false, error: { code: 'ERROR', message: 'Error' } },
    ),
    { status },
  );
}
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = '';
});

describe('buyer orders', () => {
  it('routes to history and displays seller groups, snapshots, payment and totals', async () => {
    window.location.hash = '#/orders';
    fetchMock.mockResolvedValueOnce(response(list));
    render(<App />);
    expect(await screen.findByRole('link', { name: 'MM-ONE' })).toHaveAttribute(
      'href',
      '#/orders/order-1',
    );
    expect(screen.getByText('Tea snapshot × 2')).toBeInTheDocument();
    expect(screen.getByText('Rice store')).toBeInTheDocument();
    expect(screen.getByText('Total: 9,500 MMK')).toBeInTheDocument();
    expect(screen.getByText('Order status: Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Payment status: Pending')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/orders?page=1&pageSize=10',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
  it('paginates history and shows empty states', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ ...list, total: 11, totalPages: 2 }))
      .mockResolvedValueOnce(response({ ...list, items: [], page: 2, total: 11, totalPages: 2 }));
    render(<OrdersPage />);
    await screen.findByText('MM-ONE');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('You have no orders yet.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/orders?page=2&pageSize=10', expect.anything());
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
  it('routes to detail, shows delivery info and confirms before cancelling', async () => {
    window.location.hash = '#/orders/order-1';
    fetchMock
      .mockResolvedValueOnce(response(order))
      .mockResolvedValueOnce(response({ ...order, status: 'CANCELLED', canCancel: false }));
    render(<App />);
    expect(await screen.findByText('Buyer — 09123456789')).toBeInTheDocument();
    expect(screen.getByText('Call first')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep order' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel order' }));
    expect(await screen.findByText('This order has been cancelled.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/orders/order-1/cancel',
      expect.objectContaining({ method: 'POST', credentials: 'include', body: '{}' }),
    );
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });
  it('refreshes current status when cancellation is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(response(order))
      .mockResolvedValueOnce(response(null, 409))
      .mockResolvedValueOnce(response({ ...order, status: 'PROCESSING', canCancel: false }));
    render(<OrdersPage id="order-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('can no longer be cancelled');
    expect(await screen.findByText('Order status: Processing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });
  it('hides cancellation for ineligible orders and supports Burmese labels', async () => {
    localStorage.setItem('myanmart.locale', 'my');
    fetchMock.mockResolvedValueOnce(response({ ...order, canCancel: false, status: 'SHIPPED' }));
    render(<OrdersPage id="order-1" />);
    expect(await screen.findByText('အမှာစာအခြေအနေ: ပို့ဆောင်နေသည်')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'အမှာစာပယ်ဖျက်ရန်' })).not.toBeInTheDocument();
  });
  it('shows sign-in and not-found failures with retry', async () => {
    fetchMock.mockResolvedValueOnce(response(null, 401)).mockResolvedValueOnce(response(null, 404));
    render(<OrdersPage id="missing" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Please sign in');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Order not found.'));
  });
  it('disables repeated cancellation while pending', async () => {
    fetchMock.mockResolvedValueOnce(response(order)).mockReturnValueOnce(new Promise(() => {}));
    render(<OrdersPage id="order-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    const confirm = screen.getByRole('button', { name: 'Yes, cancel order' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('ignores stale detail responses after navigation', async () => {
    let resolve!: (value: Response) => void;
    fetchMock
      .mockReturnValueOnce(
        new Promise<Response>((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValueOnce(response({ ...order, id: 'order-2', orderNumber: 'MM-TWO' }));
    const view = render(<OrdersPage id="order-1" />);
    view.rerender(<OrdersPage id="order-2" />);
    expect(await screen.findByText('MM-TWO')).toBeInTheDocument();
    await act(async () => {
      resolve(response(order));
    });
    expect(screen.queryByText('MM-ONE')).not.toBeInTheDocument();
  });

  it('refreshes after an uncertain cancellation response without submitting twice', async () => {
    fetchMock
      .mockResolvedValueOnce(response(order))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response({ ...order, status: 'CANCELLED', canCancel: false }));
    render(<OrdersPage id="order-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel order' }));
    expect(await screen.findByText('This order has been cancelled.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Please retry to check the current status');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
