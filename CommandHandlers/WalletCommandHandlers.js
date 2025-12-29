const walletService = require('../services/walletService');
const userService = require('../users/userService');

class WalletCommandHandlers {
  constructor() {
    this.name = 'WalletCommandHandlers';
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
    return symbols[chain] || 'TOKEN';
  }

  // Register all wallet-related handlers
  registerHandlers(botCore) {
    // Main Wallet menu handler
    botCore.registerCallbackHandler('wallet', async (ctx) => {
      try {
        console.log('/wallet command processing for user:', ctx.from.id);
        const userId = ctx.from.id;
        await userService.updateLastActive(userId);
        
        const userSettings = await userService.getUserSettings(userId);
        
        if (!userSettings.chain) {
          return ctx.reply('⚠️ Please set your chain first using /setchain command.');
        }
        
        const chain = userSettings.chain;
        
        try {
          // Get all wallets for the chain
          let wallets = [];
          if (userSettings.custodialWallets && userSettings.custodialWallets[chain]) {
            if (Array.isArray(userSettings.custodialWallets[chain])) {
              wallets = userSettings.custodialWallets[chain];
            } else {
              // Handle legacy single wallet format - convert to array
              const legacyWallet = userSettings.custodialWallets[chain];
              wallets = [{
                ...legacyWallet,
                isDefault: true,
                name: 'Main Wallet'
              }];
              
              // Update to new format
              userSettings.custodialWallets[chain] = wallets;
              await userService.saveUserData(userId, userSettings);
            }
          }
          
          if (wallets.length === 0) {
            // Create first wallet
            const result = await walletService.getOrCreateWallet(userId, chain);
            
            let message = `💼 **Your ${chain.toUpperCase()} Wallet**\n\n`;
            message += `📍 **Address:**\n\`${result.address}\`\n\n`;
            message += `💰 **Balance:** ${result.balance} ${result.symbol}\n`;
            message += `💵 **USD Value:** $${result.usdValue}\n`;
            message += `\n🔄 **Status:** ${result.exists ? 'Existing wallet loaded' : 'New wallet created'}\n`;
            
            const keyboard = {
              inline_keyboard: [
                [
                  { text: '💰 Check Balance', callback_data: `balance_${chain}_0` },
                  { text: '📤 Export Wallet', callback_data: `exportwallet_${chain}_0` }
                ],
                [
                  { text: '➕ Create New Wallet', callback_data: 'create_wallet_ui' },
                  { text: '🔄 Refresh', callback_data: `wallet_refresh_${chain}` }
                ],
                [
                  { text: '🔐 Import Wallet', callback_data: 'import_wallet' },
                  { text: '📋 List All Wallets', callback_data: 'list_all_wallets' }
                ],
                [
                  { text: '💸 Start Trading', callback_data: 'start_trading' }
                ]
              ]
            };
            
            await ctx.editMessageText(message, {
              parse_mode: 'Markdown',
              reply_markup: keyboard
            });
          } else {
            // Show wallet selection if multiple wallets
            let message = `💼 **Your ${chain.toUpperCase()} Wallets (${wallets.length})**\n\n`;
            
            let totalValue = 0;
            for (let i = 0; i < wallets.length; i++) {
              const wallet = wallets[i];
              try {
                const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
                const defaultTag = wallet.isDefault ? ' 🌟' : '';
                
                message += `**${wallet.name || `Wallet ${i + 1}`}**${defaultTag}\n`;
                message += `📍 \`${wallet.address.substring(0, 8)}...${wallet.address.substring(wallet.address.length - 8)}\`\n`;
                message += `💰 ${balanceInfo.balance} ${balanceInfo.symbol} (~$${balanceInfo.usdValue})\n\n`;
                
                totalValue += parseFloat(balanceInfo.usdValue) || 0;
              } catch (balanceError) {
                console.warn(`Error getting balance for wallet ${i}:`, balanceError);
                const defaultTag = wallet.isDefault ? ' 🌟' : '';
                message += `**${wallet.name || `Wallet ${i + 1}`}**${defaultTag}\n`;
                message += `📍 \`${wallet.address.substring(0, 8)}...${wallet.address.substring(wallet.address.length - 8)}\`\n`;
                message += `💰 Balance unavailable\n\n`;
              }
            }
            
            message += `💎 **Total Portfolio Value:** ~$${totalValue.toFixed(2)}\n\n`;
            message += `Select a wallet to manage:`;
            
            const keyboard = {
              inline_keyboard: [
                [
                  { text: '➕ Create New Wallet', callback_data: 'create_wallet_ui' },
                  { text: '🔄 Refresh All', callback_data: `wallet_refresh_${chain}` }
                ],
                [
                  { text: '🔐 Import Wallet', callback_data: 'import_wallet' },
                  { text: '📋 List All Wallets', callback_data: 'list_all_wallets' }
                ],
                ...wallets.map((wallet, index) => [
                  { text: `${wallet.isDefault ? '🌟 ' : ''}${wallet.name || `Wallet ${index + 1}`}`, callback_data: `select_wallet_${chain}_${index}` }
                ]),
                [
                  { text: '💸 Start Trading', callback_data: 'start_trading' }
                ]
              ]
            };
            
            await ctx.editMessageText(message, {
              parse_mode: 'Markdown',
              reply_markup: keyboard
            });
          }
        } catch (error) {
          console.error('Wallet command error:', error);
          await ctx.editMessageText('❌ Error retrieving wallet information. Please try again.');
        }
        
      } catch (error) {
        console.error('Wallet command error:', error);
        await ctx.reply('❌ Error retrieving wallet information. Please try again or contact support.');
      }
    });

    // Get Wallet handler (for backward compatibility)
    botCore.registerCallbackHandler('get_wallet', async (ctx) => {
      console.log('/get_wallet callback invoked');
      const userSettings = await userService.getUserSettings(ctx.from.id);
      const chain = userSettings?.chain || 'solana';

      try {
        const wallet = await walletService.getOrCreateWallet(ctx.from.id, chain);

        let message = `💼 **Your ${chain.toUpperCase()} Wallet**\n\n`;
        message += `📍 **Address:**\n\`${wallet.address}\`\n\n`;

        // Get balance
        try {
          const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
          message += `💰 **Balance:** ${balanceInfo.balance} ${this.getChainSymbol(chain)}\n\n`;
        } catch (balanceError) {
          message += `💰 **Balance:** Unable to fetch\n\n`;
        }

        message += `🔐 **Security:** AES-256 encrypted\n`;
        message += `⚡ **Status:** Ready for trading\n\n`;
        message += `**Next Steps:**\n`;
        message += `• Send funds to address above\n`;
        message += `• Use /balance to check balance\n`;
        message += `• Use /buy to start trading`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: '💰 Check Balance', callback_data: 'wallet_balance' },
              { text: '📤 Export Wallet', callback_data: 'export_wallet' }
            ],
            [
              { text: '⬅️ Back to Wallet Menu', callback_data: 'wallet' }
            ]
          ]
        };

