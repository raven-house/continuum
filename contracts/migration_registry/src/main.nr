use aztec::macros::aztec;

mod test;

#[aztec]
pub contract MigrationRegistry {
    use aztec::{
        macros::{events::event, functions::external},
        protocol::{address::AztecAddress, traits::ToField},
    };

    #[event]
    struct MigrationRegistered {
        owner: AztecAddress,
        collection: AztecAddress,
        migration_commitment: Field,
    }

    #[external("public")]
    fn register_migration(collection: AztecAddress, migration_commitment: Field) {
        assert(collection.to_field() != 0, "zero collection not supported");
        assert(migration_commitment != 0, "zero migration commitment not supported");

        self.emit(
            MigrationRegistered {
                owner: self.msg_sender(),
                collection,
                migration_commitment,
            },
        );
    }
}
