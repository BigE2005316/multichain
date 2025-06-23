// commands/BuyCommand.js - Enhanced Buy Command with Token Analysis
const { getServiceManager } = require('../core/ServiceManager');
const userService = require('../users/userService');
const walletService = require('../services/walletService');
const tokenDataService = require('../services/tokenDataService');
const realTradingExecutor = require('../services/realTradingExecutor');

class BuyCommand {
  constructor(botCore) {
    this.botCore = botCore;
    this.serviceManager = getServiceManager();
  }

  register() {
    // Main buy command
    this.botCore.registerCommand('buy', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      
      if (args.length === 0) {
        return ctx.reply(`💰 **Buy Command Usage:**

**Quick Buy:**
• \`/buy <token_address>\` - Buy with default amount
• \`/buy <amount> <token_address>\` - Buy specific amount

**Examples:**
• \`/buy 0.1 So11111111111111111111111111111111111111112\`
• \`/buy BONK\`
• \`/buy 0.5 0x742d35Cc6634C0532925a3b844Bc454e4438f44e\`

**Advanced:**
• Use /settings to set default amount and slippage
• Use /setchain to switch blockchain networks

✨ **Real blockchain execution with comprehensive token analysis**`, 
          { parse_mode: 'Markdown' });
      }

      await this.processBuyCommand(ctx, args);
    });

    // Chain-specific buy commands
    this.botCore.registerCommand('buyeth', (ctx) => this.handleChainSpecificBuy(ctx, 'ethereum'));
    this.botCore.registerCommand('buybnb', (ctx) => this.handleChainSpecificBuy(ctx, 'bsc'));
    this.botCore.registerCommand('buysol', (ctx) => this.handleChainSpecificBuy(ctx, 'solana'));

