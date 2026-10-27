import { useEffect, useRef, useState } from 'react';
import { useI18n, type Paginated, type PaymentReviewOrder } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';
import { PaymentAttempts } from '../components/OrderPayments';
import { requestOrder, OrderRequestError } from '../lib/orders';
import { formatMMK } from '../lib/format';

function ReviewContent({ role }: { role: 'admin' | 'seller' }) {
  const { t } = useI18n();
  const [data, setData] = useState<Paginated<PaymentReviewOrder> | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const base = `/api/${role}/payment-orders`;
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    requestOrder<Paginated<PaymentReviewOrder>>(
      `${base}?page=${page}&pageSize=10`,
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
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
  }, [base, page, reload]);
  async function action(path: string, body: unknown) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await requestOrder(path, body);
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
      <h2 className="text-xl font-bold">{t('payment.reviewTitle')}</h2>
      <p>{t('payment.reviewScope')}</p>
      {error && <p role="alert">{t(error)}</p>}
      <button
        onClick={() => {
          setError('');
          setReload((n) => n + 1);
        }}
        disabled={busy}
      >
        {t('payment.retry')}
      </button>
      {!data && !error && <p role="status">{t('common.loading')}</p>}
      {data?.items.length === 0 && <p>{t('ordersPage.empty')}</p>}
      {data?.items.map((order) => (
        <article className="border bg-white rounded p-4 space-y-3" key={order.orderId}>
          <h3 className="font-bold">{order.orderNumber}</h3>
          <p>
            {t(`checkoutPage.${order.method}`)} — {formatMMK(order.total)}
          </p>
          <p>
            {t(`ordersPage.statuses.${order.status}`)} —{' '}
            {t(`ordersPage.payments.${order.paymentStatus}`)}
          </p>
          <PaymentAttempts data={order} />
          {order.status === 'PAYMENT_SUBMITTED' &&
            order.attempts
              .filter((p) => p.status === 'SUBMITTED')
              .map((p) => (
                <div className="flex gap-4" key={p.id}>
                  {(['VERIFIED', 'REJECTED'] as const).map((decision) => (
                    <button
                      key={decision}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(t('payment.confirmReview')))
                          void action(`${base}/${order.orderId}/payments/${p.id}/review`, {
                            decision,
                          });
                      }}
                    >
                      {t(decision === 'VERIFIED' ? 'payment.verify' : 'payment.reject')}
                    </button>
                  ))}
                </div>
              ))}
          {order.allowedStatuses
            .filter((s) => s !== 'REFUNDED')
            .map((status) => (
              <button
                className="border p-2 mr-2"
                key={status}
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        status === 'DELIVERED' && order.method === 'COD'
                          ? 'payment.confirmCod'
                          : 'payment.confirmStatus',
                      ),
                    )
                  )
                    void action(`${base}/${order.orderId}/status`, { status });
                }}
              >
                {t(`ordersPage.statuses.${status}`)}
              </button>
            ))}
          {order.allowedStatuses.includes('REFUNDED') && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                if (window.confirm(t('payment.confirmRefund')))
                  void action(`${base}/${order.orderId}/status`, {
                    status: 'REFUNDED',
                    transactionReference: form.get('transactionReference'),
                  });
              }}
              className="space-y-2"
            >
              <label className="block">
                {t('payment.refundReference')}
                <input
                  className="block border p-2"
                  required
                  maxLength={200}
                  name="transactionReference"
                  disabled={busy}
                />
              </label>
              <button disabled={busy}>{t('payment.refund')}</button>
            </form>
          )}
        </article>
      ))}
      {data && data.totalPages > 1 && (
        <nav className="flex gap-4" aria-label={t('ordersPage.pagination')}>
          <button disabled={busy || page <= 1} onClick={() => setPage((n) => n - 1)}>
            {t('ordersPage.previous')}
          </button>
          <span>{t('ordersPage.page', { page, total: data.totalPages })}</span>
          <button disabled={busy || page >= data.totalPages} onClick={() => setPage((n) => n + 1)}>
            {t('ordersPage.next')}
          </button>
        </nav>
      )}
    </div>
  );
}

export function PaymentReviewPage({ role }: { role: 'admin' | 'seller' }) {
  return (
    <I18nLayout>
      <ReviewContent key={role} role={role} />
    </I18nLayout>
  );
}
