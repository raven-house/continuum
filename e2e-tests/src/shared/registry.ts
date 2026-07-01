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

import { REGISTRY_ARTIFACT_PATH, SEND_TIMEOUT } from "./config.js";

const sendOpts = (from: AztecAddress) => ({ from, wait: { timeout: SEND_TIMEOUT } });

export type RegistryArtifact = {
  artifact: ContractArtifact;
  raw: NoirCompiledContract;
};

export function loadRegistryArtifact(): RegistryArtifact {
  const raw = JSON.parse(readFileSync(REGISTRY_ARTIFACT_PATH, "utf8")) as NoirCompiledContract;
  return { artifact: loadContractArtifact(raw), raw };
}

export async function deployRegistry(
  wallet: EmbeddedWallet,
  artifact: ContractArtifact,
  from: AztecAddress,
): Promise<Contract> {
  const { contract } = await Contract.deploy(wallet, artifact, [], undefined, {
    salt: Fr.random(),
  }).send(sendOpts(from));
  return Contract.at(contract.address, artifact, wallet);
}

export function registerMigration(
  registry: Contract,
  collection: AztecAddress,
  commitment: string,
  from: AztecAddress,
) {
  return registry.methods
    .register_migration(collection, Fr.fromString(commitment))
    .send(sendOpts(from));
}
