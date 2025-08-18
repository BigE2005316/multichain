// import axios from 'axios';
// import WalletFollow from '../models/WalletFollow.js';
// import { cfg } from '../api/config/index.js';
// import logger from '../utils/logger.js';
// const axios = require('axios');
// const WalletFollow = require('../models/WalletFollow');
// const { cfg } = require('../api/config');
// const logger = require('../utils/logger');

// // Helius webhook APIs for create/edit/append/remove. :contentReference[oaicite:5]{index=5}
// const HBASE = 'https://api.helius.xyz/v0';

// export const HeliusService = {
//   async getWebhook() {
//     const { data } = await axios.get(`${HBASE}/webhooks/${cfg.helius.webhookId}?api-key=${cfg.helius.apiKey}`);
//     return data;
//   },

//   async setAddresses(addresses) {
//     await axios.put(`${HBASE}/webhooks/${cfg.helius.webhookId}?api-key=${cfg.helius.apiKey}`, {
//       accountAddresses: addresses
//     });
//     return true;
//   },

//   async addAddress(address) {
//     const w = await this.getWebhook();
//     const set = new Set([...(w.accountAddresses || []), address]);
//     await this.setAddresses([...set]);
//     logger.info({ address }, 'Helius appended address');
//   },

//   async removeAddress(address) {
//     const w = await this.getWebhook();
//     const set = new Set([...(w.accountAddresses || [])]);
//     set.delete(address);
//     await this.setAddresses([...set]);
//     logger.info({ address }, 'Helius removed address');
//   },

//   async syncAddresses() {
//     const addrs = (await WalletFollow.find({ chain: 'SOL' })).map(x => x.leader);
//     await this.setAddresses(addrs);
//     return { count: addrs.length };
//   }
// };


const axios = require('axios');
const WalletFollow = require('../models/WalletFollow');
const { cfg } = require('../config');
const logger = require('../utils/logger');

// Helius webhook APIs for create/edit/append/remove.
const HBASE = 'https://api.helius.xyz/v0';

const HeliusService = {
  async getWebhook() {
    const { data } = await axios.get(
      `${HBASE}/webhooks/${cfg.helius.webhookId}?api-key=${cfg.helius.apiKey}`
    );
    return data;
  },

  async setAddresses(addresses) {
    await axios.put(
      `${HBASE}/webhooks/${cfg.helius.webhookId}?api-key=${cfg.helius.apiKey}`,
      {
        accountAddresses: addresses,
      }
    );
    return true;
  },

  async addAddress(address) {
    console.log("Inside Helius")
    const w = await this.getWebhook();
    const set = new Set([...(w.accountAddresses || []), address]);
    await this.setAddresses([...set]);
    logger.info({ address }, 'Helius appended address');
  },

  async removeAddress(address) {
    const w = await this.getWebhook();
    const set = new Set([...(w.accountAddresses || [])]);
    set.delete(address);
    await this.setAddresses([...set]);
    logger.info({ address }, 'Helius removed address');
  },

  async syncAddresses() {
    const addrs = (await WalletFollow.find({ chain: 'SOL' })).map(
      (x) => x.leader
    );
    await this.setAddresses(addrs);
    return { count: addrs.length };
  },
};

module.exports = { HeliusService };
