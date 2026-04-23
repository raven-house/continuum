/**
 * Claim script for MigrationClaims — full attestation flow via Continuum API.
 *
 * Flow:
 *   1. Connect to Aztec node + reconstruct deployer wallet
 *   2. GET ${API_URL}/migration/attestation?address=...&contract=...
 *      → API queries MongoDB for NFT balance, signs with ATTESTER_SECRET
 *      → Returns { amount, sigBytes, signature }
 *   3. Submit claim(amount, sigBytes) to the MigrationClaims contract
 *   4. Read back state to confirm
 *
 * Run deploy-migration first to get the required env vars.
 *
 * Usage:
 *   bun run claim-migration
 *
 * Required env vars:
 *   API_URL                     - Continuum API URL (e.g. http://localhost:3004)
 *   MIGRATION_CONTRACT_ADDRESS  - Address of the deployed MigrationClaims contract
 *   CONTRACT_SALT               - Salt used when deploying the contract (from deploy-migration output)
 *   ATTESTER_PUBKEY_X           - Attester public key X (from deploy-migration output)
 *   ATTESTER_PUBKEY_Y           - Attester public key Y (from deploy-migration output)
 *   DEPLOYER_SECRET             - Deployer wallet secret (from deploy-migration output)
 *   DEPLOYER_SALT               - Deployer wallet salt (from deploy-migration output)
 *
 * Optional env vars:
 *   AZTEC_NODE_URL  - Aztec node URL (default: https://rpc.testnet.aztec-labs.com)
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

const __dirname = dirname(fileURLToPath(import.meta.url));

const TESTNET_URL = "https://rpc.testnet.aztec-labs.com";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

type AttestationPayload = {
  address: string;
  contractAddress: string;
  amount: number;
  signature: string;
  sigBytes: number[];
  hash: string;
  attestedAt: string;
};

function parseAttestationPayload(payload: unknown): AttestationPayload {
  const candidate =
    payload && typeof payload === "object" && "attestation" in payload
      ? (payload as { attestation: unknown }).attestation
      : payload;

  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Unexpected attestation response: ${JSON.stringify(payload)}`);
  }

  const attestation = candidate as Partial<AttestationPayload>;
  if (
    typeof attestation.amount !== "number" ||
    typeof attestation.signature !== "string" ||
    !Array.isArray(attestation.sigBytes) ||
    typeof attestation.attestedAt !== "string"
  ) {
    throw new Error(`Malformed attestation response: ${JSON.stringify(payload)}`);
  }

  return attestation as AttestationPayload;
}

async function main() {
  console.log("=== MigrationClaims — Claim via Continuum API ===\n");

  const NODE_URL = process.env.AZTEC_NODE_URL ?? TESTNET_URL;
  const API_URL = requireEnv("API_URL").replace(/\/+$/, "");
  const CONTRACT_ADDRESS = requireEnv("MIGRATION_CONTRACT_ADDRESS");
  const CONTRACT_SALT = requireEnv("CONTRACT_SALT");
  const ATTESTER_PUBKEY_X = requireEnv("ATTESTER_PUBKEY_X");
  const ATTESTER_PUBKEY_Y = requireEnv("ATTESTER_PUBKEY_Y");
  const DEPLOYER_SECRET = requireEnv("DEPLOYER_SECRET");
  const DEPLOYER_SALT = requireEnv("DEPLOYER_SALT");

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
  console.log("\n3. Loading MigrationClaims artifact and registering with PXE...");
  const artifactPath = join(
    __dirname,
    "../../attestor-contracts/migration_contract/target/migration_contract-MigrationClaims.json",
  );
  const artifactJson = JSON.parse(readFileSync(artifactPath, "utf8"));
  const artifact = loadContractArtifact(artifactJson as NoirCompiledContract);
  const contractAddress = AztecAddress.fromString(CONTRACT_ADDRESS);

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

  // 5. Fetch attestation from Continuum API
  console.log(`\n4. Fetching attestation from Continuum API...`);
  const attestationUrl =
    `${API_URL}/migration/attestation` +
    `?address=${userAddress.toString()}&contract=${contractAddress.toString()}`;
  console.log(`   GET ${attestationUrl}`);

  const response = await fetch(attestationUrl);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`API returned ${response.status}: ${body}`);
  }

  const attestation = parseAttestationPayload(await response.json());

  console.log(`   ✓ Attestation received:`);
  console.log(`     amount:    ${attestation.amount}`);
  console.log(`     signature: ${attestation.signature.slice(0, 22)}...`);
  console.log(`     attestedAt: ${attestation.attestedAt}`);

  const amount = new Fr(BigInt(attestation.amount));
  const sigBytes = attestation.sigBytes;

  // 6. Submit claim to the contract
  console.log(`\n5. Submitting claim(amount=${attestation.amount}) to MigrationClaims contract...`);
  console.log("   (private proof generation — this may take a moment)");
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
