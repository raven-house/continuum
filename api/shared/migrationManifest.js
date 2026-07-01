export const DEFAULT_MIGRATION_MANIFEST = Object.freeze({
  type: 'nft',
  ownership_model: 'latest_transfer_event',
  addresses: [],
  events: {
    transfer: {
      name: 'Transfer',
      token_id: 'token_id',
      from: 'from',
      to: 'to'
    },
    registration: {
      source: 'contract_event',
      name: 'MigrationRegistered',
      owner: 'owner',
      token_id: 'token_id',
      commitment: 'migration_commitment'
    }
  },
  claim: {
    domain: '0x4e46544d',
    attestation_fields: [
      'domain',
      'source_rollup_id',
      'old_collection_address',
      'old_registry_address',
      'new_collection_address',
      'new_wallet_address',
      'token_id',
      'migration_commitment',
      'migration_epoch'
    ]
  }
});

/**
 * Merge a user-provided migration manifest with the Continuum defaults.
 * @param {object} [migration] - Partial migration manifest from the caller.
 * @returns {object} - Complete manifest with defaults filled in.
 */
export function mergeMigrationManifest(migration = {}) {
  return {
    ...DEFAULT_MIGRATION_MANIFEST,
    ...migration,
    addresses: migration.addresses ?? DEFAULT_MIGRATION_MANIFEST.addresses,
    events: {
      transfer: {
        ...DEFAULT_MIGRATION_MANIFEST.events.transfer,
        ...(migration.events?.transfer ?? {})
      },
      registration: {
        ...DEFAULT_MIGRATION_MANIFEST.events.registration,
        ...(migration.events?.registration ?? {})
      }
    },
    claim: {
      ...DEFAULT_MIGRATION_MANIFEST.claim,
      ...(migration.claim ?? {})
    }
  };
}
