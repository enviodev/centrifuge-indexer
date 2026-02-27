import { HubRegistry } from "generated";
import "./Snapshots"; // Side-effect import — registers onBlock handlers
import { getCentrifugeId, networkNames, explorerUrls, chainIcons, GLOBAL_ESCROW_ADDRESS } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import { poolManagerId, assetRegistrationId, accountId, blockchainId, deploymentId } from "../utils/ids";
import { ISO_CURRENCIES } from "../utils/constants";
import { fetchPoolMetadata } from "../effects/ipfs";
import { initV2WhitelistedInvestors } from "../utils/v2-setup";

const ipfsHashRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[A-Za-z2-7]{58})$/;

HubRegistry.NewPool.handler(async ({ event, context }) => {
  const { poolId, currency, manager } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const chainIdStr = event.chainId.toString();

  // getOrCreate Blockchain
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

  // getOrCreate Deployment (stores globalEscrow address per chain)
  await context.Deployment.getOrCreate({
    id: deploymentId(event.chainId),
    chainId: chainIdStr,
    centrifugeId,
    globalEscrow: GLOBAL_ESCROW_ADDRESS,
    blockchain_id: blockchainId(centrifugeId),
    ...createdDefaults(event),
  });

  // Determine decimals: ISO currencies (assetId < 1000) use 18, else look up Asset
  let decimals: number | undefined;
  if (currency < 1000n) {
    decimals = 18;
  } else {
    const asset = await context.Asset.get(currency.toString());
    decimals = asset?.decimals;
  }

  // Create Pool
  context.Pool.set({
    id: poolId.toString(),
    centrifugeId,
    isActive: true,
    currency,
    decimals,
    metadata: undefined,
    name: undefined,
    blockchain_id: blockchainId(centrifugeId),
    asset_id: undefined,
    ...createdDefaults(event),
  });

  // getOrCreate Account for manager
  const managerAddress = manager.toLowerCase();
  await context.Account.getOrCreate({
    id: accountId(manager),
    address: managerAddress,
    ...createdDefaults(event),
  });

  // getOrCreate PoolManager
  const pmId = poolManagerId(manager, centrifugeId, poolId);
  const existingPm = await context.PoolManager.get(pmId);
  context.PoolManager.set({
    id: pmId,
    address: managerAddress,
    centrifugeId,
    poolId,
    isHubManager: true,
    isBalancesheetManager: existingPm?.isBalancesheetManager ?? false,
    pool_id: poolId.toString(),
    ...(existingPm ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Initialize V2 whitelisted investors if this is a known V2 pool
  await initV2WhitelistedInvestors(context, poolId);
});

HubRegistry.NewAsset.handler(async ({ event, context }) => {
  const { assetId, decimals } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);

  // getOrCreate Blockchain (may already exist)
  const chainIdStr = event.chainId.toString();
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

  // Create AssetRegistration
  context.AssetRegistration.set({
    id: assetRegistrationId(assetId, centrifugeId),
    assetId,
    centrifugeId,
    blockchain_id: blockchainId(centrifugeId),
    asset_id: assetId.toString(),
    ...createdDefaults(event),
  });

  // If ISO currency (assetId < 1000), create Asset entity
  if (assetId < 1000n) {
    const isoCurrency = ISO_CURRENCIES[assetId.toString()];
    await context.Asset.getOrCreate({
      id: assetId.toString(),
      centrifugeId: undefined,
      address: undefined,
      assetTokenId: undefined,
      decimals: Number(decimals),
      name: isoCurrency?.name,
      symbol: isoCurrency?.symbol,
      blockchain_id: undefined,
      ...createdDefaults(event),
    });
  }
});

HubRegistry.UpdateCurrency.handler(async ({ event, context }) => {
  const { poolId, currency } = event.params;

  const pool = await context.Pool.get(poolId.toString());
  if (!pool) {
    context.log.warn(`Pool ${poolId} not found for UpdateCurrency`);
    return;
  }

  context.Pool.set({
    ...pool,
    currency,
    ...updatedDefaults(event),
  });
});

HubRegistry.UpdateManager.handler(async ({ event, context }) => {
  const { poolId, manager, canManage } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);
  const managerAddress = manager.toLowerCase();

  // getOrCreate Account
  await context.Account.getOrCreate({
    id: accountId(manager),
    address: managerAddress,
    ...createdDefaults(event),
  });

  // getOrCreate PoolManager then update isHubManager
  const pmId = poolManagerId(manager, centrifugeId, poolId);
  const existing = await context.PoolManager.get(pmId);
  if (existing) {
    context.PoolManager.set({
      ...existing,
      isHubManager: canManage,
      ...updatedDefaults(event),
    });
  } else {
    context.PoolManager.set({
      id: pmId,
      address: managerAddress,
      centrifugeId,
      poolId,
      isHubManager: canManage,
      isBalancesheetManager: false,
      pool_id: poolId.toString(),
      ...createdDefaults(event),
    });
  }
});

HubRegistry.SetMetadata.handler(async ({ event, context }) => {
  const { poolId, metadata: rawMetadata } = event.params;

  const pool = await context.Pool.get(poolId.toString());
  if (!pool) {
    context.log.warn(`Pool ${poolId} not found for SetMetadata`);
    return;
  }

  // Decode hex bytes to UTF-8
  let metadata = Buffer.from(rawMetadata.slice(2), "hex").toString("utf-8");

  // Check if it's an IPFS hash and fetch pool name
  const isIpfs = ipfsHashRegex.test(metadata);
  let name = pool.name;
  if (isIpfs) {
    metadata = `ipfs://${metadata}`;
    try {
      const raw = await context.effect(fetchPoolMetadata, metadata);
      const ipfsData = JSON.parse(raw);
      if (ipfsData?.pool?.name) {
        name = ipfsData.pool.name;
      }
    } catch (e) {
      context.log.warn(`Failed to fetch IPFS metadata for pool ${poolId}: ${e}`);
    }
  }

  context.Pool.set({
    ...pool,
    metadata,
    name,
    ...updatedDefaults(event),
  });
});
