# ShopBridge Prisma Migration Strategy

This project uses one shared schema:

- `libs/database/prisma/schema.prisma`

Use these scripts:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:migrate:create -- --name <migration_name>`
- `npm run prisma:migrate:deploy`
- `npm run prisma:migrate:status`

## Recommended Workflow (Dev)

1. Edit `libs/database/prisma/schema.prisma`
2. Validate and format:
   - `npm run prisma:format`
   - `npm run prisma:validate`
3. Create migration:
   - `npm run prisma:migrate -- --name <migration_name>`
4. Generate client:
   - `npm run prisma:generate`
5. Run app tests/startup.

## Recommended Workflow (CI/Prod)

1. Merge migration files into main branch.
2. In deployment, run:
   - `npm run prisma:migrate:deploy`
   - `npm run prisma:generate`

Do not run `migrate dev` in production.

## Safe Change Patterns

### 1) Add new nullable column (safe)

- Add as optional in schema.
- Deploy migration.
- Backfill data.
- Later make required in a second migration if needed.

### 2) Add required column (safe, 2-step)

Step A:
- Add column as optional or with a default.
- Deploy migration.
- Backfill existing rows.

Step B:
- Change to required (`?` removed), remove temporary defaults if needed.
- Create second migration.

### 3) Rename table/column (safe, minimal downtime)

Avoid direct destructive rename in one step when data exists.

Use 2-phase approach:

1. Add new field/table while keeping old one.
2. Backfill with SQL/data script.
3. Switch app reads/writes to new field/table.
4. Remove old field/table in a later migration.

Use Prisma `@map` / `@@map` to decouple Prisma model names from DB names where useful.

### 4) Add index/unique constraints (safe, staged)

1. Add index first.
2. Validate data consistency.
3. Add unique constraints in later migration.

For large tables, consider manual SQL migration review to avoid long locks.

## Multi-tenant Notes

For tenant-scoped entities, prefer:

- tenant foreign keys (`tenant_id`) on tenant-owned tables
- composite indexes for tenant isolation, e.g. `@@index([tenantId])`
- composite unique constraints scoped by tenant where applicable

## Migration Naming Convention

Use clear action-based names:

- `add_tenant_soft_delete`
- `add_store_timezone`
- `backfill_tenant_ids`
- `enforce_unique_store_name_per_tenant`

## Rollback Strategy

Prisma migrations are forward-only by default.

Use:

- DB backup before production migrations
- small, incremental migrations
- feature flags for app behavior changes tied to schema
- emergency hotfix migration if rollback is needed

## Troubleshooting

- Check status: `npm run prisma:migrate:status`
- Validate schema env: ensure `DATABASE_URL` is set
- If drift in local dev:
  - `npm run prisma:migrate:reset` (destructive, dev only)

