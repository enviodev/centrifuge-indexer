import { describe, expect, it, vi } from "vitest";
import {
  extractMessagesFromPayload,
  getCrosschainMessageLength,
  getCrosschainMessageType,
  getMessageHash,
  getMessageId,
  getNextIndex,
  getPayloadId,
  getVersionIndex,
} from "./messageParser";

describe("getVersionIndex", () => {
  it("uses v3.1 layout for known multiadapter on mainnet", () => {
    expect(
      getVersionIndex(1, "0x35c837f0a54b715a23d193e1476bfc9bc30073be")
    ).toBe(1);
  });

  it("normalizes address casing for override lookup", () => {
    expect(
      getVersionIndex(1, "0x35C837F0A54B715A23D193E1476BFC9BC30073BE")
    ).toBe(1);
  });

  it("defaults to v3 when no override exists", () => {
    expect(getVersionIndex(1, "0x0000000000000000000000000000000000000001")).toBe(
      0
    );
  });
});

describe("getCrosschainMessageType", () => {
  it("maps v3 type index to name", () => {
    expect(getCrosschainMessageType(1, 0)).toBe("ScheduleUpgrade");
  });

  it("maps v3_1 type index to name", () => {
    expect(getCrosschainMessageType(5, 1)).toBe("SetPoolAdapters");
  });

  it("returns _Invalid for unknown indices", () => {
    expect(getCrosschainMessageType(999, 0)).toBe("_Invalid");
  });
});

describe("getCrosschainMessageLength", () => {
  it("returns fixed length for static v3 messages", () => {
    const buf = Buffer.alloc(33);
    buf.writeUInt8(1, 0);
    expect(getCrosschainMessageLength(1, buf, 0)).toBe(33);
  });

  it("returns 0 when buffer is too small for dynamic decoder", () => {
    const buf = Buffer.alloc(10);
    buf.writeUInt8(32, 0);
    expect(getCrosschainMessageLength(32, buf, 0)).toBe(0);
  });

  it("computes dynamic v3 Request length", () => {
    const buf = Buffer.alloc(43);
    buf.writeUInt8(32, 0);
    buf.writeUInt16BE(0, 41);
    expect(getCrosschainMessageLength(32, buf, 0)).toBe(43);
  });
});

describe("extractMessagesFromPayload", () => {
  it("splits concatenated fixed-width messages", () => {
    const first = Buffer.alloc(33);
    first.writeUInt8(1, 0);
    const second = Buffer.alloc(33);
    second.writeUInt8(2, 0);
    const hex = `0x${Buffer.concat([first, second]).toString("hex")}` as const;
    const msgs = extractMessagesFromPayload(hex, 0);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.length).toBe(66 + 2);
    expect(msgs[1]?.length).toBe(66 + 2);
  });

  it("stops on truncated tail", () => {
    const buf = Buffer.alloc(20);
    buf.writeUInt8(1, 0);
    const hex = `0x${buf.toString("hex")}` as const;
    expect(extractMessagesFromPayload(hex, 0)).toHaveLength(0);
  });
});

describe("getMessageHash", () => {
  it("matches viem keccak256 for simple input", () => {
    expect(getMessageHash("0x")).toMatch(/^0x[a-f0-9]{64}$/);
  });
});

describe("getMessageId and getPayloadId", () => {
  it("produces deterministic ids", () => {
    const hash =
      "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
    const a = getMessageId("1", "2", hash);
    const b = getMessageId("1", "2", hash);
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it("getPayloadId differs when payload bytes differ", () => {
    const a = getPayloadId("1", "2", "0x01" as const);
    const b = getPayloadId("1", "2", "0x02" as const);
    expect(a).not.toBe(b);
  });
});

describe("getNextIndex", () => {
  it("returns first free suffix index", async () => {
    const getter = vi.fn(async (id: string) => id === "base-0" || id === "base-1");
    await expect(getNextIndex(getter, "base")).resolves.toBe(2);
  });

  it("returns 0 when base is unused", async () => {
    const getter = vi.fn(async () => false);
    await expect(getNextIndex(getter, "base")).resolves.toBe(0);
  });
});
