import { computeMigrationCommitment, signMigrationClaim } from './attester.js';

const COLLECTION_REGISTRY_COLLECTION = 'collection_registry';
const EVENTS_COLLECTION = 'events';

const REGISTRATION_EVENT = 'MigrationRegistered';
const TRANSFER_EVENT = 'Transfer';

export class MigrationDataError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'MigrationDataError';
    this.statusCode = statusCode;
  }
}

/**
 *
 * @param db
 * @param root0
 * @param root0.collection_address
 * @param root0.migration_secret
 * @param root0.new_wallet_address
 * @param deps
 */
export async function buildMigrationData(
  db,
  { collection_address, migration_secret, new_wallet_address },
  deps = {}
) {
  const computeCommitment =
    deps.computeMigrationCommitment || computeMigrationCommitment;
  const signClaim = deps.signMigrationClaim || signMigrationClaim;

  const newCollectionAddr = collection_address.toLowerCase();
  const registryDoc = await db
    .collection(COLLECTION_REGISTRY_COLLECTION)
    .findOne({ new_collection_address: newCollectionAddr });

  if (!registryDoc) {
    throw new MigrationDataError(
      404,
      `Collection ${collection_address} is not registered for migration. ` +
        'The collection owner must call POST /collections/register first.'
    );
  }

  const oldCollectionAddress = registryDoc.old_collection_address;
  const commitment = computeCommitment(migration_secret);
  const commitmentDecimal = BigInt(commitment).toString();

  const registration = await db.collection(EVENTS_COLLECTION).findOne({
    contract_address: oldCollectionAddress,
    event_type: REGISTRATION_EVENT,
    'data.migration_commitment': { $in: [commitment, commitmentDecimal] }
  });

  if (!registration) {
    throw new MigrationDataError(
      404,
      'No on-chain migration registration found for this secret on collection ' +
        `${oldCollectionAddress}. The owner must call register_migration() on the ` +
        'old rollup with the matching commitment before requesting migration data.'
    );
  }

  const oldWalletAddress = String(registration.data.owner).toLowerCase();

  const events = await db
    .collection(EVENTS_COLLECTION)
    .aggregate([
      {
        $match: {
          contract_address: oldCollectionAddress,
          event_type: TRANSFER_EVENT
        }
      },
      { $sort: { block_number: -1 } },
      {
        $group: {
          _id: '$data.token_id',
          latest_owner: { $first: '$data.to' },
          block_number: { $first: '$block_number' }
        }
      },
      {
        $match: { latest_owner: oldWalletAddress }
      }
    ])
    .toArray();

  const baseResponse = {
    old_wallet_address: oldWalletAddress,
    new_wallet_address,
    collection_address: newCollectionAddr,
    old_collection_address: oldCollectionAddress
  };

  if (events.length === 0) {
    return { ...baseResponse, tokens: [] };
  }

  const tokens = await Promise.all(
    events.map(async e => {
      const tokenId = e._id;
      const { signature, signatureBytes } = await signClaim(
        newCollectionAddr,
        new_wallet_address.toLowerCase(),
        BigInt(tokenId)
      );

      return {
        token_id: String(tokenId),
        signature,
        signature_bytes: signatureBytes
      };
    })
  );

  return { ...baseResponse, tokens };
}
