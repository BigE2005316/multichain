// commands/PositionsCommand.js - View Trading Positions
const { getServiceManager } = require('../core/ServiceManager');
const userService = require('../users/userService');
const tokenDataService = require('../services/tokenDataService');

class PositionsCommand {
  constructor(botCore) {
    this.botCore = botCore;
    this.serviceManager = getServiceManager();
  }

  register() {
    // Main positions command
    this.botCore.registerCommand('positions', async (ctx) => {
      await this.showPositions(ctx);
    });

    // Alternative command
    this.botCore.registerCommand('portfolio', async (ctx) => {
      await this.showPositions(ctx);
    });
  }

  async showPositions(ctx) {
    try {
      const userId = ctx.from.id;
      const userSettings = await userService.getUserSettings(userId);
      
      if (!userSettings) {
        return ctx.reply('❌ Please set up your account first with /start');
      }

      const loadingMsg = await ctx.reply('📊 Loading your positions...');

      try {
        // Get user positions from trading history
        const positions = await this.getUserPositions(userId);
        
        if (!positions || positions.length === 0) {
          await ctx.telegram.editMessageText(
            ctx.chat.id, loadingMsg.message_id, undefined,
            `📭 **No Positions Found**

You don't have any active trading positions yet.

🚀 **Get Started:**
• Use /buy to purchase tokens
• Use /setchain to switch networks
• Use /wallet to fund your account

💡 **Tip:** After buying tokens, they'll appear here with live P&L tracking!`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        // Create positions message
        const message = await this.createPositionsMessage(positions, userSettings.chain);
        
        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, undefined,
          message,
          { parse_mode: 'Markdown' }
        );

      } catch (error) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, undefined,
          `❌ Error loading positions: ${error.message}`
        );
      }

    } catch (error) {
      console.error('Positions command error:', error);
      await ctx.reply('❌ Error retrieving positions. Please try again.');
    }
  }

  async getUserPositions(userId) {
    try {
      // This would typically get data from a database
      // For now, we'll simulate with some sample data
      const mockPositions = [
        {
          tokenAddress: 'So11111111111111111111111111111111111111112',
          tokenName: 'Wrapped SOL',
          tokenSymbol: 'SOL',
          balance: 0.5,
          averageBuyPrice: 23.45,
          currentPrice: 25.12,
          investedAmount: 11.725,
          currentValue: 12.56,
          pnl: 0.835,
          pnlPercent: 7.12,
          lastUpdated: Date.now()
        }
      ];

      return mockPositions;

    } catch (error) {
      console.error('Error getting user positions:', error);
      return [];
    }
  }

  async createPositionsMessage(positions, chain) {
    const chainEmoji = this.getChainEmoji(chain);
    const chainSymbol = this.getChainSymbol(chain);

    let message = `📊 **Your Trading Portfolio** ${chainEmoji}\n\n`;
    
    // Calculate totals
    let totalInvested = 0;
    let totalValue = 0;
    let totalPnL = 0;
    
    for (const position of positions) {
      totalInvested += position.investedAmount;
      totalValue += position.currentValue;
      totalPnL += position.pnl;
    }
    
    const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
    
    // Portfolio Summary
    message += `💰 **Portfolio Summary:**\n`;
    message += `• **Total Invested:** $${totalInvested.toFixed(2)}\n`;
    message += `• **Current Value:** $${totalValue.toFixed(2)}\n`;
    
    const pnlEmoji = totalPnL >= 0 ? '📈' : '📉';
    const pnlColor = totalPnL >= 0 ? '+' : '';
    message += `• **Total P&L:** ${pnlEmoji} ${pnlColor}$${totalPnL.toFixed(2)} (${pnlColor}${totalPnLPercent.toFixed(2)}%)\n`;
    message += `• **Positions:** ${positions.length}\n\n`;
    
    // Individual Positions
    message += `🎯 **Individual Positions:**\n\n`;
    
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const positionPnLEmoji = pos.pnl >= 0 ? '📈' : '📉';
      const positionPnLColor = pos.pnl >= 0 ? '+' : '';
      
      message += `**${i + 1}. ${pos.tokenName}** (${pos.tokenSymbol})\n`;
      message += `• **Balance:** ${pos.balance.toFixed(4)} ${pos.tokenSymbol}\n`;
      message += `• **Avg Buy:** $${pos.averageBuyPrice.toFixed(6)}\n`;
      message += `• **Current:** $${pos.currentPrice.toFixed(6)}\n`;
      message += `• **Invested:** $${pos.investedAmount.toFixed(2)}\n`;
      message += `• **Value:** $${pos.currentValue.toFixed(2)}\n`;
      message += `• **P&L:** ${positionPnLEmoji} ${positionPnLColor}$${pos.pnl.toFixed(2)} (${positionPnLColor}${pos.pnlPercent.toFixed(2)}%)\n`;
      message += `• **Contract:** \`${pos.tokenAddress}\`\n`;
      
      if (i < positions.length - 1) {
        message += `\n`;
      }
    }
    
    message += `\n📊 **Quick Actions:**\n`;
    message += `• /sell 25% - Sell 25% of all positions\n`;
    message += `• /sell all - Sell all positions\n`;
    message += `• /buy <token> - Add to portfolio\n`;
    message += `• /balance - Check wallet balance\n\n`;
    
    message += `🔄 **Auto-refreshed:** ${new Date().toLocaleString()}\n`;
    message += `💡 **Tip:** Use /sell to take profits or cut losses`;

    return message;
  }

  getChainEmoji(chain) {
    const emojis = {
      'solana': '🟣',
      'ethereum': '🔷',
      'bsc': '🟡',
      'polygon': '🟠',
      'arbitrum': '🔵',
      'base': '🔴'
    };
    return emojis[chain] || '⚪';
  }

  getChainSymbol(chain) {
    const symbols = {
      'solana': 'SOL',
      'ethereum': 'ETH',
      'bsc': 'BNB',
      'polygon': 'MATIC',
      'arbitrum': 'ETH',
      'base': 'ETH'
    };
    return symbols[chain] || 'TOKEN';
  }
}

module.exports = PositionsCommand; 