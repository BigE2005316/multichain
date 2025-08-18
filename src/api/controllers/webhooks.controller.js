// import { Router } from 'express';
// import crypto from 'crypto';
// import { cfg } from '../../config/index.js';
// import logger from '../../utils/logger.js';
// import { enqueueExecution } from '../../queue/jobs/executeTrade.job.js';
// import { parseEvmTrade } from '../../services/trade-parser.evm.js';
// import { parseSolTrade } from '../../services/trade-parser.sol.js';
// import { idempotency } from '../../services/idempotency.service.js';
// import WalletFollow from '../../models/WalletFollow.js';
// import TradeLog from '../../models/TradeLog.js';
const express = require('express');
const crypto = require('crypto');
const { cfg } = require('../../config/index.js');
const logger = require('../../utils/logger.js');
const { enqueueExecution } = require('../../queue/jobs/executeTrade.job.js');
const { parseEvmTrade } = require('../../services/trade-parser.evm.js');
const { parseSolTrade } = require('../../services/trade-parser.sol.js');
const { idempotency } = require('../../services/idempotency.service.js');
const WalletFollow = require('../../models/WalletFollow.js');
const TradeLog = require('../../models/TradeLog.js');

//const router = express.Router();

// export const webhooksRouter = Router();
const webhooksRouter = express.Router();

module.exports = { webhooksRouter };
/** ---------- Moralis (EVM) webhook ---------- */
// Verify x-signature = sha3(body + stream-secret). Moralis also provides helper; we implement inline.
function verifyMoralis(req) {
  const signature = req.headers['x-signature'];
  const body = JSON.stringify(req.body);
  const computed = crypto.createHash('sha3-256')
    .update(body + cfg.moralis.streamSecret)
    .digest('hex');
  return signature && signature === computed;
}

webhooksRouter.post('/moralis', async (req, res) => {
  try {
    if (!verifyMoralis(req)) return res.status(401).send('invalid signature');

    const data = req.body; // schema: txn + logs, see Moralis docs
    // extract leader address & tx
    const leader = data?.txs?.[0]?.fromAddress?.toLowerCase() || data?.txs?.[0]?.toAddress?.toLowerCase();
    const parsed = await parseEvmTrade(data);
    if (!parsed) return res.json({ ack: true }); // non-trade activity

    const idKey = `EVM:${parsed.txHash}`;
    if (!(await idempotency.tryLock(idKey))) return res.json({ deduped: true });

    // get all followers for this leader on EVM
    const wf = await WalletFollow.findOne({ chain: 'EVM', leader });
    if (!wf || wf.followers.length === 0) return res.json({ ok: true });

    const logDoc = await TradeLog.create({
      chain: 'EVM',
      leader,
      leaderTx: parsed.txHash,
      tokenIn: parsed.tokenIn,
      tokenOut: parsed.tokenOut,
      amountIn: parsed.amountIn,
      amountOutMin: parsed.amountOutMin,
      parsedAt: new Date(),
      idempotencyKey: idKey,
      followers: wf.followers.map(f => ({ userId: f.userId }))
    });

    await enqueueExecution({
      chain: 'EVM',
      tradeLogId: String(logDoc._id),
      leader,
      parsed
    });

    res.json({ ok: true });
  } catch (e) {
    logger.error(e, 'moralis webhook error');
    res.status(500).send('error');
  }
});

/** ---------- Helius (Solana) webhook ---------- */
// We validate the Authorization header equals our secret (Helius will echo it). :contentReference[oaicite:2]{index=2}
webhooksRouter.post('/helius', async (req, res) => {
  try {
    if (req.headers.authorization !== cfg.helius.authSecret) return res.status(401).send('invalid auth');

    const data = req.body; // Helius webhook payload
    const leader = (data?.account || data?.events?.[0]?.account)?.toLowerCase?.() || null;

    const parsed = await parseSolTrade(data);
    if (!parsed) return res.json({ ack: true });

    const idKey = `SOL:${parsed.txHash}`;
    if (!(await idempotency.tryLock(idKey))) return res.json({ deduped: true });

    const wf = await WalletFollow.findOne({ chain: 'SOL', leader: parsed.leader.toLowerCase() });
    if (!wf || wf.followers.length === 0) return res.json({ ok: true });

    const logDoc = await TradeLog.create({
      chain: 'SOL',
      leader: parsed.leader.toLowerCase(),
      leaderTx: parsed.txHash,
      tokenIn: parsed.tokenIn,
      tokenOut: parsed.tokenOut,
      amountIn: parsed.amountIn,
      amountOutMin: parsed.amountOutMin,
      parsedAt: new Date(),
      idempotencyKey: idKey,
      followers: wf.followers.map(f => ({ userId: f.userId }))
    });

    await enqueueExecution({
      chain: 'SOL',
      tradeLogId: String(logDoc._id),
      leader: parsed.leader,
      parsed
    });

    res.json({ ok: true });
  } catch (e) {
    logger.error(e, 'helius webhook error');
    res.status(500).send('error');
  }
});