        await ctx.editMessageText(message, { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        });
      } catch (error) {
        console.error('Get wallet error:', error);
        await ctx.editMessageText('❌ Failed to get wallet information. Please try again.');
      }
    });

    // Create Wallet handler (legacy single wallet creation)
    botCore.registerCallbackHandler('create_wallet', async (ctx) => {
      const userSettings = await userService.getUserSettings(ctx.from.id);
      const chain = userSettings?.chain || 'solana';
      
      try {
        await ctx.answerCbQuery('🔄 Creating wallet...');
        
        const wallet = await walletService.getOrCreateWallet(ctx.from.id, chain);
        
        let message = `🆕 **${chain.toUpperCase()} Wallet Created!**\n\n`;
        message += `📍 **Address:** \`${wallet.address}\`\n`;
        message += `💰 **Balance:** ${wallet.balance} ${wallet.symbol}\n`;
        message += `🔐 **Status:** Ready for trading`;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '💰 Check Balance', callback_data: 'wallet_balance' },
              { text: '📤 Export Wallet', callback_data: 'export_wallet' }
            ],
            [
              { text: '⬅️ Back to Wallet Menu', callback_data: 'wallet' }
            ]
          ]
        };
        
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('Create wallet error:', error);
        await ctx.answerCbQuery('❌ Error creating wallet');
        await ctx.editMessageText('❌ Failed to create wallet. Please try again.');
      }
    });

    // Create new wallet UI flow
    botCore.registerCallbackHandler('create_wallet_ui', async (ctx) => {
      const userId = ctx.from.id;
      
      try {
        await ctx.answerCbQuery('➕ Creating new wallet...');
        
        const userSettings = await userService.getUserSettings(userId);
        const chain = userSettings?.chain || 'solana';
        
        // Show naming prompt first
        await ctx.editMessageText(
          `🆕 **Creating New ${chain.toUpperCase()} Wallet**\n\n` +
          `Please provide a name for your new wallet or click Skip to use default name:`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⏭️ Skip (Use Default Name)', callback_data: `create_wallet_default_${chain}` }],
                [{ text: '✍️ Enter Custom Name', callback_data: `create_wallet_custom_${chain}` }],
                [{ text: '⬅️ Back to Wallet Menu', callback_data: 'wallet' }]
              ]
            }
          }
        );
        
      } catch (error) {
        console.error('Create wallet UI error:', error);
        await ctx.answerCbQuery('❌ Error creating wallet');
        await ctx.editMessageText('❌ Error creating new wallet. Please try again.');
      }
    });

    // Create wallet with default name
    botCore.registerCallbackHandler(/^create_wallet_default_(.+)$/, async (ctx) => {
      const chain = ctx.match[1];
      const userId = ctx.from.id;
      
      try {
        await ctx.answerCbQuery('🔄 Creating wallet...');
        
        // Get existing wallets to generate appropriate name
        const userData = await userService.getUserSettings(userId);
        let walletCount = 0;
        
        if (userData.custodialWallets && userData.custodialWallets[chain]) {
          if (Array.isArray(userData.custodialWallets[chain])) {
            walletCount = userData.custodialWallets[chain].length;
          } else {
            walletCount = 1; // Legacy single wallet
          }
        }
        
        const defaultName = `Wallet ${walletCount + 1}`;
        const newWallet = await walletService.createNewWallet(userId, chain, defaultName);
        
        let message = `✅ **New ${chain.toUpperCase()} Wallet Created!**\n\n`;
        message += `📍 **Address:** \`${newWallet.address.substring(0, 8)}...${newWallet.address.substring(newWallet.address.length - 8)}\`\n`;
        message += `🏷️ **Name:** ${defaultName}\n`;
        message += `📅 **Created:** ${new Date().toLocaleString()}\n\n`;
        message += `Your new wallet is ready for use!`;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: `💰 Check Balance`, callback_data: `balance_${chain}_${newWallet.walletIndex}` },
              { text: `📤 Export Wallet`, callback_data: `exportwallet_${chain}_${newWallet.walletIndex}` }
            ],
            [
              { text: '🌟 Set as Default', callback_data: `set_default_${chain}_${newWallet.walletIndex}` }
            ],
            [
              { text: '⬅️ Back to Wallets', callback_data: 'wallet' }
            ]
          ]
        };
        
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('Create default wallet error:', error);
        await ctx.answerCbQuery('❌ Error creating wallet');
        await ctx.editMessageText('❌ Error creating new wallet. Please try again.');
      }
    });

    // Create wallet with custom name - prompt for input
    botCore.registerCallbackHandler(/^create_wallet_custom_(.+)$/, async (ctx) => {
      const chain = ctx.match[1];
      
      ctx.session = ctx.session || {};
      ctx.session.awaitingWalletName = true;
      ctx.session.walletCreationChain = chain;
      ctx.session.activeTextHandler = 'awaitingWalletName';
      
      await ctx.editMessageText(
        `✍️ **Custom Wallet Name**\n\n` +
        `Please enter a name for your new ${chain.toUpperCase()} wallet:\n\n` +
        `**Examples:**\n` +
        `• "Trading Wallet"\n` +
        `• "DeFi Portfolio"\n` +
        `• "Main SOL Wallet"\n\n` +
        `Type your wallet name below:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel', callback_data: 'wallet' }]
            ]
          }
        }
      );
      
      await ctx.answerCbQuery();
    });

    // Register text handler for wallet naming
    botCore.registerTextHandler('awaitingWalletName', async (ctx) => {
      ctx.session = ctx.session || {};
      const walletName = ctx.message.text.trim();
      const chain = ctx.session.walletCreationChain;
      const userId = ctx.from.id;

      if (!walletName || walletName.length < 1) {
        await ctx.reply('❌ Invalid wallet name. Please enter a valid name or use /cancel.');
        return;
      }

      if (walletName.length > 50) {
        await ctx.reply('❌ Wallet name too long. Please use 50 characters or less.');
        return;
      }

      try {
        const newWallet = await walletService.createNewWallet(userId, chain, walletName);
        
        let message = `✅ **New ${chain.toUpperCase()} Wallet Created!**\n\n`;
        message += `📍 **Address:** \`${newWallet.address.substring(0, 8)}...${newWallet.address.substring(newWallet.address.length - 8)}\`\n`;
        message += `🏷️ **Name:** ${walletName}\n`;
        message += `📅 **Created:** ${new Date().toLocaleString()}\n\n`;
        message += `Your new wallet "${walletName}" is ready for use!`;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: `💰 Check Balance`, callback_data: `balance_${chain}_${newWallet.walletIndex}` },
              { text: `📤 Export Wallet`, callback_data: `exportwallet_${chain}_${newWallet.walletIndex}` }
            ],
            [
              { text: '🌟 Set as Default', callback_data: `set_default_${chain}_${newWallet.walletIndex}` }
            ],
            [
              { text: '⬅️ Back to Wallets', callback_data: 'wallet' }
            ]
          ]
        };
        
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('Create custom wallet error:', error);
        await ctx.reply('❌ Error creating wallet. Please try again.');
      }

      // Clear session
      ctx.session.awaitingWalletName = false;
      ctx.session.walletCreationChain = null;
      ctx.session.activeTextHandler = null;
    });

    // Rename wallet handler
