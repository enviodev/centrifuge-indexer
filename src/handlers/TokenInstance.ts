import { TokenInstance } from "generated";
import { getCentrifugeId, GLOBAL_ESCROW_ADDRESS } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import {
  tokenInstancePositionId,
  investorTransactionId,
  accountId,
  blockchainId,
  deploymentId,
  tokenId as tokenIdFn,
} from "../utils/ids";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

TokenInstance.Transfer.handler(async ({ event, context }) => {
  const { from, to, value: amount } = event.params;
  const tokenAddress = event.srcAddress.toLowerCase();
  const centrifugeId = getCentrifugeId(event.chainId);

  // Look up TokenInstance by address
  const tokenInstances = await context.TokenInstance.getWhere({ address: { _eq: tokenAddress } });
  const tokenInstance = tokenInstances[0];
  if (!tokenInstance) {
    context.log.warn(`TokenInstance not found for address ${tokenAddress}`);
    return;
  }
  const { tokenId } = tokenInstance;

  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();
  const isFromNull = fromLower === ZERO_ADDRESS;
  const isToNull = toLower === ZERO_ADDRESS;

  // Filter out globalEscrow transfers — these are protocol-level, not user transfers
  const isFromGlobalEscrow = fromLower === GLOBAL_ESCROW_ADDRESS;
  const isToGlobalEscrow = toLower === GLOBAL_ESCROW_ADDRESS;
  const isFromUserAccount = !isFromNull && !isFromGlobalEscrow;
  const isToUserAccount = !isToNull && !isToGlobalEscrow;

  // Update 'from' position balance
  if (isFromUserAccount) {
    const fromAddress = from.toLowerCase();
    await context.Account.getOrCreate({
      id: accountId(fromAddress),
      address: fromAddress,
      ...createdDefaults(event),
    });

    const fromTipId = tokenInstancePositionId(tokenId, centrifugeId, fromAddress);
    const fromPosition = await context.TokenInstancePosition.get(fromTipId);

    if (fromPosition) {
      const currentBalance = fromPosition.balance ?? 0n;
      // Only subtract if this position was created in a previous block (matching source logic)
      const newBalance = fromPosition.createdAtBlock < event.block.number
        ? (currentBalance > amount ? currentBalance - amount : 0n)
        : currentBalance;
      context.TokenInstancePosition.set({
        ...fromPosition,
        balance: newBalance,
        ...updatedDefaults(event),
      });
    } else {
      context.TokenInstancePosition.set({
        id: fromTipId,
        tokenId,
        centrifugeId,
        accountAddress: fromAddress,
        balance: 0n,
        isFrozen: false,
        tokenInstance_id: tokenInstance.id,
        account_id: accountId(fromAddress),
        ...createdDefaults(event),
      });
    }
  }

  // Update 'to' position balance
  if (isToUserAccount) {
    const toAddress = to.toLowerCase();
    await context.Account.getOrCreate({
      id: accountId(toAddress),
      address: toAddress,
      ...createdDefaults(event),
    });

    const toTipId = tokenInstancePositionId(tokenId, centrifugeId, toAddress);
    const toPosition = await context.TokenInstancePosition.get(toTipId);

    if (toPosition) {
      const currentBalance = toPosition.balance ?? 0n;
      const newBalance = toPosition.createdAtBlock < event.block.number
        ? currentBalance + amount
        : currentBalance;
      context.TokenInstancePosition.set({
        ...toPosition,
        balance: newBalance,
        ...updatedDefaults(event),
      });
    } else {
      context.TokenInstancePosition.set({
        id: toTipId,
        tokenId,
        centrifugeId,
        accountAddress: toAddress,
        balance: 0n,
        isFrozen: false,
        tokenInstance_id: tokenInstance.id,
        account_id: accountId(toAddress),
        ...createdDefaults(event),
      });
    }
  }

  // Look up Token for total issuance updates
  const token = await context.Token.get(tokenId);

  // Handle mint (from = 0x0) — increase total issuance
  if (isFromNull) {
    context.TokenInstance.set({
      ...tokenInstance,
      totalIssuance: (tokenInstance.totalIssuance ?? 0n) + amount,
      ...updatedDefaults(event),
    });
    if (token) {
      context.Token.set({
        ...token,
        totalIssuance: (token.totalIssuance ?? 0n) + amount,
        ...updatedDefaults(event),
      });
    }
  }

  // Handle burn (to = 0x0) — decrease total issuance
  if (isToNull) {
    const tiIssuance = tokenInstance.totalIssuance ?? 0n;
    context.TokenInstance.set({
      ...tokenInstance,
      totalIssuance: tiIssuance > amount ? tiIssuance - amount : 0n,
      ...updatedDefaults(event),
    });
    if (token) {
      const tIssuance = token.totalIssuance ?? 0n;
      context.Token.set({
        ...token,
        totalIssuance: tIssuance > amount ? tIssuance - amount : 0n,
        ...updatedDefaults(event),
      });
    }
  }

  // Handle user-to-user transfers (TRANSFER_IN / TRANSFER_OUT)
  if (isFromUserAccount && isToUserAccount && token) {
    const poolId = token.poolId;
    const fromAddress = from.toLowerCase();
    const toAddress = to.toLowerCase();

    const transferInId = investorTransactionId(poolId, tokenId, toAddress, "TRANSFER_IN", event.transaction.hash);
    context.InvestorTransaction.set({
      id: transferInId,
      txHash: event.transaction.hash,
      centrifugeId,
      poolId,
      tokenId,
      type: "TRANSFER_IN",
      account: toAddress,
      epochIndex: undefined,
      tokenAmount: amount,
      currencyAmount: undefined,
      tokenPrice: undefined,
      transactionFee: undefined,
      fromAccount: fromAddress,
      toAccount: toAddress,
      fromCentrifugeId: centrifugeId,
      toCentrifugeId: centrifugeId,
      currencyAssetId: undefined,
      blockchain_id: blockchainId(centrifugeId),
      pool_id: poolId.toString(),
      token_id: tokenIdFn(poolId, tokenId),
      currencyAsset_id: undefined,
      ...createdDefaults(event),
    });

    const transferOutId = investorTransactionId(poolId, tokenId, fromAddress, "TRANSFER_OUT", event.transaction.hash);
    context.InvestorTransaction.set({
      id: transferOutId,
      txHash: event.transaction.hash,
      centrifugeId,
      poolId,
      tokenId,
      type: "TRANSFER_OUT",
      account: fromAddress,
      epochIndex: undefined,
      tokenAmount: amount,
      currencyAmount: undefined,
      tokenPrice: undefined,
      transactionFee: undefined,
      fromAccount: fromAddress,
      toAccount: toAddress,
      fromCentrifugeId: centrifugeId,
      toCentrifugeId: centrifugeId,
      currencyAssetId: undefined,
      blockchain_id: blockchainId(centrifugeId),
      pool_id: poolId.toString(),
      token_id: tokenIdFn(poolId, tokenId),
      currencyAsset_id: undefined,
      ...createdDefaults(event),
    });
  }
});
