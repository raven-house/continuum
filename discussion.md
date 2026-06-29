on rollup A(which is Old rollup), your wallet address is 0x12356

You minted an NFT publicly 

event inside indexer is {
  owner: 0x12356,
  tokenID: 1
}


chain upgrade happened. you don't have access to old wallet now. you create a new wallet which address is 0x34345
You want to access to your old NFTs since you paid for them.


What platform can do, they can use continuum. to use continuum, they need to follow continuum contract standards.

they can first deploy their infrastructure with docker compose. 
this way, they will get attestor_pubkey_x, and attestor_pubkey_y, they need to modiy their contract and add following methods

```register_migration``` and ```migrate_and_claim``

After that it is necessary for user to call register_migration on rollup A. 
