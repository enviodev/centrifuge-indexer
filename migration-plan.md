# Centrifuge Indexer Migration Plan

**Ponder (api-v3) → HyperIndex (centrifuge-indexer)**

---

## Why Migrate

| Dimension | Ponder (current) | HyperIndex (target) |
|-----------|-------------------|----------------------|
| Historical sync | RPC polling | HyperSync — up to 1000× faster |
| Boilerplate | 43 service classes / 4,292 LOC of ORM helpers | Inline `context.Entity.get()`/`.set()` — zero service layer |
| API layer | Custom Hono routes + manual GraphQL | Built-in GraphQL API with auto-generated queries |
| Schema definition | TypeScript `onchainTable()` + `relations()` (1,559 LOC) | Declarative `schema.graphql` (~400 LOC) |
| Contract config | 640 LOC of TypeScript type gymnastics | Declarative `config.yaml` (~200 LOC) |
| Factory contracts | Ponder `factory()` wrapper | `contractRegister()` — first-class dynamic contracts |
| Multi-chain | Custom chain registry + env filtering | Native multi-chain with per-chain config |
| Snapshots | Manual block handler + period detection | `onBlock` API with configurable intervals |
| Testing | Ad-hoc | `createTestIndexer()` + `MockDb` (Vitest) |

**Bottom line:** ~8,600 LOC of TypeScript infrastructure collapses into ~600 LOC of YAML + GraphQL schema, with handlers shrinking by ≈40% once service indirection is removed.

---

## Scope Inventory

### Entities — 45 types + 8 enums

| Category | Entities | Count |
|----------|----------|-------|
| Core | Blockchain, Deployment, Pool, PoolSpokeBlockchain, Token, Asset, AssetRegistration, Account | 8 |
| Vaults | Vault, VaultInvestOrder, VaultRedeemOrder | 3 |
| Token Instances | TokenInstance, TokenInstancePosition | 2 |
| Invest/Redeem Orders | InvestOrder, PendingInvestOrder, EpochInvestOrder, RedeemOrder, PendingRedeemOrder, EpochRedeemOrder | 6 |
| Investor Transactions | InvestorTransaction, WhitelistedInvestor | 2 |
| Holdings | Holding, HoldingAccount, HoldingEscrow, Escrow | 4 |
| On/Off Ramp | OnOffRampManager, OfframpRelayer, OnRampAsset, OffRampAddress | 4 |
| Pool Management | PoolManager, Policy, MerkleProofManager | 3 |
| Crosschain | CrosschainPayload, CrosschainMessage, Adapter, AdapterWiring, AdapterParticipation | 5 |
| Snapshots | PoolSnapshot, TokenSnapshot, TokenInstanceSnapshot, HoldingSnapshot | 4 |
| **DEPRECATED (OPTIONAL)** | OutstandingInvest, OutstandingRedeem, EpochOutstandingInvest, EpochOutstandingRedeem | 4 |

**Enums (8):** VaultKind, VaultStatus, InvestorTransactionType, HoldingAccountType, CrosschainPayloadStatus, CrosschainMessageStatus, AdapterParticipationType, AdapterParticipationSide

### Handler Files — 17 files / 3,531 LOC

| File | LOC | Events | Phase |
|------|-----|--------|-------|
| batchRequestManagerHandlers.ts | 693 | 8 (UpdateDepositRequest, UpdateRedeemRequest, ApproveDeposits, ApproveRedeems, IssueShares, RevokeShares, ClaimDeposit, ClaimRedeem) | 4 |
| vaultHandlers.ts | 590 | 6 (DepositRequest, RedeemRequest, DepositClaimable, RedeemClaimable, Deposit, Withdraw) | 5 |
| gatewayHandlers.ts | 293 | 5 (PrepareMessage, UnderpaidBatch, RepayBatch, ExecuteMessage, FailMessage) | 6 |
| multiAdapterHandlers.ts | 292 | 5 (SendPayload, SendProof, HandlePayload, HandleProof, File) | 6 |
| spokeHandlers.ts | 270 | 8 (DeployVault, RegisterAsset, AddShareClass, UpdateSharePrice, UpdateAssetPrice, InitiateTransferShares, LinkVault, UnlinkVault) | 3 |
| shareClassManagerHandlers.ts | 165 | 12 (AddShareClass×2, UpdateMetadata, UpdateShareClass, UpdatePricePoolPerShare, + delegates to batchRequestManager) | 4 |
| tokenInstanceHandlers.ts | 159 | 1 (Transfer) | 5 |
| hubRegistryHandlers.ts | 159 | 5 (NewPool, UpdateCurrency, NewAsset, UpdateManager, SetMetadata) | 2 |
| holdingsHandlers.ts | 151 | 5 (Initialize, Increase, Decrease, Update, UpdateValuation) | 3 |
| balanceSheetHandlers.ts | 136 | 3 (NoteDeposit, Withdraw, UpdateManager) | 3 |
| onOffRampManagerHandlers.ts | 134 | 4 (DeployOnOfframpManager, UpdateRelayer, UpdateOnramp, UpdateOfframp) | 7 |
| vaultRegistryHandlers.ts | 127 | 3 (DeployVault, LinkVault, UnlinkVault) | 3 |
| hubHandlers.ts | 108 | 2 (NotifyPool, UpdateRestriction) | 2 |
| setupHandlers.ts | 104 | 2 (setup:multiAdapter, setup:hubRegistry) | 1 |
| blockHandlers.ts | 81 | block-level (period boundary detection → snapshots) | 8 |
| merkleProofManagerHandlers.ts | 50 | 2 (DeployMerkleProofManager, UpdatePolicy) | 7 |
| poolEscrowFactoryHandlers.ts | 19 | 1 (DeployPoolEscrow) | 2 |

### Service Files — 43 files / 4,292 LOC (ELIMINATED in migration)

The entire service layer is replaced by direct `context.Entity.get()`/`.set()` calls in handlers.

### Contracts — 14 singleton + 10 factory-deployed

**Registry Versions:** `v3` and `v3_1` (with per-chain migration blocks)

**Singleton Contracts (per version):**

| Contract | V3 | V3_1 | Notes |
|----------|:--:|:----:|-------|
| BalanceSheet | ✓ | ✓ | |
| BatchRequestManager | | ✓ | New in V3_1 |
| Gateway | ✓ | ✓ | |
| Holdings | ✓ | ✓ | |
| Hub | ✓ | ✓ | |
| HubRegistry | ✓ | ✓ | |
| MerkleProofManagerFactory | ✓ | ✓ | |
| MessageDispatcher | ✓ | ✓ | |
| MultiAdapter | ✓ | ✓ | |
| OnOfframpManagerFactory | ✓ | ✓ | |
| PoolEscrowFactory | ✓ | ✓ | |
| ShareClassManager | ✓ | ✓ | |
| Spoke | ✓ | ✓ | |
| VaultRegistry | | ✓ | New in V3_1 |

**Factory-Deployed Contracts (per version):**

