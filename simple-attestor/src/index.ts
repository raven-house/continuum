/**
 * Minimal Schnorr attestation library for Aztec.
 *
 * This library provides a generic way to:
 * 1. Sign any array of Field elements with Schnorr
 * 2. Verify the signature in an Aztec smart contract
 *
 * Usage:
 *   // Off-chain (TypeScript)
 *   const attester = await Attester.create(secretKey);
 *   const fields = [new Fr(1), new Fr(2), someAddress.toField()];
 *   const { hash, signature } = await attester.attest(fields);
 *
 *   // On-chain (Noir)
 *   use attestation_lib::assert_valid_attestation;
 *   assert_valid_attestation(pubkey, signature, [field1, field2, field3]);
 */

import { Fr } from "@aztec/aztec.js/fields";
import { Schnorr } from "@aztec/foundation/crypto/schnorr";
import { deriveSigningKey } from "@aztec/stdlib/keys";
import { computeInnerAuthWitHash } from "@aztec/stdlib/auth-witness";

export { Fr } from "@aztec/aztec.js/fields";
export { AztecAddress } from "@aztec/aztec.js/addresses";

/** Schnorr public key coordinates on Grumpkin curve */
export interface PublicKey {
  x: Fr;
  y: Fr;
}

/** Result of attesting data */
export interface Attestation {
  /** The Poseidon2 hash of the attested fields */
  hash: Fr;
  /** 64-byte Schnorr signature as hex string (0x prefixed) */
  signature: string;
}

/**
 * Attester for signing arbitrary Field arrays with Schnorr.
 *
 * The signature can be verified on-chain using the corresponding
 * Noir library function `assert_valid_attestation`.
 */
export class Attester {
  private constructor(
    private readonly schnorr: Schnorr,
    private readonly signingKey: Buffer,
    public readonly publicKey: PublicKey,
  ) { }

  /**
   * Create an Attester from a secret key.
   * @param secretKey - The secret key as a hex string or Fr
   */
  static async create(secretKey: Fr | string): Promise<Attester> {
    const sk = typeof secretKey === "string" ? Fr.fromHexString(secretKey) : secretKey;
    const signingKey = deriveSigningKey(sk);
    const schnorr = new Schnorr();
    const pubKey = await schnorr.computePublicKey(signingKey);

    return new Attester(schnorr, signingKey, {
      x: Fr.fromString(pubKey.x.toString()),
      y: Fr.fromString(pubKey.y.toString()),
    });
  }

  /**
   * Attest an array of Field elements.
   *
   * Computes hash = Poseidon2(fields) and signs it with Schnorr.
   * The signature can be verified on-chain with the Noir library.
   *
   * @param fields - Array of Field elements to attest
   * @returns The hash and signature
   */
  async attest(fields: Fr[]): Promise<Attestation> {
    const hash = await computeInnerAuthWitHash(fields);
    const sig = await this.schnorr.constructSignature(hash.toBuffer(), this.signingKey);
    return {
      hash,
      signature: `0x${Buffer.from(sig.toBuffer()).toString("hex")}`,
    };
  }

  /**
   * Sign an already-computed hash.
   * Use this if you need custom hash computation.
   *
   * @param hash - The hash to sign
   * @returns The signature as hex string
   */
  async signHash(hash: Fr): Promise<string> {
    const sig = await this.schnorr.constructSignature(hash.toBuffer(), this.signingKey);
    return `0x${Buffer.from(sig.toBuffer()).toString("hex")}`;
  }
}

/**
 * Compute the Poseidon2 hash of an array of Field elements.
 * This matches the on-chain hash computation in the Noir library.
 *
 * @param fields - Array of Field elements to hash
 * @returns The Poseidon2 hash
 */
export async function computeAttestationHash(fields: Fr[]): Promise<Fr> {
  return computeInnerAuthWitHash(fields);
}

/**
 * Convert a signature hex string to a byte array for contract calls.
 *
 * @param signature - Hex string signature (0x prefixed)
 * @returns Array of 64 bytes
 */
export function signatureToBytes(signature: string): number[] {
  const hex = signature.startsWith("0x") ? signature.slice(2) : signature;
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}
