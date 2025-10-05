 

const User = require('../../src/models/User');

class TPSLCommand {
  constructor(botCore) {
    this.botCore = botCore;
  }

  register() {
    this.botCore.registerCallbackHandler('tpsl', async (ctx) => await this.showMainMenu(ctx));

    // Callback handlers
    this.botCore.registerCallbackHandler('tpsl_enable', async (ctx) => await this.enableTPSL(ctx));
    this.botCore.registerCallbackHandler('tpsl_disable', async (ctx) => await this.disableTPSL(ctx));
    this.botCore.registerCallbackHandler('tpsl_add_tp', async (ctx) => await this.promptAddTP(ctx));
    this.botCore.registerCallbackHandler('tpsl_add_sl', async (ctx) => await this.promptAddSL(ctx));
    this.botCore.registerCallbackHandler('tpsl_add_trailing', async (ctx) => await this.promptAddTrailing(ctx));
    this.botCore.registerCallbackHandler('tpsl_view', async (ctx) => await this.viewSettings(ctx));
    this.botCore.registerCallbackHandler('tpsl_clear', async (ctx) => await this.clearAll(ctx));
    
    // Register the TPSL text handler category
    this.botCore.registerTextHandlerCategory('tpsl', this.handleTPSLTextInput.bind(this));
  }

  // Main TPSL text handler - routes to appropriate sub-handlers
  async handleTPSLTextInput(ctx) {
    const inputType = ctx.session.tpslInputType;
    
    switch (inputType) {
      case 'awaiting_tp_input':
        return await this.handleTPInput(ctx);
      case 'awaiting_sl_input':
        return await this.handleSLInput(ctx);
      case 'awaiting_trailing_input':
        return await this.handleTrailingInput(ctx);
      default:
        console.warn('Unknown TPSL input type:', inputType);
        ctx.session.activeTextHandler = null;
        ctx.session.tpslInputType = null;
        return await ctx.reply('❌ Unknown input type. Please try again.');
    }
  }

