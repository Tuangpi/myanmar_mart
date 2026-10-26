import { useEffect, useState } from 'react';
import { useI18n } from '@myanmart/shared';
import type { ProductDetail } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';
import { formatMMK } from '../lib/format';

interface ProductDetailPageProps {
  id?: string;
  productId?: string;
  slug?: string;
  productSlug?: string;
  product?: ProductDetail;
}

function resolveId(props: ProductDetailPageProps): string {
  const fromProps =
    props.id || props.productId || props.slug || props.productSlug || props.product?.id || props.product?.slug;
  if (fromProps) return fromProps;
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL(window.location.href);
    const fromQuery =
      url.searchParams.get('id') ||
      url.searchParams.get('productId') ||
      url.searchParams.get('slug') ||
      url.searchParams.get('product');
    if (fromQuery) return fromQuery;
    const pathMatch = window.location.pathname.match(/\/products?\/([^/?#]+)/);
    if (pathMatch) return decodeURIComponent(pathMatch[1]!);
    const hashMatch = window.location.hash.match(/#\/?products?\/([^/?#]+)/);
    if (hashMatch) return decodeURIComponent(hashMatch[1]!);
  } catch {
    // ignore malformed URLs
  }
  return '';
}

function ProductDetailContent(props: ProductDetailPageProps) {
  const { t } = useI18n();
  const id = resolveId(props);

  const [product, setProduct] = useState<ProductDetail | null>(props.product ?? null);
  const [loading, setLoading] = useState(!props.product);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (props.product) {
      setProduct(props.product);
      setLoading(false);
      setError(false);
      return;
    }
    if (!id) {
      setLoading(false);
      setError(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/products/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success && json.data) {
          setProduct(json.data as ProductDetail);
        } else {
          setError(true);
          setProduct(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setProduct(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, props.product]);

  const mainImage = product?.images?.[0]?.imageUrl ?? null;

  return (
    <div className="max-w-4xl mx-auto">
      <a href="#/" className="inline-block mb-4 text-sm text-primary hover:underline">
        {t('common.back')}
      </a>

      {loading ? (
        <p role="status" className="text-neutral-500">
          {t('common.loading')}
        </p>
      ) : error || !product ? (
        <p role="alert" className="text-red-600">
          {t('errors.notFound')}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden">
            {mainImage ? (
              <img src={mainImage} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400 text-sm">
                {t('catalogPage.noImage')}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{product.name}</h2>
            <p className="text-primary text-2xl font-bold mb-4">{formatMMK(product.price)}</p>

            <div className="space-y-2 text-sm text-neutral-700 mb-4">
              <p>
                <span className="font-semibold">{t('product.stock')}: </span>
                {product.stock > 0 ? (
                  <span className="text-green-600">
                    {t('catalogPage.inStock', { count: product.stock })}
                  </span>
                ) : (
                  <span className="text-red-600">{t('product.outOfStock')}</span>
                )}
              </p>
              {product.category ? (
                <p>
                  <span className="font-semibold">{t('catalogPage.filterCategory')}: </span>
                  {product.category.name}
                </p>
              ) : null}
              <p>
                <span className="font-semibold">{t('product.soldBy')}: </span>
                <a
                  href={`#/stores/${encodeURIComponent(product.store.slug)}`}
                  className="text-primary hover:underline"
                >
                  {product.store.name}
                </a>
              </p>
            </div>

            {product.stock > 0 ? (
              <button type="button" className="bg-primary text-white px-4 py-2 rounded text-sm font-medium">
                {t('product.addToCart')}
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="bg-neutral-300 text-neutral-600 px-4 py-2 rounded text-sm font-medium cursor-not-allowed"
              >
                {t('product.outOfStock')}
              </button>
            )}

            <div className="mt-6">
              <h3 className="font-semibold text-gray-900 mb-2">{t('product.description')}</h3>
              <p className="text-neutral-600 whitespace-pre-line">{product.description || '--'}</p>
            </div>

            {product.images && product.images.length > 1 ? (
              <div className="mt-6 flex gap-2 overflow-x-auto">
                {product.images.map((img) => (
                  <img
                    key={img.id}
                    src={img.imageUrl}
                    alt={product.name}
                    className="w-16 h-16 object-cover rounded border"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductDetailPage(props: ProductDetailPageProps = {}) {
  return (
    <I18nLayout>
      <ProductDetailContent {...props} />
    </I18nLayout>
  );
}
