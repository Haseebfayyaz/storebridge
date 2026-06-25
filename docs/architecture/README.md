# Shopbridge Architecture

This folder describes the target architecture for Shopbridge as a modular monolith that can evolve into services later.

## Docs

- [Module Map](./module-map.md)
- [Event Catalog](./event-catalog.md)

## Principles

- Keep one transactional monolith for now.
- Put business rules behind bounded-context services, not controllers.
- Publish domain events from the write model using an outbox.
- Build read models for list/search screens.
- Prefer async integration between domains whenever the user does not need an immediate response.
- Use tenant, store, and channel as first-class scoping dimensions.
