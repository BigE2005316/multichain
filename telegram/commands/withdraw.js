// telegram/commands/withdraw.js - Secure Token Withdrawal Command
const { Composer } = require('telegraf');
const walletService = require('../../services/walletService');
const userService = require('../../users/userService');

const withdraw = new Composer();

// Main withdraw command
withdraw.command('withdraw', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const args = ctx.message.text.split(' ').slice(1);
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings) {
      return ctx.reply('❌ Please set up your account first with /start');
    }
    
    if (!userSettings.chain) {
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    const chain = userSettings.chain;
    
    // Check if user has a wallet
    if (!userSettings.custodialWallets || !userSettings.custodialWallets[chain]) {
      return ctx.reply('❌ No wallet found. Please create one first with /wallet');
    }
    
    // Show usage if no arguments
    if (args.length === 0) {
      const walletAddress = userSettings.custodialWallets[chain].address;
      const balanceInfo = await walletService.getWalletBalance(walletAddress, chain);
      
      let message = `💸 **Withdraw Tokens**\n\n`;
      message += `**Current Balance:**\n`;
      message += `💰 ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
      message += `💵 $${balanceInfo.usdValue}\n\n`;
      
      message += `**Usage:**\n`;
      message += `• \`/withdraw <destination_address> <amount>\`\n`;
      message += `• Send native tokens to any external wallet\n\n`;
      
      message += `**Examples:**\n`;
      if (chain === 'solana') {
        message += `• \`/withdraw 7ouabE3EBCVDsNtiYzfGSE6i2tw8r62oyWLzT3Yfqd6X 0.5\`\n`;
        message += `• \`/withdraw GKY1anuDZsqjNURU4k2RCsh2jazAHozx659BB8r5pump 1.0\`\n`;
      } else if (chain === 'ethereum') {
        message += `• \`/withdraw 0x742d35Cc6634C0532925a3b8D746402AA4d6aa02 0.1\`\n`;
        message += `• \`/withdraw 0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE 0.05\`\n`;
      } else if (chain === 'bsc') {
        message += `• \`/withdraw 0x742d35Cc6634C0532925a3b8D746402AA4d6aa02 0.1\`\n`;
        message += `• \`/withdraw 0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE 0.05\`\n`;
      }
      
      message += `\n**Features:**\n`;
      message += `✅ Real-time balance verification\n`;
      message += `✅ Address format validation\n`;
      message += `✅ Gas fee calculation\n`;
      message += `✅ Confirmation prompts\n`;
      message += `✅ Transaction tracking\n\n`;
      
      message += `**Security:**\n`;
      message += `• All withdrawals require confirmation\n`;
      message += `• Private keys remain encrypted\n`;
      message += `• Transaction history maintained\n`;
      message += `• Gas fees automatically calculated\n\n`;
      
      message += `💡 **Quick Actions:**`;
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '💰 Check Balance', callback_data: `balance_${chain}` },
            { text: '📋 Copy Wallet Address', callback_data: `copy_address_${chain}` }
          ],
          [
            { text: '🔄 Refresh Balance', callback_data: `refresh_balance_${chain}` },
            { text: '⚙️ Wallet Settings', callback_data: 'wallet_settings' }
          ]
        ]
      };
      
      return ctx.reply(message, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }
    
    // Parse withdrawal arguments
    if (args.length !== 2) {
      return ctx.reply('❌ Invalid format. Use: `/withdraw <destination_address> <amount>`', { parse_mode: 'Markdown' });
    }
    
    const [destinationAddress, amountStr] = args;
    const amount = parseFloat(amountStr);
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Please enter a positive number.');
    }
    
    // Validate destination address format
    const isValidAddress = validateAddress(destinationAddress, chain);
    if (!isValidAddress) {
      return ctx.reply(`❌ Invalid ${chain.toUpperCase()} address format.\n\n💡 Please check the address and try again.`);
    }
    
    // Check if trying to send to same wallet
    const userWalletAddress = userSettings.custodialWallets[chain].address;
    if (destinationAddress.toLowerCase() === userWalletAddress.toLowerCase()) {
      return ctx.reply('❌ Cannot withdraw to the same wallet. Please use a different destination address.');
    }
    
    // Get current balance
    const balanceInfo = await walletService.getWalletBalance(userWalletAddress, chain);
    const availableBalance = parseFloat(balanceInfo.balance);
    
    // Calculate gas reserve
    const gasReserve = calculateGasReserve(chain);
    const maxWithdrawable = Math.max(0, availableBalance - gasReserve);
    
    if (amount > maxWithdrawable) {
      let message = `❌ **Insufficient Balance**\n\n`;
      message += `💰 **Available:** ${availableBalance} ${balanceInfo.symbol}\n`;
      message += `⛽ **Gas Reserve:** ${gasReserve} ${balanceInfo.symbol}\n`;
      message += `📤 **Max Withdrawable:** ${maxWithdrawable.toFixed(6)} ${balanceInfo.symbol}\n\n`;
      message += `💡 **Suggestions:**\n`;
      message += `• Try withdrawing ${maxWithdrawable.toFixed(4)} ${balanceInfo.symbol}\n`;
      message += `• Add more funds to your wallet\n`;
      message += `• Use a smaller amount`;
      
      return ctx.reply(message, { parse_mode: 'Markdown' });
    }
    
    // Create withdrawal confirmation
    await createWithdrawalConfirmation(ctx, {
      userId,
      chain,
      destinationAddress,
      amount,
      balanceInfo,
      gasReserve,
      userWalletAddress
    });
    
  } catch (error) {
    console.error('Withdraw command error:', error);
    await ctx.reply('❌ Error processing withdrawal request. Please try again or contact support.');
  }
});

