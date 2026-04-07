import { Holdings } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults, updatedDefaults } from "../utils/defaults";
import { holdingId, holdingAccountId, blockchainId, tokenId as tokenIdFn, normalizeScId } from "../utils/ids";

// HoldingAccountType mapping:
// Non-liability: 0=Asset, 1=Equity, 2=Loss, 3=Gain
// Liability:     0=Expense, 1=Liability
const NON_LIABILITY_TYPES: Record<number, "Asset" | "Equity" | "Loss" | "Gain"> = {
  0: "Asset",
  1: "Equity",
  2: "Loss",
  3: "Gain",
};

const LIABILITY_TYPES: Record<number, "Expense" | "Liability"> = {
  0: "Expense",
  1: "Liability",
};

Holdings.Initialize.handler(async ({ event, context }) => {
  // _0 is the unnamed poolId param
  const { _0: poolId, scId: _rawScId, assetId, valuation: valuationRaw, isLiability, accounts } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  const hId = holdingId(tokenId, assetId);
  const existing = await context.Holding.get(hId);

  context.Holding.set({
    id: hId,
    centrifugeId,
    poolId,
    tokenId,
    isInitialized: true,
    isLiability,
    valuation: valuationRaw.toString(),
    assetId,
    assetQuantity: existing?.assetQuantity ?? undefined,
    totalValue: existing?.totalValue ?? undefined,
    blockchain_id: blockchainId(centrifugeId),
    token_id: tokenIdFn(poolId, tokenId),
    holdingEscrow_id: existing?.holdingEscrow_id ?? undefined,
    ...(existing ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });

  // Create HoldingAccount entries for each account tuple
  for (const [_accountId, _kind] of accounts) {
    const accountIdStr = _accountId.toString();
    const kind = isLiability
      ? LIABILITY_TYPES[Number(_kind)]
      : NON_LIABILITY_TYPES[Number(_kind)];

    if (!kind) {
      context.log.warn(`Invalid holding account type ${_kind} (isLiability=${isLiability})`);
      continue;
    }

    context.HoldingAccount.set({
      id: holdingAccountId(accountIdStr),
      tokenId,
      kind,
      holding_id: hId,
      ...createdDefaults(event),
    });
  }
});

Holdings.Increase.handler(async ({ event, context }) => {
  const { _0: poolId, scId: _rawScId, assetId, amount, increasedValue } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  const hId = holdingId(tokenId, assetId);
  const existing = await context.Holding.get(hId);

  if (existing) {
    context.Holding.set({
      ...existing,
      assetQuantity: (existing.assetQuantity ?? 0n) + amount,
      totalValue: (existing.totalValue ?? 0n) + increasedValue,
      ...updatedDefaults(event),
    });
  } else {
    context.Holding.set({
      id: hId,
      centrifugeId,
      poolId,
      tokenId,
      isInitialized: false,
      isLiability: undefined,
      valuation: undefined,
      assetId,
      assetQuantity: amount,
      totalValue: increasedValue,
      blockchain_id: blockchainId(centrifugeId),
      token_id: tokenIdFn(poolId, tokenId),
      holdingEscrow_id: undefined,
      ...createdDefaults(event),
    });
  }
});

Holdings.Decrease.handler(async ({ event, context }) => {
  const { _0: poolId, scId: _rawScId, assetId, amount, decreasedValue } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  const hId = holdingId(tokenId, assetId);
  const existing = await context.Holding.get(hId);

  if (existing) {
    const newQuantity = (existing.assetQuantity ?? 0n) - amount;
    const newValue = (existing.totalValue ?? 0n) - decreasedValue;
    context.Holding.set({
      ...existing,
      assetQuantity: newQuantity < 0n ? 0n : newQuantity,
      totalValue: newValue < 0n ? 0n : newValue,
      ...updatedDefaults(event),
    });
  } else {
    context.Holding.set({
      id: hId,
      centrifugeId,
      poolId,
      tokenId,
      isInitialized: false,
      isLiability: undefined,
      valuation: undefined,
      assetId,
      assetQuantity: 0n,
      totalValue: 0n,
      blockchain_id: blockchainId(centrifugeId),
      token_id: tokenIdFn(poolId, tokenId),
      holdingEscrow_id: undefined,
      ...createdDefaults(event),
    });
  }
});

Holdings.Update.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, assetId, isPositive, diffValue } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  const hId = holdingId(tokenId, assetId);
  const existing = await context.Holding.get(hId);

  if (existing) {
    const currentValue = existing.totalValue ?? 0n;
    const newValue = isPositive ? currentValue + diffValue : currentValue - diffValue;
    context.Holding.set({
      ...existing,
      totalValue: newValue < 0n ? 0n : newValue,
      ...updatedDefaults(event),
    });
  } else {
    context.Holding.set({
      id: hId,
      centrifugeId,
      poolId,
      tokenId,
      isInitialized: false,
      isLiability: undefined,
      valuation: undefined,
      assetId,
      assetQuantity: undefined,
      totalValue: isPositive ? diffValue : 0n,
      blockchain_id: blockchainId(centrifugeId),
      token_id: tokenIdFn(poolId, tokenId),
      holdingEscrow_id: undefined,
      ...createdDefaults(event),
    });
  }
});

