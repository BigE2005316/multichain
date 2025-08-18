// Parse Solana swap from Helius payload (enhanced or raw)
// Tip: Helius enhanced includes parsed "swap" types for Raydium/Jupiter. :contentReference[oaicite:6]{index=6}
// export async function parseSolTrade(data) {
//   const events = data?.events || [];
//   const swap = events.find(e => (e.type || '').toLowerCase().includes('swap'));
//   if (!swap) return null;

//   return {
//     chain: 'SOL',
//     leader: data.account?.toLowerCase?.() || (swap?.source || '').toLowerCase(),
//     txHash: data?.signature || data?.txHash || '',
//     tokenIn: swap?.tokenInputs?.[0]?.mint || swap?.mintA,
//     tokenOut: swap?.tokenOutputs?.[0]?.mint || swap?.mintB,
//     amountIn: String(swap?.tokenInputs?.[0]?.amount || 0),
//     amountOutMin: null
//   };
// }


async function parseSolTrade(data) {
  const events = data?.events || [];
  const swap = events.find(e => (e.type || '').toLowerCase().includes('swap'));
  if (!swap) return null;

  return {
    chain: 'SOL',
    leader: (data.account && data.account.toLowerCase?.()) || (swap?.source || '').toLowerCase(),
    txHash: data?.signature || data?.txHash || '',
    tokenIn: swap?.tokenInputs?.[0]?.mint || swap?.mintA,
    tokenOut: swap?.tokenOutputs?.[0]?.mint || swap?.mintB,
    amountIn: String(swap?.tokenInputs?.[0]?.amount || 0),
    amountOutMin: null
  };
}

module.exports = { parseSolTrade };
