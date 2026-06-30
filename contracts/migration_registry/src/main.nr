use aztec::macros::aztec;

#[aztec]
pub contract MigrationRegistry {
    use aztec::{
        macros::{events::event, functions::external},
        protocol::address::AztecAddress,
    };

    #[event]
    struct MigrationRegistered {
        owner: AztecAddress,
        migration_commitment: Field,
    }
    
    #[external("public")]
    fn register_migration(migration_commitment: Field) {
        assert(migration_commitment != 0, "zero migration commitment not supported");

        self.emit(
            MigrationRegistered {
                owner: self.msg_sender(),
                migration_commitment,
            },
        );
    }
}
