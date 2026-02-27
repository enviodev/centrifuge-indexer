import { PoolEscrowFactory, PoolEscrow } from "generated";
import { getCentrifugeId, networkNames, explorerUrls, chainIcons } from "../utils/chains";
import { createdDefaults } from "../utils/defaults";
import { escrowId, blockchainId } from "../utils/ids";

// Register dynamically deployed PoolEscrow contracts
PoolEscrowFactory.DeployPoolEscrow.contractRegister(({ event, context }) => {
  context.addPoolEscrow(event.params.escrow);
});

PoolEscrowFactory.DeployPoolEscrow.handler(async ({ event, context }) => {
  const { poolId, escrow: escrowAddress } = event.params;
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

  // Create Escrow entity
  context.Escrow.set({
    id: escrowId(escrowAddress, centrifugeId),
    address: escrowAddress.toLowerCase(),
    poolId,
    centrifugeId,
    blockchain_id: blockchainId(centrifugeId),
    ...createdDefaults(event),
  });
});

// --- PoolEscrow events (Phase 3+) ---

PoolEscrow.EscrowDeposit.handler(async ({ event, context }) => {});
PoolEscrow.EscrowWithdraw.handler(async ({ event, context }) => {});
