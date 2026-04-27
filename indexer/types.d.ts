export type DBListingCreated = {
  token_id: number
  seller: string
  price: string
  nft_contract: string
  blockNumber: number
  timestamp: number
  offer_contract: string
}

export type DBListingSold = {
  token_id: number
  seller: string
  buyer: string
  nft_contract: string
  blockNumber: number
  timestamp: number
  price: string
  offer_contract: string
}

export type DBNFTTransfer = {
  token_id: number
  from: string
  to: string
  nft_contract: string
  blockNumber: number
  timestamp: number
}

export type DBListingCancelled = {
  token_id: number
  seller: string
  nft_contract: string
  blockNumber: number
  timestamp: number
  offer_contract: string
}

export type DBOfferCreated = {
  offer_id: number
  nft_contract: string
  token_id: number
  buyer: string
  amount: number
  expiry_block: number
  blockNumber: number
  timestamp: number
  offer_contract: string
}

export type DBOfferAccepted = {
  offer_id: number
  nft_contract: string
  token_id: number
  buyer: string
  seller: string
  amount: number
  blockNumber: number
  timestamp: number
  offer_contract: string
}

export type DBOfferCancelled = {
  offer_id: number
  nft_contract: string
  token_id: number
  buyer: string
  amount: number
  blockNumber: number
  timestamp: number
  offer_contract: string
}

export type DBMetadataUpdate = {
  token_id: number
  nft_contract: string
  owner: string
  blockNumber: number
  timestamp: number
}

export type DBVoucherClaimed = {
  token_id: number
  claimer: string
  amount: number
  collection_address: string
}
