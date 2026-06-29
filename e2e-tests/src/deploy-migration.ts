/**
 * Deploy script for the MigrationClaims contract.
 *
 * Bridges fee juice from L1 Sepolia (on testnet), deploys a Schnorr account,
 * then deploys the MigrationClaims contract with the attester's public key.
 *
 * Usage:
 *   bun run deploy-migration
 *
 * Required env vars (testnet):
 *   L1_PRIVATE_KEY     - Sepolia-funded private key (0x-prefixed)
 *
 * Optional env vars:
 *   AZTEC_NODE_URL     - Aztec node URL (default: https://v5.testnet.rpc.aztec-labs.com)
 *   ATTESTER_SECRET    - Hex secret key for the attester (default: random)
 *   DEPLOYER_SECRET    - Reuse an existing deployer wallet secret (skips fee bridge if funded)
 *   DEPLOYER_SALT      - Salt matching the deployer wallet (required with DEPLOYER_SECRET)
 *
 * Sandbox example:
 *   AZTEC_NODE_URL=http://localhost:8080 bun run deploy-migration
 *
 * Outputs env vars to copy for use with claim-migration:
 *   MIGRATION_CONTRACT_ADDRESS, CONTRACT_SALT, ATTESTER_SECRET, ATTESTER_PUBKEY_X,
 *   ATTESTER_PUBKEY_Y, DEPLOYER_SECRET, DEPLOYER_SALT
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
const DEPLOYER_SECRET = process.env.DEPLOYER_SECRET;
const DEPLOYER_SALT = process.env.DEPLOYER_SALT;

async function main() {
  const logger = createLogger("aztec:deploy-migration");
  console.log("=== Deploy MigrationClaims Contract ===\n");

  const isSandbox = NODE_URL.includes("localhost");
  const isRemote = !isSandbox;

  console.log(`1. Connecting to Aztec node at ${NODE_URL}...`);
  const node = createAztecNodeClient(NODE_URL);
  const nodeInfo = await node.getNodeInfo();
  console.log(`   ✓ Connected (l1ChainId: ${nodeInfo.l1ChainId})`);

  console.log("\n2. Creating embedded wallet...");
  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxeConfig: { proverEnabled: isRemote },
  });
  console.log("   ✓ Embedded wallet created");

  console.log("\n3. Setting up deployer Schnorr account...");
  const secretKey = DEPLOYER_SECRET ? Fr.fromString(DEPLOYER_SECRET) : Fr.random();
  const salt = DEPLOYER_SALT ? Fr.fromString(DEPLOYER_SALT) : Fr.random();
  const account = await wallet.createSchnorrAccount(secretKey, salt);
  const deployer = account.address;
  console.log(`   Account address: ${deployer.toString()}`);

  let accountFeeOpts: { fee?: { paymentMethod: FeeJuicePaymentMethodWithClaim } } = {};
  let accountAlreadyDeployed = false;

  if (isRemote) {
    const balanceSlot = await deriveStorageSlotInMap(new Fr(1), deployer);
    const existingBalance = (
      await node.getPublicStorageAt("latest", ProtocolContractAddress.FeeJuice, balanceSlot)
    ).toBigInt();

    if (existingBalance > 0n) {
      console.log(`   ✓ Account already deployed (${existingBalance} fee juice on L2)`);
      accountAlreadyDeployed = true;
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

  if (!accountAlreadyDeployed) {
    console.log("\n5. Deploying Schnorr account...");
    const deployAccountMethod = await account.getDeployMethod();
    await deployAccountMethod.send({ from: NO_FROM, ...accountFeeOpts });
    console.log(`   ✓ Deployer deployed: ${deployer.toString()}`);
  }

  console.log("\n6. Generating attester key pair...");
  const attesterSk = ATTESTER_SECRET ? Fr.fromString(ATTESTER_SECRET) : Fr.random();
  const attester = await Attester.create(attesterSk);
  console.log(`   ✓ Attester public key:`);
  console.log(`     x: ${attester.publicKey.x.toString()}`);
  console.log(`     y: ${attester.publicKey.y.toString()}`);

  const artifactPath = join(
    __dirname,
    "../../contracts/migration_contract/target/migration_contract-MigrationClaims.json",
  );
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));
  const artifact = loadContractArtifact(artifactJson as NoirCompiledContract);

  // A fixed salt lets the claim script reconstruct the contract instance for PXE registration
  const contractSalt = Fr.random();

  console.log("\n7. Deploying MigrationClaims contract...");
  const { contract } = await Contract.deploy(
    wallet,
    artifact,
    [attester.publicKey.x, attester.publicKey.y],
    "constructor",
    { salt: contractSalt },
  ).send({ from: deployer, wait: { timeout: 1800000 } });

  console.log(`   ✓ Contract deployed at: ${contract.address.toString()}`);

  console.log("\n=== Deployment Complete ===");
  console.log("\nCopy these into your .env for use with claim-migration:");
  console.log(`  MIGRATION_CONTRACT_ADDRESS=${contract.address.toString()}`);
  console.log(`  CONTRACT_SALT=${contractSalt.toString()}`);
  console.log(`  ATTESTER_SECRET=${attesterSk.toString()}`);
  console.log(`  ATTESTER_PUBKEY_X=${attester.publicKey.x.toString()}`);
  console.log(`  ATTESTER_PUBKEY_Y=${attester.publicKey.y.toString()}`);
  console.log(`  DEPLOYER_SECRET=${secretKey.toString()}`);
  console.log(`  DEPLOYER_SALT=${salt.toString()}`);
}

main().catch((err) => {
  console.error("\nDeploy failed:", err);
  process.exit(1);
});
