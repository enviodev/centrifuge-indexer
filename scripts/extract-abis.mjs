#!/usr/bin/env node

/**
 * Fetch the Centrifuge on-chain registry, walk the previousRegistry chain,
 * and extract every ABI as a standalone JSON file under abis/.
 *
 * Usage:  node scripts/extract-abis.mjs
 */

import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ABI_DIR = join(ROOT, "abis");
const REGISTRY_URL = "https://registry.centrifuge.io/";
const IPFS_GATEWAY = "https://ipfs.centrifuge.io/ipfs";

// ---------------------------------------------------------------------------
// Registry fetching (same logic as api-v3/scripts/fetch-registry.mjs)
// ---------------------------------------------------------------------------

async function fetchRegistry(ipfsHash) {
  const url = ipfsHash ? `${IPFS_GATEWAY}/${ipfsHash}` : REGISTRY_URL;
  console.log(`Fetching registry from: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch registry: ${res.statusText}`);
  return res.json();
}

async function fetchRegistryChain(chain = []) {
  if (chain.length === 0) chain.unshift(await fetchRegistry());
  const registry = chain[0];
  const prevHash = registry.previousRegistry?.ipfsHash;
  if (!prevHash) return chain;
  const prev = await fetchRegistry(prevHash);
  chain.unshift(prev);
  if (prev.previousRegistry) await fetchRegistryChain(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await fs.mkdir(ABI_DIR, { recursive: true });

  // 1. Walk the registry chain and collect all ABIs
  const registryChain = await fetchRegistryChain();
  const allAbis = new Map(); // name → abi (latest version wins)

  for (const registry of registryChain) {
    const version = registry.version ?? "unknown";
    if (registry.abis) {
      for (const [name, abi] of Object.entries(registry.abis)) {
        allAbis.set(name, abi);
        console.log(`  [${version}] collected ABI: ${name}`);
      }
    }
  }

  // 2. Write each ABI as a standalone JSON file
  for (const [name, abi] of allAbis) {
    const filePath = join(ABI_DIR, `${name}.json`);
    await fs.writeFile(filePath, JSON.stringify(abi, null, 2) + "\n", "utf-8");
    console.log(`Wrote ${filePath}`);
  }

  // 3. Convert api-v3/abis/ERC20.ts → abis/ERC20.json (if not already from registry)
  if (!allAbis.has("ERC20")) {
    const erc20TsPath = join(ROOT, "..", "api-v3", "abis", "ERC20.ts");
    try {
      const tsContent = await fs.readFile(erc20TsPath, "utf-8");
      // Extract the array literal from the TS export
      const match = tsContent.match(/export const ERC20Abi\s*=\s*(\[[\s\S]*?\])\s*as const/);
      if (match) {
        // Use Function constructor to evaluate the array literal safely
        const abi = new Function(`return ${match[1]}`)();
        const filePath = join(ABI_DIR, "ERC20.json");
        await fs.writeFile(filePath, JSON.stringify(abi, null, 2) + "\n", "utf-8");
        console.log(`Wrote ${filePath} (from api-v3/abis/ERC20.ts)`);
      } else {
        console.warn("Could not parse ERC20.ts");
      }
    } catch (e) {
      console.warn(`Could not read ERC20.ts: ${e.message}`);
    }
  }

  // 4. Also dump the full registry data for config.yaml generation
  const registryDataPath = join(ROOT, "scripts", "registry-data.json");
  await fs.writeFile(
    registryDataPath,
    JSON.stringify(registryChain, null, 2) + "\n",
    "utf-8"
  );
  console.log(`\nWrote registry data to ${registryDataPath}`);

  console.log(`\nDone! ${allAbis.size} ABI files written to abis/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
