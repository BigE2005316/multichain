// core/BotCore.js - Professional Bot Architecture
const { Telegraf, session } = require('telegraf');

class BotCore {
  constructor(config) {
    this.bot = new Telegraf(config.token);
    this.handlers = new Map();
    this.middleware = [];
    this.errorHandlers = new Map();
    this.sessionManager = null;
    this.textHandlerCategories = {};
    // Configure core middleware
    this.setupCoreMiddleware();
    this.setupErrorHandling();
  }

  setupCoreMiddleware() {
    // Session middleware with proper cleanup
    this.bot.use(session({
      defaultSession: () => ({
        state: 'idle',
        data: {},
        timestamp: Date.now()
      })
    }));

    // Request logging middleware
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      const userId = ctx.from?.id;
      const command = ctx.message?.text?.split(' ')[0];
      
      console.log(`📥 [${userId}] ${command || ctx.updateType}`);
      
      try {
        await next();
        const duration = Date.now() - start;
        console.log(`✅ [${userId}] Completed in ${duration}ms`);
      } catch (error) {
        const duration = Date.now() - start;
        console.log(`❌ [${userId}] Failed in ${duration}ms: ${error.message}`);
        throw error;
      }
    });

    // State validation middleware
    this.bot.use(async (ctx, next) => {
      if (!ctx.session) {
        ctx.session = {
          state: 'idle',
          data: {},
          timestamp: Date.now()
        };
      }
      
      // Clean up expired sessions (older than 1 hour)
      if (Date.now() - ctx.session.timestamp > 3600000) {
        this.clearSession(ctx);
      }
      
      await next();
    });
  }

  setupErrorHandling() {
    // Global error handler with proper categorization
    this.bot.catch(async (err, ctx) => {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorType = this.categorizeError(error);
      
      console.error(`❌ Bot Error [${errorType}]:`, {
        userId: ctx.from?.id,
        username: ctx.from?.username,
        updateType: ctx.updateType,
        error: error.message,
        stack: error.stack
      });

      // Handle specific error types
      await this.handleError(errorType, error, ctx);
    });

    // Process shutdown handling
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
    
    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection:', { reason, promise });
    });
  }

  registerTextHandlerCategory(categoryName, handler) {
    this.textHandlerCategories[categoryName] = handler;
    console.log(`📝 Registered text handler category: ${categoryName}`);
  }

  categorizeError(error) {
    if (error.message?.includes('403')) return 'USER_BLOCKED';
    if (error.message?.includes('429')) return 'RATE_LIMIT';
    if (error.message?.includes('insufficient')) return 'INSUFFICIENT_FUNDS';
    if (error.message?.includes('timeout')) return 'TIMEOUT';
    if (error.message?.includes('network')) return 'NETWORK';
    return 'UNKNOWN';
  }

  async handleError(errorType, error, ctx) {
    const errorMessages = {
      USER_BLOCKED: null, // Silent - don't try to message blocked users
      RATE_LIMIT: '⏳ System busy. Please wait 30 seconds and try again.',
      INSUFFICIENT_FUNDS: '💰 Insufficient balance. Please check your wallet and try with a smaller amount.',
      TIMEOUT: '⏱️ Request timeout. Please try again.',
      NETWORK: '🌐 Network issue. Please try again in a moment.',
      UNKNOWN: '❌ An unexpected error occurred. Please try again or contact support.'
    };

    const message = errorMessages[errorType];
    
    if (message && ctx.reply) {
      try {
        await ctx.reply(message);
      } catch (replyError) {
        console.error('Failed to send error message:', replyError.message);
      }
    }
  }

  // Register command handler with proper pattern
  registerCommand(command, handler, options = {}) {
    if (typeof handler !== 'function') {
      console.error(`Handler for command ${command} is not a function`);
      throw new Error(`Handler for command ${command} must be a function`);
    }

    this.handlers.set(command, {
      handler,
      options,
      type: 'command'
    });

    this.bot.command(command, async (ctx) => {
      try {
        // Clear any existing state for new commands
        if (options.clearState !== false) {
          this.clearSession(ctx);
        }
        
        await handler(ctx);
      } catch (error) {
        console.error(`Error in command ${command}:`, error);
        throw error; // Let global error handler catch it
      }
    });
  }

  // Register text handler with state awareness
  registerTextHandler(statePattern, handler) {
    this.bot.hears(/.+/, async (ctx, next) => {
      const currentState = ctx.session?.state || 'idle';
      
      if (statePattern === currentState || 
          (statePattern instanceof RegExp && statePattern.test(currentState))) {
        try {
          await handler(ctx);
        } catch (error) {
          throw error;
        }
      } else {
        await next();
      }
    });
  }

  // Register callback query handler
  registerCallbackHandler(pattern, handler) {
    this.bot.action(pattern, async (ctx) => {
      try {
        await ctx.answerCbQuery();
        await handler(ctx);
      } catch (error) {
        throw error;
      }
    });
  }

  // Add this method to your SmileSnipperBot class
