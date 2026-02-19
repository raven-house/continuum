import DataStore from '../shared/DataStore.js'
import type { DBMetadataUpdate } from '../types.js'

export default class MetadataUpdateStore extends DataStore {
  /** @type {import('mongodb').Collection<import('mongodb').Document>} */
  #_collection: any

  /**
   * Bulk add metadata update events.
   * @param {number[][]} rates An array of arrays as `[timestamp, rate]`.
   * @returns {Promise<void>}
   */
  async addEvents(events: DBMetadataUpdate[]) {
    const payload = events.map(({ token_id, owner, blockNumber, timestamp, nft_contract }) => ({
      updateOne: {
        filter: { token_id, owner, blockNumber, nft_contract },
        update: {
          $set: { token_id, owner, blockNumber, timestamp, nft_contract },
        },
        upsert: true,
      },
    }))
    await this.#collection.bulkWrite(payload)
  }

  get #collection() {
    return (this.#_collection ??= this._db.collection(this._getCollectionName('metadata_update')))
  }
}
