// services/realTradingExecutor.js - Enhanced Real Blockchain Trading Execution Engine
const { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL, SystemProgram } = require('@solana/web3.js');
const { ethers, parseUnits, formatUnits } = require('ethers');
const { getRPCManager } = require('./rpcManager');
const walletService = require('./walletService');
const userService = require('../users/userService');
const tokenDataService = require('./tokenDataService');
const axios = require('axios');
  const { Orca, Network, OrcaPoolConfig, getOrca, OrcaFarmConfig } = require("@orca-so/sdk");
// const { Jupiter } = require("@jup-ag/core");
const { createJupiterApiClient } = require("@jup-ag/api");
// Jupiter API for Solana swaps
const JUPITER_API = 'https://quote-api.jup.ag/v6';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

// DEX router addresses for EVM chains
const DEX_ROUTERS = {
  ethereum: {
    uniswapV2: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    sushiswap: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'
  },
  bsc: {
    pancakeswap: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    pancakeswapV3: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    biswap: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8'
  },
  polygon: {
    quickswap: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
    sushiswap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'
  },
  arbitrum: {
    uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    sushiswap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'
  },
  base: {
    uniswapV3: '0x2626664c2603336E57B271c5C0b26F421741e481',
    baseswap: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86'
  }
};

// Common token addresses for each chain
const COMMON_TOKENS = {
  solana: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  },
  ethereum: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86a33E6417aAb0D765f5c11Bbf8Ff862f2CC9',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
  },
  bsc: {
    BNB: '0x0000000000000000000000000000000000000000',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56'
  },
  polygon: {
    MATIC: '0x0000000000000000000000000000000000000000',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
  },
  arbitrum: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
  },
  base: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  }
};
    const CACHE_DURATION = 20 * 60 * 1000; // 5 minutes

class RealTradingExecutor {
  constructor() {
    this.rpcManager = getRPCManager();
    this.initialized = false;
    this.pendingTransactions = new Map();
    this.executionStats = {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalVolume: 0,
      chainStats: {}
    };

// cache object
  this.tokenListCache = {
    data: null,
    timestamp: 0
  };
    // Auto-initialize
    this.initialize();
  }

