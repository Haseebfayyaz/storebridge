# SaaS Admin API Examples

All endpoints require `Authorization: Bearer <token>` and are tenant-scoped by JWT `tenantId`.

## Categories

```bash
curl -X POST http://localhost:3002/api/categories \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Electronics","slug":"electronics"}'
```

```bash
curl http://localhost:3002/api/categories -H "Authorization: Bearer <token>"
```

## Tax Classes

```bash
curl -X POST http://localhost:3002/api/tax-classes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"GST 18","rate":18}'
```

## Products

```bash
curl -X POST http://localhost:3002/api/products \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Phone","description":"128GB","categoryId":"cat_id","taxClassId":"tax_id"}'
```

```bash
curl "http://localhost:3002/api/products?page=1&limit=20&name=phone&categoryId=cat_id&sortBy=price&sortOrder=asc" \
  -H "Authorization: Bearer <token>"
```

## Roles and Permissions

```bash
curl -X POST http://localhost:3002/api/roles \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Catalog Manager","isAdmin":false}'
```

```bash
curl http://localhost:3002/api/permissions/grouped -H "Authorization: Bearer <token>"
```

```bash
curl -X POST http://localhost:3002/api/roles/<role_id>/permissions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"permissionId":"perm_id","enabled":true}'
```

## Permission Seeding

```bash
npm run prisma:seed:permissions
```
