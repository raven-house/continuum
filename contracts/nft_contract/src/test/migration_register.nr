use crate::NFT;
use crate::test::utils;

#[test]
unconstrained fn register_migration_accepts_nonzero_commitment() {
    let (env, nft_contract_address, owner, _, _) = utils::setup_with_minter(false);
    let migration_commitment = 123456789;

    env.call_public(
        owner,
        NFT::at(nft_contract_address).register_migration(migration_commitment),
    );
}

#[test(should_fail_with = "zero migration commitment not supported")]
unconstrained fn register_migration_rejects_zero_commitment() {
    let (env, nft_contract_address, owner, _, _) = utils::setup_with_minter(false);

    env.call_public(owner, NFT::at(nft_contract_address).register_migration(0));
}
