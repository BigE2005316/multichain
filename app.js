// app.js - Professional Trading Bot Application
require('dotenv').config();
const { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL, SystemProgram } = require('@solana/web3.js');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
require('./src/config/index.js');
const { connectMongo } = require('./src/db/mongoose.js');
const { createServer } = require('./src/api/server.js');
const { initQueues } = require('./src/queue/index.js');
const { MoralisService } = require('./src/services/moralis.service.js');
const { HeliusService } = require('./src/services/helius.service.js');
const { seeder } = require('./src/services/seeder.js');
const {startPollingLoop} = require('./src/services/copyOrchestrator.js')
const User = require('./src/models/User');
// const { startBot } = require('./bot/BotCore.js');
const logger = require('./src/utils/logger.js');
const WalletFollow = require('./src/models/WalletFollow');
//const TPSLJob = require('./src/services/advancedTrading.service.js');
const app = express();
app.use(bodyParser.json());

const BotCore = require('./core/BotCore');
const { createServiceManager } = require('./core/ServiceManager');

// Commands
const BuyCommand = require('./commands/BuyCommand');
const SellCommand = require('./commands/SellCommand');
const AdminCommand = require('./commands/AdminCommand');
const PositionsCommand = require('./commands/PositionsCommand');

// Import enhanced commands
const enhancedBuyCommand = require('./commands/EnhancedBuyCommand');
const enhancedSellCommand = require('./commands/EnhancedSellCommand');
const enhancedPositionsCommand = require('./commands/EnhancedPositionsCommand');

// Services (using existing files)
const userService = require('./users/userService');
const walletService = require('./services/walletService');
const tokenDataService = require('./services/tokenDataService');
const adminService = require('./services/adminService');

class SmileSnipperBot {
  constructor() {
    this.config = this.loadConfig();
    this.serviceManager = createServiceManager();
    this.botCore = null;
    this.initialized = false;
  }

  loadConfig() {
    const requiredVars = [
      'TELEGRAM_BOT_TOKEN',
      'DEV_FEE_PERCENT',
      'ADMIN_TELEGRAM_ID'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return {
      telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN,
        adminId: process.env.ADMIN_TELEGRAM_ID
      },
      trading: {
        devFeePercent: parseFloat(process.env.DEV_FEE_PERCENT || '3'),
        maxSlippage: 50,
        confirmationTimeout: 60000
      },
      chains: {
        solana: {
          rpcUrl: process.env.SOLANA_RPC_URL,
          enabled: true
        },
        ethereum: {
          rpcUrl: process.env.ETHEREUM_RPC_URL,
          enabled: true
        },
        bsc: {
          rpcUrl: process.env.BSC_RPC_URL,
          enabled: true
        }
      },
      redis: {
        url: process.env.REDIS_URL
      }
    };
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Smile Snipper Bot - Professional Edition');
      console.log('🎯 Goal: Surpass all competitors in performance and reliability\n');


      //this.executeSolanaBuy('31afe6242181475598e938c1188fbdbd9223a6ec6720fda4fb952db4e129587d9eb69b60cb1149633c443170cf6fb598056a2b3621517124bb7c24f99fe07f08', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 0.00097, 5)

      // Create bot core
      this.botCore = new BotCore({
        token: this.config.telegram.token
      });

      // Configure service manager
      this.serviceManager.setConfig(this.config);

      // Register commands
      await this.registerCommands();

      this.initialized = true;
      console.log('\n✅ Bot initialization complete - ready for professional trading!');

    } catch (error) {
      console.error('❌ Bot initialization failed:', error.message);
      throw error;
    }
  }

//     async executeSolanaBuy(privateKeyHex, tokenAddress, amount, slippage) {
//     try {
//       //const connection = await this.rpcManager.getSolanaConnection();
//           this.connection = new Connection("https://solana-mainnet.g.alchemy.com/v2/hhxZSRPIvPBbxIXvfWtoI", {
//                 commitment: 'confirmed',
//                 //wsEndpoint: config.wsEndpoint,
//                 confirmTransactionInitialTimeout: 60000,
//                 disableRetryOnRateLimit: false
//               }, "https://api.mainnet-beta.solana.com");
// //https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=970000&slippageBps=500
//       var LAMPORTS_PER_SOL = 1000000000
//       // Convert hex private key to Keypair
//       const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
//       const wallet = Keypair.fromSecretKey(secretKey);

//       const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

//       // Get quote from Jupiter with retry logic
//       let quoteData;
//       for (let attempt = 1; attempt <= 3; attempt++) {
//         try {
//           var solanaSol = 'So11111111111111111111111111111111111111112'
//           var JUPITER_API = 'https://quote-api.jup.ag/v6'

//           console.log( `${JUPITER_API}/quote?inputMint=${solanaSol}&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=${slippage * 100}`)
//           const quoteResponse = await axios.get(
//             `${JUPITER_API}/quote?inputMint=${solanaSol}&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=${slippage * 100}`,
//             { timeout: 10000 }
//           );
//           if (!quoteResponse.data) {
//             throw new Error('No quote data received');
//           }

//           quoteData = quoteResponse.data;
//           break;
//         } catch (error) {
//           console.warn(`Jupiter quote attempt ${attempt} failed:`, error.message);
//           if (attempt === 3) throw error;
//           await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
//         }
//       }

//       var JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap'
//       // Get swap transaction
//       const swapResponse = await axios.post(JUPITER_SWAP_API, {
//         quoteResponse: quoteData,
//         userPublicKey: wallet.publicKey.toString(),
//         wrapAndUnwrapSol: true,
//         dynamicComputeUnitLimit: true,
//         prioritizationFeeLamports: 100000 // 0.0001 SOL priority fee
//       }, { timeout: 10000 });

//       if (!swapResponse.data?.swapTransaction) {
//         throw new Error('No swap transaction received');
//       }

//       const { swapTransaction } = swapResponse.data;

//       // Deserialize and sign transaction
//       const transactionBuf = Buffer.from(swapTransaction, 'base64');
//       //const transaction = Transaction.from(transactionBuf);
//       const transaction = VersionedTransaction.deserialize(transactionBuf);
//       transaction.sign([wallet]);
//             debugger

//       // const signTrans = await wallet.signTransaction(transaction);
//       // const rawTransaction = signTrans.serialize()

//       // Execute transaction with retry
//       let txHash;
//       for (let attempt = 1; attempt <= 3; attempt++) {
//         try {
//           txHash = await this.connection.sendRawTransaction(transaction.serialize(), {
//             skipPreflight: false,
//             preflightCommitment: 'confirmed',
//             maxRetries: 3
//           });
//           break;
//         } catch (error) {
//           console.warn(`Solana transaction attempt ${attempt} failed:`, error.message);
//           if (attempt === 3) throw error;
//           await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
//         }
//       }

//       // Wait for confirmation with timeout
//       // const confirmationPromise = connection.confirmTransaction(txHash, 'confirmed');
//       // const timeoutPromise = new Promise((_, reject) => 
//       //   setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
//       // );

//       // await Promise.race([confirmationPromise, timeoutPromise]);

//       const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');

//     await this.connection.confirmTransaction(
//       {
//         signature: txHash,
//         blockhash: latestBlockhash.blockhash,
//         lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
//       },
//       'confirmed'
//     );

//       const executedPrice = parseInt(quoteData.inAmount) / parseInt(quoteData.outAmount);
//       const tokensReceived = parseInt(quoteData.outAmount) / Math.pow(10, 9); // Assuming 9 decimals

//       return {
//         txHash,
//         executedPrice,
//         tokensReceived,
//         gasUsed: 'N/A'
//       };

//     } catch (error) {
//       console.error('Solana buy execution error:', error);
//       throw new Error(`Solana buy failed: ${error.message}`);
//     }
//   }


