import { MultiAdapter, MultiAdapterV3_1 } from "generated";
import { tryCompletePayload } from "./Gateway";
import { getCentrifugeId, ADAPTER_ADDRESSES } from "../utils/chains";
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

/**
 * Check if payload has been verified by comparing SEND vs HANDLE adapter participation counts.
 * Returns true when HANDLE count >= SEND count (quorum met).
 */
async function checkPayloadVerified(
  context: any,
  payloadIdHex: string,
  payloadIndex: number
): Promise<boolean> {
  const participations = await context.AdapterParticipation.getWhere({
    payloadId: { _eq: payloadIdHex },
  });
  const relevant = participations.filter((ap: any) => ap.payloadIndex === payloadIndex);
  const sendCount = relevant.filter((ap: any) => ap.side === "SEND").length;
  const handleCount = relevant.filter((ap: any) => ap.side === "HANDLE").length;
  return sendCount > 0 && handleCount >= sendCount;
}

/** Ensure Adapter entity exists for a given adapter address on a chain. */
async function ensureAdapter(
  context: any,
  adapterAddress: string,
  centrifugeId: string,
  event: any
) {
  const addr = adapterAddress.toLowerCase();
  const id = adapterIdFn(addr, centrifugeId);
  await context.Adapter.getOrCreate({
    id,
    address: addr,
    centrifugeId,
    name: ADAPTER_ADDRESSES[addr] ?? undefined,
    ...createdDefaults(event),
  });
}

// --- SendPayload (shared logic) ---

async function handleSendPayload(
  event: any,
  context: any,
  gasLimit?: bigint | null,
  gasPaid?: bigint | null,
) {
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

  // Try to find existing payload (any non-Completed status, or Completed from receiver-first)
  const existingPayloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadIdHex } });
  let payload = existingPayloads.find(
    (p: any) => p.status === "Underpaid" || p.status === "InTransit" || p.status === "Delivered" || p.status === "Completed"
  );

  let payloadIndex: number;
  let payloadEntityId: string;

  if (!payload) {
    // Create new payload (sender processed first, no prior payload)
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
      gasLimit: gasLimit ?? undefined,
      gasPaid: gasPaid ?? undefined,
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
  } else if (payload.status === "Delivered" || payload.status === "Completed") {
    // Receiver created payload first — enrich with sender-side data and link messages
    payloadIndex = payload.index;
    payloadEntityId = payload.id;

    const messages = extractMessagesFromPayload(payloadHex, versionIndex);
    let payloadPoolId: bigint | undefined = payload.poolId ?? undefined;

    for (const msg of messages) {
      const msgHash = getMessageHash(msg);
      const msgId = getMessageId(fromCentrifugeId, toCentrifugeId, msgHash);

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

    // Update payload with sender-side data (rawData, preparedAt, poolId, gas info)
    context.CrosschainPayload.set({
      ...payload,
      rawData: payloadHex,
      poolId: payloadPoolId,
      gasLimit: gasLimit ?? payload.gasLimit,
      gasPaid: gasPaid ?? payload.gasPaid,
      preparedAt: event.block.timestamp,
      preparedAtBlock: event.block.number,
      preparedAtTxHash: event.transaction.hash,
      pool_id: payloadPoolId ? payloadPoolId.toString() : payload.pool_id,
    });
  } else {
    payloadIndex = payload.index;
    payloadEntityId = payload.id;
  }

  // Create AdapterParticipation
  const adapterAddress = adapter.toLowerCase();
  await ensureAdapter(context, adapterAddress, fromCentrifugeId, event);
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
}

MultiAdapter.SendPayload.handler(async ({ event, context }) => {
  await handleSendPayload(event, context);
});

MultiAdapterV3_1.SendPayloadV3_1.handler(async ({ event, context }) => {
  const gasLimit = event.params.gasLimit;
  const gasPaid = event.params.gasPaid;
  await handleSendPayload(event, context, gasLimit, gasPaid);
});

// --- SendProof ---

MultiAdapter.SendProof.handler(async ({ event, context }) => {
  const { payloadId: payloadIdHex, adapter, centrifugeId: toCentrifugeIdNum } = event.params;
  const toCentrifugeId = toCentrifugeIdNum.toString();
  const fromCentrifugeId = getCentrifugeId(event.chainId);

  // Find payload (prefer non-Completed, fall back to Completed for receiver-first ordering)
  const existingPayloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadIdHex } });
  const payload = existingPayloads.find((p: any) => p.status !== "Completed") ?? existingPayloads[0];
  if (!payload) {
    context.log.warn(`No payload found for SendProof ${payloadIdHex}`);
    return;
  }
  const payloadIndex = payload.index;

  // Create AdapterParticipation
  const adapterAddress = adapter.toLowerCase();
  await ensureAdapter(context, adapterAddress, fromCentrifugeId, event);
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

// --- HandlePayload (shared logic) ---

