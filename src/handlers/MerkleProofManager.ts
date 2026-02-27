import { MerkleProofManagerFactory, MerkleProofManager } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import { merkleProofManagerEntityId, policyId } from "../utils/ids";

// Register dynamically deployed MerkleProofManager contracts
MerkleProofManagerFactory.DeployMerkleProofManager.contractRegister(({ event, context }) => {
  context.addMerkleProofManager(event.params.manager);
});

MerkleProofManagerFactory.DeployMerkleProofManager.handler(async ({ event, context }) => {
  const { poolId, manager } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const managerAddress = manager.toLowerCase();

  context.MerkleProofManager.set({
    id: merkleProofManagerEntityId(managerAddress, centrifugeId),
    address: managerAddress,
    centrifugeId,
    poolId,
    pool_id: poolId.toString(),
    ...createdDefaults(event),
  });
});

// --- UpdatePolicy ---
// Source uses RPC readContract to get poolId — we look up the stored entity instead

MerkleProofManager.UpdatePolicy.handler(async ({ event, context }) => {
  const { strategist, newRoot } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const managerAddress = event.srcAddress.toLowerCase();

  const mpm = await context.MerkleProofManager.get(
    merkleProofManagerEntityId(managerAddress, centrifugeId)
  );
  if (!mpm) {
    context.log.warn(`MerkleProofManager not found for ${managerAddress}`);
    return;
  }
  const { poolId } = mpm;

  const id = policyId(poolId, centrifugeId);
  const existing = await context.Policy.get(id);
  if (existing) {
    context.Policy.set({
      ...existing,
      strategistAddress: strategist.toLowerCase(),
      root: newRoot,
      ...updatedDefaults(event),
    });
  } else {
    context.Policy.set({
      id,
      poolId,
      centrifugeId,
      strategistAddress: strategist.toLowerCase(),
      root: newRoot,
      pool_id: poolId.toString(),
      ...createdDefaults(event),
    });
  }
});
