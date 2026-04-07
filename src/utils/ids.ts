// Normalize bytes16 scId — Envio may pad bytes16 to bytes32 at runtime
export const normalizeScId = (scId: string): string => {
  if (!scId || !scId.startsWith("0x")) return scId;
  // bytes32 (66 chars) with trailing zeros → truncate to bytes16 (34 chars)
  if (scId.length === 66) return scId.slice(0, 34);
  return scId;
};

// Composite key builders for entity IDs

export const poolId = (poolIdNum: bigint): string => poolIdNum.toString();

export const tokenId = (poolIdNum: bigint, scId: string): string =>
  `${poolIdNum}-${scId.toLowerCase()}`;

export const vaultId = (address: string, centrifugeId: string): string =>
  `${address.toLowerCase()}-${centrifugeId}`;

export const tokenInstanceId = (centrifugeId: string, tokenIdStr: string): string =>
  `${centrifugeId}-${tokenIdStr.toLowerCase()}`;

export const tokenInstancePositionId = (
  tokenIdStr: string,
  centrifugeId: string,
  accountAddress: string
): string => `${tokenIdStr.toLowerCase()}-${centrifugeId}-${accountAddress.toLowerCase()}`;

export const investorTransactionId = (
  poolIdNum: bigint,
  tokenIdStr: string,
  account: string,
  type: string,
  txHash: string
): string =>
  `${poolIdNum}-${tokenIdStr.toLowerCase()}-${account.toLowerCase()}-${type}-${txHash}`;

export const whitelistedInvestorId = (
  tokenIdStr: string,
  centrifugeId: string,
  accountAddress: string
): string => `${tokenIdStr.toLowerCase()}-${centrifugeId}-${accountAddress.toLowerCase()}`;

export const poolSpokeBlockchainId = (poolIdNum: bigint, centrifugeId: string): string =>
  `${poolIdNum}-${centrifugeId}`;

export const poolManagerId = (
  address: string,
  centrifugeId: string,
  poolIdNum: bigint
): string => `${address.toLowerCase()}-${centrifugeId}-${poolIdNum}`;

export const assetId = (assetIdNum: bigint): string => assetIdNum.toString();

export const assetRegistrationId = (assetIdNum: bigint, centrifugeId: string): string =>
  `${assetIdNum}-${centrifugeId}`;

export const holdingId = (tokenIdStr: string, assetIdNum: bigint): string =>
  `${tokenIdStr.toLowerCase()}-${assetIdNum}`;

export const holdingAccountId = (id: string): string => id;

export const holdingEscrowId = (tokenIdStr: string, assetIdNum: bigint): string =>
  `${tokenIdStr.toLowerCase()}-${assetIdNum}`;

export const escrowId = (address: string, centrifugeId: string): string =>
  `${address.toLowerCase()}-${centrifugeId}`;

export const vaultInvestOrderId = (
  tokenIdStr: string,
  centrifugeId: string,
  assetIdNum: bigint,
  accountAddress: string
): string =>
  `${tokenIdStr.toLowerCase()}-${centrifugeId}-${assetIdNum}-${accountAddress.toLowerCase()}`;

export const vaultRedeemOrderId = (
  tokenIdStr: string,
  centrifugeId: string,
  assetIdNum: bigint,
  accountAddress: string
): string =>
  `${tokenIdStr.toLowerCase()}-${centrifugeId}-${assetIdNum}-${accountAddress.toLowerCase()}`;

export const pendingInvestOrderId = (
  tokenIdStr: string,
  assetIdNum: bigint,
  account: string
): string => `${tokenIdStr.toLowerCase()}-${assetIdNum}-${account.toLowerCase()}`;

export const pendingRedeemOrderId = (
  tokenIdStr: string,
  assetIdNum: bigint,
  account: string
): string => `${tokenIdStr.toLowerCase()}-${assetIdNum}-${account.toLowerCase()}`;

