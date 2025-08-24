// import axios from 'axios';
// import bs58 from 'bs58';
// import { cfg } from '../config/index.js';
// import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
// const axios = require('axios');
// const bs58 = require('bs58');
// const { cfg } = require('../config');
// const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');

// // Jupiter V6 swap API: request serialized transaction then sign+send. :contentReference[oaicite:8]{index=8}
// export async function executeSolSwap({ tokenIn, tokenOut, amountIn, slippageBps }) {
//   const connection = new Connection(cfg.sol.rpc, 'confirmed');
//   const secret = bs58.decode(cfg.sol.privateKeyBase58);
//   const kp = Keypair.fromSecretKey(secret);

//   const { data } = await axios.post('https://quote-api.jup.ag/v6/swap', {
//     inputMint: tokenIn,
//     outputMint: tokenOut,
//     amount: Number(amountIn),           // in tokenIn base units
//     slippageBps: slippageBps || 50,
//     userPublicKey: kp.publicKey.toBase58(),
//     wrapAndUnwrapSol: true,
//     asLegacyTransaction: false
//   });

//   const txBuf = Buffer.from(data.swapTransaction, 'base64');
//   const tx = VersionedTransaction.deserialize(txBuf);
//   tx.sign([kp]);

//   const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
//   await connection.confirmTransaction(sig, 'confirmed');

//   return sig;
// }

const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');
const cfg = require('../config'); // adjust path to where your cfg is defined


const QUICKNODE_SOL = process.env.QUICKNODE_SOL; // your Solana endpoint

async function getSolTxsForAddress(address) {
  const res = await axios.post(QUICKNODE_SOL, {
    jsonrpc: "2.0",
    id: 1,
    method: "getSignaturesForAddress",
    params: [address, { limit: 5 }]
  });

  return res.data.result || [];
}


async function executeSolSwap({ tokenIn, tokenOut, amountIn, slippageBps }) {
  const connection = new Connection(cfg.sol.rpc, 'confirmed');
  const secret = bs58.decode(cfg.sol.privateKeyBase58);
  const kp = Keypair.fromSecretKey(secret);

  const { data } = await axios.post('https://quote-api.jup.ag/v6/swap', {
    inputMint: tokenIn,
    outputMint: tokenOut,
    amount: Number(amountIn),           // in tokenIn base units
    slippageBps: slippageBps || 50,
    userPublicKey: kp.publicKey.toBase58(),
    wrapAndUnwrapSol: true,
    asLegacyTransaction: false
  });

  const txBuf = Buffer.from(data.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([kp]);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction(sig, 'confirmed');

  return sig;
}

module.exports = {
  executeSolSwap
};