async promptForTokenAddressOrKeyword(ctx, action = 'buy') {
  const chainName = ctx.session.buyChain.charAt(0).toUpperCase() + ctx.session.buyChain.slice(1);
  
  ctx.session.awaitingBuyTokenInput = true;
  
  await ctx.editMessageText(
    `🔍 **${chainName} Token Search**\n\n` +
    `Please input either:\n\n` +
    `• **Token Address** - Full contract address\n` +
    `• **Search Keyword** - Token name or symbol\n\n` +
    `**Examples:**\n` +
    `• \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\` (USDC address)\n` +
    `• \`BONK\` (search for BONK tokens)\n` +
    `• \`Pepe\` (search for Pepe tokens)\n` +
    `• \`USDC\` (search for USDC tokens)\n\n` +
    `**Chain:** ${chainName}`,
    { parse_mode: 'Markdown' }
  );
}

// Add token search functionality
async searchTokensByKeyword(keyword, chain) {
  try {
    const tokenDataService = require('../services/tokenDataService');
    
    // You'll need to implement this method in your tokenDataService
    // This should search for tokens by name/symbol from your preferred API
    const searchResults = await tokenDataService.searchTokens(keyword, chain);
    
    return searchResults || [];
  } catch (error) {
    console.error('Token search error:', error);
    return [];
  }
}

// Handle buy token input (address or search keyword)
async handleBuyTokenInput(ctx) {
  try {
    const input = ctx.message.text.trim();
    
    // Check if input looks like a token address (longer than 20 chars and alphanumeric)
    const isTokenAddress = input.length > 20 && /^[A-Za-z0-9]+$/.test(input);

    if (isTokenAddress) {
      // Direct token address input
      await this.handleDirectBuyTokenAddress(ctx, input);
    } else {
      // Search keyword input
      await this.handleBuyTokenSearch(ctx, input);
    }
  } catch (error) {
    console.error('Buy token input error:', error);
    await ctx.reply('❌ Error processing input. Please try again.');
  }
}

// Handle direct token address for buy
async handleDirectBuyTokenAddress(ctx, tokenAddress) {
  try {
    // Get token info
    const tokenDataService = require('../services/tokenDataService');
    const infoResult = await tokenDataService.getComprehensiveTokenInfo(tokenAddress, ctx.session.buyChain);
    const tokenInfo = infoResult?.data || {};

    if (!tokenInfo.name && !tokenInfo.symbol) {
      return ctx.reply('❌ Could not find token information. Please check the address and try again.');
    }

    // Show single token confirmation
    await this.showBuyTokenConfirmation(ctx, tokenAddress, tokenInfo, 'direct');
  } catch (error) {
    console.error('Direct buy token address error:', error);
    await ctx.reply('❌ Error processing token address. Please try again.');
  }
}

// Handle token search for buy
async handleBuyTokenSearch(ctx, keyword) {
  try {
    const searchResults = await this.searchTokensByKeyword(keyword, ctx.session.buyChain);

    if (searchResults.length === 0) {
      return ctx.reply(`❌ No tokens found matching "${keyword}" on ${ctx.session.buyChain.toUpperCase()}.`);
    }

    if (searchResults.length === 1) {
      // Single match - show confirmation
      const token = searchResults[0];
      await this.showBuyTokenConfirmation(ctx, token.address, token, 'search', keyword);
    } else {
      // Multiple matches - show selection menu
      await this.showBuyTokenSelectionMenu(ctx, searchResults, keyword);
    }
  } catch (error) {
    console.error('Buy token search error:', error);
    await ctx.reply('❌ Error searching for tokens. Please try again.');
  }
}

