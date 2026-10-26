import type { ApiResponse } from '@myanmart/shared';

export class OrderRequestError extends Error {
  constructor(readonly status: number) {
    super('Order request failed');
  }
}

export async function requestOrder<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    signal,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.success) throw new OrderRequestError(response.status);
  return json.data;
}

export function checkoutErrorKey(error: unknown): string {
  if (error instanceof OrderRequestError) {
    if (error.status === 401) return 'cart.signInRequired';
    if (error.status === 409) return 'checkoutPage.cartChanged';
    if (error.status === 422) return 'checkoutPage.invalid';
  }
  return 'checkoutPage.failed';
}
