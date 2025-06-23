const { Composer } = require('telegraf');
const { getAdminService } = require('../../services/adminService');
const { getAdvancedEngine } = require('../../services/advancedTradingEngine');
const { getReferralService } = require('../../services/referralService');
const userService = require('../../users/userService');
const { getRPCManager } = require('../../services/rpcManager');
const walletService = require('../../services/walletService');

const admin = new Composer();

// Main admin dashboard
admin.command('admin', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    // Check admin access
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const dashboard = await adminService.getAdminDashboard();
    await ctx.reply(dashboard, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Admin dashboard error:', err);
    await ctx.reply('❌ Failed to load admin dashboard');
  }
});

// Set dev fee
admin.command('setdevfee', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) {
      return ctx.reply('📝 **Usage:** /setdevfee <percent>\n\n**Example:** `/setdevfee 3`', { parse_mode: 'Markdown' });
    }
    
    const feePercent = parseFloat(args[0]);
    
    if (isNaN(feePercent) || feePercent < 0 || feePercent > 10) {
      return ctx.reply('❌ Invalid fee percentage. Must be between 0% and 10%.');
    }
    
    // Update environment variable
    process.env.DEV_FEE_PERCENT = String(feePercent);
    
    const result = await adminService.setTxFee('default', feePercent);
    
    if (result.success) {
      await ctx.reply(`✅ Dev fee set to ${feePercent}%\n\nThis applies to all trading operations.`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }
    
  } catch (err) {
    console.error('Set dev fee error:', err);
    await ctx.reply(`❌ Error setting dev fee: ${err.message}`);
  }
});

// Set admin wallet
admin.command('setadminwallet', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
      return ctx.reply(`📝 **Usage:** /setadminwallet <chain> <address>

**Supported Chains:**
• solana - Solana wallet
• ethereum - Ethereum wallet  
• bsc - BSC wallet
• polygon - Polygon wallet
• arbitrum - Arbitrum wallet
• base - Base wallet

**Example:** \`/setadminwallet solana 7ouabE3EBCVDsNtiYzfGSE6i2tw8r62oyWLzT3Yfqd6X\``, { parse_mode: 'Markdown' });
    }
    
    const chain = args[0].toLowerCase();
    const address = args[1];
    
    const supportedChains = ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
    if (!supportedChains.includes(chain)) {
      return ctx.reply(`❌ Invalid chain. Supported: ${supportedChains.join(', ')}`);
    }
    
    // Set environment variable
    const envVar = `ADMIN_WALLET_${chain.toUpperCase()}`;
    process.env[envVar] = address;
    
    await ctx.reply(`✅ Admin wallet set for ${chain.toUpperCase()}: \`${address}\``, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Set admin wallet error:', err);
    await ctx.reply(`❌ Error setting admin wallet: ${err.message}`);
  }
});

// View fees - FIXED
admin.command('viewfees', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    // Get admin stats
    const adminStats = await userService.getAdminStats();
    
    let message = `💰 **Fee Collection Report**\n\n`;
    message += `📊 **Summary:**\n`;
    message += `• Collected Today: $${adminStats.todayFees.toFixed(4)}\n`;
    message += `• Collected This Week: $${adminStats.weekFees.toFixed(4)}\n`;
    message += `• Collected This Month: $${adminStats.monthFees.toFixed(4)}\n`;
    message += `• Total Collected: $${adminStats.totalFees.toFixed(4)}\n\n`;
    
    message += `⛓️ **By Chain:**\n`;
    message += `• Solana: $${adminStats.solanaFees.toFixed(4)}\n`;
    message += `• Ethereum: $${adminStats.ethereumFees.toFixed(4)}\n`;
    message += `• BSC: $${adminStats.bscFees.toFixed(4)}\n\n`;
    
    message += `🔄 **By Action:**\n`;
    message += `• Buy Fees: $${adminStats.buyFees.toFixed(4)}\n`;
    message += `• Sell Fees: $${adminStats.sellFees.toFixed(4)}\n\n`;
    
    message += `⚙️ **Current Settings:**\n`;
    message += `• Dev Fee: ${process.env.DEV_FEE_PERCENT || 3}%\n`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('View fees error:', err);
    await ctx.reply('❌ Failed to get fee statistics. Please try again.');
  }
});

