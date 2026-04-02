/**
 * Deploy script for the AttestorExample contract.
 *
 * This script:
 *   1. Connects to an Aztec node
 *   2. Creates an EmbeddedWallet (PXE + built-in signing)
 *   3. Deploys a Schnorr account to use as the deployer
 *   4. Generates an attester key pair using the Attester library
 *   5. Deploys AttestorExample with the attester's public key
 *
 * Usage:
 *   bun run deploy-example
 *
 * Environment variables:
 *   AZTEC_NODE_URL   - Aztec node URL (default: http://localhost:8080 for local sandbox)
 *   ATTESTER_SECRET  - Hex secret key for the attester (default: random, printed at end)
 *   SPONSORED_FPC    - SponsoredFPC contract address for fee payment on devnet/testnet
 *
 * Example (sandbox):
 *   AZTEC_NODE_URL=http://localhost:8080 bun run deploy-example
 *
 * Example (devnet with sponsored fees):
 *   AZTEC_NODE_URL=https://v4-devnet-2.aztec-labs.com \
 *   SPONSORED_FPC=0x<fpc-address> \
 *   bun run deploy-example
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Fr } from "@aztec/aztec.js/fields";
import { Contract } from "@aztec/aztec.js/contracts";
import { loadContractArtifact, type NoirCompiledContract } from "@aztec/aztec.js/abi";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { EmbeddedWallet } from "@aztec/wallets/embedded";

import { Attester } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const NODE_URL = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const ATTESTER_SECRET = process.env.ATTESTER_SECRET;
const SPONSORED_FPC_ADDR = process.env.SPONSORED_FPC;

async function main() {
  console.log("=== Deploy AttestorExample Contract ===\n");

  // Step 1: Connect to Aztec node
  console.log(`1. Connecting to Aztec node at ${NODE_URL}...`);
  const node = createAztecNodeClient(NODE_URL);
  const nodeInfo = await node.getNodeInfo();
  console.log(`   ✓ Connected (chain ID: ${nodeInfo.l1ChainId})`);

  // Step 2: Create embedded wallet (acts as a PXE + signer)
  console.log("\n2. Creating embedded wallet...");
  const isRemote = !NODE_URL.includes("localhost");
  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxeConfig: { proverEnabled: isRemote },
  });
  console.log("   ✓ Embedded wallet created");

  // Step 3: Deploy a Schnorr account to act as the deployer
  console.log("\n3. Deploying Schnorr account (deployer)...");
  const deployerSecret = Fr.random();
  const deployerSalt = Fr.random();
  const account = await wallet.createSchnorrAccount(deployerSecret, deployerSalt);

  const feePaymentMethod = SPONSORED_FPC_ADDR
    ? new SponsoredFeePaymentMethod(AztecAddress.fromString(SPONSORED_FPC_ADDR))
    : undefined;

  const deployer = account.address;
  const deployAccountMethod = await account.getDeployMethod();
  await deployAccountMethod.send(
    feePaymentMethod
      ? { from: deployer, fee: { paymentMethod: feePaymentMethod } }
      : { from: deployer },
  );
  console.log(`   ✓ Deployer: ${deployer.toString()}`);

  // Step 4: Generate attester key pair
  console.log("\n4. Generating attester key pair...");
  const attesterSk = ATTESTER_SECRET
    ? Fr.fromString(ATTESTER_SECRET)
    : Fr.random();
  const attester = await Attester.create(attesterSk);
  console.log(`   ✓ Attester public key:`);
  console.log(`     x: ${attester.publicKey.x.toString()}`);
  console.log(`     y: ${attester.publicKey.y.toString()}`);

  // Step 5: Load compiled artifact
  const artifactPath = join(
    __dirname,
    "../../attestor-contracts/example/target/attestor_example-AttestorExample.json",
  );
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));
  const artifact = loadContractArtifact(artifactJson as NoirCompiledContract);

  // Step 6: Deploy AttestorExample
  console.log("\n5. Deploying AttestorExample contract...");
  const { contract } = await Contract.deploy(
    wallet,
    artifact,
    [attester.publicKey.x, attester.publicKey.y],
    "constructor",
  ).send(
    feePaymentMethod
      ? { from: deployer, fee: { paymentMethod: feePaymentMethod } }
      : { from: deployer },
  );

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
