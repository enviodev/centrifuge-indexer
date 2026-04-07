import { Gateway, GatewayV3_1 } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults } from "../utils/defaults";
import {
  crosschainMessageId,
  crosschainPayloadId,
  blockchainId,
} from "../utils/ids";
import {
  getMessageHash,
  getMessageId,
  getCrosschainMessageType,
  getPayloadId,
  extractMessagesFromPayload,
  getNextIndex,
  getVersionIndex,
} from "../utils/messageParser";

/**
 * Order-independent payload completion check.
 * Called at every state transition point — if all messages are terminal (Executed/Failed)
 * and the payload is Delivered, transition to Completed.
 * Safe to call multiple times; only transitions when all conditions are met.
 */
export async function tryCompletePayload(
  context: any,
  payloadId: string,
  event: { block: { timestamp: number; number: number }; transaction: { hash: string } }
) {
  const payloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadId } });
  for (const payload of payloads) {
    if (payload.status !== "Delivered" && payload.status !== "PartiallyFailed") continue;

    const messages = await context.CrosschainMessage.getWhere({ payloadId: { _eq: payloadId } });
    const relevant = messages.filter((m: any) => m.payloadIndex === payload.index);
    if (relevant.length === 0) continue;

    const allTerminal = relevant.every((m: any) => m.status === "Executed" || m.status === "Failed");
    if (allTerminal) {
      const hasFailed = relevant.some((m: any) => m.status === "Failed");
      context.CrosschainPayload.set({
        ...payload,
        status: hasFailed ? "PartiallyFailed" : "Completed",
        completedAt: event.block.timestamp,
        completedAtBlock: event.block.number,
        completedAtTxHash: event.transaction.hash,
      });
    }
  }
}

// --- PrepareMessage ---

const _handlePrepareMessage = async ({ event, context }: any) => {
  const { centrifugeId: toCentrifugeIdNum, poolId, message } = event.params;
  const toCentrifugeId = toCentrifugeIdNum.toString();
  const fromCentrifugeId = getCentrifugeId(event.chainId);
  const versionIndex = getVersionIndex(event.chainId, event.srcAddress);

  const messageHex = message as `0x${string}`;
  const messageBuffer = Buffer.from(message.substring(2), "hex");
  const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), versionIndex);
  const messageHash = getMessageHash(messageHex);
  const msgId = getMessageId(fromCentrifugeId, toCentrifugeId, messageHash);

  // Check if message was already created by receiver (cross-chain ordering)
  const existingMessages = await context.CrosschainMessage.getWhere({ messageId: { _eq: msgId } });
  const executedMsg = existingMessages.find((m: any) => m.status === "Executed");
  if (executedMsg) {
    // Enrich receiver-created message with sender-side data (poolId)
    context.CrosschainMessage.set({
      ...executedMsg,
      poolId: poolId > 0n ? poolId : executedMsg.poolId,
      pool_id: poolId > 0n ? poolId.toString() : executedMsg.pool_id,
    });

    // Check if payload can be completed (order-independent)
    if (executedMsg.payloadId) {
      await tryCompletePayload(context, executedMsg.payloadId, event);
    }
    return;
  }

  const index = await getNextIndex((id) => context.CrosschainMessage.get(id), msgId);
  const entityId = crosschainMessageId(msgId, index);

  context.CrosschainMessage.set({
    id: entityId,
    messageId: msgId,
    index,
    poolId: poolId > 0n ? poolId : undefined,
    payloadId: undefined,
    payloadIndex: undefined,
    messageType,
    status: "AwaitingBatchDelivery",
    hash: messageHash,
    rawData: messageHex,
    data: undefined,
    failReason: undefined,
    fromCentrifugeId,
    toCentrifugeId,
    executedAt: undefined,
    executedAtBlock: undefined,
    executedAtTxHash: undefined,
    crosschainPayload_id: undefined,
    pool_id: poolId > 0n ? poolId.toString() : undefined,
    fromBlockchain_id: blockchainId(fromCentrifugeId),
    toBlockchain_id: blockchainId(toCentrifugeId),
    ...createdDefaults(event),
  });
};
Gateway.PrepareMessage.handler(_handlePrepareMessage);

