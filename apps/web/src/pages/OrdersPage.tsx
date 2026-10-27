import { useEffect, useRef, useState } from 'react';
import { useI18n, type OrderResponse, type Paginated } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';
import { OrderRequestError, requestOrder } from '../lib/orders';
import { formatMMK } from '../lib/format';
import { OrderPayments } from '../components/OrderPayments';

function errorKey(error: unknown): string {
  if (error instanceof OrderRequestError) {
    if (error.status === 401) return 'ordersPage.signIn';
    if (error.status === 404 || error.status === 422) return 'ordersPage.notFound';
    if (error.status === 409) return 'ordersPage.cancelConflict';
  }
  return 'ordersPage.failed';
}

function OrderSummary({ order }: { order: OrderResponse }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <p>
        {t('ordersPage.status')}: {t(`ordersPage.statuses.${order.status}`)}
      </p>
      <p>
        {t('checkout.payment')}: {t(`checkoutPage.${order.paymentMethod}`)}
      </p>
      <p>
        {t('ordersPage.paymentStatus')}: {t(`ordersPage.payments.${order.paymentStatus}`)}
      </p>
      {order.sellerGroups.map((group) => (
        <section key={group.storeId} className="border rounded p-3 space-y-2">
          <h4 className="font-semibold">{group.storeName}</h4>
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.productName} × {item.quantity}
                </span>
                <span>
                  {' '}
                  — {formatMMK(item.unitPrice)} / {t('ordersPage.unit')} —{' '}
                  {formatMMK(item.subtotal)}
                </span>
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
    </div>
  );
}

function OrdersContent({ id }: { id?: string }) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Paginated<OrderResponse> | null>(null);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setList(null);
    setOrder(null);
    setConfirming(false);
    const path = id
      ? `/api/orders/${encodeURIComponent(id)}`
      : `/api/orders?page=${page}&pageSize=10`;
    requestOrder<OrderResponse | Paginated<OrderResponse>>(path, undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          if ('items' in data) setList(data);
          else setOrder(data);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorKey(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, page, reload]);

  async function cancel() {
    if (!order || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      setOrder(
        await requestOrder<OrderResponse>(`/api/orders/${encodeURIComponent(order.id)}/cancel`, {}),
      );
    } catch (err) {
      setError(errorKey(err));
      try {
        setOrder(await requestOrder<OrderResponse>(`/api/orders/${encodeURIComponent(order.id)}`));
      } catch {
        setOrder(null);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
      setConfirming(false);
    }
  }

  function date(value: string) {
    return new Date(value).toLocaleString(locale === 'my' ? 'my-MM' : 'en-US');
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">{t(id ? 'ordersPage.details' : 'ordersPage.title')}</h2>
      {id && (
        <a href="#/orders" className="text-primary underline">
          {t('ordersPage.back')}
        </a>
      )}
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
      {!loading && list && (
        <>
          {list.items.length === 0 ? (
            <p>{t('ordersPage.empty')}</p>
          ) : (
            <ul className="space-y-4">
              {list.items.map((entry) => (
                <li key={entry.id} className="border rounded bg-white p-4 space-y-3">
                  <h3 className="font-bold break-all">
                    <a
                      href={`#/orders/${encodeURIComponent(entry.id)}`}
                      className="text-primary underline"
                    >
                      {entry.orderNumber}
                    </a>
                  </h3>
                  <p>
                    {t('ordersPage.placed')}:{' '}
                    <time dateTime={entry.createdAt}>{date(entry.createdAt)}</time>
                  </p>
                  <OrderSummary order={entry} />
                </li>
              ))}
            </ul>
          )}
          {list.totalPages > 1 && (
            <nav aria-label={t('ordersPage.pagination')} className="flex gap-4 items-center">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t('ordersPage.previous')}
              </button>
              <span>{t('ordersPage.page', { page, total: list.totalPages })}</span>
              <button
                type="button"
                disabled={page >= list.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('ordersPage.next')}
              </button>
            </nav>
          )}
        </>
      )}
      {!loading && order && (
        <article className="border rounded bg-white p-4 space-y-4">
          <h3 className="font-bold break-all">{order.orderNumber}</h3>
          <p>
            {t('ordersPage.placed')}:{' '}
            <time dateTime={order.createdAt}>{date(order.createdAt)}</time>
          </p>
          <OrderSummary order={order} />
          <OrderPayments orderId={order.id} onChange={() => setReload((value) => value + 1)} />
          <section className="space-y-2">
            <h4 className="font-semibold">{t('checkout.address')}</h4>
            <p>
              {order.address.recipientName} — {order.address.phone}
            </p>
            <p>
              {order.address.address}, {order.address.city}, {order.address.region}
            </p>
            {order.address.notes && <p>{order.address.notes}</p>}
          </section>
          {order.canCancel &&
            (confirming ? (
              <div className="space-y-3">
                <p>{t('ordersPage.confirmPrompt')}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancel()}
                  className="text-red-600 mr-4"
                >
                  {t('ordersPage.confirmCancel')}
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
                  {t('ordersPage.keep')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="text-red-600"
              >
                {t('ordersPage.cancel')}
              </button>
            ))}
          {order.status === 'CANCELLED' && <p role="status">{t('ordersPage.cancelled')}</p>}
        </article>
      )}
    </div>
  );
}

export function OrdersPage({ id }: { id?: string } = {}) {
  return (
    <I18nLayout>
      <OrdersContent key={id ?? 'list'} id={id} />
    </I18nLayout>
  );
}
