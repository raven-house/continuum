
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData, INITIAL_TEST_SIGNING_KEYS } from "@aztec/accounts/testing";

import type { MigrationAccounts } from "../shared/config.js";

async function useSandboxAccount(
  wallet: EmbeddedWallet,
  label: string,
  index: number,
): Promise<AztecAddress> {
  console.log(`\n[${label}] using pre-funded sandbox test account...`);

  const data = (await getInitialTestAccountsData())[index];
  if (!data) {
    throw new Error(
      `Sandbox has no initial test account #${index}. ` +
        "Start it with `aztec start --local-network`.",
    );
  }

  const account = await wallet.createSchnorrInitializerlessAccount(
    data.secret,
    data.salt,
    INITIAL_TEST_SIGNING_KEYS[index],
  );
  console.log(`  ✓ ${account.address.toString()}`);
  return account.address;
}

export async function resolveSandboxAccounts(
  wallet: EmbeddedWallet,
): Promise<MigrationAccounts> {
  return {
    oldAddr: await useSandboxAccount(wallet, "ALICE-OLD", 0),
    newAddr: await useSandboxAccount(wallet, "ALICE-NEW", 1),
  };
}
