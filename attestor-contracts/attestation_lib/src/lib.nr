//! Minimal attestation verification library for Aztec smart contracts.
//!
//! This library verifies Schnorr signatures created by the TypeScript
//! `@aztec-fpc/attestation-lib` package.
//!
//! Usage:
//!   use attestation_lib::{assert_valid_attestation, compute_attestation_hash};
//!   use std::embedded_curve_ops::EmbeddedCurvePoint;
//!
//!   // Verify attestation inline
//!   let fields = [field1, field2, field3];
//!   assert_valid_attestation(operator_pubkey, signature, fields);
//!
//!   // Or compute hash separately for nullifier/other uses
//!   let hash = compute_attestation_hash(fields);
//!   assert_valid_signature(operator_pubkey, signature, hash);

use aztec::authwit::auth::compute_inner_authwit_hash;
use std::embedded_curve_ops::EmbeddedCurvePoint;

/// Grumpkin curve parameter B for on-curve validation
global GRUMPKIN_CURVE_B: Field = 17;

/// Compute the attestation hash matching the TypeScript library.
/// Uses Poseidon2 via compute_inner_authwit_hash.
pub fn compute_attestation_hash<let N: u32>(fields: [Field; N]) -> Field {
    compute_inner_authwit_hash(fields)
}

/// Verify a Schnorr signature over the given hash.
/// The hash should be computed using `compute_attestation_hash`.
pub fn assert_valid_signature(
    pubkey: EmbeddedCurvePoint,
    signature: [u8; 64],
    hash: Field,
) {
    schnorr::assert_valid_signature(pubkey, signature, hash.to_be_bytes::<32>());
}

/// Verify an attestation over an array of fields.
/// Computes the hash and verifies the Schnorr signature.
pub fn assert_valid_attestation<let N: u32>(
    pubkey: EmbeddedCurvePoint,
    signature: [u8; 64],
    fields: [Field; N],
) {
    let hash = compute_attestation_hash(fields);
    assert_valid_signature(pubkey, signature, hash);
}

/// Validate that a public key point is on the Grumpkin curve.
/// Use this to validate attester public keys at contract initialization.
pub fn assert_pubkey_on_curve(pubkey_x: Field, pubkey_y: Field) {
    // Grumpkin curve equation: y^2 = x^3 - 17
    assert(
        pubkey_y * pubkey_y == pubkey_x * pubkey_x * pubkey_x - GRUMPKIN_CURVE_B,
        "pubkey not on curve",
    );
}
