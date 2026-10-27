import { useEffect, useRef, useState } from 'react';
import {
  useI18n,
  type Paginated,
  type SellerOrderResponse,
  type SellerSalesSummary,
  type SellerPaymentInstructions,
} from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';
import { requestOrder, OrderRequestError } from '../lib/orders';
import { formatMMK } from '../lib/format';

function SellerOrdersContent() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<Paginated<SellerOrderResponse> | null>(null);
  const [summary, setSummary] = useState<SellerSalesSummary | null>(null);
  const [instructions, setInstructions] = useState<SellerPaymentInstructions | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setOrders(null);
    Promise.all([
      requestOrder<Paginated<SellerOrderResponse>>(
        `/api/seller/orders?page=${page}&pageSize=10`,
        undefined,
        controller.signal,
      ),
      requestOrder<SellerSalesSummary>('/api/seller/sales-summary', undefined, controller.signal),
      requestOrder<SellerPaymentInstructions>(
        '/api/seller/payment-instructions',
        undefined,
        controller.signal,
      ),
    ])
      .then(([list, totals, saved]) => {
        if (!controller.signal.aborted) {
          setOrders(list);
          setSummary(totals);
          setInstructions(saved);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof OrderRequestError && [401, 403].includes(err.status)
              ? 'payment.forbidden'
              : 'payment.failed',
          );
      });
    return () => controller.abort();
  }, [page, reload]);
  async function action(path: string, body: unknown, saved = false) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await requestOrder(path, body, undefined, 'PATCH');
      if (saved) setMessage('fulfillment.saved');
    } catch {
      setError('payment.failed');
    } finally {
      submitting.current = false;
      setBusy(false);
      setReload((n) => n + 1);
    }
  }
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-xl font-bold">{t('fulfillment.title')}</h2>
      <p>{t('fulfillment.scope')}</p>
      {error && <p role="alert">{t(error)}</p>}
      {message && <p role="status">{t(message)}</p>}
      <button
        disabled={busy}
        onClick={() => {
          setError('');
          setReload((n) => n + 1);
        }}
      >
        {t('payment.retry')}
      </button>
      {!orders && !error && <p role="status">{t('common.loading')}</p>}
      {summary && (
        <section className="border p-4 space-y-2">
          <h3 className="font-bold">{t('fulfillment.summary')}</h3>
          <p>
            {t('fulfillment.orderCount')}: {summary.orderCount}
          </p>
          <p>
            {t('fulfillment.delivered')}: {formatMMK(summary.deliveredSubtotal)}
          </p>
          <p>
            {t('fulfillment.active')}: {formatMMK(summary.activeSubtotal)}
          </p>
          <p>{t('fulfillment.summaryNote')}</p>
        </section>
      )}
      {instructions && (
        <form
          className="border p-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void action('/api/seller/payment-instructions', instructions, true);
          }}
        >
          <h3 className="font-bold">{t('fulfillment.instructions')}</h3>
          <p>{t('fulfillment.instructionsNote')}</p>
          {(['KBZPAY', 'WAVEPAY', 'BANK_TRANSFER'] as const).map((method) => (
            <label className="block" key={method}>
              {t(`checkoutPage.${method}`)}
              <textarea
                className="block border w-full p-2"
                maxLength={2000}
                disabled={busy}
                value={instructions[method]}
                onChange={(event) =>
                  setInstructions({ ...instructions, [method]: event.target.value })
                }
              />
            </label>
          ))}
          <button disabled={busy}>{t('fulfillment.save')}</button>
        </form>
      )}
      {orders?.items.length === 0 && <p>{t('ordersPage.empty')}</p>}
      {orders?.items.map((order) => (
        <article key={order.id} className="border rounded p-4 space-y-3 bg-white">
          <h3 className="font-bold break-all">{order.orderNumber}</h3>
          <p>
            {t(`ordersPage.statuses.${order.status}`)} —{' '}
            {t(`ordersPage.payments.${order.paymentStatus}`)}
          </p>
          <p>
            {order.address.recipientName} — {order.address.phone}
          </p>
          <p>
            {order.address.address}, {order.address.city}, {order.address.region}
          </p>
          {order.address.notes && <p>{order.address.notes}</p>}
          <p>
            {t('cart.subtotal')}: {formatMMK(order.subtotal)}
          </p>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="border-t pt-2">
                <p>
                  {item.productName} × {item.quantity} — {formatMMK(item.subtotal)}
                </p>
                <p>{t(`ordersPage.statuses.${item.fulfillmentStatus}`)}</p>
                {item.allowedStatuses.map((status) => (
                  <button
                    className="border p-2"
                    disabled={busy}
                    key={status}
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            order.paymentMethod === 'COD' && status === 'DELIVERED'
                              ? 'fulfillment.confirmCod'
                              : 'payment.confirmStatus',
                          ),
                        )
                      )
                        void action(`/api/seller/orders/${encodeURIComponent(order.id)}/status`, {
                          itemId: item.id,
                          status,
                        });
                    }}
                  >
                    {t(`ordersPage.statuses.${status}`)}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </article>
      ))}
      {orders && orders.totalPages > 1 && (
        <nav className="flex gap-4" aria-label={t('ordersPage.pagination')}>
          <button
            disabled={busy || page <= 1}
            onClick={() => {
              setError('');
              setPage((n) => n - 1);
            }}
          >
            {t('ordersPage.previous')}
          </button>
          <span>{t('ordersPage.page', { page, total: orders.totalPages })}</span>
          <button
            disabled={busy || page >= orders.totalPages}
            onClick={() => {
              setError('');
              setPage((n) => n + 1);
            }}
          >
            {t('ordersPage.next')}
          </button>
        </nav>
      )}
    </div>
  );
}

export function SellerOrdersPage() {
  return (
    <I18nLayout>
      <SellerOrdersContent />
    </I18nLayout>
  );
}
