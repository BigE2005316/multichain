const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');
const cfg = require('../config'); // adjust path to where your cfg is defined
const executorSol = require('./executor.sol')
const executorEvm = require('./executor.evm')

// services/followService.js
const WalletFollow = require("../models/WalletFollow");

async function getFollowedAddresses(batchSize = 50, page = 0) {
  const skips = batchSize * page;
  const leaders = await WalletFollow.find()
    .skip(skips)
    .limit(batchSize)
    .lean();

  return leaders.map(entry => ({
    chain: entry.chain,
    leader: entry.leader,
    followers: entry.followers.filter(f => f.active)
  }));
}


async function executeSwap({ tokenIn, tokenOut, amountIn, slippageBps }) {

    let result = executorEvm.executeEvmSwap({ tokenIn, tokenOut, amountIn, slippageBps })

}

module.exports = {
  executeSwap,
  getFollowedAddresses
};
