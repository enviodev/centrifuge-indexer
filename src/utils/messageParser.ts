// Crosschain message parsing utilities
// Ported from api-v3/src/services/CrosschainMessageService.ts and CrosschainPayloadService.ts

import { keccak256, encodePacked, toHex } from "viem";

// --- Message Type Definitions ---

// V3_1 message types (index 1) — this is the version used by our contracts
const MESSAGE_TYPES = [
  "_Invalid",
  "ScheduleUpgrade",
  "CancelUpgrade",
  "RecoverTokens",
  "RegisterAsset",
  "SetPoolAdapters",
  "NotifyPool",
  "NotifyShareClass",
  "NotifyPricePoolPerShare",
  "NotifyPricePoolPerAsset",
  "NotifyShareMetadata",
  "UpdateShareHook",
  "InitiateTransferShares",
  "ExecuteTransferShares",
  "UpdateRestriction",
  "UpdateVault",
  "UpdateBalanceSheetManager",
  "UpdateGatewayManager",
  "UpdateHoldingAmount",
  "UpdateShares",
  "SetMaxAssetPriceAge",
  "SetMaxSharePriceAge",
  "Request",
  "RequestCallback",
  "SetRequestManager",
  "TrustedContractUpdate",
  "UntrustedContractUpdate",
] as const;

// Base message lengths for V3_1
const MESSAGE_LENGTHS: Record<string, number | ((buf: Buffer) => number)> = {
  _Invalid: 0,
  ScheduleUpgrade: 33,
  CancelUpgrade: 33,
  RecoverTokens: 161,
  RegisterAsset: 18,
  SetPoolAdapters: (buf: Buffer) => 13 + buf.readUInt16BE(11) * 32,
  NotifyPool: 9,
  NotifyShareClass: 250,
  NotifyPricePoolPerShare: 49,
  NotifyPricePoolPerAsset: 65,
  NotifyShareMetadata: 185,
  UpdateShareHook: 57,
  InitiateTransferShares: 91,
  ExecuteTransferShares: 73,
  UpdateRestriction: (buf: Buffer) => 25 + 2 + buf.readUInt16BE(25),
  UpdateVault: 74,
  UpdateBalanceSheetManager: 42,
  UpdateGatewayManager: 42,
  UpdateHoldingAmount: 91,
  UpdateShares: 59,
  SetMaxAssetPriceAge: 49,
  SetMaxSharePriceAge: 33,
  Request: (buf: Buffer) => 41 + 2 + buf.readUInt16BE(41),
  RequestCallback: (buf: Buffer) => 41 + 2 + buf.readUInt16BE(41),
  SetRequestManager: 73,
  TrustedContractUpdate: (buf: Buffer) => 57 + 2 + buf.readUInt16BE(57),
  UntrustedContractUpdate: (buf: Buffer) => 89 + 2 + buf.readUInt16BE(89),
};

// --- Core Functions ---

/** Get the crosschain message type name from its numeric ID */
export function getCrosschainMessageType(messageType: number): string {
  return MESSAGE_TYPES[messageType] ?? "_Invalid";
}

/** Get the total byte length of a message given its type ID and buffer */
export function getCrosschainMessageLength(messageType: number, message: Buffer): number {
  const typeName = getCrosschainMessageType(messageType);
  const lengthEntry = MESSAGE_LENGTHS[typeName];
  if (lengthEntry === undefined) return 0;
  return typeof lengthEntry === "function" ? lengthEntry(message) : lengthEntry;
}

/** Compute keccak256 hash of message bytes */
export function getMessageHash(messageBytes: `0x${string}`): `0x${string}` {
  return keccak256(messageBytes);
}

/** Compute unique message ID from source/dest chain IDs and message hash */
export function getMessageId(
  sourceCentrifugeId: string,
  destCentrifugeId: string,
  messageHash: `0x${string}`
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["uint16", "uint16", "bytes"],
      [Number(sourceCentrifugeId), Number(destCentrifugeId), messageHash]
    )
  );
}

/** Compute unique payload ID from source/dest chain IDs and payload data */
export function getPayloadId(
  fromCentrifugeId: string,
  toCentrifugeId: string,
  payload: `0x${string}`
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["uint16", "uint16", "bytes32"],
      [Number(fromCentrifugeId), Number(toCentrifugeId), keccak256(payload)]
    )
  );
}

/** Extract individual messages from a concatenated batch payload */
export function extractMessagesFromPayload(payload: `0x${string}`): `0x${string}`[] {
  const payloadBuffer = Buffer.from(payload.substring(2), "hex");
  const messages: `0x${string}`[] = [];
  let offset = 0;

  while (offset < payloadBuffer.length) {
    const messageType = payloadBuffer.readUInt8(offset);
    const currentBuffer = payloadBuffer.subarray(offset);
    const messageLength = getCrosschainMessageLength(messageType, currentBuffer);
    if (!messageLength) break;

    const messageBytes = currentBuffer.subarray(0, messageLength);
    messages.push(`0x${messageBytes.toString("hex")}` as `0x${string}`);
    offset += messageLength;
  }

  return messages;
}

/** Try to find the next available index for an entity with composite ID base-index */
export async function getNextIndex(
  getter: (id: string) => Promise<any>,
  baseId: string
): Promise<number> {
  let index = 0;
  while (await getter(`${baseId}-${index}`)) {
    index++;
  }
  return index;
}
