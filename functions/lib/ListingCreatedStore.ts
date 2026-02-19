import DataStore from '../shared/DataStore.js'
import type { DBListingCreated } from '../types.js'

export default class ListingCreatedStore extends DataStore {
  /** @type {import('mongodb').Collection<import('mongodb').Document>} */
  #_collection: any
  /**
   * Bulk add Listing created events.
   * @param {number[][]} rates An array of arrays as `[timestamp, rate]`.
   * @returns {Promise<void>}
   */
  async addEvents(events: DBListingCreated[]) {
    const payload = events.map(({ token_id, nft_contract, price, seller, blockNumber, timestamp, offer_contract }) => ({
      updateOne: {
        filter: { blockNumber, token_id, nft_contract, price, seller },
        update: { $set: { token_id, nft_contract, price, seller, blockNumber, timestamp, offer_contract } },
        upsert: true,
      },
    }))
    await this.#collection.bulkWrite(payload)
  }

  get #collection() {
    return (this.#_collection ??= this._db.collection(this._getCollectionName('listing_created')))
  }
}
