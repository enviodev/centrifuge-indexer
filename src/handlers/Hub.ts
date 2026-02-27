import { Hub } from "generated";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import { poolSpokeBlockchainId, whitelistedInvestorId, accountId, blockchainId } from "../utils/ids";
import { getChainMetadata } from "../utils/chains";

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

// --- Remaining events (Phase 3+) ---

Hub.NotifyShareClass.handler(async ({ event, context }) => {});
Hub.NotifyShareMetadata.handler(async ({ event, context }) => {});
Hub.NotifySharePrice.handler(async ({ event, context }) => {});
Hub.NotifyAssetPrice.handler(async ({ event, context }) => {});
Hub.UpdateVault.handler(async ({ event, context }) => {});
Hub.UpdateShareHook.handler(async ({ event, context }) => {});
Hub.ForwardTransferShares.handler(async ({ event, context }) => {});
