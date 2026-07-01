(base) ➜  e2e-tests git:(feat/v5.0.0-rc.2) ✗ bun run migrate-nft:testnet
$ bun --env-file=../.env run src/testnet/index.ts
[16:02:32.945] INFO: kv-store:lmdb-v2 Starting data store with maxReaders 16
[16:02:33.856] INFO: embedded-wallet:pxe:service Added contract MultiCallEntrypoint at 0x2d1803ae8e30d5fa993a7624231b5ddcf4133ff7475b80a0fba782404b5a09c1 with class 0x0e8fd13d265d2cd222727d4742dca5777611f9c60558e0cd4c9a9916e20e55c4
[16:02:33.856] INFO: embedded-wallet:pxe:service Added contract AuthRegistry at 0x00d6f5f367ac883ed8524f5230b83bdaa0bb4c334394884b4332a441b44f3b22 with class 0x13fc058a766630725790efb40acfcdf3eb52b005881a8ad4833cf64a9f4b7ba4
[16:02:33.857] INFO: embedded-wallet:pxe:service Added contract HandshakeRegistry at 0x11306cd94d75d32c1ea22b7abef4aa6af9a003fb727b22313b0f78c15264d726 with class 0x1adbde91f20ee7d8edb50e52bb922d4522cc60e0b67c0ee1803175ac76a5812c
[16:02:33.857] INFO: embedded-wallet:pxe:service Started PXE connected to chain 11155111 version 2787991301
[16:02:33.857] INFO: kv-store:lmdb-v2 Starting data store with maxReaders 16

[ALICE-OLD] setting up account (testnet)...
[16:02:33.877] INFO: embedded-wallet:pxe:service Added contract class SimulatedSchnorrAccount with id 0x158f74f7038f5360ceea99984b9b26be1896f1e6f7266b353e07100aeb48678b
[16:02:33.892] INFO: embedded-wallet:pxe:service Added contract class SimulatedEcdsaAccount with id 0x0cf2eb0a8d5d1063e843bef8082eb49fb6f67f16c6bd47d88d7426c7a80a14d0
  address: 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad
  bridging fee juice from L1 Sepolia (can take a few minutes)...
