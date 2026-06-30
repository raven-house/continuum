import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "@aztec/aztec.js/log";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const TESTNET_URL = "https://v5.testnet.rpc.aztec-labs.com";

export const FEE_JUICE_AMOUNT = process.env.FEE_JUICE_AMOUNT
  ? BigInt(process.env.FEE_JUICE_AMOUNT)
  : 10n ** 22n;

export const SEND_TIMEOUT = 1_800_000; // 30 min — testnet proving can be slow

export const NODE_URL = process.env.AZTEC_NODE_URL ?? TESTNET_URL;
export const API_URL = (process.env.CONTINUUM_API_URL ?? "http://localhost:3004").replace(/\/$/, "");
export const NETWORK = process.env.CONTINUUM_NETWORK ?? "testnet";

export const isSandbox = NODE_URL.includes("localhost");
export const isRemote = !isSandbox;

// Tokens minted on the old collection. ALICE_TOKENS migrate; OTHER_TOKEN belongs
// to a third party and must be excluded by /request_data.
export const ALICE_TOKENS = [101n, 102n];
export const OTHER_TOKEN = 999n;

// Compiled NFT artifact. The codegen NFT.ts wrapper is stale; the target JSON
// carries the migration constructor + events.
export const ARTIFACT_PATH = join(
  __dirname,
  "../../../contracts/nft_contract/target/nft_contract-NFT.json",
);

export const logger = createLogger("aztec:migrate-nft");
