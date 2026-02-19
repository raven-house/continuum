import DataStore from '../shared/DataStore.js'
import type { DBNFTTransfer } from '../types.js'

export default class NFTTTransferStore extends DataStore {
  /** @type {import('mongodb').Collection<import('mongodb').Document>} */
  #_collection: any


  /**
   * Bulk add nft transfer events.
   * @param {number[][]} rates An array of arrays as `[timestamp, rate]`.
   * @returns {Promise<void>}
   */
  async addEvents(events: DBNFTTransfer[]) {
    const payload = events.map(({ token_id, nft_contract, from, to, blockNumber, timestamp }) => ({
      updateOne: {
        filter: { token_id, nft_contract, from, to, blockNumber },
        update: { $set: { token_id, nft_contract, from, to, blockNumber, timestamp } },
        upsert: true,
      },
    }))
    await this.#collection.bulkWrite(payload)
  }

  get #collection() {
    return (this.#_collection ??= this._db.collection(this._getCollectionName('nft_transfer')))
  }
}
