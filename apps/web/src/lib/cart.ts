import type { ApiResponse, CartResponse } from '@myanmart/shared';

export class CartRequestError extends Error {
  constructor(readonly status: number) {
    super('Cart request failed');
  }
}

export async function requestCart(
  path = '/api/cart',
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<CartResponse> {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal,
  });
  const json = (await response.json()) as ApiResponse<CartResponse>;
  if (!response.ok || !json.success) throw new CartRequestError(response.status);
  return json.data;
}

export function cartErrorKey(error: unknown): string {
  if (error instanceof CartRequestError) {
    if (error.status === 401) return 'cart.signInRequired';
    if (error.status === 409) return 'cart.stockChanged';
  }
  return 'cart.updateFailed';
}
