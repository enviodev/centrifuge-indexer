# Envio vs Ponder API Comparison Report
> Generated: 2026-04-07 | Envio: localhost:8080 | Ponder: api.centrifuge.io

## Final Scoreboard

| Entity | Ponder | Envio | Match | Notes |
|---|---|---|---|---|
| **Pools** | 18 | **18** | **100%** | All fields match |
| **Tokens** | 24 | **24** | **100%** | name/symbol/decimals all populated |
| **Token totalIssuance** | ~22 | **7** | ~32% | RPC effect + IssueShares tracking |
| **Vaults** | 54 | **54** | **100%** | kind + status + maxReserve |
| **Vault Linked** | 47 | **47** | **100%** | |
| **Vault maxReserve** | 54 | **54** | **100%** | |
| **PoolManagers** | 177 | **177** | **100%** | |
| **WhitelistedInvestors** | 195 | **195** | **100%** | validUntil in ms |
| **InvestorTransactions** | 16K+ | **1,316** | ~8% | All 13 types present |
| **CrosschainPayloads** | ~4K | **4,048** | ~100% | 371 Completed (9.2%) |
| **HoldingEscrows** | 97 | **28** | 29% | 69 missing = Arbitrum pool |

## Journey: Before → After

| Metric | Starting Point | Final State | Improvement |
|---|---|---|---|
| Pools | 13 | **18** | +38% |
| Tokens (count) | 10 | **24** | +140% |
| Token name populated | 5/24 | **24/24** | +380% |
| Token totalIssuance > 0 | 0/24 | **7/24** | New |
| Vaults | 34 | **54** | +59% |
| Vault Linked | 2/54 | **47/54** | +2250% |
| Vault maxReserve | 3/54 | **54/54** | +1700% |
| WhitelistedInvestors | 94 | **195** | +107% |
| InvestorTransactions | 630 | **1,316** | +109% |
| CrosschainPayload Completed | 139 | **371** | +167% |
| Chains | 6 | **9** | +50% |
| Stub handlers | 14 | **0** | All done |

## Architecture Highlights

### Order-Independent Cross-Chain Design
HyperIndex doesn't guarantee cross-chain event ordering. Our handlers are designed to converge regardless of arrival order:

- **`tryCompletePayload()`** — shared convergence function called at every state transition (ExecuteMessage, FailMessage, PrepareMessage enrichment, UnderpaidBatch linking, HandlePayload Delivered). Checks if all messages are terminal → transitions payload to Completed.
- **Hub crosschainInProgress** — only sets flag if the Spoke hasn't already completed the operation (checks vault status / existing flag before writing)
- **UnderpaidBatch** — links to messages in ANY status (not just AwaitingBatchDelivery), and skips straight to Completed if all messages already terminal
- **Token totalIssuance** — captured via RPC effect (totalSupply read) at registration time, so we don't depend on Transfer events being captured before contractRegister

### V3 + V3.1 Multi-Version Support
Both contract versions (V3 and V3.1) are indexed simultaneously on all 9 chains:
- V3.1 contracts defined with `V3_1` suffix names and separate addresses
- Handler logic extracted into named functions, registered for both V3 and V3.1 events
- Factory contracts (Vault, TokenInstance) registered via contractRegister for both versions

## Remaining Gaps

### Token totalIssuance (17/24 still zero)
- 7 tokens now have issuance from RPC totalSupply reads + IssueShares tracking
- Remaining 17 are tokens on chains where the RPC read may have failed or the token had no supply at AddShareClass time
- Could improve with periodic totalSupply re-reads or tracking all BalanceSheet.Issue events

### CrosschainPayload completion (9.2% vs ~85%)
- Up from 3.4% with the order-independent design
- Remaining gap: many messages are created by ExecuteMessage (receiver-first) without payloadId, and UnderpaidBatch hasn't linked them yet because UnderpaidBatch fires on the sender chain which may process later
- The convergence check will complete these once UnderpaidBatch arrives and links them

### HoldingEscrow (28/97)
- 69 missing are for Arbitrum pool 844424930131969
- Root cause: PoolEscrow for this pool isn't deployed on Ethereum where BalanceSheet events fire
- The Escrow entity doesn't exist for this pool+centrifugeId combination
