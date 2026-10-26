import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StorefrontPage } from './StorefrontPage';
import { App } from '../App';

const fetchMock = vi.fn();
const profile = {
  id: 'store1',
  slug: 'tea-shop',
  name: 'Tea Shop',
  logoUrl: '/logo.png',
  description: 'Local tea and coffee',
  status: 'APPROVED',
  products: [],
};
const product = {
  id: 'tea1',
  slug: 'tea',
  name: 'Green tea',
  price: 12500,
  stock: 3,
  thumbnailUrl: '/tea.png',
  categoryName: 'Food',
  storeName: 'Tea Shop',
  storeSlug: 'tea-shop',
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, data }), { status });

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith('/api/stores/')) return response(profile);
    return response({ items: [product], page: 1, pageSize: 12, total: 1, totalPages: 1 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('storefront', () => {
  it('renders an approved store profile, product details and product link', async () => {
    render(<StorefrontPage slug="tea-shop" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Tea Shop' })).toBeInTheDocument();
    expect(screen.getByAltText('Tea Shop')).toHaveAttribute('src', '/logo.png');
    expect(screen.getByText('Local tea and coffee')).toBeInTheDocument();
    expect(screen.getByText('12,500 MMK')).toBeInTheDocument();
    expect(screen.getByText('3 in stock')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Green tea' })).toHaveAttribute(
      'href',
      '#/products/tea1',
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/stores/tea-shop', expect.anything());
    expect(
      new URL(fetchMock.mock.calls[1]![0], 'http://localhost').searchParams.get('storeSlug'),
    ).toBe('tea-shop');
  });
  it('paginates products within the same store and shows stock/image fallbacks', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/api/stores/')
        ? response(profile)
        : response({
            items: [
              {
                ...product,
                name: url.includes('page=2') ? 'Second tea' : 'Green tea',
                stock: 0,
                thumbnailUrl: null,
              },
            ],
            totalPages: 2,
          }),
    );
    render(<StorefrontPage slug="tea-shop" />);
    await screen.findByText('Green tea');
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.getByText('No image')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Second tea');
    const params = new URL(fetchMock.mock.calls.at(-1)![0], 'http://localhost').searchParams;
    expect(params.get('page')).toBe('2');
    expect(params.get('storeSlug')).toBe('tea-shop');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
  it('shows an empty store without optional profile fields and switches language', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/api/stores/')
        ? response({ ...profile, logoUrl: null, description: null })
        : response({ items: [], totalPages: 0 }),
    );
    render(<StorefrontPage slug="tea-shop" />);
    expect(
      await screen.findByText('This store has no published products yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'MY' }));
    expect(screen.getByText('ဤဆိုင်တွင် ထုတ်ဝေထားသောကုန်ပစ္စည်း မရှိသေးပါ။')).toBeInTheDocument();
  });
  it('does not request products when the store is unavailable', async () => {
    fetchMock.mockResolvedValue(response(null, 404));
    render(<StorefrontPage slug="hidden" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Store not found or unavailable.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects a non-approved profile defensively', async () => {
    fetchMock.mockResolvedValue(response({ ...profile, status: 'SUSPENDED' }));
    render(<StorefrontPage slug="hidden" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Store not found');
    expect(screen.queryByText('Tea Shop')).not.toBeInTheDocument();
  });
  it('shows a retry action after a network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(<StorefrontPage slug="tea-shop" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this store');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Green tea')).toBeInTheDocument();
  });
  it('opens the hash route and responds to navigation between stores', async () => {
    window.history.replaceState(null, '', '/#/stores/tea-shop');
    render(<App />);
    await screen.findByText('Green tea');
    window.history.replaceState(null, '', '/#/stores/other%20shop');
    fireEvent(window, new HashChangeEvent('hashchange'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/stores/other%20shop', expect.anything()),
    );
  });
  it('does not crash on malformed hash encoding', () => {
    window.history.replaceState(null, '', '/#/stores/%ZZ');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'MyanMart' })).toBeInTheDocument();
  });
});
