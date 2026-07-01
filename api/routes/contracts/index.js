import {
  processContractAbi,
  validateAbi
} from '../../services/abiProcessor.js';
import { mergeMigrationManifest } from '../../shared/migrationManifest.js';
import { getDbName } from '../../shared/config.js';
import schemas from './schemas.js';

/**
 * Normalize a single Aztec address to lowercase.
 * @param {string} addr - The address to normalize.
 * @returns {string} - Lowercase address.
 */
function normalizeAddress(addr) {
  return typeof addr === 'string' ? addr.toLowerCase().trim() : addr;
}

/**
 * Normalize an array of Aztec addresses to lowercase.
 * @param {string[]} addresses - The addresses to normalize.
 * @returns {string[]} - Lowercase addresses.
 */
function normalizeAddressArray(addresses) {
  if (!Array.isArray(addresses)) return addresses;
  return addresses.map(normalizeAddress).filter(Boolean);
}

/**
 * Normalize all addresses inside per-network indexing metadata.
 * @param {object} networks - Per-network config object.
 * @returns {object} - Config with normalized addresses.
 */
function normalizeNetworks(networks) {
  if (!networks || typeof networks !== 'object') return networks;
  const normalized = {};
  for (const [network, config] of Object.entries(networks)) {
    normalized[network] = {
      ...config,
      addresses: normalizeAddressArray(config?.addresses)
    };
  }
  return normalized;
}

/**
 *
 * @param startBlock
 * @param networks
 */
function deriveStartBlock(startBlock, networks) {
  if (startBlock && Object.keys(startBlock).length > 0) {
    return startBlock;
  }

  return Object.fromEntries(
    Object.entries(networks ?? {})
      .filter(([, config]) => config?.start_block !== undefined)
      .map(([network, config]) => [network, config.start_block])
  );
}

let ObjectId;
try {
  const mongodb = await import('mongodb');
  ObjectId = mongodb.ObjectId;
} catch {
  // Fallback if import fails
  ObjectId = (await import('@fastify/mongodb')).ObjectId;
}

/**
 * @param {import('fastify').FastifyPluginAsync} fastify
 */