[16:02:35.066] INFO: embedded-wallet:pxe:service Added contract SchnorrAccount at 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad with class 0x197279a63a0522e3ca638f1deab0d084cdc1f39ba83a46defd0e1d114509d299
[16:02:35.071] INFO: embedded-wallet:pxe:service Registered account 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad
[16:02:35.073] INFO: embedded-wallet:wallet:db Account stored in database
[16:02:35.363] INFO: migrate-nft 🌉 Bridging 10000000000000000000000 fee juice from L1 to 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad...
[16:02:36.316] INFO: migrate-nft 💰 L1 account already has 852625000000000000000000 tokens, skipping mint
[16:02:36.587] INFO: migrate-nft Approving 10000000000000000000000 tokens for FeeJuice Portal (0xb06ac8156af9c4b369a7ae3e11708baaa1990a3a)
[16:02:49.623] INFO: migrate-nft Sending L1 Fee Juice to L2 to be claimed publicly
[16:03:03.652] INFO: migrate-nft Deposited to Aztec public successfully {"txReceipt":{"blockHash":"0xc9f7995da031b6a9b354c5ee507d1e632dd439aefbc6e2fb484c8838bbf62604","blockNumber":"11179273","contractAddress":null,"cumulativeGasUsed":"32866376","effectiveGasPrice":"1144125760","from":"0x06a40722e44c74bbb4b7d8f6e355b5fc5f6b6efc","gasUsed":"101568","logs":[{"address":"0x762c132040fda6183066fa3b14d985ee55aa3c18","topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef","0x00000000000000000000000006a40722e44c74bbb4b7d8f6e355b5fc5f6b6efc","0x000000000000000000000000b06ac8156af9c4b369a7ae3e11708baaa1990a3a"],"data":"0x00000000000000000000000000000000000000000000021e19e0c9bab2400000","blockNumber":"11179273","transactionHash":"0x3a8f8058e4a5be95b3b4365b32c298e0c67c07aedfb02684345d295494891478","transactionIndex":139,"blockHash":"0xc9f7995da031b6a9b354c5ee507d1e632dd439aefbc6e2fb484c8838bbf62604","blockTimestamp":"0x6a44ecdc","logIndex":972,"removed":false},{"address":"0x917bb0538c680b71dacc90f0c9cee37ed3b18541","topics":["0xe3afb584bcff3adb9d452d2e1ccbcd4aee164ae2a8cdab637aecf866a53fbb77","0x0000000000000000000000000000000000000000000000000000000000000410","0x004c61d368cff5a9980fe9703ac78d2edd39b9b074c6d824f3d08fbdff5ebf99"],"data":"0x0000000000000000000000000000000000000000000000000000000000103c0030511fa41eb5c9708fd2822628e46e7f00000000000000000000000000000000","blockNumber":"11179273","transactionHash":"0x3a8f8058e4a5be95b3b4365b32c298e0c67c07aedfb02684345d295494891478","transactionIndex":139,"blockHash":"0xc9f7995da031b6a9b354c5ee507d1e632dd439aefbc6e2fb484c8838bbf62604","blockTimestamp":"0x6a44ecdc","logIndex":973,"removed":false},{"address":"0xb06ac8156af9c4b369a7ae3e11708baaa1990a3a","topics":["0xcb43dda0de11e57048e9d074ae7474446335afc906a0e5789d624fa5422629e3","0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad"],"data":"0x00000000000000000000000000000000000000000000021e19e0c9bab24000000c504a942e79d2c73add0d5dffa1e52f800551b22bf737e27571fada13d825ee004c61d368cff5a9980fe9703ac78d2edd39b9b074c6d824f3d08fbdff5ebf990000000000000000000000000000000000000000000000000000000000103c00","blockNumber":"11179273","transactionHash":"0x3a8f8058e4a5be95b3b4365b32c298e0c67c07aedfb02684345d295494891478","transactionIndex":139,"blockHash":"0xc9f7995da031b6a9b354c5ee507d1e632dd439aefbc6e2fb484c8838bbf62604","blockTimestamp":"0x6a44ecdc","logIndex":974,"removed":false}],"logsBloom":"0x00000004000040000000000010000000000000024000000000000040000000000000000000000000801000000000000000828000000000000000000000000100000000000000800000000008000000000000000000000000000000000000000000000000000000000008000018000000000000000000000000000010000000000000000000000000000000000200000000000000000000020000000200000000000000000000000000004000000000000000000000000000000000000000000000010002000400000000100000000000000000000008000000000000200000000000000000040001000000000000000000180000000000000000000010000000","status":"success","to":"0xb06ac8156af9c4b369a7ae3e11708baaa1990a3a","transactionHash":"0x3a8f8058e4a5be95b3b4365b32c298e0c67c07aedfb02684345d295494891478","transactionIndex":139,"type":"eip1559"}}
[16:03:03.659] INFO: migrate-nft ✅ Fee juice bridged! Claim amount: 10000000000000000000000
[16:03:03.659] INFO: migrate-nft ⏳ Waiting for L1→L2 message to be available on L2...
[16:03:03.936] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (1/40)
[16:03:34.290] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (2/40)
[16:04:04.567] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (3/40)
[16:04:34.913] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (4/40)
[16:05:05.192] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (5/40)
[16:05:35.538] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (6/40)
[16:06:05.827] INFO: migrate-nft ✅ L1→L2 message is available on L2!
[16:06:07.813] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0xf04908a9 at 0x2d1803ae8e30d5fa993a7624231b5ddcf4133ff7475b80a0fba782404b5a09c1 {"origin":"0x2d1803ae8e30d5fa993a7624231b5ddcf4133ff7475b80a0fba782404b5a09c1","functionSelector":"0xf04908a9","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x03a37361ca4ff4d79f15f3b501711270087e4da01488eab620f3b0a422a7d4ca"]}
[16:06:10.867] INFO: embedded-wallet:pxe:service Simulation completed for 0x1aa635dd85c7b45ab2d8da564f0a71f9c8630b1c30e16d127aff5e8602e10a83 in 3053.760333000013ms {"txHash":"0x1aa635dd85c7b45ab2d8da564f0a71f9c8630b1c30e16d127aff5e8602e10a83","origin":"0x2d1803ae8e30d5fa993a7624231b5ddcf4133ff7475b80a0fba782404b5a09c1","functionSelector":"0xf04908a9","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x03a37361ca4ff4d79f15f3b501711270087e4da01488eab620f3b0a422a7d4ca"],"gasUsed":{"totalGas":{"daGas":832,"l2Gas":711689},"teardownGas":{"daGas":0,"l2Gas":0},"publicGas":{"daGas":64,"l2Gas":37514},"billedGas":{"daGas":832,"l2Gas":711689}},"revertCode":0}
[16:06:12.784] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 1069.1862920000276ms
[16:06:12.784] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:06:18.075] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":5291.071790999995,"proofSize":4133,"compressedSize":113440}
[16:06:19.058] INFO: embedded-wallet Sent transaction 0x14fdd5ed17771b11b4e5d587215d69233e44cef8143362dd9d7ad9eb648d4914
  ✓ account deployed