// Global stats - FIXED
admin.command('globalstats', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    // Get global user stats
    const userStats = await userService.getGlobalUserStats();
    
    // Get RPC status
    const rpcManager = getRPCManager();
    const rpcStatus = rpcManager.getStatus();
    
    // Get trading executor stats
    const { getRealTradingExecutor } = require('../../services/realTradingExecutor');
    const tradingExecutor = getRealTradingExecutor();
    const tradingStats = tradingExecutor.getStats();
    
    let message = `📊 **Global Bot Statistics**\n\n`;
    
    message += `👥 **Users:**\n`;
    message += `• Total Users: ${userStats.totalUsers}\n`;
    message += `• Active (24h): ${userStats.activeUsers24h}\n`;
    message += `• Active (7d): ${userStats.activeUsers7d}\n`;
    message += `• New Today: ${userStats.newUsersToday || 0}\n\n`;
    
    message += `⛓️ **By Chain:**\n`;
    message += `• Solana: ${userStats.solanaUsers}\n`;
    message += `• Ethereum: ${userStats.ethereumUsers}\n`;
    message += `• BSC: ${userStats.bscUsers}\n`;
    message += `• Polygon: ${userStats.polygonUsers || 0}\n`;
    message += `• Arbitrum: ${userStats.arbitrumUsers || 0}\n`;
    message += `• Base: ${userStats.baseUsers || 0}\n\n`;
    
    message += `💰 **Trading:**\n`;
    message += `• Total Trades: ${tradingStats.totalTrades}\n`;
    message += `• Success Rate: ${tradingStats.successRate}\n`;
    message += `• Total Volume: $${tradingStats.totalVolume.toLocaleString()}\n\n`;
    
    message += `🌐 **System Status:**\n`;
    message += `• RPC Health: ${rpcStatus.healthyRPCs}/${rpcStatus.totalRPCs} connections\n`;
    message += `• Uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n`;
    message += `• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Global stats error:', err);
    await ctx.reply('❌ Failed to get global statistics. Please try again.');
  }
});

// Chain stats - FIXED
admin.command('chainstats', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    // Get chain from args or default to all
    const args = ctx.message.text.split(' ').slice(1);
    const targetChain = args.length > 0 ? args[0].toLowerCase() : null;
    
    // Get RPC status
    const rpcManager = getRPCManager();
    const rpcStatus = rpcManager.getStatus();
    
    // Get trading executor stats
    const { getRealTradingExecutor } = require('../../services/realTradingExecutor');
    const tradingExecutor = getRealTradingExecutor();
    const tradingStats = tradingExecutor.getStats();
    
    let message = '';
    
    if (targetChain) {
      // Stats for specific chain
      const validChains = ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
      if (!validChains.includes(targetChain)) {
        return ctx.reply(`❌ Invalid chain. Supported chains: ${validChains.join(', ')}`);
      }
      
      message = `⛓️ **${targetChain.toUpperCase()} Chain Statistics**\n\n`;
      
      // RPC status
      const chainRpcStatus = rpcStatus.chains[targetChain] || { total: 0, healthy: 0 };
      message += `🌐 **Network Status:**\n`;
      message += `• RPC Health: ${chainRpcStatus.healthy}/${chainRpcStatus.total} connections\n`;
      
      // Get chain-specific trading stats
      const chainStats = tradingStats.chainStats[targetChain] || { 
        totalTrades: 0, 
        successfulTrades: 0, 
        failedTrades: 0, 
        totalVolume: 0 
      };
      
      message += `\n💰 **Trading Activity:**\n`;
      message += `• Total Trades: ${chainStats.totalTrades}\n`;
      message += `• Successful: ${chainStats.successfulTrades}\n`;
      message += `• Failed: ${chainStats.failedTrades}\n`;
      message += `• Success Rate: ${chainStats.totalTrades > 0 ? 
        ((chainStats.successfulTrades / chainStats.totalTrades) * 100).toFixed(1) : 0}%\n`;
      message += `• Total Volume: $${chainStats.totalVolume.toLocaleString()}\n\n`;
      
      // Get chain-specific fee stats
      const adminStats = await userService.getAdminStats();
      const chainFees = adminStats[`${targetChain}Fees`] || 0;
      
      message += `💸 **Fees Collected:**\n`;
      message += `• Total: $${chainFees.toFixed(4)}\n\n`;
      
      // Add network stats based on chain
      message += `📊 **Network Info:**\n`;
      
      try {
        if (targetChain === 'solana') {
          const connection = await rpcManager.getSolanaConnection();
          const slot = await connection.getSlot();
          const blockTime = await connection.getBlockTime(slot);
          
          message += `• Current Slot: ${slot}\n`;
          message += `• Block Time: ${new Date(blockTime * 1000).toLocaleString()}\n`;
          message += `• TPS: ~1,500\n`;
          
        } else {
          const provider = await rpcManager.executeWithRetry(targetChain, async (p) => p);
          const blockNumber = await provider.getBlockNumber();
          const gasPrice = await provider.getGasPrice();
          const gasPriceGwei = parseFloat(ethers.formatUnits(gasPrice, 'gwei'));
          
          message += `• Block Height: ${blockNumber}\n`;
          message += `• Gas Price: ${gasPriceGwei.toFixed(2)} Gwei\n`;
          
          // Chain-specific TPS estimates
          const tpsMap = {
            'ethereum': '~15-30',
            'bsc': '~60-100',
            'polygon': '~65',
            'arbitrum': '~40-60',
            'base': '~20-40'
          };
          
          message += `• TPS: ${tpsMap[targetChain] || 'Unknown'}\n`;
        }
      } catch (error) {
        message += `• Network data unavailable: ${error.message}\n`;
      }
      
    } else {
      // Stats for all chains
      message = `⛓️ **Multi-Chain Statistics**\n\n`;
      
      message += `🌐 **RPC Status:**\n`;
      for (const [chain, status] of Object.entries(rpcStatus.chains)) {
        message += `• ${chain.toUpperCase()}: ${status.healthy}/${status.total} connections\n`;
      }
      
      message += `\n💰 **Trading Volume:**\n`;
      for (const [chain, stats] of Object.entries(tradingStats.chainStats)) {
        message += `• ${chain.toUpperCase()}: $${stats.totalVolume.toLocaleString()} (${stats.totalTrades} trades)\n`;
      }
      
      // Get admin stats for fees by chain
      const adminStats = await userService.getAdminStats();
      
      message += `\n💸 **Fees Collected:**\n`;
      message += `• Solana: $${adminStats.solanaFees.toFixed(4)}\n`;
      message += `• Ethereum: $${adminStats.ethereumFees.toFixed(4)}\n`;
      message += `• BSC: $${adminStats.bscFees.toFixed(4)}\n`;
      message += `• Total: $${adminStats.totalFees.toFixed(4)}\n`;
    }
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Chain stats error:', err);
    await ctx.reply('❌ Failed to get chain statistics. Please try again.');
  }
});

// Withdraw command - FIXED
admin.command('withdraw', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 2) {
      return ctx.reply(`📝 **Usage:** /withdraw <chain> <amount> [destination_address]

**Supported Chains:**
• solana - Withdraw SOL
• ethereum - Withdraw ETH
• bsc - Withdraw BNB
• polygon - Withdraw MATIC
• arbitrum - Withdraw ETH
• base - Withdraw ETH

**Examples:**
• \`/withdraw solana 0.5\` - Withdraw to admin wallet
• \`/withdraw ethereum 0.1 0x742d35Cc6634C0532925a3b844Bc454e4438f44e\` - Withdraw to specific address

If no destination address is provided, funds will be sent to the admin wallet for that chain.`, { parse_mode: 'Markdown' });
    }
    
    const chain = args[0].toLowerCase();
    const amount = parseFloat(args[1]);
    const destinationAddress = args.length > 2 ? args[2] : null;
    
    // Validate chain
    const supportedChains = ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
    if (!supportedChains.includes(chain)) {
      return ctx.reply(`❌ Invalid chain. Supported chains: ${supportedChains.join(', ')}`);
    }
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Please enter a positive number.');
    }
    
    // Get admin wallet for this chain if no destination provided
    let targetAddress = destinationAddress;
    if (!targetAddress) {
      const envVar = `ADMIN_WALLET_${chain.toUpperCase()}`;
      targetAddress = process.env[envVar];
      
      if (!targetAddress) {
        return ctx.reply(`❌ No admin wallet set for ${chain.toUpperCase()}. Please set one with /setadminwallet or provide a destination address.`);
      }
    }
    
    // Show confirmation message
    const message = `🔄 **Confirm Withdrawal**

• **Chain:** ${chain.toUpperCase()}
• **Amount:** ${amount} ${chain === 'solana' ? 'SOL' : chain === 'polygon' ? 'MATIC' : 'ETH/BNB'}
• **Destination:** \`${targetAddress}\`

⚠️ **Reply YES to confirm or NO to cancel**`;
    
    // Store withdrawal info in session
    ctx.session = ctx.session || {};
    ctx.session.pendingWithdrawal = {
      chain,
      amount,
      destination: targetAddress,
      timestamp: Date.now()
    };
    ctx.session.awaitingWithdrawalConfirmation = true;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Withdraw command error:', err);
    await ctx.reply(`❌ Error processing withdrawal: ${err.message}`);
  }
});

