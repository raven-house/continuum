//! Minimal attestation verification library for Aztec smart contracts.

use aztec::authwit::auth::compute_inner_authwit_hash;
use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar};

/// Grumpkin curve parameter B for on-curve validation
global GRUMPKIN_CURVE_B: Field = 17;

pub fn compute_attestation_hash<let N: u32>(fields: [Field; N]) -> Field {
    compute_inner_authwit_hash(fields)
}

/// Convert a 32-byte big-endian scalar into an EmbeddedCurveScalar (value = lo + hi * 2^128).
/// `hi` is the top 16 bytes, `lo` the bottom 16 — matching how aztec.js's
/// SchnorrSignature serializes each component.
fn scalar_from_be_bytes(bytes: [u8; 32]) -> EmbeddedCurveScalar {
    let mut hi: Field = 0;
    let mut lo: Field = 0;
    for i in 0..16 {
        hi = hi * 256 + bytes[i] as Field;
        lo = lo * 256 + bytes[i + 16] as Field;
    }
    EmbeddedCurveScalar::new(lo, hi)
}

/// Verify a Schnorr signature over the given hash.
///
/// `signature` is the 64-byte big-endian `s || e` produced by
/// `Schnorr.constructSignature(...).toBuffer()` in aztec.js. schnorr v0.4.0 (the
/// version aztec 5.0.0-rc.1 uses) takes the signature as `(s, e)` scalars and the
/// message as a Field, so we split + decode the bytes here. The hash should be
/// computed using `compute_attestation_hash`.
pub fn assert_valid_signature(pubkey: EmbeddedCurvePoint, signature: [u8; 64], hash: Field) {
    let mut s_bytes: [u8; 32] = [0; 32];
    let mut e_bytes: [u8; 32] = [0; 32];
    for i in 0..32 {
        s_bytes[i] = signature[i];
        e_bytes[i] = signature[i + 32];
    }
    let s = scalar_from_be_bytes(s_bytes);
    let e = scalar_from_be_bytes(e_bytes);
    schnorr::assert_valid_signature(pubkey, (s, e), hash);
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