botCore.registerCallbackHandler(/^rename_wallet_(.+)_(\d+)$/, async (ctx) => {
  const chain = ctx.match[1];
  const walletIndex = parseInt(ctx.match[2]);
  
  ctx.session = ctx.session || {};
  ctx.session.awaitingWalletRename = true;
  ctx.session.renameChain = chain;
  ctx.session.renameIndex = walletIndex;
  ctx.session.activeTextHandler = 'awaitingWalletRename';
  
  await ctx.editMessageText(
    `🏷️ **Rename Wallet**\n\n` +
    `Enter a new name for your ${chain.toUpperCase()} wallet:\n\n` +
    `**Examples:**\n` +
    `• "Trading Wallet"\n` +
    `• "DeFi Portfolio"\n` +
    `• "HODLing Account"\n` +
    `• "NFT Collection"\n\n` +
    `Type your new wallet name below:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel Rename', callback_data: `select_wallet_${chain}_${walletIndex}` }]
        ]
      }
    }
  );
  
  await ctx.answerCbQuery('🏷️ Ready to rename wallet');
});

// Register text handler for wallet renaming
botCore.registerTextHandler('awaitingWalletRename', async (ctx) => {
  ctx.session = ctx.session || {};
  const newName = ctx.message.text.trim();
  const chain = ctx.session.renameChain;
  const walletIndex = ctx.session.renameIndex;
  const userId = ctx.from.id;

  if (!newName || newName.length < 1) {
    await ctx.reply('❌ Invalid name. Please enter a valid wallet name.');
    return;
  }

  if (newName.length > 50) {
    await ctx.reply('❌ Name too long. Please use 50 characters or less.');
    return;
  }

  try {
    await walletService.renameWallet(userId, chain, walletIndex, newName);
    
    const wallet = await walletService.getWalletByIndex(userId, chain, walletIndex);
    const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
    
    let message = `✅ **Wallet Renamed Successfully!**\n\n`;
    message += `🏷️ **New Name:** ${newName}\n`;
    message += `⛓️ **Chain:** ${chain.toUpperCase()}\n`;
    message += `📍 **Address:** \`${wallet.address.substring(0, 8)}...${wallet.address.substring(wallet.address.length - 8)}\`\n`;
    message += `💰 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
    message += `📅 **Renamed:** ${new Date().toLocaleString()}`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '💰 Check Balance', callback_data: `balance_${chain}_${walletIndex}` },
          { text: '📤 Export Wallet', callback_data: `exportwallet_${chain}_${walletIndex}` }
        ],
        [
          { text: '⬅️ Back to Wallet', callback_data: `select_wallet_${chain}_${walletIndex}` }
        ]
      ]
    };
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Rename wallet error:', error);
    await ctx.reply('❌ Error renaming wallet. Please try again.');
  }

  // Clear session
  ctx.session.awaitingWalletRename = false;
  ctx.session.renameChain = null;
  ctx.session.renameIndex = null;
  ctx.session.activeTextHandler = null;
});

    // List all wallets callback handler
    botCore.registerCallbackHandler('list_all_wallets', async (ctx) => {
      const userId = ctx.from.id;
      
      try {
        await ctx.answerCbQuery('📋 Loading all wallets...');
        
        const userSettings = await userService.getUserSettings(userId);
        const chain = userSettings?.chain || 'solana';
        
        let wallets = [];
        if (userSettings.custodialWallets && userSettings.custodialWallets[chain]) {
          if (Array.isArray(userSettings.custodialWallets[chain])) {
            wallets = userSettings.custodialWallets[chain];
          } else {
            // Handle legacy format
            wallets = [{
              ...userSettings.custodialWallets[chain],
              isDefault: true,
              name: 'Main Wallet'
            }];
          }
        }
        
        if (wallets.length === 0) {
          await ctx.editMessageText(
            `📭 **No Wallets Found**\n\n` +
            `You don't have any ${chain.toUpperCase()} wallets yet.\n\n` +
            `Click "Create Wallet" to get started!`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '➕ Create First Wallet', callback_data: 'create_wallet_ui' }],
                  [{ text: '⬅️ Back to Menu', callback_data: 'wallet' }]
                ]
              }
            }
          );
          return;
        }
        
        let message = `📋 **All ${chain.toUpperCase()} Wallets (${wallets.length})**\n\n`;
        let totalValue = 0;
        
        // Show summary of all wallets
        for (let i = 0; i < wallets.length; i++) {
          const wallet = wallets[i];
          
          try {
            const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
            const defaultTag = wallet.isDefault ? ' 🌟' : '';
            const importedTag = wallet.imported ? ' 📥' : '';
            
            message += `**${i + 1}. ${wallet.name || `Wallet ${i + 1}`}**${defaultTag}${importedTag}\n`;
            message += `📍 \`${wallet.address.substring(0, 12)}...${wallet.address.substring(wallet.address.length - 8)}\`\n`;
            message += `💰 ${balanceInfo.balance} ${balanceInfo.symbol} (~$${balanceInfo.usdValue})\n`;
            message += `📅 Created: ${new Date(wallet.createdAt).toLocaleDateString()}\n\n`;
            
            totalValue += parseFloat(balanceInfo.usdValue) || 0;
          } catch (balanceError) {
            console.warn(`Error getting balance for wallet ${i}:`, balanceError);
            const defaultTag = wallet.isDefault ? ' 🌟' : '';
            const importedTag = wallet.imported ? ' 📥' : '';
            
            message += `**${i + 1}. ${wallet.name || `Wallet ${i + 1}`}**${defaultTag}${importedTag}\n`;
            message += `📍 \`${wallet.address.substring(0, 12)}...${wallet.address.substring(wallet.address.length - 8)}\`\n`;
            message += `💰 Balance unavailable\n`;
            message += `📅 Created: ${new Date(wallet.createdAt).toLocaleDateString()}\n\n`;
          }
        }
        
        message += `💎 **Total Portfolio Value:** ~$${totalValue.toFixed(2)}\n\n`;
        message += `**Legend:**\n🌟 Default Wallet | 📥 Imported Wallet`;
        
        // Create buttons for each wallet
        const walletButtons = [];
        for (let i = 0; i < Math.min(wallets.length, 8); i++) { // Limit to 8 wallets to avoid button limit
          const wallet = wallets[i];
          walletButtons.push([{
            text: `${wallet.isDefault ? '🌟 ' : ''}${wallet.name || `Wallet ${i + 1}`}`,
            callback_data: `select_wallet_${chain}_${i}`
          }]);
        }
        
        if (wallets.length > 8) {
          walletButtons.push([{ text: '➡️ Show More Wallets', callback_data: `show_more_wallets_${chain}_8` }]);
        }
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '➕ Create New Wallet', callback_data: 'create_wallet_ui' },
              { text: '🔄 Refresh All', callback_data: 'list_all_wallets' }
            ],
            ...walletButtons,
            [
              { text: '💸 Start Trading', callback_data: 'start_trading' },
              { text: '⬅️ Back to Menu', callback_data: 'wallet' }
            ]
          ]
        };
        
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('List wallets error:', error);
        await ctx.answerCbQuery('❌ Error loading wallets');
        await ctx.editMessageText('❌ Error loading wallets. Please try again.');
      }
    });

