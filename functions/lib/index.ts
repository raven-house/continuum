import { EventIndexer } from './EventIndexer'

export async function handler(mode: string) {
  const indexer = new EventIndexer(mode)
  await indexer.run()
}
