import DataStore from '../shared/DataStore.js'
import type { DBListingCancelled } from '../types.js'

export default class ListingCancelledStore extends DataStore {
  /** @type {import('mongodb').Collection<import('mongodb').Document>} */
  #_collection: any;

  /**
   * Bulk add Listing cancelled events.
   * @param {number[][]} rates An array of arrays as `[timestamp, rate]`.
   * @returns {Promise<void>}
   */
  async addEvents(events: DBListingCancelled[]) {
    const payload = events.map(({ token_id, seller, nft_contract, offer_contract, blockNumber, timestamp }) => ({
      updateOne: {
        filter: { token_id, seller, nft_contract, offer_contract, blockNumber },
        update: { $set: { token_id, seller, nft_contract, offer_contract, blockNumber, timestamp } },
        upsert: true,
      },
    }))
    await this.#collection.bulkWrite(payload)
  }

  get #collection() {
    return (this.#_collection ??= this._db.collection(this._getCollectionName('listing_cancelled')))
  }
}
