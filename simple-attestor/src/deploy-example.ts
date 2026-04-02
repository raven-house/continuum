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
 *   AZTEC_NODE_URL     - Aztec node URL (default: https://rpc.testnet.aztec-labs.com)
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
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee";
import { NO_FROM } from "@aztec/aztec.js/account";
import { ProtocolContractAddress } from "@aztec/aztec.js/protocol";
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createLogger, type Logger } from "@aztec/aztec.js/log";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { createEthereumChain } from "@aztec/ethereum/chain";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { FeeAssetHandlerAbi } from "@aztec/l1-artifacts/FeeAssetHandlerAbi";
import { getNonNullifiedL1ToL2MessageWitness } from "@aztec/stdlib/messaging";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";
import { getContract } from "viem";

import { Attester } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TESTNET_URL = "https://rpc.testnet.aztec-labs.com";
const L1_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const L1_CHAIN_ID = 11155111; // Sepolia

const NODE_URL = process.env.AZTEC_NODE_URL ?? TESTNET_URL;
const ATTESTER_SECRET = process.env.ATTESTER_SECRET;

const FEE_JUICE_AMOUNT = 10n ** 21n;
const MAX_POLL_ATTEMPTS = 40; // 40 × 30 s = 20 min max

// ---------------------------------------------------------------------------
// Fee juice bridging (Sepolia → Aztec testnet)
// ---------------------------------------------------------------------------

async function bridgeL1FeeJuice(
  node: AztecNode,
  recipient: AztecAddress,
  amount: bigint,
  logger: Logger,
) {
  const l1PrivateKey = process.env.L1_PRIVATE_KEY;
  if (!l1PrivateKey) {
    throw new Error(
      "L1_PRIVATE_KEY env var is required for testnet fee juice bridging. " +
        "Must be a Sepolia-funded private key (0x-prefixed).",
    );
  }

  const key = (
    l1PrivateKey.startsWith("0x") ? l1PrivateKey : `0x${l1PrivateKey}`
  ) as `0x${string}`;

  const chain = createEthereumChain([L1_RPC_URL], L1_CHAIN_ID);
  const l1Client = createExtendedL1Client(chain.rpcUrls, key, chain.chainInfo);

  logger.info(`🌉 Bridging ${amount} fee juice from L1 to ${recipient}...`);

  const portal = await L1FeeJuicePortalManager.new(node, l1Client, logger);
  const tokenManager = portal.getTokenManager();

  const balance = await tokenManager.getL1TokenBalance(l1Client.account.address);
  if (balance < amount) {
    logger.info("🪙 Minting fee juice tokens on L1...");
    const handler = getContract({
      address: tokenManager.handlerAddress!.toString() as `0x${string}`,
      abi: FeeAssetHandlerAbi,
      client: l1Client,
    });
    const mintHash = await handler.write.mint([l1Client.account.address]);
    logger.info(`⏳ Waiting for mint tx: ${mintHash}`);
    await l1Client.waitForTransactionReceipt({ hash: mintHash });
    logger.info("✅ Mint confirmed on L1");
  } else {
    logger.info(`💰 L1 account already has ${balance} tokens, skipping mint`);
  }

  // Fresh client to pick up current on-chain nonce after potential mint
  const freshClient = createExtendedL1Client(chain.rpcUrls, key, chain.chainInfo);
  const freshPortal = await L1FeeJuicePortalManager.new(node, freshClient, logger);
  const claim = await freshPortal.bridgeTokensPublic(recipient, amount, false);

  logger.info(`✅ Fee juice bridged! Claim amount: ${claim.claimAmount}`);
  logger.info("⏳ Waiting for L1→L2 message to be available on L2...");

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const witness = await getNonNullifiedL1ToL2MessageWitness(
      node,
      ProtocolContractAddress.FeeJuice,
      Fr.fromHexString(claim.messageHash),
      claim.claimSecret,
    ).catch(() => undefined);

    if (witness) {
      logger.info("✅ L1→L2 message is available on L2!");
      return claim;
    }

    const pollInterval = 30_000;
    logger.info(
      `⏳ Not yet available, retrying in ${pollInterval / 1000}s... ` +
        `(${attempt + 1}/${MAX_POLL_ATTEMPTS})`,
    );
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `L1→L2 message not available after ${MAX_POLL_ATTEMPTS} attempts`,
  );
}

// ---------------------------------------------------------------------------
// Main deploy logic
// ---------------------------------------------------------------------------

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
      await node.getPublicStorageAt(
        "latest",
        ProtocolContractAddress.FeeJuice,
        balanceSlot,
      )
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
  console.log("\n4. Deploying Schnorr account...");
  const deployAccountMethod = await account.getDeployMethod();
  await deployAccountMethod.send({ from: NO_FROM, ...accountFeeOpts });
  console.log(`   ✓ Deployer deployed: ${deployer.toString()}`);

  // 6. Generate attester key pair
  console.log("\n5. Generating attester key pair...");
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
  // Subsequent txns are paid from that balance automatically (no explicit paymentMethod needed).
  console.log("\n6. Deploying AttestorExample contract...");
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
