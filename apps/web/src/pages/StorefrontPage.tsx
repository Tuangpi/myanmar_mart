import { useEffect, useState } from 'react';
import { useI18n, type StoreResponse, type ProductSummary, type Paginated } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';
import { formatMMK } from '../lib/format';

class StorefrontError extends Error {
  constructor(readonly status: number) {
    super(String(status));
  }
}

async function load<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new StorefrontError(response.status);
  const body = await response.json();
  if (!body.success || !body.data) throw new StorefrontError(500);
  return body.data as T;
}

function StorefrontContent({ slug }: { slug: string }) {
  const { t } = useI18n();
  const [store, setStore] = useState<StoreResponse | null>(null);
  const [products, setProducts] = useState<Paginated<ProductSummary> | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'notFound' | 'failed' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setProducts(null);
    const params = new URLSearchParams({ storeSlug: slug, page: String(page), pageSize: '12' });
    // Resolve the approved profile before requesting products; do not show hidden stores.
    load<StoreResponse>(`/api/stores/${encodeURIComponent(slug)}`, controller.signal)
      .then(async (profile) => {
        if (profile.status !== 'APPROVED') throw new StorefrontError(404);
        const listings = await load<Paginated<ProductSummary>>(
          `/api/products?${params}`,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setStore(profile);
          setProducts(listings);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setStore(null);
          setError(err instanceof StorefrontError && err.status === 404 ? 'notFound' : 'failed');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug, page, attempt]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <a href="#/" className="text-primary hover:underline">
        {t('common.back')}
      </a>
      {loading ? (
        <p role="status">{t('common.loading')}</p>
      ) : error ? (
        <div>
          <p role="alert">{t(`storefront.${error}`)}</p>
          {error === 'failed' && (
            <button
              type="button"
              className="mt-3 rounded border px-4 py-2"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {t('storefront.retry')}
            </button>
          )}
        </div>
      ) : (
        store &&
        products && (
          <>
            <header className="flex flex-col gap-4 rounded-lg border bg-white p-6 sm:flex-row sm:items-center">
              {store.logoUrl && (
                <img
                  src={store.logoUrl}
                  alt={store.name}
                  className="h-24 w-24 rounded object-contain"
                />
              )}
              <div className="min-w-0">
                <h2 className="break-words text-3xl font-bold">{store.name}</h2>
                {store.description && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-neutral-700">
                    {store.description}
                  </p>
                )}
              </div>
            </header>
            <section aria-labelledby="store-products-heading">
              <h3 id="store-products-heading" className="mb-4 text-xl font-semibold">
                {t('storefront.products')}
              </h3>
              {!products.items.length ? (
                <p>{t('storefront.empty')}</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {products.items.map((product) => (
                    <article key={product.id} className="rounded-lg border bg-white p-4">
                      {product.thumbnailUrl ? (
                        <img
                          src={product.thumbnailUrl}
                          alt={product.name}
                          loading="lazy"
                          className="mb-3 aspect-square w-full rounded object-cover"
                        />
                      ) : (
                        <div className="mb-3 flex aspect-square items-center justify-center rounded bg-neutral-100">
                          {t('catalogPage.noImage')}
                        </div>
                      )}
                      <h4 className="break-words font-semibold">
                        <a
                          href={`#/products/${encodeURIComponent(product.id)}`}
                          className="hover:underline"
                        >
                          {product.name}
                        </a>
                      </h4>
                      {product.categoryName && (
                        <p className="text-sm text-neutral-600">{product.categoryName}</p>
                      )}
                      <p className="mt-2 font-bold">{formatMMK(product.price)}</p>
                      <p className="text-sm">
                        {product.stock > 0
                          ? t('catalogPage.inStock', { count: product.stock })
                          : t('product.outOfStock')}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
            {products.totalPages > 1 && (
              <nav
                aria-label={t('storefront.pagination')}
                className="flex items-center justify-center gap-4"
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((n) => n - 1)}
                  className="rounded border px-3 py-2 disabled:opacity-50"
                >
                  {t('pagination.previous')}
                </button>
                <span>
                  {page} / {products.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= products.totalPages}
                  onClick={() => setPage((n) => n + 1)}
                  className="rounded border px-3 py-2 disabled:opacity-50"
                >
                  {t('pagination.next')}
                </button>
              </nav>
            )}
          </>
        )
      )}
    </div>
  );
}

export function StorefrontPage({ slug }: { slug: string }) {
  return (
    <I18nLayout>
      <StorefrontContent key={slug} slug={slug} />
    </I18nLayout>
  );
}
