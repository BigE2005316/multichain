// export const Risk = {
//   applyFollowerLimits(leaderAmountIn, ratio, maxUsdPerTrade) {
//     // For real: convert to USD via pricing (not included here).
//     const amountForFollower = BigInt(leaderAmountIn) * BigInt(Math.floor(ratio * 1e6)) / BigInt(1e6);
//     // TODO: price check vs maxUsdPerTrade
//     return amountForFollower.toString();
//   }
// };

const Risk = {
  applyFollowerLimits(leaderAmountIn, ratio, maxUsdPerTrade) {
    // For real: convert to USD via pricing (not included here).
    const amountForFollower =
      BigInt(leaderAmountIn) * BigInt(Math.floor(ratio * 1e6)) / BigInt(1e6);

    // TODO: price check vs maxUsdPerTrade
    return amountForFollower.toString();
  }
};

module.exports = { Risk };
