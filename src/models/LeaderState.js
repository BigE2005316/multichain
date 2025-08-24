const mongoose4 = require('mongoose');


const stateSchema = new mongoose4.Schema({
chain: { type: String, enum: ['EVM', 'SOL'], index: true },
leader: { type: String, index: true },
// EVM
lastBlock: Number,
lastSeenTxHashes: [String],
// SOL
lastSignature: String,
}, { timestamps: true });


stateSchema.index({ chain: 1, leader: 1 }, { unique: true });


module.exports = mongoose4.model('LeaderState', stateSchema);