// Import Wallet handler - Modified to show chain selection first
botCore.registerCallbackHandler('import_wallet', async (ctx) => {
  try {
    await ctx.answerCbQuery('🔐 Import wallet...');
    
    const userId = ctx.from.id;
    const userSettings = await userService.getUserSettings(userId);
    
    // Get all supported chains
    const supportedChains = ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
    
    let message = `🔐 **Import Wallet - Select Chain**\n\n`;
    message += `Choose the blockchain network for the wallet you want to import:\n\n`;
    
    // Show chain descriptions
    const chainDescriptions = {
      'solana': '☀️ Fast, low-cost transactions',
      'ethereum': '🔷 Most popular DeFi ecosystem',
      'bsc': '🟡 Binance Smart Chain - Low fees',
      'polygon': '🟣 Layer 2 scaling solution',
      'arbitrum': '🔵 Ethereum Layer 2 - Lower fees',
      'base': '🔵 Coinbase Layer 2 network'
    };
    
    for (const chain of supportedChains) {
      const chainName = chain.toUpperCase();
      message += `⛓️ **${chainName}** - ${chainDescriptions[chain]}\n`;
    }
    
    message += `\n📝 **Note:** Make sure you select the correct chain that matches your private key!`;
    
    // Create chain selection buttons
    const chainButtons = supportedChains.map(chain => [
      { 
        text: `⛓️ Import ${chain.toUpperCase()} Wallet`, 
        callback_data: `import_wallet_${chain}` 
      }
    ]);
    
    const keyboard = {
      inline_keyboard: [
        ...chainButtons,
        [
          { text: '❓ Help with Import', callback_data: 'import_help' },
          { text: '❌ Cancel Import', callback_data: 'wallet' }
        ]
      ]
    };
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Import wallet handler error:', error);
    await ctx.answerCbQuery('❌ Error showing import options');
  }
});

// Chain-specific import handler
botCore.registerCallbackHandler(/^import_wallet_(.+)$/, async (ctx) => {
  const chain = ctx.match[1];
  
  ctx.session = ctx.session || {};
  ctx.session.awaitingImportPrivateKey = true;
  ctx.session.importChain = chain;
  ctx.session.activeTextHandler = 'awaitingImportPrivateKey';
  
  // Get chain-specific requirements
  const chainRequirements = {
    'solana': {
      format: 'Base58 or Array format [1,2,3...] (64 bytes)',
      example: 'Example: 5Kd3NBUAdUnhyzenEwVLy9pBKxSwXvE9FMPyR4UKZvpe6E6VBH2x...',
      length: '88 characters (Base58) or 64-element array'
    },
    'ethereum': {
      format: 'Hex format (32 bytes)',
      example: 'Example: 0x1234567890abcdef1234567890abcdef12345678...',
      length: '64 hex characters (without 0x prefix)'
    },
    'bsc': {
      format: 'Hex format (32 bytes)',
      example: 'Example: 0x1234567890abcdef1234567890abcdef12345678...',
      length: '64 hex characters (without 0x prefix)'
    },
    'polygon': {
      format: 'Hex format (32 bytes)',
      example: 'Example: 0x1234567890abcdef1234567890abcdef12345678...',
      length: '64 hex characters (without 0x prefix)'
    },
    'arbitrum': {
      format: 'Hex format (32 bytes)',
      example: 'Example: 0x1234567890abcdef1234567890abcdef12345678...',
      length: '64 hex characters (without 0x prefix)'
    },
    'base': {
      format: 'Hex format (32 bytes)',
      example: 'Example: 0x1234567890abcdef1234567890abcdef12345678...',
      length: '64 hex characters (without 0x prefix)'
    }
  };
  
  const requirements = chainRequirements[chain] || chainRequirements['ethereum'];
  
  await ctx.editMessageText(
    `🔐 **Import ${chain.toUpperCase()} Wallet**\n\n` +
    `✍️ Please paste your **private key** below.\n\n` +
    `📋 **Required Format for ${chain.toUpperCase()}:**\n` +
    `• ${requirements.format}\n` +
    `• ${requirements.length}\n\n` +
    `💡 **${requirements.example}**\n\n` +
    `⚠️ **CRITICAL SECURITY WARNING:**\n` +
    `• Never share your private key with anyone!\n` +
    `• Make sure this chat is private\n` +
    `• We'll encrypt and store it securely\n` +
    `• Delete your message after import\n\n` +
    `Type your ${chain.toUpperCase()} private key below:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⬅️ Back to Chain Selection', callback_data: 'import_wallet' },
            { text: '❌ Cancel Import', callback_data: 'wallet' }
          ]
        ]
      }
    }
  );
  
  await ctx.answerCbQuery(`🔐 Ready to import ${chain.toUpperCase()} wallet`);
});

// Import help handler
botCore.registerCallbackHandler('import_help', async (ctx) => {
  await ctx.answerCbQuery('📖 Loading import help...');
  
  let message = `📖 **Wallet Import Help**\n\n`;
  
  message += `**What is a Private Key?**\n`;
  message += `A private key is a secret code that gives you control over your wallet. It's like the master password for your crypto.\n\n`;
  
  message += `**Private Key Formats by Chain:**\n\n`;
  
  message += `☀️ **SOLANA:**\n`;
  message += `• Base58: 88 characters (most common)\n`;
  message += `• Array: [1,2,3...] with 64 numbers\n`;
  message += `• From Phantom: Settings → Security → Export Private Key\n\n`;
  
  message += `🔷 **ETHEREUM/BSC/POLYGON/ARBITRUM/BASE:**\n`;
  message += `• Hex format: 64 characters (0-9, a-f)\n`;
  message += `• With or without '0x' prefix\n`;
  message += `• From MetaMask: Account → Export Private Key\n\n`;
  
  message += `**Where to Find Private Keys:**\n`;
  message += `• **Phantom Wallet:** Settings → Security & Privacy → Export Private Key\n`;
  message += `• **MetaMask:** Account menu → Account details → Export Private Key\n`;
  message += `• **Trust Wallet:** Settings → Wallets → [Select wallet] → Show Private Key\n`;
  message += `• **Hardware wallets:** Not recommended to export\n\n`;
  
  message += `⚠️ **Security Reminders:**\n`;
  message += `• Never share your private key with anyone\n`;
  message += `• Make sure you're in a private chat\n`;
  message += `• We encrypt your key with AES-256\n`;
  message += `• Delete your private key message after import\n`;
  message += `• Keep a backup of your keys offline`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🔐 Start Import', callback_data: 'import_wallet' },
        { text: '💼 Create New Wallet', callback_data: 'create_wallet_ui' }
      ],
      [
        { text: '⬅️ Back to Wallet Menu', callback_data: 'wallet' }
      ]
    ]
  };
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

