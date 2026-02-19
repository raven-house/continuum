const tags = ['LISTINGS'];

const schemas = Object.freeze({
  getAllListings: {
    $id: 'get-all-listings',
    tags,
    description: 'Gets all listings with optional filters',
    params: {
      type: 'object',
      properties: {
        network: {
          type: 'string',
          enum: ['sandbox', 'testnet', 'devnet'],
          description: 'Network to query'
        }
      },
      required: ['network']
    },
    querystring: {
      type: 'object',
      properties: {
        nft_contract: {
          type: 'string',
          description: 'Filter by NFT contract address'
        },
        collection_id: {
          type: 'string',
          description: 'Filter by collection ID from Supabase'
        },
        token_id: {
          type: 'number',
          description: 'Filter by token ID'
        },
        seller: {
          type: 'string',
          description: 'Filter by seller wallet address'
        },
        status: {
          type: 'string',
          enum: ['all', 'active', 'sold', 'cancelled'],
          description:
            'Filter by listing status. "all" returns all listings sorted by status priority (active first, then sold, then cancelled)'
        },
        mode: {
          type: 'string',
          enum: ['default', 'history'],
          description:
            'Mode: default returns active/sold listings, history returns all listings including cancelled with status field'
        },
        page: {
          type: 'number',
          minimum: 1,
          default: 1,
          description: 'Page number for pagination (1-indexed)'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 10,
          description: 'Number of items per page (max 100)'
        }
      }
    },
    response: {
      200: {
        description: 'All listings matching the filters',
        type: 'object',
        properties: {
          listings: {
            type: 'array',
            description: 'Array of listings',
            items: {
              type: 'object',
              properties: {
                token_id: {
                  type: 'number'
                },
                timestamp: {
                  type: 'number'
                },
                nft_contract: {
                  type: 'string'
                },
                price: {
                  type: 'string'
                },
                seller: {
                  type: 'string'
                },
                blockNumber: {
                  type: 'number'
                },
                buyer: {
                  type: 'string',
                  description: 'Present only for sold listings'
                },
                offer_contract: {
                  type: 'string'
                },
                soldAt: {
                  type: 'number',
                  description: 'Present only for sold listings'
                },
                soldBlockNumber: {
                  type: 'number',
                  description: 'Present only for sold listings'
                },
                collection_id: {
                  type: 'string',
                  description: 'Collection ID from Supabase'
                },
                nft_name: {
                  type: 'string',
                  description: 'NFT name from Supabase'
                },
                collection_name: {
                  type: 'string',
                  description: 'Collection name from Supabase'
                },
                nft_img_url: {
                  type: 'string',
                  description: 'NFT image URL from Supabase'
                },
                status: {
                  type: 'string',
                  enum: ['active', 'sold', 'cancelled'],
                  description: 'Listing status (only present in history mode)'
                },
                cancelledAt: {
                  type: 'number',
                  description:
                    'Cancellation timestamp (only present for cancelled listings in history mode)'
                },
                cancelledBlockNumber: {
                  type: 'number',
                  description:
                    'Cancellation block number (only present for cancelled listings in history mode)'
                }
              }
            }
          },
          total: {
            type: 'number',
            description: 'Total number of listings returned'
          },
          activeCount: {
            type: 'number',
            description:
              'Number of active listings (only present when status filter is not used)'
          },
          soldCount: {
            type: 'number',
            description:
              'Number of sold listings (only present when status filter is not used)'
          },
          cancelledCount: {
            type: 'number',
            description:
              'Number of cancelled listings (only present in history mode)'
          },
          page: {
            type: 'number',
            description: 'Current page number'
          },
          limit: {
            type: 'number',
            description: 'Items per page'
          },
          totalPages: {
            type: 'number',
            description: 'Total number of pages'
          },
          hasMore: {
            type: 'boolean',
            description: 'Whether there are more pages after the current one'
          }
        }
      },
      500: {
        $ref: 'http-errors',
        description: 'Internal server error'
      }
    }
  }
});

export default schemas;
