import { VaultRegistry } from "generated";
import { deployVault, linkVault, unlinkVault } from "./shared/vaultOps";

// --- contractRegister for DeployVault (registers Vault contract) ---
VaultRegistry.VaultRegistryDeployVault.contractRegister(({ event, context }) => {
  context.addVault(event.params.vault);
});

// --- Handlers ---

VaultRegistry.VaultRegistryDeployVault.handler(async ({ event, context }) => {
  await deployVault(event, context);
});

VaultRegistry.VaultRegistryLinkVault.handler(async ({ event, context }) => {
  await linkVault(event, context);
});

VaultRegistry.VaultRegistryUnlinkVault.handler(async ({ event, context }) => {
  await unlinkVault(event, context);
});
