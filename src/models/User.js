// import mongoose from 'mongoose';
// const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//   tgId: { type: String, index: true, unique: true },
//   username: String,

//   // Wallets the user FOLLOWS (leaders they copy)
//   follows: [{
//     chain: { type: String, enum: ['EVM', 'SOL'], required: true },
//     address: { type: String, required: true },
//     ratio: { type: Number, default: 1.0 }, // 1.0 = same size
//     slippageBps: { type: Number, default: 50 },
//     maxUsdPerTrade: { type: Number, default: 1000 },
//     active: { type: Boolean, default: true }
//   }],

//   // Execution wallets (our bot-owned wallets per chain)
//   execWallets: {
//     EVM: { address: String, privateKeyRef: String }, // we use env key in this example
//     SOL: { address: String, privateKeyRef: String }
//   },

//   roles: [{ type: String, default: 'user' }]
// }, { timestamps: true });

// export default mongoose.model('User', userSchema);

// const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//   tgId: { type: String, index: true, unique: true },
//   username: String,

//   // Wallets the user FOLLOWS (leaders they copy)
//   follows: [{
//     chain: { type: String, enum: ['EVM', 'SOL'], required: true },
//     address: { type: String, required: true },
//     ratio: { type: Number, default: 1.0 }, // 1.0 = same size
//     slippageBps: { type: Number, default: 50 },
//     maxUsdPerTrade: { type: Number, default: 1000 },
//     active: { type: Boolean, default: true }
//   }],

//   // Execution wallets (our bot-owned wallets per chain)
//   execWallets: {
//     EVM: { address: String, privateKeyRef: String }, // we use env key in this example
//     SOL: { address: String, privateKeyRef: String }
//   },

//   roles: [{ type: String, default: 'user' }]
// }, { timestamps: true });

// module.exports = mongoose.model('User', userSchema);



const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  tgId: { type: String, index: true, unique: true },
  username: String,
  firstName: String,

  chain: { type: String, enum: ['evm', 'solana'], default: 'solana' },
  amount: { type: Number, default: 0 },
  slippage: { type: Number, default: 0 },

  // Wallets the user FOLLOWS (leaders they copy)
  follows: [{
    chain: { type: String, enum: ['EVM', 'SOL'], required: true },
    address: { type: String, required: true },
    ratio: { type: Number, default: 1.0 }, // 1.0 = same size
    slippageBps: { type: Number, default: 50 },
    maxUsdPerTrade: { type: Number, default: 1000 },
    active: { type: Boolean, default: true }
  }],

  // Execution wallets (our bot-owned wallets per chain)
  execWallets: {
    EVM: { address: String, privateKeyRef: String },
    SOL: { address: String, privateKeyRef: String }
  },

  // Custodial wallets (bot creates/manages for user)
  custodialWallets: {
    solana: {
      address: String,
      privateKey: String,
      mnemonic: String,
      createdAt: { type: Date, default: Date.now },
      balance: { type: Number, default: 0 },
      totalReceived: { type: Number, default: 0 },
      totalSent: { type: Number, default: 0 },
      txCount: { type: Number, default: 0 },
      lastUpdated: Date
    },
    evm: {
      address: String,
      privateKey: String,
      mnemonic: String,
      createdAt: { type: Date, default: Date.now },
      balance: { type: Number, default: 0 },
      totalReceived: { type: Number, default: 0 },
      totalSent: { type: Number, default: 0 },
      txCount: { type: Number, default: 0 },
      lastUpdated: Date
    }
  },

  // Copy-trading settings
  copySettings: {
    copySells: { type: Boolean, default: true },
    customTPSL: { type: Boolean, default: false },
    takeProfit: { type: [Number], default: [] },
    stopLossPercent: { type: Number, default: 0 },
    sellMode: { type: String, enum: ['proportional', 'fixed'], default: 'proportional' }
  },

  // Open positions (per token)
  positions: {
    type: Map,
    of: new mongoose.Schema({
      totalAmount: Number,
      avgPrice: Number,
      tokenSymbol: String,
      tokenName: String,
      chain: { type: String, enum: ['solana', 'evm'] },
      copyTrades: { type: Array, default: [] }
    }, { _id: false })
  },

  // User stats
  stats: {
    totalTrades: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    totalPnL: { type: Number, default: 0 },
    dailySpent: { type: Number, default: 0 },
    lastResetDate: String,
    lastActive: Date
  },

  walletNames: { type: Map, of: String },
  smartSlippage: { type: Boolean, default: false },

  customTPSL: {
    enabled: { type: Boolean, default: false },
    takeProfits: [{
      percent: Number,
      sellPercent: Number,
      triggered: { type: Boolean, default: false }
    }],
    stopLoss: {
      percent: Number,
      trailing: { type: Boolean, default: false },
      triggered: { type: Boolean, default: false },
      highWaterMark: { type: Number, default: 0 }
    }
  },
  // Transaction history
  transactions: [{
    userId: Number,
    chain: { type: String, enum: ['solana', 'evm'] },
    type: { type: String, enum: ['buy', 'sell'] },
    fromToken: String,
    toToken: String,
    amountIn: Number,
    status: { type: String, enum: ['pending', 'success', 'failed'] },
    timestamp: { type: Date, default: Date.now }
  }],

  roles: [{ type: String, default: 'user' }]
}, { timestamps: true });


module.exports = mongoose.model('User', userSchema);
