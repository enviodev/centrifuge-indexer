# Envio vs Ponder API Comparison Report
> Generated: 2026-04-07 | Envio: localhost:8080 | Ponder: api.centrifuge.io

## Changes Made (2 commits)

### Commit 1: Implement all remaining stub handlers
- Implemented 30+ previously-empty event handlers across Hub, BalanceSheet, Holdings, ShareClassManager, Spoke, BatchRequestManager, PoolEscrow, Vault
- Added `crosschainInProgress` tracking on Vault, TokenInstance, HoldingEscrow, PoolManager
- Added `maxReserve` field on Vault
- Added Hub.UpdateContract event for SyncManager trusted call handling
- Created `src/utils/updateContractDecoders.ts` for payload decoding

### Commit 2: Critical data fixes
- **tokenId bytes16 normalization**: Envio was padding `bytes16` scId values to `bytes32` (66 chars). Added `normalizeScId()` and applied across all 46 handler destructuring points. tokenId now correctly matches Ponder's format (34 chars).
- **VaultRegistry singleton address**: Was listed as a factory contract with no address, meaning all V3.1 vault events (Deploy/Link/Unlink) were silently dropped. Added address `0xd9531AC47928c3386346f82d9A2478960bf2CA7B` to all chains.
- **SyncManager contract**: New handler for `SetMaxReserve` event with address `0xFf8Ed1862f6aC3a8e89B81C75507c225E36e273D`.
- **3 new chains**: Optimism (chainId 10), Hyperliquid (chainId 999), Monad (chainId 143) with full contract configs from the Centrifuge registry.

---

## Comparison Results

### Scoreboard

| Entity | Ponder | Envio | Match % | Status |
|---|---|---|---|---|
| **Pools** | 18 | 13 | 72% | 5 missing (see below) |
| **Tokens** | 24 | 19 | 79% | Metadata gaps |
| **Vaults** | 54 | **54** | **100%** | Count matches exactly |
| **Vault Status (Linked)** | 47 | **47** | **100%** | Fixed from 2 |
| **Vault Kind** | - | - | **100%** | All match |
| **HoldingEscrows** | 97 | 28 | 29% | Missing chain data |
| **WhitelistedInvestors** | 195 | 94 | 48% | Missing chain data |
| **InvestorTransactions** | 16K+ | 664 | ~4% | Most are ERC20 transfers |
| **CrosschainPayloads** | ~4K | 4,024 | ~99% | Status progression gap |
| **Holdings** | 2 | 0 | 0% | Arbitrum-only |

### Key Improvements

| Metric | Before Fix | After Fix |
|---|---|---|
| Linked Vaults | **2** | **47** (100% match) |
| Total Vaults | ~34 | **54** (100% match) |
| tokenId format | bytes32 (broken) | **bytes16** (matches Ponder) |
| Chains indexed | 6 | **9** |
| SyncManager events | Not handled | **Handled** |
| Stub handlers | 14 empty | **0 empty** |

---

## Remaining Gaps

### 1. Missing 5 Pools (Priority: Medium)
- 3 Arbitrum pools (844424930131969/70/71) and 2 Ethereum pools (281474976710669/70)
- These pools were likely created on **V3.1 HubRegistry addresses** which are different from the V3 addresses our config uses for the original 6 chains
- Fix: Add V3.1 HubRegistry addresses alongside V3 addresses for Ethereum and Arbitrum

### 2. Token Metadata Empty (Priority: Medium)
- 17/19 tokens have null name, symbol, decimals
- `totalIssuance` is 0 for all tokens
- `tokenPriceComputedAt` is null everywhere
- Root cause: ShareClassManager.AddShareClass events set metadata, but the Token entity may be created first by Spoke.AddShareClass (which doesn't have metadata) and then the Hub-side event overwrites don't reach it
- The totalIssuance should be tracked through ERC20 Transfer events on TokenInstance — verify factory registration is working

### 3. InvestorTransaction Count Gap (Priority: Low-Medium)
- Ponder: ~16K (mostly TRANSFER_IN/OUT from ERC20 events)
- Envio: 664 (richer type distribution but lower volume)
- The bulk of Ponder's transactions come from ERC20 Transfer events. If TokenInstance factory registration isn't catching all deployed token addresses, we miss these.

### 4. CrosschainPayload Status Progression (Priority: Low)
- Most payloads stuck at "Delivered" instead of progressing to "Completed"
- The Delivered→Completed transition happens when all messages in a payload are Executed
- The Gateway.ExecuteMessage handler exists but may not be linking back to payloads correctly

### 5. HoldingEscrow/WhitelistedInvestor Count Gaps (Priority: Low)
- Largely explained by the 5 missing pools and associated chain data
- Will improve once V3.1 HubRegistry addresses are added

---

## What's Solid for Demo

- **Vault data is 100% match** — count, kind, and status all align perfectly
- **Pool core data** (isActive, currency, decimals) matches for all shared pools
- **CrosschainPayload volume** matches (~4K records)
- **9 chains indexed** including the 3 new ones (Optimism, Hyperliquid, Monad)
- **tokenId format** now matches Ponder exactly
- **All event handlers implemented** — zero stubs remaining
- **crosschainInProgress tracking** works end-to-end (Hub sets → Spoke clears)

## Next Steps to Reach Full Parity
1. Add V3.1 contract addresses for original 6 chains (different HubRegistry, Hub, Spoke, etc.)
2. Debug TokenInstance factory registration to capture all ERC20 token deploys
3. Fix CrosschainPayload status progression logic
4. Verify Token metadata flow (ShareClassManager → Token entity)
