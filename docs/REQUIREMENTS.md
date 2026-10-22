# Product Requirements

## 1. Authentication
- Register and log in using email or phone number.
- Role-based access: buyer, seller, admin.
- Users can manage their profiles and addresses.

## 2. Buyer Features
- Browse products and categories.
- Search and filter products.
- View product details, images, price, stock, and seller information.
- Add products to cart.
- Checkout with delivery address and contact number.
- Select an available payment method.
- View order history and order details.
- Track order status and cancel eligible orders.

## 3. Seller Features
- Register as a seller and submit store information.
- Admin approval before selling.
- Manage store name, logo, description, and contact information.
- Create, edit, publish, and archive products.
- Upload product images and manage stock.
- View and manage orders containing their products.
- Update order status.
- Configure supported payment instructions.
- View basic sales and order summaries.

## 4. Admin Features
- Manage users and seller applications.
- Approve, suspend, or reject sellers.
- Manage product categories.
- Review and moderate product listings.
- View and manage marketplace orders.
- Review payment reports and resolve disputes.
- Configure marketplace settings.

## 5. Order Status
- Pending Payment
- Payment Submitted
- Confirmed
- Processing
- Shipped
- Delivered
- Cancelled
- Refunded

Only allow valid status transitions. Refunds are recorded manually in the MVP.

## 6. Payment
- Support cash on delivery where available.
- Support manual KBZPay, WavePay, and bank-transfer payments.
- Display seller or marketplace payment instructions.
- Allow buyers to submit transaction references and payment receipt images.
- Require payment verification before processing prepaid orders.
- Never store wallet PINs or payment credentials.

Payment provider APIs are not required for the MVP.

## 7. Acceptance Criteria
- Only approved sellers can publish products.
- Buyers cannot purchase unavailable or insufficient stock.
- Prices are validated on the server, never trusted from the client.
- Orders preserve product prices at purchase time.
- Sellers can access only their own products and order items.
- Buyers can access only their own orders.
- Admin operations require admin authorization.
- All important order and payment status changes are recorded.
