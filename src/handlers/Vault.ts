import { Vault } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import {
  vaultId as vaultIdFn,
  investorTransactionId,
  vaultInvestOrderId,
  vaultRedeemOrderId,
  outstandingInvestId,
  outstandingRedeemId,
  investOrderId,
  epochInvestOrderId,
  tokenId as tokenIdFn,
  tokenInstancePositionId,
  accountId,
  blockchainId,
} from "../utils/ids";

// --- Helpers ---

function getSharePrice(
  assetsAmount: bigint,
  sharesAmount: bigint,
  assetDecimals: number,
  shareDecimals: number
): bigint | undefined {
  if (sharesAmount === 0n) return undefined;
  return (assetsAmount * 10n ** BigInt(18 - assetDecimals + shareDecimals)) / sharesAmount;
}

async function getVaultContext(event: any, context: any) {
  const centrifugeId = getCentrifugeId(event.chainId);
  const vaultAddress = event.srcAddress;
  const id = vaultIdFn(vaultAddress, centrifugeId);
  const vault = await context.Vault.get(id);
  if (!vault) {
    context.log.warn(`Vault ${vaultAddress} not found on chain ${centrifugeId}`);
    return null;
  }

  const tId = tokenIdFn(vault.poolId, vault.tokenId);
  const token = await context.Token.get(tId);

  // Look up asset by address
  const assets = await context.Asset.getWhere({ address: { _eq: vault.assetAddress } });
  const asset = assets[0];

  return { centrifugeId, vault, token, asset };
}

// --- DepositRequest ---