// Show buy token confirmation
// Update this method in your SmileSnipperBot class in app.js
async showBuyTokenConfirmation(ctx, tokenAddress, tokenInfo, inputType, searchKeyword = '') {
  try {
    let message = `🎯 **Token Found**\n\n`;
    
    if (inputType === 'search') {
      message += `🔍 **Search:** "${searchKeyword}"\n`;
    }
    
    const verifiedIcon = tokenInfo.verified ? '✅' : '';
    message += `${verifiedIcon}📊 **${tokenInfo.symbol || 'UNKNOWN'}** (${tokenInfo.name || 'Unknown Token'})\n`;
    
    // Price with better formatting
    if (tokenInfo.priceUSD > 0) {
      const priceDisplay = tokenInfo.priceUSD > 1 ? 
        tokenInfo.priceUSD.toFixed(4) : tokenInfo.priceUSD.toFixed(8);
      message += `💲 **Price:** $${priceDisplay}\n`;
    } else {
      message += `💲 **Price:** Not available\n`;
    }
    
    // Market cap
    if (tokenInfo.marketCap > 0) {
      message += `📊 **Market Cap:** $${this.formatNumber(tokenInfo.marketCap)}\n`;
    }
    
    // Liquidity
    if (tokenInfo.liquidity > 0) {
      message += `💰 **Liquidity:** $${this.formatNumber(tokenInfo.liquidity)}\n`;
    }
    
    // Volume
    if (tokenInfo.volume24h > 0) {
      message += `📈 **24h Volume:** $${this.formatNumber(tokenInfo.volume24h)}\n`;
    }
    
    // Price change
    if (tokenInfo.priceChange24h !== undefined && tokenInfo.priceChange24h !== 0) {
      const changeIcon = tokenInfo.priceChange24h >= 0 ? '📈' : '📉';
      message += `${changeIcon} **24h Change:** ${tokenInfo.priceChange24h.toFixed(2)}%\n`;
    }
    
    // Holders
    if (tokenInfo.holders > 0) {
      message += `👥 **Holders:** ${this.formatNumber(tokenInfo.holders)}\n`;
    }
    
    // Organic score (Jupiter specific)
    if (tokenInfo.organicScore > 0) {
      message += `📊 **Organic Score:** ${Math.round(tokenInfo.organicScore)}/100\n`;
    }
    
    message += `⛓️ **Chain:** ${ctx.session.buyChain.toUpperCase()}\n`;
    message += `📍 **Address:** \`${tokenAddress}\`\n\n`;
    message += `Select this token to proceed with purchase:`;

    // Store token for selection
    ctx.session.buySearchResults = [{ address: tokenAddress, ...tokenInfo }];

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{
            text: `✅ Select ${tokenInfo.symbol || 'Token'}`,
            callback_data: `select_buy_token_0`
          }],
          [{ 
            text: '🔍 Search Again', 
            callback_data: ctx.session.buyChain 
          }],
          [{ 
            text: '⬅️ Back to Chains', 
            callback_data: 'buy' 
          }]
        ]
      }
    });
  } catch (error) {
    console.error('Buy token confirmation error:', error);
    await ctx.reply('❌ Error displaying token confirmation. Please try again.');
  }
}

