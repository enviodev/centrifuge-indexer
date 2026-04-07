import { PoolEscrowFactory, PoolEscrow } from "generated";
import { getCentrifugeId, networkNames, explorerUrls, chainIcons } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import { escrowId, blockchainId, holdingEscrowId } from "../utils/ids";

// Register dynamically deployed PoolEscrow contracts
PoolEscrowFactory.DeployPoolEscrow.contractRegister(({ event, context }) => {
  context.addPoolEscrow(event.params.escrow);
});

PoolEscrowFactory.DeployPoolEscrow.handler(async ({ event, context }) => {
  const { poolId, escrow: escrowAddress } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const chainIdStr = event.chainId.toString();

  // Ensure Blockchain exists
  await context.Blockchain.getOrCreate({
    id: blockchainId(centrifugeId),
    centrifugeId,
    network: networkNames[chainIdStr] ?? chainIdStr,
    lastPeriodStart: undefined,
    chainId: event.chainId,
    name: networkNames[chainIdStr],
    explorer: explorerUrls[chainIdStr],
    icon: chainIcons[chainIdStr],
  });

  // Create Escrow entity
  context.Escrow.set({
    id: escrowId(escrowAddress, centrifugeId),
    address: escrowAddress.toLowerCase(),
    poolId,
    centrifugeId,
    blockchain_id: blockchainId(centrifugeId),
    ...createdDefaults(event),
  });
});

// --- PoolEscrow events ---

PoolEscrow.EscrowDeposit.handler(async ({ event, context }) => {
  const { poolId, scId: tokenId, asset: assetAddress, value } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);

  // Look up asset by address
  const assets = await context.Asset.getWhere({ address: { _eq: assetAddress.toLowerCase() } });
  const asset = assets[0];
  if (!asset) return;
  const assetId = BigInt(asset.id);

  // Look up the escrow entity for this pool
  const escrows = await context.Escrow.getWhere({ poolId: { _eq: poolId } });
  const escrow = escrows.find((e: any) => e.centrifugeId === centrifugeId);
  if (!escrow) return;

  // Increment HoldingEscrow
  const heId = holdingEscrowId(tokenId, assetId);
  const existing = await context.HoldingEscrow.get(heId);
  const newAmount = (existing?.assetAmount ?? 0n) + value;

  context.HoldingEscrow.set({
    id: heId,
    centrifugeId,
    poolId,
    tokenId,
    assetId,
    assetAddress: assetAddress.toLowerCase(),
    assetAmount: newAmount,
    assetPrice: existing?.assetPrice ?? undefined,
    escrowAddress: escrow.address,
    crosschainInProgress: existing?.crosschainInProgress ?? undefined,
    blockchain_id: blockchainId(centrifugeId),
    holding_id: existing?.holding_id ?? undefined,
    asset_id: asset.id,
    escrow_id: existing?.escrow_id ?? escrow.id,
    ...(existing ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
});

PoolEscrow.EscrowWithdraw.handler(async ({ event, context }) => {
  const { poolId, scId: tokenId, asset: assetAddress, value } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);

  // Look up asset by address
  const assets = await context.Asset.getWhere({ address: { _eq: assetAddress.toLowerCase() } });
  const asset = assets[0];
  if (!asset) return;
  const assetId = BigInt(asset.id);

  // Look up the escrow
  const escrows = await context.Escrow.getWhere({ poolId: { _eq: poolId } });
  const escrow = escrows.find((e: any) => e.centrifugeId === centrifugeId);
  if (!escrow) return;

  // Decrement HoldingEscrow
  const heId = holdingEscrowId(tokenId, assetId);
  const existing = await context.HoldingEscrow.get(heId);
  const currentAmount = existing?.assetAmount ?? 0n;
  const newAmount = currentAmount > value ? currentAmount - value : 0n;

  context.HoldingEscrow.set({
    id: heId,
    centrifugeId,
    poolId,
    tokenId,
    assetId,
    assetAddress: assetAddress.toLowerCase(),
    assetAmount: newAmount,
    assetPrice: existing?.assetPrice ?? undefined,
    escrowAddress: escrow.address,
    crosschainInProgress: existing?.crosschainInProgress ?? undefined,
    blockchain_id: blockchainId(centrifugeId),
    holding_id: existing?.holding_id ?? undefined,
    asset_id: asset.id,
    escrow_id: existing?.escrow_id ?? escrow.id,
    ...(existing ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
});
