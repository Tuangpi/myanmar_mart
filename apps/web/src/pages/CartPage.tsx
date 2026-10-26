import { useEffect, useState } from 'react';
import { useI18n, type CartResponse } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';
import { formatMMK } from '../lib/format';
import { cartErrorKey, requestCart } from '../lib/cart';

function CartContent() {
  const { t } = useI18n();
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setCart(null);
    setError('');
    requestCart('/api/cart', 'GET', undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setCart(data);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(cartErrorKey(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  async function mutate(id: string, quantity?: number) {
    setBusy(true);
    setError('');
    try {
      setCart(
        await requestCart(
          `/api/cart/items/${encodeURIComponent(id)}`,
          quantity === undefined ? 'DELETE' : 'PATCH',
          quantity === undefined ? undefined : { quantity },
        ),
      );
    } catch (err) {
      setError(cartErrorKey(err));
      try {
        setCart(await requestCart());
      } catch {
        /* Keep the last successful snapshot. */
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">{t('cart.title')}</h2>
      {loading && <p role="status">{t('common.loading')}</p>}
      {error && (
        <div role="alert">
          <p>{t(error)}</p>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => setReload((value) => value + 1)}
            className="text-primary underline"
          >
            {t('cart.retry')}
          </button>
        </div>
      )}
      {!loading &&
        cart &&
        (cart.items.length === 0 ? (
          <p>{t('cart.noItems')}</p>
        ) : (
          <>
            <ul className="space-y-4">
              {cart.items.map((item) => (
                <li key={item.id} className="border rounded-lg bg-white p-4 space-y-3">
                  <div className="flex gap-4">
                    {item.thumbnailUrl && item.available && (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.name}
                        className="w-20 h-20 rounded object-cover"
                      />
                    )}
                    <div>
                      <a
                        href={`#/products/${encodeURIComponent(item.productId)}`}
                        className="font-semibold text-primary"
                      >
                        {item.name}
                      </a>
                      <p>
                        <a href={`#/stores/${encodeURIComponent(item.storeSlug)}`}>
                          {item.storeName}
                        </a>
                      </p>
                      <p>{formatMMK(item.unitPrice)}</p>
                    </div>
                  </div>
                  {(!item.available || item.stock < item.quantity) && (
                    <p role="status" className="text-red-600">
                      {t(item.available ? 'cart.stockChanged' : 'cart.unavailable')}
                    </p>
                  )}
                  <form
                    className="flex flex-wrap gap-3 items-center"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const quantity = Number(new FormData(event.currentTarget).get('quantity'));
                      if (Number.isInteger(quantity) && quantity >= 1 && quantity <= item.stock)
                        void mutate(item.id, quantity);
                    }}
                  >
                    <label htmlFor={`quantity-${item.id}`}>
                      {t('cart.quantity')} — {item.name}
                    </label>
                    <input
                      key={`${item.id}-${item.quantity}-${item.stock}`}
                      id={`quantity-${item.id}`}
                      name="quantity"
                      type="number"
                      min="1"
                      max={Math.max(1, item.stock)}
                      step="1"
                      required
                      defaultValue={item.quantity}
                      disabled={busy || !item.available || item.stock === 0}
                      className="border rounded p-2 w-24"
                    />
                    <button
                      type="submit"
                      disabled={busy || !item.available || item.stock === 0}
                      className="text-primary disabled:opacity-50"
                    >
                      {t('cart.update')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void mutate(item.id)}
                      className="text-red-600 disabled:opacity-50"
                      aria-label={`${t('cart.remove')} — ${item.name}`}
                    >
                      {t('cart.remove')}
                    </button>
                  </form>
                  <p>
                    {t('cart.subtotal')}: {formatMMK(item.subtotal)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="font-bold">
              {t('cart.subtotal')}: {formatMMK(cart.subtotal)}
            </p>
            <p className="text-sm text-neutral-600">{t('cart.priceNotice')}</p>
            {!busy && !cart.items.some((item) => !item.available || item.quantity > item.stock) && (
              <a href="#/checkout" className="inline-block bg-primary text-white rounded px-4 py-2">{t('cart.checkout')}</a>
            )}
          </>
        ))}
      <a href="#/" className="inline-block text-primary underline">
        {t('cart.continueShopping')}
      </a>
    </div>
  );
}

export function CartPage() {
  return (
    <I18nLayout>
      <CartContent />
    </I18nLayout>
  );
}
