// import mongoose from 'mongoose';
const mongoose = require('mongoose');

const TradeLogSchema = new mongoose.Schema({
  chain: { type: String, enum: ['EVM', 'SOL'] },
  leader: String,
  leaderTx: String,
  tokenIn: String,
  tokenOut: String,
  amountIn: String,
  amountOutMin: String,
  parsedAt: Date,

  // Approval workflow
  confirmed: { type: Boolean, default: false },
  replicateMode: { type: String, enum: ['percent','amount','all'], default: null },
  replicateValue: { type: String, default: null },

  followers: [{
    userId: { type: mongoose.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['QUEUED','EXECUTED','FAILED'], default: 'QUEUED' },
    execTx: String,
    error: String,
    customAmount: Number,
    customSlippage: Number
  }],

  idempotencyKey: { type: String, unique: true } // to prevent re-exec
}, { timestamps: true });

module.exports = mongoose.model('TradeLog', TradeLogSchema);

// const TradeLog = new mongoose.Schema({
//   chain: { type: String, enum: ['EVM', 'SOL'] },
//   leader: String,
//   leaderTx: String,
//   tokenIn: String,
//   tokenOut: String,
//   amountIn: String,
//   amountOutMin: String,
//   parsedAt: Date,

//   followers: [{
//     userId: { type: mongoose.Types.ObjectId, ref: 'User' },
//     status: { type: String, enum: ['QUEUED','EXECUTED','FAILED'], default: 'QUEUED' },
//     execTx: String,
//     error: String
//   }],

//   idempotencyKey: { type: String, unique: true } // to prevent re-exec
// }, { timestamps: true });

// export default mongoose.model('TradeLog', TradeLog);