  async initialize() {
    try {
      console.log('🔧 Initializing Real Trading Executor...');
      
      // Initialize RPC manager if not ready
      if (!this.rpcManager.getStatus().initialized) {
        console.log('⏳ Waiting for RPC Manager initialization...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Verify RPC connections
      const rpcStatus = this.rpcManager.getStatus();
      console.log(`📊 RPC Status: ${rpcStatus.healthyRPCs}/${rpcStatus.totalRPCs} healthy connections`);
      
      if (rpcStatus.healthyRPCs === 0) {
        console.warn('⚠️ No healthy RPC connections - trades may fail');
      }
      
      this.initialized = true;
      console.log('✅ Real Trading Executor initialized successfully');
      console.log('🚀 Ready for cross-chain trading execution');
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to initialize Real Trading Executor:', error);
      this.initialized = false;
      return { success: false, error: error.message };
    }
  }

  // Execute buy order on blockchain with enhanced error handling
  // async executeBuyOrder(userId, params) {
  //   const tradeId = `buy_${userId}_${Date.now()}`;
    
  //   try {
  //     console.log(`🟢 Executing BUY order ${tradeId}:`, {
  //       token: params.tokenAddress,
  //       amount: params.amount,
  //       chain: params.chain
  //     });
      
  //     if (!this.initialized) {
  //       await this.initialize();
  //       if (!this.initialized) {
  //         throw new Error('Trading executor failed to initialize');
  //       }
  //     }

  //     const { tokenAddress, amount, chain, slippage = 5, wallet } = params;
      
  //     // Validate parameters
  //     if (!tokenAddress || !amount || !chain) {
  //       throw new Error('Missing required parameters: tokenAddress, amount, chain');
  //     }

  //     if (amount <= 0) {
  //       throw new Error('Invalid amount: must be greater than 0');
  //     }

  //     // Get user wallet private key
  //     const userData = await userService.getUserSettings(userId);
  //     if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
  //       throw new Error(`No ${chain} wallet found for user`);
  //     }

  //     const privateKey = await walletService.getWalletPrivateKeyForTrading(userId, chain);
  //     const walletAddress = userData.custodialWallets[chain].address;

  //     // Check wallet balance
  //     const balanceInfo = await walletService.getWalletBalance(walletAddress, chain);
  //     const availableBalance = parseFloat(balanceInfo.balance);

  //     if (availableBalance < amount) {
  //       throw new Error(`Insufficient balance. Available: ${availableBalance}, Required: ${amount}`);
  //     }

  //     // Process dev fee
  //     const feeInfo = await walletService.processTransactionWithFee(userId, chain, amount, 'buy');

  //     let result;
      
  //     // Execute trade based on chain
  //     switch (chain.toLowerCase()) {
  //       case 'solana':
  //         debugger
  //         result = await this.executeSwap(privateKey,"So11111111111111111111111111111111111111112", tokenAddress, feeInfo.userAmount, slippage);
  //         //result = await this.executeSolanaBuy(privateKey, tokenAddress, feeInfo.userAmount, slippage);
  //         break;
  //       case 'ethereum':
  //       case 'bsc':
  //       case 'polygon':
  //       case 'arbitrum':
  //       case 'base':
  //         result = await this.executeEVMBuy(privateKey, tokenAddress, feeInfo.userAmount, slippage, chain);
  //         break;
  //       default:
  //         throw new Error(`Unsupported chain: ${chain}`);
  //     }

  //     // Update trade statistics
  //     this.updateStats(chain, 'buy', amount, true);

  //     // Update user statistics and positions
  //     await userService.updateStats(userId, {
  //       amount: feeInfo.userAmount,
  //       pnl: 0, // No PnL on buy
  //       executed: true
  //     });

  //     // Add position tracking
  //     const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
  //     console.log('Token Info:', tokenInfo);
  //     await userService.addPosition(userId, tokenAddress, result.tokensReceived, result.executedPrice, 'manual_buy',tokenInfo?.name, tokenInfo?.symbol);

  //     console.log(`✅ BUY order ${tradeId} executed successfully`);

  //     return {
  //       success: true,
  //       tradeId,
  //       txHash: result.txHash,
  //       executedPrice: result.executedPrice,
  //       tokensReceived: result.tokensReceived,
  //       amountSpent: feeInfo.userAmount,
  //       devFee: feeInfo.devFee,
  //       feeDisplay: feeInfo.feeDisplay,
  //       gasUsed: result.gasUsed,
  //       timestamp: Date.now(),
  //       chain,
  //       explorerUrl: this.getExplorerUrl(result.txHash, chain)
  //     };

  //   } catch (error) {
  //     console.error(`❌ BUY order ${tradeId} failed:`, error);
      
  //     this.updateStats(params.chain, 'buy', params.amount, false);

  //     return {
  //       success: false,
  //       tradeId,
  //       error: error.message,
  //       timestamp: Date.now(),
  //       chain: params.chain
  //     };
  //   }
  // }
// Execute buy order on blockchain with enhanced error handling and wallet address selection
async executeBuyOrder(userId, params) {
  const tradeId = `buy_${userId}_${Date.now()}`;
  debugger
  try {
    console.log(`🟢 Executing BUY order ${tradeId}:`, {
      token: params.tokenAddress,
      amount: params.amount,
      chain: params.chain,
      walletAddress: params.walletAddress
    });
    
    if (!this.initialized) {
      await this.initialize();
      if (!this.initialized) {
        throw new Error('Trading executor failed to initialize');
      }
    }

    const { tokenAddress, amount, chain, slippage = 5, walletAddress } = params;
    
    // Validate parameters
    if (!tokenAddress || !amount || !chain) {
      throw new Error('Missing required parameters: tokenAddress, amount, chain');
    }

    if (amount <= 0) {
      throw new Error('Invalid amount: must be greater than 0');
    }

    // Get user wallet data with multi-wallet support
    const userData = await userService.getUserSettings(userId);
    if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
      throw new Error(`No ${chain} wallet found for user`);
    }

    let wallets = userData.custodialWallets[chain];
    
    // Handle both array and legacy single wallet format
    if (!Array.isArray(wallets)) {
      wallets = [wallets];
    }

    // Get specific wallet by address or default wallet
    let selectedWallet;
    let walletIndex = null;
    
    if (walletAddress) {
      // Find wallet by address
      walletIndex = wallets.findIndex(w => w.address === walletAddress);
      selectedWallet = wallets[walletIndex];
      
      if (!selectedWallet) {
        throw new Error(`Wallet with address ${walletAddress} not found`);
      }
    } else {
      // Use default wallet or first wallet
      selectedWallet = wallets.find(w => w.isDefault) || wallets[0];
      walletIndex = wallets.indexOf(selectedWallet);
    }

    if (!selectedWallet) {
      throw new Error('No wallet found for trading');
    }

    const selectedWalletAddress = selectedWallet.address;
    console.log(`💼 Using wallet: ${selectedWallet.name || 'Wallet'} (${selectedWalletAddress.substring(0, 8)}...${selectedWalletAddress.substring(selectedWalletAddress.length - 8)})`);

    // Get private key for the selected wallet
    const privateKey = await walletService.getWalletPrivateKeyForTrading(userId, chain, walletIndex);

    debugger
    // Check wallet balance
    const balanceInfo = await walletService.getWalletBalance(selectedWalletAddress, chain);
    const availableBalance = parseFloat(balanceInfo.balance);

    debugger
    if (availableBalance < amount) {
      throw new Error(`Insufficient balance in selected wallet. Available: ${availableBalance}, Required: ${amount}`);
    }

    // Process dev fee
    const feeInfo = await walletService.processTransactionWithFee(userId, chain, amount, 'buy');

    let result;
    
    // Execute trade based on chain
    switch (chain.toLowerCase()) {
      case 'solana':
        result = await this.executeSwap(privateKey, "So11111111111111111111111111111111111111112", tokenAddress, feeInfo.userAmount, slippage);
        break;
      case 'ethereum':
      case 'bsc':
      case 'polygon':
      case 'arbitrum':
      case 'base':
        result = await this.executeEVMBuy(privateKey, tokenAddress, feeInfo.userAmount, slippage, chain);
        break;
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }

    // Update trade statistics
    this.updateStats(chain, 'buy', amount, true);

    // Update user statistics and positions
    await userService.updateStats(userId, {
      amount: feeInfo.userAmount,
      pnl: 0, // No PnL on buy
      executed: true
    });

    // Add position tracking with wallet info
    const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
    await userService.addPosition(
      userId, 
      tokenAddress, 
      result.tokensReceived, 
      result.executedPrice, 
      'manual_buy',
      tokenInfo?.name, 
      tokenInfo?.symbol,
      {
        walletAddress: selectedWalletAddress,
        walletName: selectedWallet.name || 'Wallet'
      }
    );

    // Update wallet stats
    selectedWallet.totalSent = (selectedWallet.totalSent || 0) + feeInfo.userAmount;
    selectedWallet.txCount = (selectedWallet.txCount || 0) + 1;
    selectedWallet.lastUpdated = new Date().toISOString();
    
    // Update the specific wallet in the array
    if (walletIndex !== null && walletIndex >= 0) {
      userData.custodialWallets[chain][walletIndex] = selectedWallet;
      await userService.saveUserData(userId, userData);
    }

    console.log(`✅ BUY order ${tradeId} executed successfully using wallet ${selectedWallet.name || 'Wallet'}`);

    return {
      success: true,
      tradeId,
      txHash: result.txHash,
      executedPrice: result.executedPrice,
      tokensReceived: result.tokensReceived,
      amountSpent: feeInfo.userAmount,
      devFee: feeInfo.devFee,
      feeDisplay: feeInfo.feeDisplay,
      gasUsed: result.gasUsed,
      timestamp: Date.now(),
      chain,
      wallet: {
        address: selectedWalletAddress,
        name: selectedWallet.name || 'Wallet',
        index: walletIndex
      },
      explorerUrl: this.getExplorerUrl(result.txHash, chain)
    };

  } catch (error) {
    console.error(`❌ BUY order ${tradeId} failed:`, error);
    
    this.updateStats(params.chain, 'buy', params.amount, false);

    return {
      success: false,
      tradeId,
      error: error.message,
      timestamp: Date.now(),
      chain: params.chain,
      wallet: params.walletAddress ? {
        address: params.walletAddress
      } : null
    };
  }
}

  // Execute sell order on blockchain with enhanced error handling
  // async executeSellOrder(userId, params) {
  //   const tradeId = `sell_${userId}_${Date.now()}`;
    
  //   try {
  //     console.log(`🔴 Executing SELL order ${tradeId}:`, {
  //       token: params.tokenAddress,
  //       percentage: params.percentage,
  //       chain: params.chain
  //     });
      
  //     if (!this.initialized) {
  //       await this.initialize();
  //       if (!this.initialized) {
  //         throw new Error('Trading executor failed to initialize');
  //       }
  //     }

  //     const { tokenAddress, percentage = 100, amount, chain, slippage = 5 } = params;
      
  //     // Get user position
  //     const positions = await userService.getUserPositions(userId);
  //     const position = positions.find(p => 
  //       p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && 
  //       p.chain === chain
  //     );

  //     if (!position) {
  //       throw new Error('No position found for this token');
  //     }

  //     // Calculate sell amount
  //     let sellAmount;
  //     if (amount) {
  //       sellAmount = amount;
  //     } else {
  //       sellAmount = (position.amount * percentage) / 100;
  //     }

  //     if (sellAmount > position.amount) {
  //       throw new Error('Insufficient token balance');
  //     }

  //     // Get private key
  //     const privateKey = await walletService.getWalletPrivateKeyForTrading(userId, chain);

  //     let result;
      
  //     // Execute trade based on chain
  //     switch (chain.toLowerCase()) {
  //       case 'solana':
  //         result = await this.executeSolanaSell(privateKey, tokenAddress, sellAmount, slippage);
  //         break;
  //       case 'ethereum':
  //       case 'bsc':
  //       case 'polygon':
  //       case 'arbitrum':
  //       case 'base':
  //         result = await this.executeEVMSell(privateKey, tokenAddress, sellAmount, slippage, chain);
  //         break;
  //       default:
  //         throw new Error(`Unsupported chain: ${chain}`);
  //     }

  //     // Calculate PnL
  //     const sellValue = result.nativeReceived;
  //     const buyValue = sellAmount * position.avgBuyPrice;
  //     const pnl = sellValue - buyValue;
  //     const pnlPercentage = ((sellValue - buyValue) / buyValue) * 100;

  //     // Process dev fee
  //     const feeInfo = await walletService.processTransactionWithFee(userId, chain, sellValue, 'sell');

  //     // Update trade statistics
  //     this.updateStats(chain, 'sell', sellValue, true);

  //     // Update user statistics
  //     await userService.updateStats(userId, {
  //       amount: sellValue,
  //       pnl,
  //       executed: true
  //     });

  //     // Update position
  //     await userService.sellPosition(userId, tokenAddress, percentage, result.executedPrice);

  //     console.log(`✅ SELL order ${tradeId} executed successfully`);

  //     return {
  //       success: true,
  //       tradeId,
  //       txHash: result.txHash,
  //       executedPrice: result.executedPrice,
  //       tokensSold: sellAmount,
  //       nativeReceived: result.nativeReceived,
  //       devFee: feeInfo.devFee,
  //       feeDisplay: feeInfo.feeDisplay,
  //       pnl,
  //       pnlPercentage,
  //       gasUsed: result.gasUsed,
  //       timestamp: Date.now(),
  //       chain,
  //       explorerUrl: this.getExplorerUrl(result.txHash, chain)
  //     };

  //   } catch (error) {
  //     console.error(`❌ SELL order ${tradeId} failed:`, error);
      
  //     this.updateStats(params.chain, 'sell', 0, false);

  //     return {
  //       success: false,
  //       tradeId,
  //       error: error.message,
  //       timestamp: Date.now(),
  //       chain: params.chain
  //     };
  //   }
  // }
// Execute sell order on blockchain with enhanced error handling and wallet address selection
async executeSellOrder(userId, params) {
  const tradeId = `sell_${userId}_${Date.now()}`;
  
  try {
    console.log(`🔴 Executing SELL order ${tradeId}:`, {
      token: params.tokenAddress,
      percentage: params.percentage,
      chain: params.chain,
      walletAddress: params.walletAddress
    });
    
    if (!this.initialized) {
      await this.initialize();
      if (!this.initialized) {
        throw new Error('Trading executor failed to initialize');
      }
    }

    const { tokenAddress, percentage = 100, amount, chain, slippage = 5, walletAddress = null } = params;
    
    // Get user wallet data with multi-wallet support
    const userData = await userService.getUserSettings(userId);
    if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
      throw new Error(`No ${chain} wallet found for user`);
    }

    let wallets = userData.custodialWallets[chain];
    
    // Handle both array and legacy single wallet format
    if (!Array.isArray(wallets)) {
      wallets = [wallets];
    }

    // Get specific wallet by address or default wallet
    let selectedWallet;
    let walletIndex = null;
    
    if (walletAddress) {
      // Find wallet by address
      walletIndex = wallets.findIndex(w => w.address === walletAddress);
      selectedWallet = wallets[walletIndex];
      
      if (!selectedWallet) {
        throw new Error(`Wallet with address ${walletAddress} not found`);
      }
    } else {
      // Use default wallet or first wallet
      selectedWallet = wallets.find(w => w.isDefault) || wallets[0];
      walletIndex = wallets.indexOf(selectedWallet);
    }

    if (!selectedWallet) {
      throw new Error('No wallet found for trading');
    }

    const selectedWalletAddress = selectedWallet.address;
    console.log(`💼 Using wallet for sell: ${selectedWallet.name || 'Wallet'} (${selectedWalletAddress.substring(0, 8)}...${selectedWalletAddress.substring(selectedWalletAddress.length - 8)})`);
    
    // Get user position for the specific wallet
    const positions = await userService.getUserPositions(userId);
    const position = positions.find(p => 
      p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && 
      p.chain === chain &&
      (!p.walletAddress || p.walletAddress === selectedWalletAddress) // Match wallet if tracked
    );

    if (!position) {
      throw new Error('No position found for this token in the selected wallet');
    }

    // Calculate sell amount
    let sellAmount;
    if (amount) {
      sellAmount = amount;
    } else {
      sellAmount = (position.amount * percentage) / 100;
    }

    if (sellAmount > position.amount) {
      throw new Error('Insufficient token balance in selected wallet');
    }

    // Get private key for the selected wallet
    const privateKey = await walletService.getWalletPrivateKeyForTrading(userId, chain, walletIndex);

    let result;
    
    // Execute trade based on chain
    switch (chain.toLowerCase()) {
      case 'solana':
        result = await this.executeSolanaSell(privateKey, tokenAddress, sellAmount, slippage);
        break;
      case 'ethereum':
      case 'bsc':
      case 'polygon':
      case 'arbitrum':
      case 'base':
        result = await this.executeEVMSell(privateKey, tokenAddress, sellAmount, slippage, chain);
        break;
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }

    // Calculate PnL
    const sellValue = result.nativeReceived;
    const buyValue = sellAmount * position.avgBuyPrice;
    const pnl = sellValue - buyValue;
    const pnlPercentage = ((sellValue - buyValue) / buyValue) * 100;

    // Process dev fee
    const feeInfo = await walletService.processTransactionWithFee(userId, chain, sellValue, 'sell');

    // Update trade statistics
    this.updateStats(chain, 'sell', sellValue, true);

    // Update user statistics
    await userService.updateStats(userId, {
      amount: sellValue,
      pnl,
      executed: true
    });

    // Update position
    await userService.sellPosition(userId, tokenAddress, percentage, result.executedPrice, {
      walletAddress: selectedWalletAddress
    });

    // Update wallet stats
    selectedWallet.totalReceived = (selectedWallet.totalReceived || 0) + result.nativeReceived;
    selectedWallet.txCount = (selectedWallet.txCount || 0) + 1;
    selectedWallet.lastUpdated = new Date().toISOString();
    
    // Update the specific wallet in the array
    if (walletIndex !== null && walletIndex >= 0) {
      userData.custodialWallets[chain][walletIndex] = selectedWallet;
      await userService.saveUserData(userId, userData);
    }

    console.log(`✅ SELL order ${tradeId} executed successfully using wallet ${selectedWallet.name || 'Wallet'}`);

    return {
      success: true,
      tradeId,
      txHash: result.txHash,
      executedPrice: result.executedPrice,
      tokensSold: sellAmount,
      nativeReceived: result.nativeReceived,
      devFee: feeInfo.devFee,
      feeDisplay: feeInfo.feeDisplay,
      pnl,
      pnlPercentage,
      gasUsed: result.gasUsed,
      timestamp: Date.now(),
      chain,
      wallet: {
        address: selectedWalletAddress,
        name: selectedWallet.name || 'Wallet',
        index: walletIndex
      },
      explorerUrl: this.getExplorerUrl(result.txHash, chain)
    };

  } catch (error) {
    console.error(`❌ SELL order ${tradeId} failed:`, error);
    
    this.updateStats(params.chain, 'sell', 0, false);

    return {
      success: false,
      tradeId,
      error: error.message,
      timestamp: Date.now(),
      chain: params.chain,
      wallet: params.walletAddress ? {
        address: params.walletAddress
      } : null
    };
  }
}

