// telegram/commands/sell.js - Enhanced Sell Command with Real Execution
const userService = require('../../users/userService');
const tokenDataService = require('../../services/tokenDataService');
const { getManualTradingService } = require('../../services/manualTrading');

module.exports = function(bot) {
  // Enhanced sell command with real execution
  bot.command(['sell', 'sellall', 'sellmax', 'sellinitials'], async (ctx) => {
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
      
      const chain = userSettings.chain;
      if (!chain) {
        return ctx.reply('⚠️ Please set your chain first. Use /setchain command.');
      }
      
      // Get trading service
      const manualTradingService = getManualTradingService();
      if (!manualTradingService.isInitialized()) {
        await manualTradingService.forceInitialize();
        if (!manualTradingService.isInitialized()) {
          return ctx.reply('❌ Trading service not available. Please try again.');
        }
      }
      
      // Handle sellall command
      if (command === 'sellall') {
        const loadingMsg = await ctx.reply('🔄 Loading all positions...');
        
        try {
          const positions = await manualTradingService.getUserPositions(userId);
          
          if (positions.length === 0) {
            await ctx.editMessageText('❌ No positions to sell.');
            return;
          }
          
          let message = `🔴 **Confirm SELL ALL Positions**\n\n`;
          message += `You are about to sell ${positions.length} positions:\n\n`;
          
          let totalValue = 0;
          for (const position of positions) {
            message += `• **${position.tokenSymbol}:** ${position.amount?.toFixed(4)} tokens ($${position.currentValue?.toFixed(2) || 0})\n`;
            totalValue += position.currentValue || 0;
          }
          
          message += `\n💰 **Total Portfolio Value:** $${totalValue.toFixed(2)}\n\n`;
          message += `⚠️ **Reply YES to sell all positions or NO to cancel**\n`;
          message += `⏰ Expires in 60 seconds`;
          
          // Store sellall command in session
          ctx.session = ctx.session || {};
          ctx.session.sellAllPositions = true;
          ctx.session.awaitingTradeConfirmation = true;
          
          await ctx.editMessageText(message, { parse_mode: 'Markdown' });
          
        } catch (error) {
          console.error('Error preparing sellall:', error);
          await ctx.editMessageText('❌ Error preparing sell all order. Please try again.');
        }
        
        return;
      }
      
      // Handle sellinitials command (sell to recover initial investment)
      if (command === 'sellinitials') {
        const loadingMsg = await ctx.reply('🔄 Analyzing positions...');
        
        try {
          const positions = await manualTradingService.getUserPositions(userId);
          
          if (positions.length === 0) {
            await ctx.editMessageText('❌ No positions to sell.');
            return;
          }
          
          // If token address is provided, sell initials for that token
          if (args.length > 0) {
            const tokenAddress = args[0];
            const position = positions.find(p => 
              p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
            );
            
            if (!position) {
              await ctx.editMessageText('❌ Position not found. Please check the token address.');
              return;
            }
            
            // Calculate percentage to recover initial investment
            const currentValue = position.currentValue || 0;
            const initialValue = position.amount * position.avgBuyPrice;
            
            if (currentValue <= initialValue) {
              await ctx.editMessageText('❌ Position is at a loss. Cannot recover initial investment without selling 100%.');
              return;
            }
            
            const percentageToSell = (initialValue / currentValue) * 100;
            
            // Create sell confirmation
            const tradeParams = {
              tokenAddress: position.tokenAddress,
              percentage: percentageToSell,
              chain: position.chain,
              slippage: userSettings.slippage || 5,
              tradeType: 'sell'
            };
            
            const confirmation = await manualTradingService.createTradeConfirmation(userId, tradeParams);
            
            if (!confirmation.success) {
              await ctx.editMessageText(`❌ Failed to prepare sell order: ${confirmation.message}`);
              return;
            }
            
            // Format sell confirmation
            const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
            const chainEmoji = position.chain === 'solana' ? '🟣' : position.chain === 'ethereum' ? '🔷' : '🟡';
            
            let message = `💰 **Sell Initials - Recover Investment** ${chainEmoji}\n\n`;
            message += `🎯 **${position.tokenName || position.tokenSymbol}** (${position.tokenSymbol})\n`;
            message += `**Sell Amount:** ${percentageToSell.toFixed(2)}% of position\n\n`;
            
            message += `📊 **Position Details:**\n`;
            message += `• **Initial Investment:** $${initialValue.toFixed(2)}\n`;
            message += `• **Current Value:** $${currentValue.toFixed(2)}\n`;
            message += `• **Profit:** ${pnlEmoji} +${((currentValue - initialValue) / initialValue * 100).toFixed(2)}%\n\n`;
            
            message += `💸 **After This Sale:**\n`;
            message += `• **Recovered:** $${initialValue.toFixed(2)} (your initial investment)\n`;
            message += `• **Remaining:** ${(position.amount * (1 - percentageToSell/100)).toFixed(4)} tokens\n`;
            message += `• **Playing with:** 100% profits\n\n`;
            
            message += `✅ **Ready for execution on ${position.chain.toUpperCase()} blockchain**\n`;
            message += `⚠️ **Reply YES to confirm or NO to cancel**\n`;
            message += `⏰ Expires in 60 seconds`;
            
            // Store trade ID in session
            ctx.session = ctx.session || {};
            ctx.session.pendingTradeId = confirmation.tradeId;
            ctx.session.awaitingTradeConfirmation = true;
            
            await ctx.editMessageText(message, { parse_mode: 'Markdown' });
            
          } else {
            // Show positions to choose from
            let message = `💰 **Sell Initials - Recover Investment**\n\n`;
            message += `Select a position to recover your initial investment:\n\n`;
            
            for (let i = 0; i < positions.length; i++) {
              const position = positions[i];
              const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
              
              message += `${i + 1}. ${pnlEmoji} **${position.tokenSymbol}**\n`;
              message += `   • Value: $${position.currentValue?.toFixed(2) || 0}\n`;
              message += `   • PnL: ${position.pnl >= 0 ? '+' : ''}${position.pnlPercentage?.toFixed(2) || 0}%\n`;
              message += `   • Address: \`${position.tokenAddress}\`\n\n`;
            }
            
            message += `To recover your initial investment, use:\n`;
            message += `\`/sellinitials <token_address>\`\n\n`;
            message += `Example: \`/sellinitials ${positions[0]?.tokenAddress || 'TOKEN_ADDRESS'}\``;
            
            await ctx.editMessageText(message, { parse_mode: 'Markdown' });
          }
          
        } catch (error) {
          console.error('Error preparing sellinitials:', error);
          await ctx.editMessageText('❌ Error analyzing positions. Please try again.');
        }
        
        return;
      }
      
      // Handle sellmax command (sell 100% of a token)
      if (command === 'sellmax') {
        if (args.length === 0) {
          return ctx.reply('❌ Please specify a token address. Usage: `/sellmax <token_address>`', { parse_mode: 'Markdown' });
        }
        
        const tokenAddress = args[0];
        const loadingMsg = await ctx.reply('🔄 Preparing sell order...');
        
        try {
          // Get user positions
          const positions = await manualTradingService.getUserPositions(userId);
          const position = positions.find(p => 
            p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
          );
          
          if (!position) {
            await ctx.editMessageText('❌ Position not found. Please check the token address.');
            return;
          }
          
          // Create sell confirmation
          const tradeParams = {
            tokenAddress: position.tokenAddress,
            percentage: 100,
            chain: position.chain,
            slippage: userSettings.slippage || 5,
            tradeType: 'sell'
          };
          
          const confirmation = await manualTradingService.createTradeConfirmation(userId, tradeParams);
          
          if (!confirmation.success) {
            await ctx.editMessageText(`❌ Failed to prepare sell order: ${confirmation.message}`);
            return;
          }
          
          // Format sell confirmation
          const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
          const chainEmoji = position.chain === 'solana' ? '🟣' : position.chain === 'ethereum' ? '🔷' : '🟡';
          
          let message = `🔴 **Confirm SELL MAX Order** ${chainEmoji}\n\n`;
          message += `🎯 **${position.tokenName || position.tokenSymbol}** (${position.tokenSymbol})\n`;
          message += `**Sell Amount:** 100% (${position.amount?.toFixed(4)} tokens)\n\n`;
          
          message += `📊 **Position Details:**\n`;
          message += `• **Avg Buy Price:** $${position.avgBuyPrice?.toFixed(8) || 0}\n`;
          message += `• **Current Price:** $${position.currentPrice?.toFixed(8) || 0}\n`;
          message += `• **Current Value:** $${position.currentValue?.toFixed(2) || 0}\n`;
          message += `• **PnL:** ${pnlEmoji} ${position.pnl >= 0 ? '+' : ''}${position.pnlPercentage?.toFixed(2) || 0}%\n\n`;
          
          message += `✅ **Ready for execution on ${position.chain.toUpperCase()} blockchain**\n`;
          message += `⚠️ **Reply YES to confirm or NO to cancel**\n`;
          message += `⏰ Expires in 60 seconds`;
          
          // Store trade ID in session
          ctx.session = ctx.session || {};
          ctx.session.pendingTradeId = confirmation.tradeId;
          ctx.session.awaitingTradeConfirmation = true;
          
          await ctx.editMessageText(message, { parse_mode: 'Markdown' });
          
        } catch (error) {
          console.error('Error preparing sellmax:', error);
          await ctx.editMessageText('❌ Error preparing sell order. Please try again.');
        }
        
        return;
      }
      
      // Show positions if no arguments
      if (args.length === 0) {
        const loadingMsg = await ctx.reply('🔄 Loading your positions...');
        
        try {
          const positions = await manualTradingService.getUserPositions(userId);
          
          if (positions.length === 0) {
            await ctx.editMessageText('❌ You have no positions to sell. Buy tokens first!');
            return;
          }
          
          let message = `📊 **Your Active Positions**\n\n`;
          
          for (let i = 0; i < positions.length; i++) {
            const position = positions[i];
            const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
            
            message += `${i + 1}. ${pnlEmoji} **${position.tokenSymbol || 'Unknown'}**\n`;
            message += `   • **Amount:** ${position.amount?.toFixed(4) || 0}\n`;
            message += `   • **Avg Price:** $${position.avgBuyPrice?.toFixed(8) || 0}\n`;
            message += `   • **Current:** $${position.currentPrice?.toFixed(8) || 0}\n`;
            message += `   • **PnL:** ${position.pnl >= 0 ? '+' : ''}${position.pnlPercentage?.toFixed(2) || 0}%\n`;
            message += `   • **Value:** $${position.currentValue?.toFixed(2) || 0}\n`;
            message += `   \`${position.tokenAddress}\`\n\n`;
          }
          
          message += `💡 **Sell Commands:**\n`;
          message += `• \`/sell <token_address>\` - Sell all (100%)\n`;
          message += `• \`/sell 50% <token_address>\` - Sell percentage\n`;
          message += `• \`/sellall\` - Sell all positions\n`;
          message += `• \`/sellinitials <token>\` - Recover initial investment\n\n`;
          
          message += `**Examples:**\n`;
          message += `• \`/sell 25% ${positions[0]?.tokenAddress || 'TOKEN_ADDRESS'}\`\n`;
          message += `• \`/sell ${positions[0]?.tokenAddress || 'TOKEN_ADDRESS'}\``;
          
          await ctx.editMessageText(message, { parse_mode: 'Markdown' });
          
        } catch (error) {
          console.error('Error loading positions:', error);
          await ctx.editMessageText('❌ Error loading positions. Please try again.');
        }
        
        return;
      }
      
      // Parse sell arguments
      let percentage = 100;
      let tokenAddress;
      
      if (args.length === 1) {
        if (args[0].includes('%')) {
          return ctx.reply('❌ Please specify both percentage and token address.\nExample: `/sell 50% <token_address>`', { parse_mode: 'Markdown' });
        } else {
          tokenAddress = args[0];
        }
      } else if (args.length === 2) {
        percentage = parseFloat(args[0].replace('%', ''));
        tokenAddress = args[1];
        
        if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
          return ctx.reply('❌ Invalid percentage. Must be between 1% and 100%.');
        }
      } else {
        return ctx.reply('❌ Invalid format. Use: `/sell [percentage%] <token_address>`', { parse_mode: 'Markdown' });
      }
      
      const loadingMsg = await ctx.reply('🔍 Analyzing position and preparing sell order...');
      
      try {
        // Get user positions
        const positions = await manualTradingService.getUserPositions(userId);
        const position = positions.find(p => 
          p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
        );
        
        if (!position) {
          await ctx.editMessageText('❌ You don\'t have a position in this token.');
          return;
        }
        
        // Create sell confirmation
        const tradeParams = {
          tokenAddress: position.tokenAddress,
          percentage,
          chain: position.chain,
          slippage: userSettings.slippage || 5,
          tradeType: 'sell'
        };
        
        const confirmation = await manualTradingService.createTradeConfirmation(userId, tradeParams);
        
        if (!confirmation.success) {
          await ctx.editMessageText(`❌ Failed to prepare sell order: ${confirmation.message}`);
          return;
        }
        
        // Calculate sell details
        const sellAmount = (position.amount * percentage) / 100;
        const sellValue = sellAmount * (position.currentPrice || position.avgBuyPrice);
        const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3');
        const devFee = sellValue * (devFeePercent / 100);
        const feeCode = String(devFeePercent).padStart(4, '0');
        
        // Format sell confirmation
        const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
        const chainEmoji = position.chain === 'solana' ? '🟣' : position.chain === 'ethereum' ? '🔷' : '🟡';
        
        let message = `🔴 **Confirm SELL Order** ${chainEmoji}\n\n`;
        message += `🎯 **${position.tokenName || position.tokenSymbol}** (${position.tokenSymbol})\n`;
        message += `**Sell Amount:** ${percentage}% of position\n\n`;
        
        message += `📊 **Position Details:**\n`;
        message += `• **Total Tokens:** ${position.amount?.toFixed(4) || 0}\n`;
        message += `• **Avg Buy Price:** $${position.avgBuyPrice?.toFixed(8) || 0}\n`;
        message += `• **Current Price:** $${position.currentPrice?.toFixed(8) || 0}\n`;
        message += `• **Selling:** ${sellAmount.toFixed(4)} tokens\n`;
        message += `• **Est. Receive:** $${sellValue.toFixed(2)}\n\n`;
        
        message += `💰 **PnL Analysis:**\n`;
        message += `• **Position PnL:** ${pnlEmoji} ${position.pnl >= 0 ? '+' : ''}${position.pnlPercentage?.toFixed(2) || 0}%\n`;
        message += `• **Cost Basis:** $${((position.amount || 0) * (position.avgBuyPrice || 0)).toFixed(2)}\n`;
        message += `• **Current Value:** $${position.currentValue?.toFixed(2) || 0}\n\n`;
        
        message += `💸 **Transaction Summary:**\n`;
        message += `• **Gross Proceeds:** $${sellValue.toFixed(2)}\n`;
        message += `• **TX fee - ${feeCode}:** $${devFee.toFixed(4)}\n`;
        message += `• **Net Proceeds:** $${(sellValue - devFee).toFixed(2)}\n\n`;
        
        message += `✅ **Ready for execution on ${position.chain.toUpperCase()} blockchain**\n`;
        message += `⚠️ **Reply YES to confirm or NO to cancel**\n`;
        message += `⏰ Expires in 60 seconds`;
        
        // Store trade ID in session
        ctx.session = ctx.session || {};
        ctx.session.pendingTradeId = confirmation.tradeId;
        ctx.session.awaitingTradeConfirmation = true;
        
        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
        
      } catch (error) {
        console.error('Error preparing sell order:', error);
        await ctx.editMessageText('❌ Error preparing sell order. Please try again.');
      }
      
    } catch (error) {
      console.error('Sell command error:', error);
      await ctx.reply('❌ Error processing sell command. Please try again.');
    }
  });
}; 