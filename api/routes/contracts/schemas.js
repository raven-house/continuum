const tags = ['CONTRACTS'];

const schemas = Object.freeze({
  uploadContract: {
    $id: 'upload-contract',
    tags,
    description: 'Upload a contract ABI JSON and extract events with their selectors',
    body: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Optional contract name override'
        },
        abi: {
          type: 'object',
          description: 'The contract ABI JSON (Noir format)'
        }
      },
      required: ['abi']
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
                  description: 'Event selector as hex string (e.g., "0x12345678")'
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
