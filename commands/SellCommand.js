// commands/SellCommand.js - Clean Sell Command Implementation
const { getServiceManager } = require('../core/ServiceManager');

class SellCommand {
  constructor(botCore) {
    this.botCore = botCore;
    this.serviceManager = getServiceManager();
  }

  register() {
    // Main sell command
    this.botCore.registerCommand('sell', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      
      if (args.length === 0) {
        return ctx.reply(`💸 **Sell Command Usage:**

**Percentage Sell:**
• \`/sell 25%\` - Sell 25% of all positions
• \`/sell 50% <token_address>\` - Sell 50% of specific token
• \`/sell all\` - Sell all positions

**Amount Sell:**
• \`/sell 1000 <token_address>\` - Sell 1000 tokens
• \`/sell <token_address>\` - Sell all of specific token

**Examples:**
• \`/sell 50% BONK\`
• \`/sell all\`
• \`/sell 1000 So11111111111111111111111111111111111111112\`

✨ **Real blockchain execution enabled**`, 
          { parse_mode: 'Markdown' });
      }

      await this.processSellCommand(ctx, args);
    });

    // Text handler for sell confirmation
    this.botCore.registerTextHandler('awaiting_sell_confirmation', async (ctx) => {
      await this.handleSellConfirmation(ctx);
    });
  }

  async processSellCommand(ctx, args) {
    try {
      const userId = ctx.from.id;
      
      // Get user service
      const userService = await this.serviceManager.getService('userService');
      const userSettings = await userService.getUserSettings(userId);
      
      if (!userSettings) {
        return ctx.reply('❌ Please set up your account first with /start');
      }

      const loadingMsg = await ctx.reply('🔍 Analyzing your positions...');

      try {
        // Get user positions
        const tradingService = await this.serviceManager.getService('tradingService');
        const positions = await tradingService.getUserPositions(userId);
        
        if (!positions || positions.length === 0) {
          await ctx.telegram.editMessageText(
            ctx.chat.id, loadingMsg.message_id, undefined,
            '📭 No positions found. Use /buy to start trading!'
          );
          return;
        }

        // Parse sell parameters
        const sellParams = this.parseSellArguments(args, positions);
        
        if (!sellParams.isValid) {
          await ctx.telegram.editMessageText(
            ctx.chat.id, loadingMsg.message_id, undefined,
            `❌ ${sellParams.error}`
          );
          return;
        }

        // Create confirmation message
        const confirmationMessage = await this.createSellConfirmationMessage(sellParams, userSettings.chain);
        
        // Store sell details in session
        this.botCore.setState(ctx, 'awaiting_sell_confirmation', {
          sellParams,
          timestamp: Date.now()
        });

        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, undefined,
          confirmationMessage,
          { parse_mode: 'Markdown' }
        );

      } catch (error) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, undefined,
          `❌ Error analyzing positions: ${error.message}`
        );
      }

    } catch (error) {
      console.error('Sell command error:', error);
      await ctx.reply('❌ Error processing sell command. Please try again.');
    }
  }

  parseSellArguments(args, positions) {
    const result = {
      isValid: false,
      error: '',
      type: '', // 'percentage', 'amount', 'all'
      percentage: 0,
      amount: 0,
      tokenAddress: null,
      selectedPositions: []
    };

    if (args.length === 1) {
      const param = args[0].toLowerCase();
      
      if (param === 'all') {
        result.type = 'all';
        result.selectedPositions = positions;
        result.isValid = true;
      } else if (param.endsWith('%')) {
        const percentage = parseFloat(param.replace('%', ''));
        if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
          result.error = 'Invalid percentage. Use 1-100%';
          return result;
        }
        result.type = 'percentage';
        result.percentage = percentage;
        result.selectedPositions = positions;
        result.isValid = true;
      } else {
        // Assume it's a token address/symbol
        const position = positions.find(p => 
          p.tokenAddress.toLowerCase() === param.toLowerCase() ||
          p.tokenSymbol.toLowerCase() === param.toLowerCase()
        );
        if (!position) {
          result.error = 'Token not found in your positions';
          return result;
        }
        result.type = 'all';
        result.tokenAddress = position.tokenAddress;
        result.selectedPositions = [position];
        result.isValid = true;
      }
    } else if (args.length === 2) {
      const firstParam = args[0];
      const secondParam = args[1];
      
      if (firstParam.endsWith('%')) {
        const percentage = parseFloat(firstParam.replace('%', ''));
        if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
          result.error = 'Invalid percentage. Use 1-100%';
          return result;
        }
        
        const position = positions.find(p => 
          p.tokenAddress.toLowerCase() === secondParam.toLowerCase() ||
          p.tokenSymbol.toLowerCase() === secondParam.toLowerCase()
        );
        if (!position) {
          result.error = 'Token not found in your positions';
          return result;
        }
        
        result.type = 'percentage';
        result.percentage = percentage;
        result.tokenAddress = position.tokenAddress;
        result.selectedPositions = [position];
        result.isValid = true;
      } else {
        // Amount and token
        const amount = parseFloat(firstParam);
        if (isNaN(amount) || amount <= 0) {
          result.error = 'Invalid amount';
          return result;
        }
        
        const position = positions.find(p => 
          p.tokenAddress.toLowerCase() === secondParam.toLowerCase() ||
          p.tokenSymbol.toLowerCase() === secondParam.toLowerCase()
        );
        if (!position) {
          result.error = 'Token not found in your positions';
          return result;
        }
        
        if (amount > position.balance) {
          result.error = `Insufficient balance. You have ${position.balance} ${position.tokenSymbol}`;
          return result;
        }
        
        result.type = 'amount';
        result.amount = amount;
        result.tokenAddress = position.tokenAddress;
        result.selectedPositions = [position];
        result.isValid = true;
      }
    } else {
      result.error = 'Invalid command format. Use /sell for help.';
    }

    return result;
  }

  async createSellConfirmationMessage(sellParams, chain) {
    const chainEmoji = this.getChainEmoji(chain);
    const chainSymbol = this.getChainSymbol(chain);

    let message = `🔴 **Confirm SELL Order** ${chainEmoji}\n\n`;
    
    if (sellParams.type === 'all' && sellParams.selectedPositions.length > 1) {
      message += `🎯 **Selling ALL Positions (${sellParams.selectedPositions.length} tokens)**\n\n`;
    } else if (sellParams.type === 'percentage') {
      message += `🎯 **Selling ${sellParams.percentage}% of Position(s)**\n\n`;
    } else {
      const position = sellParams.selectedPositions[0];
      message += `🎯 **${position.tokenName}** (${position.tokenSymbol})\n\n`;
    }

    let totalValue = 0;
    
    message += `📊 **Position Details:**\n`;
    for (const position of sellParams.selectedPositions) {
      let sellAmount = position.balance;
      
      if (sellParams.type === 'percentage') {
        sellAmount = position.balance * (sellParams.percentage / 100);
      } else if (sellParams.type === 'amount') {
        sellAmount = sellParams.amount;
      }
      
      const sellValue = sellAmount * position.currentPrice;
      totalValue += sellValue;
      
      message += `• **${position.tokenSymbol}:** ${sellAmount.toFixed(4)} tokens\n`;
      message += `  └ Value: ~$${sellValue.toFixed(2)} (${(sellAmount/position.balance*100).toFixed(1)}%)\n`;
    }
    
    message += `\n💰 **Order Summary:**\n`;
    message += `• **Total Est. Value:** $${totalValue.toFixed(2)}\n`;
    message += `• **Network:** ${chain.toUpperCase()}\n`;
    
    const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3');
    const devFee = totalValue * (devFeePercent / 100);
    message += `• **Dev Fee (${devFeePercent}%):** $${devFee.toFixed(2)}\n`;
    message += `• **Net Proceeds:** $${(totalValue - devFee).toFixed(2)}\n`;
    
    message += `\n✅ **Reply YES to confirm or NO to cancel**\n`;
    message += `⏰ Expires in 60 seconds`;

    return message;
  }

  async handleSellConfirmation(ctx) {
    const response = ctx.message.text.toLowerCase();
    const sellData = this.botCore.getData(ctx);

    if (response === 'yes' || response === 'y') {
      await this.executeSellOrder(ctx, sellData);
    } else if (response === 'no' || response === 'n') {
      this.botCore.clearSession(ctx);
      await ctx.reply('❌ Sell order cancelled.');
    } else {
      await ctx.reply('❌ Please reply with YES to confirm or NO to cancel.');
    }
  }

  async executeSellOrder(ctx, sellData) {
    try {
      const loadingMsg = await ctx.reply('⚡ Executing sell order...');
      
      const tradingService = await this.serviceManager.getService('tradingService');
      const results = [];
      
      for (const position of sellData.sellParams.selectedPositions) {
        let sellAmount = position.balance;
        
        if (sellData.sellParams.type === 'percentage') {
          sellAmount = position.balance * (sellData.sellParams.percentage / 100);
        } else if (sellData.sellParams.type === 'amount') {
          sellAmount = sellData.sellParams.amount;
        }
        
        const result = await tradingService.executeSell({
          userId: ctx.from.id,
          tokenAddress: position.tokenAddress,
          amount: sellAmount,
          position: position
        });
        
        results.push({ ...result, tokenSymbol: position.tokenSymbol });
      }

      this.botCore.clearSession(ctx);

      // Create results message
      let message = `🔴 **SELL Order Results**\n\n`;
      
      let totalProceeds = 0;
      let successCount = 0;
      
      for (const result of results) {
        if (result.success) {
          successCount++;
          totalProceeds += result.proceeds;
          message += `✅ **${result.tokenSymbol}:**\n`;
          message += `• Sold: ${result.amountSold.toFixed(4)} tokens\n`;
          message += `• Proceeds: $${result.proceeds.toFixed(2)}\n`;
          message += `• TX: \`${result.txHash}\`\n\n`;
        } else {
          message += `❌ **${result.tokenSymbol}:** ${result.message}\n\n`;
        }
      }
      
      message += `📊 **Summary:**\n`;
      message += `• **Successful:** ${successCount}/${results.length}\n`;
      message += `• **Total Proceeds:** $${totalProceeds.toFixed(2)}\n`;
      message += `⏰ **Time:** ${new Date().toLocaleString()}`;

      await ctx.telegram.editMessageText(
        ctx.chat.id, loadingMsg.message_id, undefined,
        message, { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Sell execution error:', error);
      await ctx.reply('❌ Failed to execute sell order. Please try again.');
      this.botCore.clearSession(ctx);
    }
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

module.exports = SellCommand; 