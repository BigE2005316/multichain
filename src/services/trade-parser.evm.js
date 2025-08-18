// Parse a swap from Moralis tx+log payload
// You can expand to detect router addresses and decode event topics via ABI.
// export async function parseEvmTrade(payload) {
//   const tx = payload?.txs?.[0];
//   if (!tx) return null;

//   // crude: look for Swap/Transfer logs to infer tokenIn/tokenOut
//   // Better: attach ABI filters in your Moralis Stream config.
//   const logs = tx.logs || [];
//   let tokenIn = null, tokenOut = null;
//   for (const l of logs) {
//     // ERC20 Transfer topic 0:
//     if (l.topic0 === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
//       // when 'from' is leader, treat that token as tokenIn, else tokenOut
//       if (l?.decodedEvent?.from?.toLowerCase() === tx.fromAddress?.toLowerCase()) tokenIn = l.address;
//       if (l?.decodedEvent?.to?.toLowerCase() === tx.fromAddress?.toLowerCase()) tokenOut = l.address;
//     }
//   }
//   if (!tokenIn && !tokenOut) return null;

//   const amountIn = tx.value && tx.value !== '0' ? tx.value : '0'; // could be native swap
//   return {
//     chain: 'EVM',
//     leader: tx.fromAddress.toLowerCase(),
//     txHash: tx.hash,
//     tokenIn,
//     tokenOut,
//     amountIn,
//     amountOutMin: null // follower decides via slippage
//   };
// }

async function parseEvmTrade(payload) {
  const tx = payload?.txs?.[0];
  if (!tx) return null;

  // crude: look for Swap/Transfer logs to infer tokenIn/tokenOut
  // Better: attach ABI filters in your Moralis Stream config.
  const logs = tx.logs || [];
  let tokenIn = null, tokenOut = null;
  for (const l of logs) {
    // ERC20 Transfer topic 0:
    if (l.topic0 === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
      // when 'from' is leader, treat that token as tokenIn, else tokenOut
      if (l?.decodedEvent?.from?.toLowerCase() === tx.fromAddress?.toLowerCase()) {
        tokenIn = l.address;
      }
      if (l?.decodedEvent?.to?.toLowerCase() === tx.fromAddress?.toLowerCase()) {
        tokenOut = l.address;
      }
    }
  }
  if (!tokenIn && !tokenOut) return null;

  const amountIn = tx.value && tx.value !== '0' ? tx.value : '0'; // could be native swap
  return {
    chain: 'EVM',
    leader: tx.fromAddress.toLowerCase(),
    txHash: tx.hash,
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMin: null // follower decides via slippage
  };
}

module.exports = { parseEvmTrade };