[ALICE-NEW] setting up account (testnet)...
  address: 0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b
[16:06:26.970] INFO: embedded-wallet:pxe:service Added contract SchnorrAccount at 0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b with class 0x197279a63a0522e3ca638f1deab0d084cdc1f39ba83a46defd0e1d114509d299
[16:06:26.974] INFO: embedded-wallet:pxe:service Registered account 0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b
[16:06:26.975] INFO: embedded-wallet:wallet:db Account stored in database
  bridging fee juice from L1 Sepolia (can take a few minutes)...
[16:06:27.228] INFO: migrate-nft 🌉 Bridging 10000000000000000000000 fee juice from L1 to 0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b...
[16:06:28.278] INFO: migrate-nft 💰 L1 account already has 842625000000000000000000 tokens, skipping mint
[16:06:28.601] INFO: migrate-nft Approving 10000000000000000000000 tokens for FeeJuice Portal (0xb06ac8156af9c4b369a7ae3e11708baaa1990a3a)
[16:06:36.873] INFO: migrate-nft Sending L1 Fee Juice to L2 to be claimed publicly
[16:06:49.975] INFO: migrate-nft Deposited to Aztec public successfully {"txReceipt":{"blockHash":"0x5311d246cfcf9dd2f084862b4303e2e4b606e64abeb0f021a0e77145434659a0","blockNumber":"11179292","contractAddress":null,"cumulativeGasUsed":"26911135","effectiveGasPrice":"1047046332","from":"0x06a40722e44c74bbb4b7d8f6e355b5fc5f6b6efc","gasUsed":"101580","logs":[{"address":"0x762c132040fda6183066fa3b14d985ee55aa3c18","topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef","0x00000000000000000000000006a40722e44c74bbb4b7d8f6e355b5fc5f6b6efc","0x000000000000000000000000b06ac8156af9c4b369a7ae3e11708baaa1990a3a"],"data":"0x00000000000000000000000000000000000000000000021e19e0c9bab2400000","blockNumber":"11179292","transactionHash":"0x2fa351d05e9de002e950d3edd0e3f129e6d9adf4cd81c16f819895155099a3d4","transactionIndex":131,"blockHash":"0x5311d246cfcf9dd2f084862b4303e2e4b606e64abeb0f021a0e77145434659a0","blockTimestamp":"0x6a44edc0","logIndex":826,"removed":false},{"address":"0x917bb0538c680b71dacc90f0c9cee37ed3b18541","topics":["0xe3afb584bcff3adb9d452d2e1ccbcd4aee164ae2a8cdab637aecf866a53fbb77","0x0000000000000000000000000000000000000000000000000000000000000413","0x00c9d0cf13a82bb10cfc93fd09b11dffa9803363f90089428ccdd63eba989090"],"data":"0x000000000000000000000000000000000000000000000000000000000010480034aee22fe35f8337ba2043c27b7b09d300000000000000000000000000000000","blockNumber":"11179292","transactionHash":"0x2fa351d05e9de002e950d3edd0e3f129e6d9adf4cd81c16f819895155099a3d4","transactionIndex":131,"blockHash":"0x5311d246cfcf9dd2f084862b4303e2e4b606e64abeb0f021a0e77145434659a0","blockTimestamp":"0x6a44edc0","logIndex":827,"removed":false},{"address":"0xb06ac8156af9c4b369a7ae3e11708baaa1990a3a","topics":["0xcb43dda0de11e57048e9d074ae7474446335afc906a0e5789d624fa5422629e3","0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b"],"data":"0x00000000000000000000000000000000000000000000021e19e0c9bab24000002bfa70ddd171c9080b23972e8598c77ffaa207c6b7254854bf09f0d224ceed0300c9d0cf13a82bb10cfc93fd09b11dffa9803363f90089428ccdd63eba9890900000000000000000000000000000000000000000000000000000000000104800","blockNumber":"11179292","transactionHash":"0x2fa351d05e9de002e950d3edd0e3f129e6d9adf4cd81c16f819895155099a3d4","transactionIndex":131,"blockHash":"0x5311d246cfcf9dd2f084862b4303e2e4b606e64abeb0f021a0e77145434659a0","blockTimestamp":"0x6a44edc0","logIndex":828,"removed":false}],"logsBloom":"0x00000004000040000000000000000000000000020000000000000040000000000000000000000000801000000000000004820000000000000000000000000100000000000000800000000008000000000000000000000000000000000000000000000000000000000000000008000000000200000000000000000010000000000000008000000000000000000200000000000000000000020000000200000000000000000000200000000000000000000000000000000000000000400000000000010002000400000002100000400000000000000008000000000000200000000000000000000000000000000000000000100000000000000008000010000000","status":"success","to":"0xb06ac8156af9c4b369a7ae3e11708baaa1990a3a","transactionHash":"0x2fa351d05e9de002e950d3edd0e3f129e6d9adf4cd81c16f819895155099a3d4","transactionIndex":131,"type":"eip1559"}}
[16:06:49.978] INFO: migrate-nft ✅ Fee juice bridged! Claim amount: 10000000000000000000000
[16:06:49.978] INFO: migrate-nft ⏳ Waiting for L1→L2 message to be available on L2...
[16:06:50.248] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (1/40)
[16:07:20.523] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (2/40)
[16:07:50.790] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (3/40)
[16:08:21.063] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (4/40)
[16:08:51.440] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (5/40)
[16:09:21.716] INFO: migrate-nft ⏳ Not yet available, retrying in 30s... (6/40)
[16:09:51.995] INFO: migrate-nft ✅ L1→L2 message is available on L2!
[16:09:53.447] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0xf04908a9 at 0x2d1803ae8e30d5fa993a7624231b5ddcf4133ff7475b80a0fba782404b5a09c1 {"origin":"0x2d1803ae8e30d5fa993a7624231b5ddcf4133ff7475b80a0fba782404b5a09c1","functionSelector":"0xf04908a9","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x1285cf7dbc93c4d1005a3cdc4f8cce9f327bc933bbdae4f3b0a50c141c5d0c49"]}
[16:09:56.163] INFO: embedded-wallet:pxe:service Simulation completed for 0x2ac1a4884f61b7a889e7846b909cb56a3c2ac3c139a50204278e89af621b2983 in 2715.424082999991ms {"txHash":"0x2ac1a4884f61b7a889e7846b909cb56a3c2ac3c139a50204278e89af621b2983","origin":"0x2d1803ae8e30d5fa993a7624231b5ddcf4133ff7475b80a0fba782404b5a09c1","functionSelector":"0xf04908a9","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x1285cf7dbc93c4d1005a3cdc4f8cce9f327bc933bbdae4f3b0a50c141c5d0c49"],"gasUsed":{"totalGas":{"daGas":832,"l2Gas":711689},"teardownGas":{"daGas":0,"l2Gas":0},"publicGas":{"daGas":64,"l2Gas":37514},"billedGas":{"daGas":832,"l2Gas":711689}},"revertCode":0}
[16:09:58.009] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 1198.2175830000197ms
[16:09:58.009] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:10:03.240] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":5231.647457999992,"proofSize":4133,"compressedSize":113440}
[16:10:04.856] INFO: embedded-wallet Sent transaction 0x1054351b9f9b5f9e71d3852419bed51ebc50e952905f8b8f58eae4a76bfaba8f
  ✓ account deployed

