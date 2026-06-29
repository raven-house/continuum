/**
 * End-to-end NFT public-state migration — Continuum.
 *
 * Drives the FULL flow against the real Continuum HTTP stack (Mongo + indexer +
 * API) plus an Aztec node, for PUBLICLY-owned NFTs:
 *
 *   OLD ROLLUP
 *     1. Deploy NFT "old collection" (migration disabled).
 *     2. Register the NFT artifact with the indexer  (POST /contracts/upload).
 *     3. mint_to_public() a few tokens to Alice-OLD (+ one to someone else).
 *     4. GET /migration/new-secret  → { secret, commitment }.
 *     5. Alice-OLD calls register_migration(commitment)  — owner = msg_sender,
 *        unforgeable. This is the "real caller" check, enforced on-chain.
 *
 *   NEW ROLLUP
 *     6. GET /attester  → attester pubkey (x, y).
 *     7. Deploy NFT "new collection" (migration enabled with that pubkey).
 *     8. POST /collections/register  (old → new address mapping).
 *
 *   CLAIM
 *     9. Poll POST /request_data { migration_secret }  until the indexer has
 *        ingested the registration + transfers; receive per-token signatures.
 *    10. Alice-NEW calls migrate_and_claim(token_id, signature) for each token.
 *    11. Verify: tokens land as private notes for Alice-NEW, public owner is zero,
 *        and a second claim is rejected (double-claim guard).
 *
 * Prerequisites (start these first):
 *   - MongoDB + indexer + API running (see continuum/Makefile / docker-compose).
 *     The indexer must be configured for the same network as AZTEC_NODE_URL.
 *   - API reachable at CONTINUUM_API_URL (default http://localhost:3004).
 *   - On testnet: a Sepolia-funded L1_PRIVATE_KEY for fee-juice bridging.
 *
 * Usage:
 *   bun run migrate-nft
 *
 * Env vars:
 *   AZTEC_NODE_URL     - Aztec node (default https://v5.testnet.rpc.aztec-labs.com)
 *   CONTINUUM_API_URL  - Continuum API base URL (default http://localhost:3004)
 *   CONTINUUM_NETWORK  - Network name used by the indexer/registry (default testnet)
 *   L1_PRIVATE_KEY     - Sepolia-funded key (testnet only, for fee-juice bridging)
 *   OLD_SECRET/OLD_SALT, NEW_SECRET/NEW_SALT - reuse funded accounts across runs
 *
 * Sandbox example (fast, no L1 key):
 *   AZTEC_NODE_URL=http://localhost:8080 CONTINUUM_NETWORK=sandbox bun run migrate-nft
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Contract } from "@aztec/aztec.js/contracts";
import { loadContractArtifact, type NoirCompiledContract } from "@aztec/aztec.js/abi";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { NO_FROM } from "@aztec/aztec.js/account";
import { ProtocolContractAddress } from "@aztec/aztec.js/protocol";
import { createLogger } from "@aztec/aztec.js/log";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";
import {
  getInitialTestAccountsData,
  INITIAL_TEST_SIGNING_KEYS,
} from "@aztec/accounts/testing";

import { bridgeL1FeeJuice } from "./bridge-fee-juice.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TESTNET_URL = "https://v5.testnet.rpc.aztec-labs.com";
const FEE_JUICE_AMOUNT = 10n ** 21n;
const SEND_TIMEOUT = 1_800_000; // 30 min — testnet proving can be slow

const NODE_URL = process.env.AZTEC_NODE_URL ?? TESTNET_URL;
const API_URL = (process.env.CONTINUUM_API_URL ?? "http://localhost:3004").replace(/\/$/, "");
const NETWORK = process.env.CONTINUUM_NETWORK ?? "testnet";

const isSandbox = NODE_URL.includes("localhost");
const isRemote = !isSandbox;

// Tokens minted on the old collection. ALICE_TOKENS go to Alice-OLD (expected to
// migrate); OTHER_TOKEN goes to a third party (must be excluded by /request_data).
const ALICE_TOKENS = [101n, 102n];
const OTHER_TOKEN = 999n;

const logger = createLogger("aztec:migrate-nft");

// ───────────────────────────── HTTP helpers ─────────────────────────────────

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ───────────────────────── account / fee-juice setup ────────────────────────

/**
 * TESTNET: reconstruct a fresh Schnorr account and, if it isn't funded yet,
 * bridge fee juice from L1 and deploy it. Once funded, later txs default to
 * paying fees from the account's own fee-juice balance.
 */
