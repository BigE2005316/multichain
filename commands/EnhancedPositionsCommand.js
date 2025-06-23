// commands/EnhancedPositionsCommand.js - Professional Portfolio Management
const advancedTradingEngine = require('../services/advancedTradingEngine');
const tokenDataService = require('../services/tokenDataService');
const userService = require('../users/userService');
const walletService = require('../services/walletService');

class EnhancedPositionsCommand {
  constructor() {
    this.command = 'positions';
    this.description = '📊 View comprehensive portfolio with P&L tracking';
    this.usage = '/positions [chain] [details|summary]';
    this.aliases = ['portfolio', 'pos', 'holdings'];
    this.category = 'trading';
  }

  async execute(ctx) {
    const userId = ctx.from.id;
    const messageText = ctx.message.text;
    const args = messageText.split(' ').slice(1);

    try {
      // Show initial loading message
      const loadingMsg = await ctx.reply('📊 Loading your complete portfolio across all chains...');

      // Parse arguments
      const chain = args[0] ? args[0].toLowerCase() : null;
      const view = args[1] ? args[1].toLowerCase() : 'summary';

      // Validate chain if specified
      if (chain && !advancedTradingEngine.chainConfigs[chain]) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Unsupported chain: ${chain}\n\nSupported chains: ${Object.keys(advancedTradingEngine.chainConfigs).join(', ')}`
        );
        return;
      }

      // Update loading message
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMsg.message_id, 
        undefined, 
        '🔍 Analyzing positions and calculating P&L...'
      );

      // Get comprehensive portfolio data
      const portfolio = await this.getComprehensivePortfolio(userId, chain);

      if (portfolio.totalPositions === 0) {
        const message = chain 
          ? `📊 **Portfolio - ${chain.toUpperCase()}**\n\n❌ No positions found on ${chain}\n\nUse /buy to start trading!`
          : `📊 **Complete Portfolio**\n\n❌ No positions found across all chains\n\nUse /buy to start trading!`;
        
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          message
        );
        return;
      }

      // Format message based on view type
      let message;
      let keyboard;

      if (view === 'details') {
        message = this.formatDetailedPortfolio(portfolio, chain);
        keyboard = this.createDetailedKeyboard(userId, chain);
      } else {
        message = this.formatSummaryPortfolio(portfolio, chain);
        keyboard = this.createSummaryKeyboard(userId, chain);
      }

      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        loadingMsg.message_id, 
        undefined, 
        message,
        { 
          reply_markup: keyboard,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }
      );

    } catch (error) {
      console.error('Enhanced positions command error:', error);
      await ctx.reply(`❌ An error occurred: ${error.message}`);
    }
  }

  async getComprehensivePortfolio(userId, specificChain = null) {
    const portfolio = {
      chains: {},
      totalValueUSD: 0,
      totalPnL: 0,
      totalPnLPercent: 0,
      totalInvested: 0,
      totalPositions: 0,
      topGainers: [],
      topLosers: [],
      riskAnalysis: {
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0
      }
    };

    try {
      const chainsToCheck = specificChain ? [specificChain] : Object.keys(advancedTradingEngine.chainConfigs);

      for (const chain of chainsToCheck) {
        const chainData = await this.getChainPortfolio(userId, chain);
        if (chainData.positions.length > 0) {
          portfolio.chains[chain] = chainData;
          portfolio.totalValueUSD += chainData.totalValue;
          portfolio.totalPnL += chainData.totalPnL;
          portfolio.totalInvested += chainData.totalInvested;
          portfolio.totalPositions += chainData.positions.length;

          // Add to gainers/losers
          chainData.positions.forEach(pos => {
            if (pos.pnlPercent > 0) {
              portfolio.topGainers.push(pos);
            } else if (pos.pnlPercent < 0) {
              portfolio.topLosers.push(pos);
            }

            // Risk analysis
            if (pos.riskLevel === 'HIGH') portfolio.riskAnalysis.highRisk++;
            else if (pos.riskLevel === 'MEDIUM') portfolio.riskAnalysis.mediumRisk++;
            else portfolio.riskAnalysis.lowRisk++;
          });
        }
      }

      // Calculate total P&L percentage
      if (portfolio.totalInvested > 0) {
        portfolio.totalPnLPercent = (portfolio.totalPnL / portfolio.totalInvested) * 100;
      }

      // Sort gainers/losers
      portfolio.topGainers.sort((a, b) => b.pnlPercent - a.pnlPercent);
      portfolio.topLosers.sort((a, b) => a.pnlPercent - b.pnlPercent);

      return portfolio;

    } catch (error) {
      console.error('Portfolio fetch error:', error);
      return portfolio;
    }
  }

  async getChainPortfolio(userId, chain) {
    const chainData = {
      chain,
      positions: [],
      totalValue: 0,
      totalPnL: 0,
      totalInvested: 0,
      nativeBalance: 0
    };

    try {
      const wallet = await walletService.getUserWallet(userId, chain);
      if (!wallet) return chainData;

      // Get wallet balance including native and tokens
      const balance = await walletService.getWalletBalance(wallet.address, chain);
      chainData.nativeBalance = balance.native || 0;

      // Get native token price for USD calculations
      const nativePrice = await this.getNativeTokenPrice(chain);

      if (balance.tokens && balance.tokens.length > 0) {
        for (const token of balance.tokens) {
          if (token.balance > 0) {
            const position = await this.buildPositionData(userId, token, chain, nativePrice);
            if (position) {
              chainData.positions.push(position);
              chainData.totalValue += position.currentValue;
              chainData.totalPnL += position.pnl;
              chainData.totalInvested += position.investedAmount;
            }
          }
        }
      }

      return chainData;

    } catch (error) {
      console.error(`Chain ${chain} portfolio error:`, error);
      return chainData;
    }
  }

  async buildPositionData(userId, token, chain, nativePrice) {
    try {
      // Get enhanced token data
      const tokenData = await tokenDataService.getEnhancedTokenData(token.address, chain);
      if (!tokenData) return null;

      // Get transaction history for this token
      const transactions = await userService.getUserTransactions(userId, {
        tokenAddress: token.address,
        chain,
        limit: 100
      });

      // Calculate position metrics
      const positionMetrics = this.calculatePositionMetrics(transactions, token.balance, tokenData.priceUsd);

      // Calculate risk level
      const riskLevel = this.calculateTokenRiskLevel(tokenData);

      return {
        chain,
        tokenAddress: token.address,
        tokenName: tokenData.name,
        tokenSymbol: tokenData.symbol,
        balance: token.balance,
        currentPrice: tokenData.priceUsd,
        currentValue: token.balance * tokenData.priceUsd,
        priceChange24h: tokenData.priceChange24h || 0,
        
        // Position tracking
        averageBuyPrice: positionMetrics.averageBuyPrice,
        investedAmount: positionMetrics.totalInvested,
        pnl: positionMetrics.unrealizedPnL,
        pnlPercent: positionMetrics.pnlPercent,
        realizedPnL: positionMetrics.realizedPnL,
        
        // Risk & market data
        riskLevel,
        marketCap: tokenData.marketCap,
        liquidity: tokenData.liquidity,
        volume24h: tokenData.volume24h,
        
        // Performance metrics
        allTimeHigh: positionMetrics.allTimeHigh,
        allTimeLow: positionMetrics.allTimeLow,
        daysHeld: positionMetrics.daysHeld,
        transactionCount: transactions.length,
        
        lastUpdated: Date.now()
      };

    } catch (error) {
      console.error('Position build error:', error);
      return null;
    }
  }

  calculatePositionMetrics(transactions, currentBalance, currentPrice) {
    const metrics = {
      totalInvested: 0,
      totalTokensBought: 0,
      totalTokensSold: 0,
      totalReceived: 0,
      realizedPnL: 0,
      averageBuyPrice: 0,
      unrealizedPnL: 0,
      pnlPercent: 0,
      allTimeHigh: currentPrice,
      allTimeLow: currentPrice,
      daysHeld: 0
    };

    if (transactions.length === 0) return metrics;

    const buyTransactions = transactions.filter(tx => tx.type === 'buy');
    const sellTransactions = transactions.filter(tx => tx.type === 'sell');

    // Calculate buy metrics
    buyTransactions.forEach(tx => {
      metrics.totalInvested += tx.amountIn;
      metrics.totalTokensBought += tx.amountOut;
    });

    // Calculate sell metrics
    sellTransactions.forEach(tx => {
      metrics.totalTokensSold += tx.amountIn;
      metrics.totalReceived += tx.amountOut;
    });

    // Calculate average buy price
    if (metrics.totalTokensBought > 0) {
      metrics.averageBuyPrice = metrics.totalInvested / metrics.totalTokensBought;
    }

    // Calculate realized P&L
    if (metrics.totalTokensSold > 0 && metrics.totalTokensBought > 0) {
      const avgCostOfSold = (metrics.totalTokensSold / metrics.totalTokensBought) * metrics.totalInvested;
      metrics.realizedPnL = metrics.totalReceived - avgCostOfSold;
    }

    // Calculate unrealized P&L
    if (currentBalance > 0 && metrics.averageBuyPrice > 0) {
      const remainingInvestment = (currentBalance / metrics.totalTokensBought) * metrics.totalInvested;
      const currentValue = currentBalance * currentPrice;
      metrics.unrealizedPnL = currentValue - remainingInvestment;
      
      if (remainingInvestment > 0) {
        metrics.pnlPercent = (metrics.unrealizedPnL / remainingInvestment) * 100;
      }
    }

    // Calculate days held
    if (buyTransactions.length > 0) {
      const firstBuy = Math.min(...buyTransactions.map(tx => tx.timestamp));
      metrics.daysHeld = Math.floor((Date.now() - firstBuy) / (1000 * 60 * 60 * 24));
    }

    return metrics;
  }

  calculateTokenRiskLevel(tokenData) {
    let riskScore = 0;
    
    // Market cap factor
    if (tokenData.marketCap < 100000) riskScore += 30;
    else if (tokenData.marketCap < 10000000) riskScore += 15;
    
    // Liquidity factor
    if (tokenData.liquidity < 50000) riskScore += 25;
    else if (tokenData.liquidity < 500000) riskScore += 10;
    
    // Age factor
    if (tokenData.ageHours < 24) riskScore += 20;
    else if (tokenData.ageHours < 168) riskScore += 10;
    
    // Volume/Market cap ratio
    const volumeRatio = tokenData.volume24h / tokenData.marketCap;
    if (volumeRatio < 0.01) riskScore += 15; // Very low volume
    
    // Security factors
    if (tokenData.security?.honeypot) riskScore += 50;
    if (!tokenData.security?.verified) riskScore += 10;

    if (riskScore < 25) return 'LOW';
    if (riskScore < 60) return 'MEDIUM';
    return 'HIGH';
  }

  async getNativeTokenPrice(chain) {
    try {
      // Simple price mapping - in production, get from price feeds
      const priceMap = {
        ethereum: 3000,
        base: 3000,
        arbitrum: 3000,
        polygon: 0.8,
        bsc: 400,
        solana: 100,
        conflux: 0.15
      };
      return priceMap[chain] || 1;
    } catch (error) {
      return 1;
    }
  }

  formatSummaryPortfolio(portfolio, specificChain) {
    const title = specificChain 
      ? `📊 **${specificChain.toUpperCase()} Portfolio**`
      : `📊 **Complete Portfolio**`;

    let message = `${title}\n\n`;

    // Portfolio Overview
    message += `💰 **Portfolio Overview**\n`;
    message += `• **Total Value:** $${this.formatNumber(portfolio.totalValueUSD)}\n`;
    message += `• **Total P&L:** ${portfolio.totalPnL >= 0 ? '🟢' : '🔴'} $${this.formatNumber(portfolio.totalPnL)} (${portfolio.totalPnLPercent.toFixed(2)}%)\n`;
    message += `• **Total Invested:** $${this.formatNumber(portfolio.totalInvested)}\n`;
    message += `• **Positions:** ${portfolio.totalPositions} across ${Object.keys(portfolio.chains).length} chain(s)\n\n`;

    // Risk Distribution
    const total = portfolio.riskAnalysis.lowRisk + portfolio.riskAnalysis.mediumRisk + portfolio.riskAnalysis.highRisk;
    if (total > 0) {
      message += `🛡️ **Risk Distribution**\n`;
      message += `• **Low Risk:** ${portfolio.riskAnalysis.lowRisk} (${((portfolio.riskAnalysis.lowRisk/total)*100).toFixed(0)}%)\n`;
      message += `• **Medium Risk:** ${portfolio.riskAnalysis.mediumRisk} (${((portfolio.riskAnalysis.mediumRisk/total)*100).toFixed(0)}%)\n`;
      message += `• **High Risk:** ${portfolio.riskAnalysis.highRisk} (${((portfolio.riskAnalysis.highRisk/total)*100).toFixed(0)}%)\n\n`;
    }

    // Chain Breakdown
    if (!specificChain && Object.keys(portfolio.chains).length > 1) {
      message += `⛓️ **Chain Breakdown**\n`;
      Object.entries(portfolio.chains).forEach(([chain, data]) => {
        const percentage = (data.totalValue / portfolio.totalValueUSD) * 100;
        message += `• **${chain.toUpperCase()}:** $${this.formatNumber(data.totalValue)} (${percentage.toFixed(1)}%)\n`;
      });
      message += `\n`;
    }

    // Top Gainers
    if (portfolio.topGainers.length > 0) {
      message += `🚀 **Top Gainers**\n`;
      portfolio.topGainers.slice(0, 3).forEach((pos, index) => {
        message += `${index + 1}. **${pos.tokenSymbol}** +${pos.pnlPercent.toFixed(2)}% ($${this.formatNumber(pos.pnl)})\n`;
      });
      message += `\n`;
    }

    // Top Losers
    if (portfolio.topLosers.length > 0) {
      message += `📉 **Top Losers**\n`;
      portfolio.topLosers.slice(0, 3).forEach((pos, index) => {
        message += `${index + 1}. **${pos.tokenSymbol}** ${pos.pnlPercent.toFixed(2)}% ($${this.formatNumber(pos.pnl)})\n`;
      });
      message += `\n`;
    }

    // Recent Performance
    const recentGainers = portfolio.topGainers.filter(pos => pos.priceChange24h > 5).length;
    const recentLosers = portfolio.topLosers.filter(pos => pos.priceChange24h < -5).length;
    
    if (recentGainers + recentLosers > 0) {
      message += `📈 **24h Performance**\n`;
      message += `• **Strong Gainers (>5%):** ${recentGainers}\n`;
      message += `• **Strong Losers (<-5%):** ${recentLosers}\n`;
    }

    return message;
  }

  formatDetailedPortfolio(portfolio, specificChain) {
    const title = specificChain 
      ? `📊 **${specificChain.toUpperCase()} Portfolio - Detailed**`
      : `📊 **Complete Portfolio - Detailed**`;

    let message = `${title}\n\n`;

    // Portfolio metrics
    message += `💰 **Total Value:** $${this.formatNumber(portfolio.totalValueUSD)}\n`;
    message += `📊 **Total P&L:** ${portfolio.totalPnL >= 0 ? '🟢' : '🔴'} $${this.formatNumber(portfolio.totalPnL)} (${portfolio.totalPnLPercent.toFixed(2)}%)\n\n`;

    // Detailed positions by chain
    Object.entries(portfolio.chains).forEach(([chain, chainData]) => {
      message += `⛓️ **${chain.toUpperCase()} Chain**\n`;
      message += `• Value: $${this.formatNumber(chainData.totalValue)}\n`;
      message += `• P&L: ${chainData.totalPnL >= 0 ? '🟢' : '🔴'} $${this.formatNumber(chainData.totalPnL)}\n\n`;

      chainData.positions.slice(0, 5).forEach((pos, index) => {
        const riskEmoji = pos.riskLevel === 'HIGH' ? '🔴' : pos.riskLevel === 'MEDIUM' ? '🟡' : '🟢';
        message += `${index + 1}. **${pos.tokenSymbol}** ${riskEmoji}\n`;
        message += `   💰 $${this.formatNumber(pos.currentValue)} (${pos.balance.toFixed(4)} tokens)\n`;
        message += `   📊 ${pos.pnl >= 0 ? '🟢' : '🔴'} ${pos.pnlPercent.toFixed(2)}% ($${this.formatNumber(pos.pnl)})\n`;
        message += `   💲 $${pos.currentPrice.toFixed(8)} (24h: ${pos.priceChange24h.toFixed(2)}%)\n\n`;
      });

      if (chainData.positions.length > 5) {
        message += `   ... and ${chainData.positions.length - 5} more positions\n\n`;
      }
    });

    return message;
  }

  createSummaryKeyboard(userId, specificChain) {
    const buttons = [];

    // First row - view toggles
    buttons.push([
      { text: '📋 Detailed View', callback_data: `positions_detailed_${specificChain || 'all'}` },
      { text: '🔄 Refresh', callback_data: `positions_refresh_${specificChain || 'all'}` }
    ]);

    // Second row - chain filters (if not already filtered)
    if (!specificChain) {
      buttons.push([
        { text: '🔗 Ethereum', callback_data: 'positions_chain_ethereum' },
        { text: '🔗 BSC', callback_data: 'positions_chain_bsc' },
        { text: '🔗 Solana', callback_data: 'positions_chain_solana' }
      ]);
    }

    // Third row - actions
    buttons.push([
      { text: '💹 Risk Analysis', callback_data: `risk_analysis_${userId}` },
      { text: '📊 Export Report', callback_data: `export_portfolio_${userId}` }
    ]);

    return { inline_keyboard: buttons };
  }

  createDetailedKeyboard(userId, specificChain) {
    const buttons = [];

    // First row
    buttons.push([
      { text: '📊 Summary View', callback_data: `positions_summary_${specificChain || 'all'}` },
      { text: '🔄 Refresh', callback_data: `positions_refresh_${specificChain || 'all'}` }
    ]);

    // Second row - actions
    buttons.push([
      { text: '💼 Rebalance', callback_data: `rebalance_${userId}` },
      { text: '🎯 Set Targets', callback_data: `set_targets_${userId}` }
    ]);

    return { inline_keyboard: buttons };
  }

  formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  }
}

module.exports = new EnhancedPositionsCommand(); 