[OLD] deploying old NFT collection (migration disabled)...
[16:10:15.704] INFO: embedded-wallet:pxe:service Added contract NFT at 0x059f956d508ae5836b7bc742f6aa0b102f9c1f7eca768717520ee83c2bcf2107 with class 0x1294f1f3839dd38270d68d5fa8931fd8bff381e9cb1cfc49b1b1430a3c063842
[16:10:16.304] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0x9d57a239 at 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad {"origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x214276ab8ce63cb7ba925994e09ff77d45193130bbadc419ef022fe9720238d9"]}
[16:10:19.295] INFO: embedded-wallet:pxe:service Simulation completed for 0x2552efa7a78b023dc7e4f89b40e7f9471702b1cb72fcb4dde9f04adead9c9866 in 2991.1725829999777ms {"txHash":"0x2552efa7a78b023dc7e4f89b40e7f9471702b1cb72fcb4dde9f04adead9c9866","origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x214276ab8ce63cb7ba925994e09ff77d45193130bbadc419ef022fe9720238d9"],"gasUsed":{"totalGas":{"daGas":1696,"l2Gas":1441743},"teardownGas":{"daGas":0,"l2Gas":0},"publicGas":{"daGas":1024,"l2Gas":817643},"billedGas":{"daGas":1696,"l2Gas":1441743}},"revertCode":0}
[16:10:20.593] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 1220.4820830000099ms
[16:10:20.593] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:10:24.489] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":3895.3513750000275,"proofSize":4133,"compressedSize":113440}
[16:10:26.139] INFO: embedded-wallet Sent transaction 0x089150f92103baf3d5fc0368437592f7ecd7932ba043e68574f1c90bad231876
  ✓ old collection: 0x059f956d508ae5836b7bc742f6aa0b102f9c1f7eca768717520ee83c2bcf2107

