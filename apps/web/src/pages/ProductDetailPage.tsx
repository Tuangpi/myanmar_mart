import { useI18n } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';

export function ProductDetailPage() {
  const { t } = useI18n();
  return (
    <I18nLayout>
      <div className="py-12 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('app.name')}</h1>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <h3 className="font-semibold">{t('layout.nav.product')}</h3>
            <p className="text-neutral-600">--</p>
          </div>
          <div>
            <h3 className="font-semibold">{t('layout.nav.price')}</h3>
            <p className="text-neutral-600">--</p>
          </div>
        </div>
        <div className="mt-8">
          <h3 className="font-semibold mb-2">{t('layout.nav.description')}</h3>
          <p className="text-neutral-600">--</p>
        </div>
        <div className="mt-6">
          <h3 className="font-semibold mb-2">{t('layout.nav.seller')}</h3>
          <p className="text-neutral-600">--</p>
        </div>
      </div>
    </I18nLayout>
  );
}