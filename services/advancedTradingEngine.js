// services/advancedTradingEngine.js - Multi-Chain MEV-Protected Trading Engine
const axios = require('axios');
const { ethers } = require('ethers');
const { Connection, PublicKey, Transaction, Keypair, SystemProgram } = require('@solana/web3.js');
const rpcManager = require('./rpcManager').getRPCManager();
const userService = require('../users/userService');
const walletService = require('./walletService');
const tokenDataService = require('./tokenDataService');

//const bs58 = require('bs58');


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
      //const wallet = await walletService.getUserWallet(userId, chain);
      const wallet = await walletService.getWalletInfo(userId, chain);
      
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
    debugger
    const { userId, tokenAddress, amount, position, slippage, gasLevel = 'medium' } = params;
    this.userId = userId
    const chain = position.chain
    try {
      debugger
      console.log(`🔄 Executing SELL: ${amount} ${tokenAddress} → ${this.chainConfigs[chain].symbol} on ${chain.toUpperCase()}`);

      // Similar structure to buy but reversed
      const quote = await this.getOptimalQuote({
        chain,
        fromToken: tokenAddress,
        toToken: this.getNativeTokenAddress(chain),
        amount,
        slippage: slippage || this.chainConfigs[chain].slippageTolerance
      });

      debugger
      if (!quote.success) {
        return { success: false, message: quote.error };
      }

      debugger
      const wallet = await walletService.getWalletInfo(userId, chain);
      
      //const wallet = await walletService.getUserWallet(userId, chain);
      if (!wallet) {
        return { success: false, message: 'Wallet not found' };
      }

      debugger
      const gasEstimate = await this.getAdvancedGasEstimate(chain, gasLevel);

      let result;
      if (chain === 'solana') {
        result = await this.executeSolanaTrade(wallet, quote, gasEstimate);
        debugger
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
      debugger
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
        //return await this.getSolanaComputeUnits(chain);
        return 200;
      }

      // For EVM chains, use QuickNode-style gas estimation
      const rpc = await rpcManager.getBestRPC(chain);
      
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

//   async getDummySolanaKeypair() {
//   // 64-byte static private key for deterministic behavior (NOT secure!)
//   // const dummySecretKeyHex = '1'.repeat(128); // 64 bytes in hex
//   // const dummySecretKey = Buffer.from(dummySecretKeyHex, 'hex');
//   // return Keypair.fromSecretKey(dummySecretKey);
//   return Keypair.generate();
// }

  async getDummySolanaKeypair(privateKeyHex) {
      const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
      const fromKeypair = Keypair.fromSecretKey(secretKey);
    return fromKeypair;
  }

async getSolanaComputeUnits(chain) {
  try {
    const connection = await rpcManager.getBestRPC(chain);

    debugger
    const userData = await userService.getUserSettings(this.userId);
  
    const wallet = userData.custodialWallets[chain];
    const privateKey = await walletService.decrypt(wallet.privateKey);


    const dummyKeypair = await this.getDummySolanaKeypair(privateKey);

    const { blockhash } = await connection.getLatestBlockhash('confirmed');

    const transaction = new Transaction({
      feePayer: dummyKeypair.publicKey,
      recentBlockhash: blockhash
    });

    // Add a no-op instruction (sending 0 lamports to self)
    transaction.add(SystemProgram.transfer({
      fromPubkey: dummyKeypair.publicKey,
      toPubkey: dummyKeypair.publicKey,
      lamports: 0
    }));

    debugger
    // Sign the transaction
    transaction.sign(dummyKeypair);

    // Serialize the transaction (important for simulateTransaction in latest @solana/web3.js versions)
    const serializedTx = transaction.serialize({
      requireAllSignatures: false, // Since this is a simulation
      verifySignatures: false
    });

    const { value } = await connection.simulateTransaction(serializedTx, {
      sigVerify: false,
      replaceRecentBlockhash: true
    });

    if (value?.logs) {
      const computeUnitLog = value.logs.find(log => log.includes('consumed'));
      if (computeUnitLog) {
        const match = computeUnitLog.match(/consumed (\d+) of (\d+) compute units/);
        if (match) {
          const used = parseInt(match[1]);
          return {
            computeUnits: used,
            success: true
          };
        }
      }
    }

    return {
      computeUnits: 200_000,
      success: false,
      message: 'Simulation did not return compute unit info'
    };

  } catch (error) {
    debugger
    console.error('Error estimating Solana compute units:', error);
    return {
      computeUnits: 200_000,
      success: false,
      message: error.message
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
    debugger
    const { chain, fromToken, toToken, amount, slippage } = params;

    try {
      // Get quotes from multiple DEX aggregators
      const quotes = await Promise.allSettled([
        this.getOpenOceanQuote(params),
        this.get1inchQuote(params),
        //this.getParaswapQuote(params),
        this.getJupiterQuote(params) // For Solana
      ]);
    debugger

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
    debugger

      return {
        success: true,
        ...bestQuote,
        aggregator: bestQuote.source,
        allQuotes: validQuotes.length
      };

    } catch (error) {
          debugger

      console.error('Quote aggregation failed:', error);
      return { success: false, error: error.message };
    }
  }

  async getOpenOceanQuote(params) {
    const { chain, fromToken, toToken, amount, slippage } = params;
    
    try {
      const chainId = this.chainConfigs[chain].chainId;
      debugger
      const response = await axios.get(`https://open-api.openocean.finance/v3/${chainId}/quote`, {
        params: {
          inTokenAddress: fromToken,
          outTokenAddress: toToken,
          // amount: ethers.utils.parseEther(amount.toString()).toString(),
          amount: ethers.parseEther(amount.toString()).toString(),
          slippage: slippage * 100, // Convert to percentage
          account: '0x0000000000000000000000000000000000000000' // Placeholder
        },
        timeout: 5000
      });
    debugger

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
      debugger
      console.error('OpenOcean quote failed:', error);
    }
    
    return { success: false, source: 'openocean' };
  }

  async get1inchQuote(params) {
        debugger

    const { chain, fromToken, toToken, amount, slippage } = params;
    
    try {
      const chainId = this.chainConfigs[chain].chainId;
      if (!['1', '56', '137', '42161'].includes(chainId.toString())) {
        return { success: false, source: '1inch', error: 'Chain not supported' };
      }
    debugger

      const response = await axios.get(`https://api.1inch.io/v5.0/${chainId}/quote`, {
        params: {
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          amount: ethers.utils.parseEther(amount.toString()).toString(),
        },
        timeout: 5000
      });
    debugger

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
          debugger
      console.error('1inch quote failed:', error);
    }
    
    return { success: false, source: '1inch' };
  }

  async getJupiterQuote(params) {
    debugger
    const { chain, fromToken, toToken, amount, slippage } = params;
    debugger
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

          debugger

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
          debugger

      console.error('Jupiter quote failed:', error);
    }
        debugger

    return { success: false, source: 'jupiter' };
  }

  // ========================================
  // TRADE EXECUTION
  // ========================================

  async executeEVMTrade(wallet, quote, gasEstimate, chain) {
    try {
      const rpc = await rpcManager.getBestRPC(chain);
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
            const userData = await userService.getUserSettings(this.userId);
  
            wallet = userData.custodialWallets[userData.chain];

            debugger
        const privateKey = await walletService.decrypt(wallet.privateKey);
        const keypair = await this.getDummySolanaKeypair(privateKey);
        debugger
        var publicKey = new PublicKey(wallet.address);
        //publicKey = publicKey.toBase58(),
        wallet = {...wallet, ...(walletService.createJupiterWalletAdapter(keypair))};
        wallet.publicKey = publicKey
        debugger
        const swapResult = await this.executeJupiterSwap(wallet, quote, connection);
        debugger
        return swapResult;
      }

      // Fallback to basic Solana swap
      return await this.executeBasicSolanaSwap(wallet, quote, connection);

    } catch (error) {
      console.error('Solana trade execution failed:', error);
      return { success: false, message: error.message };
    }
  }

// /**
//  * Executes a Jupiter swap transaction.
//  * @param {Keypair} wallet - The Solana wallet (payer).
//  * @param {string} rawSwapTxn - The base64-encoded swap transaction from Jupiter.
//  * @param {Connection} connection - Solana connection instance.
//  * @returns {Promise<string>} - Transaction signature.
//  */
// async executeJupiterSwap(wallet, rawSwapTxn, connection) {
//   try {
//     debugger
//     if (!rawSwapTxn) throw new Error('Swap transaction is empty.');

//     // Decode the base64 transaction
//     const swapTxnBuffer = Buffer.from(rawSwapTxn.serialize(), 'base64');
//     const transaction = Transaction.from(swapTxnBuffer);

//     debugger
//     // Set the fee payer and recent blockhash if not already set
//     transaction.feePayer = wallet.publicKey;

//     // If recent blockhash is missing, fetch it
//     if (!transaction.recentBlockhash) {
//       const latestBlockhash = await connection.getLatestBlockhash();
//       transaction.recentBlockhash = latestBlockhash.blockhash;
//     }

//     // Sign the transaction
//     transaction.sign(wallet);

//     // Send transaction
//     const signature = await connection.sendRawTransaction(transaction.serialize());
//     console.log('Swap transaction sent with signature:', signature);

//     // Optionally confirm
//     await connection.confirmTransaction(signature, 'confirmed');
//     return signature;
//   } catch (error) {
//     debugger
//     console.error('Swap execution failed:', error);
//     throw error;
//   }
// }



/**
 * Executes a Jupiter swap: quote → swap → sign → submit
 * 
 * @param {Keypair | WalletAdapter} wallet - Solana wallet with signTransaction()
 * @param {object} quoteResponse - Quote response from Jupiter /quote endpoint
 * @param {Connection} connection - Solana connection
 * @returns {Promise<string>} Transaction signature
 */
async executeJupiterSwap(wallet, quoteResponse, connection) {
  try {
    debugger
    // 1. Prepare swap request body
    const publicKey = new PublicKey(wallet.address);
    const body = {
      quoteResponse: quoteResponse.swapTransaction,
      userPublicKey: publicKey.toBase58(),
      wrapUnwrapSOL: true,
      asLegacyTransaction: true
    };

    debugger
    // 2. Request swap transaction from Jupiter
    const swapResp = await axios.post('https://quote-api.jup.ag/v6/swap', body);
    const { swapTransaction } = swapResp.data;
    debugger
    if (!swapTransaction) {
      throw new Error('Missing swapTransaction in Jupiter response');
    }

    // 3. Decode the base64 transaction
    const txBuffer = Buffer.from(swapTransaction, 'base64');
    const transaction = Transaction.from(txBuffer);

    debugger
    // 4. Add recent blockhash if missing
    if (!transaction.recentBlockhash) {
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
    }

    debugger
    // 5. Sign and send
    const signedTx = await wallet.signTransaction(transaction);
    debugger
    const signature = await connection.sendRawTransaction(signedTx.serialize());
    debugger
    await connection.confirmTransaction(signature, 'confirmed');

    console.log('✅ Jupiter swap sent:', signature);
    debugger
    //-----------------------------------------------------------
    //return signature;
    return {
      success: true,
      txHash: signature,
      proceeds: quoteResponse.swapTransaction.outAmount,
      amountSold: quoteResponse.swapTransaction?.amount,
      executedPrice: quoteResponse.swapTransaction.outAmount / quoteResponse.swapTransaction.inAmount,
      gasFee: 'N/A', // Jupiter doesn't return gas fee; Solana fees are negligible
      priceImpact: quoteResponse.swapTransaction.priceImpact,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=mainnet`
    };
  } catch (err) {
    debugger
    console.error(err)
    console.error('❌ Failed to execute swap:', err?.response?.data || err.message);
    throw err;
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
        const wallet = await walletService.getWalletInfo(userId, chain);
        
        //const wallet = await walletService.getUserWallet(userId, chain);
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