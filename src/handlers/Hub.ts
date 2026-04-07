import { Hub, HubV3_1 } from "generated";
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
  normalizeScId,
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

const _handleNotifyPool = async ({ event, context }: any) => {
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
};
Hub.NotifyPool.handler(_handleNotifyPool);

const _handleUpdateRestriction = async ({ event, context }: any) => {
  const { centrifugeId: spokeCentrifugeIdRaw, poolId, scId: _rawScId, payload } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
};
Hub.UpdateRestriction.handler(_handleUpdateRestriction);

// --- NotifySharePrice: Set crosschainInProgress on TokenInstance ---

const _handleNotifySharePrice = async ({ event, context }: any) => {
  const { centrifugeId: spokeCentrifugeIdRaw, poolId, scId: _rawScId, poolPerShare } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
};
Hub.NotifySharePrice.handler(_handleNotifySharePrice);

// --- NotifyAssetPrice: Set crosschainInProgress on HoldingEscrow ---

const _handleNotifyAssetPrice = async ({ event, context }: any) => {
  const { centrifugeId: spokeCentrifugeIdRaw, poolId, scId: _rawScId, assetId, pricePoolPerAsset } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
};
Hub.NotifyAssetPrice.handler(_handleNotifyAssetPrice);

// --- UpdateVault: Set crosschainInProgress on Vault ---

const _handleUpdateVault = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, assetId, vaultOrFactory, kind } = event.params;
  const tokenId = normalizeScId(_rawScId);

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
};
Hub.UpdateVault.handler(_handleUpdateVault);

// --- UpdateContract: Routes to SyncManager / MerklePolicy / OnOfframp handlers ---

const _handleUpdateContract = async ({ event, context }: any) => {
  const { centrifugeId: spokeCentrifugeIdRaw, poolId, scId: _rawScId, target, payload } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
};
Hub.UpdateContract.handler(_handleUpdateContract);

// --- NotifyShareClass: Spoke acknowledgment of share class notification ---

const _handleNotifyShareClass = async ({ event, context }: any) => {
  // Share class creation is tracked via ShareClassManager.AddShareClass
  // and Spoke.AddShareClass. This hub event is informational.
  const { centrifugeId: spokeCentrifugeIdRaw, poolId, scId: _rawScId } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
};
Hub.NotifyShareClass.handler(_handleNotifyShareClass);

// --- NotifyShareMetadata: Informational hub event ---

const _handleNotifyShareMetadata = async ({ event, context }: any) => {
  // Share metadata updates are tracked via ShareClassManager.UpdateMetadata.
  // This hub event indicates a metadata push to a spoke chain — informational only.
};
Hub.NotifyShareMetadata.handler(_handleNotifyShareMetadata);

// --- UpdateShareHook: Informational hub event ---

const _handleUpdateShareHook = async ({ event, context }: any) => {
  // Share hooks are protocol-level configurations. No entity tracking needed.
};
Hub.UpdateShareHook.handler(_handleUpdateShareHook);

// --- ForwardTransferShares: Cross-chain share forwarding from hub ---

const _handleForwardTransferShares = async ({ event, context }: any) => {
  const { centrifugeId: toCentrifugeIdRaw, poolId, scId: _rawScId, receiver, amount } = event.params;
  const tokenId = normalizeScId(_rawScId);
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
};
Hub.ForwardTransferShares.handler(_handleForwardTransferShares);

// === V3.1 Handler Registrations (delegates to V3 logic) ===

HubV3_1.V3_1NotifyPool.handler(_handleNotifyPool);
HubV3_1.V3_1UpdateRestriction.handler(_handleUpdateRestriction);
HubV3_1.V3_1NotifySharePrice.handler(_handleNotifySharePrice);
HubV3_1.V3_1NotifyAssetPrice.handler(_handleNotifyAssetPrice);
HubV3_1.V3_1UpdateVault.handler(_handleUpdateVault);
HubV3_1.V3_1UpdateContract.handler(_handleUpdateContract);
HubV3_1.V3_1NotifyShareClass.handler(_handleNotifyShareClass);
HubV3_1.V3_1NotifyShareMetadata.handler(_handleNotifyShareMetadata);
HubV3_1.V3_1UpdateShareHook.handler(_handleUpdateShareHook);
HubV3_1.V3_1ForwardTransferShares.handler(_handleForwardTransferShares);
