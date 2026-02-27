import { MultiAdapter } from "generated";
import { getCentrifugeId } from "../utils/chains";
import { createdDefaults } from "../utils/defaults";
import {
  adapterId as adapterIdFn,
  adapterWiringId,
  adapterParticipationId,
  crosschainPayloadId,
  blockchainId,
} from "../utils/ids";
import {
  getMessageHash,
  getMessageId,
  getPayloadId,
  extractMessagesFromPayload,
  getVersionIndex,
} from "../utils/messageParser";

// --- SendPayload ---

MultiAdapter.SendPayload.handler(async ({ event, context }) => {
  const {
    centrifugeId: toCentrifugeIdNum,
    payload: payloadData,
    payloadId: payloadIdHex,
    adapter,
  } = event.params;
  const toCentrifugeId = toCentrifugeIdNum.toString();
  const fromCentrifugeId = getCentrifugeId(event.chainId);
  const payloadHex = payloadData as `0x${string}`;
  const versionIndex = getVersionIndex(event.chainId, event.srcAddress);

  // Try to find existing payload (Underpaid or InTransit)
  const existingPayloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadIdHex } });
  let payload = existingPayloads.find(
    (p: any) => p.status === "Underpaid" || p.status === "InTransit"
  );

  let payloadIndex: number;
  let payloadEntityId: string;

  if (!payload) {
    // Create new payload
    payloadIndex = existingPayloads.length;
    payloadEntityId = crosschainPayloadId(payloadIdHex, payloadIndex);

    // Extract messages and link them to this payload
    const messages = extractMessagesFromPayload(payloadHex, versionIndex);
    let payloadPoolId: bigint | undefined;

    for (const msg of messages) {
      const msgHash = getMessageHash(msg);
      const msgId = getMessageId(fromCentrifugeId, toCentrifugeId, msgHash);

      // Find unlinked message (no payloadId set yet)
      const existingMessages = await context.CrosschainMessage.getWhere({ messageId: { _eq: msgId } });
      const unlinkedMsg = existingMessages.find((m: any) => !m.payloadId);
      if (unlinkedMsg) {
        context.CrosschainMessage.set({
          ...unlinkedMsg,
          payloadId: payloadIdHex,
          payloadIndex,
          crosschainPayload_id: payloadEntityId,
        });
        if (unlinkedMsg.poolId) payloadPoolId = unlinkedMsg.poolId;
      }
    }

    context.CrosschainPayload.set({
      id: payloadEntityId,
      payloadId: payloadIdHex,
      index: payloadIndex,
      fromCentrifugeId,
      toCentrifugeId,
      rawData: payloadHex,
      poolId: payloadPoolId,
      status: "InTransit",
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
      pool_id: payloadPoolId ? payloadPoolId.toString() : undefined,
      ...createdDefaults(event),
    });

    payload = await context.CrosschainPayload.get(payloadEntityId);
    payloadIndex = payloadIndex;
  } else {
    payloadIndex = payload.index;
    payloadEntityId = payload.id;
  }

  // Create AdapterParticipation
  const adapterAddress = adapter.toLowerCase();
  const apId = adapterParticipationId(payloadIdHex, payloadIndex, adapterAddress, "SEND", "PAYLOAD");
  context.AdapterParticipation.set({
    id: apId,
    payloadId: payloadIdHex,
    payloadIndex,
    adapterId: adapterAddress,
    centrifugeId: fromCentrifugeId,
    fromCentrifugeId,
    toCentrifugeId,
    type: "PAYLOAD",
    side: "SEND",
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    payload_id: payloadEntityId,
    adapter_id: adapterIdFn(adapterAddress, fromCentrifugeId),
    centrifugeBlockchain_id: blockchainId(fromCentrifugeId),
    fromBlockchain_id: blockchainId(fromCentrifugeId),
    toBlockchain_id: blockchainId(toCentrifugeId),
  });
});

// --- SendProof ---

