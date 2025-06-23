// commands/EnhancedBuyCommand.js - Professional Buy Command with MEV Protection
const advancedTradingEngine = require('../services/advancedTradingEngine');
const tokenDataService = require('../services/tokenDataService');
const userService = require('../users/userService');
const walletService = require('../services/walletService');

class EnhancedBuyCommand {
  constructor() {
    this.command = 'buy';
    this.description = '💰 Buy tokens with advanced analysis and MEV protection';
    this.usage = '/buy <token_address> [amount] [chain] [slippage] [gas_level]';
    this.aliases = ['b', 'purchase'];
    this.category = 'trading';
  }

  async execute(ctx) {
    const userId = ctx.from.id;
    const messageText = ctx.message.text;
    const args = messageText.split(' ').slice(1);

    let loadingMsg;
    
    try {
      // Show initial loading message
      loadingMsg = await ctx.reply('🔄 Analyzing token and preparing optimal trade route...');

      // Parse arguments with better error handling
      let parsedArgs;
      try {
        parsedArgs = this.parseArguments(args);
      } catch (parseError) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Invalid command format: ${parseError.message}\n\n📖 Usage: ${this.usage}`
        );
        return;
      }
      
      const { tokenAddress, amount, chain, slippage, gasLevel, error } = parsedArgs;
      
      if (error) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ ${error}\n\n📖 Usage: ${this.usage}`
        );
        return;
      }