[OLD] deploying shared MigrationRegistry contract...
[16:10:32.634] INFO: embedded-wallet:pxe:service Added contract MigrationRegistry at 0x0f10ac27189276a91039bd47317783b1f76ce2fa1f26b89be1df464c08a5b3b3 with class 0x1ba022e2cd6dfcbe792eafc8bd3b90eee15f81bc96987cdb6cadf35f77ec5113
[16:10:33.269] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0x9d57a239 at 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad {"origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x01175221847c58f0ba5eddfc19948eae861b3e3f8c43d14917f743b3dbca68c3"]}
[16:10:35.344] INFO: embedded-wallet:pxe:service Simulation completed for 0x1d091ca7a1cee3a87b21fa0eb258d82fdb993aa7751b883f5533d3cb2604d497 in 2074.848834000004ms {"txHash":"0x1d091ca7a1cee3a87b21fa0eb258d82fdb993aa7751b883f5533d3cb2604d497","origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x01175221847c58f0ba5eddfc19948eae861b3e3f8c43d14917f743b3dbca68c3"]}
[16:10:36.459] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 1048.9789159999928ms
[16:10:36.459] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:10:40.089] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":3629.531874999986,"proofSize":2630,"compressedSize":65344}
[16:10:40.994] INFO: embedded-wallet Sent transaction 0x2359e225e00703bcae8ef41526a2b4ffc49d83cb86abe22b70ebedfbedf924b4
  ✓ migration registry: 0x0f10ac27189276a91039bd47317783b1f76ce2fa1f26b89be1df464c08a5b3b3

[OLD] registering NFT artifact with the indexer...
  ✓ artifact 'nft-testnet' registered (start_block.testnet=1054)

[OLD] registering MigrationRegistry artifact with the indexer...
  ✓ artifact 'migration-registry-testnet' registered (registry=0x0f10ac27189276a91039bd47317783b1f76ce2fa1f26b89be1df464c08a5b3b3)

