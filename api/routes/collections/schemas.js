const tags = ['COLLECTIONS'];

const schemas = Object.freeze({
  register: {
    $id: 'collection-register',
    tags,
    description:
      'Register the mapping between an old-rollup NFT collection address and its new-rollup counterpart. Collection owners call this once after redeploying on the new rollup.',
    body: {
      type: 'object',
      required: ['old_collection_address', 'new_collection_address'],
      properties: {
        old_collection_address: {
          type: 'string',
          description: 'NFT contract address on the old/deprecated rollup'
        },
        old_network: {
          type: 'string',
          enum: ['devnet', 'testnet', 'sandbox', 'mainnet'],
          default: 'devnet',
          description: 'Network of the old rollup'
        },
        new_collection_address: {
          type: 'string',
          description: 'NFT contract address on the new rollup'
        },
        new_network: {
          type: 'string',
          enum: ['devnet', 'testnet', 'sandbox', 'mainnet'],
          default: 'devnet',
          description: 'Network of the new rollup'
        },
        collection_name: {
          type: 'string',
          description: 'Human-readable name (for UI display)'
        },
        artifact_id: {
          type: 'string',
          description:
            'Optional uploaded contract artifact id whose migration manifest should be used for this collection'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          id: { type: 'string' },
          old_collection_address: { type: 'string' },
          new_collection_address: { type: 'string' },
          collection_name: { type: 'string' },
          artifact_id: { type: 'string' },
          isNew: { type: 'boolean' }
        }
      }
    }
  },

  getByNewAddress: {
    $id: 'collection-get-by-new-address',
    tags,
    description:
      'Look up a collection registration by the new-rollup collection address.',
    params: {
      type: 'object',
      required: ['newAddress'],
      properties: {
        newAddress: {
          type: 'string',
          description: 'New rollup collection address'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          found: { type: 'boolean' },
          old_collection_address: { type: 'string' },
          new_collection_address: { type: 'string' },
          old_network: { type: 'string' },
          new_network: { type: 'string' },
          collection_name: { type: 'string' },
          artifact_id: { type: 'string' },
          registered_at: { type: 'string' }
        }
      }
    }
  },

  list: {
    $id: 'collection-list',
    tags,
    description: 'List all registered collection migrations.',
    querystring: {
      type: 'object',
      properties: {
        new_network: { type: 'string' },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
      }
    }
  }
});

export default schemas;
