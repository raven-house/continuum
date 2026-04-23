//! MigrationClaims - attestation-gated per-user migration registry.
//!
//! A trusted off-chain attester (Continuum) indexes public events from the old
//! rollup, then signs a claim: "address X may claim N units on the new rollup."
//! This contract verifies that Schnorr signature and records the claim exactly
//! once per address.
//!
//! Flow:
//!   1. Deploy with the attester's Grumpkin public key.
//!   2. Attester signs: Poseidon2([CLAIM_DOMAIN, contract_addr, user_addr, amount])
//!   3. User calls claim(amount, signature) - proof is generated in private context.
//!   4. If valid and not yet claimed, state is updated and a public event is emitted.

use ::aztec::macros::aztec;

#[aztec]
pub contract MigrationClaims {
    use aztec::{
        macros::{
            events::event,
            functions::{external, initializer, only_self, view},
            storage::storage,
        },
        protocol::{
            address::AztecAddress,
            traits::{Deserialize, Packable, Serialize, ToField},
        },
        state_vars::{Map, PublicImmutable, PublicMutable},
    };
    use std::embedded_curve_ops::EmbeddedCurvePoint;
    use attestation_lib::assert_valid_attestation;

    global GRUMPKIN_CURVE_B: Field = 17;

    // Domain separator: "CLM" - prevents signature reuse across different contract methods
    global CLAIM_DOMAIN: Field = 0x434c4d;

    #[derive(Deserialize, Eq, Packable, Serialize)]
    pub struct Config {
        attester_pubkey_x: Field,
        attester_pubkey_y: Field,
    }

    // Emitted when a user successfully claims their migrated state.
    // Continuum indexes these events to track migration progress.
    #[event]
    struct MigrationClaimed {
        user: AztecAddress,
        amount: Field,
    }

    #[storage]
    struct Storage<Context> {
        // Attester public key stored immutably at deployment
        config: PublicImmutable<Config, Context>,
        // Per-user claimed amount - 0 means not yet claimed
        claimed: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
        // Running total of all claimed amounts
        total_claimed: PublicMutable<Field, Context>,
    }

    /// Deploy with the attester's Grumpkin public key.
    /// Validates the key is on the curve before storing it.
    #[external("public")]
    #[initializer]
    fn constructor(attester_pubkey_x: Field, attester_pubkey_y: Field) {
        // Grumpkin curve equation: y^2 = x^3 - 17
        assert(
            attester_pubkey_y * attester_pubkey_y
                == attester_pubkey_x * attester_pubkey_x * attester_pubkey_x - GRUMPKIN_CURVE_B,
            "attester pubkey not on curve",
        );
        self.storage.config.initialize(Config { attester_pubkey_x, attester_pubkey_y });
        self.storage.total_claimed.write(0);
    }

    /// Claim migrated state with an attester-issued Schnorr signature.
    ///
    /// The attester must have signed the following fields (in order):
    ///   [CLAIM_DOMAIN, contract_address, caller_address, amount]
    ///
    /// Schnorr verification runs in private context (AVM lacks Blake2s).
    /// The state update is enqueued as an internal public call.
    #[external("private")]
    fn claim(amount: Field, signature: [u8; 64]) {
        let config = self.storage.config.read();
        let attester_pubkey = EmbeddedCurvePoint {
            x: config.attester_pubkey_x,
            y: config.attester_pubkey_y,
            is_infinite: false,
        };

        let caller = self.msg_sender();

        let fields = [
            CLAIM_DOMAIN,
            self.context.this_address().to_field(),
            caller.to_field(),
            amount,
        ];

        assert_valid_attestation(attester_pubkey, signature, fields);

        self.enqueue_self._record_claim_internal(caller, amount);
    }

    /// Internal: record the claim and emit event. Only callable from within this contract.
    #[external("public")]
    #[only_self]
    fn _record_claim_internal(user: AztecAddress, amount: Field) {
        assert(self.storage.claimed.at(user).read() == 0, "already claimed");

        self.storage.claimed.at(user).write(amount);
        let total = self.storage.total_claimed.read();
        self.storage.total_claimed.write(total + amount);

        self.emit(MigrationClaimed { user, amount });
    }

    /// Returns the amount claimed by a user (0 if not claimed).
    #[external("public")]
    #[view]
    fn get_claimed_amount(user: AztecAddress) -> Field {
        self.storage.claimed.at(user).read()
    }

    /// Returns the sum of all claimed amounts across all users.
    #[external("public")]
    #[view]
    fn get_total_claimed() -> Field {
        self.storage.total_claimed.read()
    }

    /// Returns true if the user has already claimed.
    #[external("public")]
    #[view]
    fn has_claimed(user: AztecAddress) -> bool {
        self.storage.claimed.at(user).read() != 0
    }
}
