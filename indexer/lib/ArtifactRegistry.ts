import { EventSelector } from '@aztec/aztec.js/abi'
import { mongodbConnection } from '../shared/mongodb'
import logger from '../shared/logger'

export type LoadedArtifact = {
  id: string
  name: string
  startBlock: number
  events: Record<string, { eventSelector: any; abiType: any; fieldNames: string[] }>
}

export class ArtifactRegistry {
  private network: string

  constructor(network: string) {
    this.network = network.toLowerCase()
  }

  async getEnabledArtifacts(): Promise<LoadedArtifact[]> {
    const db = mongodbConnection.getDb()
    const contractsCollection = db.collection('contracts')

    const docs = await contractsCollection.find({ enabled: true }).toArray()

    if (docs.length === 0) {
      logger.info('No enabled artifacts found in MongoDB')
      return []
    }

    const loaded: LoadedArtifact[] = []

    for (const doc of docs) {
      const startBlock: number = doc.start_block?.[this.network] ?? 0

      // Determine which events to index
      const eventFilter: string[] = doc.event_types ?? []
      const eventsToIndex = (doc.events ?? []).filter((e: any) =>
        eventFilter.length === 0 || eventFilter.includes(e.name)
      )

      if (eventsToIndex.length === 0) {
        logger.warn(`Artifact "${doc.artifact_id}" has no events to index after filtering`)
        continue
      }

      const events: LoadedArtifact['events'] = {}
      for (const event of eventsToIndex) {
        events[event.name] = {
          eventSelector: await EventSelector.fromSignature(event.signature),
          abiType: event.abiType,
          fieldNames: event.fieldNames,
        }
      }

      loaded.push({
        id: doc.artifact_id,
        name: doc.contractName,
        startBlock,
        events,
      })

      logger.info(
        `Loaded artifact "${doc.artifact_id}" from DB — events: [${Object.keys(events).join(', ')}], startBlock: ${startBlock}`
      )
    }

    return loaded
  }
}
