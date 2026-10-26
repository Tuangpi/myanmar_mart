import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CheckoutQuote, OrderResponse } from '@myanmart/shared';
import { CheckoutPage } from './CheckoutPage';
import { App } from '../App';

const fetchMock = vi.fn();
const address = {
  recipientName: 'Buyer One',
  phone: '09123456789',
  region: 'Yangon',
  city: 'Hlaing',
  address: '123 Main Street',
  notes: '',
};
const quote: CheckoutQuote = {
  cart: {
    items: [
      {
        id: 'item',
        productId: 'product',
        name: 'Tea',
        slug: 'tea',
        thumbnailUrl: null,
        storeName: 'Tea shop',
        storeSlug: 'tea-shop',
        quantity: 2,
        stock: 5,
        available: true,
        unitPrice: 1500,
        subtotal: 3000,
      },
    ],
    itemCount: 2,
    subtotal: 3000,
  },
  deliveryFee: 2500,
  total: 5500,
};
const order: OrderResponse = {
  canCancel: true,
  id: 'order',
  orderNumber: 'MM-TEST',
  address,
  subtotal: 3000,
  deliveryFee: 2500,
  total: 5500,
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  status: 'CONFIRMED',
  createdAt: '2026-10-26T00:00:00Z',
  sellerGroups: [
    {
      storeId: 'store',
      storeName: 'Tea shop',
      storeSlug: 'tea-shop',
      subtotal: 3000,
      items: [
        {
          id: 'line',
          productId: 'product',
          productName: 'Tea',
          unitPrice: 1500,
          quantity: 2,
          subtotal: 3000,
        },
      ],
    },
  ],
};
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
function fillForm() {
  for (const [label, value] of [
    ['Recipient name', address.recipientName],
    ['Contact phone', address.phone],
    ['Region / State', address.region],
    ['City / Township', address.city],
    ['Street address', address.address],
  ])
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  window.location.hash = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = '';
});

describe('checkout', () => {
  it('routes to checkout and renders the server quote', async () => {
    window.location.hash = '#/checkout';
    fetchMock.mockResolvedValueOnce(response(quote));
    render(<App />);
    expect(await screen.findByText('Total: 5,500 MMK')).toBeInTheDocument();
    expect(screen.getByText('Delivery fee: 2,500 MMK')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/checkout',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
  it('submits only delivery and payment input and shows grouped order confirmation', async () => {
    fetchMock.mockResolvedValueOnce(response(quote)).mockResolvedValueOnce(response(order));
    render(<CheckoutPage />);
    await screen.findByLabelText('Recipient name');
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('Order placed')).toBeInTheDocument();
    expect(screen.getByText('Order number: MM-TEST')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tea shop' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/orders',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ address, paymentMethod: 'COD' }),
      }),
    );
  });
  it('disables duplicate submission while pending', async () => {
    fetchMock.mockResolvedValueOnce(response(quote)).mockReturnValueOnce(new Promise(() => {}));
    render(<CheckoutPage />);
    await screen.findByLabelText('Recipient name');
    fillForm();
    const button = screen.getByRole('button', { name: 'Place order' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows separate seller groups and combined totals on confirmation', async () => {
    const multiSeller = {
      ...order,
      subtotal: 7000,
      total: 9500,
      sellerGroups: [
        ...order.sellerGroups,
        {
          storeId: 'second',
          storeName: 'Second shop',
          storeSlug: 'second',
          subtotal: 4000,
          items: [
            {
              id: 'second-line',
              productId: 'second-product',
              productName: 'Rice',
              unitPrice: 4000,
              quantity: 1,
              subtotal: 4000,
            },
          ],
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(response(quote)).mockResolvedValueOnce(response(multiSeller));
    render(<CheckoutPage />);
    await screen.findByLabelText('Recipient name');
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByRole('heading', { name: 'Second shop' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tea shop' })).toBeInTheDocument();
    expect(screen.getByText('Total: 9,500 MMK')).toBeInTheDocument();
    expect(screen.getByText('Rice × 1 — 4,000 MMK')).toBeInTheDocument();
  });

  it('warns about uncertain submission outcomes after a network error', async () => {
    fetchMock.mockResolvedValueOnce(response(quote)).mockRejectedValueOnce(new Error('offline'));
    render(<CheckoutPage />);
    await screen.findByLabelText('Recipient name');
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your orders before retrying');
    expect(screen.queryByRole('button', { name: 'Place order' })).not.toBeInTheDocument();
  });
  it('reports stock conflicts and refreshes checkout only on retry', async () => {
    fetchMock.mockResolvedValueOnce(response(quote)).mockResolvedValueOnce(response(null, 409));
    render(<CheckoutPage />);
    await screen.findByLabelText('Recipient name');
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your cart or stock has changed');
    fetchMock.mockResolvedValueOnce(
      response({ ...quote, cart: { items: [], itemCount: 0, subtotal: 0 } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
  });
  it('does not allow checkout of unavailable items', async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        ...quote,
        cart: { ...quote.cart, items: [{ ...quote.cart.items[0], available: false }] },
      }),
    );
    render(<CheckoutPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your cart or stock has changed');
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
  });
  it('shows sign-in errors and translates delivery fields into Burmese', async () => {
    fetchMock.mockResolvedValueOnce(response(null, 401));
    const view = render(<CheckoutPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Please sign in');
    view.unmount();
    localStorage.setItem('myanmart.locale', 'my');
    fetchMock.mockResolvedValueOnce(response(quote));
    render(<CheckoutPage />);
    expect(await screen.findByLabelText('လက်ခံသူအမည်')).toBeInTheDocument();
  });
  it('offers manual methods and keeps prepaid confirmation pending', async () => {
    fetchMock
      .mockResolvedValueOnce(response(quote))
      .mockResolvedValueOnce(
        response({ ...order, paymentMethod: 'KBZPAY', status: 'PENDING_PAYMENT' }),
      );
    render(<CheckoutPage />);
    await screen.findByLabelText('Recipient name');
    fillForm();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'KBZPAY' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('Order status: Pending payment')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/orders',
        expect.objectContaining({ body: JSON.stringify({ address, paymentMethod: 'KBZPAY' }) }),
      ),
    );
  });
});