  // Enhanced Solana buy via Jupiter with better error handling
  // async executeSolanaBuy(privateKeyHex, tokenAddress, amount, slippage) {
  //   try {
  //     const connection = await this.rpcManager.getSolanaConnection();
      
  //     // Convert hex private key to Keypair
  //     const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
  //     const wallet = Keypair.fromSecretKey(secretKey);

  //     const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

  //     // Get quote from Jupiter with retry logic
  //     let quoteData;
  //     for (let attempt = 1; attempt <= 3; attempt++) {
  //       try {
  //         console.log( `${JUPITER_API}/quote?inputMint=${COMMON_TOKENS.solana.SOL}&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=${slippage * 100}`)
  //         const quoteResponse = await axios.get(
  //           `${JUPITER_API}/quote?inputMint=${COMMON_TOKENS.solana.SOL}&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=${slippage * 100}`,
  //           { timeout: 10000 }
  //         );
  //         if (!quoteResponse.data) {
  //           throw new Error('No quote data received');
  //         }

  //         quoteData = quoteResponse.data;
  //         break;
  //       } catch (error) {
  //         console.warn(`Jupiter quote attempt ${attempt} failed:`, error.message);
  //         if (attempt === 3) throw error;
  //         await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
  //       }
  //     }

  //     // Get swap transaction
  //     const swapResponse = await axios.post(JUPITER_SWAP_API, {
  //       quoteResponse: quoteData,
  //       userPublicKey: wallet.publicKey.toString(),
  //       wrapAndUnwrapSol: true,
  //       dynamicComputeUnitLimit: true,
  //       prioritizationFeeLamports: 100000 // 0.0001 SOL priority fee
  //     }, { timeout: 10000 });

  //     if (!swapResponse.data?.swapTransaction) {
  //       throw new Error('No swap transaction received');
  //     }

  //     const { swapTransaction } = swapResponse.data;

  //     // Deserialize and sign transaction
  //     const transactionBuf = Buffer.from(swapTransaction, 'base64');
  //     //const transaction = Transaction.from(transactionBuf);
  //     const transaction = VersionedTransaction.deserialize(transactionBuf);
  //     transaction.sign([wallet]);

