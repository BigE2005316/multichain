const userService = require('../users/userService');
const tokenDataService = require('../services/tokenDataService');
const SellCommand = require('../commands/SellCommand');

class SellCommandHandler {
  constructor(botCore) {
    this.botCore = botCore;
    this.sellCommand = new SellCommand(botCore);
  }

  register() {
    // Main sell button handler - shows sell options
    this.botCore.registerCallbackHandler('sell', async (ctx) => {
      await this.showSellOptions(ctx);
    });

    // Sell option handlers
    this.botCore.registerCallbackHandler('sell_all', async (ctx) => {
      await this.handleSellAll(ctx);
    });

    this.botCore.registerCallbackHandler('sell_percentage', async (ctx) => {
      await this.handleSellPercentage(ctx);
    });

    this.botCore.registerCallbackHandler('sell_amount', async (ctx) => {
      await this.handleSellAmount(ctx);
    });

    // Chain selection handlers for sell (now shows positions)
    this.botCore.registerCallbackHandler('sell_sol', async (ctx) => {
      ctx.session = ctx.session || {};
      ctx.session.sellChain = 'solana';
      await this.showChainPositions(ctx);
    });

    this.botCore.registerCallbackHandler('sell_eth', async (ctx) => {
      ctx.session = ctx.session || {};
      ctx.session.sellChain = 'ethereum';
      await this.showChainPositions(ctx);
    });

    this.botCore.registerCallbackHandler('sell_base', async (ctx) => {
      ctx.session = ctx.session || {};
      ctx.session.sellChain = 'base';
      await this.showChainPositions(ctx);
    });

    this.botCore.registerCallbackHandler('sell_bsc', async (ctx) => {
      ctx.session = ctx.session || {};
      ctx.session.sellChain = 'bsc';
      await this.showChainPositions(ctx);
    });

    // Position selection handlers (for clickable position buttons)
    this.botCore.registerCallbackHandler(/^select_position_(\d+)$/, async (ctx) => {
      await this.handlePositionSelection(ctx);
    });

    // Finalize sell handler
    this.botCore.registerCallbackHandler('finalize_sell', async (ctx) => {
      await this.handleFinalizeSell(ctx);
    });

    // Cancel sell handler
    this.botCore.registerCallbackHandler('cancel_sell', async (ctx) => {
      await this.handleCancelSell(ctx);
    });

    // Text handlers for sell input flows (still available via manual input)
    this.botCore.registerTextHandler('awaiting_sell_token', async (ctx) => {
      await this.handleTokenOrKeywordInput(ctx);
    });

    this.botCore.registerTextHandler('awaiting_sell_percentage', async (ctx) => {
      await this.handlePercentageInput(ctx);
    });

    this.botCore.registerTextHandler('awaiting_sell_amount', async (ctx) => {
      await this.handleAmountInput(ctx);
    });
  }

