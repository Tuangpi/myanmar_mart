import { useEffect, useState } from 'react';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { SellerProductsPage } from './pages/SellerProductsPage';
import { StorefrontPage } from './pages/StorefrontPage';
import { CartPage } from './pages/CartPage';

function getHashSegment(resource: string): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(new RegExp(`^#/${resource}/([^/?#]+)$`));
  try {
    return match ? decodeURIComponent(match[1]!) : null;
  } catch {
    return null;
  }
}

export function App() {
  const [detailId, setDetailId] = useState<string | null>(() => getHashSegment('products'));
  const [storeSlug, setStoreSlug] = useState<string | null>(() => getHashSegment('stores'));
  const [seller, setSeller] = useState(window.location.hash === '#/seller/products');
  const [cart, setCart] = useState(window.location.hash === '#/cart');

  useEffect(() => {
    const onHashChange = () => {
      setDetailId(getHashSegment('products'));
      setStoreSlug(getHashSegment('stores'));
      setSeller(window.location.hash === '#/seller/products');
      setCart(window.location.hash === '#/cart');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (cart) return <CartPage />;
  if (seller) return <SellerProductsPage />;
  if (storeSlug) return <StorefrontPage key={storeSlug} slug={storeSlug} />;
  if (detailId) {
    return <ProductDetailPage key={detailId} id={detailId} />;
  }
  return <CatalogPage />;
}