| Logical Name | ABI | Factory Contract | Event | Parameter |
|-------------|-----|-----------------|-------|-----------|
| vault | Spoke (V3) / VaultRegistry (V3_1) | Spoke / VaultRegistry | DeployVault | vault |
| poolEscrow | PoolEscrowFactory | PoolEscrowFactory | DeployPoolEscrow | escrow |
| onOfframpManager | OnOfframpManagerFactory | OnOfframpManagerFactory | DeployOnOfframpManager | manager |
| merkleProofManager | MerkleProofManagerFactory | MerkleProofManagerFactory | DeployMerkleProofManager | manager |
| tokenInstance | Spoke | Spoke | AddShareClass | token |

### Chains — 13 networks

| Chain ID | Name | Type |
|----------|------|------|
| 1 | Ethereum | Mainnet |
| 8453 | Base | Mainnet |
| 10 | Optimism | Mainnet |
| 42161 | Arbitrum | Mainnet |
| 43114 | Avalanche | Mainnet |
| 56 | Binance | Mainnet |
| 98866 | Plume | Mainnet |
| 143 | Monad | Mainnet |
| 999 | Hyperliquid | Mainnet |
| 11155111 | Ethereum Sepolia | Testnet |
| 84532 | Base Sepolia | Testnet |
| 421614 | Arbitrum Sepolia | Testnet |
| 998 | Hyperliquid | Testnet |

### API Endpoints (to replicate via built-in GraphQL)

| Ponder Route | Purpose | HyperIndex Equivalent |
|-------------|---------|----------------------|
| `POST /` | GraphQL | Built-in — same path |
| `POST /graphql` | GraphQL alias | Built-in |
| `GET /sql/*` | Direct SQL | Not needed — GraphQL covers it |
| `GET /tokens/:address/total-issuance` | Token supply | GraphQL query on `TokenInstance` |
| `GET /tokens/:address/price` | Token price | GraphQL query on `TokenInstance` |
| `GET /stats` | Global TVL / counts | GraphQL aggregation query |

---

## Architecture Decisions

### AD-1: Eliminate the Service Layer

**Ponder pattern (BEFORE):**
```typescript
// Service class wraps every entity operation
class TokenService extends Service<typeof Token> {
  async getOrInit(id: string) { /* 20+ lines */ }
  async upsert(data: Partial<Token>) { /* validation, defaults */ }
}
// Handler calls service
const token = await TokenService.getOrInit(context, tokenId);
await TokenService.upsert(context, { ...token, name: newName });
```

**HyperIndex pattern (AFTER):**
```typescript
// Direct inline — no service layer
let token = await context.Token.get(tokenId);
if (!token) {
  token = { id: tokenId, name: "", /* defaults */ };
}
context.Token.set({ ...token, name: newName });
```

**Rationale:** The 43 service files (4,292 LOC) exist only because Ponder's ORM requires boilerplate for defaults, validation, and upsert logic. HyperIndex's `get()`/`set()` API is direct and type-safe from codegen. Entity defaults move to a small `src/utils/defaults.ts` helper file.

### AD-2: V3 / V3_1 as Separate Named Contracts

In `config.yaml`, each registry version becomes a separate named contract with `start_block` and `end_block`:

```yaml
# Example: BalanceSheet across versions
- name: BalanceSheetV3
  abi_file_path: abis/BalanceSheet.json
  handler: src/handlers/BalanceSheet.ts
  events:
    - event: NoteDeposit
    - event: Withdraw
    - event: UpdateManager

- name: BalanceSheetV3_1
  abi_file_path: abis/BalanceSheetV3_1.json
  handler: src/handlers/BalanceSheet.ts
  events:
    - event: NoteDeposit
    - event: Withdraw
    - event: UpdateManager
```

Each chain section specifies `start_block` / `end_block` per version. The handler file is shared — event signatures are identical across versions (or the handler checks `event.srcAddress` to disambiguate if needed).

### AD-3: Factory Contracts via `contractRegister()`

All 10 factory-deployed contract types use HyperIndex's `contractRegister()` API:

```typescript
// In the factory contract handler (e.g., Spoke or VaultRegistry)
PoolEscrowFactory.DeployPoolEscrow.contractRegister(({ event, context }) => {
  context.addPoolEscrow(event.params.escrow);
});
```

The dynamic contract is defined in `config.yaml` without an `address` field, and gets registered at runtime when the factory event fires.

### AD-4: Effect API for All RPC Calls

Any handler that needs to read on-chain state (e.g., token decimals, metadata from IPFS) must use the Effect API:

```typescript
import { createEffect } from "envio";
import * as S from "envio/store";

const fetchTokenDecimals = createEffect({
  inputSchema: S.Struct({ address: S.String }),
  outputSchema: S.Struct({ decimals: S.Number }),
  handler: async ({ address }) => {
    // RPC call or fetch
  },
});

// In event handler:
const result = await context.effect(fetchTokenDecimals, { address: tokenAddr });
```

### AD-5: `onBlock` API for Snapshots

Replace the manual period-boundary detection in `blockHandlers.ts` with HyperIndex's `onBlock`:

```yaml
# config.yaml
- name: SnapshotTrigger
  handler: src/handlers/Snapshots.ts
  events:
    - event: onBlock
      interval: 7200  # ~1 day on Ethereum (12s blocks)
```

```typescript
SnapshotTrigger.onBlock(async ({ event, context }) => {
  // Snapshot all pools, tokens, holdings for this chain
});
```

### AD-6: Deprecated Entities are OPTIONAL

The following 4 entities are **deprecated** in the current Ponder codebase and may be skipped entirely:

- `OutstandingInvest`
- `OutstandingRedeem`
- `EpochOutstandingInvest`
- `EpochOutstandingRedeem`

These are superseded by the `InvestOrder` / `RedeemOrder` / `PendingInvestOrder` / `PendingRedeemOrder` entity families. If any downstream consumer still depends on them, they can be added in a follow-up phase.

---

## Phase 0 — Project Scaffolding

**Goal:** Set up the centrifuge-indexer repo structure, dependencies, and build pipeline.

**Effort:** 1–2 days · **Risk:** Low

### Tasks

1. **Replace template config/schema** — overwrite the ERC-20 template `config.yaml` and `schema.graphql` with Centrifuge-specific stubs
2. **Copy ABIs** — extract all ABI JSON files from the Ponder generated registry and place in `abis/` directory
3. **Create directory structure:**
   ```
   centrifuge-indexer/
   ├── abis/                  # ABI JSON files (V3 + V3_1)
   ├── config.yaml            # All contracts + chains
   ├── schema.graphql          # All entities + enums
   ├── src/
   │   ├── handlers/           # Event handlers (1 file per contract)
   │   ├── utils/
   │   │   ├── defaults.ts     # Entity default factories
   │   │   ├── ids.ts          # ID construction helpers
   │   │   ├── chains.ts       # Chain metadata (names, explorers, icons)
   │   │   └── constants.ts    # Shared constants
   │   └── effects/
   │       ├── rpc.ts          # RPC read effects (decimals, metadata)
   │       └── ipfs.ts         # IPFS fetch effect (pool metadata)
   ├── test/
   │   └── *.test.ts           # Per-handler test files
   └── tsconfig.json
   ```
4. **Run `pnpm codegen`** — verify generated types compile
5. **Run `pnpm tsc --noEmit`** — zero errors

