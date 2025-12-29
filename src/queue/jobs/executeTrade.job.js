// import TradeLog from '../../models/TradeLog.js';
// import User from '../../models/User.js';
// import { Risk } from '../../../services/risk.service.js';
// import { executeEvmSwap } from '../../../services/executor.evm.js';
// import { executeSolSwap } from '../../../services/executor.sol.js';
const TradeLog = require('../../models/TradeLog.js');
const User = require('../../models/User.js');
const { Risk } = require('../../services/risk.service.js');
const { executeEvmSwap } = require('../../services/executor.evm.js');
const { executeSolSwap } = require('../../services/executor.sol.js');

async function executeTradeJob(job) {
  const { chain, tradeLogId, parsed } = job.data;
  const log = await TradeLog.findById(tradeLogId);
  if (!log) return;

  const followers = log.followers;
  for (let i = 0; i < followers.length; i++) {
    const f = followers[i];
    try {
      const user = await User.findById(f.userId);
      if (!user) continue;

      // Use custom parameters if present, else fallback to user settings
      const amountForUser = f.customAmount || (user.follows.find(
        (x) =>
          x.chain === chain &&
          x.address.toLowerCase() === log.leader.toLowerCase() &&
          x.active
      )?.ratio || 1) * (parsed.amountIn || "0");
      const slippageBps = f.customSlippage || 50;

      let txid;
      if (chain === "EVM") {
        txid = await executeEvmSwap({
          tokenIn: parsed.tokenIn,
          tokenOut: parsed.tokenOut,
          amountIn: amountForUser,
          slippageBps,
        });
      } else {
        txid = await executeSolSwap({
          tokenIn: parsed.tokenIn,
          tokenOut: parsed.tokenOut,
          amountIn: amountForUser,
          slippageBps,
        });
      }

      log.followers[i].status = "EXECUTED";
      log.followers[i].execTx = txid;
      await log.save();
    } catch (e) {
      log.followers[i].status = "FAILED";
      log.followers[i].error = e.message;
      await log.save();
    }
  }
}

module.exports = { executeTradeJob };

// export async function executeTradeJob(job) {
//   const { chain, tradeLogId, parsed } = job.data;
//   const log = await TradeLog.findById(tradeLogId);
//   if (!log) return;

//   const followers = log.followers;
//   for (let i = 0; i < followers.length; i++) {
//     const f = followers[i];
//     try {
//       const user = await User.findById(f.userId);
//       if (!user) continue;

//       const uFollow = user.follows.find(x => x.chain === chain && x.address.toLowerCase() === log.leader.toLowerCase() && x.active);
//       if (!uFollow) continue;

//       const amountForUser = Risk.applyFollowerLimits(parsed.amountIn || '0', uFollow.ratio, uFollow.maxUsdPerTrade);

//       let txid;
//       if (chain === 'EVM') {
//         txid = await executeEvmSwap({
//           tokenIn: parsed.tokenIn,
//           tokenOut: parsed.tokenOut,
//           amountIn: amountForUser,
//           slippageBps: uFollow.slippageBps
//         });
//       } else {
//         txid = await executeSolSwap({
//           tokenIn: parsed.tokenIn,
//           tokenOut: parsed.tokenOut,
//           amountIn: amountForUser,
//           slippageBps: uFollow.slippageBps
//         });
//       }

//       log.followers[i].status = 'EXECUTED';
//       log.followers[i].execTx = txid;
//       await log.save();
//     } catch (e) {
//       log.followers[i].status = 'FAILED';
//       log.followers[i].error = e.message;
//       await log.save();
//     }
//   }
// }
