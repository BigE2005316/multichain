// core/BotCore.js - Professional Bot Architecture
const { Telegraf, session } = require('telegraf');

class BotCore {
  constructor(config) {
    this.bot = new Telegraf(config.token);
    this.handlers = new Map();
    this.middleware = [];
    this.errorHandlers = new Map();
    this.sessionManager = null;
    
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
    if (key) {
      return ctx.session?.data?.[key];
    }
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