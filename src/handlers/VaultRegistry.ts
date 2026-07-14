import { indexer } from "envio";
import { deployVault, linkVault, unlinkVault } from "./shared/vaultOps";

// --- contractRegister for DeployVault (registers Vault contract) ---
indexer.contractRegister(
  { contract: "VaultRegistry", event: "VaultRegistryDeployVault" },
  async ({ event, context }) => {
  context.chain.Vault.add(event.params.vault);
}
);

// --- Handlers ---

indexer.onEvent(
  { contract: "VaultRegistry", event: "VaultRegistryDeployVault" },
  async ({ event, context }) => {
  await deployVault(event, context);
}
);

indexer.onEvent(
  { contract: "VaultRegistry", event: "VaultRegistryLinkVault" },
  async ({ event, context }) => {
  await linkVault(event, context);
}
);

indexer.onEvent(
  { contract: "VaultRegistry", event: "VaultRegistryUnlinkVault" },
  async ({ event, context }) => {
  await unlinkVault(event, context);
}
);
