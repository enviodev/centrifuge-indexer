import { Spoke } from "generated";
import { getCentrifugeId, networkNames, explorerUrls, chainIcons } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import {
  tokenId as tokenIdFn,
  tokenInstanceId,
  tokenInstancePositionId,
  holdingEscrowId,
  accountId,
  blockchainId,
  investorTransactionId,
} from "../utils/ids";
import { getInitialHolders } from "../utils/constants";
import { deployVault, linkVault, unlinkVault } from "./shared/vaultOps";

// --- contractRegister for AddShareClass (registers TokenInstance ERC20) ---
Spoke.AddShareClass.contractRegister(({ event, context }) => {
  context.addTokenInstance(event.params.token);
});

// --- contractRegister for DeployVault (registers Vault contract) ---
Spoke.DeployVault.contractRegister(({ event, context }) => {
  context.addVault(event.params.vault);
});

// --- Handlers ---

Spoke.AddPool.handler(async ({ event, context }) => {});

Spoke.RegisterAsset.handler(async ({ event, context }) => {
  const { assetId, asset: assetAddress, tokenId: assetTokenId, name, symbol, decimals } = event.params;
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

  // Upsert Asset
  const existingAsset = await context.Asset.get(assetId.toString());
  context.Asset.set({
    id: assetId.toString(),
    centrifugeId,
    address: assetAddress.toLowerCase(),
    assetTokenId,
    decimals: Number(decimals),
    name,
    symbol,
    blockchain_id: blockchainId(centrifugeId),
    ...(existingAsset ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
});

Spoke.AddShareClass.handler(async ({ event, context }) => {
  const { poolId, scId: tokenId, token: tokenAddress } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);

  // Get or create TokenInstance (skip RPC totalSupply — init to 0, Transfer events will correct)
  const tiId = tokenInstanceId(centrifugeId, tokenId);
  const existingTi = await context.TokenInstance.get(tiId);

  context.TokenInstance.set({
    id: tiId,
    centrifugeId,
    tokenId,
    isActive: true,
    address: tokenAddress.toLowerCase(),
    tokenPrice: existingTi?.tokenPrice ?? undefined,
    computedAt: existingTi?.computedAt ?? undefined,
    totalIssuance: existingTi?.totalIssuance ?? 0n,
    blockchain_id: blockchainId(centrifugeId),
    token_id: tokenIdFn(poolId, tokenId),
    ...(existingTi ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Get or create Token
  const tId = tokenIdFn(poolId, tokenId);
  const existingToken = await context.Token.get(tId);

  context.Token.set({
    id: tId,
    index: undefined,
    isActive: true,
    centrifugeId,
    poolId,
    decimals: undefined,
    name: undefined,
    symbol: undefined,
    salt: undefined,
    totalIssuance: existingToken?.totalIssuance ?? 0n,
    tokenPrice: existingToken?.tokenPrice ?? undefined,
    tokenPriceComputedAt: existingToken?.tokenPriceComputedAt ?? undefined,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    ...(existingToken ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Initialize positions for known initial holders (V2 pools)
  const initialHolders = getInitialHolders(poolId, tokenId, centrifugeId);
  for (const holder of initialHolders) {
    const holderAddress = holder.toLowerCase();

    // Ensure Account exists
    await context.Account.getOrCreate({
      id: accountId(holderAddress),
      address: holderAddress,
      ...createdDefaults(event),
    });

    // Create TokenInstancePosition (balance will be set by Transfer events)
    const tipId = tokenInstancePositionId(tokenId, centrifugeId, holderAddress);
    const existingTip = await context.TokenInstancePosition.get(tipId);
    if (!existingTip) {
      context.TokenInstancePosition.set({
        id: tipId,
        tokenId,
        centrifugeId,
        accountAddress: holderAddress,
        balance: 0n,
        isFrozen: false,
        tokenInstance_id: tiId,
        account_id: accountId(holderAddress),
        ...createdDefaults(event),
      });
    }
  }
});

Spoke.DeployVault.handler(async ({ event, context }) => {
  await deployVault(event, context);
});

Spoke.UpdateSharePrice.handler(async ({ event, context }) => {
  const { scId: tokenId, price: tokenPrice, computedAt: _computedAt } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const computedAt = Number(_computedAt);

  // Update TokenInstance price
  const tiId = tokenInstanceId(centrifugeId, tokenId);
  const ti = await context.TokenInstance.get(tiId);
  if (!ti) {
    context.log.warn(`TokenInstance ${tiId} not found. Cannot update token price`);
    return;
  }

  context.TokenInstance.set({
    ...ti,
    tokenPrice,
    computedAt,
    ...updatedDefaults(event),
  });
});

Spoke.UpdateAssetPrice.handler(async ({ event, context }) => {
  const { poolId, scId: tokenId, asset: assetAddress, price: assetPrice } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);

  // Look up asset by address to get assetId
  const assets = await context.Asset.getWhere({ address: { _eq: assetAddress.toLowerCase() } });
  const asset = assets[0];
  if (!asset) {
    context.log.warn(`Asset not found for address ${assetAddress}. Cannot update asset price`);
    return;
  }
  const assetId = BigInt(asset.id);

  // Look up escrow for this pool (getWhere supports single field only)
  const escrows = await context.Escrow.getWhere({ poolId: { _eq: poolId } });
  const escrow = escrows.find((e: any) => e.centrifugeId === centrifugeId);
  if (!escrow) {
    context.log.warn(`Escrow not found for pool ${poolId}. Cannot update asset price`);
    return;
  }

  // Get or create HoldingEscrow
  const heId = holdingEscrowId(tokenId, assetId);
  const existingHe = await context.HoldingEscrow.get(heId);

  context.HoldingEscrow.set({
    id: heId,
    centrifugeId,
    poolId,
    tokenId,
    assetId,
    assetAddress: assetAddress.toLowerCase(),
    assetAmount: existingHe?.assetAmount ?? undefined,
    assetPrice,
    escrowAddress: escrow.address,
    blockchain_id: blockchainId(centrifugeId),
    holding_id: existingHe?.holding_id ?? undefined,
    asset_id: asset.id,
    escrow_id: existingHe?.escrow_id ?? escrow.id,
    ...(existingHe ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
});

Spoke.LinkVault.handler(async ({ event, context }) => {
  await linkVault(event, context);
});

Spoke.UnlinkVault.handler(async ({ event, context }) => {
  await unlinkVault(event, context);
});

Spoke.InitiateTransferShares.handler(async ({ event, context }) => {
  const { centrifugeId: toCentrifugeIdRaw, poolId, scId: tokenId, sender, destinationAddress, amount } = event.params;
  const fromCentrifugeId = getCentrifugeId(event.chainId);
  const toCentrifugeId = toCentrifugeIdRaw.toString();

  const fromAddress = sender.substring(0, 42).toLowerCase();
  const toAddress = destinationAddress.substring(0, 42).toLowerCase();

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
    centrifugeId: fromCentrifugeId,
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
    fromCentrifugeId,
    toCentrifugeId,
    currencyAssetId: undefined,
    blockchain_id: blockchainId(fromCentrifugeId),
    pool_id: poolId.toString(),
    token_id: tId,
    currencyAsset_id: undefined,
    ...createdDefaults(event),
  });

  // Create TRANSFER_IN transaction
  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, toAddress, "TRANSFER_IN", txHash),
    txHash,
    centrifugeId: fromCentrifugeId,
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
    fromCentrifugeId,
    toCentrifugeId,
    currencyAssetId: undefined,
    blockchain_id: blockchainId(fromCentrifugeId),
    pool_id: poolId.toString(),
    token_id: tId,
    currencyAsset_id: undefined,
    ...createdDefaults(event),
  });
});

Spoke.ExecuteTransferShares.handler(async ({ event, context }) => {});
Spoke.SetRequestManager.handler(async ({ event, context }) => {});
