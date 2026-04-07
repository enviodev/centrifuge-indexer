import { BatchRequestManager } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import {
  vaultId as vaultIdFn,
  tokenId as tokenIdFn,
  investorTransactionId,
  accountId,
  blockchainId,
  normalizeScId,
} from "../utils/ids";

// --- AddVault: Register a vault in the batch request manager ---

BatchRequestManager.AddVault.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, assetId, vault: vaultAddress } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  const id = vaultIdFn(vaultAddress, centrifugeId);
  const vault = await context.Vault.get(id);
  if (vault) {
    context.Vault.set({
      ...vault,
      manager: event.srcAddress.toLowerCase(),
      ...updatedDefaults(event),
    });
  }
});

// --- RemoveVault: Unregister a vault from the batch request manager ---

BatchRequestManager.RemoveVault.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, assetId, vault: vaultAddress } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  const id = vaultIdFn(vaultAddress, centrifugeId);
  const vault = await context.Vault.get(id);
  if (vault) {
    context.Vault.set({
      ...vault,
      manager: undefined,
      ...updatedDefaults(event),
    });
  }
});

// --- TriggerRedeemRequest: Forced redeem triggered by the request manager ---

BatchRequestManager.TriggerRedeemRequest.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, user, asset: assetAddress, shares } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);
  const investor = user.toLowerCase();

  // Ensure account exists
  await context.Account.getOrCreate({
    id: accountId(investor),
    address: investor,
    ...createdDefaults(event),
  });

  // Look up asset
  const assets = await context.Asset.getWhere({ address: { _eq: assetAddress.toLowerCase() } });
  const asset = assets[0];

  // Create InvestorTransaction for the triggered redeem
  const tId = tokenIdFn(poolId, tokenId);
  context.InvestorTransaction.set({
    id: investorTransactionId(poolId, tokenId, investor, "REDEEM_REQUEST_UPDATED", event.transaction.hash),
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
    currencyAssetId: asset ? BigInt(asset.id) : undefined,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    token_id: tId,
    currencyAsset_id: asset ? asset.id : undefined,
    ...createdDefaults(event),
  });
});
