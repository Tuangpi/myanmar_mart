import { useI18n } from '@myanmart/shared';
import { I18nLayout } from '../layouts/I18nLayout';

export function CatalogPage() {
  const { t } = useI18n();
  return (
    <I18nLayout>
      <div className="py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">{t('layout.nav.catalog')}</h1>
        <p className="text-neutral-600 mb-8">{t('app.tagline')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="border rounded-lg p-4 hover:border-primary transition-border">
            <h3 className="font-semibold mb-2">Product 1</h3>
            <p className="text-neutral-600">Price: --</p>
            <p className="text-neutral-500">Status: --</p>
          </div>
          <div className="border rounded-lg p-4 hover:border-primary transition-border">
            <h3 className="font-semibold mb-2">Product 2</h3>
            <p className="text-neutral-600">Price: --</p>
            <p className="text-neutral-500">Status: --</p>
          </div>
          <div className="border rounded-lg p-4 hover:border-primary transition-border">
            <h3 className="font-semibold mb-2">Product 3</h3>
            <p className="text-neutral-600">Price: --</p>
            <p className="text-neutral-500">Status: --</p>
          </div>
        </div>
      </div>
    </I18nLayout>
  );
}