import { Spoke, SpokeV3_1 } from "generated";
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
  normalizeScId,
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

Spoke.AddPool.handler(async ({ event, context }) => {
  // Pool creation is tracked via HubRegistry.NewPool on the hub side.
  // Spoke.AddPool confirms the spoke received the notification — no entity tracking needed.
});

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
  const { poolId, scId: _rawScId, token: tokenAddress } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
    crosschainInProgress: existingTi?.crosschainInProgress ?? undefined,
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
  const { scId: _rawScId, price: tokenPrice, computedAt: _computedAt } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
    crosschainInProgress: undefined,
    ...updatedDefaults(event),
  });
});

Spoke.UpdateAssetPrice.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, asset: assetAddress, price: assetPrice } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
    crosschainInProgress: undefined,
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
  const { centrifugeId: toCentrifugeIdRaw, poolId, scId: _rawScId, sender, destinationAddress, amount } = event.params;
  const tokenId = normalizeScId(_rawScId);
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

Spoke.ExecuteTransferShares.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, receiver, amount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);
  const receiverAddress = receiver.toLowerCase();

  // Ensure receiver account exists
  await context.Account.getOrCreate({
    id: accountId(receiverAddress),
    address: receiverAddress,
    ...createdDefaults(event),
  });

  // Update TokenInstancePosition for the receiver
  const tipId = tokenInstancePositionId(tokenId, centrifugeId, receiverAddress);
  const existingTip = await context.TokenInstancePosition.get(tipId);
  if (existingTip) {
    context.TokenInstancePosition.set({
      ...existingTip,
      balance: (existingTip.balance ?? 0n) + amount,
      ...updatedDefaults(event),
    });
  } else {
    const tiId = tokenInstanceId(centrifugeId, tokenId);
    context.TokenInstancePosition.set({
      id: tipId,
      tokenId,
      centrifugeId,
      accountAddress: receiverAddress,
      balance: amount,
      isFrozen: false,
      tokenInstance_id: tiId,
      account_id: accountId(receiverAddress),
      ...createdDefaults(event),
    });
  }
});

Spoke.SetRequestManager.handler(async ({ event, context }) => {
  // Informational: tracks which request manager is set for a pool/token/asset.
  // The BatchRequestManager contract handles the actual request events.
});

// === V3.1 Handler Registrations (delegates to V3 logic) ===

SpokeV3_1.V3_1AddShareClass.contractRegister(Spoke.AddShareClass.contractRegister as any);
SpokeV3_1.V3_1DeployVault.contractRegister(Spoke.DeployVault.contractRegister as any);
SpokeV3_1.V3_1AddPool.handler(Spoke.AddPool.handler as any);
SpokeV3_1.V3_1RegisterAsset.handler(Spoke.RegisterAsset.handler as any);
SpokeV3_1.V3_1AddShareClass.handler(Spoke.AddShareClass.handler as any);
SpokeV3_1.V3_1DeployVault.handler(Spoke.DeployVault.handler as any);
SpokeV3_1.V3_1UpdateSharePrice.handler(Spoke.UpdateSharePrice.handler as any);
SpokeV3_1.V3_1UpdateAssetPrice.handler(Spoke.UpdateAssetPrice.handler as any);
SpokeV3_1.V3_1LinkVault.handler(Spoke.LinkVault.handler as any);
SpokeV3_1.V3_1UnlinkVault.handler(Spoke.UnlinkVault.handler as any);
SpokeV3_1.V3_1InitiateTransferShares.handler(Spoke.InitiateTransferShares.handler as any);
SpokeV3_1.V3_1ExecuteTransferShares.handler(Spoke.ExecuteTransferShares.handler as any);
SpokeV3_1.V3_1SetRequestManager.handler(Spoke.SetRequestManager.handler as any);
