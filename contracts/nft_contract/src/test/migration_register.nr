use crate::NFT;
use crate::test::utils;

#[test]
unconstrained fn register_public_nft_migration_accepts_owner() {
    let token_id = 1;
    let migration_commitment = 123456789;
    let (env, nft_contract_address, owner, _, _) =
        utils::setup_and_mint_to_public(false, token_id);

    env.call_public(
        owner,
        NFT::at(nft_contract_address)
            .register_public_nft_migration(token_id, migration_commitment),
    );
}

#[test(should_fail_with = "caller is not owner")]
unconstrained fn register_public_nft_migration_rejects_non_owner() {
    let token_id = 1;
    let migration_commitment = 123456789;
    let (env, nft_contract_address, _, _, recipient) =
        utils::setup_and_mint_to_public(false, token_id);

    env.call_public(
        recipient,
        NFT::at(nft_contract_address)
            .register_public_nft_migration(token_id, migration_commitment),
    );
}

#[test(should_fail_with = "zero migration commitment not supported")]
unconstrained fn register_public_nft_migration_rejects_zero_commitment() {
    let token_id = 1;
    let (env, nft_contract_address, owner, _, _) =
        utils::setup_and_mint_to_public(false, token_id);

    env.call_public(
        owner,
        NFT::at(nft_contract_address).register_public_nft_migration(token_id, 0),
    );
}

#[test]
unconstrained fn register_private_nft_migration_accepts_owner() {
    let token_id = 1;
    let migration_commitment = 123456789;
    let (env, nft_contract_address, owner, _, _) =
        utils::setup_and_mint_to_private(false, token_id);

    env.call_private(
        owner,
        NFT::at(nft_contract_address)
            .register_private_nft_migration(token_id, migration_commitment),
    );

    utils::assert_owns_private_nft(env, nft_contract_address, owner, token_id);
}

#[test(should_fail_with = "nft not found")]
unconstrained fn register_private_nft_migration_rejects_non_owner() {
    let token_id = 1;
    let migration_commitment = 123456789;
    let (env, nft_contract_address, _, _, recipient) =
        utils::setup_and_mint_to_private(false, token_id);

    env.call_private(
        recipient,
        NFT::at(nft_contract_address)
            .register_private_nft_migration(token_id, migration_commitment),
    );
}

#[test(should_fail_with = "zero migration commitment not supported")]
unconstrained fn register_private_nft_migration_rejects_zero_commitment() {
    let token_id = 1;
    let (env, nft_contract_address, owner, _, _) =
        utils::setup_and_mint_to_private(false, token_id);

    env.call_private(
        owner,
        NFT::at(nft_contract_address).register_private_nft_migration(token_id, 0),
    );
}