// --- UnderpaidBatch ---

const _handleUnderpaidBatch = async ({ event, context }: any) => {
  const { centrifugeId: toCentrifugeIdNum, batch } = event.params;
  const toCentrifugeId = toCentrifugeIdNum.toString();
  const fromCentrifugeId = getCentrifugeId(event.chainId);

  const batchHex = batch as `0x${string}`;
  const payloadIdHash = getPayloadId(fromCentrifugeId, toCentrifugeId, batchHex);

  // Check if already initialized
  const existingPayloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadIdHash } });
  const alreadyUnderpaid = existingPayloads.find((p: any) => p.status === "Underpaid");
  if (alreadyUnderpaid) return;

  const payloadIndex = existingPayloads.length;
  const payloadEntityId = crosschainPayloadId(payloadIdHash, payloadIndex);

  // Extract and create messages from batch
  const versionIndex = getVersionIndex(event.chainId, event.srcAddress);
  const messages = extractMessagesFromPayload(batchHex, versionIndex);
  let batchPoolId: bigint | undefined;

  for (const msg of messages) {
    const msgBuffer = Buffer.from(msg.substring(2), "hex");
    const msgType = getCrosschainMessageType(msgBuffer.readUInt8(0), versionIndex);
    const msgHash = getMessageHash(msg);
    const msgId = getMessageId(fromCentrifugeId, toCentrifugeId, msgHash);

    // Check if message already exists (AwaitingBatchDelivery or Executed without payload link)
    const existingMessages = await context.CrosschainMessage.getWhere({ messageId: { _eq: msgId } });
    const linkableMsg = existingMessages.find((m: any) => !m.payloadId);
    if (linkableMsg) {
      // Link existing message to this payload
      context.CrosschainMessage.set({
        ...linkableMsg,
        payloadId: payloadIdHash,
        payloadIndex,
        crosschainPayload_id: payloadEntityId,
      });
      if (linkableMsg.poolId) batchPoolId = linkableMsg.poolId;
      continue;
    }

    const msgIndex = existingMessages.length;
    const msgEntityId = crosschainMessageId(msgId, msgIndex);

    context.CrosschainMessage.set({
      id: msgEntityId,
      messageId: msgId,
      index: msgIndex,
      poolId: undefined,
      payloadId: payloadIdHash,
      payloadIndex,
      messageType: msgType,
      status: "Unsent",
      hash: msgHash,
      rawData: msg,
      data: undefined,
      failReason: undefined,
      fromCentrifugeId,
      toCentrifugeId,
      executedAt: undefined,
      executedAtBlock: undefined,
      executedAtTxHash: undefined,
      crosschainPayload_id: payloadEntityId,
      pool_id: undefined,
      fromBlockchain_id: blockchainId(fromCentrifugeId),
      toBlockchain_id: blockchainId(toCentrifugeId),
      ...createdDefaults(event),
    });
  }

  // Check if all linked messages are already terminal (receiver processed first)
  const allLinkedMessages = await context.CrosschainMessage.getWhere({ payloadId: { _eq: payloadIdHash } });
  const relevant = allLinkedMessages.filter((m: any) => m.payloadIndex === payloadIndex);
  const allTerminal = relevant.length > 0 && relevant.every(
    (m: any) => m.status === "Executed" || m.status === "Failed"
  );

  // Create payload — skip straight to Delivered/Completed if messages already done
  const initialStatus = allTerminal ? "Completed" : "Underpaid";
  context.CrosschainPayload.set({
    id: payloadEntityId,
    payloadId: payloadIdHash,
    index: payloadIndex,
    fromCentrifugeId,
    toCentrifugeId,
    rawData: batchHex,
    poolId: batchPoolId,
    status: initialStatus,
    gasLimit: undefined,
    gasPaid: undefined,
    deliveredAt: undefined,
    deliveredAtBlock: undefined,
    deliveredAtTxHash: undefined,
    completedAt: undefined,
    completedAtBlock: undefined,
    completedAtTxHash: undefined,
    preparedAt: event.block.timestamp,
    preparedAtBlock: event.block.number,
    preparedAtTxHash: event.transaction.hash,
    fromBlockchain_id: blockchainId(fromCentrifugeId),
    toBlockchain_id: blockchainId(toCentrifugeId),
    pool_id: batchPoolId ? batchPoolId.toString() : undefined,
    ...createdDefaults(event),
  });
};
Gateway.UnderpaidBatch.handler(_handleUnderpaidBatch);

