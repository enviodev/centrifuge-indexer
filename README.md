# Centrifuge Indexer

Centrifuge Protocol Indexer. Built with [Envio HyperIndex](https://docs.envio.dev).

## Chains

| Network | Chain ID |
|---|---|
| Ethereum Mainnet | 1 |
| Arbitrum | 42161 |
| Base | 8453 |
| Avalanche | 43114 |
| Bsc | 56 |
| Plume | 98866 |
| Optimism | 10 |
| Hyperliquid | 999 |
| Monad | 143 |

## Contracts

- **`HubRegistry`**: `NewPool`, `NewAsset`, `UpdateCurrency`, `UpdateManager`, `SetMetadata`
- **`Hub`**: `NotifyPool`, `NotifyShareClass`, `NotifyShareMetadata`, `NotifySharePrice`, `NotifyAssetPrice`, `UpdateVault`, `UpdateRestriction`, `UpdateShareHook`, `ForwardTransferShares`, `UpdateContract`
- **`Spoke`**: `AddPool`, `AddShareClass`, `DeployVault`, `RegisterAsset`, `UpdateSharePrice`, `UpdateAssetPrice`, `LinkVault`, `UnlinkVault`, `InitiateTransferShares`, `ExecuteTransferShares`, `SetRequestManager`
- **`Gateway`**: `PrepareMessage`, `ExecuteMessage`, `FailMessage`, `UnderpaidBatch`, `RepayBatch`
- **`BalanceSheet`**: `Deposit`, `Withdraw`, `NoteDeposit`, `Issue`, `Revoke`, `UpdateManager`, `TransferSharesFrom`
- **`Holdings`**: `Initialize`, `Increase`, `Decrease`, `Update`, `UpdateValuation`, `UpdateIsLiability`, `SetAccountId`
- **`ShareClassManager`**: `AddShareClassLong`, `AddShareClassShort`, `UpdateMetadata`, `UpdateShareClass`, `UpdatePricePoolPerShare`, `UpdateDepositRequest`, `UpdateRedeemRequest`, `ApproveDeposits`, `ApproveRedeems`, `IssueShares`, `RevokeShares`, `ClaimDeposit`, `ClaimRedeem`, `RemoteIssueShares`, `RemoteRevokeShares`
- **`MultiAdapter`**: `SendPayload`, `SendProof`, `HandlePayload`, `HandleProof`, `FileAdapters`
- **`MultiAdapterV3_1`**: `SendPayloadV3_1`, `HandlePayloadV3_1`
- **`PoolEscrowFactory`**: `DeployPoolEscrow`
- **`MerkleProofManagerFactory`**: `DeployMerkleProofManager`
- **`OnOfframpManagerFactory`**: `DeployOnOfframpManager`
- **`BatchRequestManager`**: `AddVault`, `RemoveVault`, `TriggerRedeemRequest`
- **`SyncMgr`**: `SetMaxReserve`
- **`HubRegistryV3_1`**: `V3_1NewPool`, `V3_1NewAsset`, `V3_1UpdateCurrency`, `V3_1UpdateManager`, `V3_1SetMetadata`
- **`HubV3_1`**: `V3_1NotifyPool`, `V3_1NotifyShareClass`, `V3_1NotifyShareMetadata`, `V3_1NotifySharePrice`, `V3_1NotifyAssetPrice`, `V3_1UpdateVault`, `V3_1UpdateRestriction`, `V3_1UpdateShareHook`, `V3_1ForwardTransferShares`, `V3_1UpdateContract`
- **`SpokeV3_1`**: `V3_1AddPool`, `V3_1AddShareClass`, `V3_1DeployVault`, `V3_1RegisterAsset`, `V3_1UpdateSharePrice`, `V3_1UpdateAssetPrice`, `V3_1LinkVault`, `V3_1UnlinkVault`, `V3_1InitiateTransferShares`, `V3_1ExecuteTransferShares`, `V3_1SetRequestManager`
- **`GatewayV3_1`**: `V3_1PrepareMessage`, `V3_1ExecuteMessage`, `V3_1FailMessage`, `V3_1UnderpaidBatch`, `V3_1RepayBatch`
- **`BalanceSheetV3_1`**: `V3_1Deposit`, `V3_1Withdraw`, `V3_1NoteDeposit`, `V3_1Issue`, `V3_1Revoke`, `V3_1BSUpdateManager`, `V3_1TransferSharesFrom`
- **`HoldingsV3_1`**: `V3_1Initialize`, `V3_1Increase`, `V3_1Decrease`, `V3_1Update`, `V3_1UpdateValuation`, `V3_1UpdateIsLiability`, `V3_1SetAccountId`
- **`ShareClassManagerV3_1`**: `V3_1AddShareClassLong`, `V3_1AddShareClassShort`, `V3_1UpdateMetadata`, `V3_1UpdateShareClass`, `V3_1UpdatePricePoolPerShare`, `V3_1UpdateDepositRequest`, `V3_1UpdateRedeemRequest`, `V3_1ApproveDeposits`, `V3_1ApproveRedeems`, `V3_1IssueShares`, `V3_1RevokeShares`, `V3_1ClaimDeposit`, `V3_1ClaimRedeem`, `V3_1RemoteIssueShares`, `V3_1RemoteRevokeShares`
- **`Vault`**: `DepositRequest`, `RedeemRequest`, `DepositClaimable`, `RedeemClaimable`, `Deposit`, `Withdraw`, `CancelDepositRequest`, `CancelDepositClaim`, `CancelDepositClaimable`, `CancelRedeemRequest`, `CancelRedeemClaim`, `CancelRedeemClaimable`
- **`PoolEscrow`**: `EscrowDeposit`, `EscrowWithdraw`
- **`OnOfframpManager`**: `UpdateRelayer`, `UpdateOnramp`, `UpdateOfframp`
- **`MerkleProofManager`**: `UpdatePolicy`
- **`TokenInstance`**: `Transfer`
- **`VaultRegistry`**: `VaultRegistryDeployVault`, `VaultRegistryLinkVault`, `VaultRegistryUnlinkVault`

## Schema entities (46)

`Blockchain`, `Deployment`, `Pool`, `PoolSpokeBlockchain`, `Token`, `Vault`, `VaultInvestOrder`, `VaultRedeemOrder`, `TokenInstance`, `TokenInstancePosition`, `PendingInvestOrder`, `InvestOrder`, `PendingRedeemOrder`, `RedeemOrder`, `EpochInvestOrder`, `EpochRedeemOrder`, `InvestorTransaction`, `WhitelistedInvestor`, `OutstandingInvest`, `OutstandingRedeem`, `EpochOutstandingInvest`, `EpochOutstandingRedeem`, `Holding`, `HoldingAccount`, `Escrow`, `HoldingEscrow`, `OnOffRampManager`, `OfframpRelayer`, `OnRampAsset`, `OffRampAddress`, `Asset`, `AssetRegistration`, `PoolManager`, `Policy`, `MerkleProofManager`, `CrosschainPayload`, `CrosschainMessage`, `Adapter`, `AdapterWiring`, `AdapterParticipation`, `Account`, `PoolSnapshot`, `TokenSnapshot`, `TokenInstanceSnapshot`, `HoldingSnapshot`, `HoldingEscrowSnapshot`

## Run locally

```bash
pnpm install
pnpm dev
```

GraphQL playground at [http://localhost:8080](http://localhost:8080) (local password: `testing`).

## Generate from `config.yaml` or `schema.graphql`

```bash
pnpm codegen
```

## Pre-requisites

- [Node.js v22+ (v24 recommended)](https://nodejs.org/en/download/current)
- [pnpm](https://pnpm.io/installation)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/)

## Resources

- [Envio docs](https://docs.envio.dev)
- [HyperIndex overview](https://docs.envio.dev/docs/HyperIndex/overview)
- [Discord](https://discord.gg/envio)