export default async function (fastify) {
  fastify.post(
    '/upload',
    { schema: schemas.uploadContract, preHandler: [fastify.adminAuth] },
    async function (request, reply) {
      const {
        artifact_id,
        abi,
        name,
        enabled = true,
        start_block = {},
        networks = {},
        migration,
        event_types = []
      } = request.body;

      // Validate ABI structure
      const validation = validateAbi(abi);
      if (!validation.valid) {
        reply.badRequest(`Invalid ABI: ${validation.errors.join(', ')}`);
        return;
      }

      const db = fastify.mongo.client.db(getDbName());
      const contractsCollection = db.collection('contracts');

      const existing = await contractsCollection.findOne({ artifact_id });

      try {
        // Process the ABI to extract events
        const processedContract = await processContractAbi(abi);

        if (name) {
          processedContract.contractName = name;
        }

        // Validate event_types against what the ABI actually contains
        if (event_types.length > 0) {
          const knownNames = processedContract.events.map(e => e.name);
          const unknown = event_types.filter(t => !knownNames.includes(t));
          if (unknown.length > 0) {
            reply.badRequest(
              `Unknown event_types: [${unknown.join(', ')}]. Available: [${knownNames.join(', ')}]`
            );
            return;
          }
        }

        const resolvedStartBlock = deriveStartBlock(start_block, networks);
        const normalizedNetworks = normalizeNetworks(networks);
        const normalizedMigration = migration
          ? {
              ...migration,
              addresses: normalizeAddressArray(migration.addresses)
            }
          : undefined;
        const migrationManifest = normalizedMigration
          ? mergeMigrationManifest(normalizedMigration)
          : undefined;

        const mergedNetworks = {
          ...(existing?.networks ?? {}),
          ...(normalizedNetworks ?? {})
        };
        const mergedStartBlock = {
          ...(existing?.start_block ?? {}),
          ...(resolvedStartBlock ?? {})
        };

        const fields = {
          artifact_id,
          contractName: processedContract.contractName,
          enabled,
          start_block: mergedStartBlock,
          networks: mergedNetworks,
          migration: migrationManifest,
          event_types,
          eventCount: processedContract.eventCount,
          events: processedContract.events,
          rawAbi: processedContract.rawAbi,
          processedAt: processedContract.processedAt
        };

        let contractId;
        if (existing) {
          await contractsCollection.updateOne(
            { artifact_id },
            { $set: { ...fields, updatedAt: new Date().toISOString() } }
          );
          contractId = existing._id.toString();
        } else {
          const result = await contractsCollection.insertOne({
            ...fields,
            createdAt: new Date().toISOString()
          });
          contractId = result.insertedId.toString();
        }

        return {
          success: true,
          updated: Boolean(existing),
          contractId,
          artifact_id,
          contractName: processedContract.contractName,
          enabled,
          start_block: mergedStartBlock,
          networks: mergedNetworks,
          migration: migrationManifest,
          event_types,
          eventCount: processedContract.eventCount,
          events: processedContract.events
        };
      } catch (error) {
        fastify.log.error(error, 'Failed to process contract ABI');
        reply.internalServerError(
          'Failed to process contract ABI: ' + error.message
        );
        return;
      }
    }
  );

  // GET /contracts - Get all contracts with pagination
  fastify.get('/', { schema: schemas.getContracts }, async function (request) {
    const { page = 1, limit = 20 } = request.query;

    const db = this.mongo.client.db(getDbName());
    const contractsCollection = db.collection('contracts');

    // Get total count
    const total = await contractsCollection.countDocuments();

    // Get paginated results
    const contracts = await contractsCollection
      .find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .project({
        _id: 1,
        contractName: 1,
        eventCount: 1,
        'events.name': 1,
        'events.eventSelector': 1,
        'events.fieldCount': 1,
        processedAt: 1,
        createdAt: 1
      })
      .toArray();

    // Transform _id to string
    const formattedContracts = contracts.map(c => ({
      ...c,
      _id: c._id.toString()
    }));

    return {
      contracts: formattedContracts,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit)
    };
  });

  // GET /contracts/:id - Get contract by ID
  fastify.get(
    '/:id',
    { schema: schemas.getContractById },
    async function (request, reply) {
      const { id } = request.params;

      try {
        const db = this.mongo.client.db(getDbName());
        const contractsCollection = db.collection('contracts');

        const contract = await contractsCollection.findOne({
          _id: new ObjectId(id)
        });

        if (!contract) {
          reply.notFound('Contract not found');
          return;
        }

        return {
          ...contract,
          _id: contract._id.toString()
        };
      } catch (error) {
        if (error.message.includes('ObjectId')) {
          reply.badRequest('Invalid contract ID format');
          return;
        }
        throw error;
      }
    }
  );

  // GET /contracts/event/:selector - Find event by selector
  fastify.get(
    '/event/:selector',
    { schema: schemas.getEventBySelector },
    async function (request) {
      const { selector } = request.params;

      const db = this.mongo.client.db(getDbName());
      const contractsCollection = db.collection('contracts');

      // Find contract containing event with this selector
      const contract = await contractsCollection.findOne(
        {
          'events.eventSelector': selector.toLowerCase()
        },
        {
          projection: {
            _id: 1,
            contractName: 1,
            'events.$': 1
          }
        }
      );

      if (!contract) {
        return {
          found: false,
          event: null,
          contractId: null,
          contractName: null
        };
      }

      // Find the specific event
      const event = contract.events.find(
        e => e.eventSelector.toLowerCase() === selector.toLowerCase()
      );

      return {
        found: true,
        event,
        contractId: contract._id.toString(),
        contractName: contract.contractName
      };
    }
  );

  // PATCH /contracts/:id - Update indexing config (enabled, start_block, event_types)
  fastify.patch(
    '/:id',
    { preHandler: [fastify.adminAuth] },
    async function (request, reply) {
      const { id } = request.params;
      const { enabled, start_block, event_types } = request.body ?? {};

      const updates = {};
      if (enabled !== undefined) updates.enabled = enabled;
      if (start_block !== undefined) updates.start_block = start_block;
      if (event_types !== undefined) updates.event_types = event_types;

      if (Object.keys(updates).length === 0) {
        reply.badRequest(
          'No updatable fields provided (enabled, start_block, event_types)'
        );
        return;
      }

      try {
        const db = this.mongo.client.db(getDbName());
        const contractsCollection = db.collection('contracts');

        const result = await contractsCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: updates },
          { returnDocument: 'after' }
        );

        if (!result) {
          reply.notFound('Contract not found');
          return;
        }

        return {
          success: true,
          contractId: result._id.toString(),
          artifact_id: result.artifact_id,
          enabled: result.enabled,
          start_block: result.start_block,
          event_types: result.event_types
        };
      } catch (error) {
        if (error.message.includes('ObjectId')) {
          reply.badRequest('Invalid contract ID format');
          return;
        }
        throw error;
      }
    }
  );

  // DELETE /contracts/:id - Delete a contract (optional admin endpoint)
  fastify.delete(
    '/:id',
    { preHandler: [fastify.adminAuth] },
    async function (request, reply) {
      const { id } = request.params;

      try {
        const db = this.mongo.client.db(getDbName());
        const contractsCollection = db.collection('contracts');

        const result = await contractsCollection.deleteOne({
          _id: new ObjectId(id)
        });

        if (result.deletedCount === 0) {
          reply.notFound('Contract not found');
          return;
        }

        return {
          success: true,
          message: 'Contract deleted successfully'
        };
      } catch (error) {
        if (error.message.includes('ObjectId')) {
          reply.badRequest('Invalid contract ID format');
          return;
        }
        throw error;
      }
    }
  );
}
