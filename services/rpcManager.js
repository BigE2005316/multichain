// services/rpcManager.js - Enhanced Multi-Chain RPC Manager with Failover
const axios = require('axios');
const { Connection, clusterApiUrl } = require('@solana/web3.js');
const { JsonRpcProvider } = require('ethers');

class RPCManager {
  constructor() {
    this.initialized = false;
    this.rateLimits = new Map();
    this.failedRPCs = new Set();
    this.lastHealthCheck = 0;
    this.healthCheckInterval = 120000; // 2 minutes instead of 30 seconds
    
    // Enhanced RPC configurations with multiple chains
    this.rpcConfigs = {
      solana: [
        { url: process.env.ALCHEMY_SOLANA_URL || 'https://api.mainnet-beta.solana.com', priority: 1, maxRequestsPerSecond: 5 }
      ],
      ethereum: [
        { url: process.env.ALCHEMY_ETH_URL || 'https://ethereum.blockpi.network/v1/rpc/public', priority: 1, maxRequestsPerSecond: 5 }
      ],
      bsc: [
        { url: process.env.ALCHEMY_BSC_URL || 'https://bsc-dataseed.binance.org/', priority: 1, maxRequestsPerSecond: 5 }
      ],
      polygon: [
        { url: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com/', priority: 1, maxRequestsPerSecond: 5 }
      ],
      arbitrum: [
        { url: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc', priority: 1, maxRequestsPerSecond: 5 }
      ],
      base: [
        { url: process.env.BASE_RPC_URL || 'https://mainnet.base.org', priority: 1, maxRequestsPerSecond: 5 }
      ]
    };
    
    this.connections = {};
    this.requestCounters = new Map();
    this.initialize();
  }

  async initialize() {
    try {
      console.log('🌐 Initializing Enhanced Multi-Chain RPC Manager...');
      
      // Initialize connections for each chain with minimal delays
      for (const [chain, configs] of Object.entries(this.rpcConfigs)) {
        this.connections[chain] = [];
        
        for (let i = 0; i < configs.length; i++) {
          const config = configs[i];
          
          try {
            let connection;
            
            if (chain === 'solana') {
              connection = new Connection(config.url, {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 60000,
                disableRetryOnRateLimit: false
              });
            } else {
              // Create provider without immediate network detection to prevent spam
              connection = new JsonRpcProvider(config.url, null, {
                staticNetwork: true, // Prevent automatic network detection
                batchMaxCount: 1,
                batchStallTime: 100
              });
            }
            
            this.connections[chain].push({
              ...config,
              connection,
              healthy: true,
              lastUsed: 0,
              requestCount: 0,
              errorCount: 0
            });
            
            // Initialize request counter
            this.requestCounters.set(config.url, {
              count: 0,
              lastReset: Date.now()
            });
            
            console.log(`✅ ${chain.toUpperCase()} RPC initialized: ${config.url.substring(0, 50)}...`);
            
          } catch (error) {
            console.warn(`⚠️ Failed to initialize ${chain} RPC: ${error.message.substring(0, 100)}`);
            this.failedRPCs.add(config.url);
          }
        }
      }
      
      // Start health monitoring with delay to allow startup
      setTimeout(() => this.startHealthMonitoring(), 60000); // Wait 60s before starting health checks
      
      this.initialized = true;
      console.log('✅ Multi-Chain RPC Manager initialized successfully');
      
      // Log status
      const status = this.getStatus();
      console.log(`📊 Total RPC Status: ${status.healthyRPCs}/${status.totalRPCs} healthy connections`);
      Object.entries(status.chains).forEach(([chain, chainStatus]) => {
        console.log(`   ${chain.toUpperCase()}: ${chainStatus.healthy}/${chainStatus.total} healthy`);
      });
      
    } catch (error) {
      console.error('❌ Failed to initialize RPC Manager:', error);
      this.initialized = false;
    }
  }

  async getBestRPC(chain) {
    if (!this.initialized || !this.connections[chain]) {
      throw new Error(`RPC Manager not initialized for chain: ${chain}`);
    }
    
    const connections = this.connections[chain];
    
    // Filter healthy connections
    const healthyConnections = connections.filter(conn => 
      conn.healthy && 
      !this.failedRPCs.has(conn.url) &&
      this.canMakeRequest(conn.url, conn.maxRequestsPerSecond)
    );
    
    if (healthyConnections.length === 0) {
      // Reset failed RPCs if all are failed (circuit breaker)
      if (this.failedRPCs.size >= connections.length) {
        console.log(`🔄 Resetting failed RPCs for ${chain} (circuit breaker)`);
        this.failedRPCs.clear();
        // Try again with reset
        return this.getBestRPC(chain);
      }
      
      throw new Error(`No healthy RPCs available for ${chain}`);
    }
    
    // Sort by priority and usage
    healthyConnections.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.requestCount - b.requestCount;
    });
    
    const selected = healthyConnections[0];
    
    // Update usage stats
    selected.lastUsed = Date.now();
    selected.requestCount++;
    
    // Update request counter
    this.updateRequestCounter(selected.url);
    
    return selected.connection;
  }