// Updated text handler for import wallet flow
botCore.registerTextHandler('awaitingImportPrivateKey', async (ctx) => {
  ctx.session = ctx.session || {};
  const privateKey = ctx.message.text.trim();
  const chain = ctx.session.importChain;
  const userId = ctx.from.id;

  if (!chain) {
    await ctx.reply('❌ Import session expired. Please start over with /wallet.');
    ctx.session.awaitingImportPrivateKey = false;
    ctx.session.activeTextHandler = null;
    return;
  }

  // Basic validation
  if (!privateKey || privateKey.length < 32) {
    await ctx.reply(`❌ Invalid private key for ${chain.toUpperCase()}. Please check the format and try again or use /cancel.`);
    return;
  }

  // Chain-specific validation
  let isValidFormat = false;
  let validationError = '';

  switch (chain) {
    case 'solana':
      // Solana accepts Base58 or array format
      if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
        // Array format
        try {
          const keyArray = JSON.parse(privateKey);
          isValidFormat = Array.isArray(keyArray) && keyArray.length === 64;
          if (!isValidFormat) validationError = 'Array must have exactly 64 elements';
        } catch (e) {
          validationError = 'Invalid array format';
        }
      } else {
        // Base58 format
        isValidFormat = privateKey.length >= 80 && privateKey.length <= 90;
        if (!isValidFormat) validationError = 'Base58 key should be 80-90 characters';
      }
      break;
      
    case 'ethereum':
    case 'bsc':
    case 'polygon':
    case 'arbitrum':
    case 'base':
      // EVM chains use hex format
      const cleanKey = privateKey.replace('0x', '');
      isValidFormat = /^[a-fA-F0-9]{64}$/.test(cleanKey);
      if (!isValidFormat) validationError = 'Must be 64 hex characters (with or without 0x prefix)';
      break;
      
    default:
      validationError = 'Unsupported chain';
  }

  if (!isValidFormat) {
    await ctx.reply(`❌ Invalid private key format for ${chain.toUpperCase()}.\n\n${validationError}\n\nPlease check the format and try again.`);
    return;
  }

  try {
    // Show loading message
    const loadingMsg = await ctx.reply(`🔄 **Importing ${chain.toUpperCase()} Wallet**\n\nValidating and encrypting your private key...`, {
      parse_mode: 'Markdown'
    });

    const result = await walletService.importWallet(userId, privateKey, chain);

    if (result && result.address) {
      // Try to delete the user's private key message for security
      try {
        await ctx.deleteMessage();
      } catch (e) {
        // Message might be too old to delete
      }

      // Delete loading message
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      } catch (e) {
        // Ignore deletion errors
      }

      let message = `✅ **${chain.toUpperCase()} Wallet Imported Successfully!**\n\n`;
      message += `📍 **Address:** \`${result.address}\`\n`;
      message += `⛓️ **Chain:** ${chain.toUpperCase()}\n`;
      message += `💰 **Balance:** ${result.balance} ${this.getChainSymbol(chain)}\n`;
      message += `💵 **USD Value:** $${result.usdValue || '0.00'}\n\n`;
      
      if (result.walletIndex !== undefined) {
        message += `🏷️ **Wallet Name:** ${result.name || `Imported Wallet ${result.walletIndex + 1}`}\n`;
      }
      
      message += `🔒 **Security:** Your private key is encrypted and stored securely.\n`;
      message += `📅 **Imported:** ${new Date().toLocaleString()}\n\n`;
      message += `Your wallet is now ready for trading!`;
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '💰 Check Balance', callback_data: `balance_${chain}_${result.walletIndex || 0}` },
            { text: '📤 Export Wallet', callback_data: `exportwallet_${chain}_${result.walletIndex || 0}` }
          ],
          [
            { text: '🌟 Set as Default', callback_data: `set_default_${chain}_${result.walletIndex || 0}` },
            { text: '🏷️ Rename Wallet', callback_data: `rename_wallet_${chain}_${result.walletIndex || 0}` }
          ],
          [
            { text: '➕ Import Another', callback_data: 'import_wallet' },
            { text: '⬅️ Back to Wallets', callback_data: 'wallet' }
          ]
        ]
      };
      
      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } else {
      await ctx.reply(`❌ Failed to import ${chain.toUpperCase()} wallet. Please check your private key format and try again.`);
    }
  } catch (error) {
    console.error('Import wallet error:', error);
    await ctx.reply(`❌ Error importing ${chain.toUpperCase()} wallet: ${error.message}`);
  }

  // Clear session
  ctx.session.awaitingImportPrivateKey = false;
  ctx.session.importChain = null;
  ctx.session.activeTextHandler = null;
});

