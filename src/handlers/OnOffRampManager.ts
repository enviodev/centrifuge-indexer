import { OnOfframpManagerFactory, OnOfframpManager } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import {
  onOffRampManagerId,
  offrampRelayerId,
  onRampAssetId,
  offRampAddressId,
  accountId,
  tokenId as tokenIdFn,
} from "../utils/ids";

// Register dynamically deployed OnOfframpManager contracts
OnOfframpManagerFactory.DeployOnOfframpManager.contractRegister(({ event, context }) => {
  context.addOnOfframpManager(event.params.manager);
});

OnOfframpManagerFactory.DeployOnOfframpManager.handler(async ({ event, context }) => {
  const { poolId, scId, manager } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const managerAddress = manager.toLowerCase();
  const tokenId = scId.toLowerCase();

  context.OnOffRampManager.set({
    id: onOffRampManagerId(managerAddress, centrifugeId),
    centrifugeId,
    address: managerAddress,
    poolId,
    tokenId,
    pool_id: poolId.toString(),
    token_id: tokenIdFn(poolId, tokenId),
    ...createdDefaults(event),
  });
});

// --- UpdateRelayer ---

OnOfframpManager.UpdateRelayer.handler(async ({ event, context }) => {
  const { relayer, isEnabled } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const managerAddress = event.srcAddress.toLowerCase();

  const manager = await context.OnOffRampManager.get(
    onOffRampManagerId(managerAddress, centrifugeId)
  );
  if (!manager) {
    context.log.warn(`OnOffRampManager not found for ${managerAddress}`);
    return;
  }
  const { poolId, tokenId } = manager;

  const relayerAddress = relayer.toLowerCase();
  const id = offrampRelayerId(tokenId, centrifugeId, relayerAddress);

  const existing = await context.OfframpRelayer.get(id);
  if (existing) {
    context.OfframpRelayer.set({
      ...existing,
      isEnabled,
      ...updatedDefaults(event),
    });
  } else {
    context.OfframpRelayer.set({
      id,
      centrifugeId,
      tokenId,
      poolId,
      address: relayerAddress,
      isEnabled,
      ...createdDefaults(event),
    });
  }
});

// --- UpdateOnramp ---

OnOfframpManager.UpdateOnramp.handler(async ({ event, context }) => {
  const { asset, isEnabled } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const managerAddress = event.srcAddress.toLowerCase();

  const manager = await context.OnOffRampManager.get(
    onOffRampManagerId(managerAddress, centrifugeId)
  );
  if (!manager) {
    context.log.warn(`OnOffRampManager not found for ${managerAddress}`);
    return;
  }
  const { poolId, tokenId } = manager;

  const assetAddress = asset.toLowerCase();
  const id = onRampAssetId(tokenId, centrifugeId, assetAddress);

  const existing = await context.OnRampAsset.get(id);
  if (existing) {
    context.OnRampAsset.set({
      ...existing,
      isEnabled,
      ...updatedDefaults(event),
    });
  } else {
    context.OnRampAsset.set({
      id,
      poolId,
      tokenId,
      centrifugeId,
      assetAddress,
      isEnabled,
      token_id: tokenIdFn(poolId, tokenId),
      onRampAssetRef_id: undefined,
      ...createdDefaults(event),
    });
  }
});

// --- UpdateOfframp ---

OnOfframpManager.UpdateOfframp.handler(async ({ event, context }) => {
  const { asset, receiver } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const managerAddress = event.srcAddress.toLowerCase();

  const manager = await context.OnOffRampManager.get(
    onOffRampManagerId(managerAddress, centrifugeId)
  );
  if (!manager) {
    context.log.warn(`OnOffRampManager not found for ${managerAddress}`);
    return;
  }
  const { poolId, tokenId } = manager;

  const assetAddress = asset.toLowerCase();
  const receiverAddress = receiver.toLowerCase();

  // Ensure Account for receiver
  await context.Account.getOrCreate({
    id: accountId(receiverAddress),
    address: receiverAddress,
    ...createdDefaults(event),
  });

  const id = offRampAddressId(tokenId, assetAddress, receiverAddress);
  const existing = await context.OffRampAddress.get(id);
  if (existing) {
    context.OffRampAddress.set({
      ...existing,
      ...updatedDefaults(event),
    });
  } else {
    context.OffRampAddress.set({
      id,
      poolId,
      tokenId,
      centrifugeId,
      assetAddress,
      receiverAddress,
      token_id: tokenIdFn(poolId, tokenId),
      offRampAssetRef_id: undefined,
      ...createdDefaults(event),
    });
  }
});
