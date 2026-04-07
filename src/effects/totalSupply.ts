import { createEffect, S } from "envio";
import { createPublicClient, http, erc20Abi } from "viem";
import { mainnet, arbitrum, base, avalanche, bsc, optimism } from "viem/chains";

// Chain ID → viem chain + RPC mapping
const chainConfigs: Record<number, { chain: any; rpc: string }> = {
  1: { chain: mainnet, rpc: "https://eth.llamarpc.com" },
  42161: { chain: arbitrum, rpc: "https://arb1.arbitrum.io/rpc" },
  8453: { chain: base, rpc: "https://mainnet.base.org" },
  43114: { chain: avalanche, rpc: "https://api.avax.network/ext/bc/C/rpc" },
  56: { chain: bsc, rpc: "https://bsc-dataseed.binance.org" },
  10: { chain: optimism, rpc: "https://mainnet.optimism.io" },
  98866: { chain: { id: 98866, name: "Plume", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.plume.org"] } } }, rpc: "https://rpc.plume.org" },
  999: { chain: { id: 999, name: "Hyperliquid", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.hyperliquid.xyz/evm"] } } }, rpc: "https://rpc.hyperliquid.xyz/evm" },
  143: { chain: { id: 143, name: "Monad", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } } }, rpc: "https://rpc.monad.xyz" },
};

// Input: JSON string of { chainId, tokenAddress }
export const readTotalSupply = createEffect(
  {
    name: "readTotalSupply",
    input: S.string,
    output: S.string,
    rateLimit: { calls: 5, per: "second" },
    cache: true,
  },
  async ({ input }) => {
    const { chainId, tokenAddress } = JSON.parse(input);
    const config = chainConfigs[chainId];
    if (!config) return "0";

    try {
      const client = createPublicClient({
        chain: config.chain,
        transport: http(config.rpc),
      });

      const totalSupply = await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "totalSupply",
      });

      return totalSupply.toString();
    } catch {
      return "0";
    }
  }
);