// Export Wallet handler
botCore.registerCallbackHandler('export_wallet', async (ctx) => {
  const userSettings = await userService.getUserSettings(ctx.from.id);
  const chain = userSettings?.chain || 'solana';

      try {
        await ctx.answerCbQuery('🔐 Exporting wallet...');
        
        const walletInfo = await walletService.exportWalletInfo(ctx.from.id, chain);
        
        if (!walletInfo) {
          return ctx.editMessageText(
            '❌ **No Wallet Found**\n\nPlease create a wallet first using the "Create Wallet" option.',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '➕ Create Wallet', callback_data: 'create_wallet_ui' }],
                  [{ text: '⬅️ Back to Menu', callback_data: 'wallet' }]
                ]
              }
            }
          );
        }

        // Send wallet info in a secure way
        let message = `🔐 **Wallet Export - ${chain.toUpperCase()}**\n\n`;
        message += `📍 **Address:**\n\`${walletInfo.address}\`\n\n`;
        message += `🔑 **Private Key:**\n\`${walletInfo.privateKey}\`\n\n`;
        
        if (walletInfo.mnemonic && walletInfo.mnemonic !== 'undefined') {
          message += `🔤 **Mnemonic Phrase:**\n\`${walletInfo.mnemonic}\`\n\n`;
        }
        
        message += `⚠️ **CRITICAL SECURITY WARNING:**\n`;
        message += `• Never share these credentials with anyone!\n`;
        message += `• Store them securely offline\n`;
        message += `• Delete this message after saving\n`;
        message += `• Anyone with access can control your funds\n\n`;
        message += `📅 **Exported:** ${new Date().toLocaleString()}`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: '🗑️ Delete This Message', callback_data: 'delete_export_message' },
              { text: '💰 Check Balance', callback_data: 'wallet_balance' }
            ],
            [
              { text: '⬅️ Back to Wallet Menu', callback_data: 'wallet' }
            ]
          ]
        };

        await ctx.editMessageText(message, { 
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('Export wallet error:', error);
        await ctx.answerCbQuery('❌ Error exporting wallet');
        await ctx.editMessageText(
          '❌ **Export Failed**\n\nUnable to export wallet information. Please try again or contact support.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: 'export_wallet' }],
                [{ text: '⬅️ Back to Menu', callback_data: 'wallet' }]
              ]
            }
          }
        );
      }
    });

    // Wallet Balance handler - Complete implementation
// Wallet Balance handler - Modified to show all chains and wallets
botCore.registerCallbackHandler('wallet_balance', async (ctx) => {
  try {
    await ctx.answerCbQuery('💰 Loading all balances...');
    
    const userId = ctx.from.id;
    const userSettings = await userService.getUserSettings(userId);
    
    // Get all supported chains
    const supportedChains = ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
    
    let message = `💰 **Complete Balance Overview**\n\n`;
    let totalUSDValue = 0;
    let hasAnyWallet = false;
    
    // Loop through all chains
    for (const chain of supportedChains) {
      if (userSettings.custodialWallets && userSettings.custodialWallets[chain]) {
        let wallets = userSettings.custodialWallets[chain];
        
        // Handle both array and legacy single wallet format
        if (!Array.isArray(wallets)) {
          wallets = [{
            ...wallets,
            isDefault: true,
            name: 'Main Wallet'
          }];
        }
        
        if (wallets.length > 0) {
          hasAnyWallet = true;
          message += `⛓️ **${chain.toUpperCase()} CHAIN (${wallets.length} wallet${wallets.length > 1 ? 's' : ''})**\n`;
          
          let chainTotalValue = 0;
          
          // Show each wallet for this chain
          for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i];
            const defaultTag = wallet.isDefault ? ' 🌟' : '';
            const importedTag = wallet.imported ? ' 📥' : '';
            
            try {
              const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
              const usdValue = parseFloat(balanceInfo.usdValue) || 0;
              
              message += `  **${wallet.name || `Wallet ${i + 1}`}**${defaultTag}${importedTag}\n`;
              message += `  📍 \`${wallet.address.substring(0, 12)}...${wallet.address.substring(wallet.address.length - 8)}\`\n`;
              message += `  💰 ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
              message += `  💵 $${balanceInfo.usdValue}\n`;
              
              if (balanceInfo.tokenPrice) {
                message += `  📊 $${balanceInfo.tokenPrice.toFixed(6)} per ${balanceInfo.symbol}\n`;
              }
              
              message += `\n`;
              
              chainTotalValue += usdValue;
              totalUSDValue += usdValue;
              
            } catch (balanceError) {
              console.warn(`Error getting balance for ${chain} wallet ${i}:`, balanceError);
              message += `  **${wallet.name || `Wallet ${i + 1}`}**${defaultTag}${importedTag}\n`;
              message += `  📍 \`${wallet.address.substring(0, 12)}...${wallet.address.substring(wallet.address.length - 8)}\`\n`;
              message += `  💰 Balance unavailable\n`;
              message += `  ⚠️ Error: ${balanceError.message}\n\n`;
            }
          }
          
          message += `  💎 **${chain.toUpperCase()} Total:** $${chainTotalValue.toFixed(2)}\n\n`;
        }
      }
    }
    
    if (!hasAnyWallet) {
      message = `💰 **Complete Balance Overview**\n\n`;
      message += `📭 **No Wallets Found**\n\n`;
      message += `You don't have any wallets created yet.\n\n`;
      message += `**Get Started:**\n`;
      message += `• Set your preferred chain with /setchain\n`;
      message += `• Create a wallet to start trading\n`;
      message += `• Import existing wallets if you have them`;
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '➕ Create First Wallet', callback_data: 'create_wallet_ui' },
            { text: '🔐 Import Wallet', callback_data: 'import_wallet' }
          ],
          [
            { text: '⚙️ Set Chain', callback_data: 'setchain_menu' },
            { text: '⬅️ Back to Menu', callback_data: 'wallet' }
          ]
        ]
      };
      
      return ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }
    
    // Add total portfolio summary
    message += `💎 **TOTAL PORTFOLIO VALUE: $${totalUSDValue.toFixed(2)}**\n\n`;
    
    // Add statistics
    let totalWallets = 0;
    let activeChainsCount = 0;
    
    for (const chain of supportedChains) {
      if (userSettings.custodialWallets && userSettings.custodialWallets[chain]) {
        let wallets = userSettings.custodialWallets[chain];
        if (!Array.isArray(wallets)) wallets = [wallets];
        if (wallets.length > 0) {
          totalWallets += wallets.length;
          activeChainsCount++;
        }
      }
    }
    
    message += `📊 **Portfolio Statistics:**\n`;
    message += `• **Active Chains:** ${activeChainsCount}/${supportedChains.length}\n`;
    message += `• **Total Wallets:** ${totalWallets}\n`;
    message += `• **Last Updated:** ${new Date().toLocaleString()}\n\n`;
    
    message += `**Legend:**\n`;
    message += `🌟 Default Wallet | 📥 Imported Wallet`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Refresh All Balances', callback_data: 'refresh_all_balances' },
          { text: '💸 Start Trading', callback_data: 'start_trading' }
        ],
        [
          { text: '➕ Create New Wallet', callback_data: 'create_wallet_ui' },
          { text: '📋 Manage Wallets', callback_data: 'list_all_wallets' }
        ],
        [
          { text: '📊 Detailed Portfolio', callback_data: 'detailed_portfolio' },
          { text: '⚙️ Chain Settings', callback_data: 'setchain_menu' }
        ],
        [
          { text: '⬅️ Back to Wallet Menu', callback_data: 'wallet' }
        ]
      ]
    };
    
    await ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Complete balance check error:', error);
    await ctx.answerCbQuery('❌ Error loading balances');
    await ctx.editMessageText(
      '❌ **Balance Check Failed**\n\nUnable to fetch wallet balances. Please try again.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Try Again', callback_data: 'wallet_balance' }],
            [{ text: '⬅️ Back to Menu', callback_data: 'wallet' }]
          ]
        }
      }
    );
  }
});

