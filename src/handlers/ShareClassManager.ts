import { ShareClassManager, ShareClassManagerV3_1 } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import { tokenId as tokenIdFn, blockchainId, holdingEscrowId, snapshotId, normalizeScId } from "../utils/ids";
import {
  handleUpdateDepositRequest,
  handleUpdateRedeemRequest,
  handleApproveDeposits,
  handleApproveRedeems,
  handleIssueShares,
  handleRevokeShares,
  handleClaimDeposit,
  handleClaimRedeem,
} from "./shared/orderLifecycle";

// --- AddShareClass (Long — with name/symbol/salt) ---

const _handleAddShareClassLong = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, index, name, symbol, salt } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  // Look up pool decimals
  const pool = await context.Pool.get(poolId.toString());
  const decimals = pool?.decimals;

  const tId = tokenIdFn(poolId, tokenId);
  const existing = await context.Token.get(tId);

  context.Token.set({
    id: tId,
    index: Number(index),
    isActive: true,
    centrifugeId,
    poolId,
    decimals,
    name,
    symbol,
    salt,
    totalIssuance: existing?.totalIssuance ?? undefined,
    tokenPrice: existing?.tokenPrice ?? undefined,
    tokenPriceComputedAt: existing?.tokenPriceComputedAt ?? undefined,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    ...(existing ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
};
ShareClassManager.AddShareClassLong.handler(_handleAddShareClassLong);

// --- AddShareClass (Short — no name/symbol/salt) ---

const _handleAddShareClassShort = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, index } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  const pool = await context.Pool.get(poolId.toString());
  const decimals = pool?.decimals;

  const tId = tokenIdFn(poolId, tokenId);
  const existing = await context.Token.get(tId);

  context.Token.set({
    id: tId,
    index: Number(index),
    isActive: true,
    centrifugeId,
    poolId,
    decimals,
    name: existing?.name ?? undefined,
    symbol: existing?.symbol ?? undefined,
    salt: existing?.salt ?? undefined,
    totalIssuance: existing?.totalIssuance ?? undefined,
    tokenPrice: existing?.tokenPrice ?? undefined,
    tokenPriceComputedAt: existing?.tokenPriceComputedAt ?? undefined,
    blockchain_id: blockchainId(centrifugeId),
    pool_id: poolId.toString(),
    ...(existing ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
};
ShareClassManager.AddShareClassShort.handler(_handleAddShareClassShort);

// --- UpdateMetadata ---

const _handleUpdateMetadata = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, name, symbol } = event.params;
  const tokenId = normalizeScId(_rawScId);

  const tId = tokenIdFn(poolId, tokenId);
  const existing = await context.Token.get(tId);
  if (!existing) {
    context.log.warn(`Token ${tId} not found for UpdateMetadata`);
    return;
  }

  context.Token.set({
    ...existing,
    name,
    symbol,
    ...updatedDefaults(event),
  });
};
ShareClassManager.UpdateMetadata.handler(_handleUpdateMetadata);

// --- UpdateShareClass ---

const _handleUpdateShareClass = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, navPoolPerShare: tokenPrice } = event.params;
  const tokenId = normalizeScId(_rawScId);

  const tId = tokenIdFn(poolId, tokenId);
  const existing = await context.Token.get(tId);
  if (!existing) {
    context.log.warn(`Token ${tId} not found for UpdateShareClass`);
    return;
  }

  context.Token.set({
    ...existing,
    tokenPrice,
    ...updatedDefaults(event),
  });

  // Event-triggered TokenSnapshot
  const trigger = "shareClassManagerV3:UpdateShareClass";
  context.TokenSnapshot.set({
    id: `${tId}-${event.block.number}-${trigger}`,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    trigger,
    triggerTxHash: event.transaction.hash,
    triggerChainId: event.chainId.toString(),
    tokenId: tId,
    tokenPrice,
    totalIssuance: existing.totalIssuance ?? undefined,
    tokenPriceComputedAt: existing.tokenPriceComputedAt ?? undefined,
  });
};
ShareClassManager.UpdateShareClass.handler(_handleUpdateShareClass);

// --- UpdatePricePoolPerShare (v3.1 — includes computedAt timestamp) ---