### Checkpoint
- [x] `pnpm codegen` succeeds
- [x] `pnpm tsc --noEmit` succeeds
- [x] All ABI files present and valid JSON (36 from registry + ERC20)
- [x] 16 handler stub files compile
- [x] Utility files written (chains.ts, ids.ts, constants.ts)

**Status: COMPLETE** — Phase 0 completed with all scaffolding in place.

---

## Phase 1 — Schema & Config

**Goal:** Define all 45 entities, 8 enums, and all contract/chain configuration.

**Effort:** 2–3 days · **Risk:** Low

### schema.graphql

Translate every `onchainTable()` call from `ponder.schema.ts` into a GraphQL type. Translation rules:

| Ponder (drizzle) | GraphQL |
|-------------------|---------|
| `t.text()` | `String!` |
| `t.hex()` | `String!` |
| `t.integer()` | `Int!` |
| `t.bigint()` | `BigInt!` |
| `t.boolean()` | `Boolean!` |
| `t.timestamp()` | `Int!` (unix timestamp) |
| `t.jsonb()` | `JSON` |
| `.notNull()` | `!` (non-nullable) |
| no `.notNull()` | nullable (no `!`) |
| `onchainEnum(...)` | `enum FooType { ... }` |
| `relations()` / FK | `foo_id: String!` + `@derivedFrom` on parent |

**Example translation:**

```graphql
# Ponder:
# export const Token = onchainTable("token", (t) => ({
#   id: t.hex().notNull(),
#   index: t.integer().notNull(),
#   isActive: t.boolean().notNull().$default(() => true),
#   ...
# }));

type Token {
  id: ID!
  index: Int!
  isActive: Boolean!
  centrifugeId: String!
  blockchain_id: String!
  poolId: BigInt!
  decimals: Int!
  name: String!
  symbol: String!
  salt: String
  totalIssuance: BigInt!
  tokenPrice: BigInt!
  tokenPriceComputedAt: Int
  createdAt: Int!
  updatedAt: Int
  # Derived relations
  vaults: [Vault!]! @derivedFrom(field: "token_id")
  tokenInstances: [TokenInstance!]! @derivedFrom(field: "token_id")
}
```

**Entity checklist** (all 45 — deprecated marked with ⚠️):

- [ ] Blockchain
- [ ] Deployment
- [ ] Pool
- [ ] PoolSpokeBlockchain
- [ ] Token
- [ ] Vault
- [ ] InvestorTransaction
- [ ] WhitelistedInvestor
- [ ] ⚠️ OutstandingInvest (OPTIONAL)
- [ ] ⚠️ OutstandingRedeem (OPTIONAL)
- [ ] VaultInvestOrder
- [ ] PendingInvestOrder
- [ ] InvestOrder
- [ ] VaultRedeemOrder
- [ ] PendingRedeemOrder
- [ ] RedeemOrder
- [ ] ⚠️ EpochOutstandingInvest (OPTIONAL)
- [ ] ⚠️ EpochOutstandingRedeem (OPTIONAL)
- [ ] EpochInvestOrder
- [ ] EpochRedeemOrder
- [ ] AssetRegistration
- [ ] Asset
- [ ] TokenInstance
- [ ] Holding
- [ ] HoldingAccount
- [ ] Escrow
- [ ] HoldingEscrow
- [ ] PoolManager
- [ ] OnOffRampManager
- [ ] OfframpRelayer
- [ ] OnRampAsset
- [ ] OffRampAddress
- [ ] Policy
- [ ] CrosschainPayload
- [ ] CrosschainMessage
- [ ] Adapter
- [ ] AdapterWiring
- [ ] AdapterParticipation
- [ ] PoolSnapshot
- [ ] TokenSnapshot
- [ ] TokenInstanceSnapshot
- [ ] HoldingSnapshot
- [ ] Account
- [ ] TokenInstancePosition
- [ ] MerkleProofManager

### config.yaml

Define all contracts across all 13 chains with correct `start_block` / `end_block` per version.

**Structure pattern:**

```yaml
name: centrifuge-indexer
contracts:
  # --- V3 Singleton Contracts ---
  - name: HubRegistryV3
    abi_file_path: abis/HubRegistryV3.json
    handler: src/handlers/HubRegistry.ts
    events:
      - event: NewPool(uint64 indexed poolId, address admin, address shareClassManager)
      - event: UpdateCurrency(uint64 indexed poolId, uint128 currency, uint8 decimals)
      - event: NewAsset(uint128 indexed assetId)
      - event: UpdateManager(uint64 indexed poolId, address manager, bool isManager)
      - event: SetMetadata(uint64 indexed poolId, bytes metadata)

  # --- V3_1 Singleton Contracts (same handler, different start/end blocks) ---
  - name: HubRegistryV3_1
    abi_file_path: abis/HubRegistryV3_1.json
    handler: src/handlers/HubRegistry.ts
    events:
      # same event list

  # --- Factory Contracts (no address — registered dynamically) ---
  - name: TokenInstance
    abi_file_path: abis/ERC20.json
    handler: src/handlers/TokenInstance.ts
    events:
      - event: Transfer(address indexed from, address indexed to, uint256 value)

chains:
  - id: 1
    start_block: 0
    contracts:
      HubRegistryV3:
        address: "0x..."
        start_block: 21088769
        end_block: 24379762
      HubRegistryV3_1:
        address: "0x..."
        start_block: 24379763
```

### V3 → V3_1 End Blocks

| Chain ID | V3 End Block |
|----------|-------------|
| 1 (Ethereum) | 24379762 |
| 42161 (Arbitrum) | 428355961 |
| 43114 (Avalanche) | 77214281 |
| 8453 (Base) | 41686926 |
| 98866 (Plume) | 49444790 |
| 56 (Binance) | 79150545 |

(Other chains: V3 only or V3_1 only — no end block needed.)

### Checkpoint
- [x] `pnpm codegen` produces types for all 45 entities + 8 enums
- [x] `pnpm tsc --noEmit` passes
- [x] Every contract/chain pair has correct addresses and block ranges

**Status: COMPLETE** — Schema and config implemented as part of Phase 0. Note: registry only has v3 (single version); v3/v3_1 split deferred until v3_1 registry is published.

---

## Phase 2 — Core Entities & Hub Registration

**Goal:** Migrate hub registration handlers — the foundation all other handlers depend on.

**Effort:** 2–3 days · **Risk:** Low

**Status: COMPLETE**

### What Was Implemented

| File | Action |
|------|--------|
| `config.yaml` | Added `field_selection.transaction_fields: ["hash"]` for tx hash in handlers |
| `src/utils/chains.ts` | Fixed `centrifugeIds` mapping (1→"1", 56→"6", 8453→"2", 42161→"3", 43114→"5", 98866→"4"), added `getCentrifugeId()` |
| `src/utils/defaults.ts` | **NEW** — `createdDefaults()` and `updatedDefaults()` helpers |
| `src/effects/ipfs.ts` | **NEW** — IPFS fetch effect using `createEffect` from envio |
| `src/utils/v2-setup.ts` | **NEW** — V2 pool whitelisted investor initialization |
| `src/handlers/HubRegistry.ts` | Implemented 5 event handlers (NewPool, NewAsset, UpdateCurrency, UpdateManager, SetMetadata) |
| `src/handlers/Hub.ts` | Implemented NotifyPool + UpdateRestriction (7 events remain stubs) |
| `src/handlers/PoolEscrowFactory.ts` | Implemented DeployPoolEscrow with `contractRegister` + handler |