export const investOrderId = (
  tokenIdStr: string,
  assetIdNum: bigint,
  account: string,
  index: number
): string => `${tokenIdStr.toLowerCase()}-${assetIdNum}-${account.toLowerCase()}-${index}`;

export const redeemOrderId = (
  tokenIdStr: string,
  assetIdNum: bigint,
  account: string,
  index: number
): string => `${tokenIdStr.toLowerCase()}-${assetIdNum}-${account.toLowerCase()}-${index}`;

export const epochInvestOrderId = (
  tokenIdStr: string,
  assetIdNum: bigint,
  index: number
): string => `${tokenIdStr.toLowerCase()}-${assetIdNum}-${index}`;

export const epochRedeemOrderId = (
  tokenIdStr: string,
  assetIdNum: bigint,
  index: number
): string => `${tokenIdStr.toLowerCase()}-${assetIdNum}-${index}`;

export const crosschainPayloadId = (payloadIdStr: string, index: number): string =>
  `${payloadIdStr}-${index}`;

export const crosschainMessageId = (messageIdStr: string, index: number): string =>
  `${messageIdStr}-${index}`;

export const adapterId = (address: string, centrifugeId: string): string =>
  `${address.toLowerCase()}-${centrifugeId}`;

export const adapterWiringId = (
  fromAddress: string,
  fromCentrifugeId: string,
  toAddress: string,
  toCentrifugeId: string
): string =>
  `${fromAddress.toLowerCase()}-${fromCentrifugeId}-${toAddress.toLowerCase()}-${toCentrifugeId}`;

export const adapterParticipationId = (
  payloadIdStr: string,
  payloadIndex: number,
  adapterIdStr: string,
  side: string,
  type: string
): string => `${payloadIdStr}-${payloadIndex}-${adapterIdStr}-${side}-${type}`;

export const onOffRampManagerId = (address: string, centrifugeId: string): string =>
  `${address.toLowerCase()}-${centrifugeId}`;

export const offrampRelayerId = (
  tokenIdStr: string,
  centrifugeId: string,
  address: string
): string => `${tokenIdStr.toLowerCase()}-${centrifugeId}-${address.toLowerCase()}`;

export const onRampAssetId = (
  tokenIdStr: string,
  centrifugeId: string,
  assetAddress: string
): string => `${tokenIdStr.toLowerCase()}-${centrifugeId}-${assetAddress.toLowerCase()}`;

export const offRampAddressId = (
  tokenIdStr: string,
  assetAddress: string,
  receiverAddress: string
): string =>
  `${tokenIdStr.toLowerCase()}-${assetAddress.toLowerCase()}-${receiverAddress.toLowerCase()}`;

export const policyId = (poolIdNum: bigint, centrifugeId: string): string =>
  `${poolIdNum}-${centrifugeId}`;

export const merkleProofManagerEntityId = (address: string, centrifugeId: string): string =>
  `${address.toLowerCase()}-${centrifugeId}`;

export const outstandingInvestId = (
  tokenIdStr: string,
  assetIdNum: bigint,
  account: string
): string => `${tokenIdStr.toLowerCase()}-${assetIdNum}-${account.toLowerCase()}`;

export const outstandingRedeemId = (
  tokenIdStr: string,
  assetIdNum: bigint,
  account: string
): string => `${tokenIdStr.toLowerCase()}-${assetIdNum}-${account.toLowerCase()}`;

export const epochOutstandingInvestId = (tokenIdStr: string, assetIdNum: bigint): string =>
  `${tokenIdStr.toLowerCase()}-${assetIdNum}`;

export const epochOutstandingRedeemId = (tokenIdStr: string, assetIdNum: bigint): string =>
  `${tokenIdStr.toLowerCase()}-${assetIdNum}`;

export const deploymentId = (chainId: number): string => chainId.toString();

export const blockchainId = (centrifugeId: string): string => centrifugeId;

export const accountId = (address: string): string => address.toLowerCase();

export const snapshotId = (
  entityPrefix: string,
  blockNumber: number,
  trigger: string
): string => `${entityPrefix}-${blockNumber}-${trigger}`;
