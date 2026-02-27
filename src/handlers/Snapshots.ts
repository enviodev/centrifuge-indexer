import { onBlock } from "generated";
import { getCentrifugeId, networkNames, skipBlocks } from "../utils/chains";
import { snapshotId, blockchainId } from "../utils/ids";

// Chain configurations matching config.yaml start blocks
// `as const` ensures chainId is a literal union type matching onBlock's expected chain type
const CHAINS = [
  { chainId: 1, startBlock: 22924235 },
  { chainId: 42161, startBlock: 357982308 },
  { chainId: 8453, startBlock: 32901251 },
  { chainId: 43114, startBlock: 65492900 },
  { chainId: 56, startBlock: 54800894 },
  { chainId: 98866, startBlock: 11931870 },
] as const;

for (const { chainId, startBlock } of CHAINS) {
  const chainIdStr = chainId.toString();
  const chainName = networkNames[chainIdStr] ?? chainIdStr;
  const interval = skipBlocks[chainIdStr] ?? 300;
  const centrifugeId = getCentrifugeId(chainId);

  onBlock(
    { name: `Snapshot_${chainName}`, chain: chainId, interval, startBlock },
    async ({ block, context }) => {
      const trigger = `${chainName}:NewPeriod`;
      // blockEvent type only exposes `number`; timestamp may be available at runtime
      const blockTimestamp: number = (block as any).timestamp ?? 0;

      // Update Blockchain.lastPeriodStart
      const bcId = blockchainId(centrifugeId);
      const blockchain = await context.Blockchain.get(bcId);
      if (blockchain) {
        context.Blockchain.set({
          ...blockchain,
          lastPeriodStart: blockTimestamp,
        });
      }

      // Pool snapshots (pools live on hub chain centrifugeId "1")
      const pools = await context.Pool.getWhere({ centrifugeId: { _eq: centrifugeId } });
      for (const pool of pools) {
        if (!pool.isActive) continue;
        context.PoolSnapshot.set({
          id: snapshotId(pool.id, block.number, trigger),
          timestamp: blockTimestamp,
          blockNumber: block.number,
          trigger,
          triggerTxHash: undefined,
          triggerChainId: chainIdStr,
          snapshotPoolId: BigInt(pool.id),
          currency: pool.currency ?? undefined,
          pool_id: pool.id,
        });
      }

      // Token snapshots
      const tokens = await context.Token.getWhere({ centrifugeId: { _eq: centrifugeId } });
      for (const token of tokens) {
        if (!token.isActive) continue;
        context.TokenSnapshot.set({
          id: snapshotId(token.id, block.number, trigger),
          timestamp: blockTimestamp,
          blockNumber: block.number,
          trigger,
          triggerTxHash: undefined,
          triggerChainId: chainIdStr,
          tokenId: token.id,
          tokenPrice: token.tokenPrice ?? undefined,
          totalIssuance: token.totalIssuance ?? undefined,
          tokenPriceComputedAt: token.tokenPriceComputedAt ?? undefined,
        });
      }

      // TokenInstance snapshots
      const tokenInstances = await context.TokenInstance.getWhere({
        centrifugeId: { _eq: centrifugeId },
      });
      for (const ti of tokenInstances) {
        if (!ti.isActive) continue;
        context.TokenInstanceSnapshot.set({
          id: snapshotId(ti.id, block.number, trigger),
          timestamp: blockTimestamp,
          blockNumber: block.number,
          trigger,
          triggerTxHash: undefined,
          triggerChainId: chainIdStr,
          tokenId: ti.tokenId,
          centrifugeId: ti.centrifugeId,
          tokenPrice: ti.tokenPrice ?? undefined,
          totalIssuance: ti.totalIssuance ?? undefined,
        });
      }

      // HoldingEscrow snapshots
      const holdingEscrows = await context.HoldingEscrow.getWhere({
        centrifugeId: { _eq: centrifugeId },
      });
      for (const he of holdingEscrows) {
        if (!he.assetAmount || he.assetAmount === 0n) continue;
        context.HoldingEscrowSnapshot.set({
          id: snapshotId(`${he.tokenId}-${he.assetId}`, block.number, trigger),
          timestamp: blockTimestamp,
          blockNumber: block.number,
          trigger,
          triggerTxHash: undefined,
          triggerChainId: chainIdStr,
          tokenId: he.tokenId,
          assetId: he.assetId,
          assetAmount: he.assetAmount ?? undefined,
          assetPrice: he.assetPrice ?? undefined,
        });
      }
    }
  );
}