  //     // Execute transaction with retry
  //     let txHash;
  //     for (let attempt = 1; attempt <= 3; attempt++) {
  //       try {
  //         txHash = await connection.sendRawTransaction(transaction.serialize(), {
  //           skipPreflight: false,
  //           preflightCommitment: 'confirmed',
  //           maxRetries: 3
  //         });
  //         break;
  //       } catch (error) {
  //         console.warn(`Solana transaction attempt ${attempt} failed:`, error.message);
  //         if (attempt === 3) throw error;
  //         await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
  //       }
  //     }

  //     // Wait for confirmation with timeout
  //     // const confirmationPromise = connection.confirmTransaction(txHash, 'confirmed');
  //     // const timeoutPromise = new Promise((_, reject) => 
  //     //   setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
  //     // );

  //     // await Promise.race([confirmationPromise, timeoutPromise]);

  //     const latestBlockhash = await connection.getLatestBlockhash('confirmed');

  //   await connection.confirmTransaction(
  //     {
  //       signature: txHash,
  //       blockhash: latestBlockhash.blockhash,
  //       lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
  //     },
  //     'confirmed'
  //   );

  //     const executedPrice = parseInt(quoteData.inAmount) / parseInt(quoteData.outAmount);
  //     const tokensReceived = parseInt(quoteData.outAmount) / Math.pow(10, 9); // Assuming 9 decimals

  //     return {
  //       txHash,
  //       executedPrice,
  //       tokensReceived,
  //       gasUsed: 'N/A'
  //     };