Holdings.UpdateValuation.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, assetId, valuation } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  const hId = holdingId(tokenId, assetId);
  const existing = await context.Holding.get(hId);

  if (existing) {
    context.Holding.set({
      ...existing,
      valuation: valuation.toString(),
      ...updatedDefaults(event),
    });
  } else {
    context.Holding.set({
      id: hId,
      centrifugeId,
      poolId,
      tokenId,
      isInitialized: false,
      isLiability: undefined,
      valuation: valuation.toString(),
      assetId,
      assetQuantity: undefined,
      totalValue: undefined,
      blockchain_id: blockchainId(centrifugeId),
      token_id: tokenIdFn(poolId, tokenId),
      holdingEscrow_id: undefined,
      ...createdDefaults(event),
    });
  }
});

Holdings.UpdateIsLiability.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, assetId, isLiability } = event.params;
  const tokenId = normalizeScId(_rawScId);
  const centrifugeId = getCentrifugeId(event.chainId);

  const hId = holdingId(tokenId, assetId);
  const existing = await context.Holding.get(hId);

  if (existing) {
    context.Holding.set({
      ...existing,
      isLiability,
      ...updatedDefaults(event),
    });
  } else {
    context.Holding.set({
      id: hId,
      centrifugeId,
      poolId,
      tokenId,
      isInitialized: false,
      isLiability,
      valuation: undefined,
      assetId,
      assetQuantity: undefined,
      totalValue: undefined,
      blockchain_id: blockchainId(centrifugeId),
      token_id: tokenIdFn(poolId, tokenId),
      holdingEscrow_id: undefined,
      ...createdDefaults(event),
    });
  }
});

Holdings.SetAccountId.handler(async ({ event, context }) => {
  const { poolId, scId: _rawScId, assetId, kind, accountId: newAccountId } = event.params;
  const tokenId = normalizeScId(_rawScId);

  const hId = holdingId(tokenId, assetId);
  const existing = await context.Holding.get(hId);
  const isLiability = existing?.isLiability ?? false;

  // Determine kind name based on liability status
  const kindName = isLiability
    ? (LIABILITY_TYPES[Number(kind)] ?? "Expense")
    : (NON_LIABILITY_TYPES[Number(kind)] ?? "Asset");

  // Update or create the HoldingAccount with the new account ID
  const haId = holdingAccountId(newAccountId.toString());
  context.HoldingAccount.set({
    id: haId,
    tokenId,
    kind: kindName,
    holding_id: hId,
    ...createdDefaults(event),
  });
});
