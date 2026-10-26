import { useEffect, useState } from 'react';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';

function getDetailIdFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(/^#\/products\/(.+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function App() {
  const [detailId, setDetailId] = useState<string | null>(getDetailIdFromHash());

  useEffect(() => {
    const onHashChange = () => setDetailId(getDetailIdFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (detailId) {
    return <ProductDetailPage id={detailId} />;
  }
  return <CatalogPage />;
}