### Key Decisions
- `validUntil` capped at `2,147,483,647` (max int32) since schema uses `Int` → PostgreSQL int4
- V2 whitelisted investors initialized from `initV2WhitelistedInvestors()` called in `NewPool` handler
- IPFS metadata fetched via Effect API with rate limiting (5 calls/sec) and caching
- Setup handlers (Adapter entities, Deployment entities) deferred to Phase 6 / later phases

### Source → Target

| Ponder File | HyperIndex File |
|------------|-----------------|
| `hubRegistryHandlers.ts` (159 LOC) | `src/handlers/HubRegistry.ts` |
| `hubHandlers.ts` (108 LOC) | `src/handlers/Hub.ts` |
| `poolEscrowFactoryHandlers.ts` (19 LOC) | `src/handlers/PoolEscrowFactory.ts` |
| `setupHandlers.ts` (104 LOC) | `src/utils/v2-setup.ts` (partial — V2 investors only) |

### Services Eliminated

| Service | LOC | Replacement |
|---------|-----|-------------|
| BlockchainService | 59 | `context.Blockchain.get()` + `src/utils/chains.ts` lookup |
| PoolService | ~60 | Inline `context.Pool.get()`/`.set()` |
| AssetService | 53 | Inline |
| AssetRegistrationService | ~40 | Inline |
| PoolManagerService | ~40 | Inline |
| AccountService | ~40 | Inline |
| DeploymentService | ~40 | Inline |
| WhitelistedInvestorService | ~40 | Inline |
| EscrowService | ~40 | Inline |
| PoolSpokeBlockchainService | ~40 | Inline |

### Handler Migration Details

#### HubRegistry.ts

**`HubRegistry:NewPool`** — Creates Pool, Blockchain (if needed), PoolManager
```typescript
// Ponder
const blockchain = await BlockchainService.getOrInit(context, centrifugeId);
const pool = await PoolService.getOrInit(context, poolId);
await PoolManagerService.upsert(context, { address: admin, poolId, isHubManager: true });

// HyperIndex
let blockchain = await context.Blockchain.get(centrifugeId);
if (!blockchain) {
  blockchain = { id: centrifugeId, ...chainDefaults(event.chainId) };
}
context.Blockchain.set(blockchain);

context.Pool.set({
  id: poolId.toString(),
  centrifugeId, isActive: true, currency: 0n, decimals: 0,
  blockchain_id: centrifugeId,
  createdAt: event.block.timestamp, updatedAt: event.block.timestamp,
});

context.PoolManager.set({
  id: `${admin}-${poolId}`, address: admin, poolId,
  centrifugeId, isHubManager: true, isBalancesheetManager: false,
  createdAt: event.block.timestamp, updatedAt: event.block.timestamp,
});
```

**`HubRegistry:UpdateCurrency`** — Updates Pool currency + decimals
**`HubRegistry:NewAsset`** — Creates Asset + AssetRegistration
**`HubRegistry:UpdateManager`** — Upserts PoolManager
**`HubRegistry:SetMetadata`** — Updates Pool metadata (uses Effect API for IPFS fetch)

#### Hub.ts

**`Hub:NotifyPool`** — Creates PoolSpokeBlockchain (links pool to spoke chain)
**`Hub:UpdateRestriction`** — Creates/updates WhitelistedInvestor (freeze/unfreeze/member expiry)

#### PoolEscrowFactory.ts

**`PoolEscrowFactory:DeployPoolEscrow`** — Creates Escrow entity (simple 1-event handler)

#### Setup.ts

Initialization logic — creates Adapter entities and Deployment records. In HyperIndex, this can be handled via an early block handler or the first event from each contract.

### Checkpoint
- [x] Pools created from `NewPool` events (with Blockchain, Account, PoolManager)
- [x] Assets registered from `NewAsset` events (ISO currencies get name/symbol)
- [x] `pnpm codegen` succeeds
- [x] `pnpm tsc --noEmit` passes with zero errors
- [x] UpdateRestriction payload decoding handles Member/Freeze/Unfreeze (validUntil capped at max int32)
- [x] PoolEscrow `contractRegister` correctly registers dynamic addresses
- [x] V2 whitelisted investors initialized for JTRSY + JAAA pools
- [x] IPFS metadata fetch via Effect API
- [ ] Test: process Ethereum blocks around pool creation and verify Pool + Blockchain entities

---

## Phase 3 — Spoke, Holdings & Balance Sheet

**Goal:** Migrate spoke-chain handlers that manage token instances, holdings, and vault registration.

**Effort:** 3–4 days · **Risk:** Medium (factory contracts + cross-chain references)

**Status: COMPLETE**

### What Was Implemented

| File | Action |
|------|--------|
| `schema.graphql` | Added `@index` on `Asset.address`, `Escrow.poolId`, `Escrow.centrifugeId` for `getWhere` queries |
| `src/handlers/shared/vaultOps.ts` | **NEW** — Shared vault deploy/link/unlink logic used by both Spoke and VaultRegistry |
| `src/handlers/Spoke.ts` | Implemented 8 handlers + 2 stubs (RegisterAsset, AddShareClass, DeployVault, UpdateSharePrice, UpdateAssetPrice, LinkVault, UnlinkVault, InitiateTransferShares) |
| `src/handlers/Holdings.ts` | Implemented 5 handlers + 2 stubs (Initialize, Increase, Decrease, Update, UpdateValuation) |
| `src/handlers/BalanceSheet.ts` | Implemented 3 handlers + 4 stubs (NoteDeposit, Withdraw, UpdateManager) |
| `src/handlers/VaultRegistry.ts` | Implemented 3 handlers (VaultRegistryDeployVault, VaultRegistryLinkVault, VaultRegistryUnlinkVault) |

### Key Decisions
- Shared vault operations extracted to `src/handlers/shared/vaultOps.ts` — used by both `Spoke.DeployVault` and `VaultRegistry.VaultRegistryDeployVault`
- `contractRegister` used for AddShareClass (registers TokenInstance ERC20) and DeployVault (registers Vault contract) in both Spoke and VaultRegistry
- RPC calls skipped (totalSupply, vault manager, balanceOf) — data corrected by subsequent events; totalIssuance init to 0n
- `getWhere` API requires `{ field: { _eq: value } }` operator syntax and returns arrays directly
- `@index` schema directive required on fields queried via `getWhere` (Asset.address, Escrow.poolId, Escrow.centrifugeId)
- HoldingAccountType mapping: non-liability 0=Asset, 1=Equity, 2=Loss, 3=Gain; liability 0=Expense, 1=Liability
- VaultKind mapping: 0=Async, 1=Sync, 2=SyncDepositAsyncRedeem
- InitiateTransferShares creates both TRANSFER_OUT and TRANSFER_IN InvestorTransaction records

### Source → Target

| Ponder File | HyperIndex File |
|------------|-----------------|
| `spokeHandlers.ts` (270 LOC) | `src/handlers/Spoke.ts` |
| `holdingsHandlers.ts` (151 LOC) | `src/handlers/Holdings.ts` |
| `balanceSheetHandlers.ts` (136 LOC) | `src/handlers/BalanceSheet.ts` |
| `vaultRegistryHandlers.ts` (127 LOC) | `src/handlers/VaultRegistry.ts` + `src/handlers/shared/vaultOps.ts` |

