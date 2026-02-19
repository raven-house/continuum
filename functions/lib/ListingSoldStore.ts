import type { Collection } from 'mongodb'
import DataStore from '../shared/DataStore.js'
import type { DBListingSold } from '../types.js'

export default class ListingSoldStore extends DataStore {
  /** @type {import('mongodb').Collection<import('mongodb').Document>} */
  #_collection: Collection<Document> | undefined

  /**
   * Bulk add Listing sold events.
   * @param {number[][]} rates An array of arrays as `[timestamp, rate]`.
   * @returns {Promise<void>}
   */
  async addEvents(events: DBListingSold[]) {
    const payload = events.map(
      ({
        token_id,
        nft_contract,
        buyer,
        seller,
        blockNumber,
        timestamp,
        price,
        offer_contract,
      }) => ({
        updateOne: {
          filter: {
            token_id,
            nft_contract,
            buyer,
            seller,
            blockNumber,
            price,
            offer_contract,
          },
          update: {
            $set: {
              token_id,
              nft_contract,
              buyer,
              seller,
              blockNumber,
              timestamp,
              price,
              offer_contract,
            },
          },
          upsert: true,
        },
      }),
    )
    await this.#collection.bulkWrite(payload)
  }

  get #collection() {
    return (this.#_collection ??= this._db.collection(
      this._getCollectionName('listing_sold'),
    ))
  }
}
