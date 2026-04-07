# Envio vs Ponder API Comparison Report
> Generated: 2026-04-07 | Envio: localhost:8080 | Ponder: api.centrifuge.io

## Final Scoreboard

| Entity | Ponder | Envio | Match | Notes |
|---|---|---|---|---|
| **Pools** | 18 | **18** | **100%** | All fields match |
| **Tokens** | 24 | **24** | **100%** | name/symbol/decimals all populated |
| **Token totalIssuance** | ~22 with values | **5** | ~23% | IssueShares tracks it; ERC20 mints pre-registration missed |
| **Vaults** | 54 | **54** | **100%** | kind + status match |
| **Vault Linked** | 47 | **47** | **100%** | |
| **Vault maxReserve** | 54 | **54** | **100%** | Initialized to max uint128 |
| **PoolManagers** | 177 | **177** | **100%** | |
| **WhitelistedInvestors** | 195 | **195** | **100%** | validUntil in ms |
| **InvestorTransactions** | 16K+ | **1,316** | ~8% | All 13 types present; gap from missed ERC20 transfers |
| **CrosschainPayloads** | ~4K | **4,039** | ~100% | 190 Completed (improving) |
| **HoldingEscrows** | 97 | **28** | 29% | 69 missing = Arbitrum pool escrow not deployed |
| **Holdings** | 2 | **0** | 0% | Arbitrum pool only |

## Journey: Before → After

| Metric | Starting Point | Final State | Improvement |
|---|---|---|---|
| Pools | 13 | **18** | +38% |
| Tokens | 10 | **24** | +140% |
| Token name populated | 5/24 | **24/24** | +380% |
| Token decimals populated | 4/24 | **24/24** | +500% |
| Token totalIssuance > 0 | 0/24 | **5/24** | New |
| Vaults | 34 | **54** | +59% |
| Vault Linked status | 2/54 | **47/54** | +2250% |
| Vault maxReserve set | 3/54 | **54/54** | +1700% |
| WhitelistedInvestors | 94 | **195** | +107% |
| InvestorTransaction types | 4 | **13** | All types |
| InvestorTransactions | 630 | **1,316** | +109% |
| Chains indexed | 6 | **9** | +50% |
| Stub handlers | 14 | **0** | All implemented |

## What Was Fixed (8 commits)

1. **All 30+ stub handlers implemented** — crosschainInProgress, maxReserve, cancel events, etc.
2. **tokenId bytes16 normalization** — Envio pads bytes16→bytes32; added normalizeScId() across 46 handlers
3. **VaultRegistry singleton address** — Was factory contract (no address), events silently dropped
4. **SyncManager contract** — New handler for SetMaxReserve spoke-side event
5. **3 new chains** — Optimism, Hyperliquid, Monad with full contract configs
6. **V3.1 contract support** — All 7 core contracts (HubRegistry, Hub, Spoke, Gateway, BalanceSheet, Holdings, ShareClassManager) with V3.1 addresses on all 9 chains
7. **Named function handler delegation** — V3.1 events properly delegate to V3 handler logic
8. **6 data gap fixes** — maxReserve init, validUntil ms, token metadata preservation, crosschain completion, crosschainInProgress ordering, totalIssuance in IssueShares/RevokeShares

## Remaining Known Gaps

### Token totalIssuance (19/24 still zero)
- **Root cause**: ERC20 Transfer events (mint/burn) for tokens registered via contractRegister miss events that occurred BEFORE the registration block. Envio's "same-block coverage" doesn't help when the token was deployed in an earlier block than AddShareClass.
- **Impact**: Medium — totalIssuance is used for TVL calculations and display
- **Fix options**: (a) Read totalSupply via RPC effect on AddShareClass, (b) Track via BalanceSheet.Issue events (already done), (c) Accept that only IssueShares-tracked issuance is captured

### HoldingEscrow count gap (28/97)
- **Root cause**: 69 missing records are for Arbitrum pool 844424930131969. The PoolEscrow for this pool was deployed on Arbitrum but the BalanceSheet NoteDeposit/Withdraw events on Ethereum reference this pool. Without the Escrow entity for this pool+centrifugeId, the handler skips.
- **Impact**: Low-medium — affects balance sheet accounting for one pool
- **Fix**: PoolEscrow deployment may happen on a different chain than where BalanceSheet events fire

### CrosschainPayload completion rate (~5% vs ~85% in Ponder)
- **Root cause**: No cross-chain event ordering — receiver ExecuteMessage may fire before sender UnderpaidBatch, creating messages without payload links. Completion check can't find the payload.
- **Impact**: Low — status is informational, doesn't affect core protocol data
- **Fix applied**: UnderpaidBatch now links Executed messages, PrepareMessage checks completion on enrichment. Improved from 3.4% to 5%.

### Vault crosschainInProgress (12 stale values)
- **Root cause**: Hub sets CIP, Spoke clears it. Without cross-chain ordering, Hub event may arrive after Spoke already cleared. Fix checks if operation completed, but some edge cases remain.
- **Impact**: Very low — cosmetic field for UI loading states