// --- RepayBatch ---

const _handleRepayBatch = async ({ event, context }: any) => {
  const { centrifugeId: toCentrifugeIdNum, batch } = event.params;
  const toCentrifugeId = toCentrifugeIdNum.toString();
  const fromCentrifugeId = getCentrifugeId(event.chainId);

  const batchHex = batch as `0x${string}`;
  const payloadIdHash = getPayloadId(fromCentrifugeId, toCentrifugeId, batchHex);

  // Find the Underpaid payload
  const payloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadIdHash } });
  const underpaidPayload = payloads.find((p: any) => p.status === "Underpaid");
  if (!underpaidPayload) {
    context.log.warn(`No Underpaid payload found for ${payloadIdHash}`);
    return;
  }

  // Update messages from Unsent → AwaitingBatchDelivery
  const messages = await context.CrosschainMessage.getWhere({ payloadId: { _eq: payloadIdHash } });
  for (const msg of messages) {
    if (msg.payloadIndex !== underpaidPayload.index) continue;
    if (msg.status !== "Unsent") continue;
    context.CrosschainMessage.set({
      ...msg,
      status: "AwaitingBatchDelivery",
    });
  }

  // Update payload to InTransit
  context.CrosschainPayload.set({
    ...underpaidPayload,
    status: "InTransit",
  });
};
Gateway.RepayBatch.handler(_handleRepayBatch);

// --- ExecuteMessage ---

const _handleExecuteMessage = async ({ event, context }: any) => {
  // RECEIVING CHAIN
  const { centrifugeId: fromCentrifugeIdNum, message } = event.params;
  const fromCentrifugeId = fromCentrifugeIdNum.toString();
  const toCentrifugeId = getCentrifugeId(event.chainId);

  const messageHex = message as `0x${string}`;
  const messageHash = getMessageHash(messageHex);
  const msgId = getMessageId(fromCentrifugeId, toCentrifugeId, messageHash);

  // Find message in AwaitingBatchDelivery or Failed state
  const existingMessages = await context.CrosschainMessage.getWhere({ messageId: { _eq: msgId } });
  const crosschainMsg = existingMessages.find(
    (m: any) => m.status === "AwaitingBatchDelivery" || m.status === "Failed"
  );
  if (!crosschainMsg) {
    // Receiver processed before sender — create message with Executed status
    const versionIndex = getVersionIndex(event.chainId, event.srcAddress);
    const messageBuffer = Buffer.from(message.substring(2), "hex");
    const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), versionIndex);
    const index = await getNextIndex((id) => context.CrosschainMessage.get(id), msgId);
    const entityId = crosschainMessageId(msgId, index);

    context.CrosschainMessage.set({
      id: entityId,
      messageId: msgId,
      index,
      poolId: undefined,
      payloadId: undefined,
      payloadIndex: undefined,
      messageType,
      status: "Executed",
      hash: messageHash,
      rawData: messageHex,
      data: undefined,
      failReason: undefined,
      fromCentrifugeId,
      toCentrifugeId,
      executedAt: event.block.timestamp,
      executedAtBlock: event.block.number,
      executedAtTxHash: event.transaction.hash,
      crosschainPayload_id: undefined,
      pool_id: undefined,
      fromBlockchain_id: blockchainId(fromCentrifugeId),
      toBlockchain_id: blockchainId(toCentrifugeId),
      ...createdDefaults(event),
    });
    return;
  }

  // Mark message as Executed
  context.CrosschainMessage.set({
    ...crosschainMsg,
    status: "Executed",
    executedAt: event.block.timestamp,
    executedAtBlock: event.block.number,
    executedAtTxHash: event.transaction.hash,
  });

  // Order-independent completion check
  if (crosschainMsg.payloadId) {
    await tryCompletePayload(context, crosschainMsg.payloadId, event);
  }
};
Gateway.ExecuteMessage.handler(_handleExecuteMessage);

