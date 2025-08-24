const WalletFollow = require('../models/WalletFollow');
const { pollEvmLeader } = require('./evm.service');
const { pollSolLeader } = require('./solana.service');


async function* leaderBatchIterator(batchSize = 50) {
let page = 0;
while (true) {
const docs = await WalletFollow.find({ 'followers.0': { $exists: true } })
.select('chain leader followers')
.skip(page * batchSize)
.limit(batchSize)
.lean();
if (!docs.length) return;
yield docs;
page += 1;
}
}


async function pollAllLeadersOnce() {
    console.log("polling all leaders once")
for await (const batch of leaderBatchIterator(50)) {
await Promise.all(batch.map(async (doc) => {
    console.log(`leader chain: ${doc.chain}`)
if (doc.chain === 'EVM') return pollEvmLeader(doc.leader, doc.followers || []);
if (doc.chain === 'SOL') return pollSolLeader(doc.leader, doc.followers || []);
}));
}
}


function startPollingLoop(intervalMs = 15000) {
console.log(`[Poller] Starting loop every ${intervalMs}ms`);
const tick = async () => {
try { await pollAllLeadersOnce(); }
catch (e) { console.error('[Poller] Error:', e.message); }
};
tick();
return setInterval(tick, intervalMs);
}


module.exports = { startPollingLoop };