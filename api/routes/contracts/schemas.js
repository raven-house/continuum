const tags = ['CONTRACTS'];

const schemas = Object.freeze({
  uploadContract: {
    $id: 'upload-contract',
    tags,
    description:
      'Upload a contract ABI JSON, extract events, and register it for indexing',
    body: {
      type: 'object',
      properties: {
        artifact_id: {
          type: 'string',
          description:
            'Unique identifier for this artifact (used by the indexer)'
        },
        name: {
          type: 'string',
          description: 'Optional contract name override'
        },
        abi: {
          type: 'object',
          description: 'The contract ABI JSON (Noir format)'
        },
        enabled: {
          type: 'boolean',
          description:
            'Whether the indexer should index this artifact (default: true)',
          default: true
        },
        start_block: {
          type: 'object',
          description: 'Per-network block number to start indexing from',
          properties: {
            devnet: { type: 'number' },
            testnet: { type: 'number' },
            sandbox: { type: 'number' }
          },
          additionalProperties: false
        },
        networks: {
          type: 'object',
          description:
            'Per-network indexing metadata. Prefer this for new integrations; start_block is kept for backwards compatibility.',
          additionalProperties: {
            type: 'object',
            properties: {
              start_block: { type: 'number' },
              addresses: {
                type: 'array',
                description:
                  'Contract addresses on this network that use this artifact',
                items: { type: 'string' }
              }
            },
            additionalProperties: false
          }
        },
        event_types: {
          type: 'array',
          description:
            'Event names to index (omit or leave empty to index all events)',
          items: { type: 'string' }
        },
        migration: {
          type: 'object',
          description:
            'Optional migration manifest describing event names, field mappings, and claim attestation shape.',
          properties: {
            type: {
              type: 'string',
              enum: ['nft'],
              default: 'nft'
            },
            ownership_model: {
              type: 'string',
              enum: [
                'latest_transfer_event',
                'explicit_token_registration_event'
              ],
              default: 'latest_transfer_event'
            },
            addresses: {
              type: 'array',
              description:
                'Old-rollup contract addresses that should use this migration manifest',
              items: { type: 'string' }
            },
            events: {
              type: 'object',
              properties: {
                transfer: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    token_id: { type: 'string' },
                    from: { type: 'string' },
                    to: { type: 'string' },
                    private_owner_sentinel: { type: 'string' }
                  },
                  additionalProperties: false
                },
                registration: {
                  type: 'object',
                  properties: {
                    source: {
                      type: 'string',
                      enum: ['contract_event', 'continuum_registry']
                    },
                    name: { type: 'string' },
                    owner: { type: 'string' },
                    token_id: { type: 'string' },
                    commitment: { type: 'string' },
                    collection: { type: 'string' },
                    contract_address: { type: 'string' }
                  },
                  additionalProperties: false
                }
              },
              additionalProperties: false
            },
            claim: {
              type: 'object',
              properties: {
                domain: { type: 'string' },
                attestation_fields: {
                  type: 'array',
                  items: { type: 'string' }
                }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        }
      },
      required: ['artifact_id', 'abi']
    },
    response: {
      200: {
        description: 'Contract ABI processed successfully',
        type: 'object',
        properties: {
          success: {
            type: 'boolean'
          },
          contractId: {
            type: 'string',
            description: 'MongoDB ID of the stored contract'
          },
          contractName: {
            type: 'string',
            description: 'Name of the contract'
          },
          eventCount: {
            type: 'number',
            description: 'Number of events extracted'
          },
          events: {
            type: 'array',
            description: 'Extracted events with their selectors',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Event name'
                },
                path: {
                  type: 'string',
                  description: 'Full event path (e.g., contract::EventName)'
                },
                signature: {
                  type: 'string',
                  description: 'Event signature (e.g., "EventName(Field,u32)")'
                },
                eventSelector: {
                  type: 'string',
                  description:
                    'Event selector as hex string (e.g., "0x12345678")'
                },
                fieldNames: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Names of event fields'
                },
                fieldCount: {
                  type: 'number',
                  description: 'Number of fields in the event'
                },
                abiType: {
                  type: 'object',
                  description: 'Full ABI type structure'
                }
              }
            }
          }
        }
      },
      400: {
        description: 'Invalid ABI JSON',
        type: 'object',
        properties: {
          statusCode: { type: 'number' },
          error: { type: 'string' },
          message: { type: 'string' }
        }
      },
      500: {
        $ref: 'http-errors',
        description: 'Internal server error'
      }
    }
  },

  getContracts: {
    $id: 'get-contracts',
    tags,
    description: 'Get all uploaded contracts with their events',
    querystring: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          minimum: 1,
          default: 1,
          description: 'Page number for pagination'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Number of items per page'
        }
      }
    },
    response: {
      200: {
        description: 'List of contracts',
        type: 'object',
        properties: {
          contracts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                contractName: { type: 'string' },
                eventCount: { type: 'number' },
                events: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      eventSelector: { type: 'string' },
                      fieldCount: { type: 'number' }
                    }
                  }
                },
                processedAt: { type: 'string' },
                createdAt: { type: 'string' }
              }
            }
          },
          total: { type: 'number' },
          page: { type: 'number' },
          limit: { type: 'number' },
          totalPages: { type: 'number' }
        }
      }
    }
  },

  getContractById: {
    $id: 'get-contract-by-id',
    tags,
    description: 'Get a specific contract by ID',
    params: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Contract ID (MongoDB ObjectId)'
        }
      },
      required: ['id']
    },
    response: {
      200: {
        description: 'Contract details',
        type: 'object',
        properties: {
          _id: { type: 'string' },
          contractName: { type: 'string' },
          eventCount: { type: 'number' },
          events: { type: 'array' },
          rawAbi: { type: 'object' },
          processedAt: { type: 'string' },
          createdAt: { type: 'string' }
        }
      },
      404: {
        description: 'Contract not found',
        type: 'object',
        properties: {
          statusCode: { type: 'number' },
          error: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  },

  getEventBySelector: {
    $id: 'get-event-by-selector',
    tags,
    description: 'Find an event by its selector across all contracts',
    params: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Event selector (e.g., "0x12345678")'
        }
      },
      required: ['selector']
    },
    response: {
      200: {
        description: 'Event details',
        type: 'object',
        properties: {
          found: { type: 'boolean' },
          event: { type: 'object' },
          contractId: { type: 'string' },
          contractName: { type: 'string' }
        }
      }
    }
  }
});

export default schemas;
