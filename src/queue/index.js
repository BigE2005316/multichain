// import { Queue, Worker } from 'bullmq';
// import { cfg } from '../config/index.js';
// import { executeTradeJob } from './jobs/executeTrade.job.js';
const { Queue, Worker } = require('bullmq');
const { cfg } = require('../config/index.js');
const { executeTradeJob } = require('./jobs/executeTrade.job.js');

let execQueue;

async function initQueues() {
  execQueue = new Queue('execute-trade', { connection: { url: cfg.redisUrl } });
  new Worker('execute-trade', executeTradeJob, { connection: { url: cfg.redisUrl } });
}

async function enqueueExecution(data) {
  await execQueue.add('exec', data, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 }
  });
}

module.exports = {
  execQueue,
  initQueues,
  enqueueExecution
};

// export let execQueue;

// export async function initQueues() {
//   execQueue = new Queue('execute-trade', { connection: { url: cfg.redisUrl } });
//   new Worker('execute-trade', executeTradeJob, { connection: { url: cfg.redisUrl } });
// }

// export async function enqueueExecution(data) {
//   await execQueue.add('exec', data, { attempts: 5, backoff: { type: 'exponential', delay: 5000 } });
// }