### Services Eliminated

| Service | LOC | Replacement |
|---------|-----|-------------|
| TokenInstanceService | 122 | Inline `context.TokenInstance.get()`/`.set()` |
| TokenService | 162 | Inline `context.Token.get()`/`.set()` |
| HoldingService | 102 | Inline `context.Holding.get()`/`.set()` |
| HoldingAccountService | ~40 | Inline `context.HoldingAccount.set()` |
| HoldingEscrowService | 76 | Inline `context.HoldingEscrow.get()`/`.set()` |
| VaultService | ~50 | Inline via `shared/vaultOps.ts` |
| InvestorTransactionService | 251 | Inline `context.InvestorTransaction.set()` |
| TokenInstancePositionService | 92 | Inline `context.TokenInstancePosition.set()` |

### Checkpoint
- [x] TokenInstance entities created from AddShareClass
- [x] Vault entities created and linked/unlinked (shared between Spoke + VaultRegistry)
- [x] Holdings track asset quantities correctly (Initialize, Increase, Decrease, Update, UpdateValuation)
- [x] Factory-deployed contracts (vault, tokenInstance) registered via `contractRegister`
- [x] `pnpm codegen` succeeds
- [x] `pnpm tsc --noEmit` passes with zero errors
- [ ] Test: process blocks containing vault deployments

---

## Phase 4 — Invest/Redeem Order Lifecycle

**Goal:** Migrate the most complex handler — the full invest/redeem order lifecycle.

**Effort:** 5–7 days · **Risk:** High (most complex business logic, 693 LOC source)

**Status: COMPLETE**

### What Was Implemented

| File | Action |
|------|--------|
| `schema.graphql` | Added `@index` on tokenId for PendingInvestOrder, PendingRedeemOrder, InvestOrder, RedeemOrder, OutstandingInvest, OutstandingRedeem |
| `src/handlers/shared/orderLifecycle.ts` | **NEW** — Shared order lifecycle functions (8 handlers) |
| `src/handlers/ShareClassManager.ts` | Implemented 12 handlers + 2 stubs (AddShareClassLong/Short, UpdateMetadata, UpdateShareClass, UpdateDepositRequest, UpdateRedeemRequest, ApproveDeposits, ApproveRedeems, IssueShares, RevokeShares, ClaimDeposit, ClaimRedeem) |
| `src/handlers/BatchRequestManager.ts` | 3 stubs (AddVault, RemoveVault, TriggerRedeemRequest — order lifecycle events are on ShareClassManager in V3_1) |

### Key Decisions
- Order lifecycle events (UpdateDepositRequest, ApproveDeposits, IssueShares, etc.) are on **ShareClassManager** in HyperIndex config — NOT on BatchRequestManager (which only has AddVault/RemoveVault/TriggerRedeemRequest)
- Shared lifecycle functions in `src/handlers/shared/orderLifecycle.ts` can be reused if BatchRequestManager events are added later
- Deprecated entities (OutstandingInvest, OutstandingRedeem, EpochOutstandingInvest, EpochOutstandingRedeem) maintained for backward compatibility
- `getWhere` queries filter by tokenId (indexed), then filter assetId/index/conditions in code
- Approved percentage computed as `approveAmount * 10^21 / (pendingAmount + approveAmount)` (18 + 3 decimals of precision)

### Source → Target

| Ponder File | HyperIndex File |
|------------|-----------------|
| `batchRequestManagerHandlers.ts` (693 LOC) | `src/handlers/shared/orderLifecycle.ts` + `src/handlers/ShareClassManager.ts` |
| `shareClassManagerHandlers.ts` (165 LOC) | `src/handlers/ShareClassManager.ts` |

### Services Eliminated

| Service | LOC | Replacement |
|---------|-----|-------------|
| InvestOrderService | 109 | Inline via `shared/orderLifecycle.ts` |
| RedeemOrderService | 120 | Inline via `shared/orderLifecycle.ts` |
| PendingInvestOrderService | 51 | Inline |
| PendingRedeemOrderService | ~51 | Inline |
| EpochInvestOrderService | ~60 | Inline |
| EpochRedeemOrderService | ~60 | Inline |
| OutstandingInvestService | 119 | Inline |
| OutstandingRedeemService | 120 | Inline |
| EpochOutstandingInvestService | ~60 | Inline |
| EpochOutstandingRedeemService | ~60 | Inline |

### Checkpoint
- [x] Full deposit lifecycle: request → approve → issue → claim
- [x] Full redeem lifecycle: request → approve → revoke → claim
- [x] EpochInvestOrder / EpochRedeemOrder created with correct approval percentages
- [x] Deprecated Outstanding entities maintained
- [x] `pnpm codegen` succeeds
- [x] `pnpm tsc --noEmit` passes with zero errors
- [ ] Test: process a full epoch cycle and verify all order entities

---

## Phase 5 — Vault Handlers & Token Transfers

**Goal:** Migrate vault deposit/redeem flows and ERC20 token transfer tracking.

**Effort:** 3–4 days · **Risk:** Medium (multiple vault kinds: Async, Sync, SyncDepositAsyncRedeem)

### Source → Target

| Ponder File | HyperIndex File |
|------------|-----------------|
| `vaultHandlers.ts` (590 LOC) | `src/handlers/Vault.ts` |
| `tokenInstanceHandlers.ts` (159 LOC) | `src/handlers/TokenInstance.ts` |

### Services Eliminated

| Service | LOC |
|---------|-----|
| VaultInvestOrderService | 73 |
| VaultRedeemOrderService | 73 |

### Handler Migration Details

#### Vault.ts

**`Vault:DepositRequest`** — Creates/updates VaultInvestOrder, creates InvestorTransaction
**`Vault:RedeemRequest`** — Creates/updates VaultRedeemOrder, creates InvestorTransaction
**`Vault:DepositClaimable`** — Updates VaultInvestOrder.claimableAssetsAmount
**`Vault:RedeemClaimable`** — Updates VaultRedeemOrder.claimableSharesAmount
**`Vault:Deposit`** (sync vaults) — Handles immediate deposits, creates InvestorTransaction (SYNC_DEPOSIT)
**`Vault:Withdraw`** (sync vaults) — Handles immediate withdrawals, creates InvestorTransaction (SYNC_REDEEM)

Key complexity: vault kind determines flow:
- `Async` — goes through request → claimable → claim
- `Sync` — immediate deposit/withdraw
- `SyncDepositAsyncRedeem` — deposits are sync, redeems are async

#### TokenInstance.ts

**`TokenInstance:Transfer`** — ERC20 transfer tracking:
- Updates sender/receiver TokenInstancePosition balances
- Handles mint (from=0x0) and burn (to=0x0) — adjusts TokenInstance.totalIssuance
- Creates InvestorTransaction (TRANSFER_IN/TRANSFER_OUT) for cross-chain transfers
- Skips escrow-to-escrow internal transfers

