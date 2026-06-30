import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { AztecAddress } from "@aztec/aztec.js/addresses";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type MigrationAccounts = {
  oldAddr: AztecAddress;
  newAddr: AztecAddress;
};

export const SEND_TIMEOUT = 1_800_000; // 30 min — testnet proving can be slow

export const ALICE_TOKENS = [101n, 102n];
export const OTHER_TOKEN = 999n;

export const ARTIFACT_PATH = join(
  __dirname,
  "../../../../contracts/nft_contract/target/nft_contract-NFT.json",
);
