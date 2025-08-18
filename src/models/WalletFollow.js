// import mongoose from 'mongoose';
// const mongoose = require('mongoose');

// const schema = new mongoose.Schema({
//   chain: { type: String, enum: ['EVM', 'SOL'], index: true },
//   leader: { type: String, index: true }, // leader wallet we watch
//   followers: [{
//     userId: { type: mongoose.Types.ObjectId, ref: 'User' },
//     ratio: Number,
//     slippageBps: Number,
//     maxUsdPerTrade: Number,
//     active: Boolean
//   }]
// }, { timestamps: true });

// schema.index({ chain: 1, leader: 1 }, { unique: true });

// export default mongoose.model('WalletFollow', schema);

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  chain: { type: String, enum: ['EVM', 'SOL'], index: true },
  leader: { type: String, index: true }, // leader wallet we watch
  followers: [{
    userId: { type: mongoose.Types.ObjectId, ref: 'User' },
    ratio: Number,
    slippageBps: Number,
    maxUsdPerTrade: Number,
    active: Boolean
  }]
}, { timestamps: true });

schema.index({ chain: 1, leader: 1 }, { unique: true });

module.exports = mongoose.model('WalletFollow', schema);
