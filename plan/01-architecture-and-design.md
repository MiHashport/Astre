# Astre — Architecture and Design

## What Astre Is

Astre is an on-chain donation platform built on Stellar (Soroban smart contracts).
It lets a creator open a donation pool for a cause — commonly an educational
sponsorship — collect contributions transparently, let applicants (students)
apply for funding, route approvals through a linked school, and pay out funds
against milestones. Every state-changing action is a contract call, and every
contract call emits an event. Nothing about pool balances, donations, or
disbursements lives only in a database — the chain is authoritative.

## The Three Layers

```
astre_contract/   Soroban smart contract (Rust)   — source of truth
astre_server/     NestJS API (TypeScript)          — indexer + query layer
astre_frontend/   Next.js 15 app (TypeScript)       — UI + wallet interactions
```

Each layer has one job and one job only:

- **Contract** owns state and enforces every rule (who can donate, who can
  approve, how much a student can claim). It is the only place money moves.
- **Server** never moves money and never decides anything. It watches the
  chain, mirrors what it sees into Postgres, and serves that mirror over a
  REST API so the frontend can search, filter, sort, and paginate — none of
  which Soroban storage can do efficiently.
- **Frontend** renders the mirrored data for browsing, and talks to the
  contract directly (through a connected wallet) for anything that changes
  state — donating, applying, approving, claiming.

## Why This Split (and Not a Simpler One)

**Why not read the chain directly from the frontend for everything?**
Because "browse pools, filtered by category, sorted by most-funded, page 3"
is a query pattern Soroban storage was never designed to answer. Contract
storage is a key-value store keyed for O(1) lookups by ID, not for scans,
joins, or sorts. Trying to serve a pools listing page directly from chain
reads means fetching every pool and filtering client-side — it does not
scale past a handful of pools.

**Why not let the server hold authoritative state and skip on-chain writes?**
Because that reintroduces the exact problem Astre exists to remove: a
database a maintainer could edit, with no public proof donations were
recorded honestly. The chain has to be where money and approvals live, or
"transparent, trustless donations" is just marketing.

**The resolution: contract is truth, server is a read-optimized cache.**
This is a standard blockchain-indexer pattern. The server subscribes to
Horizon (Stellar's API layer) for contract events, and on each event updates
its own Postgres rows to match. If the database and chain ever disagree, the
chain wins — the server's job is to catch up, not to be asked which is
correct.

## Data Flow

```
User action (donate, apply, approve, claim)
        │
        ▼
  Frontend signs + submits a Soroban transaction (via wallet)
        │
        ▼
  Contract validates, updates storage, emits an event
        │
        ▼
  Horizon exposes the event in its event stream
        │
        ▼
  Server's sync worker polls Horizon, processes new events,
  writes/updates rows in Postgres (idempotent on tx hash)
        │
        ▼
  Frontend reads pool listings, donation history, etc. from
  the server's REST API — fast, filterable, paginated
```

Reads that need to be fast and queryable (pool listings, search, donation
history) go through the server. Reads that need to be authoritative at the
moment of a write (e.g. confirming a specific donation succeeded) come from
the transaction result itself, not a follow-up API call — the indexer lags
the chain by however long the next poll cycle takes.

## Authentication: Wallet-Signature, Not Passwords

Astre has no passwords. Identity is a Stellar wallet address. The login flow
is a standard "sign-in with wallet" pattern:

1. Client asks the server for a one-time nonce tied to a wallet address.
2. Wallet signs a challenge containing that nonce (via Freighter or another
   Stellar wallet).
3. Server verifies the signature against the claimed address, marks the
   nonce used (so it cannot be replayed), and issues a JWT.
4. The JWT authenticates subsequent API calls; the wallet keeps signing
   contract transactions directly — the JWT never authorizes fund movement,
   only server-side reads/writes like profile data.

The nonce exists specifically to stop replay attacks: without it, a captured
signature could be resubmitted to log in as someone else indefinitely.

## Stack Choices and Why

| Layer | Choice | Reasoning |
|---|---|---|
| Contract | Soroban (Rust), `wasm32-unknown-unknown` | Stellar's native smart contract platform; low fees and fast finality fit small donation amounts better than a general-purpose L1. |
| Backend | NestJS + TypeORM + PostgreSQL | Structured module system keeps indexer/auth/API concerns separated; TypeORM migrations make schema changes reviewable instead of implicit `synchronize`. |
| Frontend | Next.js 15 (App Router) + Zustand + Tailwind | App Router gives file-based routing that matches the pools/dashboard/profile page structure directly; Zustand avoids Redux boilerplate for what is mostly wallet/session/UI state. |
| Wallet | Freighter (via `stellar-wallets-kit`) | The standard browser wallet for Stellar; signs both the auth challenge and contract transactions. |

## Cross-Layer Rule

A change to donation logic never lives half in the contract and half in the
server. If a feature needs new on-chain behavior, the contract changes,
emits a new/updated event, and the server's sync logic is updated to consume
it — in that order. The server is never the place business rules are
enforced; it is only ever catching up to what the contract already decided.

## What Lives Where — Quick Reference

- Money movement, approval rules, milestone math → `astre_contract`
- Event ingestion, search/filter/sort, auth, profile data → `astre_server`
- Wallet connection, forms, on-chain call submission, data display → `astre_frontend`

See [02-smart-contract.md](./02-smart-contract.md),
[03-backend-service.md](./03-backend-service.md), and
[04-frontend-application.md](./04-frontend-application.md) for the
implementation plan of each layer, and
[05-workflow-and-delivery.md](./05-workflow-and-delivery.md) for how work
gets built, reviewed, and shipped.
