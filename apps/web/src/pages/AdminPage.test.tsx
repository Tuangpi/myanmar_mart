import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@myanmart/shared';
import { AdminPage } from './AdminPage';

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = '';
});

describe('admin dashboard UI', () => {
  it('loads sellers and switches to audit and reports tabs', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/admin/audit')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              items: [
                {
                  id: 'audit-1',
                  actor: { id: 'admin-1', name: 'Admin', email: 'admin@test.local' },
                  action: 'SELLER_STATUS_UPDATED',
                  entityType: 'Store',
                  entityId: 'store-1',
                  createdAt: '2026-10-27T00:00:00Z',
                },
              ],
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
            },
          }),
        };
      }
      if (url.includes('/api/admin/reports')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              totalSellers: 2,
              totalProducts: 3,
              totalOrders: 4,
              totalRevenue: 5000,
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            {
              id: 'seller-1',
              name: 'Test Store',
              slug: 'test-store',
              status: 'PENDING',
              owner: { id: 'owner-1', name: 'Owner', email: 'owner@test.local' },
            },
          ],
        }),
      };
    });

    render(
      <I18nProvider>
        <AdminPage />
      </I18nProvider>,
    );
    expect(await screen.findByText('Test Store')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Audit' }));
    expect(await screen.findByText('SELLER_STATUS_UPDATED')).toBeInTheDocument();
    expect(screen.getByText(/store-1/)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Reports' }));
    await waitFor(() => expect(screen.getByText('Sellers: 2')).toBeInTheDocument());
    expect(screen.getByText('Revenue: 5000')).toBeInTheDocument();
  });

  it('shows a forbidden error when admin data cannot be loaded', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ success: false, error: { message: 'Forbidden' } }),
    });
    render(
      <I18nProvider>
        <AdminPage />
      </I18nProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign in with the required admin or seller role.',
    );
  });
});
