import { indexer, type MerkleProofManager } from "envio";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import { merkleProofManagerEntityId, policyId } from "../utils/ids";

// Register dynamically deployed MerkleProofManager contracts
indexer.contractRegister(
  { contract: "MerkleProofManagerFactory", event: "DeployMerkleProofManager" },
  async ({ event, context }) => {
  context.chain.MerkleProofManager.add(event.params.manager);
}
);

indexer.onEvent(
  { contract: "MerkleProofManagerFactory", event: "DeployMerkleProofManager" },
  async ({ event, context }) => {
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
}
);

// --- UpdatePolicy ---
// Source uses RPC readContract to get poolId — we look up the stored entity instead

indexer.onEvent(
  { contract: "MerkleProofManager", event: "UpdatePolicy" },
  async ({ event, context }) => {
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
}
);
