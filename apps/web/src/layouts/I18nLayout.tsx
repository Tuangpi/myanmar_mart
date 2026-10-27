import { I18nProvider, useI18n } from '@myanmart/shared';

export function I18nLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <I18nLayoutInner>{children}</I18nLayoutInner>
    </I18nProvider>
  );
}

function I18nLayoutInner({ children }: { children: React.ReactNode }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <main className="min-h-dvh bg-gray-50">
      <header className="flex flex-col sm:flex-row items-center gap-4 px-4 py-3 border-b border-neutral-200 bg-white">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t('app.name')}</h1>
        <nav className="flex flex-wrap gap-4">
          <a href="#/">{t('sellerProducts.catalog')}</a>
          <a href="#/cart">{t('cart.title')}</a>
          <a href="#/orders">{t('ordersPage.title')}</a>
          <a href="#/seller/products">{t('sellerProducts.title')}</a>
          <a href="#/seller/orders">{t('fulfillment.title')}</a>
        </nav>
        <a href="#/payments/seller">{t('payment.sellerReview')}</a>
        <a href="#/payments/admin">{t('payment.adminReview')}</a>
          <a href="#/admin">{t('admin.dashboard')}</a>
        <div className="flex gap-2">
          <button
            onClick={() => setLocale('en')}
            className={
              locale === 'en'
                ? 'bg-primary text-white px-3 py-1 rounded text-sm'
                : 'px-3 py-1 rounded text-neutral-700 text-sm'
            }
          >
            EN
          </button>
          <button
            onClick={() => setLocale('my')}
            className={
              locale === 'my'
                ? 'bg-primary text-white px-3 py-1 rounded text-sm'
                : 'px-3 py-1 rounded text-neutral-700 text-sm'
            }
          >
            MY
          </button>
        </div>
      </header>

      <section className="p-4 sm:p-8">{children}</section>

      <footer className="px-4 py-3 border-t border-neutral-200 text-center text-sm text-neutral-500">
        {t('app.tagline')}
      </footer>
    </main>
  );
}