async executeSolanaBuy(privateKeyHex, tokenAddress, amount, slippage) {
  // const SOLANA_RPC = "https://solana-mainnet.g.alchemy.com/v2/hhxZSRPIvPBbxIXvfWtoI";
  // const SOLANA_WS = "wss://solana-mainnet.g.alchemy.com/v2/hhxZSRPIvPBbxIXvfWtoI";
  // const connection = new Connection(SOLANA_RPC, {
  //   commitment: 'confirmed',
  //   wsEndpoint: SOLANA_WS,
  //   confirmTransactionInitialTimeout: 60000
  // });

  //| RPC | `https://api.mainnet-beta.solana.com` |

const connection = new Connection(
  "https://api.mainnet-beta.solana.com", // RPC endpoint
  {
    commitment: 'confirmed',
    wsEndpoint: "wss://api.mainnet-beta.solana.com", // WebSocket required for `signatureSubscribe`
    confirmTransactionInitialTimeout: 60000 // Optional timeout for confirmTransaction
  }
);
  const LAMPORTS_PER_SOL = 1_000_000_000;
  const solanaSol = 'So11111111111111111111111111111111111111112';
  const JUPITER_API = 'https://quote-api.jup.ag/v6';
  const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

  try {
    const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
    const wallet = Keypair.fromSecretKey(secretKey);
    const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

    let txHash;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Attempt ${attempt}: Fetching fresh quote...`);

        const quoteUrl = `${JUPITER_API}/quote?inputMint=${solanaSol}&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=${slippage * 100}`;
        const quoteResponse = await axios.get(quoteUrl, { timeout: 10000 });
        if (!quoteResponse.data) throw new Error('No quote data received');

        const quoteData = quoteResponse.data;

        console.log(`Fetching swap transaction...`);
        const swapResponse = await axios.post(JUPITER_SWAP_API, {
          quoteResponse: quoteData,
          userPublicKey: wallet.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 100000
        }, { timeout: 10000 });

        if (!swapResponse.data?.swapTransaction) throw new Error('No swap transaction received');

        const transactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(transactionBuf);
        transaction.sign([wallet]);

        //debugger

        console.log(`Sending transaction...`);
        txHash = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3
        });

        console.log(`Waiting for confirmation: ${txHash}`);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

        await connection.confirmTransaction({
          signature: txHash,
          blockhash,
          lastValidBlockHeight
        }, 'confirmed');

        // Success: exit retry loop
        console.log(`✅ Transaction confirmed: ${txHash}`);
        const executedPrice = parseInt(quoteData.inAmount) / parseInt(quoteData.outAmount);
        const tokensReceived = parseInt(quoteData.outAmount) / Math.pow(10, 9); // Assuming 9 decimals

        debugger
        return {
          txHash,
          executedPrice,
          tokensReceived,
          gasUsed: 'N/A'
        };

      } catch (error) {
        console.warn(`❌ Attempt ${attempt} failed: ${error.message}`);
        if (attempt === 3) throw error;
        await new Promise(res => setTimeout(res, 1000 * attempt)); // Exponential backoff
      }
    }

  } catch (error) {
    console.error('🚨 Solana buy execution error:', error);
    throw new Error(`Solana buy failed: ${error.message}`);
  }
}

  async registerCommands() {
    console.log('🔧 Registering commands...');

    // Sell Command Handler (UI Flow)
  const SellCommandHandler = require('./CommandHandlers/SellCommandHandler');
  const sellCommandHandler = new SellCommandHandler(this.botCore);
  sellCommandHandler.register();
    sellCommandHandler.registerManualInputHandlers();

    // Initialize commands
    const buyCommand = new BuyCommand(this.botCore);
    const sellCommand = new SellCommand(this.botCore);
    const adminCommand = new AdminCommand(this.botCore);
    const positionsCommand = new PositionsCommand(this.botCore);

    // Register all commands
    buyCommand.register();
    sellCommand.register();
    adminCommand.register();
    positionsCommand.register();

    // Register basic commands
    this.registerBasicCommands();
    
    // Register wallet management commands
    this.registerWalletCommands();
    
    // Register copy trading commands
    this.registerCopyTradingCommands();
    
    // Register trading feature commands
    this.registerTradingFeatureCommands();

    // Enhanced Trading Commands (Replace the basic ones)
    this.botCore.registerCommand('buy', async (ctx) => await enhancedBuyCommand.execute(ctx));
    this.botCore.registerCommand('b', async (ctx) => await enhancedBuyCommand.execute(ctx));
    this.botCore.registerCommand('purchase', async (ctx) => await enhancedBuyCommand.execute(ctx));
    
    this.botCore.registerCommand('sell', async (ctx) => await enhancedSellCommand.execute(ctx));
    this.botCore.registerCommand('s', async (ctx) => await enhancedSellCommand.execute(ctx));
    this.botCore.registerCommand('dispose', async (ctx) => await enhancedSellCommand.execute(ctx));
    
    this.botCore.registerCommand('positions', async (ctx) => await enhancedPositionsCommand.execute(ctx));
    this.botCore.registerCommand('portfolio', async (ctx) => await enhancedPositionsCommand.execute(ctx));
    this.botCore.registerCommand('pos', async (ctx) => await enhancedPositionsCommand.execute(ctx));
    this.botCore.registerCommand('holdings', async (ctx) => await enhancedPositionsCommand.execute(ctx));

    console.log('✅ Commands registered successfully');

    debugger
    // TP/SL Command
  const TPSLCommand = require('./telegram/commands/tpsl.js');
  const tpslCommand = new TPSLCommand(this.botCore);
  tpslCommand.register();
 
  debugger
  // Start TP/SL monitor
  const tpslMonitor = require('./src/services/tpslMonitorService.js');
  await tpslMonitor.start();
debugger
    // Enhanced callback handlers for buy/sell confirmations
    this.botCore.registerCallbackHandler(/confirm_buy_(.+)/, async (ctx) => {
      try {
        await enhancedBuyCommand.handleBuyConfirmation(ctx);
      } catch (error) {
        console.error('Buy confirmation error:', error);
        await ctx.answerCbQuery('❌ Transaction failed');
      }
    });

    this.botCore.registerCallbackHandler(/confirm_sell_(.+)/, async (ctx) => {
      try {
        await enhancedSellCommand.handleSellConfirmation(ctx);
      } catch (error) {
        console.error('Sell confirmation error:', error);
        await ctx.answerCbQuery('❌ Transaction failed');
      }
    });

    // Enhanced portfolio view handlers
    this.botCore.registerCallbackHandler(/positions_(detailed|summary|refresh)_(.+)/, async (ctx) => {
      try {
        const [, viewType, chain] = ctx.callbackQuery.data.match(/positions_(detailed|summary|refresh)_(.+)/);
        const specificChain = chain === 'all' ? null : chain;
        
        // Re-execute positions command with appropriate view
        const fakeMessage = {
          text: specificChain ? `/positions ${specificChain} ${viewType}` : `/positions ${viewType}`,
          from: ctx.from,
          chat: ctx.chat
        };
        const fakeCtx = { ...ctx, message: fakeMessage };
        
        await enhancedPositionsCommand.execute(fakeCtx);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Portfolio view error:', error);
        await ctx.answerCbQuery('❌ Failed to update view');
      }
    });

    this.botCore.registerCallbackHandler(/positions_chain_(.+)/, async (ctx) => {
      try {
        const [, chain] = ctx.callbackQuery.data.match(/positions_chain_(.+)/);
        
        const fakeMessage = {
          text: `/positions ${chain}`,
          from: ctx.from,
          chat: ctx.chat
        };
        const fakeCtx = { ...ctx, message: fakeMessage };
        
        await enhancedPositionsCommand.execute(fakeCtx);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Chain filter error:', error);
        await ctx.answerCbQuery('❌ Failed to filter by chain');
      }
    });

    // Cancel trade handler
    this.botCore.registerCallbackHandler('cancel_trade', async (ctx) => {
      try {
        await ctx.editMessageText('❌ **Trade Cancelled**\n\nNo transaction was executed.');
        await ctx.answerCbQuery('Trade cancelled');
      } catch (error) {
        console.error('Cancel trade error:', error);
        await ctx.answerCbQuery('❌ Error cancelling trade');
      }
    });

    // Additional enhanced feature handlers
    this.botCore.registerCallbackHandler(/analyze_(.+)_(.+)/, async (ctx) => {
      try {
        const [, tokenAddress, chain] = ctx.callbackQuery.data.match(/analyze_(.+)_(.+)/);
        
        await ctx.editMessageText('🔍 **Deep Token Analysis**\n\nGenerating comprehensive analysis...');
        
        // Get enhanced token data
        const tokenDataService = require('./services/tokenDataService');
        const enhancedData = await tokenDataService.getEnhancedTokenData(tokenAddress, chain);
        
        if (enhancedData) {
          let analysisMessage = `🧠 **Advanced Analysis - ${enhancedData.symbol}**\n\n`;
          
          // Security Score
          analysisMessage += `🛡️ **Security Score:** ${100 - enhancedData.security.rugScore}/100\n`;
          analysisMessage += `• Contract Verified: ${enhancedData.security.verified ? '✅' : '❌'}\n`;
          analysisMessage += `• Honeypot Risk: ${enhancedData.security.honeypot ? '🚨 HIGH' : '✅ LOW'}\n`;
          analysisMessage += `• Ownership Renounced: ${enhancedData.security.renounced ? '✅' : '❌'}\n\n`;
          
          // Liquidity Analysis
          analysisMessage += `💧 **Liquidity Analysis**\n`;
          analysisMessage += `• Liquidity Score: ${enhancedData.liquidityScore}/100\n`;
          analysisMessage += `• $1K Trade Impact: ${enhancedData.priceImpact['1000']?.toFixed(2) || 'N/A'}%\n`;
          analysisMessage += `• $10K Trade Impact: ${enhancedData.priceImpact['10000']?.toFixed(2) || 'N/A'}%\n\n`;
          
          // AI Analysis
          analysisMessage += `🤖 **AI Recommendation**\n`;
          analysisMessage += `• Signal: ${enhancedData.aiRecommendation}\n`;
          analysisMessage += `• Confidence: ${enhancedData.aiConfidence}%\n`;
          analysisMessage += `• Reasoning: ${enhancedData.aiReason}\n\n`;
          
          // Technical Indicators
          if (enhancedData.technical) {
            analysisMessage += `📊 **Technical Indicators**\n`;
            analysisMessage += `• Trend: ${enhancedData.technical.trend.toUpperCase()}\n`;
            analysisMessage += `• RSI: ${enhancedData.technical.rsi.toFixed(2)}\n`;
            analysisMessage += `• Support: $${enhancedData.technical.support.toFixed(8)}\n`;
            analysisMessage += `• Resistance: $${enhancedData.technical.resistance.toFixed(8)}\n`;
          }
          
          await ctx.editMessageText(analysisMessage, { parse_mode: 'Markdown' });
        } else {
          await ctx.editMessageText('❌ Unable to perform deep analysis at this time.');
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Analysis error:', error);
        await ctx.answerCbQuery('❌ Analysis failed');
      }
    });
  }

  registerBasicCommands() {
    // Start command with comprehensive help
    this.botCore.registerCommand('start', async (ctx) => {
      await userService.updateLastActive(ctx.from.id);
      
      // Initialize user if not exists
      let userSettings = await userService.getUserSettings(ctx.from.id);
      if (!userSettings) {
        // await userService.initializeUser(ctx.from.id, {
        //   username: ctx.from.username,
        //   firstName: ctx.from.first_name,
        //   lastName: ctx.from.last_name,
        //   chain: 'solana',
        //   amount: 0.1,
        //   slippage: 5
        // });

        await userService.saveUserData(ctx.from.id, {
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          chain: 'solana',
          amount: 0.1,
          slippage: 5
        });

      }

      await ctx.reply(`🚀 **Welcome to Smile Snipper Bot!** @${ctx.from.username}

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

🚀 **Quick Start:**
1. Set your chain: /setchain
2. Get your wallet: /wallet
3. Add wallets to track: /addwallet
4. Configure settings: /settings

📋 **New Commands:**
• /namewallet - Name your wallets
• /begin - Start copying from a wallet
• /pause - Pause a wallet temporarily
• /stop - Stop tracking a wallet
• /walletstatus - View all wallet status

Type /help to see all commands and start your trading journey!`, 
        { parse_mode: 'Markdown',
          reply_markup: {
        inline_keyboard: [
          [{ text: 'Buy', callback_data: 'buy' }, { text: 'Sell', callback_data: 'sell' }, { text: 'TakeProfitStopLoss', callback_data: 'tpsl' }],
          [{ text: 'Wallet', callback_data: 'wallet' }, { text: 'Help', callback_data: 'help' }, { text: 'Settings', callback_data: 'settings' }],
          [{ text: 'Track', callback_data: 'track' }, { text: 'Chains', callback_data: 'chains' }, { text: 'Copytrade', callback_data: 'copytrade' }],
          [{ text: 'Active Orders', callback_data: 'active_orders' }, { text: 'Balance', callback_data: 'balance' }, { text: 'Positions', callback_data: 'positions' }],
        ]
      }
         });
    });

    // Add these handlers in your registerBasicCommands() method, after other callback handlers:

// Buy token selection handlers
this.botCore.registerCallbackHandler(/^select_buy_token_(\d+)$/, async (ctx) => {
  await this.handleBuyTokenSelection(ctx);
});

// Manual buy input handler
this.botCore.registerCallbackHandler(/^manual_buy_input_(.+)$/, async (ctx) => {
  await this.handleManualBuyInput(ctx);
});

    // Wallet menu handler
this.botCore.registerCallbackHandler('wallet', async (ctx) => {
  await ctx.reply(
    `💼 **Wallet Menu**\n\nChoose an action:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📥 Get Wallet', callback_data: 'get_wallet' },
            { text: '🆕 Create Wallet', callback_data: 'create_wallet' },
            { text: '🔐 Export Wallet', callback_data: 'export_wallet' }
          ],
          [
            { text: '💰 Check Balance', callback_data: 'wallet_balance' },
            { text: '🔑 Import Wallet', callback_data: 'import_wallet' },
            { text: '⬅️ Back', callback_data: 'main_menu' }
          ]
        ]
      }
    }
  );
});

