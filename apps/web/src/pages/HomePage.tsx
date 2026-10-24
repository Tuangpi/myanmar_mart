import { useI18n } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';

export function HomePage() {
  const { t } = useI18n();
  return (
    <I18nLayout>
      <div className="max-w-2xl mx-auto py-12 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">{t('app.name')}</h1>
        <p className="text-lg text-neutral-600 mb-8">{t('app.tagline')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mx-auto">
          <div>
            <h3 className="font-semibold">{t('layout.nav.catalog')}</h3>
            <p className="text-neutral-600">{t('layout.nav.home')}</p>
          </div>
          <div>
            <h3 className="font-semibold">{t('layout.nav.cart')}</h3>
            <p className="text-neutral-600">Coming soon</p>
          </div>
        </div>
      </div>
    </I18nLayout>
  );
}