const User = require('../src/models/User');
const WalletFollow = require('../src/models/WalletFollow');
const walletService = require('../services/walletService');
const userService = require('../users/userService');

class CopyTradeHandlers {
    // Handler to notify follower of a detected trade
    async notifyFollowerTrade(botInstance, userTgId, tradeId, tradeDetails) {
      const { tokenSymbol, amount, tradeType } = tradeDetails;
      await botInstance.telegram.sendMessage(
        userTgId,
        `🔔 Trade detected for leader.\nDo you want to copy this trade?\n\nDetails:\n• Token: ${tokenSymbol}\n• Amount: ${amount}\n• Type: ${tradeType}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Accept', callback_data: `copytrade_accept_${tradeId}` },
                { text: '❌ Decline', callback_data: `copytrade_decline_${tradeId}` }
              ]
            ]
          }
        }
      );
    }
  constructor() {
    this.name = 'CopyTradeHandlers';
  }

  // Helper method to get chain symbol
  getChainSymbol(chain) {
    const symbols = {
      'solana': 'SOL',
      'ethereum': 'ETH',
      'bsc': 'BNB',
      'polygon': 'MATIC',
      'arbitrum': 'ETH',
      'base': 'ETH'
    };
    return symbols[chain?.toLowerCase()] || 'TOKEN';
  }

  // Register all copy trading handlers
  registerHandlers(botCore) {
        // Follower Accept/Decline trade callback handlers
        botCore.registerCallbackHandler(/copytrade_accept_(.+)/, async (ctx) => {
          const tradeId = ctx.match[1];
          ctx.session = ctx.session || {};
          ctx.session.pendingTradeId = tradeId;
          ctx.session.awaitingCustomParams = true;
          await ctx.reply('✏️ Please reply with your custom parameters in the format: `amount:<number> slippage:<number>`\nExample: `amount:10 slippage:5`', { parse_mode: 'Markdown' });
        });

        botCore.registerCallbackHandler(/copytrade_decline_(.+)/, async (ctx) => {
          await ctx.reply('❌ Trade declined. You will not copy this trade.');
          ctx.session.pendingTradeId = null;
          ctx.session.awaitingCustomParams = false;
        });

        // Text handler for custom parameter input
        botCore.registerTextHandlerCategory('awaitingCustomParams', async (ctx) => {
          if (!ctx.session?.awaitingCustomParams || !ctx.session?.pendingTradeId) return;
          const paramsText = ctx.message.text.trim();
          // Parse format: amount:<number> slippage:<number>
          const paramMatch = paramsText.match(/amount\s*:\s*(\d+(?:\.\d+)?)\s+slippage\s*:\s*(\d+(?:\.\d+)?)/i);
          if (!paramMatch) {
            await ctx.reply('❌ Invalid format. Please use: `amount:<number> slippage:<number>`');
            return;
          }
          const amount = parseFloat(paramMatch[1]);
          const slippage = parseFloat(paramMatch[2]);

          // Save params to TradeLog follower entry
          const TradeLog = require('../src/models/TradeLog.js');
          const log = await TradeLog.findById(ctx.session.pendingTradeId);
          if (!log) {
            await ctx.reply('❌ Trade not found.');
            ctx.session.awaitingCustomParams = false;
            ctx.session.pendingTradeId = null;
            return;
          }
          // Find follower entry for this user
          const follower = log.followers.find(f => f.userId.toString() === ctx.from.id.toString());
          if (!follower) {
            await ctx.reply('❌ You are not a follower for this trade.');
            ctx.session.awaitingCustomParams = false;
            ctx.session.pendingTradeId = null;
            return;
          }
          follower.customAmount = amount;
          follower.customSlippage = slippage;
          await log.save();

          await ctx.reply(`✅ Trade confirmed!\nAmount: ${amount}\nSlippage: ${slippage}`);
          ctx.session.awaitingCustomParams = false;
          ctx.session.pendingTradeId = null;
          // Optionally: enqueue execution job for this user/trade here
        });
    // Main Copy Trade menu handler
    botCore.registerCallbackHandler('copytrade', async (ctx) => {
      try {
        // Get user's current tracking status
        const userId = ctx.from.id;
        const user = await User.findOne({ tgId: String(userId) });
        const userSettings = await userService.getUserSettings(userId);
        
        let trackedWallets = 0;
        let activeWallets = 0;
        
        if (user && user.follows) {
          trackedWallets = user.follows.length;
          activeWallets = user.follows.filter(f => f.active).length;
        }
        
        const chain = userSettings?.chain || 'solana';
        
        let message = `🤖 **Copy Trading Hub**\n\n`;
        message += `⛓️ **Current Chain:** ${chain.toUpperCase()}\n`;
        message += `📊 **Status Overview:**\n`;
        message += `• Tracked Wallets: ${trackedWallets}\n`;
        message += `• Active Copies: ${activeWallets}\n`;
        message += `• Paused: ${trackedWallets - activeWallets}\n\n`;
        
        if (trackedWallets === 0) {
          message += `🚀 **Get Started:**\n`;
          message += `Start by adding wallets to track their trades automatically.\n\n`;
        } else {
          message += `💡 **Quick Actions:**\n`;
          message += `Manage your copy trading settings below.\n\n`;
        }
        
        message += `**How Copy Trading Works:**\n`;
        message += `1️⃣ Add wallets to track\n`;
        message += `2️⃣ Configure trade settings\n`;
        message += `3️⃣ Start copying trades automatically\n`;
        message += `4️⃣ Monitor performance & adjust`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: '➕ Add Wallet', callback_data: 'ct_add_wallet' },
              { text: '📋 My Wallets', callback_data: 'ct_wallet_status' }
            ],
            [
              { text: '⚙️ Settings', callback_data: 'ct_settings' },
              { text: '📊 Performance', callback_data: 'ct_performance' }
            ],
            [
              { text: '🚀 Quick Start', callback_data: 'ct_quick_start' },
              { text: '❓ Help', callback_data: 'ct_help' }
            ],
            [
              { text: '⬅️ Back to Menu', callback_data: 'main_menu' }
            ]
          ]
        };

        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
        await ctx.answerCbQuery();

      } catch (error) {
        console.error('Copy trade menu error:', error);
        await ctx.answerCbQuery('❌ Error loading copy trade menu');
        await ctx.reply('❌ Failed to load copy trading menu. Please try again.');
      }
    });

    // Add Wallet handler
    botCore.registerCallbackHandler('ct_add_wallet', async (ctx) => {
      // Prompt user to send wallet address directly via chat
      ctx.session = ctx.session || {};
      ctx.session.awaitingBeginWallet = true;
      ctx.session.activeTextHandler = 'awaitingBeginWallet';
        ctx.session.state = 'awaitingBeginWallet'; // Also set session.state for compatibility with registerTextHandler flows

      await ctx.editMessageText(
        `➕ **Add Wallet to Track**\n\n` +
        `Please send the wallet address you want to track (or type CANCEL to abort).\n\n` +
        `**Example:**\n` +
        `\`7xCUsFgE4Hc3a9Zc6Uz4Y13HQhdGbxpwyAtF5hSKiiuZ\`\n\n` +
        `**Tips:** Use DEXScreener to find interesting wallets.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [ { text: '🔍 Find Wallets on DEXScreener', url: 'https://dexscreener.com/solana' } ],
              [ { text: '⬅️ Back', callback_data: 'copytrade' } ]
            ]
          }
        }
      );

      await ctx.answerCbQuery();
    });

    // Text handler: awaiting wallet address after pressing Add Wallet
    botCore.registerTextHandlerCategory('awaitingBeginWallet', async (ctx) => {
      ctx.session = ctx.session || {};

      // Debug log for incoming wallet address while awaiting
      console.log(`📝 awaitingBeginWallet received text from ${ctx.from?.id}:`, ctx.message?.text || '(no text)');

      const text = (ctx.message && ctx.message.text) ? ctx.message.text.trim() : '';
      if (!text) return;

      // Cancel
      if (/^cancel$/i.test(text) || /^\/cancel$/i.test(text)) {
        ctx.session.awaitingBeginWallet = false;
        ctx.session.activeTextHandler = null;
        return ctx.reply('❌ Add wallet cancelled.');
      }

      const walletAddress = text.split(' ')[0].trim();

      // Basic validation: use walletService.detectChainFromAddress
      try {
        const followerChainRaw = await walletService.detectChainFromAddress(walletAddress);
        if (!followerChainRaw || (!/Solana/i.test(followerChainRaw) && !/EVM/i.test(followerChainRaw) && !/Ethereum/i.test(followerChainRaw))) {
          return ctx.reply('❌ Invalid wallet address format. Please send a valid Solana or EVM address.');
        }

        // Normalize chain and prepare enum/friendly values
        const isSol = /Solana/i.test(followerChainRaw);
        const followerChain = isSol ? 'solana' : 'ethereum';
        const walletFollowChainEnum = isSol ? 'SOL' : 'EVM';

        // Use user's preferred chain for friendly display/storage (fallback to detected)
        const userSettings = await userService.getUserSettings(ctx.from.id);
        const userChainFriendly = (userSettings?.chain || (isSol ? 'solana' : 'ethereum')).toLowerCase();

        // Prepare pending follow and ask for confirmation
        ctx.session.pendingFollow = {
          address: walletAddress,
          walletFollowChainEnum,
          userChainFriendly
        };

        // clear awaitingBeginWallet and set awaitingFollowConfirmation
        ctx.session.awaitingBeginWallet = false;
        ctx.session.awaitingFollowConfirmation = true;
        ctx.session.activeTextHandler = 'awaitingFollowConfirmation';

        const confirmMessage = `⚠️ **Confirm Add Wallet**\n\n` +
          `You are about to follow **${walletAddress}** on **${userChainFriendly.toUpperCase()}**.\n` +
          `This will enable automatic copy trading based on that wallet's activity.\n\n` +
          `Reply YES to confirm or NO to cancel.`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: '✅ Yes, follow', callback_data: 'ct_confirm_follow_yes' },
              { text: '❌ No, cancel', callback_data: 'ct_confirm_follow_no' }
            ]
          ]
        };

        await ctx.reply(confirmMessage, { parse_mode: 'Markdown', reply_markup: keyboard });

      } catch (error) {
        console.error('ct_add_wallet text handler error:', error);
        ctx.session.awaitingBeginWallet = false;
        ctx.session.activeTextHandler = null;
        await ctx.reply('❌ Error validating wallet address. Please try again later.');
      }
    });

    // Text handler: awaiting confirmation (YES/NO)
    botCore.registerTextHandlerCategory('awaitingFollowConfirmation', async (ctx) => {
      ctx.session = ctx.session || {};
      const text = (ctx.message && ctx.message.text) ? ctx.message.text.trim() : '';
      if (!text) return;

      if (/^yes$/i.test(text)) {
        // Simulate pressing YES
        return await handleFollowConfirmation(ctx, true);
      }

      if (/^no$/i.test(text)) {
        return await handleFollowConfirmation(ctx, false);
      }

      // If unrecognized, prompt again
      await ctx.reply('Please reply YES to confirm following the wallet or NO to cancel.');
    });

    // Callback handlers for confirm/deny
    botCore.registerCallbackHandler('ct_confirm_follow_yes', async (ctx) => {
      await ctx.answerCbQuery();
      await handleFollowConfirmation(ctx, true);
    });

    botCore.registerCallbackHandler('ct_confirm_follow_no', async (ctx) => {
      await ctx.answerCbQuery();
      await handleFollowConfirmation(ctx, false);
    });

    // Shared follow confirmation handler
    async function handleFollowConfirmation(ctx, confirmed) {
      try {
        ctx.session = ctx.session || {};
        const pending = ctx.session.pendingFollow;
        if (!pending) {
          return ctx.reply('❌ No pending follow request. Please add a wallet first.');
        }

        // If canceled
        if (!confirmed) {
          ctx.session.pendingFollow = null;
          ctx.session.awaitingFollowConfirmation = false;
          ctx.session.activeTextHandler = null;
          return ctx.reply('❌ Add wallet cancelled.');
        }

        const { address, walletFollowChainEnum, userChainFriendly } = pending;

        // Load user
        const user = await User.findOne({ tgId: String(ctx.from.id) });
        if (!user) return ctx.reply('❌ User not found. Please /start first.');

        // Ensure WalletFollow exists (use enum values expected by schema)
        let walletFollow = await WalletFollow.findOne({ chain: walletFollowChainEnum, leader: address });
        if (!walletFollow) {
          walletFollow = new WalletFollow({ chain: walletFollowChainEnum, leader: address, followers: [] });
          await walletFollow.save();
        }

        // Check existing follower
        const followerExists = walletFollow.followers.some(f => f.userId.toString() === user._id.toString());
        if (!followerExists) {
          walletFollow.followers.push({ userId: user._id, ratio: 1, slippageBps: 50, maxUsdPerTrade: 100, active: true });
          await walletFollow.save();
        } else {
          // If already following, just inform the user
          ctx.session.pendingFollow = null;
          ctx.session.awaitingFollowConfirmation = false;
          ctx.session.activeTextHandler = null;
          return ctx.reply('ℹ️ You are already following this wallet.');
        }

        // Add to user's follows list (store enum to keep consistency with other flows)
        const idx = user.follows.findIndex(f => f.chain === walletFollowChainEnum && f.address.toLowerCase() === address.toLowerCase());
        const payload = { chain: walletFollowChainEnum, address, ratio: 1, active: true };
        if (idx >= 0) user.follows[idx] = { ...user.follows[idx], ...payload };
        else user.follows.push(payload);
        await user.save();

        // Clear pending session
        ctx.session.pendingFollow = null;
        ctx.session.awaitingFollowConfirmation = false;
        ctx.session.activeTextHandler = null;

        const displayChain = walletFollowChainEnum === 'SOL' ? 'Solana' : 'EVM';
        await ctx.reply(`✅ **Wallet Added Successfully!**\n\n**Address:** \`${address}\`\n**Chain:** ${displayChain}\n\nUse /begin <address> to start copying or /walletstatus to view tracked wallets.`, { parse_mode: 'Markdown' });

      } catch (err) {
        console.error('handleFollowConfirmation error:', err);
        ctx.session.pendingFollow = null;
        ctx.session.awaitingFollowConfirmation = false;
        ctx.session.activeTextHandler = null;
        await ctx.reply('❌ Error confirming follow. Please try again later.');
      }
    }

    // Wallet Status handler
    botCore.registerCallbackHandler('ct_wallet_status', async (ctx) => {
      try {
        const userId = ctx.from.id;
        const user = await User.findOne({ tgId: String(userId) });
        
        let message = `📋 **My Tracked Wallets**\n\n`;
        
        if (!user || !user.follows || user.follows.length === 0) {
          message += `❌ **No wallets tracked yet**\n\n`;
          message += `Start by adding wallets with /addwallet\n\n`;
          message += `**Where to find profitable wallets:**\n`;
            ctx.session.state = 'idle'; // Clear state back to 'idle'
            return ctx.reply('❌ Add wallet cancelled.');
          message += `• Twitter/X alpha calls\n`;
          message += `• Discord trading communities\n`;
          message += `• Successful traders' public wallets`;
        } else {
          message += `**Total Wallets:** ${user.follows.length}\n\n`;
          
          for (let i = 0; i < user.follows.length; i++) {
            const wallet = user.follows[i];
            const status = wallet.active ? '🟢 Active' : '🟡 Paused';
            const shortAddress = `${wallet.address.substring(0, 8)}...${wallet.address.substring(wallet.address.length - 8)}`;
            
            message += `**${i + 1}.** ${status}\n`;
            message += `📍 \`${shortAddress}\`\n`;
            message += `⛓️ Chain: ${wallet.chain.toUpperCase()}\n`;
            message += `📊 Ratio: ${wallet.ratio}x\n`;
            
            // Add custom name if exists (map friendly chain to enum expected by WalletFollow)
            const queryChainEnum = (wallet.chain || '').toLowerCase().includes('sol') ? 'SOL' : 'EVM';
            const walletFollow = await WalletFollow.findOne({ 
              chain: queryChainEnum, 
              leader: wallet.address 
            });
            
            if (walletFollow && walletFollow.customName) {
              message += `🏷️ Name: ${walletFollow.customName}\n`;
            }
            
            message += `\n`;
          }
          
          message += `**Available Commands:**\n`;
          message += `• \`/begin <address>\` - Start copying\n`;
          message += `• \`/pause <address>\` - Pause copying\n`;
          message += `• \`/stop <address>\` - Stop & remove\n`;
          message += `• \`/namewallet <address> <name>\` - Name wallet\n`;
          message += `• \`/setratio <address> <ratio>\` - Set copy ratio`;
        }

        const keyboard = {
          inline_keyboard: [
            [
              { text: '➕ Add More', callback_data: 'ct_add_wallet' },
              { text: '⚙️ Settings', callback_data: 'ct_settings' }
            ],
            [
              { text: '🔄 Refresh', callback_data: 'ct_wallet_status' },
              { text: '📊 Performance', callback_data: 'ct_performance' }
            ],
            [
              { text: '⬅️ Back', callback_data: 'copytrade' }
            ]
          ]
        };

        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('Wallet status error:', error);
        await ctx.editMessageText('❌ Failed to load wallet status. Please try again.', {
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'copytrade' }]]
          }
        });
      }
      await ctx.answerCbQuery();
    });

    // Settings handler
    botCore.registerCallbackHandler('ct_settings', async (ctx) => {
      try {
        const userSettings = await userService.getUserSettings(ctx.from.id);
        
        const message = `⚙️ **Copy Trading Settings**\n\n` +
          `⛓️ **Chain:** ${(userSettings?.chain || 'solana').toUpperCase()}\n` +
          `💰 **Default Amount:** ${userSettings?.amount || 0.1} ${this.getChainSymbol(userSettings?.chain)}\n` +
          `📊 **Slippage:** ${userSettings?.slippage || 5}%\n` +
          `🎯 **Auto-approve:** ${userSettings?.autoApprove ? 'Enabled' : 'Disabled'}\n\n` +
          `**Global Copy Settings:**\n` +
          `• Max per trade: $100 (adjustable)\n` +
          `• Daily limit: $1000 (safety feature)\n` +
          `• Risk level: Medium\n` +
          `• Copy sells: ${userSettings?.copySells ? 'Yes' : 'No'}\n\n` +
          `**Configuration Commands:**\n` +
          `• \`/setchain <chain>\` - Change blockchain\n` +
          `• \`/amount <value>\` - Set trade amount\n` +
          `• \`/slippage <percent>\` - Set slippage tolerance\n` +
          `• \`/copysells\` - Toggle copying sell orders\n` +
          `• \`/autoapprove\` - Toggle auto-approval`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: '⛓️ Change Chain', callback_data: 'ct_change_chain' },
              { text: '💰 Set Amount', callback_data: 'ct_set_amount' }
            ],
            [
              { text: '📊 Risk Settings', callback_data: 'ct_risk_settings' },
              { text: '🎯 Auto-approve', callback_data: 'ct_toggle_auto' }
            ],
            [
              { text: '💸 Copy Sells', callback_data: 'ct_toggle_sells' },
              { text: '📈 Slippage', callback_data: 'ct_set_slippage' }
            ],
            [
              { text: '⬅️ Back', callback_data: 'copytrade' }
            ]
          ]
        };

        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('Settings error:', error);
        await ctx.editMessageText('❌ Failed to load settings. Please try again.', {
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'copytrade' }]]
          }
        });
      }
      await ctx.answerCbQuery();
    });

    // Performance handler
    botCore.registerCallbackHandler('ct_performance', async (ctx) => {
      try {
        const userId = ctx.from.id;
        const user = await User.findOne({ tgId: String(userId) });
        
        // Get user's trading history from database
        // This is a mock implementation - replace with actual data
        let totalTrades = 0;
        let successfulTrades = 0;
        let totalVolume = 0;
        let totalPnL = 0;
        
        // Calculate actual stats if available
        if (user && user.tradingStats) {
          totalTrades = user.tradingStats.totalTrades || 0;
          successfulTrades = user.tradingStats.successfulTrades || 0;
          totalVolume = user.tradingStats.totalVolume || 0;
          totalPnL = user.tradingStats.totalPnL || 0;
        }
        
        const successRate = totalTrades > 0 ? (successfulTrades / totalTrades * 100).toFixed(1) : '0.0';
        const avgTradeSize = totalTrades > 0 ? (totalVolume / totalTrades).toFixed(2) : '0.00';
        
        const message = `📊 **Copy Trading Performance**\n\n` +
          `**Today's Summary:**\n` +
          `• Trades Executed: ${totalTrades}\n` +
          `• Success Rate: ${successRate}%\n` +
          `• Total Volume: $${totalVolume.toFixed(2)}\n` +
          `• P&L: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)} (${totalPnL >= 0 ? '+' : ''}${totalVolume > 0 ? (totalPnL/totalVolume*100).toFixed(1) : '0.0'}%)\n\n` +
          `**Statistics:**\n` +
          `• Average Trade Size: $${avgTradeSize}\n` +
          `• Best Performing Token: ${user?.tradingStats?.bestToken || 'N/A'}\n` +
          `• Most Copied Wallet: ${user?.tradingStats?.topWallet || 'N/A'}\n\n` +
          `**Recent Activity:**\n`;
        
        // Add recent trades if available
        if (user && user.recentTrades && user.recentTrades.length > 0) {
          user.recentTrades.slice(0, 5).forEach((trade, index) => {
            const timeAgo = Math.floor((Date.now() - new Date(trade.timestamp)) / (1000 * 60));
            message += `• ${trade.token}: ${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(1)}% (${timeAgo}m ago)\n`;
          });
        } else {
          message += `• No recent trades to display\n`;
          message += `• Start copy trading to see performance data\n`;
          message += `• Add wallets with /addwallet command`;
        }

        const keyboard = {
          inline_keyboard: [
            [
              { text: '📈 Detailed Stats', callback_data: 'ct_detailed_stats' },
              { text: '📋 Trade History', callback_data: 'ct_trade_history' }
            ],
            [
              { text: '🏆 Top Performers', callback_data: 'ct_top_performers' },
              { text: '📊 Weekly Report', callback_data: 'ct_weekly_report' }
            ],
            [
              { text: '🔄 Refresh', callback_data: 'ct_performance' },
              { text: '⬅️ Back', callback_data: 'copytrade' }
            ]
          ]
        };

        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('Performance error:', error);
        await ctx.editMessageText('❌ Failed to load performance data. Please try again.', {
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'copytrade' }]]
          }
        });
      }
      await ctx.answerCbQuery();
    });

    // Quick Start handler
    botCore.registerCallbackHandler('ct_quick_start', async (ctx) => {
      const message = `🚀 **Copy Trading Quick Start Guide**\n\n` +
        `**Step 1: Find Profitable Wallets 🔍**\n` +
        `• Visit DEXScreener or DexTools\n` +
        `• Look for tokens with recent big gains\n` +
        `• Click on profitable transactions\n` +
        `• Copy the wallet address of successful traders\n\n` +
        `**Step 2: Add Wallet to Track 📋**\n` +
        `• Use: \`/addwallet <wallet_address>\`\n` +
        `• Example: \`/addwallet 7xCUsF...KiiuZ\`\n` +
        `• Give it a name: \`/namewallet <address> <name>\`\n\n` +
        `**Step 3: Configure Your Settings ⚙️**\n` +
        `• Set your chain: \`/setchain solana\`\n` +
        `• Set trade amount: \`/amount 0.1\`\n` +
        `• Set slippage: \`/slippage 5\`\n` +
        `• Enable copy sells: \`/copysells\`\n\n` +
        `**Step 4: Start Copying 🚀**\n` +
        `• Use: \`/begin <wallet_address>\`\n` +
        `• Bot will copy all their trades automatically\n` +
        `• Monitor with \`/walletstatus\`\n\n` +
        `**Pro Tips 💡**\n` +
        `• Start with small amounts (0.01-0.1 SOL)\n` +
        `• Track multiple wallets for diversification\n` +
        `• Use \`/pause\` to temporarily stop copying\n` +
        `• Monitor performance regularly\n` +
        `• Set daily/trade limits for risk management`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '➕ Add First Wallet', callback_data: 'ct_add_wallet' },
            { text: '⚙️ Settings', callback_data: 'ct_settings' }
          ],
          [
            { text: '🔍 Find Wallets', url: 'https://dexscreener.com/solana' },
            { text: '📖 Research Guide', callback_data: 'ct_research_guide' }
          ],
          [
            { text: '❓ Help', callback_data: 'ct_help' },
            { text: '⬅️ Back', callback_data: 'copytrade' }
          ]
        ]
      };

    // --- Admin trade approval callbacks ---
    botCore.registerCallbackHandler(/ct_trade_approve_(.+)_(\d+)/, async (ctx) => {
      try {
        if (String(ctx.from.id) !== String(process.env.ADMIN_TELEGRAM_ID)) return ctx.reply('❌ Only admin can approve trades');
        const data = ctx.callbackQuery.data;
        const m = data.match(/ct_trade_approve_(.+)_(\d+)/);
        if (!m) return;
        const tradeId = m[1];
        const percent = Number(m[2]);

        const TradeLog = require('../src/models/TradeLog.js');
        const log = await TradeLog.findById(tradeId);
        if (!log) return ctx.reply('❌ Trade log not found');

        log.confirmed = true;
        log.replicateMode = 'percent';
        log.replicateValue = String(percent);
        await log.save();

        // Build parsed payload for enqueue
        const parsed = {
          tokenIn: log.tokenIn,
          tokenOut: log.tokenOut,
          amountIn: String((parseFloat(log.amountIn || '0') * (percent / 100)).toFixed(8)),
          amountOutMin: log.amountOutMin,
          txHash: log.leaderTx
        };

        const { enqueueExecution } = require('../src/queue/index.js');
        await enqueueExecution({ chain: log.chain, tradeLogId: String(log._id), leader: log.leader, parsed });

        await ctx.reply(`✅ Trade approved: ${percent}% will be replicated (Trade ${tradeId})`);
      } catch (err) {
        console.error('approve trade error:', err);
        await ctx.reply('❌ Error approving trade');
      }
    });

    botCore.registerCallbackHandler(/ct_trade_reject_(.+)/, async (ctx) => {
      try {
        if (String(ctx.from.id) !== String(process.env.ADMIN_TELEGRAM_ID)) return ctx.reply('❌ Only admin can reject trades');
        const m = ctx.callbackQuery.data.match(/ct_trade_reject_(.+)/);
        if (!m) return;
        const tradeId = m[1];
        const TradeLog = require('../src/models/TradeLog.js');
        const log = await TradeLog.findById(tradeId);
        if (!log) return ctx.reply('❌ Trade log not found');

        log.confirmed = false;
        log.replicateMode = null;
        log.replicateValue = null;
        await log.save();

        await ctx.reply(`❌ Trade rejected (Trade ${tradeId})`);
      } catch (err) {
        console.error('reject trade error:', err);
        await ctx.reply('❌ Error rejecting trade');
      }
    });

    botCore.registerCallbackHandler(/ct_trade_manual_(.+)/, async (ctx) => {
      try {
        if (String(ctx.from.id) !== String(process.env.ADMIN_TELEGRAM_ID)) return ctx.reply('❌ Only admin can approve trades');
        const m = ctx.callbackQuery.data.match(/ct_trade_manual_(.+)/);
        if (!m) return;
        const tradeId = m[1];

        ctx.session = ctx.session || {};
        ctx.session.awaitingTradeConfirmation = true;
        ctx.session.pendingTradeId = tradeId;

        await ctx.reply('✏️ Please reply with an amount (e.g. `10 SOL`) or percentage (e.g. `25%`) to replicate for this trade.');
      } catch (err) {
        console.error('manual trade handler error:', err);
        await ctx.reply('❌ Error starting manual approval');
      }
    });

    // Text handler for manual trade confirmation
    botCore.registerTextHandlerCategory('awaitingTradeConfirmation', async (ctx) => {
      try {
        ctx.session = ctx.session || {};
        if (!ctx.session.awaitingTradeConfirmation || !ctx.session.pendingTradeId) return;
        const text = (ctx.message && ctx.message.text) ? ctx.message.text.trim() : '';
        if (!text) return;

        // Parse percent e.g. '25%'
        const pct = text.match(/^(\d+(?:\.\d+)?)%$/);
        const amt = text.match(/^(\d+(?:\.\d+)?)(?:\s*(\w+))?$/);
        const TradeLog = require('../src/models/TradeLog.js');
        const tradeId = ctx.session.pendingTradeId;
        const log = await TradeLog.findById(tradeId);
        if (!log) {
          ctx.session.awaitingTradeConfirmation = false;
          ctx.session.pendingTradeId = null;
          return ctx.reply('❌ Trade not found');
        }

        if (pct) {
          const percent = Number(pct[1]);
          log.confirmed = true;
          log.replicateMode = 'percent';
          log.replicateValue = String(percent);
          await log.save();

          const parsed = {
            tokenIn: log.tokenIn,
            tokenOut: log.tokenOut,
            amountIn: String((parseFloat(log.amountIn || '0') * (percent / 100)).toFixed(8)),
            amountOutMin: log.amountOutMin,
            txHash: log.leaderTx
          };

          const { enqueueExecution } = require('../src/queue/index.js');
          await enqueueExecution({ chain: log.chain, tradeLogId: String(log._id), leader: log.leader, parsed });

          await ctx.reply(`✅ Trade approved: ${percent}% will be replicated (Trade ${tradeId})`);
        } else if (amt) {
          // Take the numeric part as absolute amount (token units)
          const amountNum = Number(amt[1]);
          log.confirmed = true;
          log.replicateMode = 'amount';
          log.replicateValue = String(amountNum);
          await log.save();

          const parsed = {
            tokenIn: log.tokenIn,
            tokenOut: log.tokenOut,
            amountIn: String(amountNum),
            amountOutMin: log.amountOutMin,
            txHash: log.leaderTx
          };

          const { enqueueExecution } = require('../src/queue/index.js');
          await enqueueExecution({ chain: log.chain, tradeLogId: String(log._id), leader: log.leader, parsed });

          await ctx.reply(`✅ Trade approved: ${amountNum} (absolute) will be replicated (Trade ${tradeId})`);
        } else {
          await ctx.reply('❌ Unrecognized format. Please reply with a percentage like `25%` or an absolute amount like `10` or `10 SOL`.');
        }

        ctx.session.awaitingTradeConfirmation = false;
        ctx.session.pendingTradeId = null;
      } catch (err) {
        console.error('awaitingTradeConfirmation error:', err);
        ctx.session.awaitingTradeConfirmation = false;
        ctx.session.pendingTradeId = null;
        await ctx.reply('❌ Error processing confirmation');
      }
    });

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      await ctx.answerCbQuery();
    });

    // Help handler
    botCore.registerCallbackHandler('ct_help', async (ctx) => {
      const message = `❓ **Copy Trading Help & FAQ**\n\n` +
        `**🔧 Available Commands:**\n` +
        `• \`/addwallet <address>\` - Add wallet to track\n` +
        `• \`/namewallet <address> <name>\` - Name a wallet\n` +
        `• \`/begin <address>\` - Start copying trades\n` +
        `• \`/pause <address>\` - Pause copying\n` +
        `• \`/stop <address>\` - Stop and remove wallet\n` +
        `• \`/walletstatus\` - View all tracked wallets\n` +
        `• \`/setratio <address> <ratio>\` - Set copy ratio\n` +
        `• \`/copysells\` - Toggle copying sell orders\n\n` +
        `**🤔 Frequently Asked Questions:**\n\n` +
        `**Q: How fast are trades copied?**\n` +
        `A: Usually within 2-5 seconds of detection\n\n` +
        `**Q: Can I set different amounts per wallet?**\n` +
        `A: Yes, use \`/setratio <address> <ratio>\`\n\n` +
        `**Q: What if I don't have enough balance?**\n` +
        `A: Trade will be skipped and you'll be notified\n\n` +
        `**Q: Can I copy sells too?**\n` +
        `A: Yes, enable with \`/copysells\` command\n\n` +
        `**Q: How much does it cost?**\n` +
        `A: Only standard blockchain fees + 3% dev fee\n\n` +
        `**Q: Can I copy multiple wallets?**\n` +
        `A: Yes, no limit on tracked wallets\n\n` +
        `**Q: What chains are supported?**\n` +
        `A: Solana, Ethereum, BSC, Polygon, Arbitrum, Base\n\n` +
        `**Need more help?** Use /support command`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📞 Contact Support', callback_data: 'contact_support' },
            { text: '🚀 Quick Start', callback_data: 'ct_quick_start' }
          ],
          [
            { text: '💡 Trading Tips', callback_data: 'ct_trading_tips' },
            { text: '🔍 Research Guide', callback_data: 'ct_research_guide' }
          ],
          [
            { text: '⬅️ Back', callback_data: 'copytrade' }
          ]
        ]
      };

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      await ctx.answerCbQuery();
    });

    // Additional helper handlers for settings
    botCore.registerCallbackHandler('ct_change_chain', async (ctx) => {
      await ctx.editMessageText(
        `⛓️ **Change Trading Chain**\n\n` +
        `Use the command: \`/setchain <chain_name>\`\n\n` +
        `**Available Chains:**\n` +
        `• \`/setchain solana\` - Solana (SOL)\n` +
        `• \`/setchain ethereum\` - Ethereum (ETH)\n` +
        `• \`/setchain bsc\` - Binance Smart Chain (BNB)\n` +
        `• \`/setchain polygon\` - Polygon (MATIC)\n` +
        `• \`/setchain arbitrum\` - Arbitrum (ETH)\n` +
        `• \`/setchain base\` - Base (ETH)\n\n` +
        `This will change the blockchain for all future copy trades.\n\n` +
        `**Note:** Existing tracked wallets will remain on their original chains.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Back', callback_data: 'ct_settings' }]
            ]
          }
        }
      );
      await ctx.answerCbQuery();
    });

    botCore.registerCallbackHandler('ct_set_amount', async (ctx) => {
      await ctx.editMessageText(
        `💰 **Set Default Trade Amount**\n\n` +
        `Use the command: \`/amount <value>\`\n\n` +
        `**Examples:**\n` +
        `• \`/amount 0.1\` - Trade 0.1 tokens\n` +
        `• \`/amount 0.5\` - Trade 0.5 tokens\n` +
        `• \`/amount 1.0\` - Trade 1.0 tokens\n\n` +
        `**Recommendations by Chain:**\n` +
        `• **Solana:** 0.1 - 1.0 SOL\n` +
        `• **Ethereum:** 0.01 - 0.1 ETH\n` +
        `• **BSC:** 0.1 - 1.0 BNB\n` +
        `• **Polygon:** 10 - 100 MATIC\n\n` +
        `This amount will be used for all copy trades unless you specify different ratios per wallet using \`/setratio\`.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⬅️ Back', callback_data: 'ct_settings' }]
            ]
          }
        }
      );
      await ctx.answerCbQuery();
    });

    // Risk Settings handler
    botCore.registerCallbackHandler('ct_risk_settings', async (ctx) => {
      const userSettings = await userService.getUserSettings(ctx.from.id);
      
      await ctx.editMessageText(
        `📊 **Risk Management Settings**\n\n` +
        `**Current Settings:**\n` +
        `• Max per trade: $100\n` +
        `• Daily limit: $1000\n` +
        `• Stop loss: ${userSettings?.stopLoss || 'Disabled'}\n` +
        `• Take profit: ${userSettings?.takeProfit || 'Disabled'}\n\n` +
        `**Available Commands:**\n` +
        `• \`/setmaxpertrade <amount>\` - Set max USD per trade\n` +
        `• \`/setdailylimit <amount>\` - Set daily trading limit\n` +
        `• \`/stoploss <percent>\` - Set stop loss percentage\n` +
        `• \`/takeprofit <percent>\` - Set take profit percentage\n\n` +
        `**Risk Levels:**\n` +
        `• **Conservative:** Small amounts, low frequency\n` +
        `• **Moderate:** Medium amounts, selective copying\n` +
        `• **Aggressive:** Higher amounts, copy everything\n\n` +
        `**Safety Features:**\n` +
        `• Duplicate trade prevention\n` +
        `• Balance checks before each trade\n` +
        `• Failed trade notifications\n` +
        `• Emergency pause functionality`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🛡️ Conservative', callback_data: 'ct_risk_conservative' },
                { text: '⚖️ Moderate', callback_data: 'ct_risk_moderate' }
              ],
              [
                { text: '🚀 Aggressive', callback_data: 'ct_risk_aggressive' },
                { text: '🎛️ Custom', callback_data: 'ct_risk_custom' }
              ],
              [
                { text: '⬅️ Back', callback_data: 'ct_settings' }
              ]
            ]
          }
        }
      );
      await ctx.answerCbQuery();
    });

    // Research Guide handler
    botCore.registerCallbackHandler('ct_research_guide', async (ctx) => {
      await ctx.editMessageText(
        `📖 **Wallet Research Guide**\n\n` +
        `**🔍 Finding Profitable Wallets:**\n\n` +
        `**1. DEXScreener Method:**\n` +
        `• Go to trending tokens section\n` +
        `• Look for tokens with 100%+ gains\n` +
        `• Click on large buy transactions\n` +
        `• Copy the buyer's wallet address\n\n` +
        `**2. What to Look For:**\n` +
        `• Consistent profits over time\n` +
        `• Reasonable trade sizes\n` +
        `• Good success rate (>60%)\n` +
        `• Recent activity (not dormant)\n` +
        `• Diversified trading (not just one token)\n\n` +
        `**3. Red Flags to Avoid:**\n` +
        `• Only a few lucky trades\n` +
        `• Huge losses mixed with small wins\n` +
        `• Suspicious pump & dump patterns\n` +
        `• No recent trading activity\n` +
        `• Only trading their own tokens\n\n` +
        `**4. Due Diligence Steps:**\n` +
        `• Check at least 20+ recent trades\n` +
        `• Calculate actual win rate\n` +
        `• Look at holding periods\n` +
        `• Verify they're not insider trading\n` +
        `• Start with small amounts to test`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔍 Open DEXScreener', url: 'https://dexscreener.com/solana' },
                { text: '📊 Open DexTools', url: 'https://www.dextools.io/app/en/solana/pairs' }
              ],
              [
                { text: '➕ Add Wallet Now', callback_data: 'ct_add_wallet' },
                { text: '❓ More Help', callback_data: 'ct_help' }
              ],
              [
                { text: '⬅️ Back', callback_data: 'copytrade' }
              ]
            ]
        }
        }
      );
      await ctx.answerCbQuery();
    });

    // Trading Tips handler
    botCore.registerCallbackHandler('ct_trading_tips', async (ctx) => {
      await ctx.editMessageText(
        `💡 **Copy Trading Pro Tips**\n\n` +
        `**🎯 Getting Started:**\n` +
        `• Start with 0.01-0.1 SOL per trade\n` +
        `• Track 3-5 wallets initially\n` +
        `• Enable copy sells for better risk management\n` +
        `• Set reasonable slippage (3-5%)\n\n` +
        `**📊 Portfolio Management:**\n` +
        `• Diversify across different wallet styles\n` +
        `• Don't put all funds in copy trading\n` +
        `• Keep some SOL for manual trades\n` +
        `• Review performance weekly\n\n` +
        `**⚠️ Risk Management:**\n` +
        `• Never invest more than you can afford to lose\n` +
        `• Use stop losses and take profits\n` +
        `• Pause copying during high volatility\n` +
        `• Don't chase FOMO trades\n\n` +
        `**🔄 Optimization:**\n` +
        `• Remove underperforming wallets\n` +
        `• Adjust copy ratios based on performance\n` +
        `• Monitor gas fees and slippage\n` +
        `• Keep some profits as SOL for fees\n\n` +
        `**🤝 Community:**\n` +
        `• Share successful wallet finds\n` +
        `• Learn from other users' strategies\n` +
        `• Stay updated on market trends\n` +
        `• Join our trading discussions`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📊 Performance Tips', callback_data: 'ct_performance_tips' },
                { text: '🛡️ Safety Guide', callback_data: 'ct_safety_guide' }
              ],
              [
                { text: '🚀 Advanced Strategies', callback_data: 'ct_advanced_strategies' },
                { text: '❓ FAQ', callback_data: 'ct_help' }
              ],
              [
                { text: '⬅️ Back', callback_data: 'ct_help' }
              ]
            ]
          }
        }
      );
      await ctx.answerCbQuery();
    });

    console.log('✅ CopyTradeHandlers registered successfully');
  }
}

module.exports = CopyTradeHandlers;