// Add refresh all balances handler
botCore.registerCallbackHandler('refresh_all_balances', async (ctx) => {
  try {
    await ctx.answerCbQuery('🔄 Refreshing all balances...');
    
    // Clear all balance caches
    walletService.clearCache('balance');
    
    // Show refreshing message
    await ctx.editMessageText('🔄 **Refreshing All Balances**\n\nPlease wait while we fetch fresh data from all blockchains...', {
      parse_mode: 'Markdown'
    });
    
    // Wait a moment then call the balance handler
    setTimeout(async () => {
      const balanceHandler = botCore.callbackHandlers.get('wallet_balance');
      if (balanceHandler) {
        await balanceHandler(ctx);
      }
    }, 1000);
    
  } catch (error) {
    console.error('Refresh all balances error:', error);
    await ctx.answerCbQuery('❌ Refresh failed');
  }
});

// Add detailed portfolio handler
botCore.registerCallbackHandler('detailed_portfolio', async (ctx) => {
  try {
    await ctx.answerCbQuery('📊 Loading detailed portfolio...');
    
    const userId = ctx.from.id;
    const userSettings = await userService.getUserSettings(userId);
    
    let message = `📊 **Detailed Portfolio Analysis**\n\n`;
    
    // Show positions if available
    if (userSettings.positions && Object.keys(userSettings.positions).length > 0) {
      message += `🎯 **Active Trading Positions:**\n`;
      
      let totalPositionValue = 0;
      let totalPnL = 0;
      
      for (const [tokenAddress, position] of Object.entries(userSettings.positions)) {
        const currentValue = position.balance * (position.currentPrice || position.avgPrice || 0);
        const invested = position.balance * (position.avgPrice || 0);
        const pnl = currentValue - invested;
        
        message += `• **${position.tokenSymbol}** (${position.balance.toFixed(4)})\n`;
        message += `  Current: $${currentValue.toFixed(2)} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}\n`;
        
        totalPositionValue += currentValue;
        totalPnL += pnl;
      }
      
      message += `\n💰 **Total Positions Value:** $${totalPositionValue.toFixed(2)}\n`;
      message += `📈 **Total P&L:** ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}\n\n`;
    }
    
    // Add wallet distribution
    const supportedChains = ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
    message += `⛓️ **Chain Distribution:**\n`;
    
    for (const chain of supportedChains) {
      if (userSettings.custodialWallets && userSettings.custodialWallets[chain]) {
        let wallets = userSettings.custodialWallets[chain];
        if (!Array.isArray(wallets)) wallets = [wallets];
        
        if (wallets.length > 0) {
          let chainValue = 0;
          for (const wallet of wallets) {
            try {
              const balance = await walletService.getWalletBalance(wallet.address, chain);
              chainValue += parseFloat(balance.usdValue) || 0;
            } catch (e) {
              // Skip failed balance checks
            }
          }
          message += `• **${chain.toUpperCase()}:** ${wallets.length} wallet${wallets.length > 1 ? 's' : ''} (~$${chainValue.toFixed(2)})\n`;
        }
      }
    }
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📊 View Positions', callback_data: 'view_positions' },
          { text: '💰 Simple Balance', callback_data: 'wallet_balance' }
        ],
        [
          { text: '⬅️ Back to Wallet Menu', callback_data: 'wallet' }
        ]
      ]
    };
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Detailed portfolio error:', error);
    await ctx.answerCbQuery('❌ Error loading portfolio');
  }
});

