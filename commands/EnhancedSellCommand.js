// commands/EnhancedSellCommand.js - Professional Sell Command with Position Management
const advancedTradingEngine = require('../services/advancedTradingEngine');
const tokenDataService = require('../services/tokenDataService');
const userService = require('../users/userService');
const walletService = require('../services/walletService');

class EnhancedSellCommand {
  constructor() {
    this.command = 'sell';
    this.description = '💸 Sell tokens with optimal routing and position tracking';
    this.usage = '/sell <token_address> [amount|percentage] [chain] [slippage] [gas_level]';
    this.aliases = ['s', 'dispose'];
    this.category = 'trading';
  }

  async execute(ctx) {
    const userId = ctx.from.id;
    const messageText = ctx.message.text;
    const args = messageText.split(' ').slice(1);

    try {
      // Show initial loading message
      const loadingMsg = await ctx.reply('🔄 Analyzing position and preparing optimal sell route...');

      // Parse arguments
      const { tokenAddress, amount, isPercentage, chain, slippage, gasLevel, error } = this.parseArguments(args);
      
      if (error) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ ${error}\n\n📖 Usage: ${this.usage}\n\n💡 Examples:\n• /sell 0x123... 50  (sell 50 tokens)\n• /sell 0x123... 25%  (sell 25% of position)\n• /sell 0x123... all  (sell all tokens)`
        );
        return;
      }

      // Get user settings
      const userSettings = await userService.getUserSettings(userId);
      const activeChain = chain || userSettings.activeChain || 'ethereum';
      
      // Validate user has wallet for this chain
      const wallet = await walletService.getUserWallet(userId, activeChain);
      if (!wallet) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ No wallet found for ${activeChain.toUpperCase()}\n\nUse /wallet to create one first.`
        );
        return;
      }