  //   } catch (error) {
  //     console.error('Solana buy execution error:', error);
  //     throw new Error(`Solana buy failed: ${error.message}`);
  //   }
  // }

// ...existing code...

async executeSolanaBuy(privateKeyHex, tokenAddress, amount, slippage) {
  try {
    const connection = await this.rpcManager.getSolanaConnection();
    const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
    const wallet = Keypair.fromSecretKey(secretKey);

    debugger;
    // Initialize Orca SDK
    const orca = getOrca(connection);

    // Try to find a pool with SOL or USDC as the input token
    const pools = orca.getAllPools();
    let pool = null;
    let inputToken = null;
    let outputToken = null;

    // Try SOL/tokenAddress
    pool = Object.values(pools).find(p =>
      (p.getTokenA().mint.toBase58() === COMMON_TOKENS.solana.SOL && p.getTokenB().mint.toBase58() === tokenAddress) ||
      (p.getTokenB().mint.toBase58() === COMMON_TOKENS.solana.SOL && p.getTokenA().mint.toBase58() === tokenAddress)
    );
    if (pool) {
      if (pool.getTokenA().mint.toBase58() === COMMON_TOKENS.solana.SOL) {
        inputToken = pool.getTokenA();
        outputToken = pool.getTokenB();
      } else {
        inputToken = pool.getTokenB();
        outputToken = pool.getTokenA();
      }
    } else {
      // Try USDC/tokenAddress
      pool = Object.values(pools).find(p =>
        (p.getTokenA().mint.toBase58() === COMMON_TOKENS.solana.USDC && p.getTokenB().mint.toBase58() === tokenAddress) ||
        (p.getTokenB().mint.toBase58() === COMMON_TOKENS.solana.USDC && p.getTokenA().mint.toBase58() === tokenAddress)
      );
      if (pool) {
        if (pool.getTokenA().mint.toBase58() === COMMON_TOKENS.solana.USDC) {
          inputToken = pool.getTokenA();
          outputToken = pool.getTokenB();
        } else {
          inputToken = pool.getTokenB();
          outputToken = pool.getTokenA();
        }
      }
    }

    if (!pool) {
      throw new Error('No Orca pool found for this token. It may not be tradable on Orca.');
    }

    // Amount in input token's smallest unit
    const inputDecimals = inputToken.scale;
    const amountIn = Math.floor(amount * Math.pow(10, inputDecimals));

    // Get quote
    const quote = await pool.getQuote(inputToken, amountIn, slippage / 100);

    // Execute swap
    const swapPayload = await pool.swap(wallet, inputToken, amountIn, quote.getMinOutputAmount());
    const txHash = await swapPayload.execute();

    // Calculate executed price and tokens received
    const executedPrice = amount / (quote.getMinOutputAmount().toNumber() / Math.pow(10, outputToken.scale));
    const tokensReceived = quote.getMinOutputAmount().toNumber() / Math.pow(10, outputToken.scale);

    return {
      txHash,
      executedPrice,
      tokensReceived,
      gasUsed: 'N/A'
    };
  } catch (error) {
    debugger;
    console.error('Orca buy execution error:', error);
    throw new Error(`Orca buy failed: ${error.message}`);
  }
}


// 🔹 Fetch decimals for a token mint (fallback for unofficial tokens)

// ✅ Get token decimals (using Jupiter token list first, fallback to chain if not found)
// async getTokenDecimals(connection, mintAddress) {
//   try {
//     debugger;
//     const now = Date.now();
//         let tokenList

//   // if cached and still valid, return it
//   if (this.tokenListCache.data && now - this.tokenListCache.timestamp < CACHE_DURATION) {
//     tokenList = this.tokenListCache.data;
//   }
//   else{
//     // 1. Check Jupiter token list
//     debugger
//     const response = await axios.get("https://token.jup.ag/all");
//     tokenList = response.data;
//         debugger

//     // cache it
//     this.tokenListCache = {
//       data: response.data,
//       timestamp: now
//     };
//   }

//     const tokenInfo = tokenList.find(t => t.address === mintAddress);
//     if (tokenInfo) {
//       return tokenInfo.decimals;
//     }

//         debugger

//     // 2. Fallback → on-chain account info
//     const mintPublicKey = new PublicKey(mintAddress);
//     const accountInfo = await connection.getParsedAccountInfo(mintPublicKey);

//     if (accountInfo?.value?.data?.parsed?.info?.decimals !== undefined) {
//       return accountInfo.value.data.parsed.info.decimals;
//     }

//     throw new Error("Decimals not found for mint " + mintAddress);
//   } catch (err) {
//         debugger;

//     console.error(`❌ Failed to fetch decimals for ${mintAddress}:`, err.message);
//     throw err;
//   }
// }
// ✅ Get token decimals using Jupiter Lite API v2 search endpoint
async getTokenDecimals(connection, mintAddress) {
  try {
    debugger;
    console.log(`🔍 Getting decimals for token: ${mintAddress}`);
    
    const now = Date.now();
    let tokenInfo = null;

    // Step 1: Check cache first
    if (this.tokenListCache.data && now - this.tokenListCache.timestamp < CACHE_DURATION) {
      tokenInfo = this.tokenListCache.data[mintAddress];
      if (tokenInfo) {
        console.log(`✅ Found decimals in cache: ${tokenInfo.decimals}`);
        return tokenInfo.decimals;
      }
    }

    // Step 2: Try Jupiter Lite API v2 search endpoint
    try {
      console.log(`🌐 Searching Jupiter Lite API for: ${mintAddress}`);
      
      const searchUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${mintAddress}`;
      const response = await axios.get(searchUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SmileSnipperBot/1.0',
          'Accept': 'application/json'
        }
      });

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Find exact match by mint address
        const exactMatch = response.data.find(token => 
          token.id === mintAddress || token.address === mintAddress
        );

        if (exactMatch && exactMatch.decimals !== undefined) {
          console.log(`✅ Found token in Jupiter Lite API:`, {
            name: exactMatch.name,
            symbol: exactMatch.symbol,
            decimals: exactMatch.decimals
          });

          // Cache the result
          if (!this.tokenListCache.data) {
            this.tokenListCache.data = {};
          }
          this.tokenListCache.data[mintAddress] = {
            decimals: exactMatch.decimals,
            name: exactMatch.name,
            symbol: exactMatch.symbol
          };
          this.tokenListCache.timestamp = now;

          return exactMatch.decimals;
        }
      }

      console.warn(`⚠️ Token not found in Jupiter Lite API search results`);
    } catch (searchError) {
      console.warn(`⚠️ Jupiter Lite API search failed:`, searchError.message);
    }

    // Step 3: Fallback to multiple Jupiter endpoints
    const fallbackEndpoints = [
      "https://token.jup.ag/all",
      "https://cache.jup.ag/tokens",
      "https://api.jup.ag/tokens"
    ];

    for (const endpoint of fallbackEndpoints) {
      try {
        console.log(`🔄 Trying fallback endpoint: ${endpoint}`);
        
        const response = await axios.get(endpoint, {
          timeout: 8000,
          headers: {
            'User-Agent': 'SmileSnipperBot/1.0',
            'Accept': 'application/json'
          }
        });
        
        let tokenList = Array.isArray(response.data) ? response.data : 
                       response.data.tokens || response.data;
        
        if (tokenList && Array.isArray(tokenList)) {
          const tokenInfo = tokenList.find(t => 
            t.address === mintAddress || t.mint === mintAddress || t.id === mintAddress
          );
          
          if (tokenInfo && tokenInfo.decimals !== undefined) {
            console.log(`✅ Found decimals in fallback endpoint: ${tokenInfo.decimals}`);
            
            // Cache the result
            if (!this.tokenListCache.data) {
              this.tokenListCache.data = {};
            }
            this.tokenListCache.data[mintAddress] = {
              decimals: tokenInfo.decimals,
              name: tokenInfo.name,
              symbol: tokenInfo.symbol
            };
            this.tokenListCache.timestamp = now;
            
            return tokenInfo.decimals;
          }
        }
      } catch (error) {
        console.warn(`⚠️ Fallback endpoint ${endpoint} failed:`, error.message);
        continue;
      }
    }

    debugger;

    // Step 4: On-chain lookup as last resort
    console.log(`🔗 Trying on-chain lookup for: ${mintAddress}`);
    try {
      const mintPublicKey = new PublicKey(mintAddress);
      const accountInfo = await connection.getParsedAccountInfo(mintPublicKey);
      
      if (accountInfo?.value?.data?.parsed?.info?.decimals !== undefined) {
        const decimals = accountInfo.value.data.parsed.info.decimals;
        console.log(`✅ Found decimals on-chain: ${decimals}`);
        
        // Cache the on-chain result
        if (!this.tokenListCache.data) {
          this.tokenListCache.data = {};
        }
        this.tokenListCache.data[mintAddress] = {
          decimals: decimals,
          name: 'Unknown',
          symbol: 'UNKNOWN'
        };
        this.tokenListCache.timestamp = now;
        
        return decimals;
      }
    } catch (onChainError) {
      console.warn(`⚠️ On-chain lookup failed:`, onChainError.message);
    }

    // Step 5: Hardcoded common tokens
    const hardcodedDecimals = this.getHardcodedTokenDecimals(mintAddress);
    if (hardcodedDecimals !== null) {
      console.log(`✅ Using hardcoded decimals: ${hardcodedDecimals}`);
      return hardcodedDecimals;
    }

    // Step 6: Default fallback
    console.warn(`⚠️ Using default decimals (9) for unknown token: ${mintAddress}`);
    return 9; // Most Solana tokens use 9 decimals

  } catch (error) {
    debugger;
    console.error(`❌ All methods failed for ${mintAddress}:`, error.message);
    
    // Try hardcoded decimals as absolute last resort
    const hardcodedDecimals = this.getHardcodedTokenDecimals(mintAddress);
    if (hardcodedDecimals !== null) {
      console.log(`✅ Using hardcoded decimals as last resort: ${hardcodedDecimals}`);
      return hardcodedDecimals;
    }
    
    console.warn(`⚠️ Using default decimals (9) as final fallback`);
    return 9;
  }
}

// Enhanced hardcoded token decimals for common tokens
getHardcodedTokenDecimals(mintAddress) {
  const knownTokens = {
    // Native SOL (wrapped)
    'So11111111111111111111111111111111111111112': 9,
    // Major stablecoins
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6, // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6, // USDT
    'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr': 6, // USDC (old)
    // Popular meme tokens
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 5, // BONK
    'EKpQGSJtjMFqKZ9KQanSqYXRcf8fBopzLHYxdM65zcjm': 6, // WIF
    'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82': 9, // BOME
    // DeFi tokens
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 6, // RAY (Raydium)
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 6, // JUP (Jupiter)
    'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': 6, // ORCA
    'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof': 9, // RND
    // Gaming tokens
    'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx': 8, // ATLAS
    'poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk': 8, // POLIS
    // Other popular tokens
    '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU': 9, // SAMO
    'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt': 6, // SRM
    '8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh': 6, // COPE
    'kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6': 5, // KIN
    'mSoLzYCxHdYgdziU2hgzX6GaHNYnvNNnfhwZFUKSJ1': 9, // mSOL
    'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT': 9, // STEP
    // Bridge tokens
    '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E': 6, // BTC (Wormhole)
    '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk': 6, // ETH (Wormhole)
    // Pump tokens from the response
    'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn': 6, // PUMP
    'Eg2ymQ2aQqjMcibnmTt8erC6Tvk9PVpJZCxvVPJz2agu': 6, // PUMPCADE
    '5TfqNKZbn9AnNtzq8bbkyhKgcPGTfNDc9wNzFrTBpump': 6, // PFP
    'C9rL8FzNwb2EA2pnBYTR6BpTnan6wt8W4SMDVxsHpump': 6, // pumpkoin
    '6JvpHB2ngA7br2V1JoC7nU8J1MS7Zf3MRcGFcGaBpump': 6, // Company
    '9Eufcq8yqukb4A9eUTAXrRpzB7aKTdAuUnqe75ttpump': 6, // Pumpkin
    '2RBko3xoz56aH69isQMUpzZd9NYHahhwC23A5F3Spkin': 6, // PKIN
  };

  return knownTokens[mintAddress] || null;
}

// Enhanced batch token decimals lookup for better performance
async getBatchTokenDecimals(connection, mintAddresses) {
  try {
    console.log(`🔄 Getting decimals for ${mintAddresses.length} tokens...`);
    
    const results = {};
    const unknownTokens = [];
    
    // Step 1: Check cache for all tokens
    for (const mintAddress of mintAddresses) {
      if (this.tokenListCache.data && this.tokenListCache.data[mintAddress]) {
        results[mintAddress] = this.tokenListCache.data[mintAddress].decimals;
      } else {
        unknownTokens.push(mintAddress);
      }
    }
    
    if (unknownTokens.length === 0) {
      console.log(`✅ All ${mintAddresses.length} tokens found in cache`);
      return results;
    }
    
    // Step 2: Batch search using Jupiter Lite API
    if (unknownTokens.length <= 100) { // API limit
      try {
        const searchQuery = unknownTokens.join(',');
        const searchUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${searchQuery}`;
        
        console.log(`🌐 Batch searching ${unknownTokens.length} tokens in Jupiter Lite API`);
        
        const response = await axios.get(searchUrl, {
          timeout: 15000,
          headers: {
            'User-Agent': 'SmileSnipperBot/1.0',
            'Accept': 'application/json'
          }
        });
        
        if (response.data && Array.isArray(response.data)) {
          for (const token of response.data) {
            const mintAddress = token.id || token.address;
            if (mintAddress && unknownTokens.includes(mintAddress)) {
              results[mintAddress] = token.decimals;
              
              // Cache the result
              if (!this.tokenListCache.data) {
                this.tokenListCache.data = {};
              }
              this.tokenListCache.data[mintAddress] = {
                decimals: token.decimals,
                name: token.name,
                symbol: token.symbol
              };
            }
          }
          
          this.tokenListCache.timestamp = Date.now();
          console.log(`✅ Found ${Object.keys(results).length - (mintAddresses.length - unknownTokens.length)} tokens in batch search`);
        }
      } catch (batchError) {
        console.warn(`⚠️ Batch search failed:`, batchError.message);
      }
    }
    
    // Step 3: Individual lookup for remaining tokens
    for (const mintAddress of unknownTokens) {
      if (!results[mintAddress]) {
        try {
          results[mintAddress] = await this.getTokenDecimals(connection, mintAddress);
        } catch (error) {
          console.warn(`⚠️ Failed to get decimals for ${mintAddress}:`, error.message);
          results[mintAddress] = 9; // Default fallback
        }
      }
    }
    
    console.log(`✅ Retrieved decimals for all ${mintAddresses.length} tokens`);
    return results;
    
  } catch (error) {
    console.error(`❌ Batch decimals lookup failed:`, error.message);
    
    // Fallback: individual lookups
    const results = {};
    for (const mintAddress of mintAddresses) {
      try {
        results[mintAddress] = await this.getTokenDecimals(connection, mintAddress);
      } catch (error) {
        results[mintAddress] = 9; // Default fallback
      }
    }
    return results;
  }
}

