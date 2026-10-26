import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CatalogPage } from './CatalogPage';

const categoryId = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();

function response(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function product(name: string) {
  return {
    id: name, slug: name, name, price: 12500, stock: 3,
    thumbnailUrl: null, storeName: 'Yangon shop', storeSlug: 'yangon', categoryName: 'Food',
  };
}

describe('CatalogPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: string) => {
      if (input === '/api/categories') {
        return response([{ id: categoryId, name: 'Food', slug: 'food', parentId: null, productCount: 13 }]);
      }
      const params = new URL(input, 'http://localhost').searchParams;
      const name = params.has('categoryId') ? 'Filtered tea' : params.get('page') === '2' ? 'Second tea' : 'First tea';
      return response({ items: [product(name)], page: Number(params.get('page')), pageSize: 12, total: 13, totalPages: 2 });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders API products, changes pages, and resets pagination on category selection', async () => {
    render(<CatalogPage />);
    expect(await screen.findByText('First tea')).toBeInTheDocument();
    expect(screen.getByText('12,500 MMK')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Second tea')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: categoryId } });
    expect(await screen.findByText('Filtered tea')).toBeInTheDocument();
    const params = new URL(fetchMock.mock.calls.at(-1)![0], 'http://localhost').searchParams;
    expect(params.get('categoryId')).toBe(categoryId);
    expect(params.get('page')).toBe('1');
  });

  it('debounces search and sends sort controls to the API', async () => {
    render(<CatalogPage />);
    await screen.findByText('First tea');
    fetchMock.mockClear();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' tea ' } });
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(new URL(fetchMock.mock.calls[0]![0], 'http://localhost').searchParams.get('search')).toBe('tea');
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'price' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sort order' }));
    await waitFor(() => {
      const params = new URL(fetchMock.mock.calls.at(-1)![0], 'http://localhost').searchParams;
      expect(params.get('sortBy')).toBe('price');
      expect(params.get('sortOrder')).toBe('asc');
    });
  });

  it('shows empty results and network errors', async () => {
    fetchMock.mockImplementation(async (input: string) => input === '/api/categories'
      ? response([])
      : response({ items: [], page: 1, pageSize: 12, total: 0, totalPages: 0 }));
    render(<CatalogPage />);
    expect(await screen.findByText('No products match your search.')).toBeInTheDocument();
    fetchMock.mockRejectedValue(new Error('Network unavailable'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'price' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load');
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('switches language immediately and preserves it after remounting', async () => {
    const view = render(<CatalogPage />);
    await screen.findByText('First tea');
    fireEvent.click(screen.getByRole('button', { name: 'MY' }));
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'ထုတ်ကုန်ရှာဖွေရန်...');
    expect(localStorage.getItem('myanmart.locale')).toBe('my');
    view.unmount();
    render(<CatalogPage />);
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'ထုတ်ကုန်ရှာဖွေရန်...');
  });
});