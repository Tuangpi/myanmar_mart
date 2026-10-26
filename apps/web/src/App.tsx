import { useEffect, useState } from 'react';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { SellerProductsPage } from './pages/SellerProductsPage';
import { StorefrontPage } from './pages/StorefrontPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrdersPage } from './pages/OrdersPage';

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
  const [checkout, setCheckout] = useState(window.location.hash === '#/checkout');
  const [orders, setOrders] = useState(window.location.hash === '#/orders');
  const [orderId, setOrderId] = useState(() => getHashSegment('orders'));

  useEffect(() => {
    const onHashChange = () => {
      setDetailId(getHashSegment('products'));
      setStoreSlug(getHashSegment('stores'));
      setSeller(window.location.hash === '#/seller/products');
      setCart(window.location.hash === '#/cart');
      setCheckout(window.location.hash === '#/checkout');
      setOrders(window.location.hash === '#/orders');
      setOrderId(getHashSegment('orders'));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (orderId) return <OrdersPage key={orderId} id={orderId} />;
  if (orders) return <OrdersPage />;
  if (checkout) return <CheckoutPage />;
  if (cart) return <CartPage />;
  if (seller) return <SellerProductsPage />;
  if (storeSlug) return <StorefrontPage key={storeSlug} slug={storeSlug} />;
  if (detailId) {
    return <ProductDetailPage key={detailId} id={detailId} />;
  }
  return <CatalogPage />;
}