// 🔹 Main swap function using @jup-ag/api
async executeSwap(privateKeyHex, inputMintAddress, outputMintAddress, amountInUi, slippageBps = 50) {
  try {
        debugger;

    // 1. Setup Solana connection
    //const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
    const connection = await this.rpcManager.getSolanaConnection();

    // 2. Load wallet
    const secretKey = new Uint8Array(Buffer.from(privateKeyHex, "hex"));
    const wallet = Keypair.fromSecretKey(secretKey);

    debugger
    // 3. Get decimals
    const inputDecimals = await this.getTokenDecimals(connection, inputMintAddress);
    const outputDecimals = await this.getTokenDecimals(connection, outputMintAddress);

   // 4. Convert UI amount → raw integer with validation
    if (!amountInUi || amountInUi <= 0) {
      throw new Error(`Invalid amount: ${amountInUi}. Must be greater than 0.`);
    }

    const amountIn = BigInt(Math.floor(amountInUi * Math.pow(10, inputDecimals)));

    if (amountIn === BigInt(0)) {
      throw new Error(`Amount too small. Minimum amount is ${1 / Math.pow(10, inputDecimals)}`);
    }
    
    debugger
    // 5. Initialize Jupiter API client
    const jupiterApi = createJupiterApiClient();
    debugger

    // 6. Get quote
    const quoteResponse = await jupiterApi.quoteGet({
      inputMint: inputMintAddress,
      outputMint: outputMintAddress,
      amount: amountIn.toString(),
      slippageBps,
    });
    debugger

    const bestQuote = quoteResponse.data ? quoteResponse.data[0] : quoteResponse;
    if (!bestQuote) {
      throw new Error("No route found for this token pair.");
    }

    console.log("🔎 Best quote found:", {
      inAmount: bestQuote.inAmount,
      outAmount: bestQuote.outAmount,
    });
    debugger

    // 7. Build swap transaction
    // const swapResponse = await jupiterApi.swapPost({
    //   quoteResponse: bestQuote,
    //   userPublicKey: wallet.publicKey.toBase58(),
    // });
    const swapRequest = {
      quoteResponse: bestQuote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true, // important if SOL <-> token
    };

    const swapResponse = await jupiterApi.swapPost({ swapRequest });

    debugger;
const serializedTx = swapResponse.swapTransaction; // ✅ correct
const txBuffer = Buffer.from(serializedTx, "base64");

// Use VersionedTransaction (not legacy Transaction)
const transaction = VersionedTransaction.deserialize(txBuffer);
debugger
// Sign with your wallet
transaction.sign([wallet]);
debugger
// Send + confirm
const txid = await this.sendWithRetry(connection, transaction, {
  skipPreflight: false,
  preflightCommitment: "confirmed",
});
debugger
// Send
// const txid = await connection.sendTransaction(transaction, {
//   skipPreflight: false,
//   preflightCommitment: "confirmed",
// });
// debugger
// await connection.confirmTransaction(txid, "confirmed");
console.log("✅ Swap successful! Tx:", txid);
    // // 8. Sign and send
    // const txid = await connection.sendTransaction(
    //   Transaction.from(txBuffer),
    //   [wallet],
    //   { skipPreflight: false, preflightCommitment: "confirmed" }
    // );
    // debugger

    // await connection.confirmTransaction(txid, "confirmed");
    console.log("✅ Swap successful! Tx:", txid);
debugger
    // 9. Convert output back to UI units
    const outputUi = Number(bestQuote.outAmount) / Math.pow(10, outputDecimals);
    const tokensReceived = Number(bestQuote.outAmount) / Math.pow(10, outputDecimals);
    const executedPrice = tokensReceived / amountInUi;

    debugger

    return {
      txid,
      inputAmountUi: amountInUi,
      outputAmountUi: outputUi,
      inputMint: inputMintAddress,
      outputMint: outputMintAddress,
      txHash: txid,
      executedPrice,
      tokensReceived,
      gasUsed: "N/A", // Solana doesn't expose gas

    };
  } catch (err) {
        debugger;

    console.error("❌ Swap failed:", err.message);
    console.error(err);

    throw err;
  }
}

// --- 🔹 Reliable send with retries ---
async sendWithRetry(connection, tx, opts, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      debugger;
      const sig = await connection.sendRawTransaction(tx.serialize(), opts);
      debugger
      await connection.confirmTransaction(sig, "confirmed");
      return sig;
    } catch (e) {
      debugger
      console.warn(`⚠️ Attempt ${i + 1} failed:`, e.message);
      if (i === retries - 1) throw e; // rethrow on last attempt
      await new Promise(r => setTimeout(r, 1000)); // wait 1s
    }
  }
}
// 🔹 Example usage
// (async () => {
//   const privateKeyHex = "YOUR_PRIVATE_KEY_HEX"; // Replace with your wallet’s private key in HEX

//   // Example: USDC → SOL
//   const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
//   const SOL = "So11111111111111111111111111111111111111112";

//   // Swap 2.5 USDC → SOL
//   const result = await executeSwap(privateKeyHex, USDC, SOL, 2.5, 50);
//   console.log("Swap result:", result);
// })();

//   async executeSolanaBuy(privateKeyHex, tokenAddress, amount, slippage) {
//   try {
//     const connection = await this.rpcManager.getSolanaConnection();

//     debugger;
//     // Convert hex private key to Keypair
//     const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
//     const wallet = Keypair.fromSecretKey(secretKey);

//     const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

//     // Get quote from Jupiter with retry logic
//     let quoteData;
//     for (let attempt = 1; attempt <= 3; attempt++) {
//       try {
//         const quoteUrl = `${JUPITER_API}/quote?inputMint=${COMMON_TOKENS.solana.SOL}&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=${slippage * 100}`;
//         console.log(quoteUrl);

//         debugger
//         const quoteResponse = await axios.get(quoteUrl, { timeout: 10000 });
//         debugger
//         console.log('Quote Response:', quoteResponse);
//         if (!quoteResponse.data) throw new Error('No quote data received');

//         quoteData = quoteResponse.data;
//         break;
//       } catch (error) {
//         debugger
//         console.warn(`Jupiter quote attempt ${attempt} failed:`, error.message);
//         if (attempt === 3) throw error;
//         await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
//       }
//     }

//     // Get swap transaction from Jupiter
//     const swapResponse = await axios.post(
//       JUPITER_SWAP_API,
//       {
//         quoteResponse: quoteData,
//         userPublicKey: wallet.publicKey.toString(),
//         wrapAndUnwrapSol: true,
//         dynamicComputeUnitLimit: true,
//         prioritizationFeeLamports: 100000
//       },
//       { timeout: 10000 }
//     );

//     if (!swapResponse.data?.swapTransaction) {
//       throw new Error('No swap transaction received');
//     }

//     const { swapTransaction } = swapResponse.data;

