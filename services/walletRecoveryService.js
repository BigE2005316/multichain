// Wallet Recovery Service - For users who lost access to old wallets
const userService = require('../users/userService');
const { PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getRPCManager } = require('./rpcManager');

class WalletRecoveryService {
  constructor() {
    this.rpcManager = getRPCManager();
    // Register configured RPCs (if provided)
    try {
      const solUrl = process.env.SOLANA_RPC_URL || process.env.SOLANA_RPC || process.env.HELIUS_RPC_URL;
      if (solUrl) this.rpcManager.addRPC('solana', solUrl, 1);
    } catch (e) {
      console.warn('Could not register SOL RPC for walletRecoveryService:', e.message);
    }
  }

  // Get all wallet addresses associated with a user
  async getAllUserWallets(userId) {
    try {
      const userData = await userService.getUserSettings(userId);
      const wallets = [];

      // Current custodial wallets
      if (userData.custodialWallets) {
        Object.keys(userData.custodialWallets).forEach(chain => {
          wallets.push({
            address: userData.custodialWallets[chain].address,
            chain,
            type: 'current',
            status: 'active',
            createdAt: userData.custodialWallets[chain].createdAt,
            regenerated: userData.custodialWallets[chain].regenerated || false
          });
        });
      }

      // Named wallets (likely old wallets)
      if (userData.walletNames) {
        Object.keys(userData.walletNames).forEach(address => {
          const name = userData.walletNames[address];
          const status = userData.walletStatus?.[address] || 'unknown';
          
          wallets.push({
            address,
            name,
            type: 'named',
            status,
            chain: 'solana', // Most named wallets are Solana
            createdAt: 'unknown'
          });
        });
      }

      // SPECIAL: Add the user's known old wallet if not already included
      if (userId === '5290841278') {
        const knownOldWallet = '4vB155WNthZn6TBVjuZm1SjyJM4RDTgUERm2H4fuA8KQ';
        const exists = wallets.find(w => w.address === knownOldWallet);
        
        if (!exists) {
          wallets.push({
            address: knownOldWallet,
            name: 'Real Old Wallet with 0.05 SOL',
            type: 'recovered',
            status: 'found',
            chain: 'solana',
            createdAt: 'Before regeneration'
          });
        }
      }

      // Corrupted wallets (backed up during regeneration)
      if (userData.corruptedWallets) {
        Object.keys(userData.corruptedWallets).forEach(chain => {
          wallets.push({
            address: userData.corruptedWallets[chain].address,
            chain,
            type: 'corrupted',
            status: 'corrupted',
            createdAt: userData.corruptedWallets[chain].originalCreatedAt,
            corruptedAt: userData.corruptedWallets[chain].corruptedAt
          });
        });
      }

      return wallets;
    } catch (error) {
      console.error('Get all user wallets error:', error);
      return [];
    }
  }

  // Check balance and token holdings for a wallet
  async checkWalletAssets(address, chain = 'solana') {
    try {
      if (chain !== 'solana') {
        return { error: 'Only Solana supported for now' };
      }

      const publicKey = new PublicKey(address);
      
      // Get SOL balance
      const solBalance = await this.rpcManager.executeWithRetry('solana', async (rpc) => {
        return await rpc.getBalance(publicKey);
      }, 3);
      const solAmount = solBalance / LAMPORTS_PER_SOL;

      // Get token accounts
      const tokenAccounts = await this.rpcManager.executeWithRetry('solana', async (rpc) => {
        return await rpc.getParsedTokenAccountsByOwner(publicKey, {
          programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
        });
      }, 3);

      const tokens = [];
      for (const account of tokenAccounts.value) {
        const tokenInfo = account.account.data.parsed.info;
        if (tokenInfo.tokenAmount.uiAmount > 0) {
          tokens.push({
            mint: tokenInfo.mint,
            balance: tokenInfo.tokenAmount.uiAmount,
            decimals: tokenInfo.tokenAmount.decimals,
            account: account.pubkey.toString()
          });
        }
      }

      // Get recent transactions
      const signatures = await this.rpcManager.executeWithRetry('solana', async (rpc) => {
        return await rpc.getSignaturesForAddress(publicKey, { limit: 5 });
      }, 3);
      const recentTxs = signatures.map(sig => ({
        signature: sig.signature,
        timestamp: new Date(sig.blockTime * 1000).toISOString(),
        status: sig.confirmationStatus
      }));

      return {
        address,
        solBalance: solAmount,
        tokenCount: tokens.length,
        tokens,
        recentTransactions: recentTxs,
        explorerUrl: `https://solscan.io/account/${address}`
      };

    } catch (error) {
      console.error(`Check wallet assets error for ${address}:`, error);
      return { error: error.message };
    }
  }