[OLD] minting public NFTs...
[16:11:02.856] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0x9d57a239 at 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad {"origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x058325560e691c79e14a66c6962818b4c8f5c5a29ecceb5692a70925f31ce985"]}
[16:11:04.935] INFO: embedded-wallet:pxe:service Simulation completed for 0x08615e90fec73c790e0b766674b4eaf1425cbb1a7f4b21ba0fbadd0056dfdd9c in 2078.991625000024ms {"txHash":"0x08615e90fec73c790e0b766674b4eaf1425cbb1a7f4b21ba0fbadd0056dfdd9c","origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x058325560e691c79e14a66c6962818b4c8f5c5a29ecceb5692a70925f31ce985"],"gasUsed":{"totalGas":{"daGas":448,"l2Gas":671195},"teardownGas":{"daGas":0,"l2Gas":0},"publicGas":{"daGas":320,"l2Gas":80395},"billedGas":{"daGas":448,"l2Gas":671195}},"revertCode":0}
[16:11:06.010] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 1022.5382910000044ms
[16:11:06.010] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:11:09.593] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":3582.157292000018,"proofSize":4133,"compressedSize":113440}
[16:11:11.204] INFO: embedded-wallet Sent transaction 0x2da3c22d65445c4d45c4dc6b08bf52e8f279c455b3acb62307217fa1bfb9264c
  ✓ minted #101 → Alice-OLD
[16:11:20.544] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0x9d57a239 at 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad {"origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x2f82742b90d8e0868ade10cb982696defea017bba231e1dd7378f695dbbd05d2"]}
[16:11:22.683] INFO: embedded-wallet:pxe:service Simulation completed for 0x21a5d5da7a0ba5e9710d8fa2bddb998a1a94527a444d1e71e78c430757baf6d8 in 2139.6366249999264ms {"txHash":"0x21a5d5da7a0ba5e9710d8fa2bddb998a1a94527a444d1e71e78c430757baf6d8","origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x2f82742b90d8e0868ade10cb982696defea017bba231e1dd7378f695dbbd05d2"],"gasUsed":{"totalGas":{"daGas":448,"l2Gas":671195},"teardownGas":{"daGas":0,"l2Gas":0},"publicGas":{"daGas":320,"l2Gas":80395},"billedGas":{"daGas":448,"l2Gas":671195}},"revertCode":0}
[16:11:23.895] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 1161.4044170000125ms
[16:11:23.895] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:11:27.659] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":3763.566583000007,"proofSize":4133,"compressedSize":113440}
[16:11:28.917] INFO: embedded-wallet Sent transaction 0x151549d33257fb886cf07840d9fce97b70687a8af934a1dcdd4dcf127c3d3ca5
  ✓ minted #102 → Alice-OLD
[16:11:39.726] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0x9d57a239 at 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad {"origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x0561e575fdd4abcfd51cba72098f12f24bfd0ef7cef45386fc30b2237a49bcef"]}
[16:11:42.030] INFO: embedded-wallet:pxe:service Simulation completed for 0x12659b8638dba4ecaa0411b27f871e9b2221aa0e90f028b5f009e78413023c44 in 2304.2811249999795ms {"txHash":"0x12659b8638dba4ecaa0411b27f871e9b2221aa0e90f028b5f009e78413023c44","origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x0561e575fdd4abcfd51cba72098f12f24bfd0ef7cef45386fc30b2237a49bcef"],"gasUsed":{"totalGas":{"daGas":448,"l2Gas":671195},"teardownGas":{"daGas":0,"l2Gas":0},"publicGas":{"daGas":320,"l2Gas":80395},"billedGas":{"daGas":448,"l2Gas":671195}},"revertCode":0}
[16:11:43.252] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 1156.9118749999907ms
[16:11:43.252] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:11:46.842] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":3589.4611250000307,"proofSize":4133,"compressedSize":113440}
[16:11:47.967] INFO: embedded-wallet Sent transaction 0x1a45d3f545446edfe566a64bd071554d8bcd4307cc6a9df30c22c91bccb9bb81
  ✓ minted #999 → someone else (must be excluded)

[OLD] fetching a fresh migration secret...
  secret:     0x02c15a7036c7bf9e… (saved by the user)
  commitment: 0x0ed411d7ebaede1b…