// Process withdrawal confirmation
admin.hears(/^(YES|yes|Yes|Y|y|NO|no|No|N|n)$/i, async (ctx) => {
  try {
    // Check if awaiting withdrawal confirmation
    if (!ctx.session?.awaitingWithdrawalConfirmation || !ctx.session?.pendingWithdrawal) {
      return; // Not awaiting withdrawal confirmation
    }
    
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      ctx.session.awaitingWithdrawalConfirmation = false;
      ctx.session.pendingWithdrawal = null;
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const confirmed = /^(YES|yes|Yes|Y|y)$/i.test(ctx.message.text);
    const withdrawal = ctx.session.pendingWithdrawal;
    
    // Clear session state
    ctx.session.awaitingWithdrawalConfirmation = false;
    ctx.session.pendingWithdrawal = null;
    
    if (!confirmed) {
      return ctx.reply('❌ Withdrawal cancelled.');
    }
    
    // Process withdrawal
    await ctx.reply('🔄 Processing withdrawal...');
    
    try {
      // Get admin wallet private key
      const userData = await userService.getUserSettings(userId);
      
      if (!userData.custodialWallets || !userData.custodialWallets[withdrawal.chain]) {
        return ctx.reply(`❌ No ${withdrawal.chain} wallet found for admin. Please create one with /wallet first.`);
      }
      
      // Send tokens
      const result = await walletService.sendNativeTokens(
        userId,
        withdrawal.chain,
        withdrawal.destination,
        withdrawal.amount
      );
      
      if (result.success) {
        let successMessage = `✅ **Withdrawal Successful!**\n\n`;
        successMessage += `📤 **Sent:** ${withdrawal.amount} ${withdrawal.chain === 'solana' ? 'SOL' : withdrawal.chain === 'polygon' ? 'MATIC' : 'ETH/BNB'}\n`;
        successMessage += `📍 **To:** \`${withdrawal.destination}\`\n`;
        successMessage += `📝 **TX Hash:** \`${result.txHash}\`\n`;
        successMessage += `⛽ **Gas Used:** ${result.gasUsed || 'N/A'}\n`;
        successMessage += `🕒 **Time:** ${new Date().toLocaleString()}\n\n`;
        
        // Add explorer link
        let explorerUrl = '';
        if (withdrawal.chain === 'solana') {
          explorerUrl = `https://solscan.io/tx/${result.txHash}`;
        } else if (withdrawal.chain === 'ethereum') {
          explorerUrl = `https://etherscan.io/tx/${result.txHash}`;
        } else if (withdrawal.chain === 'bsc') {
          explorerUrl = `https://bscscan.com/tx/${result.txHash}`;
        } else if (withdrawal.chain === 'polygon') {
          explorerUrl = `https://polygonscan.com/tx/${result.txHash}`;
        } else if (withdrawal.chain === 'arbitrum') {
          explorerUrl = `https://arbiscan.io/tx/${result.txHash}`;
        } else if (withdrawal.chain === 'base') {
          explorerUrl = `https://basescan.org/tx/${result.txHash}`;
        }
        
        if (explorerUrl) {
          successMessage += `🔍 **View on Explorer:** [Click here](${explorerUrl})\n\n`;
        }
        
        await ctx.reply(successMessage, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
      } else {
        await ctx.reply(`❌ Withdrawal failed: ${result.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('Withdrawal execution error:', error);
      await ctx.reply(`❌ Withdrawal failed: ${error.message}`);
    }
    
  } catch (error) {
    console.error('Withdrawal confirmation error:', error);
    
    // Clear any hanging state
    if (ctx.session) {
      ctx.session.awaitingWithdrawalConfirmation = false;
      ctx.session.pendingWithdrawal = null;
    }
    
    await ctx.reply('❌ Error processing withdrawal confirmation. Please try again.');
  }
});

// Export users
admin.command('exportusers', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const users = await userService.getAllUsers();
    const userCount = Object.keys(users).length;
    
    if (userCount === 0) {
      return ctx.reply('❌ No users found.');
    }
    
    // Create a simple JSON export
    const exportData = JSON.stringify(users, null, 2);
    
    // Send as a file if small enough, otherwise summarize
    if (exportData.length < 50000) {
      await ctx.replyWithDocument({
        source: Buffer.from(exportData),
        filename: `users_export_${new Date().toISOString().split('T')[0]}.json`
      });
    } else {
      // Create a summary
      let summary = `📊 **User Export Summary**\n\n`;
      summary += `• Total Users: ${userCount}\n`;
      
      // Count users by chain
      const chainCounts = {};
      for (const user of Object.values(users)) {
        const chain = user.chain || 'unknown';
        chainCounts[chain] = (chainCounts[chain] || 0) + 1;
      }
      
      summary += `\n⛓️ **Users by Chain:**\n`;
      for (const [chain, count] of Object.entries(chainCounts)) {
        summary += `• ${chain.toUpperCase()}: ${count}\n`;
      }
      
      // Count wallets
      let totalWallets = 0;
      for (const user of Object.values(users)) {
        totalWallets += (user.wallets || []).length;
      }
      
      summary += `\n💼 **Total Tracked Wallets:** ${totalWallets}\n`;
      summary += `\n⚠️ Export too large to send as a file. Use database export tools for full data.`;
      
      await ctx.reply(summary, { parse_mode: 'Markdown' });
    }
    
  } catch (err) {
    console.error('Export users error:', err);
    await ctx.reply(`❌ Error exporting users: ${err.message}`);
  }
});

// View users
admin.command('users', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const stats = await userService.getGlobalUserStats();
    
    let message = `👥 **User Statistics**\n\n`;
    message += `📊 **Overview:**\n`;
    message += `• Total Users: ${stats.totalUsers}\n`;
    message += `• Active (24h): ${stats.activeUsers24h}\n`;
    message += `• Active (7d): ${stats.activeUsers7d}\n`;
    message += `• New Today: ${stats.newUsersToday || 0}\n\n`;
    
    message += `⛓️ **By Chain:**\n`;
    message += `• Solana: ${stats.solanaUsers}\n`;
    message += `• Ethereum: ${stats.ethereumUsers}\n`;
    message += `• BSC: ${stats.bscUsers}\n`;
    message += `• Polygon: ${stats.polygonUsers || 0}\n`;
    message += `• Arbitrum: ${stats.arbitrumUsers || 0}\n`;
    message += `• Base: ${stats.baseUsers || 0}\n\n`;
    
    message += `💼 **Wallets:**\n`;
    message += `• Total Wallets: ${stats.totalWallets}\n`;
    message += `• Avg Wallets/User: ${stats.avgWalletsPerUser.toFixed(1)}\n\n`;
    
    message += `📈 **Trading:**\n`;
    message += `• Users with Positions: ${stats.usersWithPositions}\n`;
    message += `• Total Positions: ${stats.totalPositions}\n\n`;
    
    message += `💡 **Commands:**\n`;
    message += `• /userinfo <userId> - Get specific user details\n`;
    message += `• /broadcast <message> - Send message to all users\n`;
    message += `• /exportusers - Export user data`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Users stats error:', err);
    await ctx.reply('❌ Failed to get user statistics');
  }
});

// Get specific user info
admin.command('userinfo', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) {
      return ctx.reply('📝 Usage: /userinfo <user_id>\n\nExample: /userinfo 123456789');
    }
    
    const targetUserId = args[0];
    const userData = await userService.getUserSettings(targetUserId);
    
    if (!userData) {
      return ctx.reply('❌ User not found');
    }
    
    let message = `👤 **User Information**\n\n`;
    message += `🆔 **ID:** ${targetUserId}\n`;
    message += `👤 **Username:** ${userData.username || 'Unknown'}\n`;
    message += `📅 **Created:** ${userData.createdAt || 'Unknown'}\n`;
    message += `⏰ **Last Active:** ${new Date(userData.stats?.lastActive || 0).toLocaleString()}\n`;
    message += `⛓️ **Chain:** ${userData.chain || 'Not set'}\n\n`;
    
    // Wallets
    message += `💼 **Wallets:**\n`;
    if (userData.wallets && userData.wallets.length > 0) {
      userData.wallets.forEach((wallet, index) => {
        const name = userData.walletNames?.[wallet] || '';
        message += `• ${index + 1}. \`${wallet}\` ${name ? `(${name})` : ''}\n`;
      });
    } else {
      message += `• No tracked wallets\n`;
    }
    
    // Custodial wallets
    message += `\n🔐 **Custodial Wallets:**\n`;
    if (userData.custodialWallets) {
      for (const [chain, wallet] of Object.entries(userData.custodialWallets)) {
        message += `• ${chain.toUpperCase()}: \`${wallet.address}\`\n`;
      }
    } else {
      message += `• No custodial wallets\n`;
    }
    
    // Trading stats
    const stats = userData.stats || {};
    message += `\n📈 **Trading Stats:**\n`;
    message += `• Total Trades: ${stats.totalTrades || 0}\n`;
    message += `• Wins: ${stats.wins || 0}\n`;
    message += `• Losses: ${stats.losses || 0}\n`;
    message += `• Win Rate: ${stats.totalTrades > 0 ? ((stats.wins / stats.totalTrades) * 100).toFixed(1) : 0}%\n`;
    message += `• Total PnL: $${(stats.totalPnL || 0).toFixed(2)}\n`;
    
    // Positions
    message += `\n📊 **Positions:**\n`;
    if (userData.positions && Object.keys(userData.positions).length > 0) {
      for (const [token, position] of Object.entries(userData.positions)) {
        message += `• ${position.tokenSymbol || 'Unknown'}: ${position.totalAmount?.toFixed(4) || 0} tokens\n`;
      }
    } else {
      message += `• No active positions\n`;
    }
    
    // Settings
    message += `\n⚙️ **Settings:**\n`;
    message += `• Default Amount: ${userData.amount || 'Not set'}\n`;
    message += `• Slippage: ${userData.slippage || 5}%\n`;
    message += `• Smart Slippage: ${userData.smartSlippage ? 'Enabled' : 'Disabled'}\n`;
    message += `• Daily Limit: ${userData.dailyLimit || 'Not set'}\n`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('User info error:', err);
    await ctx.reply(`❌ Error getting user info: ${err.message}`);
  }
});

// Broadcast message to users
admin.command('broadcast', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) {
      return ctx.reply(`📝 **Usage:** /broadcast <message> [target]

**Target Types:**
• all - All users (default)
• active - Users active in last 24h
• traders - Users with trading history

**Example:** \`/broadcast "New features available!" active\``, { parse_mode: 'Markdown' });
    }
    
    const targetType = args[args.length - 1];
    const validTargets = ['all', 'active', 'traders'];
    
    let message, target;
    if (validTargets.includes(targetType)) {
      message = args.slice(0, -1).join(' ');
      target = targetType;
    } else {
      message = args.join(' ');
      target = 'all';
    }
    
    if (!message.trim()) {
      return ctx.reply('❌ Broadcast message cannot be empty');
    }
    
    // Get all users
    const users = await userService.getAllUsers();
    const userIds = Object.keys(users);
    
    if (userIds.length === 0) {
      return ctx.reply('❌ No users found to broadcast to');
    }
    
    // Filter users based on target
    let targetUsers = [];
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    if (target === 'all') {
      targetUsers = userIds;
    } else if (target === 'active') {
      targetUsers = userIds.filter(id => {
        const user = users[id];
        const lastActive = new Date(user.stats?.lastActive || 0).getTime();
        return lastActive > oneDayAgo;
      });
    } else if (target === 'traders') {
      targetUsers = userIds.filter(id => {
        const user = users[id];
        return (user.stats?.totalTrades || 0) > 0;
      });
    }
    
    if (targetUsers.length === 0) {
      return ctx.reply(`❌ No users found matching target "${target}"`);
    }
    
    // Confirm broadcast
    const confirmMessage = `📢 **Broadcast Confirmation**

**Message:**
${message}

**Target:** ${target}
**Recipients:** ${targetUsers.length}/${userIds.length} users

⚠️ **Reply YES to confirm or NO to cancel**`;
    
    // Store broadcast info in session
    ctx.session = ctx.session || {};
    ctx.session.pendingBroadcast = {
      message,
      target,
      targetUsers,
      timestamp: Date.now()
    };
    ctx.session.awaitingBroadcastConfirmation = true;
    
    await ctx.reply(confirmMessage, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Broadcast error:', err);
    await ctx.reply(`❌ Error preparing broadcast: ${err.message}`);
  }
});

