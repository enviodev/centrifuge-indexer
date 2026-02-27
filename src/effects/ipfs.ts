import { createEffect, S } from "envio";

const IPFS_GATEWAY = "https://centrifuge.mypinata.cloud/ipfs/";

export const fetchPoolMetadata = createEffect(
  {
    name: "fetchPoolMetadata",
    input: S.string,
    output: S.string,
    rateLimit: { calls: 5, per: "second" },
    cache: true,
  },
  async ({ input: ipfsHash }) => {
    const hash = ipfsHash.replace("ipfs://", "");
    const response = await fetch(`${IPFS_GATEWAY}${hash}`);
    if (!response.ok) throw new Error(`IPFS fetch failed: ${response.status}`);
    const data = await response.json();
    return JSON.stringify(data);
  }
);
