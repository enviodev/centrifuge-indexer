// Decoder utilities for Hub.UpdateContract payloads
// Ported from api-v3/src/helpers/updateContractDecoders.ts

export type DecodedSyncManagerTrustedCall =
  | { kind: "Valuation" }
  | { kind: "MaxReserve"; assetId: bigint; maxReserve: bigint };

/**
 * Decodes ISyncManager.TrustedCall payloads (kind 0 = Valuation, kind 1 = MaxReserve).
 * Layout: [1-byte kind] [rest is ABI-encoded params]
 * For MaxReserve: kind(1) + poolId(32) + scId(32) + assetAddress(32) + tokenId(32) + maxReserve(32)
 */
export function decodeSyncManagerTrustedCall(
  payload: string
): DecodedSyncManagerTrustedCall | null {
  try {
    const data = payload.startsWith("0x") ? payload.slice(2) : payload;
    if (data.length < 2) return null;

    const kind = parseInt(data.slice(0, 2), 16);

    if (kind === 0) {
      return { kind: "Valuation" };
    }

    if (kind === 1) {
      // MaxReserve: skip kind byte, then 5 words of 32 bytes each
      // Word layout after kind: poolId, scId, asset, tokenId, maxReserve
      if (data.length < 2 + 5 * 64) return null;

      const offset = 2; // after kind byte
      // Skip poolId (word 0) and scId (word 1) — already available from event params
      // Word 2: asset address (last 20 bytes of 32-byte word)
      // Word 3: tokenId
      const assetIdHex = data.slice(offset + 3 * 64, offset + 4 * 64);
      const assetId = BigInt("0x" + assetIdHex);
      // Word 4: maxReserve (uint128, right-aligned in 32-byte word)
      const maxReserveHex = data.slice(offset + 4 * 64, offset + 5 * 64);
      const maxReserve = BigInt("0x" + maxReserveHex);

      return { kind: "MaxReserve", assetId, maxReserve };
    }

    return null;
  } catch {
    return null;
  }
}