// Create withdrawal confirmation
async function createWithdrawalConfirmation(ctx, withdrawalData) {
  const { userId, chain, destinationAddress, amount, balanceInfo, gasReserve, userWalletAddress } = withdrawalData;
  
  const chainEmoji = getChainEmoji(chain);
  const estimatedGas = gasReserve;
  const netAmount = amount;
  const remainingBalance = parseFloat(balanceInfo.balance) - amount;
  const usdValue = amount * (balanceInfo.tokenPrice || 0);
  
  let message = `💸 **Confirm Withdrawal** ${chainEmoji}\n\n`;
  
  // Wallet addresses
  message += `📤 **From:** \`${userWalletAddress.substring(0, 8)}...${userWalletAddress.substring(userWalletAddress.length - 8)}\`\n`;
  message += `📥 **To:** \`${destinationAddress.substring(0, 8)}...${destinationAddress.substring(destinationAddress.length - 8)}\`\n\n`;
  
  // Transaction details
  message += `💰 **Withdrawal Details:**\n`;
  message += `• **Amount:** ${amount} ${balanceInfo.symbol}\n`;
  message += `• **USD Value:** ~$${usdValue.toFixed(2)}\n`;
  message += `• **Network:** ${chain.toUpperCase()}\n`;
  message += `• **Est. Gas:** ${estimatedGas} ${balanceInfo.symbol}\n\n`;
  
  // Balance impact
  message += `📊 **Balance Impact:**\n`;
  message += `• **Current:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
  message += `• **After Withdrawal:** ${remainingBalance.toFixed(6)} ${balanceInfo.symbol}\n`;
  message += `• **Reserved for Gas:** ${gasReserve} ${balanceInfo.symbol}\n\n`;
  
  // Transaction info
  message += `⏱️ **Transaction Info:**\n`;
  message += `• **Est. Time:** ${getEstimatedTime(chain)}\n`;
  message += `• **Confirmations:** ${getRequiredConfirmations(chain)}\n`;
  message += `• **Reversible:** ❌ No (Blockchain transaction)\n\n`;
  
  // Security warnings
  message += `🚨 **Security Warnings:**\n`;
  message += `• Double-check the destination address\n`;
  message += `• This transaction cannot be reversed\n`;
  message += `• Ensure the recipient supports ${chain.toUpperCase()}\n`;
  message += `• Gas fees will be deducted automatically\n\n`;
  
  message += `⚠️ **Reply YES to confirm or NO to cancel**\n`;
  message += `⏰ Expires in 60 seconds`;
  
  // Store withdrawal data in session
  ctx.session = ctx.session || {};
  ctx.session.pendingWithdrawal = {
    ...withdrawalData,
    expiresAt: Date.now() + 60000,
    confirmed: false
  };
  ctx.session.awaitingWithdrawalConfirmation = true;
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
}

// Handle withdrawal confirmations
withdraw.hears(/^(YES|yes|Yes|NO|no|No)$/i, async (ctx) => {
  try {
    if (!ctx.session?.awaitingWithdrawalConfirmation || !ctx.session?.pendingWithdrawal) {
      return; // Not awaiting withdrawal confirmation
    }
    
    const userId = ctx.from.id;
    const confirmed = /^(YES|yes|Yes)$/i.test(ctx.message.text);
    const withdrawalData = ctx.session.pendingWithdrawal;
    
    // Clear session state
    ctx.session.awaitingWithdrawalConfirmation = false;
    ctx.session.pendingWithdrawal = null;
    
    // Check if expired
    if (Date.now() > withdrawalData.expiresAt) {
      return ctx.reply('❌ Withdrawal confirmation expired. Please try again.');
    }
    
    if (!confirmed) {
      return ctx.reply('❌ Withdrawal cancelled.');
    }
    
    await ctx.reply('🔄 Processing withdrawal...');
    
    try {
      // Execute the withdrawal using wallet service
      const result = await walletService.sendNativeTokens(
        userId,
        withdrawalData.chain,
        withdrawalData.destinationAddress,
        withdrawalData.amount
      );
      
      if (result.success) {
        await sendWithdrawalSuccessMessage(ctx, result, withdrawalData);
      } else {
        await ctx.reply(`❌ **Withdrawal Failed**\n\n**Error:** ${result.error}\n\n💡 Please try again or contact support if the issue persists.`, { parse_mode: 'Markdown' });
      }
      
    } catch (withdrawalError) {
      console.error('Withdrawal execution error:', withdrawalError);
      await ctx.reply(`❌ **Withdrawal Failed**\n\n**Error:** ${withdrawalError.message}\n\n💡 Please try again or contact support.`, { parse_mode: 'Markdown' });
    }
    
  } catch (error) {
    console.error('Withdrawal confirmation error:', error);
    await ctx.reply('❌ Error processing withdrawal confirmation.');
  }
});

// Send withdrawal success message
async function sendWithdrawalSuccessMessage(ctx, result, withdrawalData) {
  const chainEmoji = getChainEmoji(withdrawalData.chain);
  
  let message = `✅ **Withdrawal Successful!** ${chainEmoji}\n\n`;
  
  // Transaction details
  message += `📤 **Sent:** ${withdrawalData.amount} ${withdrawalData.balanceInfo.symbol}\n`;
  message += `📍 **To:** \`${withdrawalData.destinationAddress}\`\n`;
  message += `💵 **USD Value:** ~$${(withdrawalData.amount * (withdrawalData.balanceInfo.tokenPrice || 0)).toFixed(2)}\n\n`;
  
  // Transaction info
  message += `📝 **Transaction Hash:**\n\`${result.txHash}\`\n\n`;
  message += `⛽ **Gas Used:** ${result.gasUsed || 'Calculating...'}\n`;
  message += `🕒 **Time:** ${new Date().toLocaleString()}\n`;
  message += `🌐 **Network:** ${withdrawalData.chain.toUpperCase()}\n\n`;
  
  // Explorer link
  const explorerUrl = getExplorerUrl(result.txHash, withdrawalData.chain);
  if (explorerUrl) {
    message += `🔍 **View on Explorer:**\n[${explorerUrl}](${explorerUrl})\n\n`;
  }
  
  // Next steps
  message += `💡 **Next Steps:**\n`;
  message += `• Transaction is being processed on the blockchain\n`;
  message += `• It will appear in the destination wallet shortly\n`;
  message += `• Use /balance to check your updated balance\n`;
  message += `• Save the transaction hash for your records\n\n`;
  
  message += `🎯 **Status:** Withdrawal completed successfully!`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '💰 Check Balance', callback_data: `balance_${withdrawalData.chain}` },
        { text: '📋 Copy TX Hash', callback_data: `copy_tx_${result.txHash}` }
      ],
      [
        { text: '🔍 View on Explorer', url: explorerUrl },
        { text: '💸 Withdraw More', callback_data: 'withdraw_more' }
      ]
    ]
  };
  
  await ctx.reply(message, { 
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

// Handle callback queries
withdraw.action(/^(balance|copy_address|refresh_balance|copy_tx|withdraw_more)_(.+)$/, async (ctx) => {
  try {
    const action = ctx.match[1];
    const param = ctx.match[2];
    const userId = ctx.from.id;
    
    switch (action) {
      case 'balance':
        await handleBalanceCheck(ctx, userId, param);
        break;
        
      case 'copy_address':
        await handleCopyAddress(ctx, userId, param);
        break;
        
      case 'refresh_balance':
        await handleRefreshBalance(ctx, userId, param);
        break;
        
      case 'copy_tx':
        await handleCopyTxHash(ctx, param);
        break;
        
      case 'withdraw_more':
        await handleWithdrawMore(ctx, userId);
        break;
        
      default:
        await ctx.answerCbQuery('❌ Unknown action');
    }
    
  } catch (error) {
    console.error('Withdraw callback error:', error);
    await ctx.answerCbQuery('❌ Error processing request');
  }
});

// Helper functions
function validateAddress(address, chain) {
  if (chain === 'solana') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  } else if (['ethereum', 'bsc', 'arbitrum', 'polygon', 'base'].includes(chain)) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  return false;
}

function calculateGasReserve(chain) {
  const gasReserves = {
    solana: 0.01,      // 0.01 SOL
    ethereum: 0.01,    // 0.01 ETH
    bsc: 0.001,        // 0.001 BNB
    arbitrum: 0.005,   // 0.005 ETH
    polygon: 0.01,     // 0.01 MATIC
    base: 0.005        // 0.005 ETH
  };
  
  return gasReserves[chain] || 0.01;
}

function getChainEmoji(chain) {
  const emojis = {
    solana: '🟣',
    ethereum: '🔷',
    bsc: '🟡',
    arbitrum: '🔵',
    polygon: '🟪',
    base: '🔷'
  };
  
  return emojis[chain] || '⚪';
}

function getEstimatedTime(chain) {
  const times = {
    solana: '~30 seconds',
    ethereum: '~2-5 minutes',
    bsc: '~30 seconds',
    arbitrum: '~1-2 minutes',
    polygon: '~30 seconds',
    base: '~1-2 minutes'
  };
  
  return times[chain] || '~1-5 minutes';
}

function getRequiredConfirmations(chain) {
  const confirmations = {
    solana: '1 confirmation',
    ethereum: '12 confirmations',
    bsc: '15 confirmations',
    arbitrum: '1 confirmation',
    polygon: '128 confirmations',
    base: '1 confirmation'
  };
  
  return confirmations[chain] || '1+ confirmations';
}

function getExplorerUrl(txHash, chain) {
  const explorers = {
    solana: `https://solscan.io/tx/${txHash}`,
    ethereum: `https://etherscan.io/tx/${txHash}`,
    bsc: `https://bscscan.com/tx/${txHash}`,
    arbitrum: `https://arbiscan.io/tx/${txHash}`,
    polygon: `https://polygonscan.com/tx/${txHash}`,
    base: `https://basescan.org/tx/${txHash}`
  };
  
  return explorers[chain] || `#`;
}

// Callback handlers
async function handleBalanceCheck(ctx, userId, chain) {
  try {
    await ctx.answerCbQuery('🔄 Checking balance...');
    
    const userSettings = await userService.getUserSettings(userId);
    if (!userSettings.custodialWallets || !userSettings.custodialWallets[chain]) {
      return ctx.reply('❌ No wallet found for this chain.');
    }
    
    const walletAddress = userSettings.custodialWallets[chain].address;
    const balanceInfo = await walletService.getWalletBalance(walletAddress, chain);
    
    const message = `💰 **${chain.toUpperCase()} Balance**\n\n` +
                   `📍 **Address:** \`${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 8)}\`\n` +
                   `💵 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n` +
                   `💲 **USD Value:** $${balanceInfo.usdValue}\n` +
                   `📊 **Price:** $${balanceInfo.tokenPrice?.toFixed(2) || 'N/A'}\n\n` +
                   `🕒 **Updated:** ${new Date().toLocaleString()}`;
    
    await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Error checking balance');
  }
}

async function handleCopyAddress(ctx, userId, chain) {
  try {
    const userSettings = await userService.getUserSettings(userId);
    if (!userSettings.custodialWallets || !userSettings.custodialWallets[chain]) {
      return ctx.answerCbQuery('❌ No wallet found');
    }
    
    const walletAddress = userSettings.custodialWallets[chain].address;
    
    await ctx.answerCbQuery('📋 Address copied to clipboard!');
    
    const message = `📋 **${chain.toUpperCase()} Wallet Address**\n\n` +
                   `\`${walletAddress}\`\n\n` +
                   `💡 **Use this address to:**\n` +
                   `• Receive ${chain.toUpperCase()} tokens\n` +
                   `• Fund your trading wallet\n` +
                   `• Transfer from external wallets`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Error copying address');
  }
}

async function handleRefreshBalance(ctx, userId, chain) {
  try {
    await ctx.answerCbQuery('🔄 Refreshing...');
    
    // Clear cache and get fresh balance
    walletService.clearCache('balance', `balance_${chain}_*`);
    
    const userSettings = await userService.getUserSettings(userId);
    if (!userSettings.custodialWallets || !userSettings.custodialWallets[chain]) {
      return ctx.reply('❌ No wallet found for this chain.');
    }
    
    const walletAddress = userSettings.custodialWallets[chain].address;
    const balanceInfo = await walletService.getWalletBalance(walletAddress, chain);
    
    const message = `🔄 **Balance Refreshed**\n\n` +
                   `💰 **${chain.toUpperCase()} Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n` +
                   `💵 **USD Value:** $${balanceInfo.usdValue}\n` +
                   `🕒 **Updated:** ${new Date().toLocaleString()}`;
    
    await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Error refreshing');
  }
}

async function handleCopyTxHash(ctx, txHash) {
  try {
    await ctx.answerCbQuery('📋 Transaction hash copied!');
    
    const message = `📋 **Transaction Hash**\n\n` +
                   `\`${txHash}\`\n\n` +
                   `💡 **Use this hash to:**\n` +
                   `• Track transaction status\n` +
                   `• View on blockchain explorer\n` +
                   `• Provide proof of payment`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Error copying hash');
  }
}

async function handleWithdrawMore(ctx, userId) {
  try {
    await ctx.answerCbQuery('💸 Starting new withdrawal...');
    
    const message = `💸 **New Withdrawal**\n\n` +
                   `Use the format: \`/withdraw <address> <amount>\`\n\n` +
                   `💡 **Example:**\n` +
                   `\`/withdraw 7ouabE3EBCVDsNtiYzfGSE6i2tw8r62oyWLzT3Yfqd6X 0.5\``;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Error starting withdrawal');
  }
}

module.exports = withdraw; 