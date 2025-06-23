// telegram/commands/buy.js - Enhanced Buy Command with Real Execution
const userService = require('../../users/userService');
const tokenDataService = require('../../services/tokenDataService');
const { getManualTradingService } = require('../../services/manualTrading');
const walletService = require('../../services/walletService');

module.exports = function(bot) {
  // Enhanced buy command with real execution
  bot.command(['buy', 'buyeth', 'buybnb', 'buysol'], async (ctx) => {
    try {
      const userId = ctx.from.id;
      await userService.updateLastActive(userId);
      
      const command = ctx.message.text.toLowerCase();
      const args = ctx.message.text.split(' ').slice(1);
      
      // Get user settings
      const userSettings = await userService.getUserSettings(userId);
      if (!userSettings) {
        return ctx.reply('❌ Please set up your account first with /start');
      }
      
      // Determine chain from command
      let chain = userSettings.chain;
      if (command.includes('eth')) chain = 'ethereum';
      else if (command.includes('bnb')) chain = 'bsc';
      else if (command.includes('sol')) chain = 'solana';
      
      if (!chain) {
        return ctx.reply('⚠️ Please set your chain first. Use /setchain command.');
      }
      
      // Show usage if no arguments
      if (args.length === 0) {
        return ctx.reply(`📝 **Enhanced Buy Command Usage:**

**Quick Buy:**
• \`/buy <token_address>\` - Buy with default amount
• \`/buy <amount> <token_address>\` - Buy specific amount

**Chain-Specific:**
• \`/buyeth <amount> <token>\` - Buy with ETH
• \`/buybnb <amount> <token>\` - Buy with BNB  
• \`/buysol <amount> <token>\` - Buy with SOL

**Advanced Features:**
• \`/buy max <token>\` - Buy with maximum available balance
• \`/buy <amount> <token> <slippage>\` - Custom slippage

**Examples:**
• \`/buy So11111111111111111111111111111111111111112\`
• \`/buy 0.1 BONK\`
• \`/buysol 0.5 So11111111111111111111111111111111111111112 10\`

✅ **Real blockchain execution enabled**
🎯 **Trade simulation & confirmation dialogs**
⚡ **Professional error handling**`, { parse_mode: 'Markdown' });
      }
      
      // Parse arguments
      let amount, tokenAddress, slippage;
      
      if (args.length === 1) {
        // Just token address
        if (args[0].toLowerCase() === 'max') {
          return ctx.reply('❌ Please specify token address for max buy: `/buy max <token_address>`', { parse_mode: 'Markdown' });
        }
        tokenAddress = args[0];
        amount = userSettings.amount || 0.1;
      } else if (args.length === 2) {
        if (args[0].toLowerCase() === 'max') {
          // Max buy
          tokenAddress = args[1];
          
          // Get wallet balance for max calculation
          if (!userSettings.custodialWallets || !userSettings.custodialWallets[chain]) {
            return ctx.reply('❌ No wallet found. Please create one with /wallet');
          }
          
          const balanceInfo = await walletService.getWalletBalance(userSettings.custodialWallets[chain].address, chain);
          const availableBalance = parseFloat(balanceInfo.balance);
          
          // Reserve some for gas fees
          const gasReserve = chain === 'solana' ? 0.01 : chain === 'ethereum' ? 0.01 : 0.001;
          amount = Math.max(0, availableBalance - gasReserve);
          
          if (amount <= 0) {
            return ctx.reply(`❌ Insufficient balance for max buy. Current balance: ${balanceInfo.balance} ${balanceInfo.symbol}`);
          }
        } else {
          // Amount and token
          amount = parseFloat(args[0]);
          tokenAddress = args[1];
          
          if (isNaN(amount) || amount <= 0) {
            return ctx.reply('❌ Invalid amount. Please enter a positive number.');
          }
        }
      } else if (args.length === 3) {
        // Amount, token, and slippage
        amount = parseFloat(args[0]);
        tokenAddress = args[1];
        slippage = parseFloat(args[2]);
        
        if (isNaN(amount) || amount <= 0) {
          return ctx.reply('❌ Invalid amount. Please enter a positive number.');
        }
        
        if (isNaN(slippage) || slippage < 0 || slippage > 50) {
          return ctx.reply('❌ Invalid slippage. Please enter a value between 0 and 50.');
        }
      } else {
        return ctx.reply('❌ Invalid format. Use: `/buy [amount] <token_address> [slippage]`', { parse_mode: 'Markdown' });
      }
      
      // Validate token address
      if (!tokenAddress || tokenAddress.length < 10) {
        return ctx.reply('❌ Invalid token address provided.');
      }
      
      // Check if wallet exists
      if (!userSettings.custodialWallets || !userSettings.custodialWallets[chain]) {
        return ctx.reply('⚠️ Please create a wallet first with /wallet');
      }
      
      const loadingMsg = await ctx.reply('🔍 Analyzing token and preparing trade...');
      
      try {
        // Get token information
        const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
        if (!tokenInfo) {
          await ctx.editMessageText('❌ Failed to get token information. Please check the token address.');
          return;
        }
        
        // Get trading service
        const manualTradingService = getManualTradingService();
        if (!manualTradingService.isInitialized()) {
          await manualTradingService.forceInitialize();
          if (!manualTradingService.isInitialized()) {
            await ctx.editMessageText('❌ Trading service not available. Please try again.');
            return;
          }
        }
        
        // Create trade confirmation
        const tradeParams = {
          tokenAddress: tokenInfo.address,
          amount,
          chain,
          slippage: slippage || userSettings.slippage || 5,
          tradeType: 'buy'
        };
        
        const confirmation = await manualTradingService.createTradeConfirmation(userId, tradeParams);
        
        if (!confirmation.success) {
          await ctx.editMessageText(`❌ Failed to prepare trade: ${confirmation.message}`);
          return;
        }
        
        // Calculate fees (using new format)
        const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3');
        const devFee = amount * (devFeePercent / 100);
        const netAmount = amount - devFee;
        const feeCode = String(devFeePercent).padStart(4, '0');
        
        // Format confirmation message
        const chainEmoji = chain === 'solana' ? '🟣' : chain === 'ethereum' ? '🔷' : '🟡';
        const chainSymbol = chain === 'solana' ? 'SOL' : chain === 'ethereum' ? 'ETH' : 'BNB';
        
        let message = `🟢 **Confirm BUY Order** ${chainEmoji}\n\n`;
        message += `🎯 **${tokenInfo.name}** (${tokenInfo.symbol})\n`;
        message += `**Amount:** ${amount} ${chainSymbol}\n\n`;
        
        message += `📊 **Token Analysis:**\n`;
        message += `• **Price:** $${tokenInfo.price?.toFixed(8) || 'Unknown'}\n`;
        
        if (tokenInfo.marketCap) {
          message += `• **Market Cap:** $${tokenInfo.marketCap.toLocaleString()}\n`;
        }
        
        if (tokenInfo.priceChange24h !== undefined) {
          const changeEmoji = tokenInfo.priceChange24h >= 0 ? '📈' : '📉';
          message += `• **24h Change:** ${changeEmoji} ${tokenInfo.priceChange24h.toFixed(2)}%\n`;
        }
        
        if (tokenInfo.liquidity) {
          message += `• **Liquidity:** $${tokenInfo.liquidity.toLocaleString()}\n`;
        }
        
        message += `\n📍 **Contract:** \`${tokenInfo.address}\`\n\n`;
        
        message += `💰 **Order Summary:**\n`;
        message += `• **Total Cost:** ${amount} ${chainSymbol}\n`;
        message += `• **TX fee - ${feeCode}:** ${devFee.toFixed(6)}\n`;
        message += `• **Net Amount:** ${netAmount.toFixed(6)}\n`;
        message += `• **Slippage:** ${tradeParams.slippage}%\n\n`;
        
        if (tokenInfo.warnings && tokenInfo.warnings.length > 0) {
          message += `⚠️ **Warnings:**\n`;
          tokenInfo.warnings.forEach(warning => {
            message += `• ${warning}\n`;
          });
          message += `\n`;
        }
        
        message += `✅ **Ready for execution on ${chain.toUpperCase()} blockchain**\n`;
        message += `⚠️ **Reply YES to confirm or NO to cancel**\n`;
        message += `⏰ Expires in 60 seconds`;
        
        // Store trade ID in session
        ctx.session = ctx.session || {};
        ctx.session.pendingTradeId = confirmation.tradeId;
        ctx.session.awaitingTradeConfirmation = true;
        
        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
        
      } catch (error) {
        console.error('Enhanced buy command error:', error);
        await ctx.editMessageText('❌ Error preparing buy order. Please try again.');
      }
      
    } catch (error) {
      console.error('Buy command error:', error);
      await ctx.reply('❌ Error processing buy command. Please try again.');
    }
  });
}; 