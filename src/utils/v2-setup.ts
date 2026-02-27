// V2 pool whitelisted investor initialization
// These investors were whitelisted in V2 but the Hub:UpdateRestriction events
// were only emitted in V2 and not replayed in V3. We manually initialize their
// state when the pool is first created to ensure they have proper whitelist records.

import { V2_POOLS, V2_MIGRATION_BLOCK, V2_MIGRATION_TIMESTAMP } from "./constants";
import { whitelistedInvestorId } from "./ids";

type HandlerContext = {
  WhitelistedInvestor: {
    get: (id: string) => Promise<any>;
    set: (entity: any) => void;
  };
  Account: {
    getOrCreate: (entity: any) => Promise<any>;
  };
};

export async function initV2WhitelistedInvestors(
  context: HandlerContext,
  poolId: bigint
): Promise<void> {
  for (const pool of Object.values(V2_POOLS)) {
    if (pool.poolId !== poolId) continue;

    for (const accountAddress of pool.whitelistedInvestors) {
      const id = whitelistedInvestorId(pool.tokenId, pool.centrifugeId, accountAddress);

      await context.Account.getOrCreate({
        id: accountAddress.toLowerCase(),
        address: accountAddress.toLowerCase(),
        createdAt: V2_MIGRATION_TIMESTAMP,
        createdAtBlock: V2_MIGRATION_BLOCK,
        createdAtTxHash: "0x",
        updatedAt: V2_MIGRATION_TIMESTAMP,
        updatedAtBlock: V2_MIGRATION_BLOCK,
        updatedAtTxHash: "0x",
      });

      const existing = await context.WhitelistedInvestor.get(id);
      if (!existing) {
        context.WhitelistedInvestor.set({
          id,
          poolId: pool.poolId,
          tokenId: pool.tokenId,
          accountAddress: accountAddress.toLowerCase(),
          centrifugeId: pool.centrifugeId,
          isFrozen: false,
          validUntil: undefined,
          token_id: undefined,
          investorAccount_id: accountAddress.toLowerCase(),
          createdAt: V2_MIGRATION_TIMESTAMP,
          createdAtBlock: V2_MIGRATION_BLOCK,
          createdAtTxHash: "0x",
          updatedAt: V2_MIGRATION_TIMESTAMP,
          updatedAtBlock: V2_MIGRATION_BLOCK,
          updatedAtTxHash: "0x",
        });
      }
    }
  }
}
