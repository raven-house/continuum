/**
 * Account setup for the two actors (Alice's OLD wallet and her NEW wallet).
 *
 *  - Sandbox: reuse the pre-funded genesis test accounts (no bridging, no proving).
 *  - Testnet: reconstruct fresh Schnorr accounts and bridge fee juice from L1.
 */

import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { NO_FROM } from "@aztec/aztec.js/account";
import { ProtocolContractAddress } from "@aztec/aztec.js/protocol";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";
import { getInitialTestAccountsData, INITIAL_TEST_SIGNING_KEYS } from "@aztec/accounts/testing";

import { bridgeL1FeeJuice } from "../bridge-fee-juice.js";
import { FEE_JUICE_AMOUNT, isSandbox, logger } from "./config.js";

type Node = ReturnType<typeof createAztecNodeClient>;

export type MigrationAccounts = {
  /** Owner + minter on the old collection. */
  oldAddr: AztecAddress;
  /** Claimer on the new collection. */
  newAddr: AztecAddress;
};

async function feeJuiceBalance(node: Node, address: AztecAddress): Promise<bigint> {
  const slot = await deriveStorageSlotInMap(new Fr(1), address);
  return (
    await node.getPublicStorageAt("latest", ProtocolContractAddress.FeeJuice, slot)
  ).toBigInt();
}

const envFr = (name: string): Fr =>
  process.env[name] ? Fr.fromString(process.env[name]!) : Fr.random();

/** Reuse a pre-funded sandbox genesis account (already deployed + funded). */
async function useSandboxAccount(
  wallet: EmbeddedWallet,
  node: Node,
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

  // The data's `signingKey` field is the encryption key; the address is derived
  // from INITIAL_TEST_SIGNING_KEYS, so pass that to reconstruct the funded account.
  const account = await wallet.createSchnorrInitializerlessAccount(
    data.secret,
    data.salt,
    INITIAL_TEST_SIGNING_KEYS[index],
  );
  const address = account.address;

  const balance = await feeJuiceBalance(node, address);
  if (balance === 0n) {
    throw new Error(
      `Sandbox test account ${address.toString()} has no fee juice. ` +
        "Start the sandbox with `aztec start --local-network` so the initial accounts are funded.",
    );
  }
  console.log(`  ✓ ${address.toString()} (${balance} fee juice)`);
  return address;
}

/** Reconstruct a Schnorr account on testnet, bridging fee juice + deploying if unfunded. */
async function useTestnetAccount(
  wallet: EmbeddedWallet,
  node: Node,
  label: string,
  secret: Fr,
  salt: Fr,
): Promise<AztecAddress> {
  console.log(`\n[${label}] setting up account (testnet)...`);
  const account = await wallet.createSchnorrAccount(secret, salt);
  const address = account.address;
  console.log(`  address: ${address.toString()}`);

  if ((await feeJuiceBalance(node, address)) > 0n) {
    console.log("  ✓ already deployed");
    return address;
  }

  console.log("  bridging fee juice from L1 Sepolia (can take a few minutes)...");
  const claim = await bridgeL1FeeJuice(node, address, FEE_JUICE_AMOUNT, logger);
  await (
    await account.getDeployMethod()
  ).send({
    from: NO_FROM,
    fee: { paymentMethod: new FeeJuicePaymentMethodWithClaim(address, claim) },
  });
  console.log("  ✓ account deployed");
  return address;
}

/** Resolve the OLD + NEW accounts for the current network. */
export async function resolveAccounts(
  wallet: EmbeddedWallet,
  node: Node,
): Promise<MigrationAccounts> {
  if (isSandbox) {
    return {
      oldAddr: await useSandboxAccount(wallet, node, "ALICE-OLD", 0),
      newAddr: await useSandboxAccount(wallet, node, "ALICE-NEW", 1),
    };
  }
  return {
    oldAddr: await useTestnetAccount(wallet, node, "ALICE-OLD", envFr("OLD_SECRET"), envFr("OLD_SALT")),
    newAddr: await useTestnetAccount(wallet, node, "ALICE-NEW", envFr("NEW_SECRET"), envFr("NEW_SALT")),
  };
}
