/**
 * Contract ABI Upload and Event Management Routes
 * 
 * Endpoints for uploading contract ABIs, extracting events,
 * and querying stored contract events.
 */

import { processContractAbi, validateAbi } from '../../services/abiProcessor.js';
import schemas from './schemas.js';

// Get ObjectId from the mongodb package
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
  // POST /contracts/upload - Upload ABI and extract events
  fastify.post(
    '/upload',
    { schema: schemas.uploadContract },
    async function (request, reply) {
      const { abi, name } = request.body;

      // Validate ABI structure
      const validation = validateAbi(abi);
      if (!validation.valid) {
        reply.badRequest(`Invalid ABI: ${validation.errors.join(', ')}`);
        return;
      }

      try {
        // Process the ABI to extract events
        const processedContract = await processContractAbi(abi);
        
        // Override contract name if provided
        if (name) {
          processedContract.contractName = name;
        }

        // Get MongoDB collection
        const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);
        const contractsCollection = db.collection('contracts');

        // Store in MongoDB
        const docToInsert = {
          contractName: processedContract.contractName,
          eventCount: processedContract.eventCount,
          events: processedContract.events,
          rawAbi: processedContract.rawAbi,
          processedAt: processedContract.processedAt,
          createdAt: new Date().toISOString()
        };

        const result = await contractsCollection.insertOne(docToInsert);

        // Return success response
        return {
          success: true,
          contractId: result.insertedId.toString(),
          contractName: processedContract.contractName,
          eventCount: processedContract.eventCount,
          events: processedContract.events
        };

      } catch (error) {
        fastify.log.error(error, 'Failed to process contract ABI');
        reply.internalServerError('Failed to process contract ABI: ' + error.message);
        return;
      }
    }
  );

  // GET /contracts - Get all contracts with pagination
  fastify.get(
    '/',
    { schema: schemas.getContracts },
    async function (request) {
      const { page = 1, limit = 20 } = request.query;

      const db = this.mongo.client.db(process.env.CONTINUUM_DB_NAME);
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
    }
  );

  // GET /contracts/:id - Get contract by ID
  fastify.get(
    '/:id',
    { schema: schemas.getContractById },
    async function (request, reply) {
      const { id } = request.params;

      try {
        const db = this.mongo.client.db(process.env.CONTINUUM_DB_NAME);
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

      const db = this.mongo.client.db(process.env.CONTINUUM_DB_NAME);
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

  // DELETE /contracts/:id - Delete a contract (optional admin endpoint)
  fastify.delete(
    '/:id',
    async function (request, reply) {
      const { id } = request.params;

      try {
        const db = this.mongo.client.db(process.env.CONTINUUM_DB_NAME);
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
