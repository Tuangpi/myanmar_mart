import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@myanmart/shared';
import type { CategoryResponse, ProductSummary, Paginated } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';
import { formatMMK } from '../lib/format';

const PAGE_SIZE = 12;

type SortField = 'name' | 'price' | 'createdAt';

const SORT_OPTIONS: { value: SortField; labelKey: string }[] = [
  { value: 'createdAt', labelKey: 'catalogPage.sortNewest' },
  { value: 'name', labelKey: 'catalogPage.sortName' },
  { value: 'price', labelKey: 'catalogPage.sortPrice' },
];

function CatalogContent() {
  const { t } = useI18n();

  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const id = setTimeout(() => {
      if (search.trim() !== debouncedSearch) {
        setDebouncedSearch(search.trim());
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [search, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/categories')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.success) setCategories(json.data as CategoryResponse[]);
      })
      .catch(() => {
        // Categories are optional for browsing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (categoryId) params.set('categoryId', categoryId);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);

    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success) {
          const data = json.data as Paginated<ProductSummary>;
          setProducts(data.items ?? []);
          setTotal(data.total ?? 0);
          setTotalPages(data.totalPages ?? 1);
        } else {
          setError(true);
          setProducts([]);
          setTotalPages(0);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setProducts([]);
        setTotalPages(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, categoryId, sortBy, sortOrder]);

  const showingText = useMemo(() => {
    if (loading) return t('common.loading');
    if (error) return t('notifications.loadFailed');
    if (products.length === 0) return t('catalog.noResults');
    return t('catalogPage.showing', { count: products.length, total });
  }, [loading, error, products.length, total, t]);

  return (
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">{t('layout.nav.catalog')}</h1>
        <p className="text-neutral-600 mb-8">{t('app.tagline')}</p>

        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder={t('catalogPage.searchPlaceholder')}
            className="flex-1 border border-neutral-300 rounded px-3 py-2 text-sm"
            aria-label={t('catalogPage.searchPlaceholder')}
          />

          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            className="border border-neutral-300 rounded px-3 py-2 text-sm"
            aria-label={t('catalogPage.filterCategory')}
          >
            <option value="">{t('catalogPage.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.productCount})
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortField);
              setPage(1);
            }}
            className="border border-neutral-300 rounded px-3 py-2 text-sm"
            aria-label={t('catalogPage.sortBy')}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
              setPage(1);
            }}
            className="border border-neutral-300 rounded px-3 py-2 text-sm"
            aria-label={t('catalogPage.sortOrder')}
          >
            {sortOrder === 'asc' ? '\u2191' : '\u2193'}
          </button>
        </div>

        <p role={error ? 'alert' : 'status'} className="text-sm text-neutral-500 mb-4">{showingText}</p>

        {loading && products.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border rounded-lg p-4 animate-pulse h-48 bg-neutral-100" />
            ))}
          </div>
        ) : products.length === 0 ? null : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((p) => (
              <article key={p.id} className="border rounded-lg p-4 bg-white hover:border-primary transition-colors">
                <div className="aspect-square bg-neutral-100 rounded mb-3 overflow-hidden">
                  {p.thumbnailUrl ? (
                    <img
                      src={p.thumbnailUrl}
                      alt={p.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-400 text-sm">
                      {t('catalogPage.noImage')}
                    </div>
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{p.name}</h3>
                <p className="text-primary font-bold mb-1">{formatMMK(p.price)}</p>
                <p className="text-xs text-neutral-500 mb-2">{p.storeName}</p>
                {p.categoryName ? (
                  <p className="text-xs text-neutral-400 mb-2">{p.categoryName}</p>
                ) : null}
                <p className="text-xs">
                  {p.stock > 0 ? (
                    <span className="text-green-600">
                      {t('catalogPage.inStock', { count: p.stock })}
                    </span>
                  ) : (
                    <span className="text-red-600">{t('product.outOfStock')}</span>
                  )}
                </p>
                <a href={`#/products/${p.id}`} className="mt-2 inline-block text-sm text-primary hover:underline">
                  {t('common.view')}
                </a>
              </article>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || page <= 1}
              className="border border-neutral-300 rounded px-3 py-2 text-sm disabled:opacity-50"
            >
              {t('pagination.previous')}
            </button>
            <span className="text-sm text-neutral-600">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={loading || page >= totalPages}
              className="border border-neutral-300 rounded px-3 py-2 text-sm disabled:opacity-50"
            >
              {t('pagination.next')}
            </button>
          </div>
        )}
      </div>

  );
}


export function CatalogPage() {
  return (
    <I18nLayout>
      <CatalogContent />
    </I18nLayout>
  );
}
