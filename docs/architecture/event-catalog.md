# Event Catalog

This is the canonical event catalog for Shopbridge. It is designed for a monolith first, with an outbox and event dispatcher so the same events can later be published to a message broker.

## Event Shape

Recommended common fields:

- `eventId`
- `eventType`
- `occurredAt`
- `tenantId`
- `storeId`
- `actorId`
- `aggregateId`
- `aggregateType`
- `correlationId`
- `causationId`
- `version`
- `payload`

## Publishing Rules

- Emit events only after the write model succeeds.
- Use the outbox pattern inside the same database transaction.
- Make consumers idempotent.
- Never rely on events for immediate request validation.
- Treat events as facts, not commands.

## Identity and Access

### `UserRegistered`

- Producer: auth
- Consumers: audit, CRM, notifications, analytics
- Payload: user profile, tenant context, signup channel

### `UserRoleAssigned`

- Producer: store-api, admin-api
- Consumers: auth projection, audit, admin UI, store UI
- Payload: userId, roleId, tenantId, storeId, assignedBy

### `UserRoleChanged`

- Producer: store-api, admin-api
- Consumers: auth projection, permissions cache, audit
- Payload: oldRoleId, newRoleId, userId, tenantId, storeId

### `UserBlocked`

- Producer: admin-api, store-api
- Consumers: auth, notification, audit
- Payload: userId, reason, blockedBy

### `UserDeleted`

- Producer: admin-api, store-api
- Consumers: auth, CRM, analytics, audit
- Payload: userId, softDeleteFlag, deletedBy

## Tenant and Store

### `TenantCreated`

- Producer: auth or admin-api
- Consumers: store-api, admin-api, analytics
- Payload: tenant metadata, ownerId, plan

### `StoreCreated`

- Producer: auth, store-api, admin-api
- Consumers: catalog, inventory, POS, reporting
- Payload: store profile, tenantId, timezone, channel support

### `StoreUpdated`

- Producer: store-api, admin-api
- Consumers: read models, caches, reporting
- Payload: changed fields

### `StoreDeleted`

- Producer: store-api, admin-api
- Consumers: search, inventory, reporting
- Payload: storeId, deletedBy

## Catalog

### `CategoryCreated`

- Producer: store-api
- Consumers: search, public catalog, admin UI

### `CategoryUpdated`

- Producer: store-api
- Consumers: search, public catalog, admin UI

### `CategoryDeleted`

- Producer: store-api
- Consumers: search, public catalog, admin UI

### `ProductCreated`

- Producer: store-api
- Consumers: search, public catalog, analytics

### `ProductUpdated`

- Producer: store-api
- Consumers: search, public catalog, analytics

### `ProductDeleted`

- Producer: store-api
- Consumers: search, public catalog, analytics

### `VariantCreated`

- Producer: store-api
- Consumers: inventory, search, POS, catalog

### `VariantUpdated`

- Producer: store-api
- Consumers: inventory, search, POS, catalog

### `VariantDeleted`

- Producer: store-api
- Consumers: inventory, search, POS, catalog

## Pricing and Tax

### `TaxClassCreated`

- Producer: store-api
- Consumers: pricing, tax calculation, analytics

### `TaxClassUpdated`

- Producer: store-api
- Consumers: pricing, tax calculation, analytics

### `TaxClassDeleted`

- Producer: store-api
- Consumers: pricing, tax calculation, analytics

### `PriceChanged`

- Producer: store-api
- Consumers: cart, checkout, search, analytics, POS
- Payload: oldPrice, newPrice, storeId, variantId, effectiveFrom

### `PriceBookAssigned`

- Producer: store-api
- Consumers: POS, wholesale pricing, catalog, cart

## Inventory

### `InventoryCreated`

- Producer: store-api
- Consumers: search, catalog, reporting
- Payload: inventoryId, storeId, variantId, stockQty

### `InventoryAdjusted`

- Producer: store-api, POS, warehouse tools
- Consumers: search, reporting, audit
- Payload: delta, reason, adjustedBy, referenceType, referenceId

### `InventoryReserved`

- Producer: store-api, cart, checkout
- Consumers: order, reporting, audit
- Payload: inventoryId, quantity, reservationId, expiresAt

### `InventoryReservationFailed`

- Producer: store-api, cart, checkout
- Consumers: UI, audit, analytics
- Payload: inventoryId, quantity, reason

### `InventoryReleased`

- Producer: store-api, checkout, cancelation flow
- Consumers: order, reporting, audit
- Payload: inventoryId, quantity, reservationId

### `InventoryCaptured`

- Producer: checkout / POS finalization
- Consumers: order, accounting, analytics
- Payload: inventoryId, quantity, orderId, saleId

