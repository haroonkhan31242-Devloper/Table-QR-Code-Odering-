# TableCraft — Multi-Tenant Restaurant & QR Ordering SaaS

A frontend-only prototype of a multi-restaurant SaaS: Super Admin console, restaurant portal (owner, manager, waiter, kitchen, cashier), mobile-first QR table ordering, optional waiter approval, kitchen display, POS (dine-in and takeaway, cash payments), menu management and reports.

**Everything runs in the browser.** LocalStorage is the temporary database. There is no backend, API or payment gateway.

## Run locally

Prerequisite: Node.js 20 or newer.

```bash
npm install
cp .env.example .env   # then choose your own demo usernames and passwords
npm run dev            # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | TypeScript type-check |

## Entry points

| URL | Who |
| --- | --- |
| `/` | Landing page with live demo-table links |
| `/admin/login` | Super Admin (credentials from `VITE_DEMO_SUPER_ADMIN_*`) |
| `/portal/login` | Restaurant owners, managers and staff |
| `/menu/:slug/:token?table=NN` | Customers, opened by scanning a table QR (no login) |

Demo staff usernames include `sana.manager`, `bilal.waiter` (authorised approver), `saad.waiter`, `tariq.kitchen`, `ayesha.cashier`, `zainab.owner`, `omar.owner` and `faisal.owner` (suspended restaurant). They use `VITE_DEMO_STAFF_PASSWORD`. The first restaurant's owner uses `VITE_DEMO_RESTAURANT_*`.

After changing `.env`, open **Super Admin → Data & system → Reset demo data** so the new passwords are hashed into storage.

## Architecture

```
src/
├── app/            routes, layouts (portal / admin shells), providers
├── features/       authentication, landing, super-admin, dashboard, orders,
│                   kitchen, tables, qr-management, pos, menu, staff,
│                   settings, reports, customer-menu  (each owns its UI + services)
├── components/     ui (primitives) · shared (brand, image uploader) · feedback (toast, errors)
├── services/       storage (versioned DB + tenant-scoped CRUD), authentication,
│                   access (permissions), qr, images, audit, mock-data
├── constants/      permission catalogue, status metadata
├── hooks/ types/ utils/ config/ styles/
```

UI components never touch LocalStorage directly. They call feature services, which:

1. resolve the signed-in user **from the session** (never from UI-supplied ids),
2. check the required permission in `services/access`,
3. read and write only records stamped with the user's `businessId` and `restaurantId` (`services/storage/collection.ts`),
4. write atomically through `mutateDb()` and append an audit entry.

To move to Firebase, swap the implementations in `services/storage`, `services/authentication`, `services/images` and the feature `services/` folders. Pages and components don't need to change.

## QR codes

- Each table gets a 128-bit token from `crypto.randomUUID()` (falling back to `crypto.getRandomValues`).
- `db.qrRegistry` records every token ever issued across **all** restaurants. New tokens are checked against it and regenerated on collision.
- Regenerating marks the old token `superseded`; revoking marks it `revoked`; deleting a table marks it `orphaned`. Customers who scan an old code see a clear message.
- Resolution validates the token, the owning restaurant (the URL slug must match) and the table reference. A table number alone never identifies a table.
- **Super Admin → Data & system** runs a live uniqueness check.

## Known limitations (prototype)

- Frontend-only authentication and tenant isolation are **not** a security boundary. Anyone with browser access can read LocalStorage and the bundled `VITE_*` values. Production needs server-side auth, authorisation and isolation.
- Data lives in one browser. There is no multi-device sync, and QR uniqueness is guaranteed only within this dataset. A backend must enforce it with a unique constraint.
- LocalStorage holds about 5 MB. Uploaded images are compressed, and the app reports a clear error when storage is full.
- Online and card payments are shown as "coming soon" and do nothing (PRD Phase 1).
