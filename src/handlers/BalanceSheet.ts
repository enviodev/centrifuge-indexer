import { BalanceSheet, BalanceSheetV3_1 } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import {
  holdingEscrowId,
  poolManagerId,
  accountId,
  blockchainId,
  snapshotId,
  tokenId as tokenIdFn,
  investorTransactionId,
  normalizeScId,
} from "../utils/ids";

BalanceSheet.NoteDeposit.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, asset: assetAddress, amount, pricePoolPerAsset } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
    crosschainInProgress: existing?.crosschainInProgress ?? undefined,
    blockchain_id: blockchainId(centrifugeId),
    holding_id: existing?.holding_id ?? undefined,
    asset_id: asset.id,
    escrow_id: existing?.escrow_id ?? escrow.id,
    ...(existing ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Event-triggered HoldingEscrowSnapshot
  const trigger = "balanceSheet:NoteDeposit";
  context.HoldingEscrowSnapshot.set({
    id: snapshotId(`${tokenId}-${assetId}`, event.block.number, trigger),
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    trigger,
    triggerTxHash: event.transaction.hash,
    triggerChainId: event.chainId.toString(),
    tokenId,
    assetId,
    assetAmount: newAssetAmount,
    assetPrice: pricePoolPerAsset,
  });
});

BalanceSheet.Withdraw.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, asset: assetAddress, amount, pricePoolPerAsset } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
    crosschainInProgress: existing?.crosschainInProgress ?? undefined,
    blockchain_id: blockchainId(centrifugeId),
    holding_id: existing?.holding_id ?? undefined,
    asset_id: asset.id,
    escrow_id: existing?.escrow_id ?? escrow.id,
    ...(existing ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Event-triggered HoldingEscrowSnapshot
  const trigger = "balanceSheet:Withdraw";
  context.HoldingEscrowSnapshot.set({
    id: snapshotId(`${tokenId}-${assetId}`, event.block.number, trigger),
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    trigger,
    triggerTxHash: event.transaction.hash,
    triggerChainId: event.chainId.toString(),
    tokenId,
    assetId,
    assetAmount: newAssetAmount,
    assetPrice: pricePoolPerAsset,
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
      crosschainInProgress: undefined,
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
      crosschainInProgress: undefined,
      pool_id: poolId.toString(),
      ...createdDefaults(event),
    });
  }
});

// --- Deposit: Track balance sheet asset deposits (hub-side) ---

BalanceSheet.Deposit.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, asset: assetAddress, amount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  // Look up asset by address
  const assets = await context.Asset.getWhere({ address: { _eq: assetAddress.toLowerCase() } });
  const asset = assets[0];
  if (!asset) return;
  const assetId = BigInt(asset.id);

  // Look up escrow for this pool
  const escrows = await context.Escrow.getWhere({ poolId: { _eq: poolId } });
  const escrow = escrows.find((e: any) => e.centrifugeId === centrifugeId);
  if (!escrow) return;

  // Increment HoldingEscrow amount (same as NoteDeposit but without price update)
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

// --- Issue: Hub-side share issuance record ---

BalanceSheet.Issue.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, to, pricePoolPerShare, shares } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);
  const toAddress = to.toLowerCase();

  // Ensure account exists
  await context.Account.getOrCreate({
    id: accountId(toAddress),
    address: toAddress,
    ...createdDefaults(event),
  });

  // Update token price from the authoritative hub-side price
  const tId = tokenIdFn(poolId, tokenId);
  const token = await context.Token.get(tId);
  if (token) {
    context.Token.set({
      ...token,
      tokenPrice: pricePoolPerShare,
      ...updatedDefaults(event),
    });
  }

  // Create investor transaction record
  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, toAddress, "DEPOSIT_REQUEST_EXECUTED", event.transaction.hash),
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "DEPOSIT_REQUEST_EXECUTED",
    account: toAddress,
    epochIndex: undefined,
    tokenAmount: shares,
    currencyAmount: undefined,
    tokenPrice: pricePoolPerShare,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: toAddress,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: undefined,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tId,
    currencyAsset_id: undefined,
    ...createdDefaults(event),
  });
});