async function setupTestnetAccount(
  wallet: EmbeddedWallet,
  node: ReturnType<typeof createAztecNodeClient>,
  label: string,
  secret: Fr,
  salt: Fr,
): Promise<AztecAddress> {
  console.log(`\n[${label}] setting up account (testnet)...`);
  const account = await wallet.createSchnorrAccount(secret, salt);
  const address = account.address;
  console.log(`  address: ${address.toString()}`);

  const balanceSlot = await deriveStorageSlotInMap(new Fr(1), address);
  const balance = (
    await node.getPublicStorageAt("latest", ProtocolContractAddress.FeeJuice, balanceSlot)
  ).toBigInt();

  if (balance > 0n) {
    console.log(`  ✓ already deployed (${balance} fee juice)`);
    return address;
  }

  console.log("  bridging fee juice from L1 Sepolia (can take a few minutes)...");
  const claim = await bridgeL1FeeJuice(node, address, FEE_JUICE_AMOUNT, logger);
  const feeOpts = { fee: { paymentMethod: new FeeJuicePaymentMethodWithClaim(address, claim) } };

  const deployMethod = await account.getDeployMethod();
  await deployMethod.send({ from: NO_FROM, ...feeOpts });
  console.log(`  ✓ account deployed`);
  return address;
}

async function setupSandboxAccount(
  wallet: EmbeddedWallet,
  node: ReturnType<typeof createAztecNodeClient>,
  label: string,
  data: { secret: Fr; salt: Fr },
  signingKey: (typeof INITIAL_TEST_SIGNING_KEYS)[number],
): Promise<AztecAddress> {
  console.log(`\n[${label}] using pre-funded sandbox test account...`);
  const account = await wallet.createSchnorrInitializerlessAccount(
    data.secret,
    data.salt,
    signingKey,
  );
  const address = account.address;

  const balanceSlot = await deriveStorageSlotInMap(new Fr(1), address);
  const balance = (
    await node.getPublicStorageAt("latest", ProtocolContractAddress.FeeJuice, balanceSlot)
  ).toBigInt();
  if (balance === 0n) {
    throw new Error(
      `Sandbox test account ${address.toString()} has no fee juice. ` +
        "Start the sandbox with `aztec start --local-network` so the initial accounts are funded.",
    );
  }
  console.log(`  ✓ ${address.toString()} (${balance} fee juice)`);
  return address;
}

// ─────────────────────────────── main flow ──────────────────────────────────