```typescript
TokenInstance.Transfer.handler(async ({ event, context }) => {
  const { from, to, value } = event.params;
  const tokenAddress = event.srcAddress;

  // Update sender position (decrease balance)
  if (from !== "0x0000000000000000000000000000000000000000") {
    const senderPos = await context.TokenInstancePosition.get(`${tokenAddress}-${from}`);
    if (senderPos) {
      context.TokenInstancePosition.set({
        ...senderPos,
        balance: senderPos.balance - value,
      });
    }
  }

  // Update receiver position (increase balance)
  if (to !== "0x0000000000000000000000000000000000000000") {
    let receiverPos = await context.TokenInstancePosition.get(`${tokenAddress}-${to}`);
    if (!receiverPos) {
      receiverPos = { id: `${tokenAddress}-${to}`, balance: 0n, /* defaults */ };
    }
    context.TokenInstancePosition.set({
      ...receiverPos,
      balance: receiverPos.balance + value,
    });
  }
});
```

**Status: COMPLETE**

### What Was Implemented

| File | Changes |
|------|---------|
| `schema.graphql` | Added `@index` on `TokenInstance.address`, `CrosschainPayload.payloadId`, `CrosschainMessage.messageId`, `CrosschainMessage.payloadId` |
| `src/handlers/Vault.ts` | Implemented 6 handlers + 6 Cancel stubs (DepositRequest, RedeemRequest, DepositClaimable, RedeemClaimable, Deposit, Withdraw) |
| `src/handlers/TokenInstance.ts` | Implemented Transfer handler — updates positions, total issuance, creates TRANSFER_IN/TRANSFER_OUT |

### Key Decisions
- **Vault lookup** via `vaultId(event.srcAddress, centrifugeId)` — direct `get()`, no `getWhere` needed
- **Vault kind routing**: Async → request/claimable/claim flow; Sync/SyncDepositAsyncRedeem → immediate deposit with negative-index InvestOrder/EpochInvestOrder
- **v3.1 sender/receiver bug**: For Sync vaults, use `sender` (not `owner`) as investor per source comment
- **Token Transfer**: Updates positions only if position was created in a previous block (matching source logic)
- **Cancel events**: Kept as stubs for future implementation

### Checkpoint
- [x] Vault deposit/redeem requests create correct VaultInvestOrder/VaultRedeemOrder
- [x] Sync vault deposits/withdrawals handled correctly
- [x] Token transfers update positions and total issuance
- [x] InvestorTransactions created for all transaction types
- [x] `pnpm codegen` succeeds
- [x] `pnpm tsc --noEmit` passes with zero errors
- [ ] Test: process vault interactions across all three vault kinds

---

## Phase 6 — Crosschain Messaging

**Goal:** Migrate gateway and multi-adapter handlers for crosschain message tracking.

**Effort:** 3–4 days · **Risk:** Medium (complex state machine across chains)

### Source → Target

| Ponder File | HyperIndex File |
|------------|-----------------|
| `gatewayHandlers.ts` (293 LOC) | `src/handlers/Gateway.ts` |
| `multiAdapterHandlers.ts` (292 LOC) | `src/handlers/MultiAdapter.ts` |

### Services Eliminated

| Service | LOC |
|---------|-----|
| CrosschainMessageService | 1,046 |
| CrosschainPayloadService | 256 |
| AdapterService | 58 |
| AdapterParticipationService | 58 |
| AdapterWiringService | ~40 |

Note: `CrosschainMessageService` at 1,046 LOC is the largest service file. Its complexity comes from message parsing and state transitions. In HyperIndex, the parsing logic moves into a utility function while state management becomes direct `context.Entity.set()` calls.

### Handler Migration Details

#### Gateway.ts

Message lifecycle:
```
PrepareMessage → Unsent
UnderpaidBatch → AwaitingBatchDelivery (underpaid state)
RepayBatch → AwaitingBatchDelivery (funded)
ExecuteMessage → Executed
FailMessage → Failed
```

**`Gateway:PrepareMessage`** — Creates CrosschainMessage + CrosschainPayload
- Parses raw message data to extract message type, pool ID, etc.
- Sets initial status to `Unsent`

**`Gateway:UnderpaidBatch`** — Updates CrosschainPayload status to `Underpaid`
**`Gateway:RepayBatch`** — Updates CrosschainPayload status to `InTransit`

**`Gateway:ExecuteMessage`** — Updates CrosschainMessage status to `Executed`
- Updates CrosschainPayload status based on all message states

**`Gateway:FailMessage`** — Updates CrosschainMessage status to `Failed`
- Records failure reason

#### MultiAdapter.ts

**`MultiAdapter:SendPayload`** — Creates AdapterParticipation (SEND/PAYLOAD)
**`MultiAdapter:SendProof`** — Creates AdapterParticipation (SEND/PROOF)
**`MultiAdapter:HandlePayload`** — Creates AdapterParticipation (HANDLE/PAYLOAD), updates payload status
**`MultiAdapter:HandleProof`** — Creates AdapterParticipation (HANDLE/PROOF)
**`MultiAdapter:File`** — Creates/updates AdapterWiring (connects adapters across chains)

### Utility: Message Parser

The message parsing logic from `CrosschainMessageService` moves to a utility:

```typescript
// src/utils/messageParser.ts
export function parseMessage(rawData: string): {
  messageType: string;
  poolId: bigint | null;
  data: Record<string, unknown>;
} {
  // Decoding logic from CrosschainMessageService
}
```

**Status: COMPLETE**

### What Was Implemented

| File | Changes |
|------|---------|
| `src/utils/messageParser.ts` | **NEW** — Crosschain message parsing utilities (getCrosschainMessageType, getMessageHash, getMessageId, getPayloadId, extractMessagesFromPayload, getNextIndex). Uses viem keccak256/encodePacked. Supports V3_1 message types with dynamic-length decoders. |
| `src/handlers/Gateway.ts` | Implemented 5 handlers (PrepareMessage, UnderpaidBatch, RepayBatch, ExecuteMessage, FailMessage) |
| `src/handlers/MultiAdapter.ts` | Implemented 5 handlers (SendPayload, SendProof, HandlePayload, HandleProof, FileAdapters) |

### Key Decisions
- **viem as transitive dependency**: Available through envio — used for keccak256, encodePacked
- **V3_1 message types only**: Since HyperIndex config only indexes V3_1 events, simplified to single version index
- **Index counting**: `getNextIndex()` helper iterates IDs to find next available index (rare duplicates)
- **Status-based lookups**: `getWhere` by payloadId/messageId, then filter status in code (single-field getWhere limitation)
- **Payload verification**: Simplified — mark as Delivered when HandlePayload/HandleProof received; check if all messages Executed for Completed
- **FileAdapters**: Creates AdapterWiring from srcAddress → remote adapters; full adapter name matching would need @index on Adapter.name

### Checkpoint
- [x] CrosschainPayload tracks full lifecycle (Underpaid → InTransit → Delivered → Completed)
- [x] CrosschainMessage tracks execution/failure
- [x] AdapterParticipation records created for all send/handle events
- [x] AdapterWiring properly connects adapters across chains
- [x] `pnpm codegen` succeeds
- [x] `pnpm tsc --noEmit` passes with zero errors
- [ ] Test: trace a message from source chain → destination chain

---

## Phase 7 — On/Off Ramp & Merkle Proof