// --- Revoke: Hub-side share revocation record ---

BalanceSheet.Revoke.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, from, pricePoolPerShare, shares } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);
  const fromAddress = from.toLowerCase();

  // Ensure account exists
  await context.Account.getOrCreate({
    id: accountId(fromAddress),
    address: fromAddress,
    ...createdDefaults(event),
  });

  // Update token price
  const tId = tokenIdFn(poolId, tokenId);
  const token = await context.Token.get(tId);
  if (token) {
    context.Token.set({
      ...token,
      tokenPrice: pricePoolPerShare,
      ...updatedDefaults(event),
    });
  }

  // Create investor transaction record
  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, fromAddress, "REDEEM_REQUEST_EXECUTED", event.transaction.hash),
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "REDEEM_REQUEST_EXECUTED",
    account: fromAddress,
    epochIndex: undefined,
    tokenAmount: shares,
    currencyAmount: undefined,
    tokenPrice: pricePoolPerShare,
    transactionFee: undefined,
    fromAccount: fromAddress,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: undefined,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tId,
    currencyAsset_id: undefined,
    ...createdDefaults(event),
  });
});

// --- TransferSharesFrom: Hub-side cross-chain share transfer ---

BalanceSheet.TransferSharesFrom.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, from, to, amount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);
  const fromAddress = from.toLowerCase();
  const toAddress = to.toLowerCase();

  // Ensure accounts exist
  await context.Account.getOrCreate({
    id: accountId(fromAddress),
    address: fromAddress,
    ...createdDefaults(event),
  });
  await context.Account.getOrCreate({
    id: accountId(toAddress),
    address: toAddress,
    ...createdDefaults(event),
  });

  const tId = tokenIdFn(poolId, tokenId);
  const txHash = event.transaction.hash;

  // Create TRANSFER_OUT transaction
  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, fromAddress, "TRANSFER_OUT", txHash),
    txHash,
    centrifugeId,
    poolId,
    tokenId,
    type: "TRANSFER_OUT",
    account: fromAddress,
    epochIndex: undefined,
    tokenAmount: amount,
    currencyAmount: undefined,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: fromAddress,
    toAccount: toAddress,
    fromCentrifugeId: centrifugeId,
    toCentrifugeId: centrifugeId,
    currencyAssetId: undefined,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tId,
    currencyAsset_id: undefined,
    ...createdDefaults(event),
  });

  // Create TRANSFER_IN transaction
  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, toAddress, "TRANSFER_IN", txHash),
    txHash,
    centrifugeId,
    poolId,
    tokenId,
    type: "TRANSFER_IN",
    account: toAddress,
    epochIndex: undefined,
    tokenAmount: amount,
    currencyAmount: undefined,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: fromAddress,
    toAccount: toAddress,
    fromCentrifugeId: centrifugeId,
    toCentrifugeId: centrifugeId,
    currencyAssetId: undefined,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tId,
    currencyAsset_id: undefined,
    ...createdDefaults(event),
  });
});

// === V3.1 Handler Registrations (delegates to V3 logic) ===

BalanceSheetV3_1.V3_1NoteDeposit.handler(BalanceSheet.NoteDeposit.handler as any);
BalanceSheetV3_1.V3_1Withdraw.handler(BalanceSheet.Withdraw.handler as any);
BalanceSheetV3_1.V3_1BSUpdateManager.handler(BalanceSheet.UpdateManager.handler as any);
BalanceSheetV3_1.V3_1Deposit.handler(BalanceSheet.Deposit.handler as any);
BalanceSheetV3_1.V3_1Issue.handler(BalanceSheet.Issue.handler as any);
BalanceSheetV3_1.V3_1Revoke.handler(BalanceSheet.Revoke.handler as any);
BalanceSheetV3_1.V3_1TransferSharesFrom.handler(BalanceSheet.TransferSharesFrom.handler as any);
