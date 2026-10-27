import { useEffect, useState } from 'react';
import { useI18n, type Paginated, type PaymentReviewOrder } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';
import { requestOrder, OrderRequestError } from '../lib/orders';

type Seller = {
  id: string;
  name: string;
  slug: string;
  status: string;
  owner: { id: string; name: string; email: string };
};

type AdminProduct = {
  id: string;
  name: string;
  status: string;
  storeName: string;
};

type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
};

type AuditEntry = {
  id: string;
  actor: { id: string; name: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
};

type AdminReport = {
  totalSellers: number;
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
};

export function AdminPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'sellers' | 'products' | 'orders' | 'payments' | 'audit' | 'reports'>('sellers');
  const [sellers, setSellers] = useState<Seller[] | null>(null);
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [payments, setPayments] = useState<PaymentReviewOrder[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [report, setReport] = useState<AdminReport | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      if (tab === 'sellers') {
        setSellers(await requestOrder<Seller[]>('/api/admin/sellers'));
      } else if (tab === 'products') {
        const data = await requestOrder<{ items: AdminProduct[] }>('/api/admin/products?page=1&pageSize=20');
        setProducts(data.items);
      } else if (tab === 'orders') {
        const data = await requestOrder<{ items: AdminOrder[] }>('/api/admin/orders?page=1&pageSize=20');
        setOrders(data.items);
      } else if (tab === 'payments') {
        const data = await requestOrder<Paginated<PaymentReviewOrder>>('/api/admin/payments?page=1&pageSize=20');
        setPayments(data.items);
      } else if (tab === 'audit') {
        const data = await requestOrder<{ items: AuditEntry[] }>('/api/admin/audit?page=1&pageSize=20');
        setAudit(data.items);
      } else if (tab === 'reports') {
        const data = await requestOrder<AdminReport>('/api/admin/reports');
        setReport(data);
      }
    } catch (err) {
      setError(err instanceof OrderRequestError && [401, 403].includes(err.status) ? 'payment.forbidden' : 'notifications.loadFailed');
    }
  }

  useEffect(() => {
    void load();
  }, [tab]);

  async function sellerAction(id: string, status: 'APPROVED' | 'REJECTED' | 'SUSPENDED') {
    await requestOrder(`/api/admin/sellers/${id}/status`, { status }, undefined, 'PATCH');
    await load();
  }

  async function productAction(id: string, status: 'ACTIVE' | 'ARCHIVED') {
    await requestOrder(`/api/admin/products/${id}/status`, { status }, undefined, 'PATCH');
    await load();
  }

  return (
    <I18nLayout>
      <div className="max-w-4xl mx-auto space-y-4">
        <h2 className="text-xl font-bold">{t('admin.title')}</h2>
        <nav className="flex gap-2">
          {(['sellers', 'products', 'orders', 'payments', 'audit', 'reports'] as const).map((item) => (
            <button
              key={item}
              className={tab === item ? 'font-bold underline' : ''}
              onClick={() => setTab(item)}
            >
              {t(`admin.${item}`)}
            </button>
          ))}
        </nav>
        {error && <p role="alert">{t(error)}</p>}
        {tab === 'sellers' && sellers?.map((seller) => (
          <article key={seller.id} className="border bg-white rounded p-4 space-y-2">
            <h3 className="font-bold">{seller.name}</h3>
            <p>{seller.owner.email}</p>
            <p>{seller.status}</p>
            <div className="flex gap-2">
              <button onClick={() => void sellerAction(seller.id, 'APPROVED')}>{t('admin.approve')}</button>
              <button onClick={() => void sellerAction(seller.id, 'REJECTED')}>{t('admin.reject')}</button>
              <button onClick={() => void sellerAction(seller.id, 'SUSPENDED')}>{t('admin.suspend')}</button>
            </div>
          </article>
        ))}
        {tab === 'products' && products?.map((product) => (
          <article key={product.id} className="border bg-white rounded p-4 space-y-2">
            <h3 className="font-bold">{product.name}</h3>
            <p>{product.storeName}</p>
            <p>{product.status}</p>
            <div className="flex gap-2">
              <button onClick={() => void productAction(product.id, 'ACTIVE')}>{t('admin.activate')}</button>
              <button onClick={() => void productAction(product.id, 'ARCHIVED')}>{t('admin.moderation')}</button>
            </div>
          </article>
        ))}
        {tab === 'orders' && orders?.map((order) => (
          <article key={order.id} className="border bg-white rounded p-4">
            <h3 className="font-bold">{order.orderNumber}</h3>
            <p>{order.status} — {order.total}</p>
          </article>
        ))}
        {tab === 'payments' && payments?.map((payment) => (
          <article key={payment.orderId} className="border bg-white rounded p-4">
            <h3 className="font-bold">{payment.orderNumber}</h3>
            <p>{payment.status} — {payment.total}</p>
          </article>
        ))}
        {tab === 'audit' && audit?.map((entry) => (
          <article key={entry.id} className="border bg-white rounded p-4">
            <h3 className="font-bold">{entry.action}</h3>
            <p>{entry.entityType} {entry.entityId}</p>
            <p>{entry.actor?.email ?? 'system'} — {entry.createdAt}</p>
          </article>
        ))}
        {tab === 'reports' && report && (
          <article className="border bg-white rounded p-4 space-y-2">
            <p>Sellers: {report.totalSellers}</p>
            <p>Products: {report.totalProducts}</p>
            <p>Orders: {report.totalOrders}</p>
            <p>Revenue: {report.totalRevenue}</p>
          </article>
        )}
      </div>
    </I18nLayout>
  );
}