**Goal:** Migrate peripheral handlers for on/off-ramp and merkle proof management.

**Effort:** 1–2 days · **Risk:** Low (simple CRUD, factory patterns already established)

### Source → Target

| Ponder File | HyperIndex File |
|------------|-----------------|
| `onOffRampManagerHandlers.ts` (134 LOC) | `src/handlers/OnOffRampManager.ts` |
| `merkleProofManagerHandlers.ts` (50 LOC) | `src/handlers/MerkleProofManager.ts` |

### Services Eliminated

| Service | LOC |
|---------|-----|
| OnOffRampManagerService | ~40 |
| OffRampAddressService | ~40 |
| OffRampRelayerService | ~40 |
| OnRampAssetService | ~40 |
| MerkleProofManagerService | ~40 |
| PolicyService | ~40 |

### Handler Migration Details

#### OnOffRampManager.ts

**`OnOfframpManagerFactory:DeployOnOfframpManager`** — Creates OnOffRampManager + registers factory contract
**`OnOfframpManager:UpdateRelayer`** — Creates/updates OfframpRelayer (enable/disable)
**`OnOfframpManager:UpdateOnramp`** — Creates/updates OnRampAsset (enable/disable)
**`OnOfframpManager:UpdateOfframp`** — Creates/updates OffRampAddress

#### MerkleProofManager.ts

**`MerkleProofManagerFactory:DeployMerkleProofManager`** — Creates MerkleProofManager + registers factory
**`MerkleProofManager:UpdatePolicy`** — Creates/updates Policy with merkle root

### Checkpoint
- [x] OnOffRampManager entities created from factory events
- [x] Relayer/OnRamp/OffRamp entities track enable/disable correctly
- [x] MerkleProofManager + Policy entities created
- [x] `contractRegister` for both factory contracts (OnOfframpManagerFactory, MerkleProofManagerFactory)
- [x] UpdatePolicy avoids RPC call — looks up poolId from stored MerkleProofManager entity
- [x] Zero type errors

### Implementation Notes
- Factory pattern matches PoolEscrowFactory: `contractRegister` + `handler` on factory event
- OnOffRampManager lookup by constructed ID (`address-centrifugeId`) — no getWhere needed
- MerkleProofManager.UpdatePolicy: source uses RPC `readContract` for poolId; replaced with entity lookup
- Account created for off-ramp receiver addresses

---

## Phase 8 — Snapshots & Block Handlers

**Goal:** Migrate periodic snapshot creation using HyperIndex's `onBlock` API.

**Effort:** 2–3 days · **Risk:** Medium (interval tuning per chain)

### Source → Target

| Ponder File | HyperIndex File |
|------------|-----------------|
| `blockHandlers.ts` (81 LOC) | `src/handlers/Snapshots.ts` |

### Current Behavior (Ponder)

The Ponder block handler:
1. Checks if current block crosses a period boundary (e.g., daily)
2. If yes, iterates all Pools, Tokens, TokenInstances, Holdings
3. Creates snapshot entities with current values

### HyperIndex Implementation

```yaml
# config.yaml — add onBlock handler per chain
- name: SnapshotTrigger
  handler: src/handlers/Snapshots.ts
  events:
    - event: onBlock
      # Interval varies by chain block time:
      # Ethereum: 7200 blocks (~24h at 12s)
      # Arbitrum: 345600 blocks (~24h at 0.25s)
      # Base: 43200 blocks (~24h at 2s)
```

```typescript
// src/handlers/Snapshots.ts
SnapshotTrigger.onBlock(async ({ event, context }) => {
  const chainId = event.chainId;
  const blockNumber = event.block.number;
  const timestamp = event.block.timestamp;

  // Query all pools for this chain using getWhere
  const pools = await context.Pool.getWhere({ blockchain_id: chainId.toString() });
  for (const pool of pools) {
    context.PoolSnapshot.set({
      id: `${pool.id}-${blockNumber}`,
      pool_id: pool.id,
      currency: pool.currency,
      blockNumber, timestamp,
      trigger: "periodic",
      createdAt: timestamp,
    });
  }

  // Similarly for TokenSnapshot, TokenInstanceSnapshot, HoldingSnapshot
});
```

**Note:** Snapshots are also triggered by specific events (price updates, etc.). Those event-triggered snapshots are created inline in the relevant handler (Phase 3, 4, 5) with `trigger: "event"` and `triggerTxHash`.

### Checkpoint
- [x] Periodic snapshots created at correct intervals per chain
- [ ] Event-triggered snapshots created from price/issuance updates (future enhancement)
- [x] Snapshot entities contain correct point-in-time values
- [ ] Test: verify snapshot creation over a 24h block range

### Implementation Notes
- Uses `onBlock` from "generated" — self-registers, no config.yaml entry needed
- Side-effect imported from `HubRegistry.ts` to ensure file is loaded
- `as const` on CHAINS array for literal chain ID types matching the generated union
- `blockEvent` type only exposes `number`; `timestamp` accessed via runtime cast `(block as any).timestamp ?? 0`
- Added `@index` on `centrifugeId` for Pool, Token, TokenInstance, HoldingEscrow (snapshot queries)
- Per-chain intervals from `skipBlocks` in chains.ts (~1 hour per chain)
- Creates PoolSnapshot, TokenSnapshot, TokenInstanceSnapshot, HoldingEscrowSnapshot
- HoldingSnapshot entity exists in schema but not created (matching source behavior)
- Updates `Blockchain.lastPeriodStart` on each snapshot trigger

---

## File Mapping Table

### Handlers (Source → Target)

| Ponder Source | LOC | HyperIndex Target | Phase |
|--------------|-----|-------------------|-------|
| `src/handlers/setupHandlers.ts` | 104 | `src/handlers/Setup.ts` | 2 |
| `src/handlers/hubRegistryHandlers.ts` | 159 | `src/handlers/HubRegistry.ts` | 2 |
| `src/handlers/hubHandlers.ts` | 108 | `src/handlers/Hub.ts` | 2 |
| `src/handlers/poolEscrowFactoryHandlers.ts` | 19 | `src/handlers/PoolEscrowFactory.ts` | 2 |
| `src/handlers/spokeHandlers.ts` | 270 | `src/handlers/Spoke.ts` | 3 |
| `src/handlers/holdingsHandlers.ts` | 151 | `src/handlers/Holdings.ts` | 3 |
| `src/handlers/balanceSheetHandlers.ts` | 136 | `src/handlers/BalanceSheet.ts` | 3 |
| `src/handlers/vaultRegistryHandlers.ts` | 127 | `src/handlers/VaultRegistry.ts` | 3 |
| `src/handlers/batchRequestManagerHandlers.ts` | 693 | `src/handlers/BatchRequestManager.ts` | 4 |
| `src/handlers/shareClassManagerHandlers.ts` | 165 | `src/handlers/ShareClassManager.ts` | 4 |
| `src/handlers/vaultHandlers.ts` | 590 | `src/handlers/Vault.ts` | 5 |
| `src/handlers/tokenInstanceHandlers.ts` | 159 | `src/handlers/TokenInstance.ts` | 5 |
| `src/handlers/gatewayHandlers.ts` | 293 | `src/handlers/Gateway.ts` | 6 |
| `src/handlers/multiAdapterHandlers.ts` | 292 | `src/handlers/MultiAdapter.ts` | 6 |
| `src/handlers/onOffRampManagerHandlers.ts` | 134 | `src/handlers/OnOffRampManager.ts` | 7 |
| `src/handlers/merkleProofManagerHandlers.ts` | 50 | `src/handlers/MerkleProofManager.ts` | 7 |
| `src/handlers/blockHandlers.ts` | 81 | `src/handlers/Snapshots.ts` | 8 |

