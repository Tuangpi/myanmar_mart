import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider, type OrderPaymentsResponse } from '@myanmart/shared';
import { OrderPayments } from './OrderPayments';

const fetchMock = vi.fn();
const data: OrderPaymentsResponse = {
  orderId: 'order-1',
  orderNumber: 'MM-ONE',
  total: 1100,
  method: 'KBZPAY',
  status: 'PENDING_PAYMENT',
  paymentStatus: 'PENDING',
  instructions: 'Transfer to marketplace account',
  canSubmit: true,
  attempts: [],
};
const submitted: OrderPaymentsResponse = {
  ...data,
  status: 'PAYMENT_SUBMITTED',
  paymentStatus: 'SUBMITTED',
  canSubmit: false,
  attempts: [
    {
      id: 'payment-1',
      method: 'KBZPAY',
      amount: 1100,
      transactionReference: 'REF-123',
      receiptUrl: '/api/private-receipt',
      status: 'SUBMITTED',
      verifiedBy: null,
      createdAt: '2026-10-26T00:00:00Z',
    },
  ],
};
function response(value: unknown) {
  return new Response(JSON.stringify({ success: true, data: value }));
}
beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
function view(onChange = vi.fn()) {
  return render(
    <I18nProvider>
      <OrderPayments orderId="order-1" onChange={onChange} />
    </I18nProvider>,
  );
}

describe('buyer payment submission', () => {
  it('displays instructions, sends multipart receipt and refreshes order state', async () => {
    fetchMock.mockResolvedValueOnce(response(data)).mockResolvedValueOnce(response(submitted));
    const onChange = vi.fn();
    view(onChange);
    expect(await screen.findByText(data.instructions)).toBeInTheDocument();
    expect(screen.getByText(/Never submit a wallet PIN/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Transaction reference'), {
      target: { value: 'REF-123' },
    });
    fireEvent.change(screen.getByLabelText('Receipt image'), {
      target: { files: [new File(['receipt'], 'receipt.png', { type: 'image/png' })] },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Submit payment' }).closest('form')!);
    expect(await screen.findByText('REF-123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Receipt image' })).toHaveAttribute(
      'href',
      '/api/private-receipt',
    );
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(fetchMock.mock.calls[1]![1].body).toBeInstanceOf(FormData);
    expect(fetchMock.mock.calls[1]![1].headers).toBeUndefined();
    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Submit payment' })).not.toBeInTheDocument();
  });

  it('prevents repeated submissions and re-reads after an uncertain response', async () => {
    let reject!: (error: Error) => void;
    fetchMock
      .mockResolvedValueOnce(response(data))
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValueOnce(response(submitted));
    view();
    const button = await screen.findByRole('button', { name: 'Submit payment' });
    const form = button.closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(button).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    reject(new Error('response lost'));
    expect(await screen.findByText('REF-123')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Payment request failed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('button', { name: 'Submit payment' })).not.toBeInTheDocument();
  });

  it('does not offer a transfer without configured instructions', async () => {
    fetchMock.mockResolvedValueOnce(response({ ...data, instructions: '' }));
    view();
    expect(await screen.findByText(/Payment instructions are not configured/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Transaction reference')).not.toBeInTheDocument();
  });

  it('shows COD collection information without an upload form', async () => {
    fetchMock.mockResolvedValueOnce(response({ ...data, method: 'COD', canSubmit: false }));
    view();
    expect(await screen.findByText(/Pay cash on delivery/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Receipt image')).not.toBeInTheDocument();
  });

  it('renders Burmese payment labels and retries a failed read', async () => {
    localStorage.setItem('myanmart.locale', 'my');
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(data));
    view();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByLabelText('ငွေလွှဲအမှတ်')).toBeInTheDocument());
  });
});