// let txHash;
// for (let attempt = 1; attempt <= 3; attempt++) {
//   try {
//     // 🔁 Regenerate swapTransaction to get fresh blockhash
//     const { data: refreshedSwap } = await axios.post(JUPITER_SWAP_API, {
//       quoteResponse: quoteData,
//       userPublicKey: wallet.publicKey.toString(),
//       wrapAndUnwrapSol: true,
//       dynamicComputeUnitLimit: true,
//       prioritizationFeeLamports: 100000
//     }, { timeout: 10000 });

//     if (!refreshedSwap?.swapTransaction) throw new Error("No swap transaction received on retry");

//     const { swapTransaction } = refreshedSwap;

//     const transactionBuf = Buffer.from(swapTransaction, 'base64');
//     const transaction = VersionedTransaction.deserialize(transactionBuf);

//     // Sign it
//     transaction.sign([wallet]);

//     // Send
//     txHash = await connection.sendRawTransaction(transaction.serialize(), {
//       skipPreflight: false,
//       preflightCommitment: 'confirmed',
//       maxRetries: 3
//     });

//     // Confirm
//     const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
//     await connection.confirmTransaction({
//       signature: txHash,
//       blockhash,
//       lastValidBlockHeight
//     }, 'confirmed');

//     break; // ✅ success

//   } catch (error) {
//     console.warn(`Transaction attempt ${attempt} failed: ${error.message}`);
//     if (attempt === 3) throw error;
//     await new Promise(res => setTimeout(res, 2000 * attempt));
//   }
// }

//     const executedPrice = parseInt(quoteData.inAmount) / parseInt(quoteData.outAmount);
//     const tokensReceived = parseInt(quoteData.outAmount) / Math.pow(10, 9); // Assumes 9 decimals

//     return {
//       txHash,
//       executedPrice,
//       tokensReceived,
//       gasUsed: 'N/A' // Solana doesn't report gas like EVM chains
//     };

