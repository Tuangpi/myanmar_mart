import { useEffect, useRef, useState } from 'react';
import {
  checkoutSchema,
  PAYMENT_METHODS,
  useI18n,
  type CheckoutQuote,
  type OrderResponse,
} from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';
import { requestOrder, checkoutErrorKey } from '../lib/orders';
import { formatMMK } from '../lib/format';

function CheckoutContent() {
  const { t } = useI18n();
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setQuote(null);
    setError('');
    requestOrder<CheckoutQuote>('/api/checkout', undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setQuote(data);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(checkoutErrorKey(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  const blocked =
    !quote ||
    quote.cart.items.length === 0 ||
    quote.cart.items.some((item) => !item.available || item.quantity > item.stock);
  const fields = ['recipientName', 'phone', 'region', 'city', 'address', 'notes'] as const;

  if (order)
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <h2 className="text-2xl font-bold">{t('checkoutPage.success')}</h2>
        <a href={`#/orders/${encodeURIComponent(order.id)}`} className="text-primary underline">{t('ordersPage.details')}</a>
        <p>
          {t('checkoutPage.orderNumber')}: {order.orderNumber}
        </p>
        <p>
          {t('checkoutPage.status')}: {t(`checkoutPage.${order.status}`)}
        </p>
        <p>
          {t('checkout.payment')}: {t(`checkoutPage.${order.paymentMethod}`)}
        </p>
        {order.paymentMethod !== 'COD' && <p>{t('checkoutPage.prepaidNotice')}</p>}
        <p>
          {order.address.recipientName} — {order.address.phone}
        </p>
        <p>
          {order.address.address}, {order.address.city}, {order.address.region}
        </p>
        {order.sellerGroups.map((group) => (
          <section key={group.storeId} className="border rounded bg-white p-4 space-y-2">
            <h3 className="font-bold">{group.storeName}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  {item.productName} × {item.quantity} — {formatMMK(item.subtotal)}
                </li>
              ))}
            </ul>
            <p>
              {t('cart.subtotal')}: {formatMMK(group.subtotal)}
            </p>
          </section>
        ))}
        <p>
          {t('cart.subtotal')}: {formatMMK(order.subtotal)}
        </p>
        <p>
          {t('checkoutPage.deliveryFee')}: {formatMMK(order.deliveryFee)}
        </p>
        <p className="font-bold">
          {t('cart.total')}: {formatMMK(order.total)}
        </p>
        <a href="#/" className="text-primary underline">
          {t('cart.continueShopping')}
        </a>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">{t('checkout.title')}</h2>
      <a href="#/cart" className="text-primary underline">
        {t('cart.title')}
      </a>
      {loading && <p role="status">{t('common.loading')}</p>}
      {error && (
        <div role="alert">
          <p>{t(error)}</p>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => setReload((value) => value + 1)}
            className="underline"
          >
            {t('cart.retry')}
          </button>
        </div>
      )}
      {quote && (
        <>
          {quote.cart.items.length === 0 ? (
            <p>{t('cart.noItems')}</p>
          ) : (
            <>
              <section className="border rounded bg-white p-4 space-y-2">
                <h3 className="font-bold">{t('checkout.orderSummary')}</h3>
                <ul>
                  {quote.cart.items.map((item) => (
                    <li key={item.id}>
                      {item.storeName}: {item.name} × {item.quantity} — {formatMMK(item.subtotal)}
                    </li>
                  ))}
                </ul>
                <p>
                  {t('cart.subtotal')}: {formatMMK(quote.cart.subtotal)}
                </p>
                <p>
                  {t('checkoutPage.deliveryFee')}: {formatMMK(quote.deliveryFee)}
                </p>
                <p className="font-bold">
                  {t('cart.total')}: {formatMMK(quote.total)}
                </p>
                <p>{t('checkoutPage.priceNotice')}</p>
              </section>
              {blocked && <p role="alert">{t('checkoutPage.cartChanged')}</p>}
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (submitting.current || blocked) return;
                  const form = new FormData(event.currentTarget);
                  const parsed = checkoutSchema.safeParse({
                    address: Object.fromEntries(fields.map((field) => [field, form.get(field)])),
                    paymentMethod: form.get('paymentMethod'),
                  });
                  if (!parsed.success) {
                    setError('checkoutPage.invalid');
                    return;
                  }
                  submitting.current = true;
                  setBusy(true);
                  setError('');
                  requestOrder<OrderResponse>('/api/orders', parsed.data)
                    .then(setOrder)
                    .catch((err: unknown) => {
                      setError(checkoutErrorKey(err));
                      setQuote(null);
                    })
                    .finally(() => {
                      submitting.current = false;
                      setBusy(false);
                    });
                }}
              >
                <fieldset disabled={busy || blocked} className="space-y-4">
                  <legend className="font-bold">{t('checkout.address')}</legend>
                  {fields.map((field) => (
                    <label key={field} className="block">
                      <span>{t(`checkoutPage.${field}`)}</span>
                      <input
                        name={field}
                        type={field === 'phone' ? 'tel' : 'text'}
                        required={field !== 'notes'}
                        minLength={
                          field === 'recipientName'
                            ? 2
                            : field === 'phone'
                              ? 6
                              : field === 'address'
                                ? 5
                                : 1
                        }
                        maxLength={
                          field === 'phone'
                            ? 20
                            : field === 'address' || field === 'notes'
                              ? 1000
                              : 100
                        }
                        className="block w-full border rounded p-2 bg-white"
                      />
                    </label>
                  ))}
                  <label className="block">
                    {t('checkout.payment')}
                    <select
                      name="paymentMethod"
                      defaultValue="COD"
                      className="block w-full border rounded p-2 bg-white"
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {t(`checkoutPage.${method}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-sm">{t('checkoutPage.prepaidNotice')}</p>
                  <button
                    type="submit"
                    className="bg-primary text-white rounded px-4 py-2 disabled:opacity-50"
                  >
                    {t(busy ? 'common.loading' : 'checkout.placeOrder')}
                  </button>
                </fieldset>
              </form>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function CheckoutPage() {
  return (
    <I18nLayout>
      <CheckoutContent />
    </I18nLayout>
  );
}