      // Update loading message
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMsg.message_id, 
        undefined, 
        '🔍 Analyzing token position and market conditions...'
      );

      // Get token analysis and position info
      const [tokenAnalysis, positionInfo] = await Promise.all([
        this.getTokenAnalysis(tokenAddress, activeChain),
        this.getPositionInfo(userId, tokenAddress, activeChain)
      ]);
      
      if (!tokenAnalysis.success) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ ${tokenAnalysis.error}\n\nPlease verify the token address and try again.`
        );
        return;
      }

      if (!positionInfo.hasPosition) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ No position found for this token\n\n💼 Current balance: ${positionInfo.balance} ${tokenAnalysis.data.symbol}\n\nYou need to own tokens before selling them.`
        );
        return;
      }

      // Calculate sell amount
      const sellAmount = this.calculateSellAmount(amount, isPercentage, positionInfo.balance);
      
      if (sellAmount > positionInfo.balance) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Insufficient token balance\n\n💼 Available: ${positionInfo.balance} ${tokenAnalysis.data.symbol}\n💸 Requested: ${sellAmount} ${tokenAnalysis.data.symbol}`
        );
        return;
      }

      // Update loading message
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMsg.message_id, 
        undefined, 
        '💱 Getting optimal sell quotes from DEX aggregators...'
      );

      // Get optimal quote
      const quote = await advancedTradingEngine.getOptimalQuote({
        chain: activeChain,
        fromToken: tokenAddress,
        toToken: advancedTradingEngine.getNativeTokenAddress(activeChain),
        amount: sellAmount,
        slippage: slippage || userSettings.defaultSlippage || advancedTradingEngine.chainConfigs[activeChain].slippageTolerance
      });

      if (!quote.success) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Unable to get sell quote: ${quote.error}\n\nThere might be insufficient liquidity for this token.`
        );
        return;
      }

      // Show comprehensive sell preview
      const previewMessage = this.formatSellPreview(
        tokenAnalysis.data, 
        quote, 
        sellAmount, 
        positionInfo, 
        activeChain, 
        gasLevel,
        isPercentage ? amount : null
      );
      
      // Create confirmation keyboard
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Confirm Sale', callback_data: `confirm_sell_${tokenAddress}_${sellAmount}_${activeChain}_${slippage || 'auto'}_${gasLevel || 'medium'}` },
            { text: '❌ Cancel', callback_data: 'cancel_trade' }
          ],
          [
            { text: '🔧 Adjust Amount', callback_data: `adjust_sell_${tokenAddress}_${activeChain}` },
            { text: '📊 Position Details', callback_data: `position_${tokenAddress}_${activeChain}` }
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
      console.error('Enhanced sell command error:', error);
      await ctx.reply(`❌ An error occurred: ${error.message}`);
    }
  }

  parseArguments(args) {
    if (args.length === 0) {
      return { error: 'Token address is required' };
    }

    const tokenAddress = args[0];
    let amount = args[1];
    let isPercentage = false;

    // Handle percentage or special amounts
    if (amount) {
      if (amount.endsWith('%')) {
        amount = parseFloat(amount.replace('%', ''));
        isPercentage = true;
        if (amount < 1 || amount > 100) {
          return { error: 'Percentage must be between 1% and 100%' };
        }
      } else if (amount.toLowerCase() === 'all' || amount === '100%') {
        amount = 100;
        isPercentage = true;
      } else if (amount.toLowerCase() === 'half') {
        amount = 50;
        isPercentage = true;
      } else {
        amount = parseFloat(amount);
        if (isNaN(amount) || amount <= 0) {
          return { error: 'Amount must be a positive number or percentage' };
        }
      }
    } else {
      return { error: 'Amount or percentage is required' };
    }

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

    // Validate slippage
    if (slippage !== null && (isNaN(slippage) || slippage < 0.1 || slippage > 50)) {
      return { error: 'Slippage must be between 0.1% and 50%' };
    }

    // Validate gas level
    if (gasLevel && !['low', 'medium', 'high'].includes(gasLevel)) {
      return { error: 'Gas level must be: low, medium, or high' };
    }

    return { tokenAddress, amount, isPercentage, chain, slippage, gasLevel };
  }

  async getTokenAnalysis(tokenAddress, chain) {
    try {
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

  async getPositionInfo(userId, tokenAddress, chain) {
    try {
      const wallet = await walletService.getUserWallet(userId, chain);
      if (!wallet) {
        return { hasPosition: false, balance: 0 };
      }

      // Get token balance
      const balance = await walletService.getTokenBalance(wallet.address, tokenAddress, chain);
      
      // Get position history if available
      const transactions = await userService.getUserTransactions(userId, {
        tokenAddress,
        chain,
        limit: 50
      });

      // Calculate position metrics
      const buyTransactions = transactions.filter(tx => tx.type === 'buy');
      const sellTransactions = transactions.filter(tx => tx.type === 'sell');
      
      let totalInvested = 0;
      let totalTokensBought = 0;
      let totalSold = 0;
      let totalReceived = 0;

      buyTransactions.forEach(tx => {
        totalInvested += tx.amountIn;
        totalTokensBought += tx.amountOut;
      });

      sellTransactions.forEach(tx => {
        totalSold += tx.amountIn;
        totalReceived += tx.amountOut;
      });

      const averageBuyPrice = totalTokensBought > 0 ? totalInvested / totalTokensBought : 0;
      const remainingInvestment = totalInvested - (totalReceived * (totalSold / totalTokensBought));

      return {
        hasPosition: balance > 0,
        balance,
        averageBuyPrice,
        totalInvested: remainingInvestment,
        realizedPnL: totalReceived - (totalInvested * (totalSold / totalTokensBought)),
        transactionCount: transactions.length
      };

    } catch (error) {
      console.error('Position info error:', error);
      return { hasPosition: false, balance: 0 };
    }
  }

  calculateSellAmount(amount, isPercentage, balance) {
    if (isPercentage) {
      return (amount / 100) * balance;
    }
    return amount;
  }

  formatSellPreview(tokenData, quote, sellAmount, positionInfo, chain, gasLevel, percentage = null) {
    const chainSymbol = advancedTradingEngine.chainConfigs[chain].symbol;
    const currentValue = sellAmount * tokenData.priceUsd;
    const estimatedReceive = quote.estimatedOutput;
    const estimatedGas = this.formatGasEstimate(quote.gasEstimate, chain);
    
    let message = `💸 **SELL ORDER PREVIEW**\n\n`;
    
    // Token Info Section
    message += `**🎯 TOKEN DETAILS**\n`;
    message += `• **Name:** ${tokenData.name} (${tokenData.symbol})\n`;
    message += `• **Current Price:** $${tokenData.priceUsd.toFixed(8)}\n`;
    message += `• **24h Change:** ${tokenData.priceChange24h >= 0 ? '🟢' : '🔴'} ${tokenData.priceChange24h.toFixed(2)}%\n`;
    message += `• **Market Cap:** $${this.formatNumber(tokenData.marketCap)}\n`;
    message += `• **Liquidity:** $${this.formatNumber(tokenData.liquidity)}\n\n`;

    // Position Section
    message += `**💼 POSITION DETAILS**\n`;
    message += `• **Total Balance:** ${positionInfo.balance.toFixed(4)} ${tokenData.symbol}\n`;
    if (percentage) {
      message += `• **Selling:** ${percentage}% (${sellAmount.toFixed(4)} ${tokenData.symbol})\n`;
    } else {
      message += `• **Selling:** ${sellAmount.toFixed(4)} ${tokenData.symbol}\n`;
    }
    if (positionInfo.averageBuyPrice > 0) {
      message += `• **Avg Buy Price:** $${positionInfo.averageBuyPrice.toFixed(8)}\n`;
      const currentPnL = (tokenData.priceUsd - positionInfo.averageBuyPrice) * sellAmount;
      const pnlPercent = ((tokenData.priceUsd / positionInfo.averageBuyPrice) - 1) * 100;
      message += `• **Position P&L:** ${currentPnL >= 0 ? '🟢' : '🔴'} $${currentPnL.toFixed(2)} (${pnlPercent.toFixed(2)}%)\n`;
    }
    message += `\n`;

    // Trade Details Section
    message += `**💰 TRADE DETAILS**\n`;
    message += `• **Selling:** ${sellAmount.toFixed(4)} ${tokenData.symbol}\n`;
    message += `• **Current Value:** $${currentValue.toFixed(2)}\n`;
    message += `• **Est. Receive:** ~${estimatedReceive.toFixed(6)} ${chainSymbol}\n`;
    message += `• **Est. USD Value:** ~$${(estimatedReceive * tokenData.nativePrice).toFixed(2)}\n`;
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

    // Market Analysis
    message += `**📊 MARKET ANALYSIS**\n`;
    const liquidityRatio = (currentValue / tokenData.liquidity) * 100;
    message += `• **Trade Size:** ${liquidityRatio.toFixed(2)}% of liquidity\n`;
    
    if (liquidityRatio > 5) {
      message += `• **⚠️ Warning:** Large trade size may cause significant slippage\n`;
    }
    
    if (tokenData.volume24h < currentValue * 2) {
      message += `• **⚠️ Warning:** Low 24h volume relative to trade size\n`;
    }

    // AI Recommendation for selling
    if (tokenData.aiRecommendation) {
      message += `\n**🤖 AI ANALYSIS**\n`;
      message += `• **Current Signal:** ${this.getRecommendationEmoji(tokenData.aiRecommendation)} ${tokenData.aiRecommendation}\n`;
      
      // Selling recommendation based on current signal
      const sellRecommendation = this.getSellRecommendation(tokenData.aiRecommendation, positionInfo);
      message += `• **Sell Timing:** ${sellRecommendation}\n`;
    }

    message += `\n⚡ *This trade is MEV-protected and uses optimal routing*`;

    return message;
  }

  getSellRecommendation(aiSignal, positionInfo) {
    if (aiSignal === 'STRONG SELL' || aiSignal === 'SELL') {
      return '🔴 Good time to sell';
    } else if (aiSignal === 'HOLD') {
      return '🟡 Consider holding or partial sell';
    } else if (aiSignal === 'BUY' || aiSignal === 'STRONG BUY') {
      return '🟢 Consider holding, strong buy signal active';
    }
    return '❓ Mixed signals';
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

  // Handle sell confirmation callback
  async handleSellConfirmation(ctx) {
    const userId = ctx.from.id;
    const callbackData = ctx.callbackQuery.data;
    const parts = callbackData.replace('confirm_sell_', '').split('_');
    
    const [tokenAddress, amount, chain, slippage, gasLevel] = parts;

    try {
      // Show execution message
      await ctx.editMessageText('⚡ Executing MEV-protected sell...\n\n🔒 Your transaction is secured against front-running');

      // Execute the trade
      const result = await advancedTradingEngine.executeSell({
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
        await ctx.editMessageText(`❌ **Sale Failed**\n\n${result.message}\n\nPlease try again or adjust your parameters.`);
      }

    } catch (error) {
      console.error('Sell execution error:', error);
      await ctx.editMessageText(`❌ **Execution Error**\n\n${error.message}\n\nPlease try again later.`);
    }
  }

  formatSuccessMessage(result, tokenAddress, chain) {
    const explorerName = this.getExplorerName(chain);
    
    let message = `✅ **SALE SUCCESSFUL!**\n\n`;
    message += `🎯 **Transaction Hash:**\n\`${result.txHash}\`\n\n`;
    message += `💰 **Trade Summary:**\n`;
    message += `• Sold: ${result.amountSold} tokens\n`;
    message += `• Received: ${result.proceeds.toFixed(6)} ${advancedTradingEngine.chainConfigs[chain].symbol}\n`;
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

module.exports = new EnhancedSellCommand(); 