// import axios from 'axios';
// import { ethers } from 'ethers';
// import { cfg } from '../config/index.js';
// import logger from '../utils/logger.js';
// const axios = require('axios');
// const { ethers } = require('ethers');
// const { cfg } = require('../config');
// const logger = require('../utils/logger');

// // 0x Swap API v2: fetch firm quote then send. :contentReference[oaicite:7]{index=7}
// export async function executeEvmSwap({ tokenIn, tokenOut, amountIn, slippageBps }) {
//   const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC || 'https://rpc.ankr.com/eth');
//   const wallet = new ethers.Wallet(cfg.evm.privateKey, provider);
//   const takerAddress = await wallet.getAddress();

//   // If tokenIn is native (null) use 0x "sellToken" = ETH, else ERC20 address.
//   const params = {
//     sellToken: tokenIn || 'ETH',
//     buyToken: tokenOut || 'USDC',
//     sellAmount: amountIn,
//     takerAddress,
//     slippageBps: slippageBps || 50
//   };

//   const { data: quote } = await axios.get(`${cfg.evm.zeroXBase}/swap/v2/quote`, {
//     params,
//     headers: { '0x-api-key': cfg.evm.zeroXApiKey }
//   });

//   // Send tx
//   const tx = await wallet.sendTransaction({
//     to: quote.to,
//     data: quote.data,
//     value: quote.value ? ethers.toBigInt(quote.value) : 0n,
//     gasLimit: quote.gas || undefined
//   });

//   const receipt = await tx.wait();
//   logger.info({ hash: receipt.hash }, 'EVM swap executed');
//   return receipt.hash;
// }

const { ethers } = require('ethers');
const axios = require('axios');
const logger = require('../utils/logger'); // adjust path if different
const cfg = require('../config/index');    // adjust path if different

const QUICKNODE_RPC = process.env.QUICKNODE_RPC; // your EVM endpoint

async function getEvmTxsForAddress(address, fromBlock = "latest") {
  const res = await axios.post(QUICKNODE_RPC, {
    jsonrpc: "2.0",
    id: 1,
    method: "qn_getTransactionsByAddress",
    params: [
      {
        address,
        page: 1,
        perPage: 5
      }
    ]
  });

  return res.data.result || [];
}


async function executeEvmSwap({ tokenIn, tokenOut, amountIn, slippageBps }) {
  const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC || 'https://rpc.ankr.com/eth');
  const wallet = new ethers.Wallet(cfg.evm.privateKey, provider);
  const takerAddress = await wallet.getAddress();

  // If tokenIn is native (null) use 0x "sellToken" = ETH, else ERC20 address.
  const params = {
    sellToken: tokenIn || 'ETH',
    buyToken: tokenOut || 'USDC',
    sellAmount: amountIn,
    takerAddress,
    slippageBps: slippageBps || 50
  };

  const { data: quote } = await axios.get(`${cfg.evm.zeroXBase}/swap/v2/quote`, {
    params,
    headers: { '0x-api-key': cfg.evm.zeroXApiKey }
  });

  // Send tx
  const tx = await wallet.sendTransaction({
    to: quote.to,
    data: quote.data,
    value: quote.value ? ethers.toBigInt(quote.value) : 0n,
    gasLimit: quote.gas || undefined
  });

  const receipt = await tx.wait();
  logger.info({ hash: receipt.hash }, 'EVM swap executed');
  return receipt.hash;
}

module.exports = {
  executeEvmSwap
};