### `InventoryTransferred`

- Producer: warehouse/store operations
- Consumers: reporting, fulfillment, audit
- Payload: fromLocationId, toLocationId, items

### `InventoryCounted`

- Producer: stocktake / reconciliation
- Consumers: reporting, anomaly detection, audit

## Cart and Checkout

### `CartCreated`

- Producer: api
- Consumers: analytics, personalization

### `CartItemAdded`

- Producer: api
- Consumers: analytics, recommendation engine

### `CartItemUpdated`

- Producer: api
- Consumers: analytics

### `CartItemRemoved`

- Producer: api
- Consumers: analytics

### `CheckoutStarted`

- Producer: api
- Consumers: inventory, payments, analytics

### `CheckoutValidated`

- Producer: api
- Consumers: payments, order

### `CheckoutFailed`

- Producer: api
- Consumers: analytics, UX diagnostics

## Orders

### `OrderPlaced`

- Producer: api, POS
- Consumers: payments, inventory, fulfillment, notifications, analytics
- Payload: orderId, customerId, storeId, channel, totals, items

### `OrderConfirmed`

- Producer: order workflow
- Consumers: fulfillment, notifications, reporting

### `OrderRejected`

- Producer: order workflow
- Consumers: cart, UI, audit

### `OrderCancelled`

- Producer: api, POS, admin
- Consumers: inventory, payments, notifications, reporting

### `OrderPacked`

- Producer: fulfillment
- Consumers: delivery, notifications, analytics

### `OrderShipped`

- Producer: fulfillment
- Consumers: customer notifications, tracking, analytics

### `OrderDelivered`

- Producer: delivery
- Consumers: loyalty, feedback, analytics

### `OrderReturned`

- Producer: returns flow
- Consumers: inventory, refunds, analytics

### `OrderRefunded`

- Producer: payments
- Consumers: accounting, notifications, analytics

## Payments

### `PaymentRequested`

- Producer: checkout, POS
- Consumers: payment gateway integration

### `PaymentAuthorized`

- Producer: payment service
- Consumers: order, fulfillment

### `PaymentCaptured`

- Producer: payment service
- Consumers: order, inventory, accounting

### `PaymentFailed`

- Producer: payment service
- Consumers: checkout, UI, audit

### `PaymentRefunded`

- Producer: payment service
- Consumers: order, accounting, analytics

### `PaymentReversed`

- Producer: payment service
- Consumers: order, accounting

## Customer and CRM

### `CustomerCreated`

- Producer: api, store-api, POS
- Consumers: CRM, marketing, analytics

### `CustomerUpdated`

- Producer: api, store-api, POS
- Consumers: CRM, analytics

### `CustomerMerged`

- Producer: admin tools
- Consumers: CRM, search, analytics

### `CustomerSegmentChanged`

- Producer: segmentation job
- Consumers: marketing, recommendations

### `CustomerAddressAdded`

- Producer: api, store-api, POS
- Consumers: order, shipping, analytics

### `CustomerAddressUpdated`

- Producer: api, store-api, POS
- Consumers: order, shipping, analytics

## POS

### `PosSaleStarted`

- Producer: store-api
- Consumers: inventory, analytics, audit

### `PosItemScanned`

- Producer: store-api
- Consumers: inventory, pricing, analytics

### `PosSaleCompleted`

- Producer: store-api
- Consumers: accounting, inventory, reporting, CRM

### `PosSaleVoided`

- Producer: store-api
- Consumers: inventory, accounting, audit

### `ReceiptPrinted`

- Producer: store-api
- Consumers: audit, support

## Fulfillment and Delivery

### `FulfillmentCreated`

- Producer: order workflow
- Consumers: warehouse, delivery, notifications

### `FulfillmentPicked`

- Producer: warehouse app
- Consumers: delivery, analytics

### `FulfillmentPacked`

- Producer: warehouse app
- Consumers: delivery, notifications

### `DeliveryAssigned`

- Producer: delivery service
- Consumers: rider app, notifications

### `DeliveryPickedUp`

- Producer: rider app
- Consumers: tracking, notifications, analytics

### `DeliveryCompleted`

- Producer: rider app
- Consumers: order, loyalty, analytics

## Search and Analytics

These are consumers of most events:

- `search-indexer`
- `reporting-projector`
- `audit-projector`
- `notification-dispatcher`

## Recommended Implementation Order

1. Add outbox table and dispatcher.
2. Emit inventory, order, and payment events.
3. Build projections for list pages and dashboards.
4. Add POS sale events.
5. Extract inventory or notifications first if service split becomes necessary.