Vault.DepositRequest.handler(async ({ event, context }) => {
  const { controller, assets } = event.params;
  const investor = controller.substring(0, 42).toLowerCase();

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, asset } = ctx;
  const { poolId, tokenId, assetId } = vault;

  // Ensure Account
  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  // Ensure TokenInstancePosition
  const tipId = tokenInstancePositionId(tokenId, centrifugeId, investor);
  const existingTip = await context.TokenInstancePosition.get(tipId);
  if (!existingTip) {
    context.TokenInstancePosition.set({
      id: tipId,
      tokenId,
      centrifugeId,
      accountAddress: investor,
      balance: 0n,
      isFrozen: false,
      tokenInstance_id: undefined,
      account_id: accountId(investor),
      ...createdDefaults(event),
    });
  }

  // Create InvestorTransaction (DEPOSIT_REQUEST_UPDATED)
  const itId = investorTransactionId(poolId, tokenId, investor, "DEPOSIT_REQUEST_UPDATED", event.transaction.hash);
  context.InvestorTransaction.set({
    id: itId,
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "DEPOSIT_REQUEST_UPDATED",
    account: investor,
    epochIndex: undefined,
    tokenAmount: undefined,
    currencyAmount: assets,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });

  // Update OutstandingInvest (deprecated)
  const oiId = outstandingInvestId(tokenId, assetId, investor);
  const existingOi = await context.OutstandingInvest.get(oiId);
  context.OutstandingInvest.set({
    id: oiId,
    poolId,
    tokenId,
    assetId,
    account: investor,
    epochIndex: existingOi?.epochIndex ?? undefined,
    pendingAmount: existingOi?.pendingAmount ?? undefined,
    queuedAmount: existingOi?.queuedAmount ?? undefined,
    depositAmount: (existingOi?.depositAmount ?? 0n) + assets,
    approvedAmount: existingOi?.approvedAmount ?? undefined,
    approvedIndex: existingOi?.approvedIndex ?? undefined,
    approvedAt: existingOi?.approvedAt ?? undefined,
    approvedAtBlock: existingOi?.approvedAtBlock ?? undefined,
    approvedAtTxHash: existingOi?.approvedAtTxHash ?? undefined,
    token_id: tokenIdFn(poolId, tokenId),
    ...(existingOi ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Update VaultInvestOrder
  const vioId = vaultInvestOrderId(tokenId, centrifugeId, assetId, investor);
  const existingVio = await context.VaultInvestOrder.get(vioId);
  context.VaultInvestOrder.set({
    id: vioId,
    centrifugeId,
    poolId,
    tokenId,
    accountAddress: investor,
    assetId,
    requestedAssetsAmount: (existingVio?.requestedAssetsAmount ?? 0n) + assets,
    claimableAssetsAmount: existingVio?.claimableAssetsAmount ?? undefined,
    epochIndex: existingVio?.epochIndex ?? undefined,
    vault_id: vaultIdFn(event.srcAddress, centrifugeId),
    ...(existingVio ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
});

// --- RedeemRequest ---

Vault.RedeemRequest.handler(async ({ event, context }) => {
  const { controller, shares } = event.params;
  const investor = controller.substring(0, 42).toLowerCase();

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, asset } = ctx;
  const { poolId, tokenId, assetId } = vault;

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  // Create InvestorTransaction (REDEEM_REQUEST_UPDATED)
  const itId = investorTransactionId(poolId, tokenId, investor, "REDEEM_REQUEST_UPDATED", event.transaction.hash);
  context.InvestorTransaction.set({
    id: itId,
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "REDEEM_REQUEST_UPDATED",
    account: investor,
    epochIndex: undefined,
    tokenAmount: shares,
    currencyAmount: undefined,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });

  // Update OutstandingRedeem (deprecated)
  const orId = outstandingRedeemId(tokenId, assetId, investor);
  const existingOr = await context.OutstandingRedeem.get(orId);
  context.OutstandingRedeem.set({
    id: orId,
    poolId,
    tokenId,
    assetId,
    account: investor,
    epochIndex: existingOr?.epochIndex ?? undefined,
    pendingAmount: existingOr?.pendingAmount ?? undefined,
    queuedAmount: existingOr?.queuedAmount ?? undefined,
    depositAmount: (existingOr?.depositAmount ?? 0n) + shares,
    approvedAmount: existingOr?.approvedAmount ?? undefined,
    approvedIndex: existingOr?.approvedIndex ?? undefined,
    approvedAt: existingOr?.approvedAt ?? undefined,
    approvedAtBlock: existingOr?.approvedAtBlock ?? undefined,
    approvedAtTxHash: existingOr?.approvedAtTxHash ?? undefined,
    token_id: tokenIdFn(poolId, tokenId),
    ...(existingOr ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Update VaultRedeemOrder
  const vroId = vaultRedeemOrderId(tokenId, centrifugeId, assetId, investor);
  const existingVro = await context.VaultRedeemOrder.get(vroId);
  context.VaultRedeemOrder.set({
    id: vroId,
    centrifugeId,
    poolId,
    tokenId,
    accountAddress: investor,
    assetId,
    requestedSharesAmount: (existingVro?.requestedSharesAmount ?? 0n) + shares,
    claimableSharesAmount: existingVro?.claimableSharesAmount ?? undefined,
    vault_id: vaultIdFn(event.srcAddress, centrifugeId),
    ...(existingVro ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
});

// --- DepositClaimable ---

Vault.DepositClaimable.handler(async ({ event, context }) => {
  const { controller, assets, shares } = event.params;
  const investor = controller.substring(0, 42).toLowerCase();

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, token, asset } = ctx;
  const { poolId, tokenId, kind, assetId } = vault;

  // Only for Async vaults
  if (kind !== "Async") return;

  const assetDecimals = asset?.decimals;
  const shareDecimals = token?.decimals;
  if (typeof assetDecimals !== "number" || typeof shareDecimals !== "number") return;

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  const tokenPrice = getSharePrice(assets, shares, assetDecimals, shareDecimals);

  // Create InvestorTransaction (DEPOSIT_CLAIMABLE)
  const itId = investorTransactionId(poolId, tokenId, investor, "DEPOSIT_CLAIMABLE", event.transaction.hash);
  context.InvestorTransaction.set({
    id: itId,
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "DEPOSIT_CLAIMABLE",
    account: investor,
    epochIndex: undefined,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });

  // Update VaultInvestOrder
  const vioId = vaultInvestOrderId(tokenId, centrifugeId, assetId, investor);
  const existingVio = await context.VaultInvestOrder.get(vioId);
  context.VaultInvestOrder.set({
    id: vioId,
    centrifugeId,
    poolId,
    tokenId,
    accountAddress: investor,
    assetId,
    requestedAssetsAmount: existingVio?.requestedAssetsAmount ?? undefined,
    claimableAssetsAmount: (existingVio?.claimableAssetsAmount ?? 0n) + assets,
    epochIndex: existingVio?.epochIndex ?? undefined,
    vault_id: vaultIdFn(event.srcAddress, centrifugeId),
    ...(existingVio ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
});

// --- RedeemClaimable ---

Vault.RedeemClaimable.handler(async ({ event, context }) => {
  const { controller, assets, shares } = event.params;
  const investor = controller.substring(0, 42).toLowerCase();

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, token, asset } = ctx;
  const { poolId, tokenId, assetId } = vault;

  const assetDecimals = asset?.decimals;
  const shareDecimals = token?.decimals;
  if (typeof assetDecimals !== "number" || typeof shareDecimals !== "number") return;

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  const tokenPrice = getSharePrice(assets, shares, assetDecimals, shareDecimals);

  // Create InvestorTransaction (REDEEM_CLAIMABLE)
  const itId = investorTransactionId(poolId, tokenId, investor, "REDEEM_CLAIMABLE", event.transaction.hash);
  context.InvestorTransaction.set({
    id: itId,
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "REDEEM_CLAIMABLE",
    account: investor,
    epochIndex: undefined,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });

  // Update VaultRedeemOrder
  const vroId = vaultRedeemOrderId(tokenId, centrifugeId, assetId, investor);
  const existingVro = await context.VaultRedeemOrder.get(vroId);
  context.VaultRedeemOrder.set({
    id: vroId,
    centrifugeId,
    poolId,
    tokenId,
    accountAddress: investor,
    assetId,
    requestedSharesAmount: existingVro?.requestedSharesAmount ?? undefined,
    claimableSharesAmount: (existingVro?.claimableSharesAmount ?? 0n) + shares,
    vault_id: vaultIdFn(event.srcAddress, centrifugeId),
    ...(existingVro ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
});

// --- Deposit ---

Vault.Deposit.handler(async ({ event, context }) => {
  const { sender, owner, assets, shares } = event.params;

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, token, asset } = ctx;
  const { poolId, tokenId, kind, assetId } = vault;

  const assetDecimals = asset?.decimals;
  const shareDecimals = token?.decimals;
  if (typeof assetDecimals !== "number" || typeof shareDecimals !== "number") return;

  // NOTE: In v3.1, SyncDepositVault has sender/receiver swapped in event data
  // Use sender for Sync/SyncDepositAsyncRedeem, owner for Async
  let investor: string;
  switch (kind) {
    case "Async":
      investor = owner.toLowerCase();
      break;
    case "SyncDepositAsyncRedeem":
    case "Sync":
      investor = sender.toLowerCase();
      break;
    default:
      return;
  }

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  const tokenPrice = getSharePrice(assets, shares, assetDecimals, shareDecimals);

  const itData = {
    centrifugeId,
    poolId,
    tokenId,
    account: investor,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice,
    currencyAssetId: assetId,
  };

  switch (kind) {
    case "Async": {
      // Claim deposit
      const itId = investorTransactionId(poolId, tokenId, investor, "DEPOSIT_CLAIMED", event.transaction.hash);
      context.InvestorTransaction.set({
        id: itId,
        txHash: event.transaction.hash,
        type: "DEPOSIT_CLAIMED",
        epochIndex: undefined,
        transactionFee: undefined,
        fromAccount: undefined,
        toAccount: undefined,
        fromCentrifugeId: undefined,
        toCentrifugeId: undefined,
        blockchain_id: blockchainId(centrifugeId),
        pool_id: poolId.toString(),
        token_id: tokenIdFn(poolId, tokenId),
        currencyAsset_id: asset ? asset.id : undefined,
        ...itData,
        ...createdDefaults(event),
      });

      // Update VaultInvestOrder — clear after claim
      const vioId = vaultInvestOrderId(tokenId, centrifugeId, assetId, investor);
      const existingVio = await context.VaultInvestOrder.get(vioId);
      if (existingVio) {
        const newClaimable = (existingVio.claimableAssetsAmount ?? 0n) > assets
          ? (existingVio.claimableAssetsAmount ?? 0n) - assets
          : 0n;
        context.VaultInvestOrder.set({
          ...existingVio,
          claimableAssetsAmount: newClaimable,
          ...updatedDefaults(event),
        });
      }
      break;
    }
    case "SyncDepositAsyncRedeem":
    case "Sync": {
      // Sync deposit
      const itId = investorTransactionId(poolId, tokenId, investor, "SYNC_DEPOSIT", event.transaction.hash);
      context.InvestorTransaction.set({
        id: itId,
        txHash: event.transaction.hash,
        type: "SYNC_DEPOSIT",
        epochIndex: undefined,
        transactionFee: undefined,
        fromAccount: undefined,
        toAccount: undefined,
        fromCentrifugeId: undefined,
        toCentrifugeId: undefined,
        blockchain_id: blockchainId(centrifugeId),
        pool_id: poolId.toString(),
        token_id: tokenIdFn(poolId, tokenId),
        currencyAsset_id: asset ? asset.id : undefined,
        ...itData,
        ...createdDefaults(event),
      });

      // Create negative-index InvestOrder for sync deposits
      const investOrders = await context.InvestOrder.getWhere({ tokenId: { _eq: tokenId } });
      const syncOrders = investOrders.filter(
        (o: any) => o.assetId === assetId && o.account === investor && o.index <= 0
      );
      const investOrderIndex = -(syncOrders.length);

      const ioId = investOrderId(tokenId, assetId, investor, investOrderIndex);
      context.InvestOrder.set({
        id: ioId,
        poolId,
        tokenId,
        assetId,
        account: investor,
        index: investOrderIndex,
        approvedAt: event.block.timestamp,
        approvedAtBlock: event.block.number,
        approvedAtTxHash: event.transaction.hash,
        approvedIndex: investOrderIndex,
        approvedAssetsAmount: assets,
        issuedSharesAmount: shares,
        issuedWithNavPoolPerShare: undefined,
        issuedWithNavAssetPerShare: tokenPrice,
        issuedAt: event.block.timestamp,
        issuedAtBlock: event.block.number,
        issuedAtTxHash: event.transaction.hash,
        claimedAt: event.block.timestamp,
        claimedAtBlock: event.block.number,
        claimedAtTxHash: event.transaction.hash,
        claimedSharesAmount: shares,
        token_id: tokenIdFn(poolId, tokenId),
        investAsset_id: assetId.toString(),
        ...createdDefaults(event),
      });

      // Create negative-index EpochInvestOrder for sync deposits
      const epochOrders = await context.EpochInvestOrder.getWhere({ tokenId: { _eq: tokenId } });
      const syncEpochOrders = epochOrders.filter(
        (o: any) => o.assetId === assetId && o.index <= 0
      );
      const epochOrderIndex = -(syncEpochOrders.length);

      const eioId = epochInvestOrderId(tokenId, assetId, epochOrderIndex);
      context.EpochInvestOrder.set({
        id: eioId,
        poolId,
        tokenId,
        assetId,
        index: epochOrderIndex,
        approvedAt: event.block.timestamp,
        approvedAtBlock: event.block.number,
        approvedAtTxHash: event.transaction.hash,
        approvedAssetsAmount: assets,
        approvedPoolAmount: assets,
        approvedPercentageOfTotalPending: 100n * 10n ** BigInt(assetDecimals),
        issuedAt: event.block.timestamp,
        issuedAtBlock: event.block.number,
        issuedAtTxHash: event.transaction.hash,
        issuedSharesAmount: shares,
        issuedWithNavPoolPerShare: undefined,
        issuedWithNavAssetPerShare: tokenPrice,
        token_id: tokenIdFn(poolId, tokenId),
        epochInvestAsset_id: assetId.toString(),
        ...createdDefaults(event),
      });
      break;
    }
  }
});

// --- Withdraw ---

Vault.Withdraw.handler(async ({ event, context }) => {
  const { owner, assets, shares } = event.params;

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, token, asset } = ctx;
  const { poolId, tokenId, kind, assetId } = vault;

  if (kind === "Sync") return; // Not supported

  const assetDecimals = asset?.decimals;
  const shareDecimals = token?.decimals;
  if (typeof assetDecimals !== "number" || typeof shareDecimals !== "number") return;

  const investor = owner.toLowerCase();

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  const tokenPrice = getSharePrice(assets, shares, assetDecimals, shareDecimals);

  // Create InvestorTransaction (REDEEM_CLAIMED)
  const itId = investorTransactionId(poolId, tokenId, investor, "REDEEM_CLAIMED", event.transaction.hash);
  context.InvestorTransaction.set({
    id: itId,
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "REDEEM_CLAIMED",
    account: investor,
    epochIndex: undefined,
    tokenAmount: shares,
    currencyAmount: assets,
    tokenPrice,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });

  // Update VaultRedeemOrder — clear after claim
  const vroId = vaultRedeemOrderId(tokenId, centrifugeId, assetId, investor);
  const existingVro = await context.VaultRedeemOrder.get(vroId);
  if (existingVro) {
    const newClaimable = (existingVro.claimableSharesAmount ?? 0n) > shares
      ? (existingVro.claimableSharesAmount ?? 0n) - shares
      : 0n;
    context.VaultRedeemOrder.set({
      ...existingVro,
      claimableSharesAmount: newClaimable,
      ...updatedDefaults(event),
    });
  }
});

// --- CancelDepositRequest ---

Vault.CancelDepositRequest.handler(async ({ event, context }) => {
  const { controller } = event.params;
  const investor = controller.substring(0, 42).toLowerCase();

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, asset } = ctx;
  const { poolId, tokenId, assetId } = vault;

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, investor, "DEPOSIT_REQUEST_CANCELLED", event.transaction.hash),
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "DEPOSIT_REQUEST_CANCELLED",
    account: investor,
    epochIndex: undefined,
    tokenAmount: undefined,
    currencyAmount: undefined,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });
});

// --- CancelDepositClaim ---

Vault.CancelDepositClaim.handler(async ({ event, context }) => {
  const { controller, assets } = event.params;
  const investor = controller.substring(0, 42).toLowerCase();

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, asset } = ctx;
  const { poolId, tokenId, assetId } = vault;

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, investor, "DEPOSIT_REQUEST_CANCELLED", event.transaction.hash + "-claim"),
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "DEPOSIT_REQUEST_CANCELLED",
    account: investor,
    epochIndex: undefined,
    tokenAmount: undefined,
    currencyAmount: assets,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });

  // Clear VaultInvestOrder
  const vioId = vaultInvestOrderId(tokenId, centrifugeId, assetId, investor);
  const existingVio = await context.VaultInvestOrder.get(vioId);
  if (existingVio) {
    context.VaultInvestOrder.set({
      ...existingVio,
      requestedAssetsAmount: 0n,
      claimableAssetsAmount: 0n,
      ...updatedDefaults(event),
    });
  }
});

// --- CancelDepositClaimable ---

Vault.CancelDepositClaimable.handler(async ({ event, context }) => {
  const { controller, assets } = event.params;
  const investor = controller.substring(0, 42).toLowerCase();

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, asset } = ctx;
  const { poolId, tokenId, assetId } = vault;

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, investor, "DEPOSIT_REQUEST_CANCELLED", event.transaction.hash + "-claimable"),
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "DEPOSIT_REQUEST_CANCELLED",
    account: investor,
    epochIndex: undefined,
    tokenAmount: undefined,
    currencyAmount: assets,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });
});

