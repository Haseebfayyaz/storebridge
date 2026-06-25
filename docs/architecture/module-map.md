# Module Map

This map shows how Shopbridge should be organized as a modular monolith while staying ready for future microservice extraction.

## Current Apps

- `apps/api`: public commerce API for shoppers.
- `apps/store-api`: merchant and store-ops API for store staff, POS, catalog, inventory, and store-level admin.
- `apps/admin-api`: platform admin API for internal platform operations.
- `gocart/apps/public`: customer storefront.
- `gocart/apps/store-admin`: merchant/store dashboard.
- `gocart/apps/admin`: platform admin console.

## Target Ownership

### 1. Identity and Access

Owns:

- Signup, login, JWT issuance, refresh tokens
- Tenant identity
- Role assignment
- Permission evaluation
- Session revocation

Best fit:

- `libs/auth`
- `libs/common`
- `libs/models`

Events:

- `UserRegistered`
- `UserRoleAssigned`
- `UserRoleChanged`
- `UserBlocked`
- `UserDeleted`
- `TokenRevoked`

### 2. Tenant and Store Management

Owns:

- Tenant creation
- Store creation and lifecycle
- Store settings
- Store ownership and staff mapping

Best fit:

- `apps/admin-api`
- `apps/store-api`

Events:

- `TenantCreated`
- `StoreCreated`
- `StoreUpdated`
- `StoreDeleted`
- `StoreStatusChanged`

### 3. Catalog

Owns:

- Categories
- Products
- Variants
- Media
- Attributes
- Visibility

Best fit:

- `apps/store-api`

Events:

- `CategoryCreated`
- `CategoryUpdated`
- `CategoryDeleted`
- `ProductCreated`
- `ProductUpdated`
- `ProductDeleted`
- `VariantCreated`
- `VariantUpdated`
- `VariantDeleted`

### 4. Pricing and Tax

Owns:

- Base price
- Store-specific price
- Wholesale price books
- Tax classes
- Price overrides

Best fit:

- `apps/store-api`

Events:

- `TaxClassCreated`
- `TaxClassUpdated`
- `TaxClassDeleted`
- `PriceChanged`
- `PriceBookAssigned`

### 5. Inventory

Owns:

- Stock on hand
- Reserved stock
- Stock movements
- Stock adjustments
- Transfers between stores and warehouses
- Safety stock

Best fit:

- `apps/store-api` today
- future `inventory-service`

Events:

- `InventoryCreated`
- `InventoryAdjusted`
- `InventoryReserved`
- `InventoryReservationFailed`
- `InventoryReleased`
- `InventoryCaptured`
- `InventoryTransferred`
- `InventoryCounted`

### 6. Cart and Checkout

Owns:

- Cart lifecycle
- Checkout quote
- Address validation
- Reservation request
- Order draft creation

Best fit:

- `apps/api`

Events:

- `CartCreated`
- `CartItemAdded`
- `CartItemUpdated`
- `CartItemRemoved`
- `CheckoutStarted`
- `CheckoutValidated`
- `CheckoutFailed`

### 7. Order Management

Owns:

- Order creation
- Status transitions
- Cancelation
- Returns
- Refund coordination
- Order history

Best fit:

- `apps/api`
- future `order-service`

Events:

- `OrderPlaced`
- `OrderConfirmed`
- `OrderRejected`
- `OrderCancelled`
- `OrderPacked`
- `OrderShipped`
- `OrderDelivered`
- `OrderReturned`
- `OrderRefunded`

### 8. Payments

Owns:

- Payment intent
- Capture
- Refund
- Partial payment
- Credit terms
- Reconciliation

Best fit:

- future `payment-service`

Events:

- `PaymentRequested`
- `PaymentAuthorized`
- `PaymentCaptured`
- `PaymentFailed`
- `PaymentRefunded`
- `PaymentReversed`

### 9. Customer and CRM

Owns:

- Customer profile
- Address book
- Buyer segmentation
- Loyalty
- Notes
- Communication preferences

Best fit:

- `apps/api`
- `apps/store-api`

Events:

- `CustomerCreated`
- `CustomerUpdated`
- `CustomerMerged`
- `CustomerSegmentChanged`
- `CustomerAddressAdded`
- `CustomerAddressUpdated`

### 10. POS and In-Store Sales

Owns:

- Counter sale
- Cashier flow
- Barcodes / quick scan
- Cash/card split payment
- Receipt generation
- Store credit
- Returns at store front

Best fit:

- future module inside `apps/store-api`

Events:

- `PosSaleStarted`
- `PosItemScanned`
- `PosSaleCompleted`
- `PosSaleVoided`
- `ReceiptPrinted`

### 11. Fulfillment and Delivery

Owns:

- Picking
- Packing
- Delivery assignment
- Rider tracking
- Status updates

Best fit:

- future `fulfillment-service`

Events:

- `FulfillmentCreated`
- `FulfillmentPicked`
- `FulfillmentPacked`
- `DeliveryAssigned`
- `DeliveryPickedUp`
- `DeliveryCompleted`

### 12. Search and Analytics

Owns:

- Search index
- Reporting read models
- Sales aggregates
- Inventory dashboards
- Customer dashboards

Best fit:

- `apps/store-api` with async projections
- future dedicated read services

Events:

- consumes almost every domain event

## Suggested Boundaries

### Synchronous

Keep these synchronous inside the monolith:

- command validation
- transactional writes inside one bounded context
- simple read queries for the current request

### Asynchronous

Move these to events first:

- notifications
- search indexing
- analytics
- audit trail
- customer segmentation
- reports
- loyalty points

## Data Ownership Rule

Each bounded context should own:

- its write model
- its business rules
- its events

Other modules should consume:

- service interfaces
- published events
- read-only projections

Avoid:

- direct cross-module table access
- deep joins from unrelated domains
- embedding orchestration logic in controllers

## Good Extraction Candidates

If you later split services, the first candidates should be:

- inventory
- payments
- notifications
- search/indexing
- analytics

These have clear event boundaries and can be made eventually consistent without hurting user experience.
