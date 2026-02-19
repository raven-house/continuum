import { createClient } from '@supabase/supabase-js';
import { MongoClient } from 'mongodb';
import * as readline from 'readline';

const MONGODB_COLLECTION_NAMES = [
  'listing_created',
  'listing_sold',
  'listing_cancelled',
  'nft_transfer',
  'offer_created',
  'offer_accepted',
  'offer_cancelled',
  'metadata_update',
  'voucher_claimed',
  'collection_stats',
  'collection_stats_history'
];

const MODE_SUFFIXES = ['_testnet', '_devnet', '_sandbox'];

const CUTOFF_DATE = '2026-01-01T00:00:00.000Z';

// Bulk safety phrase
const BULK_CONFIRMATION_PHRASE = 'DELETE ALL COLLECTIONS';

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Confirm deletion based on mode (Single vs Bulk)
 */
async function confirmDeletion(collections, isSingleTarget) {
  const count = collections.length;
  console.log('\n========================================');
  console.log('⚠️  DANGER ZONE - DESTRUCTIVE OPERATION ⚠️');
  console.log('========================================');

  if (isSingleTarget) {
    const target = collections[0];
    console.log(`\nYou are about to permanently delete the collection:`);
    console.log(`Name: ${target.name}`);
    console.log(`Collection ID: ${target.collection_id}`);
    console.log('\nThis action CANNOT be undone!');
    
    // For single deletion, we ask them to type the collection_id to confirm
    console.log(`\nTo proceed, type the Collection ID exactly: ${target.collection_id}`);
    const answer = await askQuestion('> ');
    
    // Loose comparison (==) allows string input to match number ID if needed
    // But strict string comparison is safer if we convert both to strings
    if (String(answer).trim() !== String(target.collection_id)) {
      console.log('\n❌ Collection ID did not match. Aborting.\n');
      return false;
    }
    return true;

  } else {
    // Original Bulk Logic
    console.log(
      `\nYou are about to permanently delete ${count} collection(s).`
    );
    console.log('This action CANNOT be undone!\n');
    console.log('To proceed, type exactly: ' + BULK_CONFIRMATION_PHRASE);
    
    const answer = await askQuestion('> ');

    if (answer !== BULK_CONFIRMATION_PHRASE) {
      console.log('\n❌ Confirmation phrase did not match. Aborting.\n');
      return false;
    }

    // Second confirmation with count
    console.log(
      `\nFinal confirmation: Type the number of collections to delete: ${count}`
    );
    const countAnswer = await askQuestion('> ');

    if (countAnswer !== String(count)) {
      console.log('\n❌ Count did not match. Aborting.\n');
      return false;
    }
    return true;
  }
}

function getSupabaseClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment'
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function getMongoClient() {
  const { RH_DB_CONNECTION_STRING } = process.env;

  if (!RH_DB_CONNECTION_STRING) {
    throw new Error('RH_DB_CONNECTION_STRING must be set in environment');
  }

  const client = new MongoClient(RH_DB_CONNECTION_STRING);
  await client.connect();
  return client;
}

/**
 * Fetch collections based on arguments.
 * If targetId is provided, fetch specific collection_id.
 */
