# Smart Contract (`astre_contract`)

Soroban contract, Rust, compiled to `wasm32-unknown-unknown`. This is the
only layer that holds money and the only layer allowed to decide who gets
what. Every other layer treats its output as fact.

## Data Model

### Pool

A funding pool for a single cause.

```rust
pub struct Pool {
    pub sponsor: Address,          // creator/administrator of the pool
    pub goal: u128,                // target amount
    pub collected: u128,           // amount raised so far
    pub is_closed: bool,
    pub state: PoolState,
    pub application_deadline: u64, // unix timestamp
}

pub enum PoolState {
    Active,     // accepting donations and applications
    Paused,
    Completed,  // goal reached
    Cancelled,
    Disbursed,  // funds distributed
    Closed,     // permanently closed
}
```

Title and description are stored separately under a `metadata` key rather
than on `Pool` itself, keeping the hot struct (read on every donation) small.

### Application

A student's approved allocation and how much of it has been claimed.

```rust
pub struct Application {
    pub approved_amount: i128,
    pub amount_claimed: i128,
}
```

`approved_amount - amount_claimed` is the live claimable balance — computed,
never stored directly, so it cannot drift out of sync with the two source
fields.

### Milestone

```rust
pub struct Milestone {
    pub amount: u128,
}
```

Milestones exist to let a student's funding be released in tranches instead
of one lump sum. The invariant enforced at setup time: the sum of milestone
amounts must equal the student's approved amount. Claims draw down against
the milestone total, not against individual milestones directly — this
keeps claiming flexible (partial claims, any order) while the milestones
themselves document the intended disbursement schedule.

## Storage Key Namespacing

Soroban persistent storage is key-value. Every entity uses a namespaced key
so unrelated data never collides:

| Prefix | Holds | Example |
|---|---|---|
| `pool_count` | pool ID counter | — |
| `metadata` | pool title + description | `("metadata", pool_id)` |
| `pool_school` | school linked to a pool | `("pool_school", pool_id)` |
| `a_count_` | application count for a pool | `("a_count_", pool_id)` |
| `a_` | individual application records | `("a_", pool_id, app_id)` |
| `ap_` | application lookup by student | `("ap_", pool_id, student)` |
| `app_status` | approval status | `("app_status", pool_id, student)` |
| `claimed_amount` | claimed funds | `("claimed_amount", pool_id, student)` |
| `milestones` | student milestones | `("milestones", pool_id, student)` |
| `pool_deadline` | pool deadline | `("pool_deadline", pool_id)` |
| `school_reg` | registered schools | `("school_reg", school_address)` |
| `admin` | platform admin address | — |
| `unclaimed_fees` | accumulated protocol fees | — |
| `creation_fee` | fee charged to create a pool | — |

Composite keys (tuples) are used instead of string concatenation so there is
no risk of two different logical keys colliding through string formatting.

## Function Groups

### Admin
- `set_admin(env, admin)` — one-time (or re-settable by current admin)
  assignment of the platform admin address. Required before school
  registration works.
- `register_school(env, admin, school)` — admin-only. A pool can only be
  linked to a school that has been registered this way.
- `is_school_registered(env, school) -> bool`

### Pool lifecycle
- `create_pool(env, creator, title, description, goal, application_deadline) -> u32`
- `create_pool_for_school(env, creator, title, description, goal, school, application_deadline) -> u32`
  — same as above but links a registered school for approval authority.
- `get_pool`, `get_pool_metadata`, `get_pool_school`, `get_pool_count`,
  `get_total_raised` — read-only accessors.

### Donations
- `donate(env, pool_id, donor, amount)` — rejected if the pool is not
  `Active` or is closed. Tracks per-donor cumulative contribution so refunds
  and donor counts are exact, not estimated.
- `get_donor_count`, `get_contribution`.

### Applications
- `apply_to_pool(env, pool_id, student, application_data)` — one application
  per student per pool, enforced by checking `ap_` before writing.
- `approve_application(env, pool_id, school, student, approved)` — only the
  school linked to the pool may call this.
- `get_application_status`.

### Milestones and disbursement
- `setup_application_milestones(env, pool_id, student, milestones)` —
  student-authorized; sum of milestone amounts must equal the approved
  amount.
- `claim_funds(env, student, pool_id, claim_amount, token_address)` —
  installment claims, capped at `approved_amount - amount_claimed`.
- `get_milestones`, `get_claimed_amount`, `get_application`.

### Sponsor operations
- `withdraw_unallocated_funds(env, pool_id, token_address)` — lets a sponsor
  reclaim collected funds that are not locked against a pending or approved
  application. Surplus is computed at call time
  (`collected - Σ(approved_amount - amount_claimed)` over Pending/Approved
  applications), never cached, so it cannot go stale if applications change
  between calls.

## Errors

Numeric error codes, one enum, no silent failures:

| Code | Error |
|---|---|
| 1 | `PoolNotFound` |
| 2 | `InvalidPoolState` |
| 3 | `UnauthorizedAdmin` |
| 4 | `PoolIsClosed` |
| 5 | `DuplicateApplication` |
| 6 | `StudentHasNotApplied` |
| 7 | `OnlyLinkedSchoolCanApprove` |
| 8 | `PoolNotDisbursedOrRefunded` |
| 9 | `AdminNotSet` |
| 10 | `NoUnclaimedFees` |
| 11 | `InvalidFee` |
| 12 | `PoolNotExpired` |
| 13 | `NoContributionToRefund` |
| 14 | `SchoolNotRegistered` |

Every constraint in the function list above maps to one of these — a
function never fails with a generic panic where a typed error exists.

## Events

Every state-changing function emits an event. This is what the server's
sync worker consumes — see
[03-backend-service.md](./03-backend-service.md#sync-worker). Short symbol
names keep event payloads compact:

| Event | Symbol | Emitted by |
|---|---|---|
| Pool Created | `pool_crtd` | `create_pool*` |
| Donation Made | `donation` | `donate` |
| Pool Closed | `pool_cls` | close/cancel paths |
| Application Submitted | `app_sub` | `apply_to_pool` |
| Application Approved | `app_aprvd` | `approve_application` |
| Milestones Set | `mile_set` | `setup_application_milestones` |
| Funds Claimed | `fund_clmd` | `claim_funds` |
| Donation Refund | `don_refnd` | refund path |
| School Registered | `schl_reg` | `register_school` |
| Admin Set | `admin_set` | `set_admin` |

A missing or malformed event for any state change is a bug — the server has
no other way to learn the state changed.

## Security Rules (Non-Negotiable)

- **Every state-changing call requires the correct party's signature.**
  Donor signs to donate, student signs to apply/claim, school signs to
  approve, admin signs for admin actions. Never trust an address passed as
  a plain argument without `require_auth`.
- **All arithmetic is checked.** Overflow/underflow must return an error,
  never wrap or panic silently — this is why `test_numeric_overflow.rs`
  exists as a dedicated suite.
- **Deadlines are validated against the ledger timestamp at call time**, not
  trusted from client input. Refund eligibility depends on a grace period
  past the deadline (`GRACE_PERIOD_SECS` = 86400, i.e. 24 hours) specifically
  to prevent a donor claiming a refund the instant a deadline passes, before
  a sponsor has had a chance to disburse.
- **Token transfers must not corrupt state on failure.** If a transfer call
  fails partway, prior storage writes for that operation must not have
  already committed a success state.

## Constants

| Constant | Value | Purpose |
|---|---|---|
| `MAX_DESCRIPTION_LENGTH` | 500 | Pool description cap |
| `MAX_URL_LENGTH` | 256 | URL field cap |
| `MAX_IMAGE_HASH_LENGTH` | 64 | Image hash cap |
| `GRACE_PERIOD_SECS` | 86400 | Refund grace period (seconds) |
| `REFUND_GRACE_PERIOD_LEDGERS` | 17280 | Same grace period in ledger blocks |

## Test Coverage Plan

Tests are unit tests colocated with the contract (`#[cfg(test)]`), split by
concern so a failure immediately tells you what category broke:

- **Core functionality** — pool creation, donation, application, approval,
  milestones, claiming, donor tracking.
- **Issue-specific regressions** — named after the bug/issue they guard
  against, so the intent of the test stays traceable.
- **Authorization/security** — every function that should reject an
  unsigned or wrong-signer call, tested explicitly rather than assumed.
- **Numeric overflow** — addition/subtraction/multiplication boundaries.
- **Timestamp edge cases** — deadline boundaries, grace period boundaries,
  deterministic time injection (never rely on wall-clock time in a test).
- **Token transfer errors** — insufficient balance, invalid token contract,
  failed transfer leaving state unchanged.

## Build, Test, Deploy

```bash
cd astre_contract
cargo build --release --target wasm32-unknown-unknown
cargo test --lib

# Deploy (testnet)
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/astre_contract.wasm \
  --source-account $SOROBAN_ACCOUNT

# Initialize
soroban contract invoke --id <contract-id> --source-account $SOROBAN_ACCOUNT \
  -- set_admin --admin <admin-address>
```

## Build Order for Re-Implementation

1. `Pool` struct + storage + `create_pool` + `get_pool*` — nothing works
   without a pool existing first.
2. `donate` + donor tracking — the simplest money-moving path, validates the
   token-transfer plumbing early.
3. `set_admin` + `register_school` + `create_pool_for_school` — admin/school
   layer, needed before applications can be approved.
4. `apply_to_pool` + `approve_application` — application lifecycle.
5. `setup_application_milestones` + `claim_funds` — disbursement, the most
   arithmetic-sensitive part; write the overflow/underflow tests alongside
   this, not after.
6. `withdraw_unallocated_funds` + refund path — depends on everything above
   existing to compute surplus correctly.
7. Events for every step above, added at the same time as the function they
   describe — not retrofitted at the end.
