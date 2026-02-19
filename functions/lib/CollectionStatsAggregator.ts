import { Db } from 'mongodb'
import { mongodbConnection } from '../shared/mongodb'
import logger from '../shared/logger'

interface CollectionStats {
  contract_address: string
  total_sales: number
  total_volume: number
  listed_count: number
  floor_price: number
  owner_count: number
  total_supply: number
}

const HISTORY_RETENTION_DAYS = 31

export class CollectionStatsAggregator {
  #db: Db | null = null
  #mode: string

  constructor(mode: string) {
    this.#mode = mode
  }

  private get _db(): Db {
    if (!this.#db) {
      this.#db = mongodbConnection.getDb()
    }
    return this.#db
  }

  private _getCollectionName(name: string) {
    return this.#mode === 'TESTNET'
      ? `${name}_testnet`
      : this.#mode === 'DEVNET'
        ? `${name}_devnet`
        : `${name}_sandbox`
  }

  /**
   * Clean up old historical data beyond retention period
   */
  private async cleanupOldHistory() {
    const historyColl = this._db.collection(
      this._getCollectionName('collection_stats_history'),
    )
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - HISTORY_RETENTION_DAYS)

    const result = await historyColl.deleteMany({
      timestamp: { $lt: cutoffDate },
    })

    if (result.deletedCount > 0) {
      logger.info(
        `Cleaned up ${result.deletedCount} old history records for ${this.#mode}`,
      )
    }
  }

  /**
   * Save a historical snapshot of the current stats
   * Only saves if there's meaningful change or enough time has passed
   */
  private async saveHistoricalSnapshot(stats: Map<string, CollectionStats>) {
    const historyColl = this._db.collection(
      this._getCollectionName('collection_stats_history'),
    )
    const now = new Date()

    const historyDocs = Array.from(stats.values())
      .filter(
        (stat) =>
          stat.floor_price > 0 ||
          stat.listed_count > 0 ||
          stat.total_sales > 0 ||
          stat.total_supply > 0,
      )
      .map((stat) => ({
        contract_address: stat.contract_address,
        floor_price: stat.floor_price,
        total_volume: stat.total_volume,
        total_sales: stat.total_sales,
        listed_count: stat.listed_count,
        owner_count: stat.owner_count,
        total_supply: stat.total_supply,
        timestamp: now,
      }))

    if (historyDocs.length > 0) {
      await historyColl.insertMany(historyDocs)
      logger.info(
        `Saved ${historyDocs.length} historical snapshots for ${this.#mode}`,
      )
    }
  }

  async aggregateAndSave() {
    logger.info(`Starting collection stats aggregation for mode: ${this.#mode}`)

    try {
      const listingCreatedColl = this._db.collection(
        this._getCollectionName('listing_created'),
      )
      const listingSoldColl = this._db.collection(
        this._getCollectionName('listing_sold'),
      )
      const statsColl = this._db.collection(
        this._getCollectionName('collection_stats'),
      )

      const metadataUpdateColl = this._db.collection(
        this._getCollectionName('metadata_update'),
      )

      // 1. Calculate Volume and Sales Count from ListingSold
      const salesStats = await listingSoldColl
        .aggregate([
          {
            $group: {
              _id: '$nft_contract',
              total_sales: { $sum: 1 },
              total_volume: { $sum: { $toDouble: '$price' } },
            },
          },
        ])
        .toArray()

      const latestOwnershipFromMetadata = await metadataUpdateColl
        .aggregate([
          { $sort: { blockNumber: -1 } },
          {
            $group: {
              _id: { contract: '$nft_contract', token: '$token_id' },
              current_owner: { $first: '$owner' },
              latest_block: { $first: '$blockNumber' },
            },
          },
        ])
        .toArray()

      // For listed tokens, the seller is the actual owner (not escrow)
      const activeListingsForOwnership = await listingCreatedColl
        .aggregate([
          {
            $lookup: {
              from: this._getCollectionName('listing_sold'),
              let: {
                contract: '$nft_contract',
                token: '$token_id',
                created_block: '$blockNumber',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$nft_contract', '$$contract'] },
                        { $eq: ['$token_id', '$$token'] },
                        { $gt: ['$blockNumber', '$$created_block'] },
                      ],
                    },
                  },
                },
              ],
              as: 'sold_events',
            },
          },
          {
            $lookup: {
              from: this._getCollectionName('listing_cancelled'),
              let: {
                contract: '$nft_contract',
                token: '$token_id',
                created_block: '$blockNumber',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$nft_contract', '$$contract'] },
                        { $eq: ['$token_id', '$$token'] },
                        { $gt: ['$blockNumber', '$$created_block'] },
                      ],
                    },
                  },
                },
              ],
              as: 'cancelled_events',
            },
          },
          {
            $match: {
              sold_events: { $size: 0 },
              cancelled_events: { $size: 0 },
            },
          },
          {
            $project: {
              nft_contract: 1,
              token_id: 1,
              seller: 1,
            },
          },
        ])
        .toArray()

      const activeListingsMap = new Map<string, string>()
      activeListingsForOwnership.forEach((listing) => {
        const key = `${listing.nft_contract}:${listing.token_id}`
        activeListingsMap.set(key, listing.seller)
      })

      const ownershipByContract = new Map<
        string,
        { tokens: Set<number>; owners: Set<string> }
      >()

      latestOwnershipFromMetadata.forEach((item) => {
        const contract = item._id.contract
        const tokenId = item._id.token
        const listingKey = `${contract}:${tokenId}`

        const actualOwner = activeListingsMap.has(listingKey)
          ? activeListingsMap.get(listingKey)!
          : item.current_owner

        if (!ownershipByContract.has(contract)) {
          ownershipByContract.set(contract, {
            tokens: new Set(),
            owners: new Set(),
          })
        }

        const contractData = ownershipByContract.get(contract)!
        contractData.tokens.add(tokenId)
        contractData.owners.add(actualOwner)
      })

      const ownershipStats = Array.from(ownershipByContract.entries()).map(
        ([contract, data]) => ({
          _id: contract,
          total_supply: data.tokens.size,
          owner_count: data.owners.size,
        }),
      )

      // 2. Calculate Active Listings (Floor Price & Listed Count)
      // We look at all created listings and exclude those that were subsequently sold or cancelled
      // Note: This is a simplified approach. Ideally, we filter by token_id state.
      // For precision, we group all events by token_id to find the "latest" state.
      const activeListings = await listingCreatedColl
        .aggregate([
          {
            $lookup: {
              from: this._getCollectionName('listing_sold'),
              let: {
                contract: '$nft_contract',
                token: '$token_id',
                created_block: '$blockNumber',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$nft_contract', '$$contract'] },
                        { $eq: ['$token_id', '$$token'] },
                        { $gt: ['$blockNumber', '$$created_block'] },
                      ],
                    },
                  },
                },
              ],
              as: 'sold_events',
            },
          },
          {
            $lookup: {
              from: this._getCollectionName('listing_cancelled'),
              let: {
                contract: '$nft_contract',
                token: '$token_id',
                created_block: '$blockNumber',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$nft_contract', '$$contract'] },
                        { $eq: ['$token_id', '$$token'] },
                        { $gt: ['$blockNumber', '$$created_block'] },
                      ],
                    },
                  },
                },
              ],
              as: 'cancelled_events',
            },
          },
          {
            // Keep only listings that haven't been sold or cancelled AFTER creation
            $match: {
              sold_events: { $size: 0 },
              cancelled_events: { $size: 0 },
            },
          },
          {
            $group: {
              _id: '$nft_contract',
              listed_count: { $sum: 1 },
              floor_price: { $min: { $toDouble: '$price' } },
            },
          },
        ])
        .toArray()

      // 3. Merge Data
      const combinedStats = new Map<string, CollectionStats>()

      salesStats.forEach((stat) => {
        combinedStats.set(stat._id, {
          contract_address: stat._id,
          total_sales: stat.total_sales,
          total_volume: stat.total_volume,
          listed_count: 0,
          floor_price: 0,
          owner_count: 0,
          total_supply: 0,
        })
      })

      activeListings.forEach((stat) => {
        const existing = combinedStats.get(stat._id) || {
          contract_address: stat._id,
          total_sales: 0,
          total_volume: 0,
          listed_count: 0,
          floor_price: 0,
          owner_count: 0,
          total_supply: 0,
        }

        combinedStats.set(stat._id, {
          ...existing,
          listed_count: stat.listed_count,
          floor_price: stat.floor_price,
        })
      })

      ownershipStats.forEach((stat) => {
        const existing = combinedStats.get(stat._id) || {
          contract_address: stat._id,
          total_sales: 0,
          total_volume: 0,
          listed_count: 0,
          floor_price: 0,
          owner_count: 0,
          total_supply: 0,
        }

        combinedStats.set(stat._id, {
          ...existing,
          total_supply: stat.total_supply,
          owner_count: stat.owner_count,
        })
      })

      // 4. Bulk Write to DB
      const bulkOps = Array.from(combinedStats.values()).map((stat) => ({
        updateOne: {
          filter: { contract_address: stat.contract_address },
          update: {
            $set: {
              ...stat,
              updated_at: new Date(),
            },
          },
          upsert: true,
        },
      }))

      if (bulkOps.length > 0) {
        await statsColl.bulkWrite(bulkOps)
        logger.info(
          `Updated stats for ${bulkOps.length} collections in ${this.#mode}`,
        )

        // Save historical snapshot for time-series queries
        await this.saveHistoricalSnapshot(combinedStats)

        // Cleanup old history data to prevent unbounded growth
        await this.cleanupOldHistory()
      } else {
        logger.info(`No collection stats to update for ${this.#mode}`)
      }
    } catch (error) {
      logger.error(`Error aggregating stats for ${this.#mode}: ${error}`)
      throw error
    }
  }
}
