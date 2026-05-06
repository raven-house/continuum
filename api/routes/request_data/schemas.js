const tags = ['MIGRATION'];

const schemas = Object.freeze({
  requestData: {
    $id: 'request-data',
    tags,
    description: `Request attested migration data for an NFT collection.

Given a migration key (from POST /migration/register on the old rollup) and the
new-rollup collection address, Continuum:
  1. Resolves migration_key → old-rollup wallet address
  2. Resolves collection_address → old-rollup collection address (via collection_registry)
  3. Queries MetadataUpdate events owned by that wallet on the old-rollup collection
  4. Signs each token ID with a Schnorr attestation bound to new_wallet_address
  5. Returns the signatures ready to pass to migrate_and_claim() on the new rollup

The caller (new_wallet_address) must use these signatures from the same address to
successfully call migrate_and_claim() on the contract.`,
    body: {
      type: 'object',
      required: ['collection_address', 'migration_key', 'new_wallet_address'],
      properties: {
        collection_address: {
          type: 'string',
          description: 'NFT contract address on the NEW rollup'
        },
        migration_key: {
          type: 'string',
          description: 'The 64-char hex migration key obtained from the old rollup UI'
        },
        new_wallet_address: {
          type: 'string',
          description:
            'The wallet address on the new rollup that will call migrate_and_claim(). ' +
            'Attestations are bound to this address — only it can use the returned signatures.'
        },
        event_name: {
          type: 'string',
          default: 'MetadataUpdate',
          description: 'Event name to query for ownership data (default: MetadataUpdate)'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          old_wallet_address: {
            type: 'string',
            description: 'Old-rollup wallet address resolved from migration_key'
          },
          new_wallet_address: { type: 'string' },
          collection_address: {
            type: 'string',
            description: 'New rollup collection address (same as input)'
          },
          old_collection_address: {
            type: 'string',
            description: 'Old rollup collection address (resolved from collection_registry)'
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
                  description: '64-byte array — pass directly to migrate_and_claim()',
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