  canMakeRequest(url, maxRequestsPerSecond) {
    const counter = this.requestCounters.get(url);
    if (!counter) return true;
    
    const now = Date.now();
    const timeSinceReset = now - counter.lastReset;
    
    // Reset counter every second
    if (timeSinceReset >= 1000) {
      counter.count = 0;
      counter.lastReset = now;
      return true;
    }
    
    // More conservative: use 80% of limit to prevent hitting exact limit
    const safeLimit = Math.floor(maxRequestsPerSecond * 0.8);
    return counter.count < safeLimit;
  }

  updateRequestCounter(url) {
    const counter = this.requestCounters.get(url);
    if (counter) {
      counter.count++;
    }
  }

  async executeWithRetry(chain, operation, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const rpc = await this.getBestRPC(chain);
        const result = await operation(rpc);
        
        // Reset error count on success
        this.resetRPCErrors(chain, rpc);
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Handle rate limiting
        if (error.code === 429 || error.message?.includes('429') || error.message?.includes('rate limit')) {
          console.warn(`⚠️ Rate limit hit on ${chain}, attempt ${attempt}/${maxRetries}`);
          
          // Mark RPC as temporarily failed
          if (attempt < maxRetries) {
            await this.handleRateLimit(chain, error);
            continue;
          }
        }
        
        // Handle other errors
        if (error.message?.includes('fetch failed') || error.code === 'NETWORK_ERROR') {
          console.warn(`⚠️ Network error on ${chain}, attempt ${attempt}/${maxRetries}:`, error.message);
          
          if (attempt < maxRetries) {
            await this.sleep(1000 * attempt); // Exponential backoff
            continue;
          }
        }
        
        // Don't retry for these errors
        if (error.message?.includes('Invalid') || error.message?.includes('Not found')) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          await this.sleep(500 * attempt);
        }
      }
    }
    
    throw lastError;
  }

  async handleRateLimit(chain, error) {
    // Extract retry-after if available
    let waitTime = 5000; // Default 5 seconds (more conservative)
    
    if (error.headers && error.headers['retry-after']) {
      waitTime = parseInt(error.headers['retry-after']) * 1000;
    } else if (error.message?.includes('wait')) {
      const match = error.message.match(/(\d+)/);
      if (match) {
        waitTime = parseInt(match[1]) * 1000;
      }
    }
    
    // More conservative wait times
    waitTime = Math.min(Math.max(waitTime, 5000), 60000); // Min 5s, Max 60s
    
    console.log(`⏳ Rate limited on ${chain}, waiting ${waitTime}ms before retry...`);
    await this.sleep(waitTime);
  }

  resetRPCErrors(chain, connection) {
    if (this.connections[chain]) {
      const rpc = this.connections[chain].find(c => c.connection === connection);
      if (rpc) {
        rpc.errorCount = 0;
        rpc.healthy = true;
        this.failedRPCs.delete(rpc.url);
      }
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  startHealthMonitoring() {
    setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('Health check error:', error.message);
      }
    }, this.healthCheckInterval);
  }

  async performHealthCheck() {
    const now = Date.now();
    
    // Skip if recently checked
    if (now - this.lastHealthCheck < this.healthCheckInterval / 2) {
      return;
    }
    
    this.lastHealthCheck = now;
    
    // Only check a subset of connections each time to reduce load
    for (const [chain, connections] of Object.entries(this.connections)) {
      // Only check one RPC per chain per health check cycle
      const activeRPC = connections.find(rpc => rpc.healthy) || connections[0];
      if (!activeRPC) continue;
      
      try {
        // Add timeout to prevent hanging
        const healthCheck = chain === 'solana' 
          ? activeRPC.connection.getSlot()
          : activeRPC.connection.getBlockNumber();
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 10000)
        );
        
        await Promise.race([healthCheck, timeoutPromise]);
        
        // On success, mark as healthy and reset error count
        activeRPC.healthy = true;
        activeRPC.errorCount = 0;
        this.failedRPCs.delete(activeRPC.url);
        
      } catch (error) {
        activeRPC.errorCount = (activeRPC.errorCount || 0) + 1;
        
        // Only mark as unhealthy after 5 consecutive failures (more conservative)
        if (activeRPC.errorCount >= 5) {
          activeRPC.healthy = false;
          this.failedRPCs.add(activeRPC.url);
          console.warn(`⚠️ Marking ${chain} RPC as unhealthy after ${activeRPC.errorCount} failures: ${activeRPC.url.substring(0, 50)}...`);
        }
      }
      
      // Add small delay between chain health checks
      await this.sleep(1000);
    }
  }

  // Helper methods for specific chains
  async getSolanaConnection() {
    return this.getBestRPC('solana');
  }

  async getEthereumProvider() {
    return this.getBestRPC('ethereum');
  }

  async getBSCProvider() {
    return this.getBestRPC('bsc');
  }

  async getPolygonProvider() {
    return this.getBestRPC('polygon');
  }

  async getArbitrumProvider() {
    return this.getBestRPC('arbitrum');
  }

  async getBaseProvider() {
    return this.getBestRPC('base');
  }

  // Get status for monitoring
  getStatus() {
    const status = {
      initialized: this.initialized,
      chains: {},
      failedRPCs: Array.from(this.failedRPCs),
      totalRPCs: 0,
      healthyRPCs: 0,
      supportedChains: Object.keys(this.rpcConfigs)
    };

    for (const [chain, connections] of Object.entries(this.connections)) {
      const healthy = connections.filter(c => c.healthy && !this.failedRPCs.has(c.url));
      
      status.chains[chain] = {
        total: connections.length,
        healthy: healthy.length,
        failed: connections.length - healthy.length,
        endpoints: connections.map(c => ({
          url: c.url.substring(0, 50) + '...',
          healthy: c.healthy,
          priority: c.priority,
          requestCount: c.requestCount
        }))
      };
      
      status.totalRPCs += connections.length;
      status.healthyRPCs += healthy.length;
    }

    return status;
  }

  // Add new RPC endpoint
  addRPC(chain, url, priority = 10) {
    if (!this.rpcConfigs[chain]) {
      this.rpcConfigs[chain] = [];
    }

    this.rpcConfigs[chain].push({
      url,
      priority,
      maxRequestsPerSecond: 5
    });

    console.log(`➕ Added new RPC for ${chain}: ${url}`);
  }

  // Remove RPC endpoint
  removeRPC(chain, url) {
    if (this.rpcConfigs[chain]) {
      this.rpcConfigs[chain] = this.rpcConfigs[chain].filter(rpc => rpc.url !== url);
      this.failedRPCs.delete(url);
      console.log(`➖ Removed RPC for ${chain}: ${url}`);
    }
  }

  // Get chain-specific stats
  getChainStats(chain) {
    if (!this.connections[chain]) {
      return null;
    }

    const connections = this.connections[chain];
    const healthy = connections.filter(c => c.healthy);
    
    return {
      chain,
      totalEndpoints: connections.length,
      healthyEndpoints: healthy.length,
      totalRequests: connections.reduce((sum, c) => sum + c.requestCount, 0),
      averageResponseTime: 'N/A', // Could be implemented
      lastHealthCheck: new Date(this.lastHealthCheck).toISOString()
    };
  }
}

// Singleton instance
let rpcManager = null;

function getRPCManager() {
  if (!rpcManager) {
    rpcManager = new RPCManager();
  }
  return rpcManager;
}

module.exports = {
  getRPCManager,
  RPCManager
};