  // Generate recovery report for user
  async generateRecoveryReport(userId) {
    try {
      console.log(`🔍 Generating recovery report for user ${userId}`);
      
      const wallets = await this.getAllUserWallets(userId);
      const report = {
        userId,
        totalWallets: wallets.length,
        wallets: [],
        summary: {
          activeWallets: 0,
          walletsWithFunds: 0,
          totalSOL: 0,
          totalTokens: 0
        },
        recommendations: []
      };

      // Check each wallet
      for (const wallet of wallets) {
        console.log(`Checking wallet: ${wallet.address}`);
        
        const assets = await this.checkWalletAssets(wallet.address, wallet.chain);
        
        const walletReport = {
          ...wallet,
          assets
        };

        if (!assets.error) {
          if (assets.solBalance > 0 || assets.tokenCount > 0) {
            report.summary.walletsWithFunds++;
            report.summary.totalSOL += assets.solBalance;
            report.summary.totalTokens += assets.tokenCount;
          }
          
          if (wallet.status === 'active') {
            report.summary.activeWallets++;
          }
        }

        report.wallets.push(walletReport);
      }

      // Generate recommendations
      if (report.summary.walletsWithFunds > 1) {
        report.recommendations.push('Multiple wallets found with assets - consider consolidating');
      }
      
      if (report.summary.walletsWithFunds === 0) {
        report.recommendations.push('No funds found in any wallet - check if funds were transferred elsewhere');
      }

      const corruptedWalletWithFunds = report.wallets.find(w => 
        w.type === 'corrupted' && w.assets && !w.assets.error && 
        (w.assets.solBalance > 0 || w.assets.tokenCount > 0)
      );
      
      if (corruptedWalletWithFunds) {
        report.recommendations.push('CRITICAL: Corrupted wallet found with funds - recovery needed');
      }

      return report;

    } catch (error) {
      console.error('Generate recovery report error:', error);
      return { error: error.message };
    }
  }

  // Format recovery report for display
  formatReportForUser(report) {
    if (report.error) {
      return `❌ Error generating recovery report: ${report.error}`;
    }

    let message = `🔍 **WALLET RECOVERY REPORT**\n`;
    message += `============================\n\n`;
    
    message += `👤 **User ID:** ${report.userId}\n`;
    message += `📊 **Summary:**\n`;
    message += `   • Total Wallets: ${report.totalWallets}\n`;
    message += `   • Active Wallets: ${report.summary.activeWallets}\n`;
    message += `   • Wallets with Funds: ${report.summary.walletsWithFunds}\n`;
    message += `   • Total SOL: ${report.summary.totalSOL.toFixed(4)}\n`;
    message += `   • Total Token Holdings: ${report.summary.totalTokens}\n\n`;

    message += `📋 **WALLET DETAILS:**\n`;
    message += `=====================\n`;

    report.wallets.forEach((wallet, index) => {
      message += `\n**${index + 1}. ${wallet.type?.toUpperCase()} WALLET**\n`;
      message += `   Address: \`${wallet.address}\`\n`;
      message += `   Chain: ${wallet.chain}\n`;
      message += `   Status: ${wallet.status}\n`;
      
      if (wallet.name) {
        message += `   Name: "${wallet.name}"\n`;
      }
      
      if (wallet.createdAt && wallet.createdAt !== 'unknown') {
        message += `   Created: ${wallet.createdAt}\n`;
      }

      if (wallet.assets && !wallet.assets.error) {
        message += `   💰 SOL Balance: ${wallet.assets.solBalance.toFixed(4)}\n`;
        message += `   🪙 Token Holdings: ${wallet.assets.tokenCount}\n`;
        
        if (wallet.assets.tokens.length > 0) {
          message += `   📋 Tokens:\n`;
          wallet.assets.tokens.forEach(token => {
            message += `      - ${token.balance} tokens (${token.mint.slice(0,8)}...)\n`;
          });
        }
        
        message += `   🔍 Explorer: ${wallet.assets.explorerUrl}\n`;
      } else if (wallet.assets?.error) {
        message += `   ❌ Error: ${wallet.assets.error}\n`;
      }
    });

    if (report.recommendations.length > 0) {
      message += `\n💡 **RECOMMENDATIONS:**\n`;
      message += `========================\n`;
      report.recommendations.forEach((rec, index) => {
        message += `${index + 1}. ${rec}\n`;
      });
    }

    return message;
  }

  // Quick wallet status for a specific user
  async quickWalletCheck(userId) {
    try {
      const wallets = await this.getAllUserWallets(userId);
      const activeWallet = wallets.find(w => w.type === 'current' && w.status === 'active');
      const namedWallets = wallets.filter(w => w.type === 'named');
      
      return {
        activeWallet,
        namedWallets,
        totalWallets: wallets.length,
        hasMultipleWallets: wallets.length > 1
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = new WalletRecoveryService(); 