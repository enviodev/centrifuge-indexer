import { getCentrifugeId } from "../../utils/chains";
import { createdDefaults, updatedDefaults } from "../../utils/defaults";
import { vaultId as vaultIdFn, tokenId as tokenIdFn } from "../../utils/ids";

const VAULT_KINDS: Record<string, "Async" | "Sync" | "SyncDepositAsyncRedeem"> = {
  "0": "Async",
  "1": "Sync",
  "2": "SyncDepositAsyncRedeem",
};

type VaultEventParams = {
  poolId: bigint;
  scId: string;
  asset: string;
  tokenId: bigint;
  factory: string;
  vault: string;
  kind: bigint;
};

type LinkUnlinkEventParams = {
  vault: string;
};

export async function deployVault(
  event: { params: VaultEventParams; chainId: number; block: { timestamp: number; number: number }; transaction: { hash: string } },
  context: any
) {
  const { poolId, scId: tokenId, asset: assetAddress, factory, vault: vaultAddress, kind } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);

  const vaultKind = VAULT_KINDS[kind.toString()];
  if (!vaultKind) {
    context.log.warn(`Invalid vault kind ${kind}. Cannot deploy vault`);
    return;
  }

  // Look up assetId from Asset by address
  const assets = await context.Asset.getWhere({ address: { _eq: assetAddress.toLowerCase() } });
  const asset = assets[0];
  const assetId = asset ? BigInt(asset.id) : 0n;

  const id = vaultIdFn(vaultAddress, centrifugeId);
  const existing = await context.Vault.get(id);

  context.Vault.set({
    id,
    centrifugeId,
    isActive: true,
    kind: vaultKind,
    status: "Unlinked",
    poolId,
    tokenId,
    assetId,
    assetAddress: assetAddress.toLowerCase(),
    factory: factory.toLowerCase(),
    manager: undefined,
    maxReserve: existing?.maxReserve ?? undefined,
    crosschainInProgress: existing?.crosschainInProgress ?? undefined,
    blockchain_id: centrifugeId,
    token_id: tokenIdFn(poolId, tokenId),
    asset_id: asset ? asset.id : undefined,
    tokenInstance_id: undefined,
    ...(existing ? { ...createdDefaults(event), ...updatedDefaults(event) } : createdDefaults(event)),
  });
}

export async function linkVault(
  event: { params: LinkUnlinkEventParams; chainId: number; block: { timestamp: number; number: number }; transaction: { hash: string } },
  context: any
) {
  const { vault: vaultAddress } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);

  const id = vaultIdFn(vaultAddress, centrifugeId);
  const vault = await context.Vault.get(id);
  if (!vault) {
    context.log.warn(`Vault ${vaultAddress} not found. Cannot link vault`);
    return;
  }

  context.Vault.set({
    ...vault,
    status: "Linked",
    crosschainInProgress: undefined,
    ...updatedDefaults(event),
  });
}

export async function unlinkVault(
  event: { params: LinkUnlinkEventParams; chainId: number; block: { timestamp: number; number: number }; transaction: { hash: string } },
  context: any
) {
  const { vault: vaultAddress } = event.params;
  const centrifugeId = getCentrifugeId(event.chainId);

  const id = vaultIdFn(vaultAddress, centrifugeId);
  const vault = await context.Vault.get(id);
  if (!vault) {
    context.log.warn(`Vault ${vaultAddress} not found. Cannot unlink vault`);
    return;
  }

  context.Vault.set({
    ...vault,
    status: "Unlinked",
    crosschainInProgress: undefined,
    ...updatedDefaults(event),
  });
}
