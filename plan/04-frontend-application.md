# Frontend Application (`astre_frontend`)

Next.js 15, App Router, Tailwind CSS, Zustand, TypeScript. Renders the
server's mirrored data for browsing, and talks to the contract directly
(through a connected wallet) for anything that changes state. See
[01-architecture-and-design.md](./01-architecture-and-design.md) for the
read/write split this follows.

## The Read/Write Split, Concretely

- **Reads that need to be searchable/paginated** (pool listings, donation
  history) → `lib/api-client.ts` → `astre_server` REST API.
- **Writes** (donate, apply, approve, claim, create pool) → `lib/stellar.ts`
  / `lib/contract-service.ts` → wallet signs → submitted straight to the
  Soroban network. The frontend never asks the server to perform a write on
  its behalf — the server has no signing authority and should never be
  given any.
- After a write confirms, the UI updates optimistically from the
  transaction result rather than waiting on the indexer to catch up — the
  sync worker's mirror lags by up to one poll cycle, so treating it as the
  source of truth for an action the user just took would show a stale
  state.

## Routes (App Router, `app/`)

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/pools` | Browse all pools — search, filter, sort, paginate |
| `/pools/[id]` | Pool detail — progress, donors, donate action |
| `/pools/compare` | Side-by-side comparison of selected pools |
| `/pools/new` | Create-pool form → `create_pool` / `create_pool_for_school` |
| `/dashboard` | Wallet-scoped overview (pools created, applications, claims) |
| `/donations` | Donation history for the connected wallet |
| `/donations/receipt` | Single-donation receipt view |
| `/transactions` | Transaction status/history |
| `/profile` | Editable profile data (display name, etc.) |
| `/login` | Wallet connect + sign-in-with-wallet flow |
| `/stories`, `/about`, `/help`, `/privacy`, `/terms` | Static/content pages |

Pool browsing (`/pools`) is the page this architecture is built around:
browse with pagination, search by title/category/creator, filter by goal
amount/date range/status/category, sort by newest/most-funded/closest-to-goal/
trending, compare selected pools side by side, and create a new pool.

## State Management (Zustand, `src/store/`)

One store per concern, not one global store:

- **`walletStore`** — connected address, connection status, network. The
  only store that talks to the wallet extension directly.
- **`poolsStore`** — fetched pool listings/detail, filter/sort/pagination
  UI state for `/pools`.
- **`donationsStore`** — donation history and in-flight donation state.
- **`themeStore`** — light/dark preference, persisted.
- **`uiStore`** — transient UI state (modals, toasts) that has no business
  being in a feature store.
- **`notificationsStore`** — in-app notification/toast queue.

Splitting stores this way keeps a re-render triggered by, say, a theme
toggle from touching anything that depends on pool data, and keeps each
store's tests (`themeStore.test.ts`, `notificationsStore.test.ts`) scoped to
one concern.

## `lib/` Responsibilities

| File | Responsibility |
|---|---|
| `api-client.ts` | Typed wrapper around `fetch` for the `astre_server` REST API — `apiClient.get/post/put/delete` |
| `stellar.ts` | Wallet connection (Freighter/`stellar-wallets-kit`), transaction signing/submission |
| `contract-service.ts` | Typed functions for each contract call (`donate`, `applyToPool`, `claimFunds`, …), building the transaction envelope contract functions expect |
| `auth-storage.ts` / `jwt-storage.ts` | Persisting the JWT from the auth flow (see backend doc) client-side |
| `validation.ts` / `pool-creation-validation.ts` | Form/input validation shared across components |
| `errors.ts` | Normalizing contract errors (numeric codes from `astre_contract`) and API errors into user-facing messages |
| `rate-limit.ts` | Client-side rate limiting for actions that could otherwise be spammed against the API |
| `env.ts` | Typed access to `NEXT_PUBLIC_*` env vars |
| `metadata.ts` | Next.js metadata helpers (SEO tags per route) |

`errors.ts` matters specifically because the contract returns numeric error
codes (see [02-smart-contract.md](./02-smart-contract.md#errors)) — the
frontend is where those get mapped to something a donor or student actually
understands, not a raw error number.

## Wallet Integration

- Freighter is the primary supported wallet, accessed through
  `stellar-wallets-kit` rather than Freighter's API directly, so adding a
  second supported wallet later does not require touching every call site.
- Network (`testnet`/`pubnet`) is driven by `NEXT_PUBLIC_STELLAR_NETWORK`,
  never hardcoded — local development always targets testnet.
- The API base URL (`NEXT_PUBLIC_API_BASE_URL`) is likewise environment-driven
  so the same build can point at a local, staging, or production server.

## Environment Variables

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

## Testing

- **Unit** (`__tests__/`, Jest + React Testing Library) — components,
  stores, `lib/` utilities.
- **E2E** (`e2e/`, Playwright) — full flows through the UI, run against a
  real dev server.

## Build Order for Re-Implementation

1. App shell — `layout.tsx`, global styles, theme store, base navigation.
2. `walletStore` + `lib/stellar.ts` connect/disconnect — nothing
   wallet-dependent can be built or tested without this working first.
3. `/login` + auth flow against the server's `auth` module.
4. `poolsStore` + `lib/api-client.ts` read path + `/pools` listing page —
   the first page that proves the frontend-to-server read path end to end.
5. `/pools/[id]` detail page + `donate` contract call — the first
   frontend-to-contract write path.
6. `/pools/new` (create pool) and the application/approval/milestone/claim
   flows, in the same order the contract exposes them
   (apply → approve → set milestones → claim).
7. `/dashboard`, `/donations`, `/transactions`, `/profile` — views layered
   on data the prior steps already produce.
8. Static/content pages (`/about`, `/help`, `/privacy`, `/terms`,
   `/stories`) last — they carry no functional dependencies.
