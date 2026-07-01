import { mergeMigrationManifest } from '../shared/migrationManifest.js';
import { computeMigrationCommitment, signMigrationClaim } from './attester.js';

const COLLECTION_REGISTRY_COLLECTION = 'collection_registry';
const CONTRACTS_COLLECTION = 'contracts';
const EVENTS_COLLECTION = 'events';

export class MigrationDataError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'MigrationDataError';
    this.statusCode = statusCode;
  }
}

/**
 *
 * @param fieldName
 */
function dataField(fieldName) {
  return `data.${fieldName}`;
}

/**
 *
 * @param event
 * @param fieldName
 */
function readEventData(event, fieldName) {
  return event?.data?.[fieldName];
}

/**
 *
 * @param db
 * @param registryDoc
 * @param oldCollectionAddress
 */
async function loadMigrationManifest(db, registryDoc, oldCollectionAddress) {
  const contracts = db.collection(CONTRACTS_COLLECTION);

  let contractDoc = null;
  if (registryDoc.artifact_id) {
    contractDoc = await contracts.findOne({
      artifact_id: registryDoc.artifact_id
    });
  }

  if (!contractDoc) {
    const oldNetwork = registryDoc.old_network;
    const addressQuery = [
      { 'migration.addresses': oldCollectionAddress },
      { 'migration.addresses': oldCollectionAddress.toLowerCase() }
    ];

    if (oldNetwork) {
      addressQuery.push({
        [`networks.${oldNetwork}.addresses`]: oldCollectionAddress
      });
      addressQuery.push({
        [`networks.${oldNetwork}.addresses`]: oldCollectionAddress.toLowerCase()
      });
    }

    contractDoc = await contracts.findOne({
      enabled: true,
      migration: { $exists: true },
      $or: addressQuery
    });
  }

  return mergeMigrationManifest(contractDoc?.migration);
}

/**
 *
 * @param root0
 * @param root0.manifest
 * @param root0.oldCollectionAddress
 * @param root0.commitment
 * @param root0.commitmentDecimal
 */
function buildRegistrationQuery({
  manifest,
  oldCollectionAddress,
  commitment,
  commitmentDecimal
}) {
  const registration = manifest.events.registration;
  const query = {
    event_type: registration.name,
    [dataField(registration.commitment)]: {
      $in: [commitment, commitmentDecimal]
    }
  };

  if (registration.source === 'continuum_registry') {
    if (registration.contract_address) {
      query.contract_address = registration.contract_address.toLowerCase();
    }
    if (registration.collection) {
      query[dataField(registration.collection)] = oldCollectionAddress;
    }
  } else {
    query.contract_address = oldCollectionAddress;
  }

  return query;
}

/**
 *
 * @param eventsCollection
 * @param manifest
 * @param oldCollectionAddress
 * @param owner
 */
async function getLatestTransferTokens(
  eventsCollection,
  manifest,
  oldCollectionAddress,
  owner
) {
  const transfer = manifest.events.transfer;
  const events = await eventsCollection
    .aggregate([
      {
        $match: {
          contract_address: oldCollectionAddress,
          event_type: transfer.name
        }
      },
      { $sort: { block_number: -1 } },
      {
        $group: {
          _id: `$${dataField(transfer.token_id)}`,
          latest_owner: { $first: `$${dataField(transfer.to)}` },
          block_number: { $first: '$block_number' }
        }
      },
      {
        $match: { latest_owner: owner }
      }
    ])
    .toArray();

  return events.map(e => e._id);
}

/**
 *
 * @param eventsCollection
 * @param manifest
 * @param registrationQuery
 */
async function getExplicitRegistrationTokens(
  eventsCollection,
  manifest,
  registrationQuery
) {
  const registration = manifest.events.registration;
  const registrations = await eventsCollection
    .find(registrationQuery)
    .toArray();
  return registrations.map(event =>
    readEventData(event, registration.token_id)
  );
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
  const manifest = await loadMigrationManifest(
    db,
    registryDoc,
    oldCollectionAddress
  );
  const commitment = computeCommitment(migration_secret);
  const commitmentDecimal = BigInt(commitment).toString();
  const eventsCollection = db.collection(EVENTS_COLLECTION);
  const registrationQuery = buildRegistrationQuery({
    manifest,
    oldCollectionAddress,
    commitment,
    commitmentDecimal
  });

  const registration = await eventsCollection.findOne(registrationQuery);

  if (!registration) {
    throw new MigrationDataError(
      404,
      'No on-chain migration registration found for this secret on collection ' +
        `${oldCollectionAddress}. The owner must call register_migration() on the ` +
        'old rollup with the matching commitment before requesting migration data.'
    );
  }

  const ownerField = manifest.events.registration.owner;
  const oldWalletAddress = String(
    readEventData(registration, ownerField)
  ).toLowerCase();

  const tokenIds =
    manifest.ownership_model === 'explicit_token_registration_event'
      ? await getExplicitRegistrationTokens(
          eventsCollection,
          manifest,
          registrationQuery
        )
      : await getLatestTransferTokens(
          eventsCollection,
          manifest,
          oldCollectionAddress,
          oldWalletAddress
        );

  const baseResponse = {
    old_wallet_address: oldWalletAddress,
    new_wallet_address,
    collection_address: newCollectionAddr,
    old_collection_address: oldCollectionAddress
  };

  if (tokenIds.length === 0) {
    return { ...baseResponse, tokens: [] };
  }

  const tokens = await Promise.all(
    tokenIds.map(async tokenId => {
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
