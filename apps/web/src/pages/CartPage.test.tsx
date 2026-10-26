import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CartResponse, ProductDetail } from '@myanmart/shared';
import { CartPage } from './CartPage';
import { ProductDetailPage } from './ProductDetailPage';
import { App } from '../App';

const fetchMock = vi.fn();
const empty: CartResponse = { items: [], itemCount: 0, subtotal: 0 };
const cart: CartResponse = {
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
};
const product: ProductDetail = {
  id: 'product',
  name: 'Tea',
  slug: 'tea',
  description: null,
  price: 1500,
  stock: 5,
  status: 'ACTIVE',
  store: {
    id: 'store',
    name: 'Tea shop',
    slug: 'tea-shop',
    description: null,
    logoUrl: null,
    status: 'APPROVED',
  },
  category: null,
  images: [],
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

describe('shopping cart UI', () => {
  it('routes to an empty cart and offers shopping navigation', async () => {
    window.location.hash = '#/cart';
    fetchMock.mockResolvedValue(response(empty));
    render(<App />);
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '#/');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cart',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });

  it('renders current prices, edits quantities and removes items', async () => {
    fetchMock.mockResolvedValueOnce(response(cart));
    render(<CartPage />);
    const quantity = await screen.findByRole('spinbutton', { name: 'Quantity — Tea' });
    expect(screen.getByText('1,500 MMK')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tea shop' })).toHaveAttribute(
      'href',
      '#/stores/tea-shop',
    );
    fetchMock.mockResolvedValueOnce(
      response({
        ...cart,
        items: [{ ...cart.items[0], quantity: 3, subtotal: 4500 }],
        subtotal: 4500,
      }),
    );
    fireEvent.change(quantity, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update quantity' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/cart/items/item',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ quantity: 3 }) }),
      ),
    );
    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue(3));
    fetchMock.mockResolvedValueOnce(response(empty));
    fireEvent.click(screen.getByRole('button', { name: 'Remove — Tea' }));
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/cart/items/item',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('shows authentication errors and supports retry', async () => {
    fetchMock.mockResolvedValueOnce(response(null, 401));
    render(<CartPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Please sign in');
    fetchMock.mockResolvedValueOnce(response(empty));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
  });

  it('refreshes changed stock after a conflict and keeps the error visible', async () => {
    fetchMock.mockResolvedValueOnce(response(cart));
    render(<CartPage />);
    await screen.findByRole('spinbutton');
    fetchMock
      .mockResolvedValueOnce(response(null, 409))
      .mockResolvedValueOnce(response({ ...cart, items: [{ ...cart.items[0], stock: 0 }] }));
    fireEvent.click(screen.getByRole('button', { name: 'Update quantity' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Stock has changed');
    await waitFor(() => expect(screen.getByRole('spinbutton')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Remove — Tea' })).toBeEnabled();
  });

  it('disables edits for unavailable items and supports Burmese messages', async () => {
    localStorage.setItem('myanmart.locale', 'my');
    fetchMock.mockResolvedValueOnce(
      response({ ...cart, items: [{ ...cart.items[0], available: false }] }),
    );
    render(<CartPage />);
    expect(
      await screen.findByText('ဤပစ္စည်းကို မရရှိနိုင်တော့ပါ။ ဈေးခြင်းမှ ဖယ်ရှားပါ။'),
    ).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeDisabled();
  });

  it('adds a product with credentials and displays success', async () => {
    fetchMock.mockResolvedValueOnce(response(cart));
    render(<ProductDetailPage product={product} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByText('Added to cart.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cart/items',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ productId: 'product', quantity: 1 }),
      }),
    );
  });

  it('reports add failures and prevents out-of-stock adds', async () => {
    fetchMock.mockResolvedValueOnce(response(null, 401));
    const view = render(<ProductDetailPage product={product} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please sign in');
    view.unmount();
    render(<ProductDetailPage product={{ ...product, stock: 0 }} />);
    expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports network failures without showing an empty cart', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(<CartPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update cart.');
    expect(screen.queryByText('Your cart is empty.')).not.toBeInTheDocument();
  });
});
