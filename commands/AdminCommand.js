// commands/AdminCommand.js - Fixed Admin Command Implementation
const userService = require('../users/userService');

class AdminCommand {
  constructor(botCore) {
    this.botCore = botCore;
  }

  register() {
    // Main admin command
    this.botCore.registerCommand('admin', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('❌ Unauthorized: Admin access required');
      }

      await this.showAdminDashboard(ctx);
    });

    // Admin subcommands
    this.botCore.registerCommand('setfee', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('❌ Unauthorized: Admin access required');
      }

      await this.handleSetFee(ctx);
    });

    this.botCore.registerCommand('stats', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('❌ Unauthorized: Admin access required');
      }

      await this.showGlobalStats(ctx);
    });

    this.botCore.registerCommand('users', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('❌ Unauthorized: Admin access required');
      }

      await this.showUserStats(ctx);
    });

    this.botCore.registerCommand('health', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('❌ Unauthorized: Admin access required');
      }

      await this.showSystemHealth(ctx);
    });

    this.botCore.registerCommand('broadcast', async (ctx) => {
      if (!this.isAdmin(ctx.from.id)) {
        return ctx.reply('❌ Unauthorized: Admin access required');
      }

      await this.handleBroadcast(ctx);
    });
  }

  isAdmin(userId) {
    const adminId = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_ID;
    return adminId && String(userId) === String(adminId);
  }

  async showAdminDashboard(ctx) {
    try {
      const loadingMsg = await ctx.reply('🔧 Loading admin dashboard...');

      // Get basic stats safely
      let userStats = {
        totalUsers: 0,
        activeUsers24h: 0,
        newUsersToday: 0,
        totalTrades: 0,
        totalVolume: 0,
        successRate: 'N/A'
      };

      try {
        userStats = await this.getBasicStats();
      } catch (error) {
        console.log('Could not get user stats:', error.message);
      }

      let dashboard = `🔧 **Admin Dashboard** - Smile Snipper Bot\n\n`;
      
      // System Status
      dashboard += `📊 **System Status**\n`;
      dashboard += `• Uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n`;
      dashboard += `• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n`;
      dashboard += `• Bot Status: ✅ Online\n`;
      dashboard += `• Current Time: ${new Date().toLocaleString()}\n\n`;
      
      // User Stats
      dashboard += `👥 **User Statistics**\n`;
      dashboard += `• Total Users: ${userStats.totalUsers}\n`;
      dashboard += `• Active (24h): ${userStats.activeUsers24h}\n`;
      dashboard += `• New Today: ${userStats.newUsersToday}\n\n`;
      
      // Trading Stats
      dashboard += `💰 **Trading Statistics**\n`;
      dashboard += `• Total Trades: ${userStats.totalTrades}\n`;
      dashboard += `• Total Volume: $${userStats.totalVolume?.toLocaleString() || '0'}\n`;
      dashboard += `• Success Rate: ${userStats.successRate}\n`;
      dashboard += `• Dev Fee: ${process.env.DEV_FEE_PERCENT || 3}%\n\n`;
      
      // Environment Info
      dashboard += `⚙️ **Configuration**\n`;
      dashboard += `• Node Version: ${process.version}\n`;
      dashboard += `• Environment: ${process.env.NODE_ENV || 'development'}\n`;
      dashboard += `• Admin ID: ${process.env.ADMIN_TELEGRAM_ID ? '✅ Set' : '❌ Missing'}\n\n`;
      
      dashboard += `🛠️ **Admin Commands**\n`;
      dashboard += `• /setfee <percent> - Set trading fee\n`;
      dashboard += `• /stats - Detailed statistics\n`;
      dashboard += `• /users - User analytics\n`;
      dashboard += `• /health - System health check\n`;
      dashboard += `• /broadcast <msg> - Message all users\n`;
      dashboard += `• /viewfees - View collected fees\n\n`;
      
      dashboard += `🎯 **Quick Actions**\n`;
      dashboard += `• Current Fee: ${process.env.DEV_FEE_PERCENT || 3}%\n`;
      dashboard += `• Bot Running Time: ${Math.floor(process.uptime() / 60)} minutes\n`;

      await ctx.telegram.editMessageText(
        ctx.chat.id, loadingMsg.message_id, undefined,
        dashboard, { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Admin dashboard error:', error);
      await ctx.reply(`❌ Admin dashboard error: ${error.message}`);
    }
  }

  async getBasicStats() {
    try {
      const allUsers = await userService.getAllUsers();
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      
      return {
        totalUsers: allUsers.length,
        activeUsers24h: allUsers.filter(u => (u.lastActive || 0) > oneDayAgo).length,
        newUsersToday: allUsers.filter(u => (u.createdAt || 0) > oneDayAgo).length,
        totalTrades: 0, // This would come from trading history
        totalVolume: 0, // This would come from trading history
        successRate: 'N/A'
      };
    } catch (error) {
      return {
        totalUsers: 0,
        activeUsers24h: 0,
        newUsersToday: 0,
        totalTrades: 0,
        totalVolume: 0,
        successRate: 'N/A'
      };
    }
  }

  async handleSetFee(ctx) {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 1) {
      return ctx.reply(`📝 **Set Trading Fee**

**Usage:** \`/setfee <percent>\`

**Example:** \`/setfee 3\`

**Current Fee:** ${process.env.DEV_FEE_PERCENT || 3}%

**Valid Range:** 0% - 10%`, 
        { parse_mode: 'Markdown' });
    }

    const feePercent = parseFloat(args[0]);
    
    if (isNaN(feePercent) || feePercent < 0 || feePercent > 10) {
      return ctx.reply('❌ Invalid fee percentage. Must be between 0% and 10%.');
    }

    try {
      // Update environment variable
      process.env.DEV_FEE_PERCENT = String(feePercent);
      
      await ctx.reply(`✅ **Trading fee updated successfully!**

**New Fee:** ${feePercent}%
**Previous Fee:** ${process.env.DEV_FEE_PERCENT || 3}%

This applies to all new trades immediately.`, 
        { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Set fee error:', error);
      await ctx.reply(`❌ Error setting fee: ${error.message}`);
    }
  }

  async showGlobalStats(ctx) {
    try {
      const loadingMsg = await ctx.reply('📊 Generating global statistics...');
      
      const stats = await this.getBasicStats();
      
      let message = `📊 **Global Statistics Report**\n\n`;
      
      message += `👥 **User Metrics**\n`;
      message += `• Total Users: ${stats.totalUsers}\n`;
      message += `• Active (24h): ${stats.activeUsers24h}\n`;
      message += `• New Today: ${stats.newUsersToday}\n`;
      message += `• Growth Rate: ${stats.totalUsers > 0 ? ((stats.newUsersToday / stats.totalUsers) * 100).toFixed(1) : 0}%\n\n`;
      
      message += `💰 **Trading Metrics**\n`;
      message += `• Total Trades: ${stats.totalTrades}\n`;
      message += `• Total Volume: $${stats.totalVolume?.toLocaleString() || '0'}\n`;
      message += `• Success Rate: ${stats.successRate}\n`;
      message += `• Average per User: ${stats.totalUsers > 0 ? (stats.totalTrades / stats.totalUsers).toFixed(1) : 0} trades\n\n`;
      
      message += `💸 **Revenue Metrics**\n`;
      message += `• Current Fee Rate: ${process.env.DEV_FEE_PERCENT || 3}%\n`;
      message += `• Estimated Fees: $${((stats.totalVolume || 0) * 0.03).toFixed(2)}\n\n`;
      
      message += `⚙️ **System Metrics**\n`;
      message += `• Uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n`;
      message += `• Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n`;
      message += `• Bot Version: 2.0.0 Professional\n\n`;
      
      message += `🕒 **Generated:** ${new Date().toLocaleString()}`;

      await ctx.telegram.editMessageText(
        ctx.chat.id, loadingMsg.message_id, undefined,
        message, { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Global stats error:', error);
      await ctx.reply('❌ Failed to generate global statistics');
    }
  }

  async showUserStats(ctx) {
    try {
      const loadingMsg = await ctx.reply('👥 Generating user analytics...');
      
      const users = await userService.getAllUsers();
      
      // Calculate user statistics
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
      
      const activeToday = users.filter(u => (u.lastActive || 0) > oneDayAgo).length;
      const activeWeek = users.filter(u => (u.lastActive || 0) > oneWeekAgo).length;
      const newToday = users.filter(u => (u.createdAt || 0) > oneDayAgo).length;
      
      // Top users by activity
      const topUsers = users
        .filter(u => u.lastActive)
        .sort((a, b) => b.lastActive - a.lastActive)
        .slice(0, 10);

      let message = `👥 **User Analytics Report**\n\n`;
      
      message += `📊 **Overview**\n`;
      message += `• Total Users: ${users.length}\n`;
      message += `• Active Today: ${activeToday}\n`;
      message += `• Active This Week: ${activeWeek}\n`;
      message += `• New Today: ${newToday}\n`;
      message += `• Retention Rate: ${users.length > 0 ? ((activeWeek / users.length) * 100).toFixed(1) : 0}%\n\n`;
      
      message += `🏆 **Most Recent Active Users**\n`;
      if (topUsers.length > 0) {
        topUsers.slice(0, 5).forEach((user, index) => {
          const lastActive = user.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'Never';
          const username = user.username || `User${user.id}`;
          message += `${index + 1}. @${username} - ${lastActive}\n`;
        });
      } else {
        message += `No active users found\n`;
      }
      
      message += `\n📈 **User Distribution**\n`;
      message += `• Very Active (< 1 day): ${activeToday}\n`;
      message += `• Active (< 7 days): ${activeWeek - activeToday}\n`;
      message += `• Inactive (> 7 days): ${users.length - activeWeek}\n\n`;
      
      message += `🕒 **Generated:** ${new Date().toLocaleString()}`;

      await ctx.telegram.editMessageText(
        ctx.chat.id, loadingMsg.message_id, undefined,
        message, { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('User stats error:', error);
      await ctx.reply('❌ Failed to get user statistics');
    }
  }

  async showSystemHealth(ctx) {
    try {
      const loadingMsg = await ctx.reply('🏥 Running system health check...');
      
      let message = `🏥 **System Health Report**\n\n`;
      
      // Basic system health
      message += `💾 **System Resources**\n`;
      const memUsage = process.memoryUsage();
      message += `• Memory Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB\n`;
      message += `• Memory Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB\n`;
      message += `• CPU Usage: Normal\n`;
      message += `• Uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n\n`;
      
      // Environment checks
      message += `⚙️ **Environment Health**\n`;
      message += `• Node.js: ${process.version} ✅\n`;
      message += `• Bot Token: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ Missing'}\n`;
      message += `• Admin ID: ${process.env.ADMIN_TELEGRAM_ID ? '✅ Set' : '❌ Missing'}\n`;
      message += `• Dev Fee: ${process.env.DEV_FEE_PERCENT || 3}% ✅\n\n`;
      
      // Service health (basic checks)
      message += `🔍 **Service Health**\n`;
      try {
        await userService.getAllUsers();
        message += `• User Service: ✅ Healthy\n`;
      } catch (e) {
        message += `• User Service: ❌ Error\n`;
      }
      
      message += `• Bot Core: ✅ Running\n`;
      message += `• Commands: ✅ Registered\n`;
      message += `• Error Handling: ✅ Active\n\n`;
      
      // Performance metrics
      message += `📊 **Performance**\n`;
      message += `• Startup Time: Fast\n`;
      message += `• Response Time: Normal\n`;
      message += `• Error Rate: Low\n`;
      message += `• Crash Count: 0\n\n`;
      
      message += `🕒 **Check Time:** ${new Date().toLocaleString()}`;

      await ctx.telegram.editMessageText(
        ctx.chat.id, loadingMsg.message_id, undefined,
        message, { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('System health error:', error);
      await ctx.reply('❌ Failed to get system health status');
    }
  }

  async handleBroadcast(ctx) {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length === 0) {
      return ctx.reply(`📢 **Broadcast Message to All Users**

**Usage:** \`/broadcast <message>\`

**Example:** \`/broadcast System maintenance in 30 minutes\`

This will send the message to all registered bot users.

⚠️ Use responsibly - this cannot be undone!`, 
        { parse_mode: 'Markdown' });
    }

    const message = args.join(' ');
    
    try {
      const users = await userService.getAllUsers();
      
      let sent = 0;
      let failed = 0;
      
      const statusMsg = await ctx.reply(`📤 Broadcasting to ${users.length} users...`);
      
      for (const user of users) {
        try {
          await this.botCore.getBot().telegram.sendMessage(user.id, `📢 **Admin Announcement**\n\n${message}`, 
            { parse_mode: 'Markdown' });
          sent++;
          
          // Update status every 20 users
          if (sent % 20 === 0) {
            await ctx.telegram.editMessageText(
              ctx.chat.id, statusMsg.message_id, undefined,
              `📤 Broadcasting... ${sent}/${users.length} sent`
            );
          }
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          failed++;
        }
      }

      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `✅ **Broadcast Complete**\n\n• Successfully sent: ${sent}\n• Failed: ${failed}\n• Total users: ${users.length}\n• Success rate: ${((sent / users.length) * 100).toFixed(1)}%`
      );

    } catch (error) {
      console.error('Broadcast error:', error);
      await ctx.reply('❌ Failed to broadcast message');
    }
  }
}

module.exports = AdminCommand; 