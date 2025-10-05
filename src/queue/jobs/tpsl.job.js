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

// ...existing code...
class TPSLJob {
  // ...existing code...
  async monitorPositions() {
    setInterval(async () => {
      try{
      const allUsers = await userService.getAllUsersWithWallets();
      for (const user of allUsers) {
        if (!user.customTPSL?.enabled) continue;
        for (const [tokenAddress, position] of Object.entries(user.positions || {})) {
          const chain = position.chain || user.chain || 'solana';
          const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
          if (!tokenInfo || !tokenInfo.price) continue;
          const currentPrice = tokenInfo.price;
          const entryPrice = position.avgPrice || position.avgBuyPrice || 0;
          if (!entryPrice) continue;

          // Calculate profit/loss %
          const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

          // Check take profits
          for (const tp of user.customTPSL.takeProfits || []) {
            if (!tp.triggered && pnlPercent >= tp.percent) {
              // Trigger partial sell
              await this.executeSell({
                userId: user.tgId,
                tokenAddress,
                amount: position.balance * (tp.sellPercent / 100),
                chain,
                reason: `TP ${tp.percent}%`
              });
              tp.triggered = true;
              await userService.saveUserData(user.tgId, user);
            }
          }

          // Check stop loss
          const sl = user.customTPSL.stopLoss;
          if (sl && !sl.triggered) {
            let triggerSL = false;
            if (sl.trailing) {
              // Trailing SL logic
              sl.highWaterMark = Math.max(sl.highWaterMark || entryPrice, currentPrice);
              const trailingPrice = sl.highWaterMark * (1 + sl.percent / 100);
              if (currentPrice <= trailingPrice) triggerSL = true;
            } else {
              if (pnlPercent <= sl.percent) triggerSL = true;
            }
            if (triggerSL) {
              await this.executeSell({
                userId: user.tgId,
                tokenAddress,
                amount: position.balance,
                chain,
                reason: `SL ${sl.percent}%`
              });
              sl.triggered = true;
              await userService.saveUserData(user.tgId, user);
            }
          }
        }
      }
      }
      catch(Error e){
        console.error('Error monitoring positions:', e);
      }
    }, 120000); // Check every 120 seconds
  }
  // ...existing code...
}
// ...existing code...


module.exports = { TPSLJob };

