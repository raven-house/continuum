import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMigrationData,
  MigrationDataError
} from '../services/migrationData.js';

/**
 *
 * @param root0
 * @param root0.registryDoc
 * @param root0.contractDoc
 * @param root0.registrationDoc
 * @param root0.registrationDocs
 * @param root0.ownedTokens
 */
function createDb({
  registryDoc,
  contractDoc = null,
  registrationDoc,
  registrationDocs = [],
  ownedTokens = []
}) {
  const calls = {
    registryFind: [],
    contractFind: [],
    eventFind: [],
    eventFindMany: [],
    aggregate: []
  };

  return {
    calls,
    collection(name) {
      if (name === 'collection_registry') {
        return {
          async findOne(query) {
            calls.registryFind.push(query);
            return registryDoc;
          }
        };
      }

      if (name === 'contracts') {
        return {
          async findOne(query) {
            calls.contractFind.push(query);
            return contractDoc;
          }
        };
      }

      if (name === 'events') {
        return {
          async findOne(query) {
            calls.eventFind.push(query);
            return registrationDoc;
          },
          find(query) {
            calls.eventFindMany.push(query);
            return {
              async toArray() {
                return registrationDocs;
              }
            };
          },
          aggregate(pipeline) {
            calls.aggregate.push(pipeline);
            return {
              async toArray() {
                return ownedTokens;
              }
            };
          }
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    }
  };
}

test('buildMigrationData returns signed token claims for the verified old owner', async () => {
  const db = createDb({
    registryDoc: {
      old_collection_address: '0xold'
    },
    registrationDoc: {
      data: {
        owner: '0xOWNER'
      }
    },
    ownedTokens: [{ _id: '7' }, { _id: '42' }]
  });

  const signed = [];
  const result = await buildMigrationData(
    db,
    {
      collection_address: '0xNEW',
      migration_secret: '0xsecret',
      new_wallet_address: '0xWALLET'
    },
    {
      computeMigrationCommitment: secret => {
        assert.equal(secret, '0xsecret');
        return '0x0a';
      },
      signMigrationClaim: async (collection, wallet, tokenId) => {
        signed.push({ collection, wallet, tokenId });
        return {
          signature: `0xsig${tokenId}`,
          signatureBytes: [Number(tokenId)]
        };
      }
    }
  );

  assert.deepEqual(db.calls.registryFind, [
    { new_collection_address: '0xnew' }
  ]);
  assert.equal(db.calls.contractFind.length, 1);
  assert.deepEqual(db.calls.eventFind, [
    {
      contract_address: '0xold',
      event_type: 'MigrationRegistered',
      'data.migration_commitment': { $in: ['0x0a', '10'] }
    }
  ]);
  assert.equal(db.calls.aggregate[0][0].$match.contract_address, '0xold');
  assert.equal(db.calls.aggregate[0][3].$match.latest_owner, '0xowner');
  assert.deepEqual(signed, [
    { collection: '0xnew', wallet: '0xwallet', tokenId: 7n },
    { collection: '0xnew', wallet: '0xwallet', tokenId: 42n }
  ]);
  assert.deepEqual(result, {
    old_wallet_address: '0xowner',
    new_wallet_address: '0xWALLET',
    collection_address: '0xnew',
    old_collection_address: '0xold',
    tokens: [
      {
        token_id: '7',
        signature: '0xsig7',
        signature_bytes: [7]
      },
      {
        token_id: '42',
        signature: '0xsig42',
        signature_bytes: [42]
      }
    ]
  });
});

test('buildMigrationData uses custom manifest event and field mappings', async () => {
  const db = createDb({
    registryDoc: {
      old_collection_address: '0xold',
      artifact_id: 'custom-nft'
    },
    contractDoc: {
      migration: {
        events: {
          transfer: {
            name: 'OwnerChanged',
            token_id: 'id',
            to: 'recipient'
          },
          registration: {
            name: 'ReadyToMigrate',
            owner: 'account',
            commitment: 'commitment'
          }
        }
      }
    },
    registrationDoc: {
      data: {
        account: '0xOWNER'
      }
    },
    ownedTokens: [{ _id: '9' }]
  });

  const result = await buildMigrationData(
    db,
    {
      collection_address: '0xNEW',
      migration_secret: '0xsecret',
      new_wallet_address: '0xWALLET'
    },
    {
      computeMigrationCommitment: () => '0x0b',
      signMigrationClaim: async () => ({
        signature: '0xsig',
        signatureBytes: [9]
      })
    }
  );

  assert.deepEqual(db.calls.contractFind, [{ artifact_id: 'custom-nft' }]);
  assert.deepEqual(db.calls.eventFind, [
    {
      contract_address: '0xold',
      event_type: 'ReadyToMigrate',
      'data.commitment': { $in: ['0x0b', '11'] }
    }
  ]);
  assert.equal(db.calls.aggregate[0][0].$match.event_type, 'OwnerChanged');
  assert.equal(db.calls.aggregate[0][2].$group._id, '$data.id');
  assert.equal(db.calls.aggregate[0][2].$group.latest_owner.$first, '$data.recipient');
  assert.equal(result.tokens[0].token_id, '9');
});

test('buildMigrationData supports explicit token registration manifests', async () => {
  const db = createDb({
    registryDoc: {
      old_collection_address: '0xold',
      artifact_id: 'private-nft'
    },
    contractDoc: {
      migration: {
        ownership_model: 'explicit_token_registration_event',
        events: {
          registration: {
            name: 'NFTMigrationRegistered',
            owner: 'owner',
            token_id: 'token_id',
            commitment: 'migration_commitment'
          }
        }
      }
    },
    registrationDoc: {
      data: {
        owner: '0xOWNER',
        token_id: '7'
      }
    },
    registrationDocs: [
      {
        data: {
          owner: '0xOWNER',
          token_id: '7'
        }
      },
      {
        data: {
          owner: '0xOWNER',
          token_id: '42'
        }
      }
    ]
  });

  const result = await buildMigrationData(
    db,
    {
      collection_address: '0xNEW',
      migration_secret: '0xsecret',
      new_wallet_address: '0xWALLET'
    },
    {
      computeMigrationCommitment: () => '0x0c',
      signMigrationClaim: async (_collection, _wallet, tokenId) => ({
        signature: `0xsig${tokenId}`,
        signatureBytes: [Number(tokenId)]
      })
    }
  );

  assert.deepEqual(db.calls.eventFindMany, [
    {
      contract_address: '0xold',
      event_type: 'NFTMigrationRegistered',
      'data.migration_commitment': { $in: ['0x0c', '12'] }
    }
  ]);
  assert.deepEqual(db.calls.aggregate, []);
  assert.deepEqual(
    result.tokens.map(t => t.token_id),
    ['7', '42']
  );
});

test('buildMigrationData fails when collection is not registered', async () => {
  const db = createDb({
    registryDoc: null,
    registrationDoc: null
  });

  await assert.rejects(
    () =>
      buildMigrationData(
        db,
        {
          collection_address: '0xnew',
          migration_secret: '0xsecret',
          new_wallet_address: '0xwallet'
        },
        {
          computeMigrationCommitment: () => '0x0a',
          signMigrationClaim: async () => ({
            signature: '0xsig',
            signatureBytes: []
          })
        }
      ),
    error =>
      error instanceof MigrationDataError &&
      error.statusCode === 404 &&
      error.message.includes('not registered')
  );
});
