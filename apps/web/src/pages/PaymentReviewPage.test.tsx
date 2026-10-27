import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PaymentReviewOrder } from '@myanmart/shared';
import { PaymentReviewPage } from './PaymentReviewPage';
import { App } from '../App';

const fetchMock = vi.fn();
const order: PaymentReviewOrder = {
  orderId: 'order-1',
  orderNumber: 'MM-REVIEW',
  total: 1100,
  method: 'KBZPAY',
  status: 'PAYMENT_SUBMITTED',
  paymentStatus: 'SUBMITTED',
  instructions: '',
  canSubmit: false,
  allowedStatuses: [],
  attempts: [
    {
      id: 'p1',
      method: 'KBZPAY',
      amount: 1100,
      transactionReference: 'TRANSFER-1',
      receiptUrl: '/api/receipt',
      status: 'SUBMITTED',
      verifiedBy: null,
      createdAt: '2026-10-26T00:00:00Z',
    },
  ],
};
function response(items = [order], status = 200, totalPages = 1) {
  return new Response(
    JSON.stringify(
      status === 200
        ? { success: true, data: { items, totalPages, page: 1, pageSize: 10, total: items.length } }
        : { success: false, error: { message: 'Forbidden' } },
    ),
    { status },
  );
}
beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.location.hash = '';
});

describe('payment review UI', () => {
  it('routes admins to review, confirms verification and reloads', async () => {
    window.location.hash = '#/payments/admin';
    fetchMock
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]));
    render(<App />);
    expect(await screen.findByText('TRANSFER-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Receipt image' })).toHaveAttribute(
      'href',
      '/api/receipt',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verify payment' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/admin/payment-orders/order-1/payments/p1/review',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'VERIFIED' }) }),
    ]);
  });

  it('allows seller rejection and honours confirmation cancellation', async () => {
    fetchMock
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]));
    render(<PaymentReviewPage role="seller" />);
    const button = await screen.findByRole('button', { name: 'Reject payment' });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]![0]).toContain('/seller/payment-orders/');
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ decision: 'REJECTED' });
  });

  it('requires manual refund reference and sends it after confirmation', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response([
          {
            ...order,
            status: 'DELIVERED',
            paymentStatus: 'VERIFIED',
            attempts: [],
            allowedStatuses: ['REFUNDED'],
          },
        ]),
      )
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]));
    render(<PaymentReviewPage role="admin" />);
    const input = await screen.findByLabelText('Manual refund reference');
    expect(input).toBeRequired();
    fireEvent.change(input, { target: { value: 'REFUND-123' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Record full refund' }).closest('form')!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({
      status: 'REFUNDED',
      transactionReference: 'REFUND-123',
    });
  });

  it('shows role errors and supports pagination', async () => {
    fetchMock
      .mockResolvedValueOnce(response([], 403))
      .mockResolvedValueOnce(response([order], 200, 2))
      .mockResolvedValueOnce(response([]));
    render(<PaymentReviewPage role="seller" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('required admin or seller role');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(fetchMock.mock.calls[2]![0]).toContain('page=2'));
  });
});