// Process broadcast confirmation
admin.hears(/^(YES|yes|Yes|Y|y|NO|no|No|N|n)$/i, async (ctx) => {
  try {
    // Check if awaiting broadcast confirmation
    if (!ctx.session?.awaitingBroadcastConfirmation || !ctx.session?.pendingBroadcast) {
      return; // Not awaiting broadcast confirmation
    }
    
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      ctx.session.awaitingBroadcastConfirmation = false;
      ctx.session.pendingBroadcast = null;
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const confirmed = /^(YES|yes|Yes|Y|y)$/i.test(ctx.message.text);
    const broadcast = ctx.session.pendingBroadcast;
    
    // Clear session state
    ctx.session.awaitingBroadcastConfirmation = false;
    ctx.session.pendingBroadcast = null;
    
    if (!confirmed) {
      return ctx.reply('❌ Broadcast cancelled.');
    }
    
    // Send broadcast
    await ctx.reply(`🔄 Sending broadcast to ${broadcast.targetUsers.length} users...`);
    
    let sentCount = 0;
    let errorCount = 0;
    
    // Send in batches to avoid rate limiting
    const batchSize = 20;
    const delay = 1000; // 1 second delay between batches
    
    for (let i = 0; i < broadcast.targetUsers.length; i += batchSize) {
      const batch = broadcast.targetUsers.slice(i, i + batchSize);
      
      for (const targetId of batch) {
        try {
          await ctx.telegram.sendMessage(targetId, broadcast.message, { parse_mode: 'Markdown' });
          sentCount++;
        } catch (error) {
          console.error(`Error sending broadcast to ${targetId}:`, error.message);
          errorCount++;
        }
      }
      
      // Progress update every 100 users
      if ((i + batchSize) % 100 === 0 || i + batchSize >= broadcast.targetUsers.length) {
        try {
          await ctx.reply(`🔄 Broadcast progress: ${sentCount + errorCount}/${broadcast.targetUsers.length} users processed`);
        } catch (error) {
          console.error('Error sending progress update:', error.message);
        }
      }
      
      // Delay between batches
      if (i + batchSize < broadcast.targetUsers.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Final report
    await ctx.reply(`✅ **Broadcast Complete**

**Results:**
• Sent: ${sentCount} users
• Failed: ${errorCount} users
• Total: ${broadcast.targetUsers.length} users

**Message:**
${broadcast.message}`, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Broadcast confirmation error:', error);
    
    // Clear any hanging state
    if (ctx.session) {
      ctx.session.awaitingBroadcastConfirmation = false;
      ctx.session.pendingBroadcast = null;
    }
    
    await ctx.reply('❌ Error processing broadcast. Please try again.');
  }
});

module.exports = admin;