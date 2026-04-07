import { Hub } from "generated";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import {
  poolSpokeBlockchainId,
  whitelistedInvestorId,
  accountId,
  blockchainId,
  tokenInstanceId,
  holdingEscrowId,
  vaultId as vaultIdFn,
  tokenId as tokenIdFn,
  investorTransactionId,
  policyId,
} from "../utils/ids";
import { getChainMetadata, getCentrifugeId } from "../utils/chains";
import { decodeSyncManagerTrustedCall } from "../utils/updateContractDecoders";

// --- UpdateRestriction payload decoding ---

enum RestrictionType {
  Invalid = 0,
  Member = 1,
  Freeze = 2,
  Unfreeze = 3,
}

function decodeUpdateRestriction(
  payload: string
): [RestrictionType.Member | RestrictionType.Freeze | RestrictionType.Unfreeze, string, number | undefined] | null {
  const buffer = Buffer.from(payload.slice(2), "hex");
  const restrictionType = buffer.readUInt8(0);
  // bytes 1-31: 31-byte field, extract first 20 bytes as address (left-padded with zeros)
  const accountBuffer = buffer.subarray(1, 32);
  const accountAddress = `0x${accountBuffer.toString("hex").slice(0, 40)}`;

  // GraphQL Int → PostgreSQL int4 → max 2,147,483,647
  const MAX_INT32 = 2_147_483_647;

  switch (restrictionType) {
    case RestrictionType.Member: {
      const rawValidUntil = buffer.readBigUInt64BE(33);
      const validUntilSeconds = Number(rawValidUntil);
      const validUntil = Number.isSafeInteger(validUntilSeconds)
        ? Math.min(validUntilSeconds, MAX_INT32)
        : MAX_INT32;
      return [RestrictionType.Member, accountAddress, validUntil];
    }
    case RestrictionType.Freeze:
      return [RestrictionType.Freeze, accountAddress, undefined];
    case RestrictionType.Unfreeze:
      return [RestrictionType.Unfreeze, accountAddress, undefined];
    default:
      return null;
  }
}

// --- Handlers ---

Hub.NotifyPool.handler(async ({ event, context }) => {
  const { centrifugeId: spokeCentrifugeIdRaw, poolId } = event.params;
  const spokeCentrifugeId = spokeCentrifugeIdRaw.toString();

  // Ensure the spoke blockchain entity exists (use spoke chain metadata, not hub chain)
  const spokeMetadata = getChainMetadata(spokeCentrifugeId);
  await context.Blockchain.getOrCreate({
    id: blockchainId(spokeCentrifugeId),
    centrifugeId: spokeCentrifugeId,
    network: spokeMetadata.network,
    lastPeriodStart: undefined,
    chainId: spokeMetadata.chainId ? Number(spokeMetadata.chainId) : undefined,
    name: spokeMetadata.network,
    explorer: spokeMetadata.explorer ?? undefined,
    icon: spokeMetadata.icon ?? undefined,
  });

  context.PoolSpokeBlockchain.set({
    id: poolSpokeBlockchainId(poolId, spokeCentrifugeId),
    poolId,
    centrifugeId: spokeCentrifugeId,
    pool_id: poolId.toString(),
    blockchain_id: blockchainId(spokeCentrifugeId),
    ...createdDefaults(event),
  });
});

