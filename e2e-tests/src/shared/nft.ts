import { readFileSync } from "fs";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Contract } from "@aztec/aztec.js/contracts";
import {
  loadContractArtifact,
  type ContractArtifact,
  type NoirCompiledContract,
} from "@aztec/aztec.js/abi";
import { EmbeddedWallet } from "@aztec/wallets/embedded";

import { ARTIFACT_PATH, SEND_TIMEOUT } from "./config.js";
const sendOpts = (from: AztecAddress) => ({ from, wait: { timeout: SEND_TIMEOUT } });

export type NftArtifact = {
  artifact: ContractArtifact;
  raw: NoirCompiledContract;
};

export function loadNftArtifact(): NftArtifact {
  const raw = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as NoirCompiledContract;
  return { artifact: loadContractArtifact(raw), raw };
}

export async function deployCollection(
  wallet: EmbeddedWallet,
  artifact: ContractArtifact,
  opts: {
    name: string;
    symbol: string;
    minter: AztecAddress;
    attester: { x: Fr; y: Fr };
    from: AztecAddress;
  },
): Promise<Contract> {
  const { contract } = await Contract.deploy(
    wallet,
    artifact,
    [opts.name, opts.symbol, opts.minter, opts.attester.x, opts.attester.y],
    "constructor_with_minter",
    { salt: Fr.random() },
  ).send(sendOpts(opts.from));
  return Contract.at(contract.address, artifact, wallet);
}

export function mintPublic(nft: Contract, to: AztecAddress, tokenId: bigint, from: AztecAddress) {
  return nft.methods.mint_to_public(to, new Fr(tokenId)).send(sendOpts(from));
}

export function mintPrivate(nft: Contract, to: AztecAddress, tokenId: bigint, from: AztecAddress) {
  return nft.methods.mint_to_private(to, new Fr(tokenId)).send(sendOpts(from));
}

export function registerPrivateNftMigration(
  nft: Contract,
  tokenId: bigint,
  commitment: string,
  from: AztecAddress,
) {
  return nft.methods
    .register_private_nft_migration(new Fr(tokenId), Fr.fromString(commitment))
    .send(sendOpts(from));
}

export function migrateAndClaim(
  nft: Contract,
  tokenId: string,
  signatureBytes: number[],
  from: AztecAddress,
) {
  return nft.methods
    .migrate_and_claim(new Fr(BigInt(tokenId)), signatureBytes)
    .send(sendOpts(from));
}

export async function getPrivateNftIds(nft: Contract, owner: AztecAddress): Promise<bigint[]> {
  const { result } = await nft.methods.get_private_nfts(owner, 0).simulate({ from: owner });
  return (result[0] as Array<Fr | bigint>)
    .map((v) => BigInt(v.toString()))
    .filter((v) => v !== 0n);
}
export async function publicOwnerOf(
  nft: Contract,
  tokenId: bigint,
  from: AztecAddress,
): Promise<bigint> {
  const { result } = await nft.methods.public_owner_of(new Fr(tokenId)).simulate({ from });
  return BigInt(result.toString());
}
