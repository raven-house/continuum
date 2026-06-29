/**
 * Deploy script for the AttestorExample contract.
 *
 * On testnet (default): bridges fee juice from L1 Sepolia, deploys a Schnorr
 * account, then deploys AttestorExample using the bridged fee juice.
 *
 * On sandbox (localhost): skips fee bridging — gas is free.
 *
 * Usage:
 *   bun run deploy-example
 *
 * Required env vars (testnet):
 *   L1_PRIVATE_KEY     - Sepolia-funded private key (0x-prefixed) for fee juice bridging
 *
 * Optional env vars:
 *   AZTEC_NODE_URL     - Aztec node URL (default: https://v5.testnet.rpc.aztec-labs.com)
 *   ATTESTER_SECRET    - Hex secret key for the attester (default: random, printed at end)
 *
 * Sandbox example:
 *   AZTEC_NODE_URL=http://localhost:8080 bun run deploy-example
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Fr } from "@aztec/aztec.js/fields";
import { Contract } from "@aztec/aztec.js/contracts";
import { loadContractArtifact, type NoirCompiledContract } from "@aztec/aztec.js/abi";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { NO_FROM } from "@aztec/aztec.js/account";
import { ProtocolContractAddress } from "@aztec/aztec.js/protocol";
import { createLogger } from "@aztec/aztec.js/log";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";

import { Attester } from "./index.js";
import { bridgeL1FeeJuice } from "./bridge-fee-juice.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TESTNET_URL = "https://v5.testnet.rpc.aztec-labs.com";
const FEE_JUICE_AMOUNT = 10n ** 21n;

const NODE_URL = process.env.AZTEC_NODE_URL ?? TESTNET_URL;
const ATTESTER_SECRET = process.env.ATTESTER_SECRET;

async function main() {
  const logger = createLogger("aztec:deploy-example");
  console.log("=== Deploy AttestorExample Contract ===\n");

  const isSandbox = NODE_URL.includes("localhost");
  const isRemote = !isSandbox;

  // 1. Connect to Aztec node
  console.log(`1. Connecting to Aztec node at ${NODE_URL}...`);
  const node = createAztecNodeClient(NODE_URL);
  const nodeInfo = await node.getNodeInfo();
  console.log(`   ✓ Connected (l1ChainId: ${nodeInfo.l1ChainId})`);

  // 2. Create embedded wallet (PXE + built-in signing)
  console.log("\n2. Creating embedded wallet...");
  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxeConfig: { proverEnabled: isRemote },
  });
  console.log("   ✓ Embedded wallet created");

  // 3. Create Schnorr account (address is deterministic before deployment)
  console.log("\n3. Setting up deployer Schnorr account...");
  const secretKey = Fr.random();
  const salt = Fr.random();
  const account = await wallet.createSchnorrAccount(secretKey, salt);
  const deployer = account.address;
  console.log(`   Account address: ${deployer.toString()}`);

  // 4. Handle fee payment for account deployment
  let accountFeeOpts: { fee?: { paymentMethod: FeeJuicePaymentMethodWithClaim } } = {};

  if (isRemote) {
    // Check if the account already has fee juice on L2 (e.g. from a prior run)
    const balanceSlot = await deriveStorageSlotInMap(new Fr(1), deployer);
    const existingBalance = (
      await node.getPublicStorageAt("latest", ProtocolContractAddress.FeeJuice, balanceSlot)
    ).toBigInt();

    if (existingBalance > 0n) {
      console.log(`   ✓ Account already has ${existingBalance} fee juice on L2`);
    } else {
      console.log("\n4. Bridging fee juice from L1 Sepolia...");
      const claim = await bridgeL1FeeJuice(node, deployer, FEE_JUICE_AMOUNT, logger);
      accountFeeOpts = {
        fee: { paymentMethod: new FeeJuicePaymentMethodWithClaim(deployer, claim) },
      };
    }
  } else {
    console.log("   (sandbox — skipping fee juice bridge)");
  }

  // 5. Deploy the Schnorr account on-chain
  console.log("\n5. Deploying Schnorr account...");
  const deployAccountMethod = await account.getDeployMethod();
  await deployAccountMethod.send({ from: NO_FROM, ...accountFeeOpts });
  console.log(`   ✓ Deployer deployed: ${deployer.toString()}`);

  // 6. Generate attester key pair
  console.log("\n6. Generating attester key pair...");
  const attesterSk = ATTESTER_SECRET ? Fr.fromString(ATTESTER_SECRET) : Fr.random();
  const attester = await Attester.create(attesterSk);
  console.log(`   ✓ Attester public key:`);
  console.log(`     x: ${attester.publicKey.x.toString()}`);
  console.log(`     y: ${attester.publicKey.y.toString()}`);

  // 7. Load compiled artifact
  const artifactPath = join(
    __dirname,
    "../../attestor-contracts/example/target/attestor_example-AttestorExample.json",
  );
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));
  const artifact = loadContractArtifact(artifactJson as NoirCompiledContract);

  // 8. Deploy AttestorExample contract
  // After the account deployment, fee juice is in the account's L2 balance.
  // Subsequent txns are paid from that balance automatically.
  console.log("\n7. Deploying AttestorExample contract...");
  const { contract } = await Contract.deploy(
    wallet,
    artifact,
    [attester.publicKey.x, attester.publicKey.y],
    "constructor",
  ).send({ from: deployer });

  console.log(`   ✓ Contract deployed at: ${contract.address.toString()}`);

  // Summary
  console.log("\n=== Deployment Complete ===");
  console.log("\nSave these for future interactions:");
  console.log(`  CONTRACT_ADDRESS=${contract.address.toString()}`);
  console.log(`  ATTESTER_SECRET=${attesterSk.toString()}`);
  console.log(`  ATTESTER_PUBKEY_X=${attester.publicKey.x.toString()}`);
  console.log(`  ATTESTER_PUBKEY_Y=${attester.publicKey.y.toString()}`);
}

main().catch((err) => {
  console.error("\nDeploy failed:", err);
  process.exit(1);
});
