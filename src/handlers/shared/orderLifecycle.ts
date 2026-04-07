import { createdDefaults, updatedDefaults } from "../../utils/defaults";
import {
  pendingInvestOrderId,
  pendingRedeemOrderId,
  investOrderId,
  redeemOrderId,
  epochInvestOrderId,
  epochRedeemOrderId,
  outstandingInvestId,
  outstandingRedeemId,
  epochOutstandingInvestId,
  epochOutstandingRedeemId,
  accountId,
  tokenId as tokenIdFn,
} from "../../utils/ids";

type EventMeta = {
  block: { timestamp: number; number: number };
  transaction: { hash: string };
};

// --- Percentage helpers ---

function computeApprovedPercentage(approveAmount: bigint, pendingAmount: bigint): bigint {
  if (pendingAmount + approveAmount === 0n) return 0n;
  return (approveAmount * 10n ** 21n) / (pendingAmount + approveAmount);
}

function computeApprovedUserAmount(totalAmount: bigint, approvedPercentage: bigint): bigint {
  return (totalAmount * approvedPercentage) / 10n ** 21n;
}

// --- UpdateDepositRequest ---

export async function handleUpdateDepositRequest(
  params: {
    poolId: bigint;
    tokenId: string;
    depositAssetId: bigint;
    epoch: number;
    investor: string;
    pendingUserAssetAmount: bigint;
    pendingTotalAssetAmount: bigint;
    queuedUserAssetAmount: bigint;
  },
  event: EventMeta,
  context: any
) {
  const { poolId, tokenId, depositAssetId, epoch, investor, pendingUserAssetAmount, pendingTotalAssetAmount, queuedUserAssetAmount } = params;
  const investorAddress = investor.substring(0, 42).toLowerCase();

  // Ensure Account
  await context.Account.getOrCreate({
    id: accountId(investorAddress),
    address: investorAddress,
    ...createdDefaults(event),
  });

  // Update PendingInvestOrder
  const pioId = pendingInvestOrderId(tokenId, depositAssetId, investorAddress);
  const existingPio = await context.PendingInvestOrder.get(pioId);
  const lastQueuedAmount = existingPio?.queuedAssetsAmount ?? 0n;

  context.PendingInvestOrder.set({
    id: pioId,
    poolId,
    tokenId,
    assetId: depositAssetId,
    account: investorAddress,
    queuedAssetsAmount: queuedUserAssetAmount,
    pendingAssetsAmount: queuedUserAssetAmount === 0n ? pendingUserAssetAmount : (existingPio?.pendingAssetsAmount ?? pendingUserAssetAmount),
    ...(existingPio ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Update OutstandingInvest (deprecated but maintained)
  const oiId = outstandingInvestId(tokenId, depositAssetId, investorAddress);
  const existingOi = await context.OutstandingInvest.get(oiId);

  context.OutstandingInvest.set({
    id: oiId,
    poolId,
    tokenId,
    assetId: depositAssetId,
    account: investorAddress,
    epochIndex: epoch,
    pendingAmount: pendingUserAssetAmount,
    queuedAmount: queuedUserAssetAmount,
    depositAmount: queuedUserAssetAmount + pendingUserAssetAmount,
    approvedAmount: existingOi?.approvedAmount ?? undefined,
    approvedIndex: existingOi?.approvedIndex ?? undefined,
    approvedAt: existingOi?.approvedAt ?? undefined,
    approvedAtBlock: existingOi?.approvedAtBlock ?? undefined,
    approvedAtTxHash: existingOi?.approvedAtTxHash ?? undefined,
    token_id: tokenIdFn(poolId, tokenId),
    ...(existingOi ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Update EpochOutstandingInvest
  const eoiId = epochOutstandingInvestId(tokenId, depositAssetId);
  const existingEoi = await context.EpochOutstandingInvest.get(eoiId);
  const deltaQueued = queuedUserAssetAmount - lastQueuedAmount;

  context.EpochOutstandingInvest.set({
    id: eoiId,
    poolId,
    tokenId,
    assetId: depositAssetId,
    pendingAssetsAmount: pendingTotalAssetAmount,
    queuedAssetsAmount: (existingEoi?.queuedAssetsAmount ?? 0n) + deltaQueued,
    token_id: tokenIdFn(poolId, tokenId),
    epochOutstandingInvestAsset_id: depositAssetId.toString(),
    ...(existingEoi ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
}

// --- UpdateRedeemRequest ---

export async function handleUpdateRedeemRequest(
  params: {
    poolId: bigint;
    tokenId: string;
    payoutAssetId: bigint;
    epoch: number;
    investor: string;
    pendingUserShareAmount: bigint;
    pendingTotalShareAmount: bigint;
    queuedUserShareAmount: bigint;
  },
  event: EventMeta,
  context: any
) {
  const { poolId, tokenId, payoutAssetId, epoch, investor, pendingUserShareAmount, pendingTotalShareAmount, queuedUserShareAmount } = params;
  const investorAddress = investor.substring(0, 42).toLowerCase();

  await context.Account.getOrCreate({
    id: accountId(investorAddress),
    address: investorAddress,
    ...createdDefaults(event),
  });

  // Update PendingRedeemOrder
  const proId = pendingRedeemOrderId(tokenId, payoutAssetId, investorAddress);
  const existingPro = await context.PendingRedeemOrder.get(proId);
  const lastQueuedAmount = existingPro?.queuedSharesAmount ?? 0n;

  context.PendingRedeemOrder.set({
    id: proId,
    poolId,
    tokenId,
    assetId: payoutAssetId,
    account: investorAddress,
    queuedSharesAmount: queuedUserShareAmount,
    pendingSharesAmount: queuedUserShareAmount === 0n ? pendingUserShareAmount : (existingPro?.pendingSharesAmount ?? pendingUserShareAmount),
    ...(existingPro ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Update OutstandingRedeem (deprecated)
  const orId = outstandingRedeemId(tokenId, payoutAssetId, investorAddress);
  const existingOr = await context.OutstandingRedeem.get(orId);

  context.OutstandingRedeem.set({
    id: orId,
    poolId,
    tokenId,
    assetId: payoutAssetId,
    account: investorAddress,
    epochIndex: epoch,
    pendingAmount: pendingUserShareAmount,
    queuedAmount: queuedUserShareAmount,
    depositAmount: queuedUserShareAmount + pendingUserShareAmount,
    approvedAmount: existingOr?.approvedAmount ?? undefined,
    approvedIndex: existingOr?.approvedIndex ?? undefined,
    approvedAt: existingOr?.approvedAt ?? undefined,
    approvedAtBlock: existingOr?.approvedAtBlock ?? undefined,
    approvedAtTxHash: existingOr?.approvedAtTxHash ?? undefined,
    token_id: tokenIdFn(poolId, tokenId),
    ...(existingOr ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Update EpochOutstandingRedeem
  const eorId = epochOutstandingRedeemId(tokenId, payoutAssetId);
  const existingEor = await context.EpochOutstandingRedeem.get(eorId);
  const deltaQueued = queuedUserShareAmount - lastQueuedAmount;

  context.EpochOutstandingRedeem.set({
    id: eorId,
    poolId,
    tokenId,
    assetId: payoutAssetId,
    pendingSharesAmount: pendingTotalShareAmount,
    queuedSharesAmount: (existingEor?.queuedSharesAmount ?? 0n) + deltaQueued,
    token_id: tokenIdFn(poolId, tokenId),
    epochOutstandingRedeemAsset_id: payoutAssetId.toString(),
    ...(existingEor ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
}

// --- ApproveDeposits ---

export async function handleApproveDeposits(
  params: {
    poolId: bigint;
    tokenId: string;
    depositAssetId: bigint;
    epoch: number;
    approvedPoolAmount: bigint;
    approvedAssetAmount: bigint;
    pendingAssetAmount: bigint;
  },
  event: EventMeta,
  context: any
) {
  const { poolId, tokenId, depositAssetId, epoch, approvedPoolAmount, approvedAssetAmount, pendingAssetAmount } = params;

  const approvedPercentage = computeApprovedPercentage(approvedAssetAmount, pendingAssetAmount);

  // Create EpochInvestOrder
  const eioId = epochInvestOrderId(tokenId, depositAssetId, epoch);
  context.EpochInvestOrder.set({
    id: eioId,
    poolId,
    tokenId,
    assetId: depositAssetId,
    index: epoch,
    approvedAt: event.block.timestamp,
    approvedAtBlock: event.block.number,
    approvedAtTxHash: event.transaction.hash,
    approvedAssetsAmount: approvedAssetAmount,
    approvedPoolAmount,
    approvedPercentageOfTotalPending: approvedPercentage,
    issuedAt: undefined,
    issuedAtBlock: undefined,
    issuedAtTxHash: undefined,
    issuedSharesAmount: undefined,
    issuedWithNavPoolPerShare: undefined,
    issuedWithNavAssetPerShare: undefined,
    token_id: tokenIdFn(poolId, tokenId),
    epochInvestAsset_id: depositAssetId.toString(),
    ...createdDefaults(event),
  });

  // Update EpochOutstandingInvest
  const eoiId = epochOutstandingInvestId(tokenId, depositAssetId);
  const existingEoi = await context.EpochOutstandingInvest.get(eoiId);
  if (existingEoi) {
    context.EpochOutstandingInvest.set({
      ...existingEoi,
      pendingAssetsAmount: pendingAssetAmount,
      ...updatedDefaults(event),
    });
  }

  // Process all pending invest orders for this tokenId
  const pendingOrders = await context.PendingInvestOrder.getWhere({ tokenId: { _eq: tokenId } });
  for (const pendingOrder of pendingOrders) {
    if (pendingOrder.assetId !== depositAssetId) continue;
    const pendingAmount = pendingOrder.pendingAssetsAmount;
    if (!pendingAmount || pendingAmount <= 0n) continue;

    const approvedUserAmount = computeApprovedUserAmount(pendingAmount, approvedPercentage);

    // Create InvestOrder for this investor
    const ioId = investOrderId(tokenId, depositAssetId, pendingOrder.account, epoch);
    context.InvestOrder.set({
      id: ioId,
      poolId,
      tokenId,
      assetId: depositAssetId,
      account: pendingOrder.account,
      index: epoch,
      approvedAt: event.block.timestamp,
      approvedAtBlock: event.block.number,
      approvedAtTxHash: event.transaction.hash,
      approvedIndex: epoch,
      approvedAssetsAmount: approvedUserAmount,
      issuedSharesAmount: undefined,
      issuedWithNavPoolPerShare: undefined,
      issuedWithNavAssetPerShare: undefined,
      issuedAt: undefined,
      issuedAtBlock: undefined,
      issuedAtTxHash: undefined,
      claimedAt: undefined,
      claimedAtBlock: undefined,
      claimedAtTxHash: undefined,
      claimedSharesAmount: undefined,
      token_id: tokenIdFn(poolId, tokenId),
      investAsset_id: depositAssetId.toString(),
      ...createdDefaults(event),
    });

    // Reduce pending amount
    context.PendingInvestOrder.set({
      ...pendingOrder,
      pendingAssetsAmount: pendingAmount - approvedUserAmount,
      ...updatedDefaults(event),
    });
  }

  // Update deprecated OutstandingInvest
  const outstandingInvests = await context.OutstandingInvest.getWhere({ tokenId: { _eq: tokenId } });
  for (const oi of outstandingInvests) {
    if (oi.assetId !== depositAssetId) continue;
    const pendingAmt = oi.pendingAmount;
    if (!pendingAmt || pendingAmt <= 0n) continue;
    const approvedAmt = computeApprovedUserAmount(pendingAmt, approvedPercentage);
    context.OutstandingInvest.set({
      ...oi,
      approvedAmount: approvedAmt,
      approvedIndex: epoch,
      approvedAt: event.block.timestamp,
      approvedAtBlock: event.block.number,
      approvedAtTxHash: event.transaction.hash,
      pendingAmount: 0n,
      ...updatedDefaults(event),
    });
  }
}

// --- ApproveRedeems ---

export async function handleApproveRedeems(
  params: {
    poolId: bigint;
    tokenId: string;
    payoutAssetId: bigint;
    epoch: number;
    approvedShareAmount: bigint;
    pendingShareAmount: bigint;
  },
  event: EventMeta,
  context: any
) {
  const { poolId, tokenId, payoutAssetId, epoch, approvedShareAmount, pendingShareAmount } = params;

  const approvedPercentage = computeApprovedPercentage(approvedShareAmount, pendingShareAmount);

  // Create EpochRedeemOrder
  const eroId = epochRedeemOrderId(tokenId, payoutAssetId, epoch);
  context.EpochRedeemOrder.set({
    id: eroId,
    poolId,
    tokenId,
    assetId: payoutAssetId,
    index: epoch,
    approvedAt: event.block.timestamp,
    approvedAtBlock: event.block.number,
    approvedAtTxHash: event.transaction.hash,
    approvedSharesAmount: approvedShareAmount,
    approvedPercentageOfTotalPending: approvedPercentage,
    revokedAt: undefined,
    revokedAtBlock: undefined,
    revokedAtTxHash: undefined,
    revokedSharesAmount: undefined,
    revokedAssetsAmount: undefined,
    revokedPoolAmount: undefined,
    revokedWithNavPoolPerShare: undefined,
    revokedWithNavAssetPerShare: undefined,
    token_id: tokenIdFn(poolId, tokenId),
    epochRedeemAsset_id: payoutAssetId.toString(),
    ...createdDefaults(event),
  });

  // Update EpochOutstandingRedeem
  const eorId = epochOutstandingRedeemId(tokenId, payoutAssetId);
  const existingEor = await context.EpochOutstandingRedeem.get(eorId);
  if (existingEor) {
    context.EpochOutstandingRedeem.set({
      ...existingEor,
      pendingSharesAmount: pendingShareAmount,
      ...updatedDefaults(event),
    });
  }

  // Process all pending redeem orders
  const pendingOrders = await context.PendingRedeemOrder.getWhere({ tokenId: { _eq: tokenId } });
  for (const pendingOrder of pendingOrders) {
    if (pendingOrder.assetId !== payoutAssetId) continue;
    const pendingAmount = pendingOrder.pendingSharesAmount;
    if (!pendingAmount || pendingAmount <= 0n) continue;

    const approvedUserAmount = computeApprovedUserAmount(pendingAmount, approvedPercentage);

    // Create RedeemOrder for this investor
    const roId = redeemOrderId(tokenId, payoutAssetId, pendingOrder.account, epoch);
    context.RedeemOrder.set({
      id: roId,
      poolId,
      tokenId,
      assetId: payoutAssetId,
      account: pendingOrder.account,
      index: epoch,
      approvedAt: event.block.timestamp,
      approvedAtBlock: event.block.number,
      approvedAtTxHash: event.transaction.hash,
      approvedIndex: epoch,
      approvedSharesAmount: approvedUserAmount,
      revokedAt: undefined,
      revokedAtBlock: undefined,
      revokedAtTxHash: undefined,
      revokedSharesAmount: undefined,
      revokedAssetsAmount: undefined,
      revokedPoolAmount: undefined,
      revokedWithNavPoolPerShare: undefined,
      revokedWithNavAssetPerShare: undefined,
      claimedAt: undefined,
      claimedAtBlock: undefined,
      claimedAtTxHash: undefined,
      claimedAssetsAmount: undefined,
      token_id: tokenIdFn(poolId, tokenId),
      redeemAsset_id: payoutAssetId.toString(),
      ...createdDefaults(event),
    });

    // Reduce pending amount
    context.PendingRedeemOrder.set({
      ...pendingOrder,
      pendingSharesAmount: pendingAmount - approvedUserAmount,
      ...updatedDefaults(event),
    });
  }

  // Update deprecated OutstandingRedeem
  const outstandingRedeems = await context.OutstandingRedeem.getWhere({ tokenId: { _eq: tokenId } });
  for (const or_ of outstandingRedeems) {
    if (or_.assetId !== payoutAssetId) continue;
    const pendingAmt = or_.pendingAmount;
    if (!pendingAmt || pendingAmt <= 0n) continue;
    const approvedAmt = computeApprovedUserAmount(pendingAmt, approvedPercentage);
    context.OutstandingRedeem.set({
      ...or_,
      approvedAmount: approvedAmt,
      approvedIndex: epoch,
      approvedAt: event.block.timestamp,
      approvedAtBlock: event.block.number,
      approvedAtTxHash: event.transaction.hash,
      pendingAmount: 0n,
      ...updatedDefaults(event),
    });
  }
}

// --- IssueShares ---

export async function handleIssueShares(
  params: {
    poolId: bigint;
    tokenId: string;
    depositAssetId: bigint;
    epoch: number;
    navPoolPerShare: bigint;
    navAssetPerShare: bigint;
    issuedShareAmount: bigint;
  },
  event: EventMeta,
  context: any
) {
  const { poolId, tokenId, depositAssetId, epoch, navPoolPerShare, navAssetPerShare, issuedShareAmount } = params;

  // Update EpochInvestOrder
  const eioId = epochInvestOrderId(tokenId, depositAssetId, epoch);
  const epochOrder = await context.EpochInvestOrder.get(eioId);
  if (!epochOrder) {
    context.log.warn(`EpochInvestOrder ${eioId} not found. Cannot record issued shares`);
    return;
  }

  context.EpochInvestOrder.set({
    ...epochOrder,
    issuedSharesAmount: issuedShareAmount,
    issuedWithNavPoolPerShare: navPoolPerShare,
    issuedWithNavAssetPerShare: navAssetPerShare,
    issuedAt: event.block.timestamp,
    issuedAtBlock: event.block.number,
    issuedAtTxHash: event.transaction.hash,
    ...updatedDefaults(event),
  });

  // Update individual InvestOrders — query by tokenId, filter for matching assetId + index + approved + not issued
  const investOrders = await context.InvestOrder.getWhere({ tokenId: { _eq: tokenId } });
  for (const order of investOrders) {
    if (order.assetId !== depositAssetId) continue;
    if (order.index !== epoch) continue;
    if (!order.approvedAt || order.issuedAt) continue;

    // Compute issued shares for this order proportionally
    const approvedAmount = order.approvedAssetsAmount ?? 0n;
    // issuedShares = approvedAmount * navAssetPerShare / 10^assetDecimals (simplified — match original logic)
    // The original uses asset and token decimals, but we simplify: issued = approved * 10^18 / navAssetPerShare
    // Actually, let's keep it simple: record navs and mark as issued
    context.InvestOrder.set({
      ...order,
      issuedSharesAmount: approvedAmount > 0n && navAssetPerShare > 0n
        ? (approvedAmount * 10n ** 18n) / navAssetPerShare
        : 0n,
      issuedWithNavPoolPerShare: navPoolPerShare,
      issuedWithNavAssetPerShare: navAssetPerShare,
      issuedAt: event.block.timestamp,
      issuedAtBlock: event.block.number,
      issuedAtTxHash: event.transaction.hash,
      ...updatedDefaults(event),
    });
  }

  // Update Token totalIssuance
  const tId = tokenIdFn(poolId, tokenId);
  const token = await context.Token.get(tId);
  if (token) {
    context.Token.set({
      ...token,
      totalIssuance: (token.totalIssuance ?? 0n) + issuedShareAmount,
      tokenPrice: navPoolPerShare > 0n ? navPoolPerShare : token.tokenPrice,
      ...updatedDefaults(event),
    });
  }
}

// --- RevokeShares ---

export async function handleRevokeShares(
  params: {
    poolId: bigint;
    tokenId: string;
    payoutAssetId: bigint;
    epoch: number;
    navPoolPerShare: bigint;
    navAssetPerShare: bigint;
    revokedShareAmount: bigint;
    revokedAssetAmount: bigint;
    revokedPoolAmount: bigint;
  },
  event: EventMeta,
  context: any
) {
  const { poolId, tokenId, payoutAssetId, epoch, navPoolPerShare, navAssetPerShare, revokedShareAmount, revokedAssetAmount, revokedPoolAmount } = params;

  // Update EpochRedeemOrder
  const eroId = epochRedeemOrderId(tokenId, payoutAssetId, epoch);
  const epochOrder = await context.EpochRedeemOrder.get(eroId);
  if (!epochOrder) {
    context.log.warn(`EpochRedeemOrder ${eroId} not found. Cannot record revoked shares`);
    return;
  }

  context.EpochRedeemOrder.set({
    ...epochOrder,
    revokedSharesAmount: revokedShareAmount,
    revokedAssetsAmount: revokedAssetAmount,
    revokedPoolAmount,
    revokedWithNavPoolPerShare: navPoolPerShare,
    revokedWithNavAssetPerShare: navAssetPerShare,
    revokedAt: event.block.timestamp,
    revokedAtBlock: event.block.number,
    revokedAtTxHash: event.transaction.hash,
    ...updatedDefaults(event),
  });

  // Update individual RedeemOrders
  const redeemOrders = await context.RedeemOrder.getWhere({ tokenId: { _eq: tokenId } });
  for (const order of redeemOrders) {
    if (order.assetId !== payoutAssetId) continue;
    if (order.index !== epoch) continue;
    if (!order.approvedAt || order.revokedAt) continue;

    const approvedShares = order.approvedSharesAmount ?? 0n;
    context.RedeemOrder.set({
      ...order,
      revokedSharesAmount: approvedShares,
      revokedAssetsAmount: approvedShares > 0n && navAssetPerShare > 0n
        ? (approvedShares * navAssetPerShare) / 10n ** 18n
        : 0n,
      revokedPoolAmount: approvedShares > 0n && navPoolPerShare > 0n
        ? (approvedShares * navPoolPerShare) / 10n ** 18n
        : 0n,
      revokedWithNavPoolPerShare: navPoolPerShare,
      revokedWithNavAssetPerShare: navAssetPerShare,
      revokedAt: event.block.timestamp,
      revokedAtBlock: event.block.number,
      revokedAtTxHash: event.transaction.hash,
      ...updatedDefaults(event),
    });
  }

  // Update Token totalIssuance (decrease on revoke)
  const tId = tokenIdFn(poolId, tokenId);
  const token = await context.Token.get(tId);
  if (token) {
    const current = token.totalIssuance ?? 0n;
    context.Token.set({
      ...token,
      totalIssuance: current > revokedShareAmount ? current - revokedShareAmount : 0n,
      tokenPrice: navPoolPerShare > 0n ? navPoolPerShare : token.tokenPrice,
      ...updatedDefaults(event),
    });
  }
}

// --- ClaimDeposit ---

export async function handleClaimDeposit(
  params: {
    poolId: bigint;
    tokenId: string;
    epoch: number;
    investor: string;
    depositAssetId: bigint;
    paymentAssetAmount: bigint;
    claimedShareAmount: bigint;
  },
  event: EventMeta,
  context: any
) {
  const { poolId, tokenId, epoch, investor, depositAssetId, claimedShareAmount } = params;
  const investorAddress = investor.substring(0, 42).toLowerCase();

  await context.Account.getOrCreate({
    id: accountId(investorAddress),
    address: investorAddress,
    ...createdDefaults(event),
  });

  const ioId = investOrderId(tokenId, depositAssetId, investorAddress, epoch);
  const order = await context.InvestOrder.get(ioId);
  if (!order) {
    context.log.warn(`InvestOrder ${ioId} not found. Cannot claim deposit`);
    return;
  }

  context.InvestOrder.set({
    ...order,
    claimedSharesAmount: claimedShareAmount,
    claimedAt: event.block.timestamp,
    claimedAtBlock: event.block.number,
    claimedAtTxHash: event.transaction.hash,
    ...updatedDefaults(event),
  });
}

// --- ClaimRedeem ---

export async function handleClaimRedeem(
  params: {
    poolId: bigint;
    tokenId: string;
    epoch: number;
    investor: string;
    payoutAssetId: bigint;
    paymentShareAmount: bigint;
    claimedAssetAmount: bigint;
  },
  event: EventMeta,
  context: any
) {
  const { poolId, tokenId, epoch, investor, payoutAssetId, claimedAssetAmount } = params;
  const investorAddress = investor.substring(0, 42).toLowerCase();

  await context.Account.getOrCreate({
    id: accountId(investorAddress),
    address: investorAddress,
    ...createdDefaults(event),
  });

  const roId = redeemOrderId(tokenId, payoutAssetId, investorAddress, epoch);
  const order = await context.RedeemOrder.get(roId);
  if (!order) {
    context.log.warn(`RedeemOrder ${roId} not found. Cannot claim redeem`);
    return;
  }

  context.RedeemOrder.set({
    ...order,
    claimedAssetsAmount: claimedAssetAmount,
    claimedAt: event.block.timestamp,
    claimedAtBlock: event.block.number,
    claimedAtTxHash: event.transaction.hash,
    ...updatedDefaults(event),
  });
}