      // Get user settings with fallback
      let userSettings;
      try {
        userSettings = await userService.getUserSettings(userId);
        if (!userSettings) {
          // Initialize user if not exists
          await userService.initializeUser(userId, {
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            chain: 'ethereum',
            amount: 0.1,
            slippage: 5
          });
          userSettings = await userService.getUserSettings(userId);
        }
      } catch (userError) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ User service error: ${userError.message}\n\nPlease try /start first.`
        );
        return;
      }

      const activeChain = chain || userSettings.activeChain || 'ethereum';
      
      // Validate user has wallet for this chain with better error handling
      let wallet;
      try {
        wallet = await walletService.getUserWallet(userId, activeChain);
        if (!wallet) {
          await ctx.telegram.editMessageText(
            ctx.chat.id, 
            loadingMsg.message_id, 
            undefined, 
            `❌ No wallet found for ${activeChain.toUpperCase()}\n\nUse /wallet to create one first.`
          );
          return;
        }
      } catch (walletError) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Wallet service error: ${walletError.message}\n\nPlease try /wallet to setup your wallet.`
        );
        return;
      }

      // Update loading message
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMsg.message_id, 
        undefined, 
        '🔍 Performing comprehensive token analysis...'
      );

      // Get comprehensive token analysis with better error handling
      let tokenAnalysis;
      try {
        tokenAnalysis = await this.getComprehensiveTokenAnalysis(tokenAddress, activeChain);
      } catch (analysisError) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Token analysis failed: ${analysisError.message}\n\nThis might be a new or unsupported token.`
        );
        return;
      }
      
      if (!tokenAnalysis.success) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ ${tokenAnalysis.error}\n\nPlease verify the token address and try again.`
        );
        return;
      }

      // Get wallet balance with error handling
      let balance;
      try {
        balance = await walletService.getWalletBalance(wallet.address, activeChain);
      } catch (balanceError) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Unable to check wallet balance: ${balanceError.message}\n\nPlease ensure your wallet is properly configured.`
        );
        return;
      }

      const nativeBalance = balance.native || 0;
      const tradeAmount = amount || userSettings.defaultBuyAmount || 0.01;
      
      if (tradeAmount > nativeBalance) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Insufficient balance\n\n💰 Available: ${nativeBalance.toFixed(4)} ${advancedTradingEngine.chainConfigs[activeChain].symbol}\n💸 Required: ${tradeAmount} ${advancedTradingEngine.chainConfigs[activeChain].symbol}`
        );
        return;
      }

      // Update loading message
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMsg.message_id, 
        undefined, 
        '💱 Getting optimal quotes from multiple DEX aggregators...'
      );

      // Get optimal quote with MEV protection and error handling
      let quote;
      try {
        quote = await advancedTradingEngine.getOptimalQuote({
          chain: activeChain,
          fromToken: advancedTradingEngine.getNativeTokenAddress(activeChain),
          toToken: tokenAddress,
          amount: tradeAmount,
          slippage: slippage || userSettings.defaultSlippage || advancedTradingEngine.chainConfigs[activeChain].slippageTolerance
        });
      } catch (quoteError) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Quote service error: ${quoteError.message}\n\nDEX aggregators might be temporarily unavailable.`
        );
        return;
      }

      if (!quote.success) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Unable to get trade quote: ${quote.error}\n\nThe token might not be tradeable on ${activeChain.toUpperCase()}.`
        );
        return;
      }

      // Show comprehensive buy preview
      const previewMessage = this.formatBuyPreview(tokenAnalysis.data, quote, tradeAmount, activeChain, gasLevel);
      
      // Create confirmation keyboard
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Confirm Purchase', callback_data: `confirm_buy_${tokenAddress}_${tradeAmount}_${activeChain}_${slippage || 'auto'}_${gasLevel || 'medium'}` },
            { text: '❌ Cancel', callback_data: 'cancel_trade' }
          ],
          [
            { text: '🔧 Adjust Settings', callback_data: `adjust_buy_${tokenAddress}_${tradeAmount}_${activeChain}` },
            { text: '📊 More Analysis', callback_data: `analyze_${tokenAddress}_${activeChain}` }
          ]
        ]
      };

      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMsg.message_id, 
        undefined, 
        previewMessage,
        { 
          reply_markup: keyboard,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }
      );

    } catch (error) {
      console.error('Enhanced buy command error:', error);
      
      // Try to update the loading message if it exists, otherwise send new message
      try {
        if (loadingMsg) {
          await ctx.telegram.editMessageText(
            ctx.chat.id, 
            loadingMsg.message_id, 
            undefined, 
            `❌ **System Error**\n\nSomething went wrong while processing your buy request.\n\n**Error:** ${error.message}\n\nPlease try again in a moment or contact support if the issue persists.`
          );
        } else {
          await ctx.reply(`❌ **System Error**\n\nSomething went wrong while processing your buy request.\n\n**Error:** ${error.message}\n\nPlease try again in a moment or contact support if the issue persists.`);
        }
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  }

  parseArguments(args) {
    if (args.length === 0) {
      return { error: 'Token address is required' };
    }

    const tokenAddress = args[0];
    const amount = args[1] ? parseFloat(args[1]) : null;
    const chain = args[2] ? args[2].toLowerCase() : null;
    const slippage = args[3] ? parseFloat(args[3]) : null;
    const gasLevel = args[4] ? args[4].toLowerCase() : 'medium';

    // Validate token address format
    if (chain === 'solana') {
      if (tokenAddress.length < 32 || tokenAddress.length > 44) {
        return { error: 'Invalid Solana token address format' };
      }
    } else {
      if (!tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
        return { error: 'Invalid EVM token address format' };
      }
    }

    // Validate amount
    if (amount !== null && (isNaN(amount) || amount <= 0)) {
      return { error: 'Amount must be a positive number' };
    }

    // Validate slippage
    if (slippage !== null && (isNaN(slippage) || slippage < 0.1 || slippage > 50)) {
      return { error: 'Slippage must be between 0.1% and 50%' };
    }

    // Validate gas level
    if (gasLevel && !['low', 'medium', 'high'].includes(gasLevel)) {
      return { error: 'Gas level must be: low, medium, or high' };
    }

    return { tokenAddress, amount, chain, slippage, gasLevel };
  }

  async getComprehensiveTokenAnalysis(tokenAddress, chain) {
    try {
      // Get enhanced token data
      const tokenData = await tokenDataService.getEnhancedTokenData(tokenAddress, chain);
      
      if (!tokenData) {
        return { success: false, error: 'Token not found or analysis failed' };
      }

      return { success: true, data: tokenData };

    } catch (error) {
      console.error('Token analysis error:', error);
      return { success: false, error: error.message };
    }
  }

  formatBuyPreview(tokenData, quote, amount, chain, gasLevel) {
    const chainSymbol = advancedTradingEngine.chainConfigs[chain].symbol;
    const estimatedGas = this.formatGasEstimate(quote.gasEstimate, chain);
    
    let message = `🛒 **BUY ORDER PREVIEW**\n\n`;
    
    // Token Info Section
    message += `**🎯 TOKEN DETAILS**\n`;
    message += `• **Name:** ${tokenData.name} (${tokenData.symbol})\n`;
    message += `• **Price:** $${tokenData.priceUsd.toFixed(8)}\n`;
    message += `• **Market Cap:** $${this.formatNumber(tokenData.marketCap)}\n`;
    message += `• **24h Volume:** $${this.formatNumber(tokenData.volume24h)}\n`;
    message += `• **24h Change:** ${tokenData.priceChange24h >= 0 ? '🟢' : '🔴'} ${tokenData.priceChange24h.toFixed(2)}%\n`;
    message += `• **Liquidity:** $${this.formatNumber(tokenData.liquidity)}\n\n`;

    // Trade Details Section
    message += `**💰 TRADE DETAILS**\n`;
    message += `• **Spending:** ${amount} ${chainSymbol} ($${(amount * tokenData.nativePrice).toFixed(2)})\n`;
    message += `• **Receiving:** ~${quote.estimatedOutput.toFixed(4)} ${tokenData.symbol}\n`;
    message += `• **Price Impact:** ${quote.priceImpact?.toFixed(3) || 'N/A'}%\n`;
    message += `• **Slippage:** ${(quote.slippage * 100).toFixed(2)}%\n`;
    message += `• **Route:** ${quote.aggregator.toUpperCase()} (${quote.allQuotes} quotes compared)\n\n`;

    // Fee & Gas Section
    message += `**⛽ FEES & GAS**\n`;
    message += `• **Gas Level:** ${gasLevel.toUpperCase()}\n`;
    message += `• **Est. Gas:** ${estimatedGas}\n`;
    message += `• **DEX Fee:** ~0.3%\n`;
    if (process.env.DEV_FEE_PERCENT) {
      message += `• **Service Fee:** ${process.env.DEV_FEE_PERCENT}%\n`;
    }
    message += `\n`;

    // Risk Assessment
    message += `**🛡️ RISK ASSESSMENT**\n`;
    const riskLevel = this.calculateRiskLevel(tokenData);
    message += `• **Overall Risk:** ${riskLevel.emoji} ${riskLevel.level}\n`;
    
    if (tokenData.security) {
      message += `• **Contract Verified:** ${tokenData.security.verified ? '✅' : '❌'}\n`;
      message += `• **Honeypot Risk:** ${tokenData.security.honeypot ? '🚨 HIGH' : '✅ LOW'}\n`;
      if (tokenData.security.mintable) {
        message += `• **⚠️ Warning:** Token is mintable\n`;
      }
    }

    // AI Recommendation
    if (tokenData.aiRecommendation) {
      message += `\n**🤖 AI ANALYSIS**\n`;
      message += `• **Recommendation:** ${this.getRecommendationEmoji(tokenData.aiRecommendation)} ${tokenData.aiRecommendation}\n`;
      if (tokenData.aiReason) {
        message += `• **Reason:** ${tokenData.aiReason}\n`;
      }
    }

    message += `\n⚡ *This trade is MEV-protected and uses optimal routing*`;

    return message;
  }

  calculateRiskLevel(tokenData) {
    let riskScore = 0;
    
    // Age factor
    if (tokenData.ageHours < 24) riskScore += 30;
    else if (tokenData.ageHours < 168) riskScore += 15; // 1 week
    
    // Liquidity factor
    if (tokenData.liquidity < 10000) riskScore += 25;
    else if (tokenData.liquidity < 50000) riskScore += 10;
    
    // Market cap factor
    if (tokenData.marketCap < 50000) riskScore += 20;
    else if (tokenData.marketCap < 1000000) riskScore += 10;
    
    // Holder concentration
    if (tokenData.topHolderPercent > 50) riskScore += 20;
    else if (tokenData.topHolderPercent > 20) riskScore += 10;
    
    // Security issues
    if (tokenData.security?.honeypot) riskScore += 50;
    if (tokenData.security?.mintable) riskScore += 15;
    if (!tokenData.security?.verified) riskScore += 10;

    if (riskScore < 20) return { level: 'LOW', emoji: '🟢' };
    if (riskScore < 50) return { level: 'MEDIUM', emoji: '🟡' };
    return { level: 'HIGH', emoji: '🔴' };
  }

  getRecommendationEmoji(recommendation) {
    const emojiMap = {
      'STRONG BUY': '🚀',
      'BUY': '✅',
      'HOLD': '⚠️',
      'SELL': '❌',
      'STRONG SELL': '🚨'
    };
    return emojiMap[recommendation] || '❓';
  }

  formatGasEstimate(gasEstimate, chain) {
    if (chain === 'solana') {
      return `~${gasEstimate} Compute Units`;
    }
    
    const gasPriceGwei = gasEstimate ? (gasEstimate / 1e9).toFixed(2) : 'N/A';
    return `~${gasPriceGwei} Gwei`;
  }

  formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  }

  // Handle buy confirmation callback
  async handleBuyConfirmation(ctx) {
    const userId = ctx.from.id;
    const callbackData = ctx.callbackQuery.data;
    const parts = callbackData.replace('confirm_buy_', '').split('_');
    
    const [tokenAddress, amount, chain, slippage, gasLevel] = parts;

    try {
      // Show execution message
      await ctx.editMessageText('⚡ Executing MEV-protected trade...\n\n🔒 Your transaction is secured against front-running');

      // Execute the trade
      const result = await advancedTradingEngine.executeBuy({
        userId,
        tokenAddress,
        amount: parseFloat(amount),
        chain,
        slippage: slippage === 'auto' ? null : parseFloat(slippage),
        gasLevel
      });

      if (result.success) {
        const successMessage = this.formatSuccessMessage(result, tokenAddress, chain);
        await ctx.editMessageText(successMessage, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: true 
        });
        
        // Update user statistics
        await userService.incrementTradeCount(userId);
        
      } else {
        await ctx.editMessageText(`❌ **Trade Failed**\n\n${result.message}\n\nPlease try again or adjust your parameters.`);
      }

    } catch (error) {
      console.error('Buy execution error:', error);
      await ctx.editMessageText(`❌ **Execution Error**\n\n${error.message}\n\nPlease try again later.`);
    }
  }

  formatSuccessMessage(result, tokenAddress, chain) {
    const explorerName = this.getExplorerName(chain);
    
    let message = `✅ **PURCHASE SUCCESSFUL!**\n\n`;
    message += `🎯 **Transaction Hash:**\n\`${result.txHash}\`\n\n`;
    message += `💰 **Trade Summary:**\n`;
    message += `• Spent: ${result.amountSpent} ${advancedTradingEngine.chainConfigs[chain].symbol}\n`;
    message += `• Received: ${result.tokensReceived.toFixed(4)} tokens\n`;
    message += `• Execution Price: $${result.executedPrice.toFixed(8)}\n`;
    message += `• Price Impact: ${result.priceImpact.toFixed(3)}%\n`;
    message += `• Gas Fee: ${(result.gasFee / 1e18).toFixed(6)} ${advancedTradingEngine.chainConfigs[chain].symbol}\n\n`;
    message += `🔗 [View on ${explorerName}](${result.explorerUrl})\n\n`;
    message += `⚡ *Trade executed with MEV protection*`;

    return message;
  }

  getExplorerName(chain) {
    const names = {
      ethereum: 'Etherscan',
      base: 'BaseScan',
      bsc: 'BscScan',
      polygon: 'PolygonScan',
      arbitrum: 'Arbiscan',
      solana: 'SolScan',
      conflux: 'ConfluxScan'
    };
    return names[chain] || 'Explorer';
  }
}

module.exports = new EnhancedBuyCommand(); 