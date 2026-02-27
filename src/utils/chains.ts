// Chain metadata — ported from api-v3/src/chains.ts

export const networkNames: Record<string, string> = {
  "1": "ethereum",
  "42161": "arbitrum",
  "43114": "avalanche",
  "8453": "base",
  "56": "binance",
  "98866": "plume",
  "10": "optimism",
  "143": "monad",
  "999": "hyperliquid",
};

export const explorerUrls: Record<string, string> = {
  "1": "https://etherscan.io",
  "42161": "https://arbiscan.io",
  "43114": "https://snowtrace.io",
  "8453": "https://basescan.org",
  "56": "https://bscscan.com",
  "98866": "https://explorer.plume.org",
  "10": "https://optimistic.etherscan.io",
  "143": "https://monad.socialscan.io",
  "999": "https://hyperevmscan.io",
};

export const chainIcons: Record<string, string> = {
  "1": "https://ipfs.centrifuge.io/ipfs/bafkreihk753r3oksmw5pburcz4dxq2xazsarihdkeae2ilt7tc7lj2hggm",
  "8453": "https://ipfs.centrifuge.io/ipfs/bafkreifpdqjq6jvh4xat54ymcue6p4n24ifc3gzz2446cipumiwbz7ybu4",
  "42161": "https://ipfs.centrifuge.io/ipfs/bafkreiemrnwrwcxbwho3ut6x3k4zv4jerowpwnynovt6sbc7kgqbfknq7a",
  "98866": "https://ipfs.centrifuge.io/ipfs/bafkreiecr63jf4mvgylcnxry3wsds6cdmjsnzcybjffmvcpxhes6qwfngy",
  "43114": "https://ipfs.centrifuge.io/ipfs/bafkreiaxodsgromeeaihu44fazsxdopkrqvinqzhyfxvx5mrbcmduqdfpq",
  "56": "https://ipfs.centrifuge.io/ipfs/bafkreidiypdacfywbuokj7r3e7td5bs6ojkh37ycz3uwfcbd34xka2qtai",
  "10": "https://ipfs.centrifuge.io/ipfs/QmXR2gUAwJdEhH7MAqEqd6NTGB58XibiKvtE3TUoe6CcMK",
  "143": "https://ipfs.centrifuge.io/ipfs/QmX86URyeeYYR5DxcnKfYF7ApMeRQPC9JurZBTS9VBUiAH",
  "999": "https://ipfs.centrifuge.io/ipfs/QmZnmSzzq3Jspa3HxUdk4JQAWgtAQtinBdDTBdAFn2jijX",
};

// Blocks to skip for periodic block handlers (snapshot intervals)
export const skipBlocks: Record<string, number> = {
  "1": 300,
  "42161": 14230,
  "43114": 1800,
  "8453": 1800,
  "56": 4800,
  "98866": 9000,
  "10": 1800,
  "143": 9000,
  "999": 18000,
};

// Centrifuge chain IDs (used to map EVM chainId → centrifugeId in the Hub)
// These are NOT the same as EVM chain IDs — they come from the Centrifuge registry.
export const centrifugeIds: Record<string, string> = {
  "1": "1",       // Ethereum
  "56": "6",      // Binance Smart Chain
  "8453": "2",    // Base
  "42161": "3",   // Arbitrum
  "43114": "5",   // Avalanche
  "98866": "4",   // Plume
};

/** Convert an EVM chainId to the Centrifuge-internal centrifugeId. */
export function getCentrifugeId(chainId: number): string {
  const id = centrifugeIds[chainId.toString()];
  if (!id) throw new Error(`No centrifugeId mapping for chainId ${chainId}`);
  return id;
}

// Reverse mapping: centrifugeId → EVM chainId string
export const chainIdByCentrifugeId: Record<string, string> = Object.fromEntries(
  Object.entries(centrifugeIds).map(([chainId, centId]) => [centId, chainId])
);

/** Get chain metadata (network name, explorer, icon) for a centrifugeId. */
export function getChainMetadata(centrifugeId: string): {
  network: string;
  chainId: string | undefined;
  explorer: string | undefined;
  icon: string | undefined;
} {
  const chainId = chainIdByCentrifugeId[centrifugeId];
  return {
    network: chainId ? (networkNames[chainId] ?? centrifugeId) : centrifugeId,
    chainId,
    explorer: chainId ? explorerUrls[chainId] : undefined,
    icon: chainId ? chainIcons[chainId] : undefined,
  };
}

// Known adapter addresses (CREATE2 deterministic, same across all chains except Plume)
export const ADAPTER_ADDRESSES: Record<string, string> = {
  "0x6b98679eec5b5de3a803dc801b2f12adddcd39ec": "wormhole",
  "0x52271c9a29d0f97c350bbe32b3377cdd26026d0a": "axelar",
};

// Global escrow address (same across all chains)
export const GLOBAL_ESCROW_ADDRESS = "0x43d51be0b6de2199a2396ba604114d24383f91e9";
