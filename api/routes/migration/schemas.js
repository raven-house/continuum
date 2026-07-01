const tags = ['MIGRATION'];

const schemas = Object.freeze({
  newSecret: {
    $id: 'migration-new-secret',
    tags,
    description:
      'Generate a fresh random migration secret and its commitment. Stateless — ' +
      'Continuum stores nothing. Register the commitment on the old rollup via ' +
      'register_migration(old_collection, commitment) and save the secret to claim later.',
    response: {
      200: {
        type: 'object',
        properties: {
          secret: {
            type: 'string',
            description:
              'Random 0x-prefixed hex Field. Save this — it is the only thing needed ' +
              'to claim migrated NFTs on the new rollup. Never share it.'
          },
          commitment: {
            type: 'string',
            description:
              'Poseidon2([MIGRATE_REGISTER_DOMAIN, secret]). Pass this to ' +
              'register_migration(old_collection, commitment) on the old rollup.'
          }
        }
      }
    }
  },

  commitment: {
    $id: 'migration-commitment',
    tags,
    description:
      'Compute the migration commitment for a given secret. Stateless — useful to ' +
      'verify a saved secret matches an on-chain registration.',
    body: {
      type: 'object',
      required: ['secret'],
      properties: {
        secret: {
          type: 'string',
          description: 'The migration secret (0x-prefixed hex Field)'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          commitment: { type: 'string' }
        }
      }
    }
  }
});

export default schemas;
