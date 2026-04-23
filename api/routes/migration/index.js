/**
 * Migration Key Routes
 *
 * Allows users to register a secret migration key tied to their wallet address.
 * When Aztec rolls out a new rollup, users can prove ownership of their old wallet
 * (and its NFTs) using this key, enabling state migration to the new rollup.
 *
 * Endpoints:
 *   POST /migration/register   - Create (or retrieve) a migration key for a wallet
 *   GET  /migration/:wallet    - Check if a wallet has a migration key (key masked)
 *   POST /migration/verify     - Resolve a secret key → wallet address (for new rollup claim)
 */

import { randomBytes } from 'crypto';
import schemas from './schemas.js';
import { createAttestation } from '../../lib/attester.js';

const COLLECTION = 'migration_keys';
const AZTEC_ADDRESS_PARAM = ':walletAddress(^0x[a-fA-F0-9]{64}$)';
const ZERO_ADDRESS = '0x' + '0'.repeat(64);
const EVENTS_COLLECTION = 'events';
const ARTIFACT_ID = process.env.CONTINUUM_NFT_ARTIFACT_ID ?? 'example-nft';
const EVENT_TYPE = 'NFTTransfer';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  fastify.get('/attestation', async (request, reply) => {
    const { address, contract } = request.query;

    if (!address) {
      return reply.badRequest('address query param is required');
    }

    const attesterSecret = process.env.ATTESTER_SECRET;
    if (!attesterSecret) {
      return reply.internalServerError('ATTESTER_SECRET env var is not configured');
    }

    const contractAddress = contract ?? process.env.MIGRATION_CONTRACT_ADDRESS;
    if (!contractAddress) {
      return reply.internalServerError(
        'contract query param or MIGRATION_CONTRACT_ADDRESS env var is required'
      );
    }

    const normalizedAddress = address.toLowerCase();

    const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);
    const col = db.collection(EVENTS_COLLECTION);

    const received = await col.countDocuments({
      artifact_id: ARTIFACT_ID,
      event_type: EVENT_TYPE,
      'data.to': normalizedAddress
    });

    const sent = await col.countDocuments({
      artifact_id: ARTIFACT_ID,
      event_type: EVENT_TYPE,
      $and: [
        { 'data.from': normalizedAddress },
        { 'data.from': { $ne: ZERO_ADDRESS } }
      ]
    });

    const balance = received - sent;

    if (balance <= 0) {
      return reply.notFound(
        `No migration data found for address ${address}. Received: ${received}, Sent: ${sent}`
      );
    }

    const attestation = await createAttestation(
      attesterSecret,
      contractAddress,
      normalizedAddress,
      balance
    );

    return {
      address: normalizedAddress,
      contractAddress,
      amount: balance,
      signature: attestation.signature,
      sigBytes: attestation.sigBytes,
      hash: attestation.hash,
      attestedAt: new Date().toISOString()
    };
  });

  // ─────────────────────────────────────────────────────────────
  // POST /migration/register
  // Body: { walletAddress: string, network?: string }
  // Creates a migration key if one doesn't exist yet; otherwise
  // returns the existing key so the call is idempotent.
  // ─────────────────────────────────────────────────────────────
  fastify.post(
    '/register',
    { schema: schemas.register },
    async (request, reply) => {
      const { walletAddress, network = 'devnet' } = request.body;

      if (!walletAddress || walletAddress.trim() === '') {
        reply.badRequest('walletAddress is required');
        return;
      }

      const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);
      const col = db.collection(COLLECTION);

      // Idempotent: return existing key if already registered
      const existing = await col.findOne({
        walletAddress: walletAddress.toLowerCase()
      });
      if (existing) {
        return {
          success: true,
          secretKey: existing.secretKey,
          walletAddress: existing.walletAddress,
          network: existing.network,
          createdAt: existing.createdAt,
          isNew: false
        };
      }

      // Generate a cryptographically random 32-byte secret key (hex)
      const secretKey = randomBytes(32).toString('hex');
      const now = new Date().toISOString();

      await col.insertOne({
        walletAddress: walletAddress.toLowerCase(),
        secretKey,
        network,
        createdAt: now,
        updatedAt: now
      });

      return {
        success: true,
        secretKey,
        walletAddress: walletAddress.toLowerCase(),
        network,
        createdAt: now,
        isNew: true
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // GET /migration/:walletAddress
  // Returns whether a key exists for the wallet (key is masked).
  // ─────────────────────────────────────────────────────────────
  fastify.get(
    `/${AZTEC_ADDRESS_PARAM}`,
    { schema: schemas.getByWallet },
    async request => {
      const { walletAddress } = request.params;

      const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);
      const col = db.collection(COLLECTION);

      const doc = await col.findOne(
        { walletAddress: walletAddress.toLowerCase() },
        {
          projection: {
            secretKey: 1,
            network: 1,
            createdAt: 1,
            walletAddress: 1
          }
        }
      );

      if (!doc) {
        return { hasKey: false, walletAddress: walletAddress.toLowerCase() };
      }

      return {
        hasKey: true,
        walletAddress: doc.walletAddress,
        maskedKey: `${doc.secretKey.slice(0, 8)}...`,
        network: doc.network,
        createdAt: doc.createdAt
      };
    }
  );

  fastify.post(
    '/recover',
    { schema: schemas.recover },
    async (request, reply) => {
      const { secretKey } = request.body;

      const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);

      const migrationKey = await db
        .collection(COLLECTION)
        .findOne(
          { secretKey },
          { projection: { walletAddress: 1, network: 1 } }
        );

      if (!migrationKey) {
        reply.notFound('No migration key found for the provided secret key');
        return;
      }

      const { walletAddress, network } = migrationKey;

      const events = await db
        .collection('events')
        .find({
          $or: [
            { 'data.owner': walletAddress },
            { 'data.to': walletAddress },
            { 'data.from': walletAddress },
            { 'data.seller': walletAddress },
            { 'data.buyer': walletAddress },
            { 'data.claimer': walletAddress }
          ]
        })
        .sort({ block_number: -1 })
        .toArray();

      return {
        valid: true,
        walletAddress,
        network,
        events: events.map(e => ({
          ...e,
          _id: e._id.toString()
        }))
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // POST /migration/verify
  // Body: { secretKey: string }
  // Used by the new rollup / admin flow to resolve a key → wallet.
  // Returns the full wallet address so migration can be processed.
  // ─────────────────────────────────────────────────────────────
  fastify.post('/verify', { schema: schemas.verify }, async request => {
    const { secretKey } = request.body;

    const db = fastify.mongo.client.db(process.env.CONTINUUM_DB_NAME);
    const col = db.collection(COLLECTION);

    const doc = await col.findOne(
      { secretKey },
      { projection: { walletAddress: 1, network: 1, createdAt: 1 } }
    );

    if (!doc) {
      return { valid: false };
    }

    return {
      valid: true,
      walletAddress: doc.walletAddress,
      network: doc.network,
      createdAt: doc.createdAt
    };
  });
}
