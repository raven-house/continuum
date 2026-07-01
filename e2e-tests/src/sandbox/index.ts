import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";

import { ALICE_TOKENS, OTHER_TOKEN } from "../shared/config.js";
import { ContinuumApi } from "../shared/continuum-api.js";
import {
  deployCollection,
  getPrivateNftIds,
  loadNftArtifact,
  migrateAndClaim,
  mintPrivate,
  mintPublic,
  registerPrivateNftMigration,
} from "../shared/nft.js";
import { deployRegistry, loadRegistryArtifact, registerMigration } from "../shared/registry.js";
import { assertExpectedTokens, verifyClaims } from "../shared/verify.js";
import { resolveSandboxAccounts } from "./accounts.js";

const NETWORK = "sandbox";
const NODE_URL = "http://localhost:8080";
const API_URL = "http://localhost:3000";
const PRIVATE_TOKEN = 201n;

const section = (title: string) => console.log(`\n${title}`);
const step = (msg: string) => console.log(`  ${msg}`);

function assertTokenSet(tokens: { token_id: string }[], expected: bigint[], label: string): void {
  const actual = tokens.map((t) => BigInt(t.token_id)).sort((a, b) => Number(a - b));
  const want = [...expected].sort((a, b) => Number(a - b));

  if (actual.length !== want.length || actual.some((id, i) => id !== want[i])) {
    throw new Error(`${label}: expected [${want.join(", ")}], got [${actual.join(", ")}]`);
  }
}

