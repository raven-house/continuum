/**
 * Bridges fee juice (Aztec gas token) from L1 Sepolia to the Aztec testnet.
 *
 * Mints tokens on L1 if the account balance is insufficient, then calls
 * the fee juice portal to bridge them. Polls until the L1→L2 message is
 * consumable on L2, then returns the claim object needed for
 * FeeJuicePaymentMethodWithClaim.
 *
 * Required env var:
 *   L1_PRIVATE_KEY  - Sepolia-funded private key (0x-prefixed)
 */

import { Fr } from "@aztec/aztec.js/fields";
import { ProtocolContractAddress } from "@aztec/aztec.js/protocol";
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { AztecNode } from "@aztec/aztec.js/node";
import type { Logger } from "@aztec/aztec.js/log";
import { createEthereumChain } from "@aztec/ethereum/chain";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { FeeAssetHandlerAbi } from "@aztec/l1-artifacts/FeeAssetHandlerAbi";
import { getNonNullifiedL1ToL2MessageWitness } from "@aztec/stdlib/messaging";
import { getContract } from "viem";

const L1_RPC_URL = process.env.L1_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const L1_CHAIN_ID = 11155111; // Sepolia
const MAX_POLL_ATTEMPTS = 40; // 40 × 30 s = 20 min max

export async function bridgeL1FeeJuice(
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

  const pollInterval = 30_000;
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