//   } catch (error) {
//     console.error('Solana buy execution error:', error);
//     throw new Error(`Solana buy failed: ${error.message}`);
//   }
// }

  // Enhanced Solana sell via Jupiter
  async executeSolanaSell(privateKeyHex, tokenAddress, amount, slippage) {
    try {
      const connection = await this.rpcManager.getSolanaConnection();
      
      const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
      const wallet = Keypair.fromSecretKey(secretKey);

      // Convert amount to proper decimals (assuming 9 for most SPL tokens)
      const amountAtomic = Math.floor(amount * Math.pow(10, 9));

      // Get quote with retry logic
      let quoteData;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const quoteResponse = await axios.get(
            `${JUPITER_API}/quote?inputMint=${tokenAddress}&outputMint=${COMMON_TOKENS.solana.SOL}&amount=${amountAtomic}&slippageBps=${slippage * 100}`,
            { timeout: 10000 }
          );
          
          quoteData = quoteResponse.data;
          break;
        } catch (error) {
          console.warn(`Jupiter sell quote attempt ${attempt} failed:`, error.message);
          if (attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      // Get swap transaction
      const swapResponse = await axios.post(JUPITER_SWAP_API, {
        quoteResponse: quoteData,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 100000
      }, { timeout: 10000 });

      const { swapTransaction } = swapResponse.data;

      // Execute transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = Transaction.from(transactionBuf);
      transaction.sign(wallet);

      const txHash = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      await connection.confirmTransaction(txHash, 'confirmed');

      const executedPrice = parseInt(quoteData.outAmount) / parseInt(quoteData.inAmount);
      const nativeReceived = parseInt(quoteData.outAmount) / LAMPORTS_PER_SOL;

      return {
        txHash,
        executedPrice,
        nativeReceived,
        gasUsed: 'N/A'
      };

    } catch (error) {
      console.error('Solana sell execution error:', error);
      throw new Error(`Solana sell failed: ${error.message}`);
    }
  }

  // Enhanced EVM buy with multi-DEX support
  async executeEVMBuy(privateKeyHex, tokenAddress, amount, slippage, chain) {
    try {
      console.log(`🔷 Executing ${chain.toUpperCase()} buy order...`);
      
      const provider = await this.getEVMProvider(chain);
      const wallet = new ethers.Wallet(privateKeyHex, provider);
      
      // Get the best router for this chain
      const routerInfo = this.getBestRouter(chain);
      const router = new ethers.Contract(routerInfo.address, routerInfo.abi, wallet);
      
      // Get wrapped native token address
      const WNATIVE = this.getWrappedNative(chain);
      const path = [WNATIVE, tokenAddress];
      const amountIn = parseUnits(amount.toString(), 'ether');
      
      // Get expected output amount with retry
      let amounts;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          amounts = await router.getAmountsOut(amountIn, path);
          break;
        } catch (error) {
          console.warn(`Get amounts out attempt ${attempt} failed:`, error.message);
          if (attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
      
      const amountOutMin = amounts[1] * BigInt(100 - slippage) / BigInt(100);
      
      // Set deadline (10 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 600;
      
      // Get current gas price and add premium for faster execution
      const gasPrice = await provider.getGasPrice();
      const premiumGasPrice = gasPrice * BigInt(110) / BigInt(100); // 10% premium
      
      // Execute swap with enhanced gas settings
      const tx = await router.swapExactETHForTokens(
        amountOutMin,
        path,
        wallet.address,
        deadline,
        { 
          value: amountIn,
          gasLimit: 350000, // Increased gas limit
          gasPrice: premiumGasPrice
        }
      );
      
      console.log(`📝 ${chain.toUpperCase()} transaction sent: ${tx.hash}`);
      
      // Wait for confirmation with timeout
      const receipt = await Promise.race([
        tx.wait(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 120000)
        )
      ]);
      
      console.log(`✅ ${chain.toUpperCase()} transaction confirmed: ${receipt.transactionHash}`);
      
      // Calculate actual amounts from receipt
      const actualAmountOut = amounts[1];
      const executedPrice = Number(amountIn) / Number(actualAmountOut);
      const tokensReceived = Number(formatUnits(actualAmountOut, 18));
      
      return {
        txHash: receipt.transactionHash,
        executedPrice,
        tokensReceived,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      console.error(`${chain} buy execution error:`, error);
      
      // Provide more specific error messages
      if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient native token balance for trade');
      } else if (error.message.includes('execution reverted')) {
        throw new Error('Trade execution failed - likely due to slippage or liquidity issues');
      } else if (error.message.includes('replacement transaction underpriced')) {
        throw new Error('Network congestion - please try again with higher gas');
      } else {
        throw new Error(`${chain} buy failed: ${error.message}`);
      }
    }
  }

  // Enhanced EVM sell with multi-DEX support
  async executeEVMSell(privateKeyHex, tokenAddress, amount, slippage, chain) {
    try {
      console.log(`🔷 Executing ${chain.toUpperCase()} sell order...`);
      
      const provider = await this.getEVMProvider(chain);
      const wallet = new ethers.Wallet(privateKeyHex, provider);
      
      // Get the best router for this chain
      const routerInfo = this.getBestRouter(chain);
      
      // ERC20 Token ABI
      const tokenABI = [
        "function transfer(address to, uint amount) public returns (bool)",
        "function balanceOf(address account) public view returns (uint256)",
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) public view returns (uint256)",
        "function decimals() public view returns (uint8)"
      ];
      
      const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);
      const router = new ethers.Contract(routerInfo.address, routerInfo.abi, wallet);
      
      // Get token decimals
      const decimals = await tokenContract.decimals();
      const amountIn = parseUnits(amount.toString(), decimals);
      
      // Check token balance
      const balance = await tokenContract.balanceOf(wallet.address);
      if (balance < amountIn) {
        throw new Error('Insufficient token balance');
      }
      
      // Check and approve token spending if needed
      const allowance = await tokenContract.allowance(wallet.address, routerInfo.address);
      if (allowance < amountIn) {
        console.log('📝 Approving token spending...');
        const approveTx = await tokenContract.approve(routerInfo.address, amountIn, {
          gasLimit: 100000
        });
        await approveTx.wait();
        console.log('✅ Token spending approved');
      }
      
      // Get wrapped native token address
      const WNATIVE = this.getWrappedNative(chain);
      const path = [tokenAddress, WNATIVE];
      
      // Get expected output amount
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1] * BigInt(100 - slippage) / BigInt(100);
      
      // Set deadline (10 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 600;
      
      // Get premium gas price
      const gasPrice = await provider.getGasPrice();
      const premiumGasPrice = gasPrice * BigInt(110) / BigInt(100);
      
      // Execute swap
      const tx = await router.swapExactTokensForETH(
        amountIn,
        amountOutMin,
        path,
        wallet.address,
        deadline,
        { 
          gasLimit: 350000,
          gasPrice: premiumGasPrice
        }
      );
      
      console.log(`📝 ${chain.toUpperCase()} sell transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await Promise.race([
        tx.wait(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 120000)
        )
      ]);
      
      console.log(`✅ ${chain.toUpperCase()} sell transaction confirmed: ${receipt.transactionHash}`);
      
      // Calculate actual amounts from receipt
      const actualAmountOut = amounts[1];
      const executedPrice = Number(actualAmountOut) / Number(amountIn);
      const nativeReceived = Number(formatUnits(actualAmountOut, 'ether'));
      
      return {
        txHash: receipt.transactionHash,
        executedPrice,
        nativeReceived,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      console.error(`${chain} sell execution error:`, error);
      
      if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient gas for transaction');
      } else if (error.message.includes('execution reverted')) {
        throw new Error('Sell execution failed - likely due to slippage or liquidity issues');
      } else if (error.message.includes('replacement transaction underpriced')) {
        throw new Error('Network congestion - please try again with higher gas');
      } else {
        throw new Error(`${chain} sell failed: ${error.message}`);
      }
    }
  }

  // Get EVM provider for specific chain
  async getEVMProvider(chain) {
    switch (chain.toLowerCase()) {
      case 'ethereum':
        return await this.rpcManager.getEthereumProvider();
      case 'bsc':
        return await this.rpcManager.getBSCProvider();
      case 'polygon':
        return await this.rpcManager.getPolygonProvider();
      case 'arbitrum':
        return await this.rpcManager.getArbitrumProvider();
      case 'base':
        return await this.rpcManager.getBaseProvider();
      default:
        throw new Error(`Unsupported EVM chain: ${chain}`);
    }
  }

  // Get best router for chain
  getBestRouter(chain) {
    const routers = DEX_ROUTERS[chain.toLowerCase()];
    if (!routers) {
      throw new Error(`No routers configured for ${chain}`);
    }

    // Return the primary router (can be enhanced with liquidity checking)
    const routerAddress = Object.values(routers)[0];
    
    return {
      address: routerAddress,
      abi: [
        "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
        "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
        "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"
      ]
    };
  }

  // Get wrapped native token for chain
  getWrappedNative(chain) {
    const tokens = COMMON_TOKENS[chain.toLowerCase()];
    if (!tokens) {
      throw new Error(`No tokens configured for ${chain}`);
    }

    // Return wrapped native token
    return Object.values(tokens).find(addr => addr.includes('W') || addr === tokens.ETH || addr === tokens.BNB || addr === tokens.MATIC);
  }

  // Get explorer URL for transaction
  getExplorerUrl(txHash, chain) {
    const explorers = {
      solana: `https://solscan.io/tx/${txHash}`,
      ethereum: `https://etherscan.io/tx/${txHash}`,
      bsc: `https://bscscan.com/tx/${txHash}`,
      polygon: `https://polygonscan.com/tx/${txHash}`,
      arbitrum: `https://arbiscan.io/tx/${txHash}`,
      base: `https://basescan.org/tx/${txHash}`
    };

    return explorers[chain.toLowerCase()] || `#${txHash}`;
  }

  // Update execution statistics
  updateStats(chain, action, amount, success) {
    this.executionStats.totalTrades++;
    
    if (success) {
      this.executionStats.successfulTrades++;
      this.executionStats.totalVolume += amount;
    } else {
      this.executionStats.failedTrades++;
    }

    // Chain-specific stats
    if (!this.executionStats.chainStats[chain]) {
      this.executionStats.chainStats[chain] = {
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        totalVolume: 0
      };
    }

    const chainStats = this.executionStats.chainStats[chain];
    chainStats.totalTrades++;
    
    if (success) {
      chainStats.successfulTrades++;
      chainStats.totalVolume += amount;
    } else {
      chainStats.failedTrades++;
    }
  }

  // Simulate trade for preview
  async simulateTrade(params) {
    try {
      const { tokenAddress, amount, chain, tradeType } = params;
      
      // Get token info for simulation
      const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
      
      if (!tokenInfo) {
        throw new Error('Token information not available for simulation');
      }

      let simulation;
      
      if (tradeType === 'buy') {
        simulation = {
          estimatedTokens: amount / (tokenInfo.price || 0.001),
          priceImpact: this.calculatePriceImpact(amount, tokenInfo.liquidity),
          slippage: 5,
          fees: amount * 0.03,
          executionProbability: this.calculateExecutionProbability(tokenInfo),
          route: this.getBestRoute(chain)
        };
      } else {
        simulation = {
          estimatedNative: amount * (tokenInfo.price || 0.001),
          priceImpact: this.calculatePriceImpact(amount * tokenInfo.price, tokenInfo.liquidity),
          slippage: 5,
          fees: amount * (tokenInfo.price || 0.001) * 0.03,
          executionProbability: this.calculateExecutionProbability(tokenInfo),
          route: this.getBestRoute(chain)
        };
      }

      return {
        success: true,
        simulation,
        tokenInfo,
        warnings: simulation.priceImpact > 10 ? ['High price impact detected'] : [],
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Calculate price impact
  calculatePriceImpact(tradeAmount, liquidity) {
    if (!liquidity || liquidity === 0) return 50; // High impact if no liquidity data
    
    const impact = (tradeAmount / liquidity) * 100;
    return Math.min(impact, 50); // Cap at 50%
  }

  // Calculate execution probability
  calculateExecutionProbability(tokenInfo) {
    let probability = 95; // Base probability
    
    if (tokenInfo.liquidity < 1000) probability -= 20;
    if (tokenInfo.volume24h < 1000) probability -= 10;
    if (tokenInfo.priceChange24h && Math.abs(tokenInfo.priceChange24h) > 50) probability -= 15;
    
    return Math.max(probability, 50);
  }

  // Get best route for chain
  getBestRoute(chain) {
    const routes = {
      solana: 'Jupiter',
      ethereum: 'Uniswap V3',
      bsc: 'PancakeSwap',
      polygon: 'QuickSwap',
      arbitrum: 'Uniswap V3',
      base: 'BaseSwap'
    };

    return routes[chain.toLowerCase()] || 'Unknown';
  }

  // Get execution statistics
  getStats() {
    return {
      ...this.executionStats,
      successRate: this.executionStats.totalTrades > 0 
        ? (this.executionStats.successfulTrades / this.executionStats.totalTrades * 100).toFixed(2) + '%'
        : '0%',
      pendingTransactions: this.pendingTransactions.size,
      initialized: this.initialized,
      supportedChains: Object.keys(COMMON_TOKENS)
    };
  }

  // Health check
  isHealthy() {
    return this.initialized && this.rpcManager.getStatus().healthyRPCs > 0;
  }

  // Force re-initialization
  async forceInitialize() {
    this.initialized = false;
    return await this.initialize();
  }
}

// Singleton instance
let tradingExecutor = null;

function getRealTradingExecutor() {
  if (!tradingExecutor) {
    tradingExecutor = new RealTradingExecutor();
  }
  return tradingExecutor;
}

module.exports = {
  getRealTradingExecutor,
  //executeSwap,
  RealTradingExecutor
};