# Backend Service (`astre_server`)

NestJS + TypeORM + PostgreSQL. This layer never moves money and never makes
an approval decision — its entire job is to mirror what the contract has
already decided, and serve that mirror as a fast, queryable REST API. See
[01-architecture-and-design.md](./01-architecture-and-design.md) for why
this split exists.

## Modules

| Module | Responsibility |
|---|---|
| `auth` | Nonce issuance, wallet-signature verification, JWT issuance/validation |
| `pools` | CRUD-style read API over the pools mirror table; search/filter/sort |
| `donations` | Donation history reads, tx-hash-indexed for idempotency checks |
| `users` | Profile data keyed by wallet address (display name, etc.) |
| `transactions` | Transaction history/status surfaced to the frontend |
| `contract` | Wraps Horizon/Soroban RPC calls the server itself needs to make |
| `sync` | The indexer worker — polls Horizon, applies events to the mirror |
| `common` | Cross-cutting: global exception filter, request logging/context |

## Data Model (Postgres, via TypeORM)

### Pool (mirror of on-chain pool)

```ts
@Entity('pools')
class Pool {
  id: string;               // internal UUID, not the on-chain pool id
  contractPoolId: string;   // unique — the on-chain identifier, join key
  title: string;
  description: string;
  category: string;
  creatorWallet: string;
  status: PoolStatus;       // Active | Completed (mirrors on-chain state)
  goal: string;              // bigint stored as string — see note below
  raised: string;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

`goal` and `raised` are stored as `bigint`/string rather than JS `number`.
Stellar amounts routinely exceed `Number.MAX_SAFE_INTEGER` once denominated
in stroops; storing as string and parsing with a bigint library at the
boundary avoids silent precision loss. This rule applies to every on-chain
amount field anywhere in the server or frontend.

`contractPoolId` is the unique join key between chain and database — every
write from the sync worker keys off it, never off the internal UUID.

### Donation

Indexed by transaction hash so a donation is only ever recorded once, no
matter how many times the sync worker sees the same event (see idempotency,
below).

### User

Keyed by wallet address. Holds only server-side profile data — display
name, preferences — never balances or approval state, which stay on-chain.

### Nonce

One-time values issued for the wallet-signature login challenge. Marked
used immediately on successful verification so a captured signature cannot
be replayed to log in twice.

### SyncState

A single row (or small set of rows) holding the sync worker's current
Horizon cursor, so a server restart resumes from where it left off instead
of re-scanning from the beginning of the ledger.

## Auth Flow

1. `POST /auth/nonce` with a wallet address → server generates and stores a
   nonce tied to that address, returns a challenge string embedding it.
2. Client has the wallet sign the challenge (Freighter).
3. `POST /auth/verify` with the signature → server recovers/verifies the
   signer against the claimed address, checks the nonce is unused, marks it
   used, issues a JWT (Passport JWT strategy).
4. Every authenticated route uses `JwtAuthGuard`. The JWT authorizes
   server-side actions only (profile updates, reads scoped to a wallet) —
   it never authorizes a contract call. Contract calls are always signed
   fresh by the wallet, independent of the JWT's validity.

## Sync Worker

The part of the server that keeps Postgres honest against the chain.

**Design:**
- Runs on a schedule (`@Cron`, e.g. every minute) rather than a persistent
  streaming subscription — simpler operationally, and donation volume for
  this use case does not need sub-minute latency.
- Tracks a Horizon cursor in `SyncState`, persisted after each successful
  poll, so restarts do not reprocess the entire event history.
- **Idempotency is mandatory, not optional.** Every event with a
  transaction hash is checked against already-processed hashes before being
  applied — both within a single poll run (`seenInRun`, catching Horizon
  returning the same event twice in one page) and against the persisted
  donations table (catching re-delivery across restarts). A sync worker
  that double-counts a donation on retry is a critical bug, not a cosmetic
  one — it corrupts the number closest to real money that this app shows.
- One handler per event type (`processPoolCreatedEvent`,
  `processDonationEvent`, `processPoolClosedEvent`, …), each responsible for
  translating the event's `topic`/`value` payload into a mirror-table write
  and nothing else. Handlers never call back into contract-writing logic —
  the sync direction is strictly chain → database.
- When an event references a pool the mirror does not have yet (e.g. sync
  started after some pools existed), the handler upserts rather than
  assuming an existing row — `upsertFromChain`, not `updateFromChain`.

**Build order:**
1. `SyncState` persistence (cursor save/load) — needed before anything else
   can be resumable.
2. Horizon polling client (the `contract`/`HorizonService` piece) that
   fetches raw contract events for the deployed contract ID.
3. `pool_crtd` handler — the simplest event, proves the pipeline end to end.
4. `donation` handler — the highest-value correctness target; write the
   idempotency tests alongside this, not after.
5. Remaining event handlers (`pool_cls`, `app_sub`, `app_aprvd`,
   `mile_set`, `fund_clmd`, …), each mapped to the mirror tables/columns it
   affects.

## API Conventions

- REST, resource-oriented (`/pools`, `/pools/:id`, `/donations`, …).
- Every endpoint returns a consistent response shape — do not let one
  controller return a bare array and another wrap in `{ data: [...] }`.
- Filtering/sorting/pagination parameters live on `pools` list endpoints
  specifically because that is the query pattern the chain cannot serve
  efficiently (see architecture doc) — this is the entire reason the mirror
  exists.
- DTOs validate every request body; a malformed request never reaches a
  service method un-validated.

## Database Migrations

`synchronize` is off in every environment — schema changes only ever happen
through a committed migration, never implicitly on server start.

```bash
cp .env.example .env              # configure DB_HOST/PORT/USER/PASSWORD/NAME
npm run migration:run             # bring a fresh DB up to date
# ...edit an entity...
npm run migration:generate -- src/migrations/<DescriptiveName>
# read the generated SQL before committing — TypeORM will emit a DROP
# COLUMN where a rename was intended
npm run migration:run             # apply and verify locally
```

Migration files, once merged and deployed, are never edited — a correction
is a new migration, because anyone who already ran the old one will not
re-run it.

## Testing

- Unit tests per service/controller (`*.spec.ts`), colocated with the code
  they test.
- Integration tests for the sync worker specifically
  (`sync.service.integration.spec.ts`) — this is the one component where a
  unit test mocking everything would miss the exact class of bug (double
  processing, cursor drift) the worker exists to prevent.

## Build Order for Re-Implementation

1. `app.module` skeleton + `common` (exception filter, logging) — baseline
   NestJS app that boots and returns consistent errors.
2. `auth` module (nonce + JWT) — needed before any wallet-scoped endpoint
   can be tested realistically.
3. `pools` module (entity + migration + controller/service, read-only
   first) — the core read path the frontend needs first.
4. `sync` module wired to `pools` — start mirroring `pool_crtd` before
   building `donations`, so there is something to mirror donations against.
5. `donations` module + sync handler for the `donation` event.
6. `users` and `transactions` modules.
7. `contract` module hardened (real Horizon error handling, retries) once
   the rest of the pipeline is proven against a testnet contract.