[OLD] Alice-OLD calls register_migration(collection, commitment) on the registry...
[16:11:57.224] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0x9d57a239 at 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad {"origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x19bcdeefb7723b3af3132a690af22a400194a93ce3c0eaf31e791c9d937cc63b"]}
[16:11:59.162] INFO: embedded-wallet:pxe:service Simulation completed for 0x2dca6f83e6a0e919dcede81d251b492d27f0245af46d00c4a1416afb1ff51822 in 1937.9952080000658ms {"txHash":"0x2dca6f83e6a0e919dcede81d251b492d27f0245af46d00c4a1416afb1ff51822","origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x19bcdeefb7723b3af3132a690af22a400194a93ce3c0eaf31e791c9d937cc63b"],"gasUsed":{"totalGas":{"daGas":320,"l2Gas":593173},"teardownGas":{"daGas":0,"l2Gas":0},"publicGas":{"daGas":192,"l2Gas":2373},"billedGas":{"daGas":320,"l2Gas":593173}},"revertCode":0}
[16:12:00.196] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 984.1095830000704ms
[16:12:00.196] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:12:03.752] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":3556.0989579999587,"proofSize":4133,"compressedSize":113440}
[16:12:05.261] INFO: embedded-wallet Sent transaction 0x0059f18f070b2c1aca7b835e4c686d5ce91fae8d7025fc1b23a8d87f3bf0a6c5
  ✓ MigrationRegistered emitted from registry (owner = Alice-OLD, collection = old NFT)

[NEW] fetching attester public key...
  pubkey.x: 0x138cfada386a8aae…

[NEW] deploying new NFT collection (migration enabled)...
[16:12:14.513] INFO: embedded-wallet:pxe:service Added contract NFT at 0x290d7ad51563bafa26f5aa8f504c7d90640c22f17fed6d229343ebd9ed886d34 with class 0x1294f1f3839dd38270d68d5fa8931fd8bff381e9cb1cfc49b1b1430a3c063842
[16:12:15.058] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0x9d57a239 at 0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad {"origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x1f21620cdd3227433f26d23a5aa594280b12e8a575fb9e4e4714f33a3a37f7cd"]}
[16:12:17.783] INFO: embedded-wallet:pxe:service Simulation completed for 0x274381c60c6c9f63c57b72500400425ab7217627cbbc50a843879967a26b3982 in 2725.1462090000277ms {"txHash":"0x274381c60c6c9f63c57b72500400425ab7217627cbbc50a843879967a26b3982","origin":"0x0d8df1e172d5d5d9b3492cd315064ac8348abf9d2ac72916886071f3cc2c00ad","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x1f21620cdd3227433f26d23a5aa594280b12e8a575fb9e4e4714f33a3a37f7cd"],"gasUsed":{"totalGas":{"daGas":1696,"l2Gas":1441950},"teardownGas":{"daGas":0,"l2Gas":0},"publicGas":{"daGas":1024,"l2Gas":817850},"billedGas":{"daGas":1696,"l2Gas":1441950}},"revertCode":0}
[16:12:19.030] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 1186.108125000028ms
[16:12:19.030] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:12:22.835] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":3805.3694589999504,"proofSize":4133,"compressedSize":113440}
[16:12:24.009] INFO: embedded-wallet Sent transaction 0x0ae74f70afc30beb5ba6a5b3823362e29ed0b609160f7bbcb9306a865343f263
  ✓ new collection: 0x290d7ad51563bafa26f5aa8f504c7d90640c22f17fed6d229343ebd9ed886d34

[NEW] registering old → new collection mapping...
  ✓ mapping registered

[CLAIM] polling /request_data until the indexer catches up...
  attempt 1: 0/2 tokens indexed…
  attempt 2: 0/2 tokens indexed…
  ✓ got 2 signed token(s)