async function main() {
  console.log("=== Continuum — NFT public-state migration (E2E) ===");
  console.log(`Node:    ${NODE_URL}`);
  console.log(`API:     ${API_URL}`);
  console.log(`Network: ${NETWORK}`);

  // Load the compiled NFT artifact (the codegen NFT.ts wrapper is stale; the
  // target JSON carries the migration constructor + events).
  const artifactPath = join(
    __dirname,
    "../../contracts/nft_contract/target/nft_contract-NFT.json",
  );
  const artifact = loadContractArtifact(
    JSON.parse(readFileSync(artifactPath, "utf8")) as NoirCompiledContract,
  );

  // 0. Connect + wallet
  const node = createAztecNodeClient(NODE_URL);
  await node.getNodeInfo();
  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxeConfig: { proverEnabled: isRemote },
  });

  // Two accounts: Alice's OLD wallet (owner + minter on old collection) and her
  // NEW wallet (the claimer on the new collection).
  let oldAddr: AztecAddress;
  let newAddr: AztecAddress;

  if (isSandbox) {
    // Reuse the pre-funded genesis test accounts — no bridging, no proving wait.
    const testAccounts = await getInitialTestAccountsData();
    if (testAccounts.length < 2) {
      throw new Error(
        "Sandbox has fewer than 2 initial test accounts. Start it with `aztec start --local-network`.",
      );
    }
    oldAddr = await setupSandboxAccount(
      wallet,
      node,
      "ALICE-OLD",
      testAccounts[0],
      INITIAL_TEST_SIGNING_KEYS[0],
    );
    newAddr = await setupSandboxAccount(
      wallet,
      node,
      "ALICE-NEW",
      testAccounts[1],
      INITIAL_TEST_SIGNING_KEYS[1],
    );
  } else {
    oldAddr = await setupTestnetAccount(
      wallet,
      node,
      "ALICE-OLD",
      process.env.OLD_SECRET ? Fr.fromString(process.env.OLD_SECRET) : Fr.random(),
      process.env.OLD_SALT ? Fr.fromString(process.env.OLD_SALT) : Fr.random(),
    );
    newAddr = await setupTestnetAccount(
      wallet,
      node,
      "ALICE-NEW",
      process.env.NEW_SECRET ? Fr.fromString(process.env.NEW_SECRET) : Fr.random(),
      process.env.NEW_SALT ? Fr.fromString(process.env.NEW_SALT) : Fr.random(),
    );
  }

  // ════════════════════════════ OLD ROLLUP ═════════════════════════════════

  // Record the block before deploying so the indexer starts from here.
  const startBlock = await node.getBlockNumber();

  console.log("\n[OLD] deploying old NFT collection (migration disabled)...");
  const { contract: oldDeploy } = await Contract.deploy(
    wallet,
    artifact,
    ["Continuum Old", "COLD", oldAddr, Fr.ZERO, Fr.ZERO],
    "constructor_with_minter",
    { salt: Fr.random() },
  ).send({ from: oldAddr, wait: { timeout: SEND_TIMEOUT } });
  const oldCollection = oldDeploy.address;
  const oldNft = await Contract.at(oldCollection, artifact, wallet);
  console.log(`  ✓ old collection: ${oldCollection.toString()}`);

  console.log("\n[OLD] registering NFT artifact with the indexer...");
  const uploadRes = await apiPost("/contracts/upload", {
    artifact_id: "nft",
    name: "NFT",
    abi: JSON.parse(readFileSync(artifactPath, "utf8")),
    enabled: true,
    event_types: ["Transfer", "MigrationRegistered"],
    start_block: { [NETWORK]: startBlock },
  });
  if (uploadRes.ok) {
    console.log(`  ✓ artifact 'nft' registered (start_block.${NETWORK}=${startBlock})`);
  } else if (uploadRes.status === 409) {
    console.log("  ✓ artifact 'nft' already registered (reusing existing sync state)");
  } else {
    throw new Error(`/contracts/upload → ${uploadRes.status} ${await uploadRes.text()}`);
  }

  console.log("\n[OLD] minting public NFTs...");
  for (const tokenId of ALICE_TOKENS) {
    await oldNft.methods
      .mint_to_public(oldAddr, new Fr(tokenId))
      .send({ from: oldAddr, wait: { timeout: SEND_TIMEOUT } });
    console.log(`  ✓ minted #${tokenId} → Alice-OLD`);
  }
  const otherOwner = await AztecAddress.random();
  await oldNft.methods
    .mint_to_public(otherOwner, new Fr(OTHER_TOKEN))
    .send({ from: oldAddr, wait: { timeout: SEND_TIMEOUT } });
  console.log(`  ✓ minted #${OTHER_TOKEN} → someone else (must be excluded)`);

  console.log("\n[OLD] fetching a fresh migration secret...");
  const { secret, commitment } = await apiGet("/migration/new-secret");
  console.log(`  secret:     ${secret.slice(0, 18)}… (saved by the user)`);
  console.log(`  commitment: ${commitment.slice(0, 18)}…`);

  console.log("\n[OLD] Alice-OLD calls register_migration(commitment)...");
  await oldNft.methods
    .register_migration(Fr.fromString(commitment))
    .send({ from: oldAddr, wait: { timeout: SEND_TIMEOUT } });
  console.log("  ✓ MigrationRegistered emitted (owner = Alice-OLD, authenticated)");

  // ════════════════════════════ NEW ROLLUP ═════════════════════════════════

  console.log("\n[NEW] fetching attester public key...");
  const attester = await apiGet("/attester");
  console.log(`  pubkey.x: ${attester.x.slice(0, 18)}…`);

  console.log("\n[NEW] deploying new NFT collection (migration enabled)...");
  const { contract: newDeploy } = await Contract.deploy(
    wallet,
    artifact,
    [
      "Continuum New",
      "CNEW",
      oldAddr, // minter (irrelevant for migration)
      Fr.fromString(attester.x),
      Fr.fromString(attester.y),
    ],
    "constructor_with_minter",
    { salt: Fr.random() },
  ).send({ from: oldAddr, wait: { timeout: SEND_TIMEOUT } });
  const newCollection = newDeploy.address;
  const newNft = await Contract.at(newCollection, artifact, wallet);
  console.log(`  ✓ new collection: ${newCollection.toString()}`);

  console.log("\n[NEW] registering old → new collection mapping...");
  const mapRes = await apiPost("/collections/register", {
    old_collection_address: oldCollection.toString(),
    old_network: NETWORK,
    new_collection_address: newCollection.toString(),
    new_network: NETWORK,
    collection_name: "Continuum E2E",
  });
  if (!mapRes.ok) {
    throw new Error(`/collections/register → ${mapRes.status} ${await mapRes.text()}`);
  }
  console.log("  ✓ mapping registered");

  // ══════════════════════════════ CLAIM ════════════════════════════════════

  console.log("\n[CLAIM] polling /request_data until the indexer catches up...");
  const expected = ALICE_TOKENS.length;
  let tokens: Array<{ token_id: string; signature_bytes: number[] }> = [];
  const maxAttempts = 60;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await apiPost("/request_data", {
      collection_address: newCollection.toString(),
      migration_secret: secret,
      new_wallet_address: newAddr.toString(),
    });

    if (res.ok) {
      const body = await res.json();
      tokens = body.tokens ?? [];
      if (tokens.length >= expected) {
        console.log(`  ✓ got ${tokens.length} signed token(s) for ${body.old_wallet_address}`);
        break;
      }
      console.log(`  attempt ${attempt}: ${tokens.length}/${expected} tokens indexed…`);
    } else {
      console.log(`  attempt ${attempt}: not ready (${res.status})…`);
    }

    if (attempt === maxAttempts) {
      throw new Error(
        `Timed out waiting for indexer: only ${tokens.length}/${expected} tokens after ${maxAttempts} attempts. ` +
          "Is the indexer running for this network?",
      );
    }
    await sleep(15_000);
  }

  // Sanity: the third party's token must NOT be in the attested set.
  const claimedIds = tokens.map((t) => BigInt(t.token_id));
  if (claimedIds.includes(OTHER_TOKEN)) {
    throw new Error(`ownership filter failed: token #${OTHER_TOKEN} should not have been signed`);
  }
  for (const t of ALICE_TOKENS) {
    if (!claimedIds.includes(t)) {
      throw new Error(`expected token #${t} in the attested set, got [${claimedIds.join(", ")}]`);
    }
  }

  console.log("\n[CLAIM] Alice-NEW migrate_and_claim() for each token...");
  for (const token of tokens) {
    const tokenId = new Fr(BigInt(token.token_id));
    await newNft.methods
      .migrate_and_claim(tokenId, token.signature_bytes)
      .send({ from: newAddr, wait: { timeout: SEND_TIMEOUT } });
    console.log(`  ✓ claimed #${BigInt(token.token_id)}`);
  }

  // ═════════════════════════════ VERIFY ════════════════════════════════════

  console.log("\n[VERIFY] reading post-claim state...");
  const { result: privatePage } = await newNft.methods
    .get_private_nfts(newAddr, 0)
    .simulate({ from: newAddr });
  const ownedIds = (privatePage[0] as Array<Fr | bigint>)
    .map((v) => BigInt(v.toString()))
    .filter((v) => v !== 0n);
  console.log(`  Alice-NEW private notes: [${ownedIds.join(", ")}]`);

  for (const t of ALICE_TOKENS) {
    if (!ownedIds.includes(t)) {
      throw new Error(`token #${t} missing from Alice-NEW's private notes`);
    }
    const { result: publicOwner } = await newNft.methods
      .public_owner_of(new Fr(t))
      .simulate({ from: newAddr });
    if (BigInt(publicOwner.toString()) !== 0n) {
      throw new Error(`token #${t} public owner should be zero (privately owned), got ${publicOwner}`);
    }
  }
  console.log("  ✓ all claimed tokens are private notes with zero public owner");

  console.log("\n[VERIFY] double-claim must be rejected...");
  try {
    const first = tokens[0];
    await newNft.methods
      .migrate_and_claim(new Fr(BigInt(first.token_id)), first.signature_bytes)
      .send({ from: newAddr, wait: { timeout: SEND_TIMEOUT } });
    throw new Error("second claim should have reverted but did not");
  } catch (err) {
    if (err instanceof Error && err.message.includes("should have reverted")) throw err;
    console.log("  ✓ second claim correctly rejected (double-claim guard)");
  }

  console.log("\n=== E2E migration complete ✅ ===");
  console.log(`  Old collection: ${oldCollection.toString()}`);
  console.log(`  New collection: ${newCollection.toString()}`);
  console.log(`  Migrated tokens: [${ALICE_TOKENS.join(", ")}]  Alice-OLD → Alice-NEW`);
}

main().catch((err) => {
  console.error("\nE2E migration failed:", err);
  process.exit(1);
});
