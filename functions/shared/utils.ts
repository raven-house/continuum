import type { AztecNode } from '@aztec/aztec.js/node'

/**
 * Recursively converts Aztec SDK objects (AztecAddress, Fr, etc.) to plain
 * JS primitives so they store cleanly in MongoDB.
 *
 * Detection strategy:
 *  - BigInt        → string
 *  - Object whose .toString() doesn't return "[object Object]"
 *                  → use .toString()  (covers AztecAddress, Fr, AztecPublicKey, …)
 *  - Plain object  → recurse into each field
 *  - Array         → map each element
 *  - Primitive     → leave as-is
 */
export function serializeEventData(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(serializeEventData)
  if (typeof value === 'object') {
    const str = (value as object).toString()
    if (str !== '[object Object]') return str
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        serializeEventData(v),
      ])
    )
  }
  return value
}

export function parseBlockNumberFromLog(logString: string): number | null {
  // Regular expression to match the block number in the string
  const blockNumberRegex = /blockNumber:\s*(\d+)/;
  const match = logString.match(blockNumberRegex);

  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Get timestamp for a block number from the Aztec node.
 * Returns current timestamp if block is not found.
 */
export async function getBlockTimestamp(
  node: AztecNode,
  blockNumber: number
): Promise<number> {
  const block = await node.getBlock(blockNumber)
  if (block?.timestamp !== undefined) {
    return Number(block.timestamp)
  }
  return Math.floor(Date.now() / 1000)
}

/**
 * Get timestamps for multiple block numbers.
 * Uses caching to avoid fetching the same block multiple times.
 */
export async function getBlockTimestamps(
  node: AztecNode,
  blockNumbers: number[]
): Promise<Map<number, number>> {
  const uniqueBlocks = [...new Set(blockNumbers)]
  const timestampMap = new Map<number, number>()

  await Promise.all(
    uniqueBlocks.map(async (blockNumber) => {
      const timestamp = await getBlockTimestamp(node, blockNumber)
      timestampMap.set(blockNumber, timestamp)
    })
  )

  return timestampMap
}
