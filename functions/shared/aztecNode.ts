import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node'

let cache: {
  [key: string]: AztecNode | null,
} = {
  TESTNET: null,
  SANDBOX: null
}
export const getAztecNode = async (nodeUrl: string, mode: string) => {
  if (cache[mode]) return cache[mode]
  console.log('Setting up aztec node')
  const aztecNode = await createAztecNodeClient(nodeUrl)
  cache[mode] = aztecNode
  return aztecNode
}