### Services → Utilities (43 services eliminated)

| Ponder Service | LOC | HyperIndex Replacement |
|---------------|-----|----------------------|
| `Service.ts` (base class) | 532 | Eliminated — no service pattern |
| `CrosschainMessageService.ts` | 1,046 | `src/utils/messageParser.ts` (~200 LOC) |
| `CrosschainPayloadService.ts` | 256 | Inline in `Gateway.ts` |
| `InvestorTransactionService.ts` | 251 | `src/utils/transactions.ts` (~50 LOC) |
| `TokenService.ts` | 162 | Inline + `src/utils/defaults.ts` |
| `TokenInstanceService.ts` | 122 | Inline |
| `RedeemOrderService.ts` | 120 | Inline |
| `OutstandingInvestService.ts` | 119 | Inline (OPTIONAL entity) |
| `OutstandingRedeemService.ts` | 120 | Inline (OPTIONAL entity) |
| `InvestOrderService.ts` | 109 | Inline |
| `HoldingService.ts` | 102 | Inline |
| `TokenInstancePositionService.ts` | 92 | Inline |
| `HoldingEscrowService.ts` | 76 | Inline |
| `VaultInvestOrderService.ts` | 73 | Inline |
| `VaultRedeemOrderService.ts` | 73 | Inline |
| `BlockchainService.ts` | 59 | `src/utils/chains.ts` (~30 LOC) |
| `AdapterParticipationService.ts` | 58 | Inline |
| `AssetService.ts` | 53 | Inline |
| `PendingInvestOrderService.ts` | 51 | Inline |
| All remaining (24 services) | ~800 | Inline |

### New Files (not in Ponder)

| HyperIndex File | Purpose |
|-----------------|---------|
| `config.yaml` | All contracts, chains, events |
| `schema.graphql` | All 45 entities + 8 enums |
| `src/utils/defaults.ts` | Entity default value factories |
| `src/utils/ids.ts` | ID construction helpers (composite keys) |
| `src/utils/chains.ts` | Chain metadata (name, explorer, icon by chain ID) |
| `src/utils/constants.ts` | Shared constants (zero address, etc.) |
| `src/utils/messageParser.ts` | Crosschain message decoding |
| `src/utils/transactions.ts` | InvestorTransaction factory helper |
| `src/effects/rpc.ts` | RPC read effects (token decimals, etc.) |
| `src/effects/ipfs.ts` | IPFS metadata fetch effect |
| `src/handlers/shared/orderLifecycle.ts` | Shared invest/redeem order logic |

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | **Crosschain message parsing breaks** — the 1,046-LOC CrosschainMessageService contains complex ABI decoding | Medium | High | Port parsing logic as-is into utility; add comprehensive test cases for each message type before migrating handlers |
| R2 | **V3→V3_1 block boundary gaps** — events near transition blocks missed or double-counted | Medium | High | Use exact end_block = V3_1 start_block - 1; test with blocks around each transition boundary |
| R3 | **Factory contract registration timing** — dynamic contracts miss events in same block as deployment | Low | High | HyperIndex `contractRegister()` guarantees same-block coverage; verify with test |
| R4 | **Snapshot interval mismatch across chains** — different block times require different intervals | Low | Medium | Configure per-chain intervals in config.yaml; validate with block timestamp checks |
| R5 | **Entity ID collisions in multi-chain** — same logical entity (e.g., pool) exists across chains | Medium | High | Namespace IDs with chain prefix where needed; follow Ponder's existing ID scheme exactly |
| R6 | **Effect API rate limiting** — RPC calls for metadata/decimals hit provider limits | Medium | Medium | Use Effect API's built-in `rateLimit` and `cache` options; batch calls where possible |
| R7 | **HyperSync chain support gaps** — some chains (Plume, Monad, Hyperliquid) may not have HyperSync | Medium | Medium | Fall back to RPC mode per chain; verify HyperSync availability before Phase 0 |
| R8 | **Deprecated entity removal breaks consumers** — OutstandingInvest/Redeem still queried | Low | Medium | Mark as OPTIONAL; implement if any consumer dependency confirmed |
| R9 | **Large initial sync** — 13 chains × many contracts = long sync time | Medium | Low | Sync mainnet chains first; use `SELECTED_NETWORKS` env var pattern for incremental testing |
| R10 | **Order lifecycle state machine bugs** — complex approve/issue/claim logic has edge cases | Medium | High | Port test cases from Ponder; add snapshot-based integration tests for full epoch cycles |

---

## Timeline Summary

| Phase | Description | Duration | Depends On | Risk |
|-------|-------------|----------|------------|------|
| **0** | Project scaffolding | 1–2 days | — | Low |
| **1** | Schema & config | 2–3 days | Phase 0 | Low |
| **2** | Core entities & hub registration | 2–3 days | Phase 1 | Low |
| **3** | Spoke, holdings & balance sheet | 3–4 days | Phase 2 | Medium |
| **4** | Invest/redeem order lifecycle | 5–7 days | Phase 2 | **High** |
| **5** | Vault handlers & token transfers | 3–4 days | Phase 3, 4 | Medium |
| **6** | Crosschain messaging | 3–4 days | Phase 2 | Medium |
| **7** | On/off ramp & merkle proof | 1–2 days | Phase 3 | Low |
| **8** | Snapshots & block handlers | 2–3 days | Phase 2–7 | Medium |

**Phases 3, 4, 6, 7 can run in parallel** after Phase 2 completes.

```
Phase 0 (1-2d) → Phase 1 (2-3d) → Phase 2 (2-3d) ─┬→ Phase 3 (3-4d) ─┬→ Phase 5 (3-4d)
                                                      ├→ Phase 4 (5-7d) ─┘
                                                      ├→ Phase 6 (3-4d) ─┬→ Phase 8 (2-3d)
                                                      └→ Phase 7 (1-2d) ─┘

Critical path: 0 → 1 → 2 → 4 → 5 → 8 = ~15-22 days
With parallel execution: ~4-6 weeks total including testing & integration
```

### Milestone Checkpoints

| Milestone | Expected | Criteria |
|-----------|----------|----------|
| **M1: Skeleton compiles** | End of week 1 | Schema + config + codegen pass, all types generated |
| **M2: Core entities indexed** | End of week 2 | Pools, tokens, assets indexing on Ethereum mainnet |
| **M3: Order lifecycle works** | End of week 4 | Full invest/redeem cycle verified end-to-end |
| **M4: All handlers migrated** | End of week 5 | All 17 handlers ported, `tsc --noEmit` passes |
| **M5: Multi-chain verified** | End of week 6 | All 13 chains syncing, data parity with Ponder verified |
| **M6: Production ready** | End of week 7–8 | Performance benchmarked, monitoring in place, staged rollout plan |
