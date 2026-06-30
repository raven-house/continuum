/**
 * Collection Registry Routes
 *
 * Maintains the mapping of old-rollup NFT collection addresses → new-rollup addresses.
 * Collection owners register here after redeploying their contracts on the new rollup.
 * The POST /request_data endpoint uses this registry to resolve which old-rollup events
 * to look up when building attestations.
 *
 * Endpoints:
 *   POST /collections/register          - Register old→new collection address pair
 *   GET  /collections/:newAddress       - Look up registration by new collection address
 *   GET  /collections                   - List all registrations
 */

import schemas from './schemas.js';

const COLLECTION = 'collection_registry';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  // ─────────────────────────────────────────────────────────────
  // POST /collections/register
  // ─────────────────────────────────────────────────────────────
  fastify.post(
    '/register',
    { schema: schemas.register },
    async (request, reply) => {
      const {
        old_collection_address,
        old_network = 'devnet',
        new_collection_address,
        new_network = 'devnet',
        collection_name = ''
      } = request.body;

      if (!old_collection_address?.trim() || !new_collection_address?.trim()) {
        reply.badRequest(
          'old_collection_address and new_collection_address are required'
        );
        return;
      }

      const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);
      const col = db.collection(COLLECTION);

      const oldAddr = old_collection_address.toLowerCase();
      const newAddr = new_collection_address.toLowerCase();

      // Idempotent — return existing if the pair already registered
      const existing = await col.findOne({ new_collection_address: newAddr });
      if (existing) {
        return {
          success: true,
          id: existing._id.toString(),
          old_collection_address: existing.old_collection_address,
          new_collection_address: existing.new_collection_address,
          collection_name: existing.collection_name,
          isNew: false
        };
      }

      const now = new Date().toISOString();
      const result = await col.insertOne({
        old_collection_address: oldAddr,
        old_network,
        new_collection_address: newAddr,
        new_network,
        collection_name,
        registered_at: now
      });

      return {
        success: true,
        id: result.insertedId.toString(),
        old_collection_address: oldAddr,
        new_collection_address: newAddr,
        collection_name,
        isNew: true
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // GET /collections/:newAddress
  // ─────────────────────────────────────────────────────────────
  fastify.get(
    '/:newAddress',
    { schema: schemas.getByNewAddress },
    async (request, reply) => {
      const { newAddress } = request.params;

      const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);
      const col = db.collection(COLLECTION);

      const doc = await col.findOne({
        new_collection_address: newAddress.toLowerCase()
      });

      if (!doc) {
        return { found: false };
      }

      return {
        found: true,
        old_collection_address: doc.old_collection_address,
        new_collection_address: doc.new_collection_address,
        old_network: doc.old_network,
        new_network: doc.new_network,
        collection_name: doc.collection_name,
        registered_at: doc.registered_at
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // GET /collections
  // ─────────────────────────────────────────────────────────────
  fastify.get('/', { schema: schemas.list }, async request => {
    const { new_network, page = 1, limit = 20 } = request.query;

    const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);
    const col = db.collection(COLLECTION);

    const filter = new_network ? { new_network } : {};
    const total = await col.countDocuments(filter);
    const docs = await col
      .find(filter)
      .sort({ registered_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return {
      collections: docs.map(d => ({
        id: d._id.toString(),
        old_collection_address: d.old_collection_address,
        old_network: d.old_network,
        new_collection_address: d.new_collection_address,
        new_network: d.new_network,
        collection_name: d.collection_name,
        registered_at: d.registered_at
      })),
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit)
    };
  });
}
