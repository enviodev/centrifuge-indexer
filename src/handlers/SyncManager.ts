import { SyncMgr } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { updatedDefaults } from "../utils/defaults";
import { normalizeScId } from "../utils/ids";

// --- SetMaxReserve: Spoke-side max reserve update, clears crosschainInProgress ---

SyncMgr.SetMaxReserve.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, asset: assetAddress, maxReserve } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  // Find vault by tokenId + poolId + assetAddress
  const vaults = await context.Vault.getWhere({ tokenId: { _eq: tokenId } });
  const vault = vaults.find(
    (v: any) => v.poolId === poolId && v.assetAddress === assetAddress.toLowerCase()
  );

  if (!vault) {
    context.log.warn(
      `Vault not found for poolId=${poolId} tokenId=${tokenId} asset=${assetAddress} in SetMaxReserve`
    );
    return;
  }

  context.Vault.set({
    ...vault,
    maxReserve,
    crosschainInProgress: undefined,
    ...updatedDefaults(event),
  });
});
