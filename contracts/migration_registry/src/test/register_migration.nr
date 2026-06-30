use crate::MigrationRegistry;
use aztec::{
    protocol::address::AztecAddress,
    test::helpers::test_environment::TestEnvironment,
};

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let registry_address = env.deploy("@migration_registry/MigrationRegistry").without_initializer();
    (env, registry_address, owner)
}

#[test]
unconstrained fn register_migration_accepts_nonzero_commitment() {
    let (env, registry_address, owner) = setup();
    let migration_commitment = 123456789;

    env.call_public(
        owner,
        MigrationRegistry::at(registry_address).register_migration(migration_commitment),
    );
}

#[test(should_fail_with = "zero migration commitment not supported")]
unconstrained fn register_migration_rejects_zero_commitment() {
    let (env, registry_address, owner) = setup();

    env.call_public(owner, MigrationRegistry::at(registry_address).register_migration(0));
}
