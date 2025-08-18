// import { createClient } from 'redis';
// import { cfg } from '../api/config/index.js';
// const { createClient } = require('redis');
// const { cfg } = require('../api/config');

// const client = createClient({ url: cfg.redisUrl });
// client.on('error', (e) => console.error('redis error', e));
// await client.connect();

// export const idempotency = {
//   async tryLock(key, ttlSec = 3600) {
//     const res = await client.set(`idem:${key}`, '1', { NX: true, EX: ttlSec });
//     return res === 'OK';
//   }
// };


const { createClient } = require('redis');
const { cfg } = require('../config');

const client = createClient({ url: cfg.redisUrl });

client.on('error', (e) => console.error('redis error', e));

(async () => {
  try {
    await client.connect();
  } catch (err) {
    console.error('Redis connection failed', err);
  }
})();

const idempotency = {
  async tryLock(key, ttlSec = 3600) {
    const res = await client.set(`idem:${key}`, '1', { NX: true, EX: ttlSec });
    return res === 'OK';
  }
};

module.exports = { idempotency, client };