// --- CancelRedeemRequest ---

Vault.CancelRedeemRequest.handler(async ({ event, context }) => {
  const { controller } = event.params;
  const investor = controller.substring(0, 42).toLowerCase();

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, asset } = ctx;
  const { poolId, tokenId, assetId } = vault;

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, investor, "REDEEM_REQUEST_CANCELLED", event.transaction.hash),
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "REDEEM_REQUEST_CANCELLED",
    account: investor,
    epochIndex: undefined,
    tokenAmount: undefined,
    currencyAmount: undefined,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });
});

// --- CancelRedeemClaim ---

Vault.CancelRedeemClaim.handler(async ({ event, context }) => {
  const { controller, shares } = event.params;
  const investor = controller.substring(0, 42).toLowerCase();

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, asset } = ctx;
  const { poolId, tokenId, assetId } = vault;

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, investor, "REDEEM_REQUEST_CANCELLED", event.transaction.hash + "-claim"),
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "REDEEM_REQUEST_CANCELLED",
    account: investor,
    epochIndex: undefined,
    tokenAmount: shares,
    currencyAmount: undefined,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });

  // Clear VaultRedeemOrder
  const vroId = vaultRedeemOrderId(tokenId, centrifugeId, assetId, investor);
  const existingVro = await context.VaultRedeemOrder.get(vroId);
  if (existingVro) {
    context.VaultRedeemOrder.set({
      ...existingVro,
      requestedSharesAmount: 0n,
      claimableSharesAmount: 0n,
      ...updatedDefaults(event),
    });
  }
});

// --- CancelRedeemClaimable ---

Vault.CancelRedeemClaimable.handler(async ({ event, context }) => {
  const { controller, shares } = event.params;
  const investor = controller.substring(0, 42).toLowerCase();

  const ctx = await getVaultContext(event, context);
  if (!ctx) return;
  const { centrifugeId, vault, asset } = ctx;
  const { poolId, tokenId, assetId } = vault;

  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, investor, "REDEEM_REQUEST_CANCELLED", event.transaction.hash + "-claimable"),
    txHash: event.transaction.hash,
    centrifugeId,
    poolId,
    tokenId,
    type: "REDEEM_REQUEST_CANCELLED",
    account: investor,
    epochIndex: undefined,
    tokenAmount: shares,
    currencyAmount: undefined,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: undefined,
    fromCentrifugeId: undefined,
    toCentrifugeId: undefined,
    currencyAssetId: assetId,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });
});