Hub.UpdateRestriction.handler(async ({ event, context }) => {
  const { centrifugeId: spokeCentrifugeIdRaw, poolId, scId: tokenId, payload } = event.params;
  const spokeCentrifugeId = spokeCentrifugeIdRaw.toString();

  const decoded = decodeUpdateRestriction(payload);
  if (!decoded) {
    context.log.warn(`Unable to decode UpdateRestriction payload: ${payload}`);
    return;
  }

  const [restrictionType, accountAddress, validUntil] = decoded;

  // getOrCreate Account
  await context.Account.getOrCreate({
    id: accountId(accountAddress),
    address: accountAddress.toLowerCase(),
    ...createdDefaults(event),
  });

  const id = whitelistedInvestorId(tokenId, spokeCentrifugeId, accountAddress);
  const existing = await context.WhitelistedInvestor.get(id);

  switch (restrictionType) {
    case RestrictionType.Member:
      if (existing) {
        context.WhitelistedInvestor.set({
          ...existing,
          validUntil,
          ...updatedDefaults(event),
        });
      } else {
        context.WhitelistedInvestor.set({
          id,
          poolId,
          tokenId,
          accountAddress: accountAddress.toLowerCase(),
          centrifugeId: spokeCentrifugeId,
          isFrozen: false,
          validUntil,
          token_id: undefined,
          investorAccount_id: accountId(accountAddress),
          ...createdDefaults(event),
        });
      }
      break;

    case RestrictionType.Freeze:
      if (existing) {
        context.WhitelistedInvestor.set({
          ...existing,
          isFrozen: true,
          ...updatedDefaults(event),
        });
      } else {
        context.WhitelistedInvestor.set({
          id,
          poolId,
          tokenId,
          accountAddress: accountAddress.toLowerCase(),
          centrifugeId: spokeCentrifugeId,
          isFrozen: true,
          validUntil: undefined,
          token_id: undefined,
          investorAccount_id: accountId(accountAddress),
          ...createdDefaults(event),
        });
      }
      break;

    case RestrictionType.Unfreeze:
      if (existing) {
        context.WhitelistedInvestor.set({
          ...existing,
          isFrozen: false,
          ...updatedDefaults(event),
        });
      } else {
        context.WhitelistedInvestor.set({
          id,
          poolId,
          tokenId,
          accountAddress: accountAddress.toLowerCase(),
          centrifugeId: spokeCentrifugeId,
          isFrozen: false,
          validUntil: undefined,
          token_id: undefined,
          investorAccount_id: accountId(accountAddress),
          ...createdDefaults(event),
        });
      }
      break;
  }
});

// --- NotifySharePrice: Set crosschainInProgress on TokenInstance ---

Hub.NotifySharePrice.handler(async ({ event, context }) => {
  const { centrifugeId: spokeCentrifugeIdRaw, poolId, scId: tokenId, poolPerShare } = event.params;
  const spokeCentrifugeId = spokeCentrifugeIdRaw.toString();

  const tiId = tokenInstanceId(spokeCentrifugeId, tokenId);
  const ti = await context.TokenInstance.get(tiId);
  if (!ti) {
    context.log.warn(`TokenInstance ${tiId} not found for NotifySharePrice`);
    return;
  }

  context.TokenInstance.set({
    ...ti,
    crosschainInProgress: "NotifySharePrice",
    ...updatedDefaults(event),
  });
});

// --- NotifyAssetPrice: Set crosschainInProgress on HoldingEscrow ---

Hub.NotifyAssetPrice.handler(async ({ event, context }) => {
  const { centrifugeId: spokeCentrifugeIdRaw, poolId, scId: tokenId, assetId, pricePoolPerAsset } = event.params;
  const spokeCentrifugeId = spokeCentrifugeIdRaw.toString();

  const heId = holdingEscrowId(tokenId, assetId);
  const existing = await context.HoldingEscrow.get(heId);

  if (existing) {
    context.HoldingEscrow.set({
      ...existing,
      crosschainInProgress: "NotifyAssetPrice",
      ...updatedDefaults(event),
    });
  }
});

// --- UpdateVault: Set crosschainInProgress on Vault ---

Hub.UpdateVault.handler(async ({ event, context }) => {
  const { poolId, scId: tokenId, assetId, vaultOrFactory, kind } = event.params;

  // kind: 0 = Link, 1 = Unlink
  const crosschainOp = Number(kind) === 0 ? "Link" : Number(kind) === 1 ? "Unlink" : null;
  if (!crosschainOp) return;

  // Find the vault by scanning for matching poolId/tokenId/assetId
  const vaults = await context.Vault.getWhere({ tokenId: { _eq: tokenId } });
  const vault = vaults.find((v: any) => v.poolId === poolId && v.assetId === assetId);
  if (!vault) {
    context.log.warn(`Vault not found for poolId=${poolId} tokenId=${tokenId} assetId=${assetId} in UpdateVault`);
    return;
  }

  context.Vault.set({
    ...vault,
    crosschainInProgress: crosschainOp,
    ...updatedDefaults(event),
  });
});

// --- UpdateContract: Routes to SyncManager / MerklePolicy / OnOfframp handlers ---