async function getCollectionsToDelete(supabase, targetId = null) {
  let query = supabase
    .from('aztec_nft_collections')
    .select('collection_id, contract_address, name, is_featured, created_at');

  if (targetId) {
    console.log('\n========================================');
    console.log(`Fetching specific collection_id: ${targetId}...`);
    console.log('========================================\n');
    
    query = query.eq('collection_id', targetId);
  } else {
    console.log('\n========================================');
    console.log('Fetching old collections to delete (BULK MODE)...');
    console.log(`Cutoff date: ${CUTOFF_DATE}`);
    console.log('Excluding: featured collections AND collections created ON OR AFTER cutoff date');
    console.log('========================================\n');

    query = query
      .eq('is_featured', false)
      .lt('created_at', CUTOFF_DATE);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch collections: ${error.message}`);
  }

  if (targetId && (!data || data.length === 0)) {
    throw new Error(`Collection with ID ${targetId} not found in Supabase.`);
  }

  return data || [];
}

async function deleteFromSupabase(supabase, collectionId) {
  console.log(`\n  [Supabase] Deleting data for collection_id: ${collectionId}`);

  // Delete in order to respect foreign key constraints
  const tables = [
    'aztec_discord_server_collections',
    'rh_whitelist_addresses',
    'rh_nft_upload_tasks',
    'rh_feature_requests',
    'aztec_nfts',
    'aztec_nft_collections'
  ];

  for (const table of tables) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('collection_id', collectionId);

    if (error) {
      console.error(`    [${table}] Error: ${error.message}`);
    } else {
      console.log(`    [${table}] Deleted ${count || 0} rows`);
    }
  }
}

async function deleteFromMongoDB(db, contractAddress) {
  console.log(`\n  [MongoDB] Deleting events for contract: ${contractAddress}`);

  let totalDeleted = 0;

  // Stats collections use 'contract_address' field, others use 'nft_contract'
  const STATS_COLLECTIONS = ['collection_stats', 'collection_stats_history'];

  for (const baseName of MONGODB_COLLECTION_NAMES) {
    for (const suffix of MODE_SUFFIXES) {
      const collectionName = `${baseName}${suffix}`;

      try {
        const collection = db.collection(collectionName);

        // Use the correct field name based on collection type
        const fieldName = STATS_COLLECTIONS.includes(baseName)
          ? 'contract_address'
          : 'nft_contract';

        const result = await collection.deleteMany({
          [fieldName]: contractAddress
        });

        if (result.deletedCount > 0) {
          console.log(
            `    [${collectionName}] Deleted ${result.deletedCount} documents`
          );
          totalDeleted += result.deletedCount;
        }
      } catch (error) {
        console.error(`    [${collectionName}] Error: ${error}`);
      }
    }
  }

  if (totalDeleted === 0) {
    console.log(`    No documents found for this contract address`);
  }

  return totalDeleted;
}

// Simple arg parser to get value of --id
function getArgValue(argName) {
  const index = process.argv.indexOf(argName);
  if (index > -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const forceFlag = process.argv.includes('--force');
  const targetId = getArgValue('--id'); // This captures the collection_id

  // Safety check for env var
  if (!dryRun && process.env.ALLOW_DESTRUCTIVE_OPERATIONS !== 'true') {
    console.log('\n========================================');
    console.log('🛑 SAFETY CHECK FAILED');
    console.log('========================================');
    console.log('\nThis script requires the environment variable:');
    console.log('  ALLOW_DESTRUCTIVE_OPERATIONS=true');
    console.log('\nOr use --dry-run to preview what would be deleted:');
    console.log('  bun run delete:collections:dry-run');
    console.log('========================================\n');
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No data will be deleted\n');
  }

  console.log('========================================');
  console.log('Collection Cleanup Script');
  console.log('========================================');

  let mongoClient = null;

  try {
    // Connect to databases
    const supabase = getSupabaseClient();
    mongoClient = await getMongoClient();
    const db = mongoClient.db(process.env.RH_DB_NAME);

    // Get collections to delete (either specific ID or bulk list)
    const collections = await getCollectionsToDelete(supabase, targetId);

    if (collections.length === 0) {
      console.log('✅ No collections found to delete!');
      return;
    }

    console.log(`Found ${collections.length} collection(s) to delete:\n`);

    for (const collection of collections) {
      console.log(`  - ${collection.name} (ID: ${collection.collection_id})`);
      console.log(`    Contract: ${collection.contract_address || 'N/A'}`);
      console.log(`    Created: ${collection.created_at}`);
    }

    if (dryRun) {
      console.log('\n🔍 DRY RUN - Skipping actual deletion');
      return;
    }

    // Interactive confirmation
    if (!forceFlag) {
      const confirmed = await confirmDeletion(collections, !!targetId);
      if (!confirmed) {
        process.exit(1);
      }
    } else {
      console.log(
        '\n⚠️  --force flag detected, skipping interactive confirmation...'
      );
    }

    // Proceed with deletion
    console.log('\n========================================');
    console.log(
      `🗑️  Proceeding to delete ${collections.length} collection(s)...`
    );
    console.log('========================================\n');

    let successCount = 0;
    let errorCount = 0;

    for (const collection of collections) {
      console.log(`\n----------------------------------------`);
      console.log(
        `Processing: ${collection.name} (ID: ${collection.collection_id})`
      );
      console.log(`----------------------------------------`);

      try {
        // Delete from Supabase
        await deleteFromSupabase(supabase, collection.collection_id);

        // Delete from MongoDB if contract address exists
        if (collection.contract_address) {
          await deleteFromMongoDB(db, collection.contract_address);
        } else {
          console.log(`\n  [MongoDB] Skipping - no contract address`);
        }

        successCount++;
        console.log(`\n  Successfully deleted collection: ${collection.name}`);
      } catch (error) {
        errorCount++;
        console.error(`\n  Error deleting collection: ${collection.name}`);
        console.error(`     ${error}`);
      }
    }

    console.log('\n========================================');
    console.log('✅ Cleanup Summary');
    console.log('========================================');
    console.log(`  Total collections processed: ${collections.length}`);
    console.log(`  Successful deletions: ${successCount}`);
    console.log(`  Failed deletions: ${errorCount}`);
    console.log('========================================\n');

    if (errorCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

main();