    // Text handler for buy confirmation
    this.botCore.registerTextHandler('awaiting_buy_confirmation', async (ctx) => {
      await this.handleBuyConfirmation(ctx);
    });
  }

  async processBuyCommand(ctx, args) {
    try {
      const userId = ctx.from.id;
      
      // Get user settings
      const userSettings = await userService.getUserSettings(userId);
      
      if (!userSettings) {
        return ctx.reply('❌ Please set up your account first with /start');
      }

      // Parse arguments
      let { amount, tokenAddress, chain } = this.parseArguments(args, userSettings);
      
      if (!tokenAddress) {
        return ctx.reply('❌ Please provide a token address or symbol');
      }

      // Validate chain and wallet
      const wallet = await walletService.getUserWallet(userId, chain);
      
      if (!wallet) {
        return ctx.reply(`❌ No ${chain.toUpperCase()} wallet found. Please create one with /wallet`);
      }

      // Show loading message
      const loadingMsg = await ctx.reply('🔍 Analyzing token and fetching comprehensive data...');

      try {
        // Get comprehensive token information
        const tokenInfo = await this.getComprehensiveTokenInfo(tokenAddress, chain);
        
        if (!tokenInfo.success) {
          await ctx.telegram.editMessageText(
            ctx.chat.id, loadingMsg.message_id, undefined,
            `❌ ${tokenInfo.error || 'Failed to get token information. Please check the token address.'}`
          );
          return;
        }

        // Calculate trade details
        const tradeDetails = await this.calculateTradeDetails(userId, tokenInfo.data, amount, chain);
        
        // Create comprehensive confirmation message
        const confirmationMessage = this.createComprehensiveConfirmationMessage(tokenInfo.data, tradeDetails, chain);
        
        // Store trade details in session
        this.botCore.setState(ctx, 'awaiting_buy_confirmation', {
          tokenInfo: tokenInfo.data,
          tradeDetails,
          chain,
          timestamp: Date.now()
        });

        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, undefined,
          confirmationMessage,
          { parse_mode: 'Markdown' }
        );

      } catch (error) {
        console.error('Buy command processing error:', error);
        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, undefined,
          `❌ Error analyzing token: ${error.message}`
        );
      }

    } catch (error) {
      console.error('Buy command error:', error);
      await ctx.reply('❌ Error processing buy command. Please try again.');
    }
  }

  async getComprehensiveTokenInfo(tokenAddress, chain) {
    try {
      // Get basic token data
      const basicInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
      
      if (!basicInfo) {
        return { success: false, error: 'Token not found or invalid address' };
      }

      // Get additional market data
      const marketData = await tokenDataService.getAdvancedTokenData(tokenAddress, chain);
      
      // Combine all data
      const comprehensiveInfo = {
        ...basicInfo,
        marketCap: marketData?.marketCap || 0,
        volume24h: marketData?.volume24h || 0,
        holders: marketData?.holders || 0,
        traders24h: marketData?.traders24h || 0,
        liquidity: marketData?.liquidity || 0,
        liquidityUSD: marketData?.liquidityUSD || 0,
        priceChange1h: marketData?.priceChange1h || 0,
        priceChange24h: marketData?.priceChange24h || 0,
        priceChange7d: marketData?.priceChange7d || 0,
        age: marketData?.age || 'Unknown',
        risk: marketData?.risk || 'Medium',
        verified: marketData?.verified || false,
        topHolders: marketData?.topHolders || [],
        recentTrades: marketData?.recentTrades || []
      };

      return { success: true, data: comprehensiveInfo };

    } catch (error) {
      console.error('Error getting comprehensive token info:', error);
      return { success: false, error: 'Failed to analyze token data' };
    }
  }

  parseArguments(args, userSettings) {
    let amount = userSettings.amount || 0.1;
    let tokenAddress = null;
    let chain = userSettings.chain || 'solana';

    if (args.length === 1) {
      // Just token address/symbol
      tokenAddress = args[0];
    } else if (args.length >= 2) {
      // Amount and token
      const parsedAmount = parseFloat(args[0]);
      if (!isNaN(parsedAmount) && parsedAmount > 0) {
        amount = parsedAmount;
        tokenAddress = args[1];
      } else {
        tokenAddress = args[0];
      }
    }

    return { amount, tokenAddress, chain };
  }

  async calculateTradeDetails(userId, tokenInfo, amount, chain) {
    const userSettings = await userService.getUserSettings(userId);
    
    const slippage = userSettings.slippage || 5;
    const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3');
    const devFee = amount * (devFeePercent / 100);
    const netAmount = amount - devFee;

    // Estimate tokens to receive
    let estimatedTokens = 0;
    let priceImpact = 0;
    
    try {
      if (tokenInfo.price && tokenInfo.price > 0) {
        estimatedTokens = netAmount / tokenInfo.price;
        // Simple price impact calculation (would be more complex in real implementation)
        priceImpact = Math.min((amount / (tokenInfo.liquidityUSD || 1000000)) * 100, 15);
      }
    } catch (error) {
      console.error('Error calculating trade details:', error);
    }

    return {
      amount,
      netAmount,
      devFee,
      devFeePercent,
      slippage,
      estimatedTokens,
      estimatedPrice: tokenInfo.price || 0,
      priceImpact
    };
  }

  createComprehensiveConfirmationMessage(tokenInfo, tradeDetails, chain) {
    const chainEmoji = this.getChainEmoji(chain);
    const chainSymbol = this.getChainSymbol(chain);

    let message = `🟢 **Confirm BUY Order** ${chainEmoji}\n\n`;
    
    // Token Header
    message += `🎯 **${tokenInfo.name || 'Unknown'}** (${tokenInfo.symbol || 'N/A'})\n`;
    if (tokenInfo.verified) {
      message += `✅ **Verified Token**\n`;
    }
    message += `💰 **Amount:** ${tradeDetails.amount} ${chainSymbol}\n\n`;
    
    // Comprehensive Token Analysis
    message += `📊 **Token Analysis:**\n`;
    message += `• **Price:** $${(tokenInfo.price || 0).toFixed(8)}\n`;
    
    if (tokenInfo.marketCap > 0) {
      message += `• **Market Cap:** $${this.formatNumber(tokenInfo.marketCap)}\n`;
    }
    
    if (tokenInfo.volume24h > 0) {
      message += `• **24h Volume:** $${this.formatNumber(tokenInfo.volume24h)}\n`;
    }
    
    if (tokenInfo.liquidity > 0) {
      message += `• **Liquidity:** $${this.formatNumber(tokenInfo.liquidityUSD)}\n`;
    }
    
    if (tokenInfo.holders > 0) {
      message += `• **Holders:** ${tokenInfo.holders.toLocaleString()}\n`;
    }
    
    if (tokenInfo.traders24h > 0) {
      message += `• **24h Traders:** ${tokenInfo.traders24h.toLocaleString()}\n`;
    }
    
    // Price Changes
    if (tokenInfo.priceChange24h !== undefined) {
      const changeEmoji = tokenInfo.priceChange24h >= 0 ? '📈' : '📉';
      message += `• **24h Change:** ${changeEmoji} ${tokenInfo.priceChange24h.toFixed(2)}%\n`;
    }
    
    if (tokenInfo.priceChange1h !== undefined) {
      const changeEmoji = tokenInfo.priceChange1h >= 0 ? '📈' : '📉';
      message += `• **1h Change:** ${changeEmoji} ${tokenInfo.priceChange1h.toFixed(2)}%\n`;
    }
    
    if (tokenInfo.age !== 'Unknown') {
      message += `• **Age:** ${tokenInfo.age}\n`;
    }
    
    // Risk Assessment
    const riskEmoji = this.getRiskEmoji(tokenInfo.risk);
    message += `• **Risk Level:** ${riskEmoji} ${tokenInfo.risk}\n`;
    
    message += `\n📍 **Contract:** \`${tokenInfo.address}\`\n\n`;
    
    // Order Summary
    message += `💰 **Order Summary:**\n`;
    message += `• **Total Cost:** ${tradeDetails.amount} ${chainSymbol}\n`;
    message += `• **Dev Fee (${tradeDetails.devFeePercent}%):** ${tradeDetails.devFee.toFixed(6)} ${chainSymbol}\n`;
    message += `• **Net Amount:** ${tradeDetails.netAmount.toFixed(6)} ${chainSymbol}\n`;
    message += `• **Est. Tokens:** ${tradeDetails.estimatedTokens.toFixed(4)} ${tokenInfo.symbol}\n`;
    message += `• **Slippage:** ${tradeDetails.slippage}%\n`;
    
    if (tradeDetails.priceImpact > 5) {
      message += `\n⚠️ **High Price Impact:** ${tradeDetails.priceImpact.toFixed(2)}%\n`;
    }
    
    if (tradeDetails.priceImpact > 15) {
      message += `🚨 **EXTREME PRICE IMPACT - PROCEED WITH CAUTION**\n`;
    }
    
    // Warnings based on analysis
    if (tokenInfo.risk === 'High') {
      message += `\n🚨 **HIGH RISK TOKEN - Trade carefully**\n`;
    }
    
    if (tokenInfo.liquidityUSD < 10000) {
      message += `\n⚠️ **Low Liquidity Warning**\n`;
    }
    
    message += `\n✅ **Reply YES to confirm or NO to cancel**\n`;
    message += `⏰ Expires in 60 seconds`;

    return message;
  }

  async handleBuyConfirmation(ctx) {
    const response = ctx.message.text.toLowerCase();
    const tradeData = this.botCore.getData(ctx);

    if (response === 'yes' || response === 'y') {
      await this.executeBuyOrder(ctx, tradeData);
    } else if (response === 'no' || response === 'n') {
      this.botCore.clearSession(ctx);
      await ctx.reply('❌ Buy order cancelled.');
    } else {
      await ctx.reply('❌ Please reply with YES to confirm or NO to cancel.');
    }
  }

  async executeBuyOrder(ctx, tradeData) {
    try {
      const loadingMsg = await ctx.reply('⚡ Executing buy order on blockchain...');
      
      // Execute the trade using real trading executor
      const result = await realTradingExecutor.executeBuy({
        userId: ctx.from.id,
        tokenAddress: tradeData.tokenInfo.address,
        amount: tradeData.tradeDetails.amount,
        slippage: tradeData.tradeDetails.slippage,
        chain: tradeData.chain
      });

      this.botCore.clearSession(ctx);

      if (result.success) {
        let message = `🟢 **BUY Order Executed Successfully!**\n\n`;
        message += `🎯 **${tradeData.tokenInfo.name}** (${tradeData.tokenInfo.symbol})\n`;
        message += `💰 **Spent:** ${result.amountSpent} ${this.getChainSymbol(tradeData.chain)}\n`;
        message += `🪙 **Received:** ${result.tokensReceived.toFixed(4)} ${tradeData.tokenInfo.symbol}\n`;
        message += `💵 **Avg Price:** $${result.executedPrice.toFixed(8)}\n`;
        message += `⛽ **Gas:** ${result.gasFee} ${this.getChainSymbol(tradeData.chain)}\n`;
        message += `📈 **Price Impact:** ${result.priceImpact?.toFixed(2) || 0}%\n\n`;
        message += `📝 **TX Hash:** \`${result.txHash}\`\n`;
        
        if (result.explorerUrl) {
          message += `🔍 **Explorer:** [View Transaction](${result.explorerUrl})\n`;
        }
        
        message += `⏰ **Time:** ${new Date().toLocaleString()}`;

        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, undefined,
          message, { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, undefined,
          `❌ Buy order failed: ${result.message || 'Unknown error occurred'}`
        );
      }

    } catch (error) {
      console.error('Buy execution error:', error);
      await ctx.reply('❌ Failed to execute buy order. Please try again.');
      this.botCore.clearSession(ctx);
    }
  }

  async handleChainSpecificBuy(ctx, chain) {
    const args = ctx.message.text.split(' ').slice(1);
    
    // Update user's chain temporarily for this command
    const userSettings = await userService.getUserSettings(ctx.from.id);
    
    const originalChain = userSettings.chain;
    userSettings.chain = chain;
    
    await this.processBuyCommand(ctx, args);
    
    // Restore original chain
    userSettings.chain = originalChain;
  }

  formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  }

  getRiskEmoji(risk) {
    const emojis = {
      'Low': '🟢',
      'Medium': '🟡',
      'High': '🔴'
    };
    return emojis[risk] || '⚪';
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

module.exports = BuyCommand; 