Hub.UpdateContract.handler(async ({ event, context }) => {
  const { centrifugeId: spokeCentrifugeIdRaw, poolId, scId: tokenId, target, payload } = event.params;
  const spokeCentrifugeId = spokeCentrifugeIdRaw.toString();

  // Try decoding as SyncManager trusted call (MaxReserve update)
  const decoded = decodeSyncManagerTrustedCall(payload);
  if (decoded && decoded.kind === "MaxReserve") {
    const { assetId, maxReserve } = decoded;
    // Find vault matching poolId/tokenId/assetId
    const vaults = await context.Vault.getWhere({ tokenId: { _eq: tokenId } });
    const vault = vaults.find((v: any) => v.poolId === poolId && v.assetId === assetId);
    if (vault) {
      context.Vault.set({
        ...vault,
        maxReserve,
        crosschainInProgress: "MaxReserve",
        ...updatedDefaults(event),
      });
    }
  }
  // Other UpdateContract payloads (MerklePolicy, OnOfframp) are handled
  // by their respective factory-deployed contract event handlers
});

// --- NotifyShareClass: Spoke acknowledgment of share class notification ---

Hub.NotifyShareClass.handler(async ({ event, context }) => {
  // Share class creation is tracked via ShareClassManager.AddShareClass
  // and Spoke.AddShareClass. This hub event is informational.
  const { centrifugeId: spokeCentrifugeIdRaw, poolId, scId: tokenId } = event.params;
  const spokeCentrifugeId = spokeCentrifugeIdRaw.toString();

  // Ensure PoolSpokeBlockchain relationship exists
  const psbId = poolSpokeBlockchainId(poolId, spokeCentrifugeId);
  const existing = await context.PoolSpokeBlockchain.get(psbId);
  if (!existing) {
    const spokeMetadata = getChainMetadata(spokeCentrifugeId);
    await context.Blockchain.getOrCreate({
      id: blockchainId(spokeCentrifugeId),
      centrifugeId: spokeCentrifugeId,
      network: spokeMetadata.network,
      lastPeriodStart: undefined,
      chainId: spokeMetadata.chainId ? Number(spokeMetadata.chainId) : undefined,
      name: spokeMetadata.network,
      explorer: spokeMetadata.explorer ?? undefined,
      icon: spokeMetadata.icon ?? undefined,
    });

    context.PoolSpokeBlockchain.set({
      id: psbId,
      poolId,
      centrifugeId: spokeCentrifugeId,
      pool_id: poolId.toString(),
      blockchain_id: blockchainId(spokeCentrifugeId),
      ...createdDefaults(event),
    });
  }
});

// --- NotifyShareMetadata: Informational hub event ---

Hub.NotifyShareMetadata.handler(async ({ event, context }) => {
  // Share metadata updates are tracked via ShareClassManager.UpdateMetadata.
  // This hub event indicates a metadata push to a spoke chain — informational only.
});

// --- UpdateShareHook: Informational hub event ---

Hub.UpdateShareHook.handler(async ({ event, context }) => {
  // Share hooks are protocol-level configurations. No entity tracking needed.
});

// --- ForwardTransferShares: Cross-chain share forwarding from hub ---

Hub.ForwardTransferShares.handler(async ({ event, context }) => {
  const { centrifugeId: toCentrifugeIdRaw, poolId, scId: tokenId, receiver, amount } = event.params;
  const hubCentrifugeId = getCentrifugeId(event.chainId);
  const toCentrifugeId = toCentrifugeIdRaw.toString();
  const toAddress = receiver.substring(0, 42).toLowerCase();

  // Ensure receiver account exists
  await context.Account.getOrCreate({
    id: accountId(toAddress),
    address: toAddress,
    ...createdDefaults(event),
  });

  // Create TRANSFER_IN for the receiver
  const tId = tokenIdFn(poolId, tokenId);
  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, toAddress, "TRANSFER_IN", event.transaction.hash),
    txHash: event.transaction.hash,
    centrifugeId: hubCentrifugeId,
    poolId,
    tokenId,
    type: "TRANSFER_IN",
    account: toAddress,
    epochIndex: undefined,
    tokenAmount: amount,
    currencyAmount: undefined,
    tokenPrice: undefined,
    transactionFee: undefined,
    fromAccount: undefined,
    toAccount: toAddress,
    fromCentrifugeId: hubCentrifugeId,
    toCentrifugeId,
    currencyAssetId: undefined,
    blockchain_id: blockchainId(hubCentrifugeId),
    pool_id: poolId.toString(),
    token_id: tId,
    currencyAsset_id: undefined,
    ...createdDefaults(event),
  });
});
