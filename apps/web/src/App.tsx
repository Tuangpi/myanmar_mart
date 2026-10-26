import { useEffect, useState } from 'react';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { SellerProductsPage } from './pages/SellerProductsPage';

function getDetailIdFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(/^#\/products\/(.+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function App() {
  const [detailId, setDetailId] = useState<string | null>(getDetailIdFromHash());
  const [seller, setSeller] = useState(window.location.hash === '#/seller/products');

  useEffect(() => {
    const onHashChange = () => {
      setDetailId(getDetailIdFromHash());
      setSeller(window.location.hash === '#/seller/products');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (seller) return <SellerProductsPage />;
  if (detailId) {
    return <ProductDetailPage id={detailId} />;
  }
  return <CatalogPage />;
}
