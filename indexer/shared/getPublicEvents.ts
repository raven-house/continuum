import { type AztecNode } from '@aztec/aztec.js/node'
import { AztecAddress } from '@aztec/aztec.js/addresses'
import { decodeFromAbi } from '@aztec/stdlib/abi'
import { computeLogTag } from '@aztec/stdlib/hash'
import { DomainSeparator } from '@aztec/constants'
import { Tag } from '@aztec/stdlib/logs'

export type EventDef = {
  eventSelector: { toField: () => any }
  abiType: any
  fieldNames: string[]
}

export type DecodedEvent = {
  blockNumber: number | null
  contractAddress: string
  data: Record<string, any>
}

export const getPublicEventsForContract = async ({
  aztecNode,
  eventDef,
  contractAddress,
  fromBlock,
  toBlock,
}: {
  aztecNode: AztecNode
  eventDef: EventDef
  contractAddress: string
  fromBlock: number
  toBlock: number
}): Promise<DecodedEvent[]> => {
  const logTag = new Tag(
    await computeLogTag(eventDef.eventSelector.toField(), DomainSeparator.EVENT_LOG_TAG),
  )

  // BlockNumber is a branded number at compile time; plain numbers are fine at runtime.
  const [logs] = await aztecNode.getPublicLogsByTags({
    contractAddress: AztecAddress.fromStringUnsafe(contractAddress),
    tags: [logTag],
    fromBlock,
    toBlock,
  } as any)

  const normalizedAddress = contractAddress.toLowerCase()

  return (logs ?? []).map((log: any) => ({
    blockNumber: log.blockNumber ?? null,
    contractAddress: normalizedAddress,
    // logData[0] is the tag; the event fields follow it.
    data: decodeFromAbi([eventDef.abiType], log.logData.slice(1)) as Record<string, any>,
  }))
}
