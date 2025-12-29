
const WalletFollow = require('../models/WalletFollow');
const { pollEvmLeader } = require('./evm.service');
const { pollSolLeader } = require('./solana.service');
//const bot = require('../../telegram/bot');


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


async function pollAllLeadersOnce(bot) {
    console.log("polling all leaders once")
    for await (const batch of leaderBatchIterator(50)) {
        await Promise.all(batch.map(async (doc) => {
            console.log(`leader chain: ${doc.chain}`)
            if (doc.chain === 'EVM') return pollEvmLeader(doc.leader, doc.followers || [], bot);
            if (doc.chain === 'SOL') return pollSolLeader(doc.leader, doc.followers || [], bot);
        }));
    }
}


let _pollerHandle = null;
let _isPolling = false;

function startPollingLoop(intervalMs = 15000000, bot, { startImmediate = true, allowOverlap = false } = {}) {
    if (_pollerHandle) {
        console.warn('[Poller] Polling already started');
        return _pollerHandle;
    }

    console.log(`[Poller] Starting loop every ${intervalMs}ms (startImmediate=${startImmediate}, allowOverlap=${allowOverlap})`);

    const runOnce = async () => {
        if (!allowOverlap && _isPolling) {
            console.log('[Poller] Previous run still in progress; skipping this tick to avoid overlap');
            return;
        }

        _isPolling = true;
        const startedAt = Date.now();
        try {
            await pollAllLeadersOnce(bot);
        } catch (e) {
            console.error('[Poller] Error during pollAllLeadersOnce:', e);
        } finally {
            _isPolling = false;
            const duration = Date.now() - startedAt;
            console.log(`[Poller] Tick completed in ${duration}ms`);
        }
    };

    // Non-overlapping loop using setInterval but guarded by _isPolling
    if (startImmediate) {
        // Fire an immediate run first
        runOnce().catch(err => console.error('[Poller] Immediate run failed:', err));
    }

    _pollerHandle = setInterval(() => {
        runOnce().catch(err => console.error('[Poller] Scheduled run failed:', err));
    }, intervalMs);

    return _pollerHandle;
}

function stopPollingLoop() {
    if (_pollerHandle) {
        clearInterval(_pollerHandle);
        _pollerHandle = null;
        _isPolling = false;
        console.log('[Poller] Stopped');
    } else {
        console.log('[Poller] No active poller to stop');
    }
}


module.exports = { startPollingLoop, stopPollingLoop, pollAllLeadersOnce };