import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createLogger } from "@aztec/aztec.js/log";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { NO_FROM } from "@aztec/aztec.js/account";
import { ProtocolContractAddress } from "@aztec/aztec.js/protocol";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";
import type { createAztecNodeClient } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";

import { bridgeL1FeeJuice } from "../../bridge-fee-juice.js";
import type { MigrationAccounts } from "../shared/config.js";

type Node = ReturnType<typeof createAztecNodeClient>;

const logger = createLogger("aztec:migrate-nft");

const FEE_JUICE_AMOUNT = process.env.FEE_JUICE_AMOUNT
  ? BigInt(process.env.FEE_JUICE_AMOUNT)
  : 10n ** 22n;

const envFr = (name: string): Fr =>
  process.env[name] ? Fr.fromString(process.env[name]!) : Fr.random();

async function feeJuiceBalance(node: Node, address: AztecAddress): Promise<bigint> {
  const slot = await deriveStorageSlotInMap(new Fr(1), address);
  return (
    await node.getPublicStorageAt("latest", ProtocolContractAddress.FeeJuice, slot)
  ).toBigInt();
}

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

/** Fresh (or reused via OLD_* / NEW_* env) bridged Schnorr accounts. */
export async function resolveTestnetAccounts(
  wallet: EmbeddedWallet,
  node: Node,
): Promise<MigrationAccounts> {
  return {
    oldAddr: await useTestnetAccount(wallet, node, "ALICE-OLD", envFr("OLD_SECRET"), envFr("OLD_SALT")),
    newAddr: await useTestnetAccount(wallet, node, "ALICE-NEW", envFr("NEW_SECRET"), envFr("NEW_SALT")),
  };
}
