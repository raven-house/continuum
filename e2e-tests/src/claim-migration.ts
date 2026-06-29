/**
 * Claim script for MigrationClaims — demonstrates the full attestation flow.
 *
 * Simulates a user claiming their migrated state on the new rollup:
 *   1. Attester (Continuum) signs the claim off-chain
 *   2. User submits the claim + signature to the contract
 *   3. Contract verifies the Schnorr signature in private context
 *   4. State is updated: user's claimed amount is recorded
 *
 * Run deploy-migration first to get the required env vars.
 *
 * Usage:
 *   bun run claim-migration
 *
 * Required env vars:
 *   MIGRATION_CONTRACT_ADDRESS  - Address of the deployed MigrationClaims contract
 *   CONTRACT_SALT               - Salt used when deploying the contract (from deploy-migration output)
 *   ATTESTER_SECRET             - Attester's secret key (from deploy-migration output)
 *   ATTESTER_PUBKEY_X           - Attester public key X (from deploy-migration output)
 *   ATTESTER_PUBKEY_Y           - Attester public key Y (from deploy-migration output)
 *   DEPLOYER_SECRET             - Deployer wallet secret (from deploy-migration output)
 *   DEPLOYER_SALT               - Deployer wallet salt (from deploy-migration output)
 *
 * Optional env vars:
 *   AZTEC_NODE_URL  - Aztec node URL (default: https://v5.testnet.rpc.aztec-labs.com)
 *   CLAIM_AMOUNT    - Amount to claim (default: 10)
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Contract, getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts";
import { loadContractArtifact, type NoirCompiledContract } from "@aztec/aztec.js/abi";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";

import { Attester, signatureToBytes } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TESTNET_URL = "https://v5.testnet.rpc.aztec-labs.com";

// Domain separator matching the Noir contract's CLAIM_DOMAIN = 0x434c4d ("CLM")
const CLAIM_DOMAIN = new Fr(0x434c4d);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  console.log("=== MigrationClaims — Claim Demo ===\n");

  const NODE_URL = process.env.AZTEC_NODE_URL ?? TESTNET_URL;
  const CONTRACT_ADDRESS = requireEnv("MIGRATION_CONTRACT_ADDRESS");
  const CONTRACT_SALT = requireEnv("CONTRACT_SALT");
  const ATTESTER_SECRET = requireEnv("ATTESTER_SECRET");
  const ATTESTER_PUBKEY_X = requireEnv("ATTESTER_PUBKEY_X");
  const ATTESTER_PUBKEY_Y = requireEnv("ATTESTER_PUBKEY_Y");
  const DEPLOYER_SECRET = requireEnv("DEPLOYER_SECRET");
  const DEPLOYER_SALT = requireEnv("DEPLOYER_SALT");
  const claimAmount = parseInt(process.env.CLAIM_AMOUNT ?? "10");

  const isSandbox = NODE_URL.includes("localhost");
  const isRemote = !isSandbox;

  // 1. Connect
  console.log(`1. Connecting to Aztec node at ${NODE_URL}...`);
  const node = createAztecNodeClient(NODE_URL);
  await node.getNodeInfo();
  console.log("   ✓ Connected");

  // 2. Reconstruct the deployer wallet (already deployed on-chain from deploy-migration)
  console.log("\n2. Reconstructing deployer wallet...");
  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxeConfig: { proverEnabled: isRemote },
  });
  const secretKey = Fr.fromString(DEPLOYER_SECRET);
  const salt = Fr.fromString(DEPLOYER_SALT);
  const account = await wallet.createSchnorrAccount(secretKey, salt);
  const userAddress = account.address;
  console.log(`   ✓ User address: ${userAddress.toString()}`);

  // 3. Load the MigrationClaims contract artifact and register it with the PXE
  //    The PXE needs the contract instance (address + class ID + deployment params) to simulate
  //    private functions. We reconstruct it from the saved deployment parameters.
  console.log("\n3. Loading MigrationClaims artifact and registering with PXE...");
  const artifactPath = join(
    __dirname,
    "../../contracts/migration_contract/target/migration_contract-MigrationClaims.json",
  );
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));
  const artifact = loadContractArtifact(artifactJson as NoirCompiledContract);
  const contractAddress = AztecAddress.fromString(CONTRACT_ADDRESS);

  // Reconstruct the contract instance from deployment parameters so the PXE can look up the ABI
  const contractInstance = await getContractInstanceFromInstantiationParams(artifact, {
    salt: Fr.fromString(CONTRACT_SALT),
    deployer: userAddress,
    constructorArtifact: "constructor",
    constructorArgs: [Fr.fromString(ATTESTER_PUBKEY_X), Fr.fromString(ATTESTER_PUBKEY_Y)],
  });
  await wallet.registerContract(contractInstance, artifact);

  const contract = await Contract.at(contractAddress, artifact, wallet);
  console.log(`   ✓ Contract registered and loaded at ${contractAddress.toString()}`);

  // 4. Check if already claimed
  const { result: alreadyClaimed } = await contract.methods
    .get_claimed_amount(userAddress)
    .simulate({ from: userAddress });
  if (alreadyClaimed !== 0n) {
    console.log(`\n   User has already claimed: ${alreadyClaimed}`);
    console.log("   Run with a different DEPLOYER_SECRET/SALT to simulate a new user.");
    return;
  }

  // 5. Attester signs the claim
  //    Fields: [CLAIM_DOMAIN, contract_address, user_address, amount]
  //    This matches the order checked inside MigrationClaims.claim()
  console.log(`\n4. Attester signing claim for ${claimAmount} units...`);
  const attester = await Attester.create(Fr.fromString(ATTESTER_SECRET));
  const amount = new Fr(claimAmount);
  const fields = [CLAIM_DOMAIN, contractAddress.toField(), userAddress.toField(), amount];
  const { hash, signature } = await attester.attest(fields);
  const sigBytes = signatureToBytes(signature);
  console.log(`   ✓ Signed (hash: ${hash.toString().slice(0, 20)}...)`);
  console.log(`   Public key x: ${attester.publicKey.x.toString().slice(0, 20)}...`);

  // 6. Submit claim to the contract
  console.log(`\n5. Submitting claim(amount=${claimAmount}, signature) to contract...`);
  console.log("   (private proof generation — this may take a moment on testnet)");
  const { receipt } = await contract.methods
    .claim(amount, sigBytes)
    .send({ from: userAddress, wait: { timeout: 1800000 } });
  console.log(`   ✓ Claim accepted! Tx hash: ${receipt.txHash.toString()}`);

  // 7. Read the resulting state
  console.log("\n6. Reading post-claim state...");
  const { result: claimedAmount } = await contract.methods
    .get_claimed_amount(userAddress)
    .simulate({ from: userAddress });
  const { result: totalClaimed } = await contract.methods
    .get_total_claimed()
    .simulate({ from: userAddress });
  const { result: hasClaimed } = await contract.methods
    .has_claimed(userAddress)
    .simulate({ from: userAddress });

  console.log(`   claimed_amount for ${userAddress.toString().slice(0, 16)}...: ${claimedAmount}`);
  console.log(`   total_claimed (all users): ${totalClaimed}`);
  console.log(`   has_claimed: ${hasClaimed}`);

  // 8. Demonstrate double-claim prevention
  console.log("\n7. Testing double-claim prevention...");
  try {
    await contract.methods
      .claim(amount, sigBytes)
      .send({ from: userAddress, wait: { timeout: 1800000 } });
    console.log("   ERROR: Second claim should have been rejected!");
  } catch {
    console.log("   ✓ Second claim correctly rejected: already claimed");
  }

  console.log("\n=== Demo Complete ===");
  console.log(`\nSummary:`);
  console.log(`  User address:   ${userAddress.toString()}`);
  console.log(`  Contract:       ${contractAddress.toString()}`);
  console.log(`  Claimed amount: ${claimedAmount}`);
  console.log(`  Total claimed:  ${totalClaimed}`);
}

main().catch((err) => {
  console.error("\nClaim failed:", err);
  process.exit(1);
});