// Show buy token selection menu
// Update this method in your SmileSnipperBot class in app.js
async showBuyTokenSelectionMenu(ctx, tokens, keyword) {
  try {
    let message = `🔍 **Found ${tokens.length} tokens matching "${keyword}":**\n\n`;

    const buttons = [];
    for (let i = 0; i < Math.min(tokens.length, 10); i++) {
      const token = tokens[i];
      
      // Format market cap
      const mcapDisplay = token.marketCap > 0 ? this.formatNumber(token.marketCap) : 'N/A';
      
      // Format price with better precision
      let priceDisplay = 'N/A';
      if (token.priceUSD > 0) {
        if (token.priceUSD > 1) {
          priceDisplay = `$${token.priceUSD.toFixed(4)}`;
        } else {
          priceDisplay = `$${token.priceUSD.toFixed(8)}`;
        }
      }
      
      // Show additional info for verified tokens
      const verifiedIcon = token.verified ? '✅' : '';
      const organicScore = token.organicScore > 0 ? `📊${Math.round(token.organicScore)}` : '';
      
      message += `${i + 1}. ${verifiedIcon}**${token.symbol}** (${token.name || 'Unknown'})\n`;
      message += `   💲 Price: ${priceDisplay}\n`;
      message += `   📊 Market Cap: $${mcapDisplay}\n`;
      if (token.holders > 0) {
        message += `   👥 Holders: ${this.formatNumber(token.holders)}\n`;
      }
      if (token.volume24h > 0) {
        message += `   📈 24h Volume: $${this.formatNumber(token.volume24h)}\n`;
      }
      if (organicScore) {
        message += `   ${organicScore}\n`;
      }
      message += `\n`;

      // Create button text with key info
      let buttonText = `${i + 1}. ${token.symbol}`;
      if (token.verified) buttonText += ' ✅';
      if (token.priceUSD > 0) {
        buttonText += ` - ${priceDisplay}`;
      }
      
      buttons.push([{
        text: buttonText,
        callback_data: `select_buy_token_${i}`
      }]);
    }

    // Store search results in session for selection
    ctx.session.buySearchResults = tokens.slice(0, 10);

    buttons.push([{ 
      text: '🔍 Search Again', 
      callback_data: ctx.session.buyChain 
    }]);
    buttons.push([{ 
      text: '⬅️ Back to Chains', 
      callback_data: 'buy' 
    }]);

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: buttons
      }
    });
  } catch (error) {
    console.error('Buy token selection menu error:', error);
    await ctx.reply('❌ Error displaying token selection. Please try again.');
  }
}
// Format large numbers
formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toString();
}
  // Session state management
  setState(ctx, state, data = {}) {
    ctx.session.state = state;
    ctx.session.data = { ...ctx.session.data, ...data };
    ctx.session.timestamp = Date.now();
  }

  getState(ctx) {
    return ctx.session?.state || 'idle';
  }

  getData(ctx, key = null) {
    debugger
    if (key) {
      return ctx.session?.data?.[key];
    }
    debugger
    return ctx.session?.data || {};
  }

  clearSession(ctx) {
    ctx.session = {
      state: 'idle',
      data: {},
      timestamp: Date.now()
    };
  }

  // Service registration
  registerService(name, service) {
    debugger
    if (!service || typeof service !== 'object') {
      throw new Error(`Service ${name} must be an object`);
    }
    
    this[name] = service;
    console.log(`✅ Service '${name}' registered`);
  }

  // Bot lifecycle
  async start() {
    try {
      console.log('🚀 Starting bot...');
      
      // Register global cancel command
      this.registerCommand('cancel', (ctx) => {
        this.clearSession(ctx);
        return ctx.reply('🚫 Operation cancelled. All pending actions cleared.');
      });
      
      // Register global help command
      this.registerCommand('help', (ctx) => {
        return ctx.reply(`🤖 **Bot Commands:**

**Trading:**
• /buy <amount> <token> - Buy tokens
• /sell <amount|%> <token> - Sell tokens  
• /positions - View your positions
• /balance - Check wallet balance

**Wallet:**
• /wallet - Manage wallets
• /addwallet - Track a wallet for copy trading

**Settings:**
• /settings - View/change settings
• /admin - Admin panel (admin only)

**Support:**
• /support - Get help
• /cancel - Cancel current operation

✨ **Professional trading bot with real blockchain execution**`, 
          { parse_mode: 'Markdown' });
      });
       await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });

      await this.bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: ['message', 'callback_query']
      });
      
      console.log('✅ Bot started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      throw error;
    }
  }

  async gracefulShutdown() {
    console.log('🛑 Shutting down bot gracefully...');
    
    try {
      this.bot.stop('SIGINT');
      console.log('✅ Bot stopped successfully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
    
    process.exit(0);
  }

  // Get bot instance for external use
  getBot() {
    return this.bot;
  }
}

module.exports = BotCore; 