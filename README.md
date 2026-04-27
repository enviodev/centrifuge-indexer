# Centrifuge Indexer

A multichain Centrifuge Protocol indexer built with [Envio HyperIndex](https://docs.envio.dev). Tracks pools, share classes, vaults, investor orders, holdings, balance sheets, and cross-chain transfers across Centrifuge's Hub-and-Spoke deployments.

## Chains (9)

`1`, `10`, `56`, `143`, `999`, `8453`, `42161`, `43114`, `98866`

## What it indexes

### Hub
- `HubRegistry` / `HubRegistryV3_1`: pool, asset, currency, manager, and metadata changes
- `Hub` / `HubV3_1`: cross-chain pool/share-class notifications, share and asset price updates, vault and restriction updates, share-hook updates, share transfers
- `MultiAdapter` / `MultiAdapterV3_1`: cross-chain message adapter configuration
- `BatchRequestManager`, `ShareClassManager`

### Spoke
- `Spoke`: pools, share classes, vault deployment and linking, asset registration, share and asset price updates, cross-chain share transfers, request manager assignment
- `Holdings` / `HoldingsV3_1`: per-pool, per-share-class holdings (initialize, increase, decrease, valuations)
- `BalanceSheet` / `BalanceSheetV3_1`: deposits, withdrawals, share issue/revoke, manager updates, share transfers
- `Gateway` / `GatewayV3_1`: prepare/execute/fail messages, batch underpayment and repayment

### Vaults and managers
- `MerkleProofManager`, `MerkleProofManagerFactory`, `OnOfframpManager`, `OnOfframpManagerFactory`, `PoolEscrow`, `PoolEscrowFactory`

## Schema

46 GraphQL entities including `Pool`, `Token`, `Vault`, `VaultInvestOrder`, `VaultRedeemOrder`, `Holding`, `Escrow`, `InvestorTransaction`, `EpochInvestOrder`, `EpochRedeemOrder`, plus tracking for outstanding orders and per-blockchain pool spokes.

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
