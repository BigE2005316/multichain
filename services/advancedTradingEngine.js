// services/advancedTradingEngine.js - Multi-Chain MEV-Protected Trading Engine
const axios = require('axios');
const { ethers } = require('ethers');
const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
const rpcManager = require('./rpcManager');
const userService = require('../users/userService');
const walletService = require('./walletService');
const tokenDataService = require('./tokenDataService');

class AdvancedTradingEngine {
  constructor() {
    this.chainConfigs = {
      ethereum: {
        chainId: 1,
        symbol: 'ETH',
        gasMultiplier: 1.1,
        slippageTolerance: 0.005, // 0.5%
        providers: ['quicknode', 'alchemy', 'infura']
      },
      base: {
        chainId: 8453,
        symbol: 'ETH',
        gasMultiplier: 1.05,
        slippageTolerance: 0.003,
        providers: ['quicknode', 'alchemy']
      },
      bsc: {
        chainId: 56,
        symbol: 'BNB',
        gasMultiplier: 1.05,
        slippageTolerance: 0.005,
        providers: ['quicknode', 'binance']
      },
      polygon: {
        chainId: 137,
        symbol: 'MATIC',
        gasMultiplier: 1.1,
        slippageTolerance: 0.005,
        providers: ['quicknode', 'polygon']
      },
      arbitrum: {
        chainId: 42161,
        symbol: 'ETH',
        gasMultiplier: 1.02,
        slippageTolerance: 0.003,
        providers: ['quicknode', 'arbitrum']
      },
      solana: {
        chainId: 'mainnet-beta',
        symbol: 'SOL',
        gasMultiplier: 1.05,
        slippageTolerance: 0.01,
        providers: ['quicknode', 'solana']
      },
      conflux: {
        chainId: 1030,
        symbol: 'CFX',
        gasMultiplier: 1.1,
        slippageTolerance: 0.005,
        providers: ['conflux']
      }
    };

    this.dexAggregators = {
      ethereum: ['1inch', 'paraswap', 'openocean'],
      base: ['openocean', 'uniswap_v3'],
      bsc: ['1inch', 'pancakeswap', 'openocean'],
      polygon: ['1inch', 'quickswap', 'openocean'],
      arbitrum: ['1inch', 'uniswap_v3', 'openocean'],
      solana: ['jupiter', 'raydium'],
      conflux: ['swappi']
    };
  }

  // ========================================
  // MULTI-CHAIN TRADING CORE
  // ========================================

  async executeBuy(params) {
    const { userId, tokenAddress, amount, chain, slippage, gasLevel = 'medium' } = params;

    try {
      console.log(`🔄 Executing BUY: ${amount} ${this.chainConfigs[chain].symbol} → ${tokenAddress} on ${chain.toUpperCase()}`);

      // 1. Validate parameters
      const validation = await this.validateTradeParams(params);
      if (!validation.isValid) {
        return { success: false, message: validation.error };
      }

      // 2. Get optimal quote with MEV protection
      const quote = await this.getOptimalQuote({
        chain,
        fromToken: this.getNativeTokenAddress(chain),
        toToken: tokenAddress,
        amount,
        slippage: slippage || this.chainConfigs[chain].slippageTolerance
      });

      if (!quote.success) {
        return { success: false, message: quote.error };
      }

      // 3. Get user wallet
      const wallet = await walletService.getUserWallet(userId, chain);
      if (!wallet) {
        return { success: false, message: 'Wallet not found' };
      }

      // 4. Estimate gas with advanced prediction
      const gasEstimate = await this.getAdvancedGasEstimate(chain, gasLevel);

      // 5. Execute trade based on chain
      let result;
      if (chain === 'solana') {
        result = await this.executeSolanaTrade(wallet, quote, gasEstimate);
      } else {
        result = await this.executeEVMTrade(wallet, quote, gasEstimate, chain);
      }

      // 6. Record transaction
      await this.recordTransaction({
        userId,
        chain,
        type: 'buy',
        fromToken: this.getNativeTokenAddress(chain),
        toToken: tokenAddress,
        amountIn: amount,
        amountOut: result.tokensReceived,
        txHash: result.txHash,
        gasUsed: result.gasUsed,
        status: result.success ? 'completed' : 'failed'
      });

      return {
        success: result.success,
        txHash: result.txHash,
        tokensReceived: result.tokensReceived,
        amountSpent: amount,
        executedPrice: result.executedPrice,
        gasFee: result.gasFee,
        priceImpact: quote.priceImpact,
        explorerUrl: this.getExplorerUrl(result.txHash, chain)
      };

    } catch (error) {
      console.error(`❌ Buy execution failed:`, error);
      return { success: false, message: error.message };
    }
  }