const _handleUpdatePricePoolPerShare = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, price: tokenPrice, computedAt: computedAtTimestamp } = event.params;
  const tokenId = normalizeScId(_rawScId);

  const tId = tokenIdFn(poolId, tokenId);
  const existing = await context.Token.get(tId);
  if (!existing) {
    context.log.warn(`Token ${tId} not found for UpdatePricePoolPerShare`);
    return;
  }

  // computedAt is a unix timestamp in seconds
  const computedAt = Number(computedAtTimestamp);

  context.Token.set({
    ...existing,
    tokenPrice,
    tokenPriceComputedAt: computedAt,
    ...updatedDefaults(event),
  });

  // Event-triggered TokenSnapshot
  const centrifugeId = getCentrifugeId(event.chainId);
  const trigger = "shareClassManagerV3_1:UpdatePricePoolPerShare";
  context.TokenSnapshot.set({
    id: `${tId}-${event.block.number}-${trigger}`,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    trigger,
    triggerTxHash: event.transaction.hash,
    triggerChainId: event.chainId.toString(),
    tokenId: tId,
    tokenPrice,
    totalIssuance: existing.totalIssuance ?? undefined,
    tokenPriceComputedAt: computedAt,
  });
};
ShareClassManager.UpdatePricePoolPerShare.handler(_handleUpdatePricePoolPerShare);

// --- Order Lifecycle Handlers ---

const _handleUpdateDepositRequest = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, depositAssetId, epoch, investor, pendingUserAssetAmount, pendingTotalAssetAmount, queuedUserAssetAmount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  await handleUpdateDepositRequest(
    { poolId, tokenId, depositAssetId, epoch: Number(epoch), investor, pendingUserAssetAmount, pendingTotalAssetAmount, queuedUserAssetAmount },
    event, context
  );
};
ShareClassManager.UpdateDepositRequest.handler(_handleUpdateDepositRequest);

const _handleUpdateRedeemRequest = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, payoutAssetId, epoch, investor, pendingUserShareAmount, pendingTotalShareAmount, queuedUserShareAmount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  await handleUpdateRedeemRequest(
    { poolId, tokenId, payoutAssetId, epoch: Number(epoch), investor, pendingUserShareAmount, pendingTotalShareAmount, queuedUserShareAmount },
    event, context
  );
};
ShareClassManager.UpdateRedeemRequest.handler(_handleUpdateRedeemRequest);

const _handleApproveDeposits = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, depositAssetId, epoch, approvedPoolAmount, approvedAssetAmount, pendingAssetAmount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  await handleApproveDeposits(
    { poolId, tokenId, depositAssetId, epoch: Number(epoch), approvedPoolAmount, approvedAssetAmount, pendingAssetAmount },
    event, context
  );

  // Event-triggered HoldingEscrowSnapshot
  const heId = holdingEscrowId(tokenId, depositAssetId);
  const he = await context.HoldingEscrow.get(heId);
  if (he) {
    const trigger = "shareClassManager:ApproveDeposits";
    context.HoldingEscrowSnapshot.set({
      id: snapshotId(`${tokenId}-${depositAssetId}`, event.block.number, trigger),
      timestamp: event.block.timestamp,
      blockNumber: event.block.number,
      trigger,
      triggerTxHash: event.transaction.hash,
      triggerChainId: event.chainId.toString(),
      tokenId,
      assetId: depositAssetId,
      assetAmount: he.assetAmount ?? undefined,
      assetPrice: he.assetPrice ?? undefined,
    });
  }
};
ShareClassManager.ApproveDeposits.handler(_handleApproveDeposits);

const _handleApproveRedeems = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, payoutAssetId, epoch, approvedShareAmount, pendingShareAmount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  await handleApproveRedeems(
    { poolId, tokenId, payoutAssetId, epoch: Number(epoch), approvedShareAmount, pendingShareAmount },
    event, context
  );

  // Event-triggered HoldingEscrowSnapshot
  const heId = holdingEscrowId(tokenId, payoutAssetId);
  const he = await context.HoldingEscrow.get(heId);
  if (he) {
    const trigger = "shareClassManager:ApproveRedeems";
    context.HoldingEscrowSnapshot.set({
      id: snapshotId(`${tokenId}-${payoutAssetId}`, event.block.number, trigger),
      timestamp: event.block.timestamp,
      blockNumber: event.block.number,
      trigger,
      triggerTxHash: event.transaction.hash,
      triggerChainId: event.chainId.toString(),
      tokenId,
      assetId: payoutAssetId,
      assetAmount: he.assetAmount ?? undefined,
      assetPrice: he.assetPrice ?? undefined,
    });
  }
};
ShareClassManager.ApproveRedeems.handler(_handleApproveRedeems);

const _handleIssueShares = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, depositAssetId, epoch, navPoolPerShare, navAssetPerShare, issuedShareAmount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  await handleIssueShares(
    { poolId, tokenId, depositAssetId, epoch: Number(epoch), navPoolPerShare, navAssetPerShare, issuedShareAmount },
    event, context
  );
};
ShareClassManager.IssueShares.handler(_handleIssueShares);