// Select wallet handler
botCore.registerCallbackHandler(/^select_wallet_(.+)_(\d+)$/, async (ctx) => {
  const chain = ctx.match[1];
  const walletIndex = parseInt(ctx.match[2]);
  const userId = ctx.from.id;
      
      try {
        const wallet = await walletService.getWalletByIndex(userId, chain, walletIndex);
        const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
        
        let message = `💼 **${wallet.name || `Wallet ${walletIndex + 1}`}**\n\n`;
        message += `📍 **Address:**\n\`${wallet.address}\`\n\n`;
        message += `💰 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
        message += `💵 **USD Value:** $${balanceInfo.usdValue}\n\n`;
        
        if (wallet.isDefault) {
          message += `🌟 **Status:** Default Wallet\n`;
        }
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '💰 Check Balance', callback_data: `balance_${chain}_${walletIndex}` },
              { text: '📤 Export Wallet', callback_data: `exportwallet_${chain}_${walletIndex}` }
            ],
            [
              { text: '🌟 Set as Default', callback_data: `set_default_${chain}_${walletIndex}` },
              { text: '🔄 Refresh', callback_data: `balance_refresh_${chain}_${walletIndex}` }
            ],
            [
              { text: '⬅️ Back to Wallets', callback_data: 'wallet' }
            ]
          ]
        };
        
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('Select wallet error:', error);
        await ctx.answerCbQuery('❌ Error loading wallet');
      }
    });

    // Set default wallet handler
    botCore.registerCallbackHandler(/^set_default_(.+)_(\d+)$/, async (ctx) => {
      const chain = ctx.match[1];
      const walletIndex = parseInt(ctx.match[2]);
      const userId = ctx.from.id;
      
      try {
        await walletService.setDefaultWallet(userId, chain, walletIndex);
        await ctx.answerCbQuery('🌟 Default wallet updated!');
        
        // Refresh the wallet view
        const wallet = await walletService.getWalletByIndex(userId, chain, walletIndex);
        const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
        
        let message = `🌟 **${wallet.name || `Wallet ${walletIndex + 1}`}** (Default)\n\n`;
        message += `📍 **Address:**\n\`${wallet.address}\`\n\n`;
        message += `💰 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
        message += `💵 **USD Value:** $${balanceInfo.usdValue}\n\n`;
        message += `This wallet is now your default for trading.`;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '💰 Check Balance', callback_data: `balance_${chain}_${walletIndex}` },
              { text: '📤 Export Wallet', callback_data: `exportwallet_${chain}_${walletIndex}` }
            ],
            [
              { text: '⬅️ Back to Wallets', callback_data: 'wallet' }
            ]
          ]
        };
        
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('Set default wallet error:', error);
        await ctx.answerCbQuery('❌ Error setting default wallet');
      }
    });

    // Balance refresh handler with wallet index
    botCore.registerCallbackHandler(/^balance_refresh_(.+)_(\d+)$/, async (ctx) => {
      const chain = ctx.match[1];
      const walletIndex = parseInt(ctx.match[2]);
      
      await this.handleBalanceRefresh(ctx, ctx.from.id, chain, walletIndex);
    });

    // Export specific wallet handler
    botCore.registerCallbackHandler(/^exportwallet_(.+)_(\d+)$/, async (ctx) => {
      const chain = ctx.match[1];
      const walletIndex = parseInt(ctx.match[2]);
      const userId = ctx.from.id;
      
      try {
        await ctx.answerCbQuery('🔐 Exporting wallet...');
        
        const walletInfo = await walletService.exportWalletInfo(userId, chain, walletIndex);
        
        if (!walletInfo) {
          return ctx.editMessageText('❌ **Wallet Not Found**\n\nThe requested wallet could not be found.');
        }

        // Send wallet info securely
        let message = `🔐 **Wallet Export - ${chain.toUpperCase()}**\n\n`;
        message += `📍 **Address:**\n\`${walletInfo.address}\`\n\n`;
        message += `🔑 **Private Key:**\n\`${walletInfo.privateKey}\`\n\n`;
        
        if (walletInfo.mnemonic && walletInfo.mnemonic !== 'undefined') {
          message += `🔤 **Mnemonic:**\n\`${walletInfo.mnemonic}\`\n\n`;
        }
        
        message += `⚠️ **SECURITY WARNING:** Never share these credentials!\n`;
        message += `📅 **Exported:** ${new Date().toLocaleString()}`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: '🗑️ Delete Message', callback_data: 'delete_export_message' },
              { text: '💰 Check Balance', callback_data: `balance_${chain}_${walletIndex}` }
            ],
            [
              { text: '⬅️ Back to Wallet', callback_data: `select_wallet_${chain}_${walletIndex}` }
            ]
          ]
        };

        await ctx.editMessageText(message, { 
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
      } catch (error) {
        console.error('Export specific wallet error:', error);
        await ctx.answerCbQuery('❌ Error exporting wallet');
      }
    });

    // Delete export message handler
    botCore.registerCallbackHandler('delete_export_message', async (ctx) => {
      try {
        await ctx.deleteMessage();
        await ctx.answerCbQuery('🗑️ Sensitive information deleted for security');
      } catch (error) {
        await ctx.answerCbQuery('✅ Message cleared');
      }
    });

    // Wallet refresh handler
    botCore.registerCallbackHandler(/^wallet_refresh_(.+)$/, async (ctx) => {
      const chain = ctx.match[1];
      
      try {
        await ctx.answerCbQuery('🔄 Refreshing wallets...');
        
        // Trigger the main wallet handler to refresh the view
        const fakeCtx = {
          ...ctx,
          from: { id: ctx.from.id }
        };
        
        // Call the wallet handler to refresh
        await ctx.editMessageText('🔄 Refreshing wallet information...', { parse_mode: 'Markdown' });
        
        // Small delay then call wallet handler
        setTimeout(async () => {
          const walletCallback = botCore.callbackHandlers.get('wallet');
          if (walletCallback) {
            await walletCallback(ctx);
          }
        }, 500);
        
      } catch (error) {
        console.error('Wallet refresh error:', error);
        await ctx.answerCbQuery('❌ Refresh failed');
      }
    });

    console.log('✅ WalletCommandHandlers registered successfully');
  }

  // Helper method to handle balance refresh
  async handleBalanceRefresh(ctx, userId, chain, walletIndex = 0) {
    try {
      await ctx.answerCbQuery('🔄 Refreshing balance...');
      
      const userSettings = await userService.getUserSettings(userId);
      const targetChain = chain || userSettings.chain;
      
      if (!userSettings.custodialWallets || !userSettings.custodialWallets[targetChain]) {
        return ctx.editMessageText('❌ No wallets found for this chain.');
      }
      
      let wallets = userSettings.custodialWallets[targetChain];
      if (!Array.isArray(wallets)) {
        wallets = [wallets]; // Handle legacy format
      }
      
      if (!wallets[walletIndex]) {
        return ctx.editMessageText('❌ Wallet not found at this index.');
      }
      
      const wallet = wallets[walletIndex];
      const balanceInfo = await walletService.getWalletBalance(wallet.address, targetChain);
      
      let message = `💰 **${wallet.name || `Wallet ${walletIndex + 1}`} Balance**\n\n`;
      message += `📍 **Address:** \`${wallet.address.substring(0, 8)}...${wallet.address.substring(wallet.address.length - 8)}\`\n\n`;
      message += `💵 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
      message += `💲 **USD Value:** $${balanceInfo.usdValue}\n`;
      
      if (balanceInfo.tokenPrice) {
        message += `📊 **Price:** $${balanceInfo.tokenPrice.toFixed(2)}\n`;
      }
      
      message += `\n🕒 **Updated:** ${new Date().toLocaleString()}`;
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 Refresh Again', callback_data: `balance_refresh_${targetChain}_${walletIndex}` },
            { text: '💸 Start Trading', callback_data: 'start_trading' }
          ],
          [
            { text: '⬅️ Back to Wallet', callback_data: `select_wallet_${targetChain}_${walletIndex}` }
          ]
        ]
      };
      
      return ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error('Balance refresh error:', error);
      await ctx.answerCbQuery('❌ Refresh failed');
      return ctx.editMessageText('❌ Failed to refresh balance. Please try again.');
    }
  }
}

module.exports = WalletCommandHandlers;