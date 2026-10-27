import { useEffect, useRef, useState } from 'react';
import { useI18n, type OrderPaymentsResponse } from '@myanmart/shared';
import { requestOrder } from '../lib/orders';
import { formatMMK } from '../lib/format';

export function PaymentAttempts({ data }: { data: OrderPaymentsResponse }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-3">
      {data.attempts.map((p) => (
        <li key={p.id} className="border p-3 rounded">
          <p>
            {formatMMK(p.amount)} — {t(`ordersPage.payments.${p.status}`)}
          </p>
          <p>{p.transactionReference}</p>
          <time dateTime={p.createdAt}>{new Date(p.createdAt).toLocaleString()}</time>
          {p.receiptUrl && (
            <a className="block underline" href={p.receiptUrl} target="_blank" rel="noreferrer">
              {t('payment.receipt')}
            </a>
          )}
          {p.verifiedBy && (
            <p>
              {t('payment.reviewedBy')}: {p.verifiedBy}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function OrderPayments({ orderId, onChange }: { orderId: string; onChange: () => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<OrderPaymentsResponse | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    requestOrder<OrderPaymentsResponse>(
      `/api/orders/${orderId}/payments`,
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [orderId, reload]);
  async function submit(form: HTMLFormElement) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(false);
    try {
      setData(
        await requestOrder<OrderPaymentsResponse>(
          `/api/orders/${orderId}/payments`,
          new FormData(form),
        ),
      );
      onChange();
    } catch {
      setError(true);
      // Re-read before allowing another attempt if the server response was lost.
      setData(null);
      setReload((n) => n + 1);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h4 className="font-semibold">{t('payment.title')}</h4>
      {error && (
        <div role="alert">
          {t('payment.failed')}{' '}
          <button
            onClick={() => {
              setError(false);
              setReload((n) => n + 1);
            }}
          >
            {t('payment.retry')}
          </button>
        </div>
      )}
      {!data && !error && <p role="status">{t('common.loading')}</p>}
      {data && (
        <>
          {data.method === 'COD' ? (
            <p>{t('payment.cod')}</p>
          ) : (
            <>
              <p className="whitespace-pre-wrap">
                {data.instructions || t('payment.unconfigured')}
              </p>
              <p>{t('payment.noCredentials')}</p>
              {data.canSubmit && !!data.instructions.trim() && (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit(event.currentTarget);
                  }}
                >
                  <label className="block">
                    {t('payment.reference')}
                    <input
                      className="block border p-2"
                      name="transactionReference"
                      required
                      maxLength={200}
                      disabled={busy}
                    />
                  </label>
                  <label className="block">
                    {t('payment.receipt')}
                    <input
                      className="block"
                      name="receipt"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      required
                      disabled={busy}
                    />
                  </label>
                  <p>{t('payment.imageTypes')}</p>
                  <button className="border rounded p-2" disabled={busy}>
                    {t('payment.submit')}
                  </button>
                </form>
              )}
            </>
          )}
          <PaymentAttempts data={data} />
        </>
      )}
    </section>
  );
}
