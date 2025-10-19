const userService = require('../../users/userService');
const walletService = require('../../services/walletService');
const tokenDataService = require('../../services/tokenDataService');
const User = require('../models/User');

class TPSLMonitorService {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.checkInterval = 10000; // 10 seconds
  }

  async start() {
    console.log('🎯 Initializing TP/SL Monitor Service...');
    if (this.isRunning) return;
    
    console.log('🎯 Starting TP/SL Monitor Service...');
    this.isRunning = true;
    
    this.interval = setInterval(async () => {
      try {
        console.log('🔄 Checking all user positions for TP/SL...');
        await this.checkAllPositions();
        console.log('✅ TP/SL check complete');
      } catch (error) {
        console.error('❌ TP/SL Monitor error:', error);
      }
    }, this.checkInterval);
    
    console.log('✅ TP/SL Monitor Service started');
  }

  async stop() {
    if (!this.isRunning) return;
    
    console.log('🛑 Stopping TP/SL Monitor Service...');
    this.isRunning = false;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    console.log('✅ TP/SL Monitor Service stopped');
  }

  async checkAllPositions() {
    try {
      // Get all users with custom TP/SL enabled
      const allUsers = await User.find({ 'customTPSL.enabled': true });
      
      for (const userData of allUsers) {
        console.log(`🔍 Checking positions for user ${userData.tgId}`);
        await this.checkUserPositions(userData);
      }
    } catch (error) {
      console.error('Error checking all positions:', error);
    }
  }

  async checkUserPositions(userData) {
    try {
      debugger
      const userId = userData.tgId;
      console.log(`🔍 Checking TP/SL for user ${userId}`);
      // Check each chain's wallet
      if (!userData.custodialWallets) return;
      console.log(`🔍 Checking wallets for user ${userId}`);
      debugger
      for (const [chain, wallets] of Object.entries(userData.custodialWallets)) {
        if (!Array.isArray(wallets) || wallets.length === 0) continue;
        console.log(`🔍 Checking chain ${chain} for user ${userId}`);
        const wallet = wallets[0]; // Use first wallet
        if (!wallet.address) continue;

        // Get wallet's token positions (you'll need to implement this)
        const positions = await this.getWalletPositions(wallet.address, chain);
        console.log(`🔍 Found ${positions.length} positions for user ${userId} on ${chain}`);
        for (const position of positions) {
          await this.checkPositionTPSL(userId, position, userData.customTPSL, chain);
        }
      }
    } catch (error) {
      console.error(`Error checking positions for user ${userData.tgId}:`, error);
    }
  }

  async getWalletPositions(address, chain) {
    try {
      // Mock implementation - you'll need to implement actual position tracking
      // This should return positions with { tokenAddress, balance, entryPrice, currentPrice }
      return [];
    } catch (error) {
      console.error('Error getting wallet positions:', error);
      return [];
    }
  }

  async checkPositionTPSL(userId, position, tpslConfig, chain) {
    try {
      const { tokenAddress, balance, entryPrice, currentPrice } = position;
      
      if (!tokenAddress || !entryPrice || balance <= 0 || !currentPrice) return;

      // Calculate P&L percentage
      const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

      // Check Take Profits
      await this.checkTakeProfits(userId, position, pnlPercent, tpslConfig.takeProfits, chain);

      // Check Stop Loss
      await this.checkStopLoss(userId, position, pnlPercent, tpslConfig.stopLoss, chain, currentPrice, entryPrice);

    } catch (error) {
      console.error('Error checking position TP/SL:', error);
    }
  }

  async checkTakeProfits(userId, position, pnlPercent, takeProfits, chain) {
    if (!takeProfits || takeProfits.length === 0) return;

    for (const tp of takeProfits) {
      if (tp.triggered || pnlPercent < tp.percent) continue;

      try {
        // Calculate sell amount
        const sellAmount = position.balance * (tp.sellPercent / 100);
        
        // Execute partial sell
        await this.executeSell(userId, position.tokenAddress, sellAmount, chain, `TP ${tp.percent}%`);
        
        // Mark as triggered
        tp.triggered = true;
        
        // Update user data
        const user = await User.findOne({ tgId: String(userId) });
        if (user) {
          user.customTPSL.takeProfits = takeProfits;
          await user.save();
        }
        
        console.log(`✅ TP triggered for user ${userId}: ${tp.percent}% - sold ${tp.sellPercent}%`);
      } catch (error) {
        console.error('Error executing take profit:', error);
      }
    }
  }

  async checkStopLoss(userId, position, pnlPercent, stopLoss, chain, currentPrice, entryPrice) {
    if (!stopLoss || stopLoss.triggered) return;

    let triggerSL = false;

    if (stopLoss.trailing) {
      // Trailing stop loss logic
      if (!stopLoss.highWaterMark) {
        stopLoss.highWaterMark = Math.max(entryPrice, currentPrice);
      }
      
      stopLoss.highWaterMark = Math.max(stopLoss.highWaterMark, currentPrice);
      const trailingPrice = stopLoss.highWaterMark * (1 + stopLoss.percent / 100);
      
      if (currentPrice <= trailingPrice) {
        triggerSL = true;
      }
    } else {
      // Fixed stop loss
      if (pnlPercent <= stopLoss.percent) {
        triggerSL = true;
      }
    }

    if (triggerSL) {
      try {
        // Execute full sell
        await this.executeSell(userId, position.tokenAddress, position.balance, chain, `SL ${stopLoss.percent}%`);
        
        // Mark as triggered
        stopLoss.triggered = true;
        
        // Update user data
        const user = await User.findOne({ tgId: String(userId) });
        if (user) {
          user.customTPSL.stopLoss = stopLoss;
          await user.save();
        }
        
        console.log(`✅ SL triggered for user ${userId}: ${stopLoss.percent}% - sold 100%`);
      } catch (error) {
        console.error('Error executing stop loss:', error);
      }
    }
  }

  async executeSell(userId, tokenAddress, amount, chain, reason) {
    try {
      // Use your existing sell command logic
      const SellCommand = require('../commands/SellCommand');
      console.log(`🎯 Executing auto-sell for user ${userId}: ${reason} - Token: ${tokenAddress}, Amount: ${amount}`);
      // Mock execution - implement actual sell logic
      console.log(`🎯 Auto-sell triggered: ${reason} - User: ${userId}, Token: ${tokenAddress}, Amount: ${amount}`);
      
      // You would call your actual sell execution here
      // const result = await sellCommand.executeSell({ userId, tokenAddress, amount, chain });
      
      return { success: true, reason };
    } catch (error) {
      console.error('Error executing auto-sell:', error);
      throw error;
    }
  }
}

// Singleton instance
const tpslMonitor = new TPSLMonitorService();

module.exports = tpslMonitor;