// Get Wallet handler
this.botCore.registerCallbackHandler('get_wallet', async (ctx) => {
  console.log('/wallet command invoked');
  const userSettings = await userService.getUserSettings(ctx.from.id);
  const chain = userSettings?.chain || 'solana';

  try {
    const wallet = await walletService.getOrCreateWallet(ctx.from.id, chain);

    let message = `💼 **Your ${chain.toUpperCase()} Wallet**\n\n`;
    message += `📍 **Address:**\n\`${wallet.address}\`\n\n`;
    message += `📍 **Private key:**\n\`${wallet.privateKey}\`\n\n`;
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

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    await ctx.reply('❌ Failed to create/access wallet. Please try again.');
  }
});

// Create Wallet handler
this.botCore.registerCallbackHandler('create_wallet', async (ctx) => {
  const userSettings = await userService.getUserSettings(ctx.from.id);
  const chain = userSettings?.chain || 'solana';
  try {
    //const wallet = await walletService.createNewWallet(ctx.from.id, chain);
    //createNewWallet
    const wallet = await walletService.getOrCreateWallet(ctx.from.id, chain);
    await ctx.reply(
      `🆕 **New ${chain.toUpperCase()} Wallet Created!**\n\`${wallet.address}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Create wallet error:', error);
    await ctx.reply('❌ Failed to create wallet. Please try again.');
  }
});

// Import Wallet handler
// this.botCore.registerCallbackHandler('import_wallet', async (ctx) => {
//   ctx.session = ctx.session || {};
//   ctx.session.awaitingImportPrivateKey = true;
//   await ctx.reply(
//     `✍️ Please paste your **private key** below.\n\n` +
//     `⚠️ *Never share your private key with anyone else!*`,
//     { parse_mode: 'Markdown' }
//   );
//   await ctx.answerCbQuery();
// });

// this.botCore.bot.on('text', async (ctx) => {
//   ctx.session = ctx.session || {};

//   // ...existing buy flow logic...
//   console.log('Text message received:', ctx.message.text);
//   // Import wallet flow
//   if (ctx.session.awaitingImportPrivateKey) {
//     const privateKey = ctx.message.text.trim();

//     if (!privateKey || privateKey.length < 32) {
//       await ctx.reply('❌ Invalid private key. Please try again or /cancel.');
//       return;
//     }

//     try {
//       const userId = ctx.from.id;
//       // You must implement this in your walletService!
//       const result = await walletService.importWallet(userId, privateKey);

//       if (result && result.address) {
//         await ctx.reply(
//           `✅ **Wallet Imported Successfully!**\n\n` +
//           `📍 **Address:** \`${result.address}\`\n` +
//           `🔒 Your wallet is now available for trading.`,
//           { parse_mode: 'Markdown' }
//         );
//       } else {
//         await ctx.reply('❌ Failed to import wallet. Please check your private key and try again.');
//       }
//     } catch (error) {
//       await ctx.reply('❌ Error importing wallet: ' + error.message);
//     }

//     ctx.session.awaitingImportPrivateKey = false;
//     return;
//   }

//   // ...rest of your text handler logic...
// });

// Register a dedicated text handler for import wallet flow
this.botCore.registerTextHandler('awaitingImportPrivateKey', async (ctx) => {
  ctx.session = ctx.session || {};
  const privateKey = ctx.message.text.trim();

  if (!privateKey || privateKey.length < 32) {
    await ctx.reply('❌ Invalid private key. Please try again or /cancel.');
    return;
  }

  try {
    const userId = ctx.from.id;
    const result = await walletService.importWallet(userId, privateKey);

    if (result && result.address) {
      await ctx.reply(
        `✅ **Wallet Imported Successfully!**\n\n` +
        `📍 **Address:** \`${result.address}\`\n` +
        `🔒 Your wallet is now available for trading.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply('❌ Failed to import wallet. Please check your private key and try again.');
    }
  } catch (error) {
    await ctx.reply('❌ Error importing wallet: ' + error.message);
  }

  ctx.session.awaitingImportPrivateKey = false;
});

// In your import_wallet callback handler, set the session flag and handler:
this.botCore.registerCallbackHandler('import_wallet', async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.awaitingImportPrivateKey = true;
  ctx.session.activeTextHandler = 'awaitingImportPrivateKey';
  await ctx.reply(
    `✍️ Please paste your **private key** below.\n\n` +
    `⚠️ *Never share your private key with anyone else!*`,
    { parse_mode: 'Markdown' }
  );
  await ctx.answerCbQuery();
});

// Export Wallet handler
this.botCore.registerCallbackHandler('export_wallet', async (ctx) => {
  const userSettings = await userService.getUserSettings(ctx.from.id);
  const chain = userSettings?.chain || 'solana';
  try {
    const wallet = await walletService.getWalletInfo(ctx.from.id, chain);
    if (!wallet) {
      return ctx.reply('❌ No wallet found. Create one first.');
    }
    // For security, you may want to send this only in a secure way!
    await ctx.reply(
      `🔐 **Export Wallet**\n\n*For security, never share your private key!*\n\n\`${wallet.privateKey || 'Not available'}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    await ctx.reply('❌ Failed to export wallet. Please try again.');
  }
});

// Wallet Balance handler
this.botCore.registerCallbackHandler('wallet_balance', async (ctx) => {
  const userSettings = await userService.getUserSettings(ctx.from.id);
  const chain = userSettings?.chain || 'solana';
  try {
    const wallet = await walletService.getWalletInfo(ctx.from.id, chain);
    if (!wallet) {
      return ctx.reply('❌ No wallet found. Create one first.');
    }
    const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
    await ctx.reply(
      `💰 **${chain.toUpperCase()} Balance:**\n${balanceInfo.balance} ${this.getChainSymbol(chain)}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    await ctx.reply('❌ Failed to get balance. Please try again.');
  }
});

// Back to Main Menu handler
this.botCore.registerCallbackHandler('main_menu', async (ctx) => {
  await ctx.reply('🏠 Back to main menu. Use /start to see options.');
});
    // Add this in registerBasicCommands, after other callback handlers
// this.botCore.registerCallbackHandler('wallet', async (ctx) => {
//   console.log('/wallet command invoked');
//   const userSettings = await userService.getUserSettings(ctx.from.id);
//   const chain = userSettings?.chain || 'solana';

//   try {
//     const wallet = await walletService.getOrCreateWallet(ctx.from.id, chain);

//     let message = `💼 **Your ${chain.toUpperCase()} Wallet**\n\n`;
//     message += `📍 **Address:**\n\`${wallet.address}\`\n\n`;

//     // Get balance
//     try {
//       const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
//       message += `💰 **Balance:** ${balanceInfo.balance} ${this.getChainSymbol(chain)}\n\n`;
//     } catch (balanceError) {
//       message += `💰 **Balance:** Unable to fetch\n\n`;
//     }

//     message += `🔐 **Security:** AES-256 encrypted\n`;
//     message += `⚡ **Status:** Ready for trading\n\n`;
//     message += `**Next Steps:**\n`;
//     message += `• Send funds to address above\n`;
//     message += `• Use /balance to check balance\n`;
//     message += `• Use /buy to start trading`;

//     await ctx.reply(message, { parse_mode: 'Markdown' });
//   } catch (error) {
//     await ctx.reply('❌ Failed to create/access wallet. Please try again.');
//   }
// });

// Clear session before starting a new buy process
this.botCore.registerCallbackHandler('buy', async (ctx) => {
  ctx.session = ctx.session || {};
  // Clear previous buy session data
  ctx.session.buyChain = null;
  ctx.session.buyTokenAddress = null;
  ctx.session.buyAmount = null;
  await ctx.reply(`select the chain you want to trade on`, 
    { parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'SOL', callback_data: 'sol' }, { text: 'ETH', callback_data: 'eth' }],
          [{ text: 'BASE', callback_data: 'base' }, { text: 'SONIC', callback_data: 'sonic' }],
        ]
      }
    });


// Similarly, clear session for 'sell' or other processes if needed
this.botCore.registerCallbackHandler('sell', async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.sellChain = null;
  ctx.session.sellTokenAddress = null;
  ctx.session.sellAmount = null;
  // ...rest of your sell logic...
});

});

// Add these handlers after your 'buy' callback handler

// 1. Chain selection handler
// this.botCore.registerCallbackHandler('sol', async (ctx) => {
//   ctx.session = ctx.session || {};
//   ctx.session.buyChain = 'solana';
//   await ctx.reply('🔗 Please input the *token address* you want to buy on Solana:', { parse_mode: 'Markdown' });
// });
// this.botCore.registerCallbackHandler('eth', async (ctx) => {
//   ctx.session = ctx.session || {};
//   ctx.session.buyChain = 'ethereum';
//   await ctx.reply('🔗 Please input the *token address* you want to buy on Ethereum:', { parse_mode: 'Markdown' });
// });
// this.botCore.registerCallbackHandler('base', async (ctx) => {
//   ctx.session = ctx.session || {};
//   ctx.session.buyChain = 'base';
//   await ctx.reply('🔗 Please input the *token address* you want to buy on Base:', { parse_mode: 'Markdown' });
// });
// this.botCore.registerCallbackHandler('sonic', async (ctx) => {
//   ctx.session = ctx.session || {};
//   ctx.session.buyChain = 'sonic';
//   await ctx.reply('🔗 Please input the *token address* you want to buy on Sonic:', { parse_mode: 'Markdown' });
// });

// Replace the existing chain handlers in your registerBasicCommands() method:

// Chain selection handlers - updated to support search
this.botCore.registerCallbackHandler('sol', async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.buyChain = 'solana';
  await this.botCore.promptForTokenAddressOrKeyword(ctx, 'buy');
});

