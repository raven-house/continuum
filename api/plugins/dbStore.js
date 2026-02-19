import fp from 'fastify-plugin';

export default fp(
  async fastify => {
    fastify.decorate('dbStoreSandbox', new DBStore(fastify.mongo, 'SANDBOX'));
    fastify.decorate('dbStoreTestnet', new DBStore(fastify.mongo, 'TESTNET'));
    fastify.decorate('dbStoreDevnet', new DBStore(fastify.mongo, 'DEVNET'));
  },
  { dependencies: ['env', 'mongodb'] }
);

// Time range to milliseconds mapping
const TIME_RANGE_MS = {
  '10m': 10 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

// Number of data points for sparkline based on time range
// Aggregation runs every 10 minutes, so adjust expectations accordingly:
// - 10m: at most 1-2 snapshots available
// - 1h: ~6 snapshots (every 10 min)
// - 6h: ~36 snapshots, sample to 12
// - 1d: ~144 snapshots, sample to 24
// - 7d: ~1008 snapshots, sample to 14
// - 30d: ~4320 snapshots, sample to 30
const SPARKLINE_POINTS = {
  '10m': 2, // Limited data available for short range
  '1h': 6, // 1 point per 10 minutes (matches aggregation)
  '6h': 12, // 1 point per 30 minutes
  '1d': 24, // 1 point per hour
  '7d': 14, // 1 point per 12 hours
  '30d': 30 // 1 point per day
};

export class DBStore {
  /** @type {import('mongodb').Collection<import('mongodb').Document>} */
  #_listingCreated;
  #_listingSold;
  #_listingCancelled;
  #_nftTransfer;
  #_offerCreated;
  #_offerAccepted;
  #_offerCancelled;
  #_metadataUpdate;
  #_voucherClaimed;
  #_collectionStats;
  #_collectionStatsHistory;

  /** @type {import('@fastify/mongodb').FastifyMongoObject} */
  #mongodb;
  #mode;

  constructor(mongodb, mode) {
    if (!mongodb) {
      throw new Error('`mongodb` is required');
    }

    this.#mongodb = mongodb;
    this.#mode = mode;
  }
  get _mode() {
    return this.#mode;
  }
  _getCollectionName(name) {
    const collectionName =
      this._mode === 'TESTNET'
        ? `${name}_testnet`
        : this._mode === 'DEVNET'
          ? `${name}_devnet`
          : name;
    return collectionName;
  }

  async getListingCreatedAndSold(token_id) {
    // if (typeof token_id !== 'number') {
    //   throw new Error('`tokenId` must be a number');
    // }
    const listingCreated = await this.#listingCreated
      .aggregate([
        { $match: { token_id: parseInt(token_id) } },
        {
          $sort: { timestamp: 1 }
        }
      ])
      .toArray();

    const listingSold = await this.#listingSold
      .aggregate([
        { $match: { token_id } },
        {
          $sort: { timestamp: 1 }
        }
      ])
      .toArray();
    const listingCancelled = await this.#listingCancelled
      .aggregate([
        { $match: { token_id } },
        {
          $sort: { timestamp: 1 }
        }
      ])
      .toArray();

    const nftTransfer = await this.#nftTransfer
      .aggregate([
        { $match: { token_id } },
        {
          $sort: { timestamp: 1 }
        }
      ])
      .toArray();

    return { listingCreated, listingSold, nftTransfer, listingCancelled };
  }

  async getOffers(token_id) {
    const offerCreated = await this.#offerCreated
      .aggregate([{ $match: { token_id } }])
      .toArray();

    const offerAccepted = await this.#offerAccepted
      .aggregate([{ $match: { token_id } }])
      .toArray();

    const offerCancelled = await this.#offerCancelled
      .aggregate([{ $match: { token_id } }])
      .toArray();

    return { offerCreated, offerAccepted, offerCancelled };
  }

  async getUserListingEvents(wallet_address) {
    if (!wallet_address) {
      throw new Error('`wallet_address` is required');
    }

    const allListingsCreated = await this.#listingCreated
      .aggregate([
        { $match: { seller: wallet_address } },
        { $sort: { timestamp: -1 } }
      ])
      .toArray();

    // Get all listings sold by this user
    const allListingsSold = await this.#listingSold
      .aggregate([
        { $match: { seller: wallet_address } },
        { $sort: { timestamp: -1 } }
      ])
      .toArray();

    // Get all listings cancelled by this user
    const allListingsCancelled = await this.#listingCancelled
      .aggregate([
        { $match: { seller: wallet_address } },
        { $sort: { timestamp: -1 } }
      ])
      .toArray();

    // Get all items purchased by this user (where user is buyer)
    const purchasedItems = await this.#listingSold
      .aggregate([
        { $match: { buyer: wallet_address } },
        { $sort: { timestamp: -1 } }
      ])
      .toArray();

    // a map of listings with their prices for quick lookup
    const listingPriceMap = new Map();
    allListingsCreated.forEach(listing => {
      const key = `${listing.token_id}_${listing.nft_contract}_${listing.seller}`;
      listingPriceMap.set(key, listing.price);
    });

    // Create sets of sold and cancelled token IDs for filtering current listings
    const soldTokenIds = new Set(
      allListingsSold.map(item => `${item.token_id}_${item.nft_contract}`)
    );

    const cancelledTokenIds = new Set(
      allListingsCancelled.map(item => `${item.token_id}_${item.nft_contract}`)
    );

    // Filter current listings (created but not sold or cancelled)
    const currentListings = allListingsCreated.filter(listing => {
      const tokenKey = `${listing.token_id}_${listing.nft_contract}`;
      return !soldTokenIds.has(tokenKey) && !cancelledTokenIds.has(tokenKey);
    });

    // Calculate total volume as seller by looking up prices from created listings
    const totalVolumeAsSeller = allListingsSold.reduce((sum, item) => {
      const key = `${item.token_id}_${item.nft_contract}_${item.seller}`;
      const price = listingPriceMap.get(key);
      if (price) {
        return sum + parseFloat(price);
      } else {
        console.warn(
          `Price not found for sold listing: token_id=${item.token_id}, collection=${item.collection_address}, seller=${item.seller}`
        );
        return sum;
      }
    }, 0);

    // For purchased items, we need to fetch the listing prices from the sellers who sold to this buyer
    // We need to get the listing_created records for the items this user purchased
    const purchasedItemsWithPrices = await Promise.all(
      purchasedItems.map(async item => {
        const listingCreated = await this.#listingCreated.findOne({
          token_id: item.token_id,
          collection_address: item.collection_address,
          seller: item.seller
        });

        return {
          ...item,
          price: listingCreated ? listingCreated.price : null
        };
      })
    );

    // Calculate total volume as buyer
    const totalVolumeAsBuyer = purchasedItemsWithPrices.reduce((sum, item) => {
      if (item.price) {
        return sum + parseFloat(item.price);
      } else {
        console.warn(
          `Price not found for purchased item: token_id=${item.token_id}, collection=${item.collection_address}, seller=${item.seller}`
        );
        return sum;
      }
    }, 0);

    const statistics = {
      totalListingsCreated: allListingsCreated.length,
      totalItemsSold: allListingsSold.length,
      totalItemsPurchased: purchasedItems.length,
      totalListingsCancelled: allListingsCancelled.length,
      totalVolumeAsSeller: totalVolumeAsSeller.toString(),
      totalVolumeAsBuyer: totalVolumeAsBuyer.toString()
    };

    return {
      currentListings,
      soldListings: allListingsSold,
      cancelledListings: allListingsCancelled,
      purchasedItems: purchasedItemsWithPrices,
      statistics
    };
  }

  async getTokenOwner(nft_contract, token_id) {
    if (!nft_contract) {
      throw new Error('`nft_contract` is required');
    }
    if (typeof token_id !== 'number') {
      throw new Error('`token_id` must be a number');
    }

    const result = await this.#metadataUpdate.findOne(
      {
        nft_contract: nft_contract,
        token_id: token_id
      },
      {
        sort: { blockNumber: -1 }
      }
    );

    if (!result) {
      return result;
    }

    const latestListingCreated = await this.#listingCreated.findOne(
      {
        nft_contract: nft_contract,
        token_id: token_id
      },
      {
        sort: { blockNumber: -1 }
      }
    );

    if (latestListingCreated) {
      const listingSold = await this.#listingSold.findOne({
        nft_contract: nft_contract,
        token_id: token_id,
        seller: latestListingCreated.seller,
        blockNumber: { $gte: latestListingCreated.blockNumber }
      });

      const listingCancelled = await this.#listingCancelled.findOne({
        nft_contract: nft_contract,
        token_id: token_id,
        seller: latestListingCreated.seller,
        blockNumber: { $gte: latestListingCreated.blockNumber }
      });

      if (!listingSold && !listingCancelled) {
        return {
          ...result,
          owner: latestListingCreated.seller,
          _listing_active: true
        };
      }
    }

    return result;
  }
  async getOwnerTokens(owner_address) {
    if (!owner_address) {
      throw new Error('`owner_address` is required');
    }

    const [directlyOwned, userListings, soldListings, cancelledListings] =
      await Promise.all([
        this.#metadataUpdate
          .aggregate([
            { $sort: { blockNumber: -1 } },
            {
              $group: {
                _id: { nft_contract: '$nft_contract', token_id: '$token_id' },
                latestRecord: { $first: '$$ROOT' }
              }
            },
            { $replaceRoot: { newRoot: '$latestRecord' } },
            { $match: { owner: owner_address } },
            {
              $project: {
                _id: 0,
                token_id: 1,
                nft_contract: 1,
                owner: 1,
                blockNumber: 1
              }
            }
          ])
          .toArray(),

        this.#listingCreated
          .aggregate([
            { $match: { seller: owner_address } },
            { $sort: { blockNumber: -1 } },
            {
              $group: {
                _id: { nft_contract: '$nft_contract', token_id: '$token_id' },
                latestListing: { $first: '$$ROOT' }
              }
            },
            { $replaceRoot: { newRoot: '$latestListing' } }
          ])
          .toArray(),

        this.#listingSold.find({ seller: owner_address }).toArray(),

        this.#listingCancelled.find({ seller: owner_address }).toArray()
      ]);

    const soldMap = new Map();
    for (const sold of soldListings) {
      const key = `${sold.nft_contract}_${sold.token_id}`;
      if (
        !soldMap.has(key) ||
        sold.blockNumber > soldMap.get(key).blockNumber
      ) {
        soldMap.set(key, sold);
      }
    }

    const cancelledMap = new Map();
    for (const cancelled of cancelledListings) {
      const key = `${cancelled.nft_contract}_${cancelled.token_id}`;
      if (
        !cancelledMap.has(key) ||
        cancelled.blockNumber > cancelledMap.get(key).blockNumber
      ) {
        cancelledMap.set(key, cancelled);
      }
    }

    const activeListings = [];
    for (const listing of userListings) {
      const key = `${listing.nft_contract}_${listing.token_id}`;
      const sold = soldMap.get(key);
      const cancelled = cancelledMap.get(key);

      const wasSold = sold && sold.blockNumber >= listing.blockNumber;
      const wasCancelled =
        cancelled && cancelled.blockNumber >= listing.blockNumber;

      if (!wasSold && !wasCancelled) {
        activeListings.push(listing);
      }
    }

    let metadataMap = new Map();
    if (activeListings.length > 0) {
      const metadataQuery = activeListings.map(l => ({
        nft_contract: l.nft_contract,
        token_id: l.token_id
      }));

      const metadataResults = await this.#metadataUpdate
        .aggregate([
          { $match: { $or: metadataQuery } },
          { $sort: { blockNumber: -1 } },
          {
            $group: {
              _id: { nft_contract: '$nft_contract', token_id: '$token_id' },
              latestRecord: { $first: '$$ROOT' }
            }
          },
          { $replaceRoot: { newRoot: '$latestRecord' } }
        ])
        .toArray();

      for (const m of metadataResults) {
        const key = `${m.nft_contract}_${m.token_id}`;
        metadataMap.set(key, m);
      }
    }

    const activeListedTokens = activeListings.map(listing => {
      const key = `${listing.nft_contract}_${listing.token_id}`;
      const metadata = metadataMap.get(key);
      return {
        token_id: listing.token_id,
        nft_contract: listing.nft_contract,
        owner: owner_address,
        blockNumber: metadata?.blockNumber || listing.blockNumber,
        _listing_active: true
      };
    });

    const tokenMap = new Map();
    for (const token of directlyOwned) {
      const key = `${token.nft_contract}_${token.token_id}`;
      tokenMap.set(key, token);
    }
    for (const token of activeListedTokens) {
      const key = `${token.nft_contract}_${token.token_id}`;
      tokenMap.set(key, token);
    }

    // Sort and return
    return Array.from(tokenMap.values()).sort((a, b) => {
      if (a.nft_contract < b.nft_contract) return -1;
      if (a.nft_contract > b.nft_contract) return 1;
      return a.token_id - b.token_id;
    });
  }

  async isVoucherClaimed(token_id, collection_address) {
    if (typeof token_id !== 'number') {
      throw new Error('`token_id` must be a number');
    }

    if (!collection_address) {
      throw new Error('`collection_address` is required');
    }

    const result = await this.#voucherClaimed.findOne({
      token_id,
      collection_address
    });

    return !!result;
  }

  async getAllListings(filters = {}, supabase = null) {
    const {
      nft_contract,
      collection_id,
      token_id,
      seller,
      status,
      mode,
      page = 1,
      limit = 10
    } = filters;
    const isHistoryMode = mode === 'history';

    // Build match query for filters
    const matchQuery = {};
    if (nft_contract) {
      matchQuery.nft_contract = nft_contract;
    }
    if (token_id !== undefined) {
      matchQuery.token_id = token_id;
    }
    if (seller) {
      matchQuery.seller = seller;
    }

    // If collection_id is provided, we need to get the nft_contract from Supabase first
    if (collection_id !== undefined && supabase) {
      const { data: collection, error: collectionError } = await supabase
        .from('aztec_nft_collections')
        .select('contract_address')
        .eq('collection_id', collection_id)
        .single();

      if (collectionError) {
        console.error('Error fetching collection:', collectionError);
        throw new Error(`Collection with ID ${collection_id} not found`);
      }

      if (collection) {
        matchQuery.nft_contract = collection.contract_address;
      }
    }

    // Fetch all listing created events
    const allListingsCreated = await this.#listingCreated
      .aggregate([
        { $match: matchQuery },
        { $sort: { blockNumber: 1, timestamp: 1 } }
      ])
      .toArray();

    // Fetch all listing sold events
    const allListingsSold = await this.#listingSold
      .aggregate([
        { $match: matchQuery },
        { $sort: { blockNumber: 1, timestamp: 1 } }
      ])
      .toArray();

    // Fetch all listing cancelled events
    const allListingsCancelled = await this.#listingCancelled
      .aggregate([
        { $match: matchQuery },
        { $sort: { blockNumber: 1, timestamp: 1 } }
      ])
      .toArray();

    // Create maps for sold and cancelled listings
    // Key format: token_id_nft_contract_seller
    const soldMap = new Map();
    allListingsSold.forEach(sold => {
      const key = `${sold.token_id}_${sold.nft_contract}_${sold.seller}`;
      if (
        !soldMap.has(key) ||
        sold.blockNumber > soldMap.get(key).blockNumber
      ) {
        soldMap.set(key, sold);
      }
    });

    const cancelledMap = new Map();
    allListingsCancelled.forEach(cancelled => {
      const key = `${cancelled.token_id}_${cancelled.nft_contract}_${cancelled.seller}`;
      if (
        !cancelledMap.has(key) ||
        cancelled.blockNumber > cancelledMap.get(key).blockNumber
      ) {
        cancelledMap.set(key, cancelled);
      }
    });

    // Process listings and determine their status
    const activeListings = [];
    const soldListings = [];
    const cancelledListings = [];

    allListingsCreated.forEach(listing => {
      const key = `${listing.token_id}_${listing.nft_contract}_${listing.seller}`;
      const sold = soldMap.get(key);
      const cancelled = cancelledMap.get(key);

      // Check if listing was sold or cancelled after it was created
      const wasSold = sold && sold.blockNumber >= listing.blockNumber;
      const wasCancelled =
        cancelled && cancelled.blockNumber >= listing.blockNumber;

      if (wasSold) {
        // Listing was sold
        soldListings.push({
          ...listing,
          status: 'sold',
          buyer: sold.buyer,
          soldAt: sold.timestamp,
          soldBlockNumber: sold.blockNumber
        });
      } else if (wasCancelled) {
        // Listing was cancelled - include in history mode or when filtering for cancelled/all
        if (isHistoryMode || status === 'cancelled' || status === 'all') {
          cancelledListings.push({
            ...listing,
            status: 'cancelled',
            cancelledAt: cancelled.timestamp,
            cancelledBlockNumber: cancelled.blockNumber
          });
        }
      } else {
        // Listing is active (not sold and not cancelled)
        activeListings.push({
          ...listing,
          status: 'active'
        });
      }
    });

    // Combine listings based on status filter and mode
    let listings;
    if (status === 'active') {
      listings = activeListings;
    } else if (status === 'sold') {
      listings = soldListings;
    } else if (status === 'cancelled') {
      listings = cancelledListings;
    } else if (status === 'all') {
      // Include all listings with priority sorting (active first, then sold, then cancelled)
      listings = [...activeListings, ...soldListings, ...cancelledListings];
    } else if (isHistoryMode) {
      // In history mode, include all listings (active, sold, and cancelled)
      listings = [...activeListings, ...soldListings, ...cancelledListings];
    } else {
      listings = [...activeListings, ...soldListings];
    }

    // Enrich listings with Supabase data if supabase client is provided
    if (supabase && listings.length > 0) {
      // Get unique nft_contracts to fetch collection data
      const uniqueContracts = [...new Set(listings.map(l => l.nft_contract))];

      // Fetch all collections for these contracts
      const { data: collections, error: collectionsError } = await supabase
        .from('aztec_nft_collections')
        .select('contract_address, name, collection_id')
        .in('contract_address', uniqueContracts);

      if (collectionsError) {
        console.error('Error fetching collections:', collectionsError);
      }

      // Create a map of contract_address -> collection data
      const collectionsMap = new Map();
      if (collections) {
        collections.forEach(col => {
          collectionsMap.set(col.contract_address, col);
        });
      }

      // Get unique collection_id and token_id pairs to fetch NFT data
      const nftKeys = listings
        .map(listing => {
          const collection = collectionsMap.get(listing.nft_contract);
          return collection
            ? {
                collection_id: collection.collection_id,
                token_id: listing.token_id
              }
            : null;
        })
        .filter(key => key !== null);

      // Fetch NFT data for all listings
      const nftsMap = new Map();
      if (nftKeys.length > 0) {
        // We need to batch the queries since we're querying by (collection_id, token_id) pairs
        // For now, we'll fetch all NFTs from the relevant collections and filter in memory
        const uniqueCollectionIds = [
          ...new Set(nftKeys.map(k => k.collection_id))
        ];

        const { data: nfts, error: nftsError } = await supabase
          .from('aztec_nfts')
          .select('collection_id, id, name, image_url')
          .in('collection_id', uniqueCollectionIds);

        if (nftsError) {
          console.error('Error fetching NFTs:', nftsError);
        }

        if (nfts) {
          nfts.forEach(nft => {
            const key = `${nft.collection_id}_${nft.id}`;
            nftsMap.set(key, nft);
          });
        }
      }

      // Enrich each listing with collection and NFT data
      listings = listings.map(listing => {
        const collection = collectionsMap.get(listing.nft_contract);
        let nft = null;

        if (collection) {
          const nftKey = `${collection.collection_id}_${listing.token_id}`;
          nft = nftsMap.get(nftKey);
        }

        return {
          ...listing,
          collection_id: collection?.collection_id || null,
          collection_name: collection?.name || null,
          nft_name: nft?.name || null,
          nft_img_url: nft?.image_url || null
        };
      });
    }

    // Sort listings: for 'all' status, sort by status priority first, then by timestamp
    if (status === 'all') {
      const statusPriority = { active: 0, sold: 1, cancelled: 2 };
      listings.sort((a, b) => {
        const priorityA = statusPriority[a.status] ?? 3;
        const priorityB = statusPriority[b.status] ?? 3;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        // Secondary sort by blockNumber (most recent first)
        return b.blockNumber - a.blockNumber;
      });
    } else {
      listings.sort((a, b) => b.blockNumber - a.blockNumber);
    }

    const total = listings.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedListings = listings.slice(startIndex, endIndex);
    const hasMore = page < totalPages;

    const result = {
      listings: paginatedListings,
      total,
      page,
      limit,
      totalPages,
      hasMore
    };

    if (!status) {
      result.activeCount = activeListings.length;
      result.soldCount = soldListings.length;
    }

    // Include cancelledCount in history mode
    if (isHistoryMode) {
      result.cancelledCount = cancelledListings.length;
    }

    return result;
  }

  async getAllOffers(filters = {}, supabase = null) {
    const {
      nft_contract,
      collection_id,
      token_id,
      buyer,
      status,
      current_block,
      page = 1,
      limit = 10
    } = filters;

    // Build match query for filters
    const matchQuery = {};
    if (nft_contract) {
      matchQuery.nft_contract = nft_contract;
    }
    if (token_id !== undefined) {
      matchQuery.token_id = token_id;
    }
    if (buyer) {
      matchQuery.buyer = buyer;
    }

    // If collection_id is provided, resolve nft_contract from Supabase
    if (collection_id !== undefined && supabase) {
      const { data: collection, error: collectionError } = await supabase
        .from('aztec_nft_collections')
        .select('contract_address')
        .eq('collection_id', collection_id)
        .single();

      if (collectionError) {
        console.error('Error fetching collection:', collectionError);
        throw new Error(`Collection with ID ${collection_id} not found`);
      }

      if (collection) {
        matchQuery.nft_contract = collection.contract_address;
      }
    }

    // Fetch all offer events
    const allOffersCreated = await this.#offerCreated
      .aggregate([
        { $match: matchQuery },
        { $sort: { blockNumber: 1, timestamp: 1 } }
      ])
      .toArray();

    const allOffersAccepted = await this.#offerAccepted
      .aggregate([
        { $match: matchQuery },
        { $sort: { blockNumber: 1, timestamp: 1 } }
      ])
      .toArray();

    const allOffersCancelled = await this.#offerCancelled
      .aggregate([
        { $match: matchQuery },
        { $sort: { blockNumber: 1, timestamp: 1 } }
      ])
      .toArray();

    // Build accepted/cancelled maps keyed by offer_id_nft_contract
    const acceptedMap = new Map();
    allOffersAccepted.forEach(accepted => {
      const key = `${accepted.offer_id}_${accepted.nft_contract}`;
      if (
        !acceptedMap.has(key) ||
        accepted.blockNumber > acceptedMap.get(key).blockNumber
      ) {
        acceptedMap.set(key, accepted);
      }
    });

    const cancelledMap = new Map();
    allOffersCancelled.forEach(cancelled => {
      const key = `${cancelled.offer_id}_${cancelled.nft_contract}`;
      if (
        !cancelledMap.has(key) ||
        cancelled.blockNumber > cancelledMap.get(key).blockNumber
      ) {
        cancelledMap.set(key, cancelled);
      }
    });

    // Process offers and determine their status
    const activeOffers = [];
    const expiredOffers = [];
    const acceptedOffers = [];
    const cancelledOffers = [];

    const blockNum = current_block ? parseInt(current_block) : null;

    allOffersCreated.forEach(offer => {
      const key = `${offer.offer_id}_${offer.nft_contract}`;
      const accepted = acceptedMap.get(key);
      const cancelled = cancelledMap.get(key);

      if (accepted && accepted.blockNumber >= offer.blockNumber) {
        acceptedOffers.push({
          ...offer,
          status: 'accepted',
          seller: accepted.seller,
          acceptedAt: accepted.timestamp,
          acceptedBlockNumber: accepted.blockNumber
        });
      } else if (cancelled && cancelled.blockNumber >= offer.blockNumber) {
        cancelledOffers.push({
          ...offer,
          status: 'cancelled',
          cancelledAt: cancelled.timestamp,
          cancelledBlockNumber: cancelled.blockNumber
        });
      } else if (
        blockNum &&
        offer.expiry_block &&
        blockNum >= offer.expiry_block
      ) {
        const expiredAgoBlocks = blockNum - offer.expiry_block;
        expiredOffers.push({
          ...offer,
          status: 'expired',
          expired_ago_blocks: expiredAgoBlocks,
          expired_ago_minutes: Math.round((expiredAgoBlocks * 90) / 60)
        });
      } else {
        const expiresInBlocks =
          offer.expiry_block && blockNum ? offer.expiry_block - blockNum : null;
        activeOffers.push({
          ...offer,
          status: 'active',
          expires_in_blocks: expiresInBlocks,
          expires_in_minutes: expiresInBlocks
            ? Math.round((expiresInBlocks * 90) / 60)
            : null
        });
      }
    });

    // Combine offers based on status filter
    let offers;
    if (status === 'active') {
      offers = activeOffers;
    } else if (status === 'expired') {
      offers = expiredOffers;
    } else if (status === 'accepted') {
      offers = acceptedOffers;
    } else if (status === 'cancelled') {
      offers = cancelledOffers;
    } else {
      // 'all' or no filter - include everything with priority sorting
      offers = [
        ...activeOffers,
        ...expiredOffers,
        ...acceptedOffers,
        ...cancelledOffers
      ];
    }

    // Enrich offers with Supabase data if supabase client is provided
    if (supabase && offers.length > 0) {
      const uniqueContracts = [...new Set(offers.map(o => o.nft_contract))];

      const { data: collections, error: collectionsError } = await supabase
        .from('aztec_nft_collections')
        .select('contract_address, name, collection_id')
        .in('contract_address', uniqueContracts);

      if (collectionsError) {
        console.error('Error fetching collections:', collectionsError);
      }

      const collectionsMap = new Map();
      if (collections) {
        collections.forEach(col => {
          collectionsMap.set(col.contract_address, col);
        });
      }

      const nftKeys = offers
        .map(offer => {
          const collection = collectionsMap.get(offer.nft_contract);
          return collection
            ? {
                collection_id: collection.collection_id,
                token_id: offer.token_id
              }
            : null;
        })
        .filter(key => key !== null);

      const nftsMap = new Map();
      if (nftKeys.length > 0) {
        const uniqueCollectionIds = [
          ...new Set(nftKeys.map(k => k.collection_id))
        ];

        const { data: nfts, error: nftsError } = await supabase
          .from('aztec_nfts')
          .select('collection_id, id, name, image_url')
          .in('collection_id', uniqueCollectionIds);

        if (nftsError) {
          console.error('Error fetching NFTs:', nftsError);
        }

        if (nfts) {
          nfts.forEach(nft => {
            const key = `${nft.collection_id}_${nft.id}`;
            nftsMap.set(key, nft);
          });
        }
      }

      offers = offers.map(offer => {
        const collection = collectionsMap.get(offer.nft_contract);
        let nft = null;

        if (collection) {
          const nftKey = `${collection.collection_id}_${offer.token_id}`;
          nft = nftsMap.get(nftKey);
        }

        return {
          ...offer,
          collection_id: collection?.collection_id || null,
          collection_name: collection?.name || null,
          nft_name: nft?.name || null,
          nft_img_url: nft?.image_url || null
        };
      });
    }

    // Sort offers
    if (status === 'all' || !status) {
      const statusPriority = {
        active: 0,
        expired: 1,
        accepted: 2,
        cancelled: 3
      };
      offers.sort((a, b) => {
        const priorityA = statusPriority[a.status] ?? 4;
        const priorityB = statusPriority[b.status] ?? 4;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        return b.blockNumber - a.blockNumber;
      });
    } else {
      offers.sort((a, b) => b.blockNumber - a.blockNumber);
    }

    const total = offers.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOffers = offers.slice(startIndex, endIndex);
    const hasMore = page < totalPages;

    return {
      offers: paginatedOffers,
      total,
      page,
      limit,
      totalPages,
      hasMore,
      activeCount: activeOffers.length,
      expiredCount: expiredOffers.length,
      acceptedCount: acceptedOffers.length,
      cancelledCount: cancelledOffers.length
    };
  }

  async getAllCollectionStats(params = {}, supabase) {
    const {
      page = 1,
      limit = 20,
      sort_by = 'total_volume',
      sort_dir = 'desc',
      time_range = '1d'
    } = params;

    // Calculate time boundaries
    const now = new Date();
    const timeRangeMs = TIME_RANGE_MS[time_range] || TIME_RANGE_MS['1d'];
    const periodStart = new Date(now.getTime() - timeRangeMs);
    const periodStartTimestamp = Math.floor(periodStart.getTime() / 1000);

    // TODO: Improve this api
    // We fetch everything because we can't sort by 'floor_price' inside Supabase.
    // Supabase acts as the "Master List" of what collections exist.
    const { data: collectionsMetadata, error } = await supabase
      .from('aztec_nft_collections')
      .select(
        'contract_address, name, symbol, image_url, base_image_url, collection_id'
      )
      .not('contract_address', 'is', null);

    if (error) {
      console.error('Supabase metadata fetch error:', error);
      throw new Error('Failed to fetch collections list');
    }

    if (!collectionsMetadata || collectionsMetadata.length === 0) {
      return { collections: [], total: 0, page, limit, time_range };
    }

    // Fetch current stats
    const statsCursor = this.#collectionStats.find({});
    const statsData = await statsCursor.toArray();

    const statsMap = new Map(
      statsData.map(s => [s.contract_address.toLowerCase(), s])
    );

    // Fetch historical stats for sparkline and floor change calculation
    const historyCursor = this.#collectionStatsHistory
      .find({
        timestamp: { $gte: periodStart }
      })
      .sort({ timestamp: 1 });
    const historyData = await historyCursor.toArray();

    // Group history by contract_address
    const historyMap = new Map();
    historyData.forEach(h => {
      const key = h.contract_address.toLowerCase();
      if (!historyMap.has(key)) {
        historyMap.set(key, []);
      }
      historyMap.get(key).push(h);
    });

    // Fetch sales within the time period for volume_in_period and sales_in_period
    const salesInPeriod = await this.#listingSold
      .aggregate([
        {
          $match: {
            timestamp: { $gte: periodStartTimestamp }
          }
        },
        {
          $group: {
            _id: '$nft_contract',
            sales_count: { $sum: 1 },
            volume: { $sum: { $toDouble: '$price' } }
          }
        }
      ])
      .toArray();

    const salesMap = new Map(
      salesInPeriod.map(s => [
        s._id.toLowerCase(),
        { sales: s.sales_count, volume: s.volume }
      ])
    );

    const fullList = collectionsMetadata.map(meta => {
      const addressKey = meta.contract_address
        ? meta.contract_address.toLowerCase()
        : '';
      const stat = statsMap.get(addressKey) || {};
      const history = historyMap.get(addressKey) || [];
      const periodSales = salesMap.get(addressKey) || { sales: 0, volume: 0 };

      // Current floor price from latest stats
      const currentFloor = stat.floor_price || 0;

      // Calculate floor price change
      let floorChangePercent = 0;
      let floorTrend = 'neutral';

      if (history.length > 0) {
        // Find the oldest non-zero floor price in the period for better comparison
        let oldestFloor = 0;
        for (const h of history) {
          if (h.floor_price > 0) {
            oldestFloor = h.floor_price;
            break;
          }
        }

        // If no historical non-zero floor found, try using the oldest record anyway
        if (oldestFloor === 0 && history[0].floor_price !== undefined) {
          oldestFloor = history[0].floor_price;
        }

        if (oldestFloor > 0 && currentFloor > 0) {
          floorChangePercent =
            ((currentFloor - oldestFloor) / oldestFloor) * 100;
          floorChangePercent = Math.round(floorChangePercent * 100) / 100; // Round to 2 decimals
        } else if (oldestFloor === 0 && currentFloor > 0) {
          // Floor went from 0 to something - treat as positive trend
          floorTrend = 'up';
          floorChangePercent = 100; // Indicate new floor established
        } else if (oldestFloor > 0 && currentFloor === 0) {
          // Floor went from something to 0 (no listings) - treat as neutral, not down
          floorTrend = 'neutral';
          floorChangePercent = 0;
        }

        // Set trend based on percentage (only if not already set above)
        if (floorTrend === 'neutral' && floorChangePercent !== 0) {
          if (floorChangePercent > 0) {
            floorTrend = 'up';
          } else if (floorChangePercent < 0) {
            floorTrend = 'down';
          }
        }
      }

      // Generate sparkline data (floor prices over time)
      const numPoints = SPARKLINE_POINTS[time_range] || 24;
      let sparklineData = [];

      if (history.length > 0) {
        // Filter out zero values for cleaner sparkline (unless all are zero)
        const nonZeroHistory = history.filter(h => h.floor_price > 0);
        const dataSource = nonZeroHistory.length > 0 ? nonZeroHistory : history;

        if (dataSource.length <= numPoints) {
          // If we have fewer points than needed, use all of them
          sparklineData = dataSource.map(h => h.floor_price || 0);
        } else {
          // Sample history to get desired number of points
          const step = Math.max(1, Math.floor(dataSource.length / numPoints));
          for (let i = 0; i < dataSource.length; i += step) {
            sparklineData.push(dataSource[i].floor_price || 0);
          }
        }

        // Ensure we include the current floor price as the last point
        if (currentFloor > 0) {
          // Only add if different from last point to avoid duplicates
          if (
            sparklineData.length === 0 ||
            sparklineData[sparklineData.length - 1] !== currentFloor
          ) {
            sparklineData.push(currentFloor);
          }
        }

        // Trim to numPoints if we have too many
        if (sparklineData.length > numPoints) {
          sparklineData = sparklineData.slice(-numPoints);
        }
      } else if (currentFloor > 0) {
        // No history but have current floor - show single point
        sparklineData = [currentFloor];
      }

      return {
        collection_id: meta.collection_id || null,
        name: meta.name || 'Unknown Collection',
        symbol: meta.symbol || '',
        image_url: meta.image_url || meta.base_image_url || null,
        collection_address: meta.contract_address,
        floor_price: currentFloor,
        top_offer: stat.top_offer || 0,
        total_volume: stat.total_volume || 0,
        total_sales: stat.total_sales || 0,
        listed_count: stat.listed_count || 0,
        owner_count: stat.owner_count || 0,
        total_supply: stat.total_supply || 0,
        updated_at:
          stat.updated_at || meta.created_at || new Date().toISOString(),
        // Time-range specific fields
        volume_in_period: periodSales.volume,
        sales_in_period: periodSales.sales,
        floor_change_percent: floorChangePercent,
        floor_trend: floorTrend,
        sparkline_data: sparklineData
      };
    });

    fullList.sort((a, b) => {
      let valA = a[sort_by];
      let valB = b[sort_by];

      if (valA === undefined || valA === null) valA = 0;
      if (valB === undefined || valB === null) valB = 0;

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
        if (valA < valB) return sort_dir === 'asc' ? -1 : 1;
        if (valA > valB) return sort_dir === 'asc' ? 1 : -1;
        return 0;
      }

      return sort_dir === 'asc' ? valA - valB : valB - valA;
    });

    const total = fullList.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedList = fullList.slice(startIndex, endIndex);

    return {
      collections: paginatedList,
      total: total,
      page: Number(page),
      limit: Number(limit),
      time_range
    };
  }

  /**
   * Check if a wallet address owns any NFT in a specific collection.
   * Considers active listings where the seller is the real owner.
   * @param {string} walletAddress - The wallet address to check
   * @param {string} nftContract - The NFT contract address
   * @returns {Promise<{ownsNFT: boolean, ownedTokenIds: number[]}>}
   */
  async checkWalletOwnsNFTInCollection(walletAddress, nftContract) {
    if (!walletAddress) {
      throw new Error('`walletAddress` is required');
    }
    if (!nftContract) {
      throw new Error('`nftContract` is required');
    }

    const normalizedWallet = walletAddress.toLowerCase();
    const normalizedContract = nftContract.toLowerCase();

    // Step 1: Find all tokens where this wallet is the latest owner in metadata_update
    const directlyOwned = await this.#metadataUpdate
      .aggregate([
        {
          $match: {
            nft_contract: { $regex: new RegExp(`^${normalizedContract}$`, 'i') }
          }
        },
        { $sort: { blockNumber: -1 } },
        {
          $group: {
            _id: '$token_id',
            latestRecord: { $first: '$$ROOT' }
          }
        },
        { $replaceRoot: { newRoot: '$latestRecord' } },
        {
          $match: {
            owner: { $regex: new RegExp(`^${normalizedWallet}$`, 'i') }
          }
        }
      ])
      .toArray();

    // Step 2: Find all active listings by this wallet for this collection
    const userListings = await this.#listingCreated
      .aggregate([
        {
          $match: {
            seller: { $regex: new RegExp(`^${normalizedWallet}$`, 'i') },
            nft_contract: { $regex: new RegExp(`^${normalizedContract}$`, 'i') }
          }
        },
        { $sort: { blockNumber: -1 } },
        {
          $group: {
            _id: '$token_id',
            latestListing: { $first: '$$ROOT' }
          }
        },
        { $replaceRoot: { newRoot: '$latestListing' } }
      ])
      .toArray();

    // Step 3: Get sold and cancelled listings for this user and collection
    const [soldListings, cancelledListings] = await Promise.all([
      this.#listingSold
        .find({
          seller: { $regex: new RegExp(`^${normalizedWallet}$`, 'i') },
          nft_contract: { $regex: new RegExp(`^${normalizedContract}$`, 'i') }
        })
        .toArray(),
      this.#listingCancelled
        .find({
          seller: { $regex: new RegExp(`^${normalizedWallet}$`, 'i') },
          nft_contract: { $regex: new RegExp(`^${normalizedContract}$`, 'i') }
        })
        .toArray()
    ]);

    // Build maps for quick lookup
    const soldMap = new Map();
    for (const sold of soldListings) {
      const key = sold.token_id;
      if (
        !soldMap.has(key) ||
        sold.blockNumber > soldMap.get(key).blockNumber
      ) {
        soldMap.set(key, sold);
      }
    }

    const cancelledMap = new Map();
    for (const cancelled of cancelledListings) {
      const key = cancelled.token_id;
      if (
        !cancelledMap.has(key) ||
        cancelled.blockNumber > cancelledMap.get(key).blockNumber
      ) {
        cancelledMap.set(key, cancelled);
      }
    }

    // Step 4: Determine active listings (not sold and not cancelled)
    const activeListedTokenIds = [];
    for (const listing of userListings) {
      const tokenId = listing.token_id;
      const sold = soldMap.get(tokenId);
      const cancelled = cancelledMap.get(tokenId);

      const wasSold = sold && sold.blockNumber >= listing.blockNumber;
      const wasCancelled =
        cancelled && cancelled.blockNumber >= listing.blockNumber;

      if (!wasSold && !wasCancelled) {
        activeListedTokenIds.push(tokenId);
      }
    }

    // Step 5: Combine directly owned tokens and actively listed tokens
    const ownedTokenIds = new Set();

    // Add directly owned tokens
    for (const token of directlyOwned) {
      ownedTokenIds.add(token.token_id);
    }

    // Add actively listed tokens (these are truly owned by the seller)
    for (const tokenId of activeListedTokenIds) {
      ownedTokenIds.add(tokenId);
    }

    const ownedTokenIdsArray = Array.from(ownedTokenIds).sort((a, b) => a - b);

    return {
      ownsNFT: ownedTokenIdsArray.length > 0,
      ownedTokenIds: ownedTokenIdsArray
    };
  }

  /**
   * Get stats for a single collection by contract address
   * @param {string} contractAddress - The contract address of the collection
   * @returns {Promise<Object>} Collection stats or null if not found
   */
  async getCollectionStatsByContract(contractAddress) {
    if (!contractAddress) {
      return null;
    }

    const normalizedAddress = contractAddress.toLowerCase();

    // Fetch current stats from collection_stats
    const stat = await this.#collectionStats.findOne({
      contract_address: { $regex: new RegExp(`^${normalizedAddress}$`, 'i') }
    });

    if (!stat) {
      return null;
    }

    return {
      contract_address: stat.contract_address,
      floor_price: stat.floor_price || 0,
      total_volume: stat.total_volume || 0,
      total_sales: stat.total_sales || 0,
      listed_count: stat.listed_count || 0,
      owner_count: stat.owner_count || 0,
      total_supply: stat.total_supply || 0,
      updated_at: stat.updated_at || new Date().toISOString()
    };
  }

  /** @type {import('mongodb').Collection<import('mongodb').Document>} */
  get #listingCreated() {
    return (this.#_listingCreated ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('listing_created')));
  }
  get #listingSold() {
    return (this.#_listingSold ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('listing_sold')));
  }
  get #listingCancelled() {
    return (this.#_listingCancelled ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('listing_cancelled')));
  }
  get #nftTransfer() {
    return (this.#_nftTransfer ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('nft_transfer')));
  }
  get #offerCreated() {
    return (this.#_offerCreated ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('offer_created')));
  }
  get #offerAccepted() {
    return (this.#_offerAccepted ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('offer_accepted')));
  }
  get #offerCancelled() {
    return (this.#_offerCancelled ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('offer_cancelled')));
  }
  get #metadataUpdate() {
    return (this.#_metadataUpdate ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('metadata_update')));
  }

  get #voucherClaimed() {
    return (this.#_voucherClaimed ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('voucher_claimed')));
  }

  get #collectionStats() {
    return (this.#_collectionStats ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('collection_stats')));
  }

  get #collectionStatsHistory() {
    return (this.#_collectionStatsHistory ??= this.#mongodb.client
      .db(process.env.CONTINUUM_DB_NAME)
      .collection(this._getCollectionName('collection_stats_history')));
  }
}