// --- FailMessage ---

const _handleFailMessage = async ({ event, context }: any) => {
  // RECEIVING CHAIN
  const { centrifugeId: fromCentrifugeIdNum, message, error } = event.params;
  const fromCentrifugeId = fromCentrifugeIdNum.toString();
  const toCentrifugeId = getCentrifugeId(event.chainId);

  const messageHex = message as `0x${string}`;
  const messageHash = getMessageHash(messageHex);
  const msgId = getMessageId(fromCentrifugeId, toCentrifugeId, messageHash);

  // Find message in AwaitingBatchDelivery or Failed state
  const existingMessages = await context.CrosschainMessage.getWhere({ messageId: { _eq: msgId } });
  const crosschainMsg = existingMessages.find(
    (m: any) => m.status === "AwaitingBatchDelivery" || m.status === "Failed"
  );
  if (!crosschainMsg) {
    // Receiver processed before sender — create message with Failed status
    const versionIndex = getVersionIndex(event.chainId, event.srcAddress);
    const messageBuffer = Buffer.from(message.substring(2), "hex");
    const messageType = getCrosschainMessageType(messageBuffer.readUInt8(0), versionIndex);
    const index = await getNextIndex((id) => context.CrosschainMessage.get(id), msgId);
    const entityId = crosschainMessageId(msgId, index);

    context.CrosschainMessage.set({
      id: entityId,
      messageId: msgId,
      index,
      poolId: undefined,
      payloadId: undefined,
      payloadIndex: undefined,
      messageType,
      status: "Failed",
      hash: messageHash,
      rawData: messageHex,
      data: undefined,
      failReason: error,
      fromCentrifugeId,
      toCentrifugeId,
      executedAt: undefined,
      executedAtBlock: undefined,
      executedAtTxHash: undefined,
      crosschainPayload_id: undefined,
      pool_id: undefined,
      fromBlockchain_id: blockchainId(fromCentrifugeId),
      toBlockchain_id: blockchainId(toCentrifugeId),
      ...createdDefaults(event),
    });
    return;
  }

  // Already failed — skip
  if (crosschainMsg.status === "Failed") return;

  // Mark message as Failed
  context.CrosschainMessage.set({
    ...crosschainMsg,
    status: "Failed",
    failReason: error,
  });

  // Order-independent completion check (will set PartiallyFailed if some failed)
  if (crosschainMsg.payloadId) {
    await tryCompletePayload(context, crosschainMsg.payloadId, event);
  }
};
Gateway.FailMessage.handler(_handleFailMessage);

// === V3.1 Handler Registrations (delegates to V3 logic) ===

GatewayV3_1.V3_1PrepareMessage.handler(_handlePrepareMessage);
GatewayV3_1.V3_1ExecuteMessage.handler(_handleExecuteMessage);
GatewayV3_1.V3_1FailMessage.handler(_handleFailMessage);
GatewayV3_1.V3_1UnderpaidBatch.handler(_handleUnderpaidBatch);
GatewayV3_1.V3_1RepayBatch.handler(_handleRepayBatch);
