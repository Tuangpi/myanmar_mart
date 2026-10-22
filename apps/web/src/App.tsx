import { CURRENCY } from '@myanmart/shared';

export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">MyanMart</h1>
        <p className="text-base text-neutral-600">A Myanmar-first multi-vendor marketplace.</p>
      </header>

      <section className="rounded-lg border border-neutral-200 p-6">
        <h2 className="text-lg font-semibold">Scaffold ready</h2>
        <p className="mt-2 text-sm text-neutral-600">
          The web app, API, and shared package are wired up. Feature work starts with the catalog
          (T005) and the application shell (T004).
        </p>
        <p className="mt-4 text-sm text-neutral-500">Currency: {CURRENCY}</p>
      </section>
    </main>
  );
}