async function handleHandlePayload(event: any, context: any) {
  const { payloadId: payloadIdHex, payload: payloadBytes, adapter, centrifugeId: fromCentrifugeIdNum } = event.params;
  const fromCentrifugeId = fromCentrifugeIdNum.toString();
  const toCentrifugeId = getCentrifugeId(event.chainId);

  // Find InTransit or Delivered payload
  const existingPayloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadIdHex } });
  let payload = existingPayloads.find(
    (p: any) => p.status === "InTransit" || p.status === "Delivered"
  );

  let payloadIndex: number;
  let payloadEntityId: string;

  if (!payload) {
    // Receiver processed before sender — create payload with Delivered status
    payloadIndex = existingPayloads.length;
    payloadEntityId = crosschainPayloadId(payloadIdHex, payloadIndex);
    const payloadHex = payloadBytes as `0x${string}`;

    context.CrosschainPayload.set({
      id: payloadEntityId,
      payloadId: payloadIdHex,
      index: payloadIndex,
      fromCentrifugeId,
      toCentrifugeId,
      rawData: payloadHex,
      poolId: undefined,
      status: "Delivered",
      gasLimit: undefined,
      gasPaid: undefined,
      deliveredAt: event.block.timestamp,
      deliveredAtBlock: event.block.number,
      deliveredAtTxHash: event.transaction.hash,
      completedAt: undefined,
      completedAtBlock: undefined,
      completedAtTxHash: undefined,
      preparedAt: event.block.timestamp,
      preparedAtBlock: event.block.number,
      preparedAtTxHash: event.transaction.hash,
      fromBlockchain_id: blockchainId(fromCentrifugeId),
      toBlockchain_id: blockchainId(toCentrifugeId),
      pool_id: undefined,
      ...createdDefaults(event),
    });
  } else {
    payloadIndex = payload.index;
    payloadEntityId = payload.id;
  }

  // Create AdapterParticipation (before quorum check so it's counted)
  const adapterAddress = adapter.toLowerCase();
  await ensureAdapter(context, adapterAddress, toCentrifugeId, event);
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
    payload_id: payloadEntityId,
    adapter_id: adapterIdFn(adapterAddress, toCentrifugeId),
    centrifugeBlockchain_id: blockchainId(toCentrifugeId),
    fromBlockchain_id: blockchainId(fromCentrifugeId),
    toBlockchain_id: blockchainId(toCentrifugeId),
  });

  // Quorum check: only mark InTransit → Delivered when SEND count == HANDLE count
  if (payload && payload.status === "InTransit") {
    const verified = await checkPayloadVerified(context, payloadIdHex, payloadIndex);
    if (verified) {
      const currentPayload = await context.CrosschainPayload.get(payloadEntityId);
      if (currentPayload) {
        context.CrosschainPayload.set({
          ...currentPayload,
          status: "Delivered",
          deliveredAt: event.block.timestamp,
          deliveredAtBlock: event.block.number,
          deliveredAtTxHash: event.transaction.hash,
        });

        // Order-independent: check if messages already executed (receiver processed first)
        await tryCompletePayload(context, payloadIdHex, event);
      }
    }
  }
}

MultiAdapter.HandlePayload.handler(async ({ event, context }) => {
  await handleHandlePayload(event, context);
});

MultiAdapterV3_1.HandlePayloadV3_1.handler(async ({ event, context }) => {
  await handleHandlePayload(event, context);
});

// --- HandleProof ---

MultiAdapter.HandleProof.handler(async ({ event, context }) => {
  // RECEIVING CHAIN
  const { payloadId: payloadIdHex, adapter, centrifugeId: fromCentrifugeIdNum } = event.params;
  const fromCentrifugeId = fromCentrifugeIdNum.toString();
  const toCentrifugeId = getCentrifugeId(event.chainId);

  // Find incomplete payload (prefer non-Completed, fall back to any)
  const existingPayloads = await context.CrosschainPayload.getWhere({ payloadId: { _eq: payloadIdHex } });
  let payload = existingPayloads.find((p: any) => p.status !== "Completed") ?? existingPayloads[0];

  let payloadIndex: number;
  let payloadEntityId: string;

  if (!payload) {
    // Receiver processed before sender — create payload with Delivered status
    payloadIndex = existingPayloads.length;
    payloadEntityId = crosschainPayloadId(payloadIdHex, payloadIndex);

    context.CrosschainPayload.set({
      id: payloadEntityId,
      payloadId: payloadIdHex,
      index: payloadIndex,
      fromCentrifugeId,
      toCentrifugeId,
      rawData: "0x", // No payload bytes in HandleProof — will be enriched by SendPayload
      poolId: undefined,
      status: "Delivered",
      gasLimit: undefined,
      gasPaid: undefined,
      deliveredAt: event.block.timestamp,
      deliveredAtBlock: event.block.number,
      deliveredAtTxHash: event.transaction.hash,
      completedAt: undefined,
      completedAtBlock: undefined,
      completedAtTxHash: undefined,
      preparedAt: event.block.timestamp,
      preparedAtBlock: event.block.number,
      preparedAtTxHash: event.transaction.hash,
      fromBlockchain_id: blockchainId(fromCentrifugeId),
      toBlockchain_id: blockchainId(toCentrifugeId),
      pool_id: undefined,
      ...createdDefaults(event),
    });
  } else {
    payloadIndex = payload.index;
    payloadEntityId = payload.id;
  }

  // Create AdapterParticipation (before quorum check so it's counted)
  const adapterAddress = adapter.toLowerCase();
  await ensureAdapter(context, adapterAddress, toCentrifugeId, event);
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
    payload_id: payloadEntityId,
    adapter_id: adapterIdFn(adapterAddress, toCentrifugeId),
    centrifugeBlockchain_id: blockchainId(toCentrifugeId),
    fromBlockchain_id: blockchainId(fromCentrifugeId),
    toBlockchain_id: blockchainId(toCentrifugeId),
  });

  // Quorum check: only mark InTransit → Delivered when SEND count == HANDLE count
  if (payload && payload.status === "InTransit") {
    const verified = await checkPayloadVerified(context, payloadIdHex, payloadIndex);
    if (verified) {
      const currentPayload = await context.CrosschainPayload.get(payloadEntityId);
      if (currentPayload) {
        context.CrosschainPayload.set({
          ...currentPayload,
          status: "Delivered",
          deliveredAt: event.block.timestamp,
          deliveredAtBlock: event.block.number,
          deliveredAtTxHash: event.transaction.hash,
        });

        // Order-independent: check if messages already executed (receiver processed first)
        await tryCompletePayload(context, payloadIdHex, event);
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
