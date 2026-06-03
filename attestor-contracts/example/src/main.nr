//! Minimal example contract demonstrating attestation verification.
//!
//! This contract shows how to use the attestation_lib to verify Schnorr
//! attestations in both public and private contexts.
//!
//! Usage:
//!   1. Deploy with attester public key
//!   2. Call increment_public_counter or increment_private_counter with
//!      a valid attestation over the expected fields

use ::aztec::macros::aztec;

#[aztec]
pub contract AttestorExample {
    use aztec::{
        macros::{functions::{external, initializer, only_self, view}, storage::storage},
                protocol::{traits::{Deserialize, Packable, Serialize, ToField}},
        state_vars::{PublicImmutable, PublicMutable},
    };
    use std::embedded_curve_ops::EmbeddedCurvePoint;
    use attestation_lib::assert_valid_attestation;

    /// Grumpkin curve parameter B for on-curve validation
    global GRUMPKIN_CURVE_B: Field = 17;

    /// Domain separator for public counter increments
    global PUBLIC_INCREMENT_DOMAIN: Field = 0x505542; // "PUB"

    /// Domain separator for private counter increments
    global PRIVATE_INCREMENT_DOMAIN: Field = 0x505249; // "PRI"

    /// Configuration storing the attester's public key
    #[derive(Deserialize, Eq, Packable, Serialize)]
    pub struct Config {
        attester_pubkey_x: Field,
        attester_pubkey_y: Field,
    }

    #[storage]
    struct Storage<Context> {
        /// Immutable attester configuration
        config: PublicImmutable<Config, Context>,
        /// Public counter that can be incremented with valid attestation
        public_counter: PublicMutable<Field, Context>,
    }

    /// Initialize the contract with an attester's public key.
    /// The public key must be a valid point on the Grumpkin curve.
    #[external("public")]
    #[initializer]
    fn constructor(attester_pubkey_x: Field, attester_pubkey_y: Field) {
        // Validate public key is on the Grumpkin curve: y^2 = x^3 - 17
        assert(
            attester_pubkey_y * attester_pubkey_y
                == attester_pubkey_x * attester_pubkey_x * attester_pubkey_x - GRUMPKIN_CURVE_B,
            "attester pubkey not on curve",
        );

        self.storage.config.initialize(Config { attester_pubkey_x, attester_pubkey_y });
        self.storage.public_counter.write(0);
    }

    /// Increment the public counter if the attestation is valid.
    ///
    /// The attestation must sign the following fields:
    ///   [PUBLIC_INCREMENT_DOMAIN, contract_address, caller, increment_value]
    ///
    /// Schnorr verification happens in private context (AVM does not support Blake2s).
    /// The actual state update is enqueued as an internal public call.
    #[external("private")]
    fn increment_public_counter(increment_value: Field, signature: [u8; 64]) {
        let config = self.storage.config.read();
        let attester_pubkey = EmbeddedCurvePoint {
            x: config.attester_pubkey_x,
            y: config.attester_pubkey_y,
        };

        // Build the expected attestation fields
        let fields = [
            PUBLIC_INCREMENT_DOMAIN,
            self.context.this_address().to_field(),
            self.msg_sender().to_field(),
            increment_value,
        ];

        // Verify the attestation in private context
        assert_valid_attestation(attester_pubkey, signature, fields);

        // Enqueue public state update
        self.enqueue_self._increment_counter_internal(increment_value);
    }

    /// Increment the public counter from a private context if attestation is valid.
    ///
    /// The attestation must sign the following fields:
    ///   [PRIVATE_INCREMENT_DOMAIN, contract_address, caller, increment_value]
    ///
    /// This demonstrates attestation verification in a private function.
    /// The actual state update happens via an internal public call.
    #[external("private")]
    fn increment_private_counter(increment_value: Field, signature: [u8; 64]) {
        let config = self.storage.config.read();
        let attester_pubkey = EmbeddedCurvePoint {
            x: config.attester_pubkey_x,
            y: config.attester_pubkey_y,
        };

        let caller = self.msg_sender();

        // Build the expected attestation fields
        let fields = [
            PRIVATE_INCREMENT_DOMAIN,
            self.context.this_address().to_field(),
            caller.to_field(),
            increment_value,
        ];

        // Verify the attestation in private context
        assert_valid_attestation(attester_pubkey, signature, fields);

        // Queue public state update via internal call
        self.enqueue_self._increment_counter_internal(increment_value);
    }

    /// Internal function to increment counter (called from private function).
    /// This is internal-only and should not be called directly.
    #[external("public")]
    #[only_self]
    fn _increment_counter_internal(increment_value: Field) {
        let current = self.storage.public_counter.read();
        self.storage.public_counter.write(current + increment_value);
    }

    /// View function to read the current counter value.
    #[external("public")]
    #[view]
    fn get_counter() -> Field {
        self.storage.public_counter.read()
    }

    /// View function to get the attester's public key.
    #[external("public")]
    #[view]
    fn get_attester_pubkey() -> (Field, Field) {
        let config = self.storage.config.read();
        (config.attester_pubkey_x, config.attester_pubkey_y)
    }
}