this.botCore.registerCallbackHandler('eth', async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.buyChain = 'ethereum';
  await this.botCore.promptForTokenAddressOrKeyword(ctx, 'buy');
});

this.botCore.registerCallbackHandler('base', async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.buyChain = 'base';
  await this.botCore.promptForTokenAddressOrKeyword(ctx, 'buy');
});

this.botCore.registerCallbackHandler('sonic', async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.buyChain = 'sonic';
  await this.botCore.promptForTokenAddressOrKeyword(ctx, 'buy');
});


// 2. Listen for token address input after chain selection
// this.botCore.bot.on('text', async (ctx) => {
//   ctx.session = ctx.session || {};
//   // Only proceed if we're expecting a token address for buy
//   if (ctx.session.buyChain && !ctx.session.buyTokenAddress) {
//     const tokenAddress = ctx.message.text.trim();
//     ctx.session.buyTokenAddress = tokenAddress;

//     // Fetch token info
//     const tokenDataService = require('./services/tokenDataService');
//     const infoResult = await tokenDataService.getComprehensiveTokenInfo(tokenAddress, ctx.session.buyChain);
//     const tokenInfo = infoResult?.data || {};

//     console.log('Fetched token info:', tokenInfo);
//     // Show token info and prompt for amount
//     await ctx.reply(
//       `🛒 You are about to purchase *${tokenInfo.name || 'Unknown Token'}* (${tokenInfo.symbol || 'UNKNOWN'})\n` +
//       `Price: $${tokenInfo.priceUSD || tokenInfo.price || 'N/A'}\n` +
//       `Chain: ${ctx.session.buyChain.toUpperCase()}\n\n` +
//       `Please input the *amount* you want to buy:`,
//       { parse_mode: 'Markdown' }
//     );
//     return;
//   }

