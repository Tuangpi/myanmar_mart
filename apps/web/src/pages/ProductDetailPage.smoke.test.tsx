import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductDetailPage } from './ProductDetailPage';

const fetchMock = vi.fn();
function response(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
}

describe('ProductDetailPage smoke', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders detail from prop', async () => {
    render(<ProductDetailPage product={{
      id: '1', slug: 'p', name: 'Test Product', description: 'desc', price: 5000, stock: 2, status: 'ACTIVE',
      store: { id: 's', name: 'Store', slug: 'store', description: null, logoUrl: null, status: 'APPROVED' },
      category: { id: 'c', name: 'Food', slug: 'food' },
      images: [{ id: 'i', imageUrl: 'http://img', sortOrder: 0 }],
    } as any} />);
    expect(await screen.findByText('Test Product')).toBeInTheDocument();
    expect(screen.getByText('5,000 MMK')).toBeInTheDocument();
    expect(screen.getByText('desc')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Store')).toBeInTheDocument();
  });

  it('fetches by id prop', async () => {
    fetchMock.mockResolvedValue(response({ id: 'abc', slug: 'abc', name: 'Fetched', description: null, price: 100, stock: 0, status: 'ACTIVE', store: { id: 's', name: 'Store', slug: 'store', description: null, logoUrl: null, status: 'APPROVED' }, category: null, images: [] }));
    render(<ProductDetailPage id="abc" />);
    expect(await screen.findByText('Fetched')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Out of stock' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/products/abc');
  });
});
