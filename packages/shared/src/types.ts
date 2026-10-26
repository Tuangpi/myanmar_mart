import type { UserRole, ProductStatus, StoreStatus, OrderStatus, PaymentMethod } from './constants.js';
import type { DeliveryAddress } from './schemas.js';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface CartItemResponse {
  id: string;
  productId: string;
  name: string;
  slug: string;
  thumbnailUrl: string | null;
  storeName: string;
  storeSlug: string;
  quantity: number;
  stock: number;
  available: boolean;
  unitPrice: number;
  subtotal: number;
}

export interface CartResponse {
  items: CartItemResponse[];
  itemCount: number;
  subtotal: number;
}

export interface CheckoutQuote {
  cart: CartResponse;
  deliveryFee: number;
  total: number;
}

export interface OrderItemResponse {
  id: string;
  productId: string | null;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  address: DeliveryAddress;
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  status: OrderStatus;
  createdAt: string;
  sellerGroups: {
    storeId: string;
    storeName: string;
    storeSlug: string;
    subtotal: number;
    items: OrderItemResponse[];
  }[];
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: string;
  storeId?: string | null;
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

// --- Catalog public API types (T005) ---

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
}

export interface ProductImageResponse {
  id: string;
  imageUrl: string;
  sortOrder: number;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  price: number;
  stock: number;
  thumbnailUrl: string | null;
  storeName: string;
  storeSlug: string;
  categoryName: string | null;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  status: ProductStatus;
  store: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    status: StoreStatus;
  };
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  images: ProductImageResponse[];
}

export interface StoreProductSummary {
  id: string;
  slug: string;
  name: string;
  price: number;
  stock: number;
  thumbnailUrl: string | null;
  categoryName: string | null;
}

export interface StoreResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  status: StoreStatus;
  products: StoreProductSummary[];
}
