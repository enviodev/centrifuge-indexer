import { BalanceSheet } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import { holdingEscrowId, poolManagerId, accountId, blockchainId } from "../utils/ids";

BalanceSheet.NoteDeposit.handler(async ({ event, context }) => {
  const { poolId, scId: tokenId, asset: assetAddress, amount, pricePoolPerAsset } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);

  // Look up asset by address
  const assets = await context.Asset.getWhere({ address: { _eq: assetAddress.toLowerCase() } });
  const asset = assets[0];
  if (!asset) {
    context.log.warn(`Asset not found for address ${assetAddress}. Cannot process NoteDeposit`);
    return;
  }
  const assetId = BigInt(asset.id);

  // Look up escrow for this pool (getWhere supports single field only)
  const escrows = await context.Escrow.getWhere({ poolId: { _eq: poolId } });
  const escrow = escrows.find((e: any) => e.centrifugeId === centrifugeId);
  if (!escrow) {
    context.log.warn(`Escrow not found for pool ${poolId}. Cannot process NoteDeposit`);
    return;
  }

  const heId = holdingEscrowId(tokenId, assetId);
  const existing = await context.HoldingEscrow.get(heId);

  const newAssetAmount = (existing?.assetAmount ?? 0n) + amount;

  context.HoldingEscrow.set({
    id: heId,
    centrifugeId,
    poolId,
    tokenId,
    assetId,
    assetAddress: assetAddress.toLowerCase(),
    assetAmount: newAssetAmount,
    assetPrice: pricePoolPerAsset,
    escrowAddress: escrow.address,
    blockchain_id: blockchainId(centrifugeId),
    holding_id: existing?.holding_id ?? undefined,
    asset_id: asset.id,
    escrow_id: existing?.escrow_id ?? escrow.id,
    ...(existing ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
});

BalanceSheet.Withdraw.handler(async ({ event, context }) => {
  const { poolId, scId: tokenId, asset: assetAddress, amount, pricePoolPerAsset } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);

  // Look up asset by address
  const assets = await context.Asset.getWhere({ address: { _eq: assetAddress.toLowerCase() } });
  const asset = assets[0];
  if (!asset) {
    context.log.warn(`Asset not found for address ${assetAddress}. Cannot process Withdraw`);
    return;
  }
  const assetId = BigInt(asset.id);

  // Look up escrow for this pool (getWhere supports single field only)
  const escrows = await context.Escrow.getWhere({ poolId: { _eq: poolId } });
  const escrow = escrows.find((e: any) => e.centrifugeId === centrifugeId);
  if (!escrow) {
    context.log.warn(`Escrow not found for pool ${poolId}. Cannot process Withdraw`);
    return;
  }

  const heId = holdingEscrowId(tokenId, assetId);
  const existing = await context.HoldingEscrow.get(heId);

  const currentAmount = existing?.assetAmount ?? 0n;
  const newAssetAmount = currentAmount > amount ? currentAmount - amount : 0n;

  context.HoldingEscrow.set({
    id: heId,
    centrifugeId,
    poolId,
    tokenId,
    assetId,
    assetAddress: assetAddress.toLowerCase(),
    assetAmount: newAssetAmount,
    assetPrice: pricePoolPerAsset,
    escrowAddress: escrow.address,
    blockchain_id: blockchainId(centrifugeId),
    holding_id: existing?.holding_id ?? undefined,
    asset_id: asset.id,
    escrow_id: existing?.escrow_id ?? escrow.id,
    ...(existing ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
});

BalanceSheet.UpdateManager.handler(async ({ event, context }) => {
  const { poolId, who: manager, canManage } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const managerAddress = manager.toLowerCase();

  // Ensure Account exists
  await context.Account.getOrCreate({
    id: accountId(manager),
    address: managerAddress,
    ...createdDefaults(event),
  });

  // Get or create PoolManager, update isBalancesheetManager
  const pmId = poolManagerId(manager, centrifugeId, poolId);
  const existing = await context.PoolManager.get(pmId);

  if (existing) {
    context.PoolManager.set({
      ...existing,
      isBalancesheetManager: canManage,
      ...updatedDefaults(event),
    });
  } else {
    context.PoolManager.set({
      id: pmId,
      address: managerAddress,
      centrifugeId,
      poolId,
      isHubManager: false,
      isBalancesheetManager: canManage,
      pool_id: poolId.toString(),
      ...createdDefaults(event),
    });
  }
});

// --- Remaining events (Phase 5+) ---
BalanceSheet.Deposit.handler(async ({ event, context }) => {});
BalanceSheet.Issue.handler(async ({ event, context }) => {});
BalanceSheet.Revoke.handler(async ({ event, context }) => {});
BalanceSheet.TransferSharesFrom.handler(async ({ event, context }) => {});