async function main() {
  const api = new ContinuumApi(API_URL);
  const { artifact, raw } = loadNftArtifact();
  const { artifact: registryArtifact, raw: registryRaw } = loadRegistryArtifact();

  const node = createAztecNodeClient(NODE_URL);
  await node.getNodeInfo();

  const wallet = await EmbeddedWallet.create(node, {
    ephemeral: true,
    pxeConfig: { proverEnabled: false },
  });

  const { oldAddr, newAddr } = await resolveSandboxAccounts(wallet);

  const startBlock = await node.getBlockNumber();

  section("[OLD] deploying old NFT collection (migration disabled)...");
  const oldNft = await deployCollection(wallet, artifact, {
    name: "Continuum Old",
    symbol: "COLD",
    minter: oldAddr,
    attester: { x: Fr.ZERO, y: Fr.ZERO },
    from: oldAddr,
  });
  step(`✓ old collection: ${oldNft.address.toString()}`);

  section("[OLD] deploying shared MigrationRegistry contract...");
  const registry = await deployRegistry(wallet, registryArtifact, oldAddr);
  const registryAddr = registry.address.toString();
  step(`✓ migration registry: ${registryAddr}`);

  section("[OLD] registering NFT artifact with the indexer...");
  const artifactId = `nft-${NETWORK}`;
  const registryArtifactId = `migration-registry-${NETWORK}`;

  const upload = await api.uploadArtifact({
    artifactId,
    name: "NFT",
    abi: raw,
    eventTypes: ["Transfer"],
    startBlock: { [NETWORK]: startBlock },
    migration: {
      type: "nft",
      ownership_model: "latest_transfer_event",
      addresses: [],
      events: {
        transfer: { name: "Transfer", token_id: "token_id", from: "from", to: "to" },
        registration: {
          source: "continuum_registry",
          name: "MigrationRegistered",
          owner: "owner",
          commitment: "migration_commitment",
          contract_address: registryAddr,
        },
      },
      claim: {
        domain: "0x4e46544d",
        attestation_fields: ["domain", "new_collection_address", "new_wallet_address", "token_id"],
      },
    },
  });

  step(
    upload === "registered"
      ? `✓ artifact '${artifactId}' registered (start_block.${NETWORK}=${startBlock})`
      : `✓ artifact '${artifactId}' already registered (reusing existing sync state)`,
  );

  section("[OLD] registering MigrationRegistry artifact with the indexer...");
  const registryUpload = await api.uploadArtifact({
    artifactId: registryArtifactId,
    name: "MigrationRegistry",
    abi: registryRaw,
    eventTypes: ["MigrationRegistered"],
    startBlock: { [NETWORK]: startBlock },
    // Tells the indexer to scan this standalone contract address (it is not part
    // of any collection pair, so collection_registry would never surface it).
    networks: { [NETWORK]: { start_block: startBlock, addresses: [registryAddr] } },
  });

  step(
    registryUpload === "registered"
      ? `✓ artifact '${registryArtifactId}' registered (registry=${registryAddr})`
      : `✓ artifact '${registryArtifactId}' already registered (reusing existing sync state)`,
  );

  section("[OLD] minting public NFTs...");

  for (const tokenId of ALICE_TOKENS) {
    await mintPublic(oldNft, oldAddr, tokenId, oldAddr);
    step(`✓ minted #${tokenId} → Alice-OLD`);
  }
  await mintPublic(oldNft, await AztecAddress.random(), OTHER_TOKEN, oldAddr);
  step(`✓ minted #${OTHER_TOKEN} → someone else (must be excluded)`);

  section("[OLD] fetching a fresh migration secret...");

  const { secret, commitment } = await api.newMigrationSecret();
  step(`secret:     ${secret.slice(0, 18)}… (saved by the user)`);
  step(`commitment: ${commitment.slice(0, 18)}…`);

  section("[OLD] Alice-OLD calls register_migration(commitment) on the registry...");
  await registerMigration(registry, commitment, oldAddr);
  step("✓ MigrationRegistered emitted from registry (owner = Alice-OLD)");

  section("[NEW] fetching attester public key...");
  const attester = await api.getAttester();
  step(`pubkey.x: ${attester.x.slice(0, 18)}…`);

  section("[NEW] deploying new NFT collection (migration enabled)...");
  const newNft = await deployCollection(wallet, artifact, {
    name: "Continuum New",
    symbol: "CNEW",
    minter: oldAddr, // irrelevant for migration
    attester: { x: Fr.fromString(attester.x), y: Fr.fromString(attester.y) },
    from: oldAddr,
  });
  step(`✓ new collection: ${newNft.address.toString()}`);

  section("[NEW] registering old → new collection mapping...");
  await api.registerCollection({
    oldAddress: oldNft.address.toString(),
    newAddress: newNft.address.toString(),
    network: NETWORK,
    name: "Continuum E2E",
    artifactId,
  });
  step("✓ mapping registered");

  section("[CLAIM] polling /request_data until the indexer catches up...");
  const tokens = await api.pollRequestData(
    {
      collectionAddress: newNft.address.toString(),
      migrationSecret: secret,
      newWalletAddress: newAddr.toString(),
    },
    {
      expected: ALICE_TOKENS.length,
      onWait: (attempt, got) => step(`attempt ${attempt}: ${got}/${ALICE_TOKENS.length} tokens indexed…`),
    },
  );
  step(`✓ got ${tokens.length} signed token(s)`);
  assertExpectedTokens(tokens);

  section("[CLAIM] Alice-NEW migrate_and_claim() for each token...");
  for (const token of tokens) {
    await migrateAndClaim(newNft, token.token_id, token.signature_bytes, newAddr);
    step(`✓ claimed #${BigInt(token.token_id)}`);
  }

  await verifyClaims(newNft, newAddr, tokens);

  section("[PRIVATE OLD] deploying app-native private migration collection...");
  const privateOldNft = await deployCollection(wallet, artifact, {
    name: "Continuum Private Old",
    symbol: "CPOLD",
    minter: oldAddr,
    attester: { x: Fr.ZERO, y: Fr.ZERO },
    from: oldAddr,
  });
  step(`✓ private old collection: ${privateOldNft.address.toString()}`);

  section("[PRIVATE OLD] registering private NFT artifact with app-native migration event...");
  const privateArtifactId = `nft-private-${NETWORK}-${startBlock}-${Date.now()}`;
  const privateOldAddress = privateOldNft.address.toString();
  const privateUpload = await api.uploadArtifact({
    artifactId: privateArtifactId,
    name: "NFTPrivateMigration",
    abi: raw,
    eventTypes: ["Transfer", "NFTMigrationRegistered"],
    startBlock: { [NETWORK]: startBlock },
    networks: { [NETWORK]: { start_block: startBlock, addresses: [privateOldAddress] } },
    migration: {
      type: "nft",
      ownership_model: "explicit_token_registration_event",
      addresses: [privateOldAddress],
      events: {
        transfer: { name: "Transfer", token_id: "token_id", from: "from", to: "to" },
        registration: {
          source: "contract_event",
          name: "NFTMigrationRegistered",
          owner: "owner",
          token_id: "token_id",
          commitment: "migration_commitment",
        },
      },
      claim: {
        domain: "0x4e46544d",
        attestation_fields: ["domain", "new_collection_address", "new_wallet_address", "token_id"],
      },
    },
  });
  step(
    privateUpload === "registered"
      ? `✓ artifact '${privateArtifactId}' registered`
      : `✓ artifact '${privateArtifactId}' already registered`,
  );

  section("[PRIVATE OLD] minting private NFT and registering it for migration...");
  await mintPrivate(privateOldNft, oldAddr, PRIVATE_TOKEN, oldAddr);
  step(`✓ minted private #${PRIVATE_TOKEN} → Alice-OLD`);

  const beforePrivateIds = await getPrivateNftIds(privateOldNft, oldAddr);
  if (!beforePrivateIds.includes(PRIVATE_TOKEN)) {
    throw new Error(`private setup failed: Alice-OLD does not own #${PRIVATE_TOKEN}`);
  }

  const { secret: privateSecret, commitment: privateCommitment } = await api.newMigrationSecret();
  await registerPrivateNftMigration(privateOldNft, PRIVATE_TOKEN, privateCommitment, oldAddr);
  step("✓ NFTMigrationRegistered emitted and old private note consumed");

  const afterPrivateIds = await getPrivateNftIds(privateOldNft, oldAddr);
  if (afterPrivateIds.includes(PRIVATE_TOKEN)) {
    throw new Error(`private migration registration failed: #${PRIVATE_TOKEN} was not consumed`);
  }

  section("[PRIVATE NEW] deploying app-native migration target collection...");
  const privateNewNft = await deployCollection(wallet, artifact, {
    name: "Continuum Private New",
    symbol: "CPNEW",
    minter: oldAddr,
    attester: { x: Fr.fromString(attester.x), y: Fr.fromString(attester.y) },
    from: oldAddr,
  });
  step(`✓ private new collection: ${privateNewNft.address.toString()}`);

  section("[PRIVATE NEW] registering private old → new collection mapping...");
  await api.registerCollection({
    oldAddress: privateOldNft.address.toString(),
    newAddress: privateNewNft.address.toString(),
    network: NETWORK,
    name: "Continuum Private E2E",
    artifactId: privateArtifactId,
  });
  step("✓ private mapping registered");

  section("[PRIVATE CLAIM] polling /request_data for app-native private registration...");
  const privateTokens = await api.pollRequestData(
    {
      collectionAddress: privateNewNft.address.toString(),
      migrationSecret: privateSecret,
      newWalletAddress: newAddr.toString(),
    },
    {
      expected: 1,
      onWait: (attempt, got) => step(`attempt ${attempt}: ${got}/1 private tokens indexed…`),
    },
  );
  assertTokenSet(privateTokens, [PRIVATE_TOKEN], "private migration token set");
  step(`✓ got signed private token #${PRIVATE_TOKEN}`);

  section("[PRIVATE CLAIM] Alice-NEW migrate_and_claim() for private token...");
  await migrateAndClaim(
    privateNewNft,
    privateTokens[0].token_id,
    privateTokens[0].signature_bytes,
    newAddr,
  );
  step(`✓ claimed private #${PRIVATE_TOKEN}`);

  const privateClaimIds = await getPrivateNftIds(privateNewNft, newAddr);
  if (!privateClaimIds.includes(PRIVATE_TOKEN)) {
    throw new Error(`private claim failed: Alice-NEW does not own #${PRIVATE_TOKEN}`);
  }
  step(`✓ Alice-NEW private notes include #${PRIVATE_TOKEN}`);

  console.log("\n=== E2E migration complete ✅ (sandbox) ===");
  console.log(`  Old collection: ${oldNft.address.toString()}`);
  console.log(`  New collection: ${newNft.address.toString()}`);
  console.log(`  Migrated tokens: [${ALICE_TOKENS.join(", ")}]  Alice-OLD → Alice-NEW`);
  console.log(`  Private migrated token: #${PRIVATE_TOKEN}  Alice-OLD → Alice-NEW`);
}

main().catch((err) => {
  console.error("\nE2E migration failed:", err);
  process.exit(1);
});