  async showMainMenu(ctx) {
    const user = await User.findOne({ tgId: String(ctx.from.id) });
    const customTPSL = user?.customTPSL || {};
    const tpslEnabled = customTPSL.enabled || false;
    const tpCount = customTPSL.takeProfits?.length || 0;
    const hasStopLoss = customTPSL.stopLoss ? '✅' : '❌';

    const message = `🎯 **Take Profit / Stop Loss Settings**

**Status:** ${tpslEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}
**Take Profits:** ${tpCount} levels set
**Stop Loss:** ${hasStopLoss}

Choose an option below:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: tpslEnabled ? '🔴 Disable' : '🟢 Enable', callback_data: tpslEnabled ? 'tpsl_disable' : 'tpsl_enable' }
        ],
        [
          { text: '📈 Add Take Profit', callback_data: 'tpsl_add_tp' },
          { text: '📉 Add Stop Loss', callback_data: 'tpsl_add_sl' }
        ],
        [
          { text: '🔄 Add Trailing SL', callback_data: 'tpsl_add_trailing' },
          { text: '👁️ View Settings', callback_data: 'tpsl_view' }
        ],
        [
          { text: '🗑️ Clear All', callback_data: 'tpsl_clear' }
        ]
      ]
    };

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  async enableTPSL(ctx) {
    const user = await User.findOne({ tgId: String(ctx.from.id) });
    if (!user) return ctx.reply('❌ User not found');

    if (!user.customTPSL) user.customTPSL = {};
    user.customTPSL.enabled = true;
    await user.save();

    await ctx.editMessageText('✅ **Custom TP/SL Enabled**\n\nYour positions will now be monitored for take profit and stop loss triggers.');
    setTimeout(() => this.showMainMenu(ctx), 1000);
  }

  async disableTPSL(ctx) {
    const user = await User.findOne({ tgId: String(ctx.from.id) });
    if (!user) return ctx.reply('❌ User not found');

    if (!user.customTPSL) user.customTPSL = {};
    user.customTPSL.enabled = false;
    await user.save();

    await ctx.editMessageText('🔴 **Custom TP/SL Disabled**\n\nAutomatic TP/SL monitoring has been turned off.');
    setTimeout(() => this.showMainMenu(ctx), 1000);
  }

  async promptAddTP(ctx) {
    ctx.session = ctx.session || {};
    ctx.session.activeTextHandler = 'tpsl';
    ctx.session.tpslInputType = 'awaiting_tp_input';

    await ctx.editMessageText(`📈 **Add Take Profit Level**

Send me the take profit details in this format:
\`<profit_percent> <sell_percent>\`

**Examples:**
• \`50 25\` - At 50% profit, sell 25% of position
• \`100 50\` - At 100% profit, sell 50% of position
• \`200 100\` - At 200% profit, sell remaining 100%

Send your take profit level now:`, { parse_mode: 'Markdown' });
  }

  async promptAddSL(ctx) {
    ctx.session = ctx.session || {};
    ctx.session.activeTextHandler = 'tpsl';
    ctx.session.tpslInputType = 'awaiting_sl_input';

    await ctx.editMessageText(`📉 **Add Stop Loss**

Send me the stop loss percentage (negative number):

**Examples:**
• \`-10\` - Stop loss at -10%
• \`-20\` - Stop loss at -20%
• \`-5\` - Stop loss at -5%

Send your stop loss level now:`, { parse_mode: 'Markdown' });
  }

  async promptAddTrailing(ctx) {
    ctx.session = ctx.session || {};
    ctx.session.activeTextHandler = 'tpsl';
    ctx.session.tpslInputType = 'awaiting_trailing_input';

    await ctx.editMessageText(`🔄 **Add Trailing Stop Loss**

Send me the trailing stop percentage (negative number):

**Examples:**
• \`-15\` - Trailing stop at -15% from highest point
• \`-10\` - Trailing stop at -10% from highest point

Send your trailing stop level now:`, { parse_mode: 'Markdown' });
  }

  async handleTPInput(ctx) {
    console.log('Handling TP input');
    const input = ctx.message.text.trim();
    const parts = input.split(' ');

    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      return ctx.reply('❌ Invalid format. Use: `profit_percent sell_percent`\nExample: `50 25`', { parse_mode: 'Markdown' });
    }

    const profitPercent = parseFloat(parts[0]);
    const sellPercent = parseFloat(parts[1]);

    if (profitPercent <= 0 || sellPercent <= 0 || sellPercent > 100) {
      return ctx.reply('❌ Invalid values. Profit percent must be positive, sell percent must be 1-100.');
    }

    console.log('Adding TP level:', profitPercent, sellPercent);
    const user = await User.findOne({ tgId: String(ctx.from.id) });
    if (!user) return ctx.reply('❌ User not found');

    if (!user.customTPSL) user.customTPSL = {};
    if (!user.customTPSL.takeProfits) user.customTPSL.takeProfits = [];

    user.customTPSL.takeProfits.push({
      percent: profitPercent,
      sellPercent: sellPercent,
      triggered: false
    });

    // Sort by profit percent
    user.customTPSL.takeProfits.sort((a, b) => a.percent - b.percent);
    await user.save();

    // Clear session flags
    ctx.session.activeTextHandler = null;
    ctx.session.tpslInputType = null;

    await ctx.reply(`✅ **Take Profit Added**\n\nAt **${profitPercent}%** profit → Sell **${sellPercent}%** of position`);
    setTimeout(() => this.showMainMenu(ctx), 1000);
  }

  async handleSLInput(ctx) {
    const input = ctx.message.text.trim();
    const lossPercent = parseFloat(input);

    if (isNaN(lossPercent) || lossPercent >= 0) {
      return ctx.reply('❌ Invalid stop loss. Must be a negative number (e.g., -10, -20)');
    }

    const user = await User.findOne({ tgId: String(ctx.from.id) });
    if (!user) return ctx.reply('❌ User not found');

    if (!user.customTPSL) user.customTPSL = {};
    user.customTPSL.stopLoss = {
      percent: lossPercent,
      trailing: false,
      triggered: false
    };

    await user.save();

    // Clear session flags
    ctx.session.activeTextHandler = null;
    ctx.session.tpslInputType = null;

    await ctx.reply(`✅ **Stop Loss Set**\n\nStop loss at **${lossPercent}%**`);
    setTimeout(() => this.showMainMenu(ctx), 1000);
  }

  async handleTrailingInput(ctx) {
    const input = ctx.message.text.trim();
    const trailingPercent = parseFloat(input);

    if (isNaN(trailingPercent) || trailingPercent >= 0) {
      return ctx.reply('❌ Invalid trailing stop. Must be a negative number (e.g., -10, -15)');
    }

    const user = await User.findOne({ tgId: String(ctx.from.id) });
    if (!user) return ctx.reply('❌ User not found');

    if (!user.customTPSL) user.customTPSL = {};
    user.customTPSL.stopLoss = {
      percent: trailingPercent,
      trailing: true,
      triggered: false,
      highWaterMark: 0
    };

    await user.save();

    // Clear session flags
    ctx.session.activeTextHandler = null;
    ctx.session.tpslInputType = null;

    await ctx.reply(`✅ **Trailing Stop Loss Set**\n\nTrailing stop at **${trailingPercent}%** from highest point`);
    setTimeout(() => this.showMainMenu(ctx), 1000);
  }

  async viewSettings(ctx) {
    const user = await User.findOne({ tgId: String(ctx.from.id) });
    const customTPSL = user?.customTPSL || {};

    let message = `👁️ **Current TP/SL Settings**\n\n`;
    message += `**Status:** ${customTPSL.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}\n\n`;

    // Take Profits
    if (customTPSL.takeProfits && customTPSL.takeProfits.length > 0) {
      message += `📈 **Take Profits:**\n`;
      customTPSL.takeProfits.forEach((tp, index) => {
        const status = tp.triggered ? '✅' : '⏳';
        message += `${index + 1}. ${tp.percent}% → Sell ${tp.sellPercent}% ${status}\n`;
      });
    } else {
      message += `📈 **Take Profits:** None set\n`;
    }

    // Stop Loss
    if (customTPSL.stopLoss) {
      const sl = customTPSL.stopLoss;
      const type = sl.trailing ? 'Trailing' : 'Fixed';
      const status = sl.triggered ? '✅ Triggered' : '⏳ Active';
      message += `\n📉 **Stop Loss:** ${type} ${sl.percent}% ${status}\n`;
      if (sl.trailing && sl.highWaterMark) {
        message += `🔄 **High Water Mark:** ${sl.highWaterMark}\n`;
      }
    } else {
      message += `\n📉 **Stop Loss:** None set\n`;
    }

    await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    setTimeout(() => this.showMainMenu(ctx), 2000);
  }

  async clearAll(ctx) {
    const user = await User.findOne({ tgId: String(ctx.from.id) });
    if (!user) return ctx.reply('❌ User not found');

    if (!user.customTPSL) user.customTPSL = {};
    user.customTPSL.takeProfits = [];
    user.customTPSL.stopLoss = null;

    await user.save();
    await ctx.editMessageText('🗑️ **All TP/SL levels cleared**');
    setTimeout(() => this.showMainMenu(ctx), 1000);
  }
}

module.exports = TPSLCommand;