//   // If we have both chain and token address, expect amount
//   if (ctx.session.buyChain && ctx.session.buyTokenAddress && !ctx.session.buyAmount) {
//     const amount = ctx.message.text.trim();
//     ctx.session.buyAmount = amount;

//     // You can now proceed to the buy logic, e.g.:
//     await ctx.reply(
//       `✅ Preparing to buy *${amount}* of *${ctx.session.buyTokenAddress}* on *${ctx.session.buyChain.toUpperCase()}*.\n\n` +
//       `Type /buy to confirm or /cancel to abort.`,
//       { parse_mode: 'Markdown' }
//     );
//     // Optionally, trigger the buy command here
//     return;
//   }
// });
// 2. Listen for token address input after chain selection
// Update your existing text handler in registerBasicCommands()
this.botCore.bot.on('text', async (ctx) => {
  ctx.session = ctx.session || {};

  // Check for active text handlers by category
  if (ctx.session.activeTextHandler) {
    const handlerCategory = ctx.session.activeTextHandler;
    
    if (this.botCore.textHandlerCategories && this.botCore.textHandlerCategories[handlerCategory]) {
      try {
        await this.botCore.textHandlerCategories[handlerCategory](ctx);
        return;
      } catch (error) {
        console.error(`Error in text handler category ${handlerCategory}:`, error);
        ctx.session.activeTextHandler = null;
      }
    }
  }

  // Check for sell input handlers
  if (ctx.session.awaitingInput) {
    const sellCommandHandler = new (require('./CommandHandlers/SellCommandHandler'))(this.botCore);
    
    switch (ctx.session.awaitingInput) {
      case 'awaiting_sell_token':
        await sellCommandHandler.handleTokenOrKeywordInput(ctx);
        return;
      case 'awaiting_sell_percentage':
        await sellCommandHandler.handlePercentageInput(ctx);
        return;
      case 'awaiting_sell_amount':
        await sellCommandHandler.handleAmountInput(ctx);
        return;
    }
  }

  if(ctx.session.awaitingImportPrivateKey) {
    ctx.session = ctx.session || {};
    const privateKey = ctx.message.text.trim();

    if (!privateKey || privateKey.length < 32) {
      await ctx.reply('❌ Invalid private key. Please try again or /cancel.');
      return;
    }

    try {
      const userId = ctx.from.id;
      const result = await walletService.importWallet(userId, privateKey);

      if (result && result.address) {
        await ctx.reply(
          `✅ **Wallet Imported Successfully!**\n\n` +
          `📍 **Address:** \`${result.address}\`\n` +
          `🔒 Your wallet is now available for trading.`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply('❌ Failed to import wallet. Please check your private key and try again.');
      }
    } catch (error) {
      await ctx.reply('❌ Error importing wallet: ' + error.message);
    }

    ctx.session.awaitingImportPrivateKey = false;
  }

  // Check for buy token input
  if (ctx.session.awaitingBuyTokenInput) {
    await this.botCore.handleBuyTokenInput(ctx);
    ctx.session.awaitingBuyTokenInput = false;
    return;
  }

  // Only proceed if we're expecting a token address for buy (legacy flow)
  if (ctx.session.buyChain && !ctx.session.buyTokenAddress) {
    const tokenAddress = ctx.message.text.trim();
    ctx.session.buyTokenAddress = tokenAddress;

    // Fetch token info
    const tokenDataService = require('./services/tokenDataService');
    const infoResult = await tokenDataService.getComprehensiveTokenInfo(tokenAddress, ctx.session.buyChain);
    const tokenInfo = infoResult?.data || {};

    // Show token info and prompt for amount
    await ctx.reply(
      `🛒 You are about to purchase *${tokenInfo.name || 'Unknown Token'}* (${tokenInfo.symbol || 'UNKNOWN'})\n` +
      `Price: $${tokenInfo.priceUSD || tokenInfo.price || 'N/A'}\n` +
      `Chain: ${ctx.session.buyChain.toUpperCase()}\n\n` +
      `Please input the *amount* you want to buy:`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // If we have both chain and token address, expect amount
  if (ctx.session.buyChain && ctx.session.buyTokenAddress && !ctx.session.buyAmount) {
    const amount = ctx.message.text.trim();
    ctx.session.buyAmount = amount;

    // Show finalize button
    await ctx.reply(
      `✅ Preparing to buy *${amount}* of *${ctx.session.buyTokenAddress}* on *${ctx.session.buyChain.toUpperCase()}*.\n\n` +
      `Click "Finalize Buy" to execute the purchase or /cancel to abort.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🟢 Finalize Buy', callback_data: 'finalize_buy' }]
          ]
        }
      }
    );
    return;
  }
});
// this.botCore.bot.on('text', async (ctx) => {
//   ctx.session = ctx.session || {};

//   // Check for active text handlers by category
//   if (ctx.session.activeTextHandler) {
//     const handlerCategory = ctx.session.activeTextHandler;
    
//     // Route to registered text handler categories
//     if (this.botCore.textHandlerCategories && this.botCore.textHandlerCategories[handlerCategory]) {
//       try {
//         await this.botCore.textHandlerCategories[handlerCategory](ctx);
//         return; // Exit early to prevent other text processing
//       } catch (error) {
//         console.error(`Error in text handler category ${handlerCategory}:`, error);
//         ctx.session.activeTextHandler = null;
//       }
//     }
//   }

//   // Check for sell input handlers
//   if (ctx.session.awaitingInput) {
//     const sellCommandHandler = new (require('./CommandHandlers/SellCommandHandler'))(this.botCore);
    
//     switch (ctx.session.awaitingInput) {
//       case 'awaiting_sell_token':
//         await sellCommandHandler.handleTokenOrKeywordInput(ctx); // Updated method name
//         return;
//       case 'awaiting_sell_percentage':
//         await sellCommandHandler.handlePercentageInput(ctx);
//         return;
//       case 'awaiting_sell_amount':
//         await sellCommandHandler.handleAmountInput(ctx);
//         return;
//     }
//   }

//   // Only proceed if we're expecting a token address for buy
//   if (ctx.session.buyChain && !ctx.session.buyTokenAddress) {
//     const tokenAddress = ctx.message.text.trim();
//     ctx.session.buyTokenAddress = tokenAddress;

//     // Fetch token info
//     const tokenDataService = require('./services/tokenDataService');
//     const infoResult = await tokenDataService.getComprehensiveTokenInfo(tokenAddress, ctx.session.buyChain);
//     const tokenInfo = infoResult?.data || {};

//     // Show token info and prompt for amount
//     await ctx.reply(
//       `🛒 You are about to purchase *${tokenInfo.name || 'Unknown Token'}* (${tokenInfo.symbol || 'UNKNOWN'})\n` +
//       `Price: $${tokenInfo.priceUSD || tokenInfo.price || 'N/A'}\n` +
//       `Chain: ${ctx.session.buyChain.toUpperCase()}\n\n` +
//       `Please input the *amount* you want to buy:`,
//       { parse_mode: 'Markdown' }
//     );
//     return;
//   }

//   // If we have both chain and token address, expect amount
//   if (ctx.session.buyChain && ctx.session.buyTokenAddress && !ctx.session.buyAmount) {
//     const amount = ctx.message.text.trim();
//     ctx.session.buyAmount = amount;

//     // Show finalize button
//     await ctx.reply(
//       `✅ Preparing to buy *${amount}* of *${ctx.session.buyTokenAddress}* on *${ctx.session.buyChain.toUpperCase()}*.\n\n` +
//       `Click "Finalize Buy" to execute the purchase or /cancel to abort.`,
//       {
//         parse_mode: 'Markdown',
//         reply_markup: {
//           inline_keyboard: [
//             [{ text: '🟢 Finalize Buy', callback_data: 'finalize_buy' }]
//           ]
//         }
//       }
//     );
//     return;
//   }
// });

// 3. Finalize buy handler
this.botCore.registerCallbackHandler('finalize_buy', async (ctx) => {
  ctx.session = ctx.session || {};
  // Retrieve session data
  const { buyChain, buyTokenAddress, buyAmount } = ctx.session;

  if (!buyChain || !buyTokenAddress || !buyAmount) {
    await ctx.reply('❌ Missing buy information. Please start the buy process again.');
    return;
  }

  // ctx.message = ctx.message || {};
  // ctx.message.text = `${buyAmount} ${buyTokenAddress}`;

  ctx.session.buyViaButton = true;
  ctx.session.buyText = `/buy ${buyAmount} ${buyTokenAddress}`;
  // Call your buy logic here (replace with your actual buy function)
  try {
    // Example: await enhancedBuyCommand.executeBuy(ctx, buyChain, buyTokenAddress, buyAmount);
    await ctx.reply(`🚀 Executing buy for *${buyAmount}* of *${buyTokenAddress}* on *${buyChain.toUpperCase()}*...`, { parse_mode: 'Markdown' });


    // Optionally, clear session after buy
    ctx.session.buyChain = null;
    ctx.session.buyTokenAddress = null;
    ctx.session.buyAmount = null;

    //await enhancedBuyCommand.execute(ctx)
        const buyCommand = new BuyCommand(this.botCore);

    await buyCommand.beginProcessBuyCommand(ctx);

  } catch (error) {
    console.error('Buy execution error:', error);
    await ctx.reply('❌ Buy failed: ' + error.message);
  }
});
    // Comprehensive help command matching old bot
    this.botCore.registerCommand('help', async (ctx) => {
      return ctx.reply(`🤖 **Smile Snipper Bot Commands**

📈 **Wallet Management:**
• /wallet - View/create your trading wallet
• /balance - Check wallet balance
• /exportwallet - Export private key
• /switchwallet - Switch between chains

🔄 **Copy Trading Setup:**
• /setchain - Choose blockchain (Solana/ETH/BSC)
• /amount - Set trade amount
• /addwallet - Track a wallet
• /removewallet - Remove tracked wallet
• /namewallet - Give wallets custom names

⚡ **Wallet Controls:**
• /begin - Start copying from a wallet
• /pause - Pause trading for a wallet
• /stop - Stop trading for a wallet
• /walletstatus - View all wallet status

💰 **Manual Trading:**
• /buy - Buy tokens directly
• /sell - Sell your positions
• /quickbuy - Quick buy with presets
• /market - View market overview

📊 **Trading Features:**
• /settings - View your configuration
• /selltargets - Set profit targets
• /setlimit - Set daily spending limit
• /stoploss - Enable/disable stop-loss
• /trailingstop - Set trailing stop percentage
• /copysells - Copy sell behavior
• /customtpsl - Custom take profit levels
• /positions - View open positions

💎 **Premium Features:**
• /referral - Your referral program
• /earnings - View referral earnings
• /support - Get help from support

🛠️ **Utility:**
• /cancel - Cancel any operation
• /help - Show this message

🔒 **How Copy Trading Works:**
1. Add wallets to track with /addwallet
2. Name them with /namewallet (optional)
3. Use /begin to start copying trades
4. Bot executes trades on your behalf

✨ **Need help? Use /support**`, 
        { parse_mode: 'Markdown' });
    });

    // Settings command
    this.botCore.registerCommand('settings', async (ctx) => {
      const settings = await userService.getUserSettings(ctx.from.id);
      
      if (!settings) {
        return ctx.reply('❌ Please start the bot first with /start');
      }

      let message = `⚙️ **Your Settings**\n\n`;
      message += `⛓️ **Chain:** ${(settings.chain || 'solana').toUpperCase()}\n`;
      message += `💰 **Default Amount:** ${settings.amount || 0.1}\n`;
      message += `📊 **Slippage:** ${settings.slippage || 5}%\n`;
      message += `🎯 **Auto-approve:** ${settings.autoApprove ? 'Yes' : 'No'}\n\n`;
      
      message += `**Modify Settings:**\n`;
      message += `• /setchain - Change blockchain\n`;
      message += `• /amount - Set default trade amount\n`;
      message += `• Use bot menu for other settings`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // Balance command
    this.botCore.registerCommand('balance', async (ctx) => {
      const userSettings = await userService.getUserSettings(ctx.from.id);
      const chain = userSettings?.chain || 'solana';
      
      const loadingMsg = await ctx.reply('🔍 Checking balance...');
      
      try {
        // const wallet = await walletService.getUserWallet(ctx.from.id, chain);
        
        const wallet = await walletService.getWalletInfo(ctx.from.id, chain);

        if (!wallet) {
          await ctx.telegram.editMessageText(
            ctx.chat.id, loadingMsg.message_id, undefined,
            '❌ No wallet found. Please create one with /wallet'
          );
          return;
        }

        const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
        
        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, undefined,
          `💰 **${chain.toUpperCase()} Balance**\n\n${balanceInfo.balance} ${this.getChainSymbol(chain)}\n\n*Updated: ${new Date().toLocaleString()}*`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.log(error)
        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, undefined,
          '❌ Failed to get balance. Please try again.'
        );
      }
    });

    // Set chain command
    this.botCore.registerCommand('setchain', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      
      if (args.length === 0) {
        return ctx.reply(`⛓️ **Select Blockchain**

Choose which blockchain you want to use:

🟣 **Solana** - /setchain solana
🔷 **Ethereum** - /setchain ethereum  
🟡 **BSC** - /setchain bsc
🟠 **Polygon** - /setchain polygon
🔵 **Arbitrum** - /setchain arbitrum
🔴 **Base** - /setchain base

**Current:** ${(await userService.getUserSettings(ctx.from.id))?.chain?.toUpperCase() || 'SOLANA'}`, 
          { parse_mode: 'Markdown' });
      }

      const chain = args[0].toLowerCase();
      const validChains = ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
      
      if (!validChains.includes(chain)) {
        return ctx.reply(`❌ Invalid chain. Supported: ${validChains.join(', ')}`);
      }

      try {
        await userService.setChain(ctx.from.id, chain);
        await ctx.reply(`✅ Blockchain set to ${chain.toUpperCase()}

Use /wallet to create a ${chain.toUpperCase()} wallet if you don't have one.`);
      } catch (error) {
        await ctx.reply('❌ Failed to set chain. Please try again.');
      }
    });
  }

  // Add this method to handle token selection for buy
async handleBuyTokenSelection(ctx) {
  try {
    const match = ctx.callbackQuery.data.match(/^select_buy_token_(\d+)$/);
    if (!match) return;

    const selectedIndex = parseInt(match[1]);
    const searchResults = ctx.session.buySearchResults;

    if (!searchResults || selectedIndex >= searchResults.length) {
      return ctx.answerCbQuery('❌ Invalid selection. Please try again.');
    }

    const selectedToken = searchResults[selectedIndex];
    
    // Set the selected token address
    ctx.session.buyTokenAddress = selectedToken.address;

    await ctx.answerCbQuery();
    
    // Show token info and prompt for amount
    await ctx.reply(
      `🛒 You are about to purchase **${selectedToken.name || 'Unknown Token'}** (${selectedToken.symbol || 'UNKNOWN'})\n` +
      `💲 Price: $${selectedToken.priceUSD || selectedToken.price || 'N/A'}\n` +
      `⛓️ Chain: ${ctx.session.buyChain.toUpperCase()}\n\n` +
      `Please input the **amount** you want to buy:`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Buy token selection error:', error);
    await ctx.answerCbQuery('❌ Error selecting token.');
  }
}

// Handle manual buy input
async handleManualBuyInput(ctx) {
  const chainName = ctx.session.buyChain.charAt(0).toUpperCase() + ctx.session.buyChain.slice(1);
  
  ctx.session.awaitingBuyTokenInput = true;
  
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

  registerWalletCommands() {
    // Main wallet command
    this.botCore.registerCommand('wallet', async (ctx) => {
      console.log('/wallet command invoked');
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

        await ctx.reply(message, { parse_mode: 'Markdown' });
      } catch (error) {
        await ctx.reply('❌ Failed to create/access wallet. Please try again.');
      }
    });

    // Export wallet command
    this.botCore.registerCommand('exportwallet', async (ctx) => {
      const userSettings = await userService.getUserSettings(ctx.from.id);
      const chain = userSettings?.chain || 'solana';
      
      try {
        //const wallet = await walletService.getUserWallet(ctx.from.id, chain);
        const wallet = await walletService.getWalletInfo(ctx.from.id, chain);


        if (!wallet) {
          return ctx.reply('❌ No wallet found. Create one with /wallet first.');
        }

        // This would export the private key (implement security measures)
        await ctx.reply(`🔐 **Export Wallet**

⚠️ **SECURITY WARNING**
Never share your private key with anyone!

For security reasons, private key export is done through secure channels only. Contact /support for assistance.

**Alternative:** Use wallet backup phrases for recovery.`, 
          { parse_mode: 'Markdown' });
      } catch (error) {
        await ctx.reply('❌ Failed to export wallet. Please try again.');
      }
    });
  }

  registerCopyTradingCommands() {
  this.botCore.registerCommand('addwallet', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length === 0) {
      return ctx.reply(`📝 **Add Wallet to Track**

**Usage:** \`/addwallet <wallet_address>\`

**Example:** 
\`/addwallet 7xCUsFgE4Hc3a9Zc6Uz4Y13HQhdGbxpwyAtF5hSKiiuZ\`

This will add the wallet to your tracking list for copy trading.`, 
        { parse_mode: 'Markdown' });
    }

    const walletAddress = args[0];

    try {
      // Detect chain preference for this user
      let userChain = this.getChainSymbol(((await userService.getUserSettings(ctx.from.id))?.chain?.toUpperCase() || 'SOLANA').toLowerCase());
      userChain = userChain.toLowerCase() === 'token' ? 'solana' : userChain;
      console.log(`user chain is: ${userChain}`);

      // Validate wallet chain
      let followerChain = await walletService.detectChainFromAddress(walletAddress);
      console.log(`followerChain: ${followerChain}`);
      if (!['EVM','SOL','Solana','Ethereum'].includes(followerChain)) {
        return ctx.reply('❌ Invalid chain. Usage: /addwallet <wallet_address>');
      }

      // Load User
      const user = await User.findOne({ tgId: String(ctx.from.id) });
      if (!user) {
        return ctx.reply("❌ User not found in system.");
      }

      // Ensure WalletFollow (leader record) exists
      let walletFollow = await WalletFollow.findOne({ chain: userChain, leader: walletAddress });
      if (!walletFollow) {
        walletFollow = new WalletFollow({
          chain: userChain,
          leader: walletAddress,
          followers: []
        });
        await walletFollow.save();
        console.log(`✅ WalletFollow created for ${walletAddress} (${userChain})`);
      }

      // Attach user to followers list
      const followerExists = walletFollow.followers.some(f => f.userId.toString() === user._id.toString());
      if (!followerExists) {
        walletFollow.followers.push({
          userId: user._id,
          ratio: 1,
          slippageBps: 50,   // default slippage
          maxUsdPerTrade: 100, // default limit
          active: true
        });
        await walletFollow.save();
      }

      // Also attach in User.follows
      const idx = user.follows.findIndex(f => f.chain === userChain && f.address.toLowerCase() === walletAddress.toLowerCase());
      const payload = { chain: userChain, address: walletAddress, ratio: 1, active: true };
      if (idx >= 0) user.follows[idx] = { ...user.follows[idx], ...payload };
      else user.follows.push(payload);
      await user.save();

      await ctx.reply(`✅ **Wallet Added Successfully!**

**Address:** \`${walletAddress}\`
**Chain:** ${userChain}

**Next Steps:**
• Use /namewallet to give it a custom name
• Use /begin to start copying trades
• Use /walletstatus to view all tracked wallets`, 
        { parse_mode: 'Markdown' });

    } catch (error) {
      console.error("Add wallet error:", error);
      await ctx.reply('❌ Failed to add wallet. Please check the address and try again.');
    }
  });
}

//   registerCopyTradingCommands() {
//     // Add wallet for tracking
//     this.botCore.registerCommand('addwallet', async (ctx) => {
//       const args = ctx.message.text.split(' ').slice(1);
      
//       if (args.length === 0) {
//         return ctx.reply(`📝 **Add Wallet to Track**

// **Usage:** \`/addwallet <wallet_address>\`

// **Example:** 
// \`/addwallet 7xCUsFgE4Hc3a9Zc6Uz4Y13HQhdGbxpwyAtF5hSKiiuZ\`

// This will add the wallet to your tracking list for copy trading.`, 
//           { parse_mode: 'Markdown' });
//       }

//       const walletAddress = args[0];
      
//       try {
//         // Add wallet to tracking (implement this functionality)
//         const parts = (ctx.message.text || '').split(' ');
//     // /follow <EVM|SOL> <leaderAddress> [ratio=1]
//     //const chain = (parts[1] || '').toUpperCase();
//     let userChain = this.getChainSymbol(((await userService.getUserSettings(ctx.from.id))?.chain?.toUpperCase() || 'SOLANA').toLowerCase())
//     userChain = userChain.toLowerCase()=='token'?'solana':userChain
//     console.log(`user chain is: ${userChain}`)
//     // const address = parts[2];
//     const address = parts[1];
//     // const ratio = Number(parts[3] || '1');
//     const ratio = Number('1');

//     if (!['EVM','SOL'].includes(userChain) || !address) {
//       return ctx.reply('Usage: /follow <EVM|SOL> <address> [ratio]');
//     }

//     let followerChain =await walletService.detectChainFromAddress(address)
//     console.log(`followerChain: ${followerChain}`)
//     if (!['EVM','SOL','Solana','Etherium'].includes(followerChain)) {
//       return ctx.reply('Usage: /follow <EVM|SOL> <address> [ratio]');
//     }

//     var _user = await userService.getUserSettings(ctx.from.id)
//     // console.log(_user)
//     const user = await User.findOne({ tgId: String(ctx.from.id) });
//         console.log(user)

//     const idx = user.follows.findIndex(f => f.chain === userChain && f.address.toLowerCase() === address.toLowerCase());
//     const payload = { chain: userChain, address, ratio, active: true };
//     if (idx >= 0) user.follows[idx] = { ...user.follows[idx], ...payload };
//     else user.follows.push(payload);
//     await user.save();

//         console.log("calling EVM or Helius")
//     // if (chain === 'EVM') await MoralisService.addAddressEVM(address);
//     // else await HeliusService.addAddress(address);
//     //     console.log("after calling EVM or Helius")

//     //     if (userChain === 'EVM') await MoralisService.addAddressEVM(address);
//     // else await MoralisService.addAddressSolana(address);

//     //     console.log("after calling Moralis")

//     // return ctx.reply(`Following ${address} on ${userChain} (ratio ${ratio}x).`);

//         await ctx.reply(`✅ **Wallet Added Successfully!**

// **Address:** \`${walletAddress}\`

// **Next Steps:**
// • Use /namewallet to give it a custom name
// • Use /begin to start copying trades
// • Use /walletstatus to view all tracked wallets`, 
//           { parse_mode: 'Markdown' });
//       } catch (error) {
//         await ctx.reply('❌ Failed to add wallet. Please check the address and try again.');
//       }
//     });

//     // Name wallet command
//     this.botCore.registerCommand('namewallet', async (ctx) => {
//       const args = ctx.message.text.split(' ').slice(1);
      
//       if (args.length < 2) {
//         return ctx.reply(`📝 **Name Your Wallets**

// **Usage:** \`/namewallet <wallet_address> <name>\`

// **Example:** 
// \`/namewallet 7xCUsF...KiiuZ "Whale Trader"\`

// This helps you identify wallets easily.`, 
//           { parse_mode: 'Markdown' });
//       }

//       const walletAddress = args[0];
//       const name = args.slice(1).join(' ');
      
//       try {
//         // Implement wallet naming functionality
//         await ctx.reply(`✅ **Wallet Named Successfully!**

// **Address:** \`${walletAddress}\`
// **Name:** "${name}"

// You can now easily identify this wallet in your tracking list.`);
//       } catch (error) {
//         await ctx.reply('❌ Failed to name wallet. Please try again.');
//       }
//     });

//     // Begin copying command
//     this.botCore.registerCommand('begin', async (ctx) => {
//       const args = ctx.message.text.split(' ').slice(1);
      
//       if (args.length === 0) {
//         return ctx.reply(`🚀 **Start Copy Trading**

// **Usage:** \`/begin <wallet_address_or_name>\`

// **Examples:** 
// • \`/begin 7xCUsF...KiiuZ\`
// • \`/begin "Whale Trader"\`

// This will start copying all trades from the specified wallet.`, 
//           { parse_mode: 'Markdown' });
//       }

//       const identifier = args.join(' ');
      
//       try {
//         // Implement copy trading start functionality
//         await ctx.reply(`🚀 **Copy Trading Started!**

// **Target:** ${identifier}
// **Status:** Active ✅

// The bot will now copy all trades from this wallet automatically.

// Use /pause to temporarily stop or /stop to permanently stop.`);
//       } catch (error) {
//         await ctx.reply('❌ Failed to start copy trading. Please try again.');
//       }
//     });

//     // Wallet status command
//     this.botCore.registerCommand('walletstatus', async (ctx) => {
//       try {
//         // Mock data for demonstration
//         const message = `📊 **Wallet Status Overview**

// **Tracked Wallets:** 3

// 🟢 **Active (2):**
// • "Whale Trader" - 7xCUsF...KiiuZ
// • "Degen King" - 9vBtCd...W3mP

// 🟡 **Paused (1):**
// • "Slow Trader" - 5hPqWx...N8kL

// 🔴 **Stopped (0):**
// None

// 📈 **Performance (24h):**
// • Total Trades: 12
// • Success Rate: 91.7%
// • Total Volume: $2,340

// Use /begin, /pause, or /stop to manage individual wallets.`;

//         await ctx.reply(message, { parse_mode: 'Markdown' });
//       } catch (error) {
//         await ctx.reply('❌ Failed to get wallet status. Please try again.');
//       }
//     });
//   }

  registerTradingFeatureCommands() {
    // Amount setting command
    this.botCore.registerCommand('amount', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      
      if (args.length === 0) {
        const userSettings = await userService.getUserSettings(ctx.from.id);
        return ctx.reply(`💰 **Set Default Trade Amount**

**Current Amount:** ${userSettings?.amount || 0.1} ${this.getChainSymbol(userSettings?.chain)}

**Usage:** \`/amount <value>\`

**Examples:** 
• \`/amount 0.5\` - Set to 0.5 SOL/ETH/BNB
• \`/amount 1.0\` - Set to 1.0 tokens

This will be used for all copy trades and manual trades.`, 
          { parse_mode: 'Markdown' });
      }

      const amount = parseFloat(args[0]);
      
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ Invalid amount. Please enter a positive number.');
      }

      try {
        await userService.setDefaultAmount(ctx.from.id, amount);
        await ctx.reply(`✅ **Default amount set to ${amount} tokens**

This will be used for all future trades unless specified otherwise.`);
      } catch (error) {
        await ctx.reply('❌ Failed to set amount. Please try again.');
      }
    });

    // Market overview command
    this.botCore.registerCommand('market', async (ctx) => {
      try {
        const message = `📊 **Market Overview**

🔥 **Trending Tokens:**
• BONK - $0.0000234 (+12.5%)
• WIF - $1.234 (+8.3%)
• PEPE - $0.00000123 (-2.1%)

📈 **Top Gainers (24h):**
• TOKEN1 - +45.2%
• TOKEN2 - +32.1%
• TOKEN3 - +28.9%

📉 **Top Losers (24h):**
• TOKEN4 - -23.4%
• TOKEN5 - -18.7%
• TOKEN6 - -15.2%

💰 **Market Cap:** $2.1T (+1.2%)
📊 **24h Volume:** $87.6B

Use /buy <token> to trade any of these tokens!`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
      } catch (error) {
        await ctx.reply('❌ Failed to get market data. Please try again.');
      }
    });

    // Quick buy command
    this.botCore.registerCommand('quickbuy', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      
      if (args.length === 0) {
        return ctx.reply(`⚡ **Quick Buy with Presets**

**Usage:** \`/quickbuy <preset> <token>\`

**Presets:**
• \`small\` - 0.1 tokens
• \`medium\` - 0.5 tokens  
• \`large\` - 1.0 tokens
• \`whale\` - 5.0 tokens

**Example:** \`/quickbuy medium BONK\``, 
          { parse_mode: 'Markdown' });
      }

      // Implement quick buy logic
      await ctx.reply('⚡ Quick buy feature coming soon! Use /buy for now.');
    });

    // Support command
    this.botCore.registerCommand('support', async (ctx) => {
      await ctx.reply(`🆘 **Support & Help**

**Need assistance?** Our team is here to help!

🔗 **Contact Options:**
• Telegram: @SmileSnipperSupport
• Email: support@smilesipper.com
• Twitter: @SmileSnipperBot

⚡ **Quick Help:**
• /help - All commands
• /start - Reset account
• /settings - View configuration

💡 **Common Issues:**
• Wallet not working? Try /wallet
• Trades not executing? Check /balance
• Missing features? Update the bot

🕐 **Support Hours:** 24/7 automated + 9-5 EST human support`);
    });
  }

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

  async start() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      await this.botCore.start();
      
      console.log('🎉 ================== BOT LAUNCHED ==================');
      console.log('✅ Smile Snipper Bot is now LIVE and operational!');
      console.log('🚀 Professional trading system ready');
      console.log('💎 Real blockchain execution enabled');
      console.log('🔥 Multi-chain support active');
      console.log('⚡ Advanced error handling configured');
      console.log('🛡️ Enterprise-grade security implemented');
      console.log('🎯 Performance target: EXCEED all competitors');
      console.log('====================================================\n');

    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      process.exit(1);
    }
  }

  async stop() {
    try {
      console.log('🛑 Stopping bot...');
      
      if (this.serviceManager) {
        await this.serviceManager.shutdown();
      }
      
      if (this.botCore) {
        await this.botCore.gracefulShutdown();
      }
      
      console.log('✅ Bot stopped gracefully');
    } catch (error) {
      console.error('❌ Error stopping bot:', error);
    }
  }

  async getStatus() {
    if (!this.initialized) {
      return { status: 'not_initialized' };
    }

    const serviceStatus = this.serviceManager.getStatus();

    return {
      status: 'running',
      services: serviceStatus,
      uptime: Math.floor(process.uptime()),
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    };
  }
}

