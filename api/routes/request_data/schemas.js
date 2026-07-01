const tags = ['MIGRATION'];

const schemas = Object.freeze({
  requestData: {
    $id: 'request-data',
    tags,
    description: `Request attested migration data for an NFT collection.

Given a migration secret (the preimage of a commitment registered on-chain via
register_migration(old_collection, commitment) on the old rollup) and the new-rollup collection address, Continuum:
  1. Resolves collection_address → old-rollup collection address (via collection_registry)
  2. Recomputes commitment = Poseidon2([MIGRATE_REGISTER_DOMAIN, secret]) and resolves the
     verified old-rollup owner from the matching MigrationRegistered event (owner = the
     authenticated msg_sender that registered it — cannot be spoofed)
  3. Finds tokens whose latest Transfer.to is that owner (current public ownership)
  4. Signs each token ID with a Schnorr attestation bound to new_wallet_address
  5. Returns the signatures ready to pass to migrate_and_claim() on the new rollup

The caller (new_wallet_address) must use these signatures from the same address to
successfully call migrate_and_claim() on the contract.`,
    body: {
      type: 'object',
      required: [
        'collection_address',
        'migration_secret',
        'new_wallet_address'
      ],
      properties: {
        collection_address: {
          $ref: 'aztec-address',
          description: 'NFT contract address on the NEW rollup'
        },
        migration_secret: {
          type: 'string',
          pattern: '^0x[0-9a-fA-F]{1,64}$',
          description:
            'The migration secret (0x-prefixed hex Field) whose commitment was registered ' +
            'on-chain via register_migration(old_collection, commitment) on the old rollup. Obtained from ' +
            'GET /migration/new-secret.'
        },
        new_wallet_address: {
          $ref: 'aztec-address',
          description:
            'The wallet address on the new rollup that will call migrate_and_claim(). ' +
            'Attestations are bound to this address — only it can use the returned signatures.'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          old_wallet_address: {
            type: 'string',
            description:
              'Verified old-rollup wallet address resolved from the on-chain MigrationRegistered event'
          },
          new_wallet_address: { type: 'string' },
          collection_address: {
            type: 'string',
            description: 'New rollup collection address (same as input)'
          },
          old_collection_address: {
            type: 'string',
            description:
              'Old rollup collection address (resolved from collection_registry)'
          },
          tokens: {
            type: 'array',
            description: 'One entry per NFT the user owned on the old rollup',
            items: {
              type: 'object',
              properties: {
                token_id: { type: 'string' },
                signature: {
                  type: 'string',
                  description: '64-byte Schnorr signature as 0x-prefixed hex'
                },
                signature_bytes: {
                  type: 'array',
                  description:
                    '64-byte array — pass directly to migrate_and_claim()',
                  items: { type: 'integer' }
                }
              }
            }
          }
        }
      }
    }
  }
});

export default schemas;
