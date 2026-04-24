import { readFileSync } from 'fs'
import path from 'path'
import logger from '../shared/logger'

// Shape of one entry in artifacts.json
type ArtifactConfig = {
  id: string
  name: string
  description?: string
  artifact_path: string
  addresses: Record<string, string>
  enabled: boolean
  event_types: string[]
  start_block: Record<string, number>
}

// What the indexer receives — one artifact ready to use
export type LoadedArtifact = {
  id: string
  name: string
  startBlock: number
  // Keys are event names e.g. "NFTTransfer", values are the eventSelector + abiType
  // that decodeEvents() in getPublicEvents.ts expects directly
  events: Record<string, { eventSelector: any; abiType: any; fieldNames: string[] }>
}

export class ArtifactRegistry {
  private configPath: string

  constructor(configPath: string) {
    this.configPath = configPath
  }

  async getEnabledArtifacts(network: string): Promise<LoadedArtifact[]> {
    const networkKey = network.toLowerCase() // "devnet", "testnet", "sandbox"

    const raw = readFileSync(this.configPath, 'utf-8')
    const config = JSON.parse(raw)
    const artifactConfigs: ArtifactConfig[] = config.artifacts

    const loaded: LoadedArtifact[] = []
    const configDir = path.dirname(this.configPath)

    for (const artifactConfig of artifactConfigs) {
      if (!artifactConfig.enabled) {
        logger.info(`Skipping disabled artifact: ${artifactConfig.id}`)
        continue
      }

      const artifactFilePath = path.resolve(configDir, artifactConfig.artifact_path)

      try {
        // Bun can import .ts files directly at runtime
        const module = await import(artifactFilePath)

        // Find the exported class that has a static events getter
        const contractClass = findContractClass(module)
        if (!contractClass) {
          logger.warn(`No contract class with static events() found in ${artifactFilePath}`)
          continue
        }

        const allEvents = contractClass.events

        // Filter to only the event types listed in artifacts.json
        const filteredEvents: LoadedArtifact['events'] = {}
        for (const eventName of artifactConfig.event_types) {
          if (allEvents[eventName]) {
            filteredEvents[eventName] = allEvents[eventName]
          } else {
            logger.warn(`Event "${eventName}" not found in artifact "${artifactConfig.id}"`)
          }
        }

        const startBlock = artifactConfig.start_block[networkKey] ?? 0

        loaded.push({
          id: artifactConfig.id,
          name: artifactConfig.name,
          startBlock,
          events: filteredEvents,
        })

        logger.info(
          `Loaded artifact "${artifactConfig.id}" — events: [${Object.keys(filteredEvents).join(', ')}], startBlock: ${startBlock}`
        )
      } catch (error) {
        logger.error(`Failed to load artifact "${artifactConfig.id}" from ${artifactFilePath}: ${error}`)
      }
    }

    return loaded
  }
}

// Walk the module's exports and find the class that has a static events getter
function findContractClass(module: Record<string, unknown>): any {
  for (const key of Object.keys(module)) {
    const exported = module[key]
    if (typeof exported !== 'function') continue
    try {
      const events = (exported as any).events
      if (events && typeof events === 'object' && Object.keys(events).length > 0) {
        return exported
      }
    } catch {
      // not a contract class, skip
    }
  }
  return null
}