MultiAdapter.SendProof.handler(async ({ event, context }) => {
  const { payloadId: payloadIdHex, adapter, centrifugeId: toCentrifugeIdNum } = event.params;
  const toCentrifugeId = toCentrifugeIdNum.toString();
  const fromCentrifugeId = getCentrifugeId(event.chainId);

  // Find incomplete payload (not Completed)
  const existingPayloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadIdHex } });
  const payload = existingPayloads.find((p: any) => p.status !== "Completed");
  if (!payload) {
    context.log.warn(`No incomplete payload found for ${payloadIdHex}`);
    return;
  }
  const payloadIndex = payload.index;

  // Create AdapterParticipation
  const adapterAddress = adapter.toLowerCase();
  const apId = adapterParticipationId(payloadIdHex, payloadIndex, adapterAddress, "SEND", "PROOF");
  context.AdapterParticipation.set({
    id: apId,
    payloadId: payloadIdHex,
    payloadIndex,
    adapterId: adapterAddress,
    centrifugeId: fromCentrifugeId,
    fromCentrifugeId,
    toCentrifugeId,
    type: "PROOF",
    side: "SEND",
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    payload_id: payload.id,
    adapter_id: adapterIdFn(adapterAddress, fromCentrifugeId),
    centrifugeBlockchain_id: blockchainId(fromCentrifugeId),
    fromBlockchain_id: blockchainId(fromCentrifugeId),
    toBlockchain_id: blockchainId(toCentrifugeId),
  });
});

// --- HandlePayload ---

MultiAdapter.HandlePayload.handler(async ({ event, context }) => {
  // RECEIVING CHAIN
  const { payloadId: payloadIdHex, adapter, centrifugeId: fromCentrifugeIdNum } = event.params;
  const fromCentrifugeId = fromCentrifugeIdNum.toString();
  const toCentrifugeId = getCentrifugeId(event.chainId);

  // Find InTransit or Delivered payload
  const existingPayloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadIdHex } });
  const payload = existingPayloads.find(
    (p: any) => p.status === "InTransit" || p.status === "Delivered"
  );
  if (!payload) {
    context.log.warn(`No InTransit/Delivered payload found for ${payloadIdHex}`);
    return;
  }
  const payloadIndex = payload.index;

  // Create AdapterParticipation
  const adapterAddress = adapter.toLowerCase();
  const apId = adapterParticipationId(payloadIdHex, payloadIndex, adapterAddress, "HANDLE", "PAYLOAD");
  context.AdapterParticipation.set({
    id: apId,
    payloadId: payloadIdHex,
    payloadIndex,
    adapterId: adapterAddress,
    centrifugeId: toCentrifugeId,
    fromCentrifugeId,
    toCentrifugeId,
    type: "PAYLOAD",
    side: "HANDLE",
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    payload_id: payload.id,
    adapter_id: adapterIdFn(adapterAddress, toCentrifugeId),
    centrifugeBlockchain_id: blockchainId(toCentrifugeId),
    fromBlockchain_id: blockchainId(fromCentrifugeId),
    toBlockchain_id: blockchainId(toCentrifugeId),
  });

  // Check if payload is verified (both HANDLE/PAYLOAD and HANDLE/PROOF received)
  // For now, mark as delivered when HandlePayload is received
  if (payload.status === "InTransit") {
    context.CrosschainPayload.set({
      ...payload,
      status: "Delivered",
      deliveredAt: event.block.timestamp,
      deliveredAtBlock: event.block.number,
      deliveredAtTxHash: event.transaction.hash,
    });

    // Check if all messages are already executed → mark as completed
    const payloadMessages = await context.CrosschainMessage.getWhere({ payloadId: { _eq: payloadIdHex } });
    const relevantMessages = payloadMessages.filter((m: any) => m.payloadIndex === payloadIndex);
    const allExecuted = relevantMessages.length > 0 && relevantMessages.every((m: any) => m.status === "Executed");
    if (allExecuted) {
      // Re-read payload since we just modified it
      const updatedPayload = await context.CrosschainPayload.get(payload.id);
      if (updatedPayload) {
        context.CrosschainPayload.set({
          ...updatedPayload,
          status: "Completed",
          completedAt: event.block.timestamp,
          completedAtBlock: event.block.number,
          completedAtTxHash: event.transaction.hash,
        });
      }
    }
  }
});

// --- HandleProof ---

