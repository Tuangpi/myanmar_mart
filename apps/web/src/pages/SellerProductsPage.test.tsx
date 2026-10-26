import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SellerProductsPage } from './SellerProductsPage';

const fetchMock = vi.fn();
const product = {
  id: 'p1',
  name: 'Tea',
  slug: 'tea',
  price: 1500,
  stock: 4,
  description: '',
  categoryId: null,
  status: 'DRAFT',
  images: [],
};
let storeStatus = 'APPROVED';
beforeEach(() => {
  localStorage.clear();
  storeStatus = 'APPROVED';
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    let data: unknown;
    if (init?.method === 'POST' || init?.method === 'PATCH') data = product;
    else if (url === '/api/categories') data = [];
    else if (url === '/api/seller/store') data = [{ status: storeStatus }];
    else data = { items: [product], page: 1, totalPages: 1, total: 1 };
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('seller products screen', () => {
  it('creates a draft with an image, edits stock, publishes and archives', async () => {
    render(<SellerProductsPage />);
    await screen.findByText('Tea');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New tea' } });
    fireEvent.change(screen.getByLabelText('Price (MMK)'), { target: { value: '2500' } });
    fireEvent.change(screen.getByLabelText('Image (PNG, JPEG or WebP)'), {
      target: { files: [new File(['image'], 'tea.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/seller/products/p1/images',
        expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Edit product' }));
    fireEvent.change(screen.getByLabelText('Stock'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/seller/products/p1',
        expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"stock":12') }),
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/seller/products/p1',
        expect.objectContaining({ body: '{"status":"ACTIVE"}' }),
      ),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/seller/products/p1',
        expect.objectContaining({ body: '{"status":"ARCHIVED"}' }),
      ),
    );
  });
  it('disables publishing while pending and switches to Burmese', async () => {
    storeStatus = 'PENDING';
    render(<SellerProductsPage />);
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(
      screen.getByText('Your store must be approved before you can publish.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'MY' }));
    expect(screen.getByLabelText('အမည်')).toBeInTheDocument();
  });
  it('shows an authentication error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ success: false }) });
    render(<SellerProductsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please sign in with a seller account.',
    );
  });
});
