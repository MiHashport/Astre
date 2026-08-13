# Workflow and Delivery

How work moves from an issue to a merged, deployed change across three
layers that must never be built as one tangled unit.

## One Layer Per Change

Every issue and every PR is scoped to exactly one of `astre_contract`,
`astre_server`, `astre_frontend`. This is enforced by convention (see
[contribution.md](../contribution.md)) rather than tooling, and it exists
because the three layers evolve on different risk profiles: a contract
change is effectively permanent once deployed, a server change is a normal
deploy, and a frontend change is the cheapest to ship and revert. Mixing
them in one PR means a fast frontend fix waits on contract review, and a
risky contract change gets reviewed alongside unrelated UI noise.

## Cross-Layer Dependencies: Stub, Don't Wait

A task in one layer that depends on unfinished work in another layer does
not block on that work finishing. Build a minimal stub for the dependency:

- **Backend needs a contract function that doesn't exist yet** → mock the
  expected return shape in the service, marked
  `// TODO: replace with real implementation from issue #<n>`.
- **Frontend needs a backend endpoint that doesn't exist yet** → mock the
  API response with hardcoded data of the right shape, same marker comment.

Rules that make this safe rather than a source of permanent fake code:

- The stub returns exactly the shape the real dependency will return —
  never a simplified version that will require a second round of caller
  changes when the real thing lands.
- The stub is never pushed as a silent, unmarked implementation. The
  `// TODO:` comment and/or a type name like `MockService` makes it
  discoverable by search.
- Whoever completes the real dependency is responsible for finding and
  replacing every stub that referenced it — that is part of what "done"
  means for that issue, not a follow-up nobody owns.

## CI and Local Gates

Root `npm install` wires up Husky. Without running it once after cloning,
neither hook below runs, and broken code can reach `origin`.

**`pre-commit`** — lint-staged (ESLint + Prettier) on staged
`astre_frontend` files.

**`pre-push`** — build/test checks scoped to whichever layer has changed
files:
- `astre_frontend` changed → `npm run build`
- `astre_server` changed → `npm run build`
- `astre_contract` changed → `cargo build` + `cargo test --lib`

**CI (GitHub Actions, `ci.yml`)** mirrors the same three checks and must
pass before merge. `cd.yml` deploys the frontend to Vercel on merge to
`main`. Hooks are never bypassed with `--no-verify` — a failing hook means
fix the issue, not skip the check.

## Testing Strategy by Layer

- **Contract** — unit tests colocated with the contract, split by concern
  (core functionality, issue regressions, auth/security, numeric overflow,
  timestamp edge cases, token transfer errors). A new function ships with
  tests in the same PR, not as a follow-up.
- **Server** — `*.spec.ts` per service/controller; an integration test
  specifically for the sync worker, since that is the one place a
  fully-mocked unit test would miss double-processing or cursor-drift bugs.
- **Frontend** — Jest + React Testing Library for units, Playwright for
  end-to-end flows that cross multiple pages/stores.

## Dependency Hygiene

Adding a package always updates its lockfile in the same commit —
`package.json` and `package-lock.json` travel together, because `npm ci` in
CI refuses to run when they disagree. Two version-compatibility traps
specific to this codebase to check before installing:

- `@stellar/stellar-sdk` is on v13+; the Soroban namespace was reorganized
  in v12 (`SorobanRpc` → `Soroban`). AI-generated code frequently reaches
  for the old names.
- `astre_server` runs NestJS 11; some companion `@nestjs/*` packages need a
  specific minimum version (`@nestjs/schedule` ^5, `@nestjs/typeorm` ^11,
  `@nestjs/jwt` ^11) to avoid a peer-dependency conflict. Treat that
  warning as a hard error, not a note to ignore.

## Security Posture

Per [SECURITY.md](../SECURITY.md), vulnerabilities are reported privately
(GitHub security advisories or direct maintainer contact), never as a
public issue — this applies to all three layers, but the contract carries
the highest severity ceiling: a logic flaw there can move funds, where a
frontend or backend bug is contained and patchable without waiting on a new
on-chain deployment. Contract PRs are reviewed with that asymmetry in mind.

## Environment and Configuration

Each layer owns its own `.env.example`:

- `astre_server/.env.example` — `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`
  and JWT signing config.
- `astre_frontend/.env.example` — `NEXT_PUBLIC_API_BASE_URL`,
  `NEXT_PUBLIC_STELLAR_NETWORK`.

No secret ever reaches a commit — `.env`, keys, and credentials are
gitignored in every layer, and a PR introducing one is rejected, not
redacted after the fact.

## Rebuild Roadmap

With the codebase reset to a skeleton (see the root `readme.md` for current
status), implementation proceeds layer by layer, following the build orders
already laid out in each layer's plan document, in this overall sequence:

1. **Contract first** — nothing downstream can be real until pools and
   donations exist on-chain. Follow the build order in
   [02-smart-contract.md](./02-smart-contract.md#build-order-for-re-implementation).
2. **Server second**, against a deployed testnet contract — the sync worker
   needs real events to consume, not guessed payloads. Follow
   [03-backend-service.md](./03-backend-service.md#build-order-for-re-implementation).
3. **Frontend third**, wired to the running server and testnet contract —
   follow
   [04-frontend-application.md](./04-frontend-application.md#build-order-for-re-implementation).

Layers 2 and 3 can proceed in parallel once layer 1 has a stable, deployed
contract interface — the stub convention above is exactly what makes that
parallelism safe.