MultiAdapter.HandleProof.handler(async ({ event, context }) => {
  // RECEIVING CHAIN
  const { payloadId: payloadIdHex, adapter, centrifugeId: fromCentrifugeIdNum } = event.params;
  const fromCentrifugeId = fromCentrifugeIdNum.toString();
  const toCentrifugeId = getCentrifugeId(event.chainId);

  // Find incomplete payload
  const existingPayloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadIdHex } });
  const payload = existingPayloads.find((p: any) => p.status !== "Completed");
  if (!payload) {
    context.log.warn(`No incomplete payload found for ${payloadIdHex}`);
    return;
  }
  const payloadIndex = payload.index;

  // Create AdapterParticipation
  const adapterAddress = adapter.toLowerCase();
  const apId = adapterParticipationId(payloadIdHex, payloadIndex, adapterAddress, "HANDLE", "PROOF");
  context.AdapterParticipation.set({
    id: apId,
    payloadId: payloadIdHex,
    payloadIndex,
    adapterId: adapterAddress,
    centrifugeId: toCentrifugeId,
    fromCentrifugeId,
    toCentrifugeId,
    type: "PROOF",
    side: "HANDLE",
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    payload_id: payload.id,
    adapter_id: adapterIdFn(adapterAddress, toCentrifugeId),
    centrifugeBlockchain_id: blockchainId(toCentrifugeId),
    fromBlockchain_id: blockchainId(fromCentrifugeId),
    toBlockchain_id: blockchainId(toCentrifugeId),
  });

  // Check if payload is verified — mark as delivered when HandleProof is received
  if (payload.status === "InTransit") {
    context.CrosschainPayload.set({
      ...payload,
      status: "Delivered",
      deliveredAt: event.block.timestamp,
      deliveredAtBlock: event.block.number,
      deliveredAtTxHash: event.transaction.hash,
    });

    // Check if all messages are already executed → mark as completed
    const payloadMessages = await context.CrosschainMessage.getWhere({ payloadId: { _eq: payloadIdHex } });
    const relevantMessages = payloadMessages.filter((m: any) => m.payloadIndex === payloadIndex);
    const allExecuted = relevantMessages.length > 0 && relevantMessages.every((m: any) => m.status === "Executed");
    if (allExecuted) {
      const updatedPayload = await context.CrosschainPayload.get(payload.id);
      if (updatedPayload) {
        context.CrosschainPayload.set({
          ...updatedPayload,
          status: "Completed",
          completedAt: event.block.timestamp,
          completedAtBlock: event.block.number,
          completedAtTxHash: event.transaction.hash,
        });
      }
    }
  }
});

// --- FileAdapters ---

MultiAdapter.FileAdapters.handler(async ({ event, context }) => {
  const localCentrifugeId = getCentrifugeId(event.chainId);
  const { what, centrifugeId: remoteCentrifugeIdNum, adapters } = event.params;
  const remoteCentrifugeId = remoteCentrifugeIdNum.toString();

  // Parse "what" field — only process "adapters"
  const parsedWhat = Buffer.from(what.substring(2), "hex").toString("utf-8").replace(/\0/g, "");
  if (parsedWhat !== "adapters") return;

  // For each remote adapter, try to wire it to a local adapter with the same name
  for (const remoteAdapterAddress of adapters) {
    const remoteAdapterId = adapterIdFn(remoteAdapterAddress, remoteCentrifugeId);
    const remoteAdapter = await context.Adapter.get(remoteAdapterId);
    if (!remoteAdapter) continue;

    const remoteAdapterName = remoteAdapter.name;
    if (!remoteAdapterName) continue;

    // Find local adapter with the same name by scanning known adapter patterns
    // Since we can't query by name with getWhere (no @index on name), we check known adapters
    // This is a simplified approach — in production, we'd need @index on Adapter.name
    // For now, try constructing the wiring if the adapter exists
    const awId = adapterWiringId(
      event.srcAddress,
      localCentrifugeId,
      remoteAdapterAddress,
      remoteCentrifugeId
    );

    const existing = await context.AdapterWiring.get(awId);
    if (existing) continue;

    context.AdapterWiring.set({
      id: awId,
      fromAddress: event.srcAddress.toLowerCase(),
      fromCentrifugeId: localCentrifugeId,
      toAddress: remoteAdapterAddress.toLowerCase(),
      toCentrifugeId: remoteCentrifugeId,
      fromAdapter_id: adapterIdFn(event.srcAddress, localCentrifugeId),
      toAdapter_id: remoteAdapterId,
      ...createdDefaults(event),
    });
  }
});