  async executeSell(params) {
    const { userId, tokenAddress, amount, chain, slippage, gasLevel = 'medium' } = params;

    try {
      console.log(`🔄 Executing SELL: ${amount} ${tokenAddress} → ${this.chainConfigs[chain].symbol} on ${chain.toUpperCase()}`);

      // Similar structure to buy but reversed
      const quote = await this.getOptimalQuote({
        chain,
        fromToken: tokenAddress,
        toToken: this.getNativeTokenAddress(chain),
        amount,
        slippage: slippage || this.chainConfigs[chain].slippageTolerance
      });

      if (!quote.success) {
        return { success: false, message: quote.error };
      }

      const wallet = await walletService.getUserWallet(userId, chain);
      if (!wallet) {
        return { success: false, message: 'Wallet not found' };
      }

      const gasEstimate = await this.getAdvancedGasEstimate(chain, gasLevel);

      let result;
      if (chain === 'solana') {
        result = await this.executeSolanaTrade(wallet, quote, gasEstimate);
      } else {
        result = await this.executeEVMTrade(wallet, quote, gasEstimate, chain);
      }

      await this.recordTransaction({
        userId,
        chain,
        type: 'sell',
        fromToken: tokenAddress,
        toToken: this.getNativeTokenAddress(chain),
        amountIn: amount,
        amountOut: result.tokensReceived,
        txHash: result.txHash,
        gasUsed: result.gasUsed,
        status: result.success ? 'completed' : 'failed'
      });

      return {
        success: result.success,
        txHash: result.txHash,
        proceeds: result.tokensReceived,
        amountSold: amount,
        executedPrice: result.executedPrice,
        gasFee: result.gasFee,
        priceImpact: quote.priceImpact,
        explorerUrl: this.getExplorerUrl(result.txHash, chain)
      };

    } catch (error) {
      console.error(`❌ Sell execution failed:`, error);
      return { success: false, message: error.message };
    }
  }

  // ========================================
  // ADVANCED GAS ESTIMATION
  // ========================================

  async getAdvancedGasEstimate(chain, gasLevel = 'medium') {
    try {
      if (chain === 'solana') {
        return await this.getSolanaComputeUnits();
      }

      // For EVM chains, use QuickNode-style gas estimation
      const rpc = await rpcManager.getRPC(chain);
      
      // Try Sentio-style gas estimation if available
      try {
        const gasEstimate = await this.getSentioGasEstimate(chain, gasLevel);
        if (gasEstimate) return gasEstimate;
      } catch (e) {
        console.log('Sentio gas estimation not available, using fallback');
      }

      // Fallback to standard gas estimation
      const gasPrice = await rpc.getGasPrice();
      const multiplier = this.getGasMultiplier(gasLevel);
      
      return {
        gasPrice: gasPrice.mul(Math.floor(multiplier * 100)).div(100),
        gasLimit: 300000, // Conservative estimate
        maxFeePerGas: gasPrice.mul(Math.floor(multiplier * 100)).div(100),
        maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
      };

    } catch (error) {
      console.error('Gas estimation failed:', error);
      // Return safe defaults
      return {
        gasPrice: ethers.utils.parseUnits('20', 'gwei'),
        gasLimit: 300000,
        maxFeePerGas: ethers.utils.parseUnits('30', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
      };
    }
  }

  async getSentioGasEstimate(chain, gasLevel) {
    try {
      const chainId = this.chainConfigs[chain].chainId;
      const rpcUrl = await rpcManager.getRPCUrl(chain);
      
      const response = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        method: "sentio_gasPrice",
        params: { chainId },
        id: 1,
      }, {
        headers: { "Content-Type": "application/json" },
        timeout: 5000
      });

      if (response.data && response.data.result) {
        const gasData = response.data.result;
        const levelMap = { low: 90, medium: 95, high: 99 };
        const confidence = levelMap[gasLevel] || 95;
        
        // Find the appropriate gas price for the confidence level
        const gasPrice = gasData.blockPrices?.[0]?.estimatedPrices?.find(
          p => p.confidence >= confidence
        );

        if (gasPrice) {
          return {
            gasPrice: ethers.utils.parseUnits(gasPrice.price.toString(), 'gwei'),
            gasLimit: 300000,
            maxFeePerGas: ethers.utils.parseUnits(gasPrice.maxFeePerGas?.toString() || gasPrice.price.toString(), 'gwei'),
            maxPriorityFeePerGas: ethers.utils.parseUnits(gasPrice.maxPriorityFeePerGas?.toString() || '2', 'gwei')
          };
        }
      }
    } catch (error) {
      console.error('Sentio gas estimation failed:', error);
    }
    
