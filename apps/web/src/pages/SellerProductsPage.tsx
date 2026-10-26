import { useEffect, useState, type FormEvent } from 'react';
import {
  useI18n,
  type CategoryResponse,
  type Paginated,
  type ProductStatus,
} from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';

interface SellerProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  stock: number;
  status: ProductStatus;
  categoryId: string | null;
  images: { id: string; imageUrl: string }[];
}
const empty = { name: '', slug: '', description: '', price: '', stock: '0', categoryId: '' };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(String(res.status));
  return body.data as T;
}

function SellerProductsContent() {
  const { t } = useI18n();
  const text = (key: string) => t(`sellerProducts.${key}`);
  const [items, setItems] = useState<SellerProduct[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      api<Paginated<SellerProduct>>(`/api/seller/products?page=${page}&pageSize=12`),
      api<CategoryResponse[]>('/api/categories'),
      api<{ status: string }[]>('/api/seller/store'),
    ])
      .then(([products, cats, stores]) => {
        if (cancelled) return;
        setItems(products.items);
        setPages(products.totalPages);
        setCategories(cats);
        setStatus(stores[0]?.status ?? '');
      })
      .catch((err: Error) => {
        if (!cancelled)
          setError(
            err.message === '401' ? 'signIn' : err.message === '403' ? 'forbidden' : 'failed',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, revision]);

  function reset() {
    setEditing(null);
    setForm(empty);
    setFile(null);
    setFileKey((n) => n + 1);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setRevision((n) => n + 1);
    } catch {
      setError('saveFailed');
    } finally {
      setBusy(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const product = await api<SellerProduct>(
        editing ? `/api/seller/products/${editing}` : '/api/seller/products',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            slug: form.slug || undefined,
            price: Number(form.price),
            stock: Number(form.stock),
            categoryId: form.categoryId || null,
          }),
        },
      );
      // Retain the saved ID if upload fails, so retry cannot create a duplicate product.
      setEditing(product.id);
      if (file) {
        const data = new FormData();
        data.append('image', file);
        await api(`/api/seller/products/${product.id}/images`, { method: 'POST', body: data });
      }
      reset();
    });
  }
  const changeStatus = (product: SellerProduct, next: ProductStatus) =>
    void run(async () => {
      await api(`/api/seller/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
    });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h2 className="text-2xl font-bold">{text('title')}</h2>
      {error && (
        <p role="alert" className="text-red-700">
          {text(error)}
        </p>
      )}
      {loading ? (
        <p role="status">{text('loading')}</p>
      ) : (
        <>
          <p>
            {text('storeStatus')}: {text(status || 'noStore')}
          </p>
          {status !== 'APPROVED' && <p>{text('approvalRequired')}</p>}
          <form onSubmit={save} className="rounded border bg-white p-4">
            <h3 className="mb-3 text-lg font-semibold">{text(editing ? 'edit' : 'create')}</h3>
            <fieldset disabled={busy || !status} className="grid gap-4 sm:grid-cols-2">
              {(['name', 'slug', 'price', 'stock'] as const).map((key) => (
                <label key={key} className="grid gap-1">
                  {text(key)}
                  <input
                    className="rounded border p-2"
                    value={form[key]}
                    required={key !== 'slug'}
                    type={key === 'price' || key === 'stock' ? 'number' : 'text'}
                    min={key === 'price' ? 1 : 0}
                    max={key === 'price' || key === 'stock' ? 2147483647 : undefined}
                    minLength={key === 'name' ? 2 : undefined}
                    maxLength={key === 'name' ? 200 : key === 'slug' ? 60 : undefined}
                    pattern={key === 'slug' ? '[a-z0-9]+(-[a-z0-9]+)*' : undefined}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="grid gap-1">
                {text('description')}
                <textarea
                  className="rounded border p-2"
                  maxLength={5000}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label className="grid gap-1">
                {text('category')}
                <select
                  className="rounded border p-2"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                >
                  <option value="">{text('noCategory')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {text('image')}
                <input
                  key={fileKey}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <div className="flex gap-4">
                <button type="submit" className="rounded border px-4 py-2">
                  {text('save')}
                </button>
                <button type="button" onClick={reset}>
                  {text('cancel')}
                </button>
              </div>
            </fieldset>
          </form>
          {!items.length && <p>{text('empty')}</p>}
          <ul className="grid gap-4 sm:grid-cols-2">
            {items.map((product) => (
              <li key={product.id} className="space-y-2 rounded border bg-white p-4">
                <h3 className="font-semibold">{product.name}</h3>
                <p>
                  {product.price.toLocaleString()} MMK · {text('stock')}: {product.stock}
                </p>
                <p>
                  {text(product.status)} · {text('imageCount')}: {product.images.length}
                </p>
                <div className="flex flex-wrap gap-4">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditing(product.id);
                      setForm({
                        name: product.name,
                        slug: product.slug,
                        description: product.description ?? '',
                        price: String(product.price),
                        stock: String(product.stock),
                        categoryId: product.categoryId ?? '',
                      });
                      setFile(null);
                      setFileKey((n) => n + 1);
                    }}
                  >
                    {text('edit')}
                  </button>
                  <button
                    disabled={busy || status !== 'APPROVED' || product.status === 'ACTIVE'}
                    onClick={() => changeStatus(product, 'ACTIVE')}
                  >
                    {text('publish')}
                  </button>
                  <button
                    disabled={busy || product.status === 'ARCHIVED'}
                    onClick={() => changeStatus(product, 'ARCHIVED')}
                  >
                    {text('archive')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <nav aria-label={text('pagination')} className="flex gap-4">
            <button disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>
              {text('previous')}
            </button>
            <span>
              {page} / {Math.max(1, pages)}
            </span>
            <button disabled={busy || page >= pages} onClick={() => setPage(page + 1)}>
              {text('next')}
            </button>
          </nav>
        </>
      )}
    </div>
  );
}

export function SellerProductsPage() {
  return (
    <I18nLayout>
      <SellerProductsContent />
    </I18nLayout>
  );
}
