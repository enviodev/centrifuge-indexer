// Crosschain message parsing utilities
// Ported from api-v3/src/services/CrosschainMessageService.ts and CrosschainPayloadService.ts

import { keccak256, encodePacked } from "viem";

// --- Dynamic length decoder helpers ---

function dynamicLengthDecoder(baseLength: number) {
  return function (message: Buffer): number {
    if (message.length < baseLength + 2) return 0; // Safety: not enough bytes
    return baseLength + 2 + message.readUInt16BE(baseLength);
  };
}

function setPoolAdaptersLengthDecoder(message: Buffer): number {
  if (message.length < 13) return 0;
  const length = message.readUInt16BE(11);
  return 13 + length * 32;
}

// --- Message Type Definitions ---
// The message type byte → type name + byte length
// Object.keys() preserves insertion order, so index in keys array = message type byte value

// V3 Message Types (versionIndex = 0)
const V3_MESSAGE_TYPES = {
  _Invalid: 0 as number | ((buf: Buffer) => number),
  ScheduleUpgrade: 33,
  CancelUpgrade: 33,
  RecoverTokens: 161,
  RegisterAsset: 18,
  _Placeholder5: 0,
  _Placeholder6: 0,
  _Placeholder7: 0,
  _Placeholder8: 0,
  _Placeholder9: 0,
  _Placeholder10: 0,
  _Placeholder11: 0,
  _Placeholder12: 0,
  _Placeholder13: 0,
  _Placeholder14: 0,
  _Placeholder15: 0,
  NotifyPool: 9,
  NotifyShareClass: 250,
  NotifyPricePoolPerShare: 49,
  NotifyPricePoolPerAsset: 65,
  NotifyShareMetadata: 185,
  UpdateShareHook: 57,
  InitiateTransferShares: 91,
  ExecuteTransferShares: 73,
  UpdateRestriction: dynamicLengthDecoder(25),
  UpdateContract: dynamicLengthDecoder(57),
  UpdateVault: 74,
  UpdateBalanceSheetManager: 42,
  UpdateHoldingAmount: 91,
  UpdateShares: 59,
  MaxAssetPriceAge: 49,
  MaxSharePriceAge: 33,
  Request: dynamicLengthDecoder(41),
  RequestCallback: dynamicLengthDecoder(41),
  SetRequestManager: 73,
} as const;

// V3_1 Message Types (versionIndex = 1)
const V3_1_MESSAGE_TYPES = {
  _Invalid: 0 as number | ((buf: Buffer) => number),
  ScheduleUpgrade: 33,
  CancelUpgrade: 33,
  RecoverTokens: 161,
  RegisterAsset: 18,
  SetPoolAdapters: setPoolAdaptersLengthDecoder,
  NotifyPool: 9,
  NotifyShareClass: 250,
  NotifyPricePoolPerShare: 49,
  NotifyPricePoolPerAsset: 65,
  NotifyShareMetadata: 185,
  UpdateShareHook: 57,
  InitiateTransferShares: 107,
  ExecuteTransferShares: 89,
  UpdateRestriction: dynamicLengthDecoder(41),
  UpdateVault: 90,
  UpdateBalanceSheetManager: 42,
  UpdateGatewayManager: 42,
  UpdateHoldingAmount: 107,
  UpdateShares: 75,
  SetMaxAssetPriceAge: 49,
  SetMaxSharePriceAge: 33,
  Request: dynamicLengthDecoder(57),
  RequestCallback: dynamicLengthDecoder(57),
  SetRequestManager: 41,
  TrustedContractUpdate: dynamicLengthDecoder(73),
  UntrustedContractUpdate: dynamicLengthDecoder(105),
} as const;

const MESSAGE_TYPE_VERSIONS = [V3_MESSAGE_TYPES, V3_1_MESSAGE_TYPES] as const;

// --- Version detection ---
// Map of (chainId, contractAddress) → versionIndex
// Default is V3 (index 0) for all current deployments
const VERSION_OVERRIDES: Record<string, number> = {
  // V3.1 MultiAdapter addresses (all chains use same address)
  "1-0x35c837f0a54b715a23d193e1476bfc9bc30073be": 1,
  "56-0x35c837f0a54b715a23d193e1476bfc9bc30073be": 1,
  "8453-0x35c837f0a54b715a23d193e1476bfc9bc30073be": 1,
  "42161-0x35c837f0a54b715a23d193e1476bfc9bc30073be": 1,
  "43114-0x35c837f0a54b715a23d193e1476bfc9bc30073be": 1,
  "98866-0x35c837f0a54b715a23d193e1476bfc9bc30073be": 1,
  // V3.1 Gateway addresses (all chains use same address)
  "1-0x19a524d03aa94ecee41a80341537bcfcb47d3172": 1,
  "56-0x19a524d03aa94ecee41a80341537bcfcb47d3172": 1,
  "8453-0x19a524d03aa94ecee41a80341537bcfcb47d3172": 1,
  "42161-0x19a524d03aa94ecee41a80341537bcfcb47d3172": 1,
  "43114-0x19a524d03aa94ecee41a80341537bcfcb47d3172": 1,
  "98866-0x19a524d03aa94ecee41a80341537bcfcb47d3172": 1,
};

/** Get version index (0=V3, 1=V3_1) for a contract on a given chain */
export function getVersionIndex(chainId: number, srcAddress: string): number {
  const key = `${chainId}-${srcAddress.toLowerCase()}`;
  return VERSION_OVERRIDES[key] ?? 0; // Default to V3
}

// --- Core Functions ---

/** Get the crosschain message type name from its numeric ID */
export function getCrosschainMessageType(messageType: number, versionIndex: number = 0): string {
  const types = MESSAGE_TYPE_VERSIONS[versionIndex] ?? MESSAGE_TYPE_VERSIONS[0];
  const keys = Object.keys(types);
  return keys[messageType] ?? "_Invalid";
}

/** Get the total byte length of a message given its type ID and buffer */
export function getCrosschainMessageLength(messageType: number, message: Buffer, versionIndex: number = 0): number {
  const types = MESSAGE_TYPE_VERSIONS[versionIndex] ?? MESSAGE_TYPE_VERSIONS[0];
  const values = Object.values(types);
  const lengthEntry = values[messageType];
  if (lengthEntry === undefined || lengthEntry === null) return 0;
  if (typeof lengthEntry === "function") {
    try {
      return (lengthEntry as (buf: Buffer) => number)(message);
    } catch {
      return 0; // Safety: buffer too small for dynamic length read
    }
  }
  return lengthEntry as number;
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
export function extractMessagesFromPayload(payload: `0x${string}`, versionIndex: number = 0): `0x${string}`[] {
  const payloadBuffer = Buffer.from(payload.substring(2), "hex");
  const messages: `0x${string}`[] = [];
  let offset = 0;

  while (offset < payloadBuffer.length) {
    const messageType = payloadBuffer.readUInt8(offset);
    const currentBuffer = payloadBuffer.subarray(offset);
    const messageLength = getCrosschainMessageLength(messageType, currentBuffer, versionIndex);
    if (!messageLength || messageLength > currentBuffer.length) break;

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