[CLAIM] Alice-NEW migrate_and_claim() for each token...
[16:13:03.455] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0x9d57a239 at 0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b {"origin":"0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x01fcdb9de8ff058700dea16219fafbc490750ae56f16cf5fa0ed23c06314f4d9"]}
[16:13:08.670] INFO: embedded-wallet:pxe:service Simulation completed for 0x11c362fe8b76c0f93b5e054cb5dc227fbdd85330be18c6bd6128bb73c0986e45 in 5214.765000000014ms {"txHash":"0x11c362fe8b76c0f93b5e054cb5dc227fbdd85330be18c6bd6128bb73c0986e45","origin":"0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x01fcdb9de8ff058700dea16219fafbc490750ae56f16cf5fa0ed23c06314f4d9"],"gasUsed":{"totalGas":{"daGas":2208,"l2Gas":773106},"teardownGas":{"daGas":0,"l2Gas":0},"publicGas":{"daGas":320,"l2Gas":74656},"billedGas":{"daGas":2208,"l2Gas":773106}},"revertCode":0}
[16:13:12.229] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 1333.5364999999292ms
[16:13:12.229] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:13:16.834] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":4604.926082999911,"proofSize":4133,"compressedSize":113440}
[16:13:18.169] INFO: embedded-wallet Sent transaction 0x0483c1a7acec7bb6309db25895220a7c02f75af4cf36f6318a9cc441393b5085
  ✓ claimed #102
[16:13:25.997] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0x9d57a239 at 0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b {"origin":"0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x040e9da920c01cdef3add076c6bd879f5970facd91fa48bb846ea85ad3cebf9e"]}
[16:13:31.203] INFO: embedded-wallet:pxe:service Simulation completed for 0x23d4421c9af9beffa40658d60968866e3b58946efa4ca0a3374d2ade082a2699 in 5206.199416999938ms {"txHash":"0x23d4421c9af9beffa40658d60968866e3b58946efa4ca0a3374d2ade082a2699","origin":"0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x040e9da920c01cdef3add076c6bd879f5970facd91fa48bb846ea85ad3cebf9e"],"gasUsed":{"totalGas":{"daGas":1056,"l2Gas":718031},"teardownGas":{"daGas":0,"l2Gas":0},"publicGas":{"daGas":320,"l2Gas":74656},"billedGas":{"daGas":1056,"l2Gas":718031}},"revertCode":0}
[16:13:34.029] INFO: pxe:private-kernel-execution-prover Private kernel witness generation took 1177.203125ms
[16:13:34.029] INFO: embedded-wallet:pxe:prover Generating ClientIVC proof...
[16:13:37.956] INFO: embedded-wallet:pxe:prover Generated ClientIVC proof {"eventName":"client-ivc-proof-generation","duration":3927.3825409999117,"proofSize":4133,"compressedSize":113440}
[16:13:39.172] INFO: embedded-wallet Sent transaction 0x16fe12316d92b0b582c823a9ea572ac25c69055177db7cf0b513dca26625f9eb
  ✓ claimed #101

[VERIFY] reading post-claim state...
  Alice-NEW private notes: [102, 101]
  ✓ all claimed tokens are private notes with zero public owner

[VERIFY] double-claim must be rejected...
[16:13:49.558] INFO: embedded-wallet:pxe:service Simulating transaction execution request to 0x9d57a239 at 0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b {"origin":"0x2aeb08a8eded4baad5aa93412595ed75d76cf5d362a1796d8973fc078ec6ec1b","functionSelector":"0x9d57a239","simulatePublic":true,"chainId":"0x0000000000000000000000000000000000000000000000000000000000aa36a7","version":"0x00000000000000000000000000000000000000000000000000000000a62d5f05","authWitnesses":["0x101237c27e5fc4766d21eb75ba2f9b92bc35a684a6235821ba850a3d2d46dd35"]}
  ✓ second claim correctly rejected (double-claim guard)

=== E2E migration complete ✅ (testnet) ===
  Old collection: 0x059f956d508ae5836b7bc742f6aa0b102f9c1f7eca768717520ee83c2bcf2107
  New collection: 0x290d7ad51563bafa26f5aa8f504c7d90640c22f17fed6d229343ebd9ed886d34
  Migrated tokens: [101, 102]  Alice-OLD → Alice-NEW
[16:13:52.906] WARN: embedded-wallet:pxe:service Could not find function artifact in contract NFT for function '0x3d44cdb3' when enriching error callstack
(base) ➜  e2e-tests git:(feat/v5.0.0-rc.2)