const _handleRevokeShares = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, payoutAssetId, epoch, navPoolPerShare, navAssetPerShare, revokedShareAmount, revokedAssetAmount, revokedPoolAmount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  await handleRevokeShares(
    { poolId, tokenId, payoutAssetId, epoch: Number(epoch), navPoolPerShare, navAssetPerShare, revokedShareAmount, revokedAssetAmount, revokedPoolAmount },
    event, context
  );
};
ShareClassManager.RevokeShares.handler(_handleRevokeShares);

const _handleClaimDeposit = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, epoch, investor, depositAssetId, paymentAssetAmount, claimedShareAmount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  await handleClaimDeposit(
    { poolId, tokenId, epoch: Number(epoch), investor, depositAssetId, paymentAssetAmount, claimedShareAmount },
    event, context
  );
};
ShareClassManager.ClaimDeposit.handler(_handleClaimDeposit);

const _handleClaimRedeem = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, epoch, investor, payoutAssetId, paymentShareAmount, claimedAssetAmount } = event.params;
  const tokenId = normalizeScId(_rawScId);
  await handleClaimRedeem(
    { poolId, tokenId, epoch: Number(epoch), investor, payoutAssetId, paymentShareAmount, claimedAssetAmount },
    event, context
  );
};
ShareClassManager.ClaimRedeem.handler(_handleClaimRedeem);

// --- RemoteIssueShares: Cross-chain share issuance notification ---

const _handleRemoteIssueShares = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, issuedShareAmount } = event.params;
  const tokenId = normalizeScId(_rawScId);

  const tId = tokenIdFn(poolId, tokenId);
  const existing = await context.Token.get(tId);
  if (!existing) {
    context.log.warn(`Token ${tId} not found for RemoteIssueShares`);
    return;
  }

  context.Token.set({
    ...existing,
    totalIssuance: (existing.totalIssuance ?? 0n) + issuedShareAmount,
    ...updatedDefaults(event),
  });
};
ShareClassManager.RemoteIssueShares.handler(_handleRemoteIssueShares);

// --- RemoteRevokeShares: Cross-chain share revocation notification ---

const _handleRemoteRevokeShares = async ({ event, context }: any) => {
  const { poolId, scId: _rawScId, revokedShareAmount } = event.params;
  const tokenId = normalizeScId(_rawScId);

  const tId = tokenIdFn(poolId, tokenId);
  const existing = await context.Token.get(tId);
  if (!existing) {
    context.log.warn(`Token ${tId} not found for RemoteRevokeShares`);
    return;
  }

  const current = existing.totalIssuance ?? 0n;
  context.Token.set({
    ...existing,
    totalIssuance: current > revokedShareAmount ? current - revokedShareAmount : 0n,
    ...updatedDefaults(event),
  });
};
ShareClassManager.RemoteRevokeShares.handler(_handleRemoteRevokeShares);

// === V3.1 Handler Registrations (delegates to V3 logic) ===

ShareClassManagerV3_1.V3_1AddShareClassLong.handler(_handleAddShareClassLong);
ShareClassManagerV3_1.V3_1AddShareClassShort.handler(_handleAddShareClassShort);
ShareClassManagerV3_1.V3_1UpdateMetadata.handler(_handleUpdateMetadata);
ShareClassManagerV3_1.V3_1UpdateShareClass.handler(_handleUpdateShareClass);
ShareClassManagerV3_1.V3_1UpdatePricePoolPerShare.handler(_handleUpdatePricePoolPerShare);
ShareClassManagerV3_1.V3_1UpdateDepositRequest.handler(_handleUpdateDepositRequest);
ShareClassManagerV3_1.V3_1UpdateRedeemRequest.handler(_handleUpdateRedeemRequest);
ShareClassManagerV3_1.V3_1ApproveDeposits.handler(_handleApproveDeposits);
ShareClassManagerV3_1.V3_1ApproveRedeems.handler(_handleApproveRedeems);
ShareClassManagerV3_1.V3_1IssueShares.handler(_handleIssueShares);
ShareClassManagerV3_1.V3_1RevokeShares.handler(_handleRevokeShares);
ShareClassManagerV3_1.V3_1ClaimDeposit.handler(_handleClaimDeposit);
ShareClassManagerV3_1.V3_1ClaimRedeem.handler(_handleClaimRedeem);
ShareClassManagerV3_1.V3_1RemoteIssueShares.handler(_handleRemoteIssueShares);
ShareClassManagerV3_1.V3_1RemoteRevokeShares.handler(_handleRemoteRevokeShares);
