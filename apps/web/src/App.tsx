import { useEffect, useState } from 'react';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { SellerProductsPage } from './pages/SellerProductsPage';
import { StorefrontPage } from './pages/StorefrontPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrdersPage } from './pages/OrdersPage';
import { PaymentReviewPage } from './pages/PaymentReviewPage';
import { AdminPage } from './pages/AdminPage';
import { SellerOrdersPage } from './pages/SellerOrdersPage';

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
  const [sellerOrders, setSellerOrders] = useState(window.location.hash === '#/seller/orders');
  const [cart, setCart] = useState(window.location.hash === '#/cart');
  const [checkout, setCheckout] = useState(window.location.hash === '#/checkout');
  const [orders, setOrders] = useState(window.location.hash === '#/orders');
  const [orderId, setOrderId] = useState(() => getHashSegment('orders'));
  const [paymentRole, setPaymentRole] = useState(() => getHashSegment('payments'));
const [admin, setAdmin] = useState(window.location.hash === '#/admin');

  useEffect(() => {
    const onHashChange = () => {
      setDetailId(getHashSegment('products'));
      setStoreSlug(getHashSegment('stores'));
      setSeller(window.location.hash === '#/seller/products');
      setSellerOrders(window.location.hash === '#/seller/orders');
      setCart(window.location.hash === '#/cart');
      setCheckout(window.location.hash === '#/checkout');
      setOrders(window.location.hash === '#/orders');
      setOrderId(getHashSegment('orders'));
      setPaymentRole(getHashSegment('payments'));
      setAdmin(window.location.hash === '#/admin');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (paymentRole === 'admin' || paymentRole === 'seller')
    return <PaymentReviewPage role={paymentRole} />;
  if (orderId) return <OrdersPage key={orderId} id={orderId} />;
  if (sellerOrders) return <SellerOrdersPage />;
  if (orders) return <OrdersPage />;
  if (checkout) return <CheckoutPage />;
  if (cart) return <CartPage />;
  if (seller) return <SellerProductsPage />;
  if (storeSlug) return <StorefrontPage key={storeSlug} slug={storeSlug} />;
  if (detailId) {
    return <ProductDetailPage key={detailId} id={detailId} />;
  }
  if (admin) return <AdminPage />;
  return <CatalogPage />;
}