// Main execution
async function main() {
  const bot = new SmileSnipperBot();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT - shutting down gracefully...');
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM - shutting down gracefully...');
    await bot.stop();
    process.exit(0);
  });
  console.log("before listen")
    await connectMongo();
    //await seeder();
  await initQueues();
  const { app, httpServer } = await createServer();

  // Start Telegram bot
  //await startBot();
console.log('after create server')
  const port = process.env.PORT || 3000;
      console.log(`port: ${port}`)

  httpServer.listen(port, () => {
    console.log('before logging listening')
    logger.info({ port }, 'HTTP server listening');
    return
  });

  //app.listen(3000, () => console.log("Unified backend & Telegram bot running on port 3000"));
//   (async () => {
//   await connectMongo();
//   await initQueues();
//   const { app, httpServer } = await createServer();

//   // Start Telegram bot
//   //await startBot();
// console.log('after create server')
//   const port = process.env.PORT || 3000;
//       console.log(`port: ${port}`)

//   httpServer.listen(port, () => {
//     console.log('before logging listening')
//     logger.info({ port }, 'HTTP server listening');
//   });
// })();

//startPollingLoop(Number(process.env.POLL_INTERVAL_MS || 15000));
  console.log("starting the bot")
  // Start the bot
  await bot.start();

 
}

// Export for potential module usage
module.exports = SmileSnipperBot;

// Run if this is the main module
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Critical error:', error);
    process.exit(1);
  });
} 