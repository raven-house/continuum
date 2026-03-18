const tags = ['MIGRATION'];

const schemas = Object.freeze({
  register: {
    $id: 'migration-register',
    tags,
    description:
      'Register a migration key for a wallet address. Idempotent — returns existing key if already registered.',
    body: {
      type: 'object',
      required: ['walletAddress'],
      properties: {
        walletAddress: {
          type: 'string',
          description: 'Aztec wallet address'
        },
        network: {
          type: 'string',
          enum: ['devnet', 'testnet', 'sandbox', 'mainnet'],
          default: 'devnet',
          description: 'Network the wallet is on'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          secretKey: { type: 'string' },
          walletAddress: { type: 'string' },
          network: { type: 'string' },
          createdAt: { type: 'string' },
          isNew: {
            type: 'boolean',
            description: 'true if key was just created'
          }
        }
      }
    }
  },

  getByWallet: {
    $id: 'migration-get-by-wallet',
    tags,
    description: 'Check if a wallet has a migration key registered.',
    params: {
      type: 'object',
      required: ['walletAddress'],
      properties: {
        walletAddress: { type: 'string', description: 'Aztec wallet address' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          hasKey: { type: 'boolean' },
          walletAddress: { type: 'string' },
          maskedKey: {
            type: 'string',
            description: 'First 8 chars + ... (safe to display publicly)'
          },
          network: { type: 'string' },
          createdAt: { type: 'string' }
        }
      }
    }
  },

  verify: {
    $id: 'migration-verify',
    tags,
    description:
      'Verify a migration secret key and return the associated wallet address. Used during new-rollup migration.',
    body: {
      type: 'object',
      required: ['secretKey'],
      properties: {
        secretKey: {
          type: 'string',
          description: 'The 64-char hex migration key'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          walletAddress: { type: 'string' },
          network: { type: 'string' },
          createdAt: { type: 'string' }
        }
      }
    }
  }
});

export default schemas;