  // Show sell options menu
  async showSellOptions(ctx) {
    ctx.session = ctx.session || {};
    // Clear previous sell session data
    this.clearSellSession(ctx);

    await ctx.editMessageText(`💸 **Sell Options**\n\nChoose how you want to sell:`, 
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔴 Sell All Positions', callback_data: 'sell_all' }],
            [{ text: '📊 Sell by Percentage', callback_data: 'sell_percentage' }],
            [{ text: '💰 Sell by Amount', callback_data: 'sell_amount' }],
            [{ text: '⬅️ Back to Main', callback_data: 'back_to_main' }]
          ]
        }
      });
  }

  // Handle sell all positions
  async handleSellAll(ctx) {
    try {
      const userId = ctx.from.id;
      const positions = await userService.getUserPositions(userId);

      if (!positions || positions.length === 0) {
        return ctx.editMessageText('📭 No positions found. Use /buy to start trading!');
      }

      // Set up sell all parameters
      ctx.session = ctx.session || {};
      ctx.session.sellType = 'all';
      ctx.session.selectedPositions = positions;

      const userSettings = await userService.getUserSettings(userId);
      const confirmationMessage = await this.createSellConfirmationMessage({
        type: 'all',
        selectedPositions: positions
      }, userSettings.chain);

      await ctx.editMessageText(
        confirmationMessage + '\n\nClick "Finalize Sell" to execute or cancel.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔴 Finalize Sell', callback_data: 'finalize_sell' }],
              [{ text: '❌ Cancel', callback_data: 'cancel_sell' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Sell all error:', error);
      await ctx.editMessageText('❌ Error processing sell all. Please try again.');
    }
  }

  // Handle sell by percentage
  async handleSellPercentage(ctx) {
    await this.showChainSelection(ctx, 'percentage');
  }

  // Handle sell by amount
  async handleSellAmount(ctx) {
    await this.showChainSelection(ctx, 'amount');
  }

  // Show chain selection
  async showChainSelection(ctx, sellType) {
    ctx.session = ctx.session || {};
    ctx.session.sellType = sellType;
    
    await ctx.editMessageText(`🔗 Select the chain you want to sell on:`, 
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'SOL', callback_data: 'sell_sol' }, { text: 'ETH', callback_data: 'sell_eth' }],
            [{ text: 'BASE', callback_data: 'sell_base' }, { text: 'BSC', callback_data: 'sell_bsc' }],
            [{ text: '⬅️ Back to Sell Options', callback_data: 'sell' }]
          ]
        }
      });
  }

  // Show positions for selected chain as clickable buttons
  async showChainPositions(ctx) {
    try {
      const userId = ctx.from.id;
      const positions = await userService.getUserPositions(userId);

      if (!positions || positions.length === 0) {
        return ctx.editMessageText('📭 No positions found. Use /buy to start trading!');
      }

      // Filter positions by selected chain
      const chainPositions = positions.filter(p => 
        p.chain && p.chain.toLowerCase() === ctx.session.sellChain.toLowerCase()
      );

      if (chainPositions.length === 0) {
        return ctx.editMessageText(
          `📭 No positions found on ${ctx.session.sellChain.toUpperCase()}.\n\n` +
          `You can also input token address or search keyword manually:`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✍️ Manual Input', callback_data: `manual_input_${ctx.session.sellChain}` }],
                [{ text: '⬅️ Back to Chains', callback_data: 'sell_percentage' }]
              ]
            }
          }
        );
      }

      // Show positions as clickable buttons
      await this.displayPositionsAsButtons(ctx, chainPositions);
    } catch (error) {
      console.error('Show chain positions error:', error);
      await ctx.editMessageText('❌ Error loading positions. Please try again.');
    }
  }

  // Display positions as clickable buttons
  async displayPositionsAsButtons(ctx, positions) {
    try {
      const chainName = ctx.session.sellChain.charAt(0).toUpperCase() + ctx.session.sellChain.slice(1);
      
      let message = `💰 **Your ${chainName} Positions (${positions.length})**\n\n`;
      message += `Select a token to sell:\n\n`;

      // Calculate total portfolio value
      let totalValue = 0;
      const positionDetails = [];

      for (let i = 0; i < positions.length && i < 15; i++) { // Limit to 15 for button constraints
        const position = positions[i];
        try {
          const tokenInfo = await tokenDataService.getTokenInfo(position.tokenAddress, ctx.session.sellChain);
          const balance = position.amount || position.totalAmount || 0;
          const currentPrice = tokenInfo?.price || 0;
          const value = balance * currentPrice;
          
          totalValue += value;
          positionDetails.push({
            position,
            balance,
            currentPrice,
            value,
            tokenInfo
          });

          // Add to message
          const displaySymbol = position.tokenSymbol || tokenInfo?.symbol || 'UNKNOWN';
          const displayName = position.tokenName || tokenInfo?.name || 'Unknown Token';
          
          message += `**${i + 1}. ${displaySymbol}** (${displayName})\n`;
          message += `   💰 Balance: ${balance.toFixed(4)}\n`;
          message += `   💵 Value: ~$${value.toFixed(2)}\n`;
          message += `   💲 Price: $${currentPrice.toFixed(6)}\n\n`;
        } catch (error) {
          console.error(`Error processing position ${i}:`, error);
          // Still add the position but with limited info
          positionDetails.push({
            position,
            balance: position.amount || position.totalAmount || 0,
            currentPrice: 0,
            value: 0,
            tokenInfo: null
          });

          message += `**${i + 1}. ${position.tokenSymbol || 'UNKNOWN'}**\n`;
          message += `   💰 Balance: ${position.amount || position.totalAmount || 0}\n`;
          message += `   💵 Value: Unable to fetch\n\n`;
        }
      }

      message += `🏦 **Total Portfolio Value:** ~$${totalValue.toFixed(2)}\n\n`;
      message += `Choose a position to sell:`;

      // Store positions in session for selection
      ctx.session.chainPositions = positionDetails;

      // Create buttons for each position (max 3 per row)
      const buttons = [];
      for (let i = 0; i < positionDetails.length; i++) {
        const detail = positionDetails[i];
        const displaySymbol = detail.position.tokenSymbol || detail.tokenInfo?.symbol || 'UNKNOWN';
        const buttonText = `${displaySymbol} ($${detail.value.toFixed(1)})`;
        
        buttons.push({
          text: buttonText,
          callback_data: `select_position_${i}`
        });
      }

      // Arrange buttons in rows of 2-3
      const keyboard = [];
      for (let i = 0; i < buttons.length; i += 2) {
        const row = buttons.slice(i, i + 2);
        keyboard.push(row);
      }

      // Add navigation buttons
      keyboard.push([
        { text: '✍️ Manual Input', callback_data: `manual_input_${ctx.session.sellChain}` }
      ]);
      keyboard.push([
        { text: '⬅️ Back to Chains', callback_data: ctx.session.sellType === 'percentage' ? 'sell_percentage' : 'sell_amount' }
      ]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      console.error('Display positions error:', error);
      await ctx.editMessageText('❌ Error displaying positions. Please try again.');
    }
  }

  // Handle manual input fallback
  async handleManualInput(ctx) {
    const chainName = ctx.session.sellChain.charAt(0).toUpperCase() + ctx.session.sellChain.slice(1);
    
    ctx.session.awaitingInput = 'awaiting_sell_token';
    
    await ctx.editMessageText(
      `🔍 **Manual Token Input - ${chainName}**\n\n` +
      `Please input either:\n\n` +
      `• **Token Address** - Full contract address\n` +
      `• **Search Keyword** - Token name or symbol\n\n` +
      `**Examples:**\n` +
      `• \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\` (USDC address)\n` +
      `• \`BONK\` (search for BONK tokens)\n` +
      `• \`Pepe\` (search for Pepe tokens)`,
      { parse_mode: 'Markdown' }
    );
  }

  // Register manual input handler
  registerManualInputHandlers() {
    this.botCore.registerCallbackHandler(/^manual_input_(.+)$/, async (ctx) => {
      await this.handleManualInput(ctx);
    });
  }

  // Handle position selection from buttons
  async handlePositionSelection(ctx) {
    try {
      const match = ctx.callbackQuery.data.match(/^select_position_(\d+)$/);
      if (!match) return;

      const selectedIndex = parseInt(match[1]);
      const chainPositions = ctx.session.chainPositions;

      if (!chainPositions || selectedIndex >= chainPositions.length) {
        return ctx.answerCbQuery('❌ Invalid selection. Please try again.');
      }

      const selectedDetail = chainPositions[selectedIndex];
      const position = selectedDetail.position;
      const tokenInfo = selectedDetail.tokenInfo;

      await ctx.answerCbQuery();
      await this.proceedWithSelectedToken(ctx, position, tokenInfo);
    } catch (error) {
      console.error('Position selection error:', error);
      await ctx.answerCbQuery('❌ Error selecting position.');
    }
  }

  // Handle token address or keyword input (for manual input)
  async handleTokenOrKeywordInput(ctx) {
    try {
      const input = ctx.message.text.trim();
      const positions = await userService.getUserPositions(ctx.from.id);

      if (!positions || positions.length === 0) {
        return ctx.reply('📭 No positions found. Use /buy to start trading!');
      }

      // Filter positions by selected chain
      const chainPositions = positions.filter(p => 
        p.chain && p.chain.toLowerCase() === ctx.session.sellChain.toLowerCase()
      );

      if (chainPositions.length === 0) {
        return ctx.reply(`📭 No positions found on ${ctx.session.sellChain.toUpperCase()}.`);
      }

      // Check if input looks like a token address (longer than 20 chars and alphanumeric)
      const isTokenAddress = input.length > 20 && /^[A-Za-z0-9]+$/.test(input);

      if (isTokenAddress) {
        // Direct token address input
        await this.handleDirectTokenAddress(ctx, input, chainPositions);
      } else {
        // Search keyword input
        await this.handleSearchKeyword(ctx, input, chainPositions);
      }
    } catch (error) {
      console.error('Token input error:', error);
      await ctx.reply('❌ Error processing input. Please try again.');
    }
  }

  // Handle direct token address input
  async handleDirectTokenAddress(ctx, tokenAddress, positions) {
    try {
      // Find exact match by token address
      const position = positions.find(p => 
        p.tokenAddress && p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
      );

      if (!position) {
        return ctx.reply('❌ You don\'t have any position in this token on the selected chain.');
      }

      // Get token info
      const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, ctx.session.sellChain);
      
      if (!tokenInfo) {
        return ctx.reply('❌ Could not find token information. Please check the address and try again.');
      }

      // Show single token confirmation button
      await this.showSingleTokenConfirmation(ctx, position, tokenInfo, 'direct');
    } catch (error) {
      console.error('Direct token address error:', error);
      await ctx.reply('❌ Error processing token address. Please try again.');
    }
  }

  // Handle search keyword input
  async handleSearchKeyword(ctx, keyword, positions) {
    try {
      const searchTerm = keyword.toLowerCase();

      // Search for matching tokens in user's positions
      const matchingPositions = positions.filter(p => {
        const tokenName = (p.tokenName || '').toLowerCase();
        const tokenSymbol = (p.tokenSymbol || '').toLowerCase();
        
        return tokenName.includes(searchTerm) || 
               tokenSymbol.includes(searchTerm) ||
               tokenSymbol === searchTerm;
      });

      if (matchingPositions.length === 0) {
        return ctx.reply(`❌ No tokens found matching "${keyword}" in your positions on ${ctx.session.sellChain.toUpperCase()}.`);
      }

      if (matchingPositions.length === 1) {
        // Single match - show confirmation button
        const position = matchingPositions[0];
        const tokenInfo = await tokenDataService.getTokenInfo(position.tokenAddress, ctx.session.sellChain);
        await this.showSingleTokenConfirmation(ctx, position, tokenInfo, 'search', keyword);
      } else {
        // Multiple matches, show selection buttons
        await this.showTokenSelectionMenu(ctx, matchingPositions, keyword);
      }
    } catch (error) {
      console.error('Search keyword error:', error);
      await ctx.reply('❌ Error searching for tokens. Please try again.');
    }
  }

  // Show single token confirmation
  async showSingleTokenConfirmation(ctx, position, tokenInfo, inputType, searchKeyword = '') {
    try {
      const balance = position.amount || position.totalAmount || 0;
      const value = balance * (tokenInfo?.price || 0);
      
      let message = `🎯 **Token Found**\n\n`;
      
      if (inputType === 'search') {
        message += `🔍 **Search:** "${searchKeyword}"\n`;
      }
      
      message += `📊 **${position.tokenSymbol}** (${position.tokenName || tokenInfo?.name || 'Unknown'})\n`;
      message += `💰 **Balance:** ${balance.toFixed(4)} tokens\n`;
      message += `💵 **Value:** ~$${value.toFixed(2)}\n`;
      message += `💲 **Price:** $${tokenInfo?.price?.toFixed(6) || 'N/A'}\n`;
      message += `⛓️ **Chain:** ${ctx.session.sellChain.toUpperCase()}\n\n`;
      message += `Select this token to proceed with the sale:`;

      // Store matching position for selection
      ctx.session.matchingPositions = [position];

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{
              text: `✅ Select ${position.tokenSymbol}`,
              callback_data: `select_token_0`
            }],
            [{ 
              text: '🔍 Search Again', 
              callback_data: `sell_${ctx.session.sellChain}` 
            }],
            [{ 
              text: '⬅️ Back to Sell Options', 
              callback_data: 'sell' 
            }]
          ]
        }
      });
    } catch (error) {
      console.error('Single token confirmation error:', error);
      await ctx.reply('❌ Error displaying token confirmation. Please try again.');
    }
  }

  // Show token selection menu for multiple matches
  async showTokenSelectionMenu(ctx, matchingPositions, keyword) {
    try {
      let message = `🔍 **Found ${matchingPositions.length} tokens matching "${keyword}":**\n\n`;

      const buttons = [];
      for (let i = 0; i < Math.min(matchingPositions.length, 10); i++) { // Limit to 10 results
        const position = matchingPositions[i];
        const tokenInfo = await tokenDataService.getTokenInfo(position.tokenAddress, ctx.session.sellChain);
        
        const balance = position.amount || position.totalAmount || 0;
        const value = balance * (tokenInfo?.price || 0);
        
        message += `${i + 1}. **${position.tokenSymbol}** (${position.tokenName || 'Unknown'})\n`;
        message += `   Balance: ${balance.toFixed(4)} (~$${value.toFixed(2)})\n\n`;

        // Create callback data with position index
        buttons.push([{
          text: `${i + 1}. ${position.tokenSymbol} - ${balance.toFixed(4)} tokens`,
          callback_data: `select_token_${i}`
        }]);
      }

      // Store matching positions in session for selection
      ctx.session.matchingPositions = matchingPositions.slice(0, 10);

      buttons.push([{ 
        text: '🔍 Search Again', 
        callback_data: `sell_${ctx.session.sellChain}` 
      }]);
      buttons.push([{ 
        text: '⬅️ Back to Sell Options', 
        callback_data: 'sell' 
      }]);

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buttons
        }
      });
    } catch (error) {
      console.error('Token selection menu error:', error);
      await ctx.reply('❌ Error displaying token selection. Please try again.');
    }
  }

  // Handle token selection from search results
  async handleTokenSelection(ctx) {
    try {
      const match = ctx.callbackQuery.data.match(/^select_token_(\d+)$/);
      if (!match) return;

      const selectedIndex = parseInt(match[1]);
      const matchingPositions = ctx.session.matchingPositions;

      if (!matchingPositions || selectedIndex >= matchingPositions.length) {
        return ctx.answerCbQuery('❌ Invalid selection. Please try again.');
      }

      const selectedPosition = matchingPositions[selectedIndex];
      const tokenInfo = await tokenDataService.getTokenInfo(selectedPosition.tokenAddress, ctx.session.sellChain);

      await ctx.answerCbQuery();
      await this.proceedWithSelectedToken(ctx, selectedPosition, tokenInfo);
    } catch (error) {
      console.error('Token selection error:', error);
      await ctx.answerCbQuery('❌ Error selecting token.');
    }
  }

  // Proceed with selected token (common logic for both button and manual selection)
  async proceedWithSelectedToken(ctx, position, tokenInfo) {
    try {
      ctx.session.sellTokenAddress = position.tokenAddress;
      ctx.session.selectedPosition = position;

      const balance = position.amount || position.totalAmount || 0;
      const currentPrice = tokenInfo?.price || 0;
      const currentValue = balance * currentPrice;

      // Ask for percentage or amount based on sell type
      if (ctx.session.sellType === 'percentage') {
        ctx.session.awaitingInput = 'awaiting_sell_percentage';
        await ctx.reply(
          `🔥 **Sell ${tokenInfo?.name || position.tokenName || 'Unknown Token'}** (${position.tokenSymbol || 'UNKNOWN'})\n\n` +
          `📊 **Position Details:**\n` +
          `💰 Balance: ${balance.toFixed(4)} tokens\n` +
          `💵 Current Value: ~$${currentValue.toFixed(2)}\n` +
          `💲 Current Price: $${currentPrice.toFixed(6)}\n` +
          `⛓️ Chain: ${ctx.session.sellChain.toUpperCase()}\n\n` +
          `Please input the *percentage* you want to sell (1-100):`,
          { parse_mode: 'Markdown' }
        );
      } else if (ctx.session.sellType === 'amount') {
        ctx.session.awaitingInput = 'awaiting_sell_amount';
        await ctx.reply(
          `🔥 **Sell ${tokenInfo?.name || position.tokenName || 'Unknown Token'}** (${position.tokenSymbol || 'UNKNOWN'})\n\n` +
          `📊 **Position Details:**\n` +
          `💰 Balance: ${balance.toFixed(4)} tokens\n` +
          `💵 Current Value: ~$${currentValue.toFixed(2)}\n` +
          `💲 Current Price: $${currentPrice.toFixed(6)}\n` +
          `⛓️ Chain: ${ctx.session.sellChain.toUpperCase()}\n\n` +
          `Please input the *amount* you want to sell (max: ${balance.toFixed(4)}):`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      console.error('Proceed with token error:', error);
      await ctx.reply('❌ Error proceeding with selected token. Please try again.');
    }
  }

  // Handle percentage input
  async handlePercentageInput(ctx) {
    try {
      const percentage = parseFloat(ctx.message.text.trim());
      
      if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        return ctx.reply('❌ Invalid percentage. Please enter a number between 1 and 100.');
      }

      ctx.session.sellPercentage = percentage;
      await this.showSellConfirmation(ctx);
    } catch (error) {
      console.error('Percentage input error:', error);
      await ctx.reply('❌ Error processing percentage. Please try again.');
    }
  }

  // Handle amount input
  async handleAmountInput(ctx) {
    try {
      const amount = parseFloat(ctx.message.text.trim());
      
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ Invalid amount. Please enter a positive number.');
      }

      // Check if user has enough balance
      const position = ctx.session.selectedPosition;
      const availableAmount = position.amount || position.totalAmount;

      if (amount > availableAmount) {
        return ctx.reply(`❌ Insufficient balance. You have ${availableAmount} tokens available.`);
      }

      ctx.session.sellAmount = amount;
      await this.showSellConfirmation(ctx);
    } catch (error) {
      console.error('Amount input error:', error);
      await ctx.reply('❌ Error processing amount. Please try again.');
    }
  }

  // Show sell confirmation
  async showSellConfirmation(ctx) {
    try {
      const sellParams = {
        type: ctx.session.sellType,
        tokenAddress: ctx.session.sellTokenAddress,
        selectedPositions: [ctx.session.selectedPosition]
      };

      if (ctx.session.sellType === 'percentage') {
        sellParams.percentage = ctx.session.sellPercentage;
      } else if (ctx.session.sellType === 'amount') {
        sellParams.amount = ctx.session.sellAmount;
      }

      const confirmationMessage = await this.createSellConfirmationMessage(sellParams, ctx.session.sellChain);
      
      await ctx.reply(
        confirmationMessage + '\n\nClick "Finalize Sell" to execute or cancel.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔴 Finalize Sell', callback_data: 'finalize_sell' }],
              [{ text: '❌ Cancel', callback_data: 'cancel_sell' }]
            ]
          }
        }
      );

      // Clear awaiting input since we're now at confirmation stage
      ctx.session.awaitingInput = null;
    } catch (error) {
      console.error('Sell confirmation error:', error);
      await ctx.reply('❌ Error creating sell confirmation. Please try again.');
    }
  }

  // Handle finalize sell - calls your existing SellCommand
  async handleFinalizeSell(ctx) {
    try {
      await ctx.editMessageText('⚡ Executing sell order...');

      // Prepare sell parameters for SellCommand
      const sellParams = {
        type: ctx.session.sellType,
        selectedPositions: ctx.session.selectedPositions || [ctx.session.selectedPosition]
      };

      if (ctx.session.sellType === 'percentage') {
        sellParams.percentage = ctx.session.sellPercentage;
      } else if (ctx.session.sellType === 'amount') {
        sellParams.amount = ctx.session.sellAmount;
      }

      // Store in botCore session for SellCommand
      this.botCore.setState(ctx, 'awaiting_sell_confirmation', {
        sellParams,
        timestamp: Date.now()
      });

      // Call your existing SellCommand's executeSellOrder method
      const sellData = { sellParams };
      await this.sellCommand.executeSellOrder(ctx, sellData);

      // Clear session after execution
      this.clearSellSession(ctx);
    } catch (error) {
      console.error('Finalize sell error:', error);
      await ctx.editMessageText('❌ Error executing sell order. Please try again.');
      this.clearSellSession(ctx);
    }
  }

  // Handle cancel sell
  async handleCancelSell(ctx) {
    this.clearSellSession(ctx);
    await ctx.editMessageText('❌ Sell order cancelled.');
    
    // Show main menu after 1 second
    setTimeout(async () => {
      await ctx.editMessageText(`🚀 **Welcome to Smile Snipper Bot!** @${ctx.from.username}

Your ultimate multi-chain copy trading companion with advanced features that outperform similar.ai!

🔥 **Key Features:**
🤖 **Advanced copy trading from any wallet**
⚡ **Per-wallet controls (start/pause/stop)**
📝 **Custom wallet naming**
💼 **Built-in custodial wallets**
📊 **Real-time trade notifications**
🛡️ **Trailing stop-loss protection**
🎯 **Custom TP/SL levels**
💰 **Anti-MEV protection**
🎁 **Referral program**

Type /help to see all commands and start your trading journey!`, 
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Buy', callback_data: 'buy' }, { text: 'Sell', callback_data: 'sell' }, { text: 'TakeProfitStopLoss', callback_data: 'tpsl' }],
              [{ text: 'Wallet', callback_data: 'wallet' }, { text: 'Help', callback_data: 'help' }, { text: 'Settings', callback_data: 'settings' }],
              [{ text: 'Track', callback_data: 'track' }, { text: 'Chains', callback_data: 'chains' }, { text: 'Copytrade', callback_data: 'copytrade' }],
              [{ text: 'Active Orders', callback_data: 'active_orders' }, { text: 'Balance', callback_data: 'balance' }, { text: 'Positions', callback_data: 'positions' }],
            ]
          }
        });
    }, 1000);
  }

  // Create sell confirmation message
  async createSellConfirmationMessage(sellParams, chain) {
    const chainEmoji = this.getChainEmoji(chain);

    let message = `🔴 **Confirm SELL Order** ${chainEmoji}\n\n`;
    
    if (sellParams.type === 'all' && sellParams.selectedPositions.length > 1) {
      message += `🎯 **Selling ALL Positions (${sellParams.selectedPositions.length} tokens)**\n\n`;
    } else if (sellParams.type === 'percentage') {
      message += `🎯 **Selling ${sellParams.percentage}% of Position(s)**\n\n`;
    } else if (sellParams.type === 'amount') {
      message += `🎯 **Selling ${sellParams.amount} tokens**\n\n`;
    } else {
      const position = sellParams.selectedPositions[0];
      message += `🎯 **${position.tokenName || position.tokenSymbol}** (${position.tokenSymbol})\n\n`;
    }

    let totalValue = 0;
    
    message += `📊 **Position Details:**\n`;
    for (const position of sellParams.selectedPositions) {
      let sellAmount = position.totalAmount || position.amount;
      
      if (sellParams.type === 'percentage') {
        sellAmount = (position.totalAmount || position.amount) * (sellParams.percentage / 100);
      } else if (sellParams.type === 'amount') {
        sellAmount = sellParams.amount;
      }
      
      if (!position.tokenAddress) {
        console.log('Missing token address for position:', position);
        throw new Error('Missing token address');
      }
      
      const tokenInfo = await tokenDataService.getTokenInfo(position.tokenAddress, chain);
      const sellValue = sellAmount * (tokenInfo?.price || 0);

      totalValue += sellValue;
      message += `• **${position.tokenSymbol}:** ${sellAmount.toFixed(4)} tokens\n`;
      message += `  └ Value: ~$${sellValue.toFixed(6)} (${(sellAmount/(position.amount || position.totalAmount)*100).toFixed(2)}%)\n`;
    }
    
    message += `\n💰 **Order Summary:**\n`;
    message += `• **Total Est. Value:** $${totalValue.toFixed(6)}\n`;
    message += `• **Network:** ${chain.toUpperCase()}\n`;
    
    const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3');
    const devFee = totalValue * (devFeePercent / 100);
    message += `• **Dev Fee (${devFeePercent}%):** $${devFee.toFixed(6)}\n`;
    message += `• **Net Proceeds:** $${(totalValue - devFee).toFixed(6)}\n`;

    return message;
  }

  // Clear sell session data
  clearSellSession(ctx) {
    ctx.session = ctx.session || {};
    ctx.session.sellChain = null;
    ctx.session.sellTokenAddress = null;
    ctx.session.sellPercentage = null;
    ctx.session.sellAmount = null;
    ctx.session.sellType = null;
    ctx.session.selectedPosition = null;
    ctx.session.selectedPositions = null;
    ctx.session.matchingPositions = null;
    ctx.session.chainPositions = null;
    ctx.session.awaitingInput = null;
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
}

module.exports = SellCommandHandler;