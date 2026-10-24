import { useI18n } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';

export function CartPage() {
  const { t } = useI18n();
  return (
    <I18nLayout>
      <div className="py-12 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('layout.nav.cart')}</h1>
        <div className="border rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-2">Cart is empty</h3>
          <p className="text-neutral-600">{t('cart.noItems')}</p>
        </div>
        <div className="mt-8">
          <h3 className="font-semibold mb-2">{t('layout.nav.checkout')}</h3>
          <p className="text-neutral-600">Coming soon</p>
        </div>
      </div>
    </I18nLayout>
  );
}