    return null;
  }

  // ========================================
  // OPTIMAL QUOTE AGGREGATION
  // ========================================

  async getOptimalQuote(params) {
    const { chain, fromToken, toToken, amount, slippage } = params;

    try {
      // Get quotes from multiple DEX aggregators
      const quotes = await Promise.allSettled([
        this.getOpenOceanQuote(params),
        this.get1inchQuote(params),
        this.getParaswapQuote(params),
        this.getJupiterQuote(params) // For Solana
      ]);

      // Filter successful quotes and find the best one
      const validQuotes = quotes
        .filter(result => result.status === 'fulfilled' && result.value.success)
        .map(result => result.value);

      if (validQuotes.length === 0) {
        return { success: false, error: 'No valid quotes found' };
      }

      // Select best quote based on output amount and gas cost
      const bestQuote = validQuotes.reduce((best, current) => {
        const bestNetOutput = best.estimatedOutput - (best.gasEstimate || 0);
        const currentNetOutput = current.estimatedOutput - (current.gasEstimate || 0);
        return currentNetOutput > bestNetOutput ? current : best;
      });

      return {
        success: true,
        ...bestQuote,
        aggregator: bestQuote.source,
        allQuotes: validQuotes.length
      };

    } catch (error) {
      console.error('Quote aggregation failed:', error);
      return { success: false, error: error.message };
    }
  }

  async getOpenOceanQuote(params) {
    const { chain, fromToken, toToken, amount, slippage } = params;
    
    try {
      const chainId = this.chainConfigs[chain].chainId;
      const response = await axios.get(`https://open-api.openocean.finance/v3/${chainId}/quote`, {
        params: {
          inTokenAddress: fromToken,
          outTokenAddress: toToken,
          amount: ethers.utils.parseEther(amount.toString()).toString(),
          slippage: slippage * 100, // Convert to percentage
          account: '0x0000000000000000000000000000000000000000' // Placeholder
        },
        timeout: 5000
      });

      if (response.data && response.data.code === 200) {
        const quote = response.data.data;
        return {
          success: true,
          source: 'openocean',
          estimatedOutput: parseFloat(ethers.utils.formatEther(quote.outAmount)),
          priceImpact: parseFloat(quote.priceImpact),
          gasEstimate: parseFloat(quote.estimatedGas),
          route: quote.path,
          calldata: quote.data
        };
      }
    } catch (error) {
      console.error('OpenOcean quote failed:', error);
    }
    
    return { success: false, source: 'openocean' };
  }

  async get1inchQuote(params) {
    const { chain, fromToken, toToken, amount, slippage } = params;
    
    try {
      const chainId = this.chainConfigs[chain].chainId;
      if (!['1', '56', '137', '42161'].includes(chainId.toString())) {
        return { success: false, source: '1inch', error: 'Chain not supported' };
      }

      const response = await axios.get(`https://api.1inch.io/v5.0/${chainId}/quote`, {
        params: {
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          amount: ethers.utils.parseEther(amount.toString()).toString(),
        },
        timeout: 5000
      });

      if (response.data) {
        const quote = response.data;
        return {
          success: true,
          source: '1inch',
          estimatedOutput: parseFloat(ethers.utils.formatEther(quote.toTokenAmount)),
          priceImpact: 0, // 1inch doesn't always provide this
          gasEstimate: parseFloat(quote.estimatedGas || '0'),
          route: quote.protocols
        };
      }
    } catch (error) {
      console.error('1inch quote failed:', error);
    }
    
    return { success: false, source: '1inch' };
  }

  async getJupiterQuote(params) {
    const { chain, fromToken, toToken, amount, slippage } = params;
    
    if (chain !== 'solana') {
      return { success: false, source: 'jupiter', error: 'Solana only' };
    }

    try {
      const response = await axios.get('https://quote-api.jup.ag/v6/quote', {
        params: {
          inputMint: fromToken,
          outputMint: toToken,
          amount: Math.floor(amount * 1e9), // Convert to lamports
          slippageBps: Math.floor(slippage * 10000),
        },
        timeout: 5000
      });

      if (response.data) {
        const quote = response.data;
        return {
          success: true,
          source: 'jupiter',
          estimatedOutput: parseFloat(quote.outAmount) / 1e9,
          priceImpact: parseFloat(quote.priceImpactPct || 0),
          route: quote.routePlan,
          swapTransaction: quote
        };
      }
    } catch (error) {
      console.error('Jupiter quote failed:', error);
    }
    
    return { success: false, source: 'jupiter' };
  }

  // ========================================
  // TRADE EXECUTION
  // ========================================

  async executeEVMTrade(wallet, quote, gasEstimate, chain) {
    try {
      const rpc = await rpcManager.getRPC(chain);
      const signer = new ethers.Wallet(wallet.privateKey, rpc);

      // Build transaction based on quote source
      let txData;
      if (quote.calldata) {
        txData = {
          to: quote.to || this.getRouterAddress(chain, quote.source),
          data: quote.calldata,
          value: quote.value || '0',
          gasLimit: gasEstimate.gasLimit,
          maxFeePerGas: gasEstimate.maxFeePerGas,
          maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas
        };
      } else {
        // Fallback to simple swap transaction
        txData = await this.buildSimpleSwapTransaction(quote, gasEstimate, chain);
      }

      // Send transaction with MEV protection if available
      const tx = await this.sendMEVProtectedTransaction(signer, txData, chain);
      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.transactionHash,
        tokensReceived: quote.estimatedOutput,
        executedPrice: quote.estimatedOutput / quote.inputAmount,
        gasUsed: receipt.gasUsed.toString(),
        gasFee: receipt.gasUsed.mul(receipt.effectiveGasPrice).toString()
      };

    } catch (error) {
      console.error('EVM trade execution failed:', error);
      return { success: false, message: error.message };
    }
  }

  async executeSolanaTrade(wallet, quote, gasEstimate) {
    try {
      // Implement Solana trade execution
      const connection = await rpcManager.getSolanaConnection();
      
      // For Jupiter swaps
      if (quote.source === 'jupiter' && quote.swapTransaction) {
        const swapResult = await this.executeJupiterSwap(wallet, quote.swapTransaction, connection);
        return swapResult;
      }

      // Fallback to basic Solana swap
      return await this.executeBasicSolanaSwap(wallet, quote, connection);

    } catch (error) {
      console.error('Solana trade execution failed:', error);
      return { success: false, message: error.message };
    }
  }

  async sendMEVProtectedTransaction(signer, txData, chain) {
    try {
      // Try to use MEV-protected RPC if available
      const mevRpcUrl = process.env[`${chain.toUpperCase()}_MEV_RPC`];
      if (mevRpcUrl) {
        const mevProvider = new ethers.providers.JsonRpcProvider(mevRpcUrl);
        const mevSigner = signer.connect(mevProvider);
        return await mevSigner.sendTransaction(txData);
      }

      // Fallback to regular transaction
      return await signer.sendTransaction(txData);

    } catch (error) {
      console.error('MEV protected transaction failed, using regular:', error);
      return await signer.sendTransaction(txData);
    }
  }

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  getNativeTokenAddress(chain) {
    const nativeAddresses = {
      ethereum: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      base: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      bsc: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      polygon: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      arbitrum: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      solana: 'So11111111111111111111111111111111111111112', // WSOL
      conflux: '0x0000000000000000000000000000000000000000'
    };
    return nativeAddresses[chain];
  }

  getGasMultiplier(gasLevel) {
    const multipliers = { low: 1.0, medium: 1.1, high: 1.3 };
    return multipliers[gasLevel] || 1.1;
  }

  getExplorerUrl(txHash, chain) {
    const explorers = {
      ethereum: `https://etherscan.io/tx/${txHash}`,
      base: `https://basescan.org/tx/${txHash}`,
      bsc: `https://bscscan.com/tx/${txHash}`,
      polygon: `https://polygonscan.com/tx/${txHash}`,
      arbitrum: `https://arbiscan.io/tx/${txHash}`,
      solana: `https://solscan.io/tx/${txHash}`,
      conflux: `https://confluxscan.io/tx/${txHash}`
    };
    return explorers[chain];
  }

  async validateTradeParams(params) {
    const { userId, tokenAddress, amount, chain } = params;

    if (!userId || !tokenAddress || !amount || !chain) {
      return { isValid: false, error: 'Missing required parameters' };
    }

    if (amount <= 0) {
      return { isValid: false, error: 'Amount must be positive' };
    }

    if (!this.chainConfigs[chain]) {
      return { isValid: false, error: 'Unsupported chain' };
    }

    // Validate token address format
    if (chain === 'solana') {
      try {
        new PublicKey(tokenAddress);
      } catch {
        return { isValid: false, error: 'Invalid Solana token address' };
      }
    } else {
      if (!ethers.utils.isAddress(tokenAddress)) {
        return { isValid: false, error: 'Invalid EVM token address' };
      }
    }

    return { isValid: true };
  }

  async recordTransaction(txData) {
    try {
      // Record in user service or dedicated transaction service
      await userService.recordTransaction(txData.userId, txData);
      console.log(`📝 Transaction recorded: ${txData.txHash}`);
    } catch (error) {
      console.error('Failed to record transaction:', error);
    }
  }

  // ========================================
  // USER POSITION TRACKING
  // ========================================

  async getUserPositions(userId) {
    try {
      const userSettings = await userService.getUserSettings(userId);
      if (!userSettings) return [];

      const positions = [];
      const chains = Object.keys(this.chainConfigs);

      for (const chain of chains) {
        const wallet = await walletService.getUserWallet(userId, chain);
        if (wallet) {
          const chainPositions = await this.getChainPositions(wallet.address, chain);
          positions.push(...chainPositions);
        }
      }

      return positions;

    } catch (error) {
      console.error('Error getting user positions:', error);
      return [];
    }
  }

  async getChainPositions(walletAddress, chain) {
    try {
      // Get token balances and calculate positions
      const balances = await walletService.getWalletBalance(walletAddress, chain);
      
      // Convert balances to position format
      const positions = [];
      if (balances.tokens) {
        for (const token of balances.tokens) {
          if (token.balance > 0) {
            const tokenInfo = await tokenDataService.getTokenInfo(token.address, chain);
            positions.push({
              chain,
              tokenAddress: token.address,
              tokenName: tokenInfo?.name || 'Unknown',
              tokenSymbol: tokenInfo?.symbol || 'UNKNOWN',
              balance: token.balance,
              currentPrice: tokenInfo?.price || 0,
              currentValue: token.balance * (tokenInfo?.price || 0),
              // These would come from transaction history
              averageBuyPrice: 0,
              investedAmount: 0,
              pnl: 0,
              pnlPercent: 0,
              lastUpdated: Date.now()
            });
          }
        }
      }

      return positions;

    } catch (error) {
      console.error(`Error getting ${chain} positions:`, error);
      return [];
    }
  }
}

module.exports = new AdvancedTradingEngine(); 