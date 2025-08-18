// import axios from 'axios';
// import WalletFollow from '../models/WalletFollow.js';
// import { cfg } from '../api/config/index.js';
// import logger from '../utils/logger.js';
// const axios = require('axios');
// const WalletFollow = require('../models/WalletFollow');
// const { cfg } = require('../api/config');
// const logger = require('../utils/logger');

// // Docs: add/remove address from a stream. :contentReference[oaicite:4]{index=4}
// const BASE = 'https://api.moralis-streams.com/streams/evm';

// export const MoralisService = {
//   async addAddress(address) {
//     if (!cfg.moralis.streamId) return;
//     await axios.post(`${BASE}/${cfg.moralis.streamId}/address`, { address: [address] }, {
//       headers: { 'x-api-key': cfg.moralis.apiKey, 'Content-Type': 'application/json' }
//     });
//     logger.info({ address }, 'Moralis stream add address');
//   },

//   async removeAddress(address) {
//     if (!cfg.moralis.streamId) return;
//     await axios.delete(`${BASE}/${cfg.moralis.streamId}/address`, {
//       headers: { 'x-api-key': cfg.moralis.apiKey, 'Content-Type': 'application/json' },
//       data: { address: [address] }
//     });
//     logger.info({ address }, 'Moralis stream remove address');
//   },

//   async syncAddresses() {
//     // push all EVM leaders into stream
//     const leaders = (await WalletFollow.find({ chain: 'EVM' })).map(x => x.leader);
//     if (!leaders.length) return { count: 0 };
//     await axios.post(`${BASE}/${cfg.moralis.streamId}/address`, { address: leaders }, {
//       headers: { 'x-api-key': cfg.moralis.apiKey, 'Content-Type': 'application/json' }
//     });
//     return { count: leaders.length };
//   }
// };


const axios = require('axios');
const WalletFollow = require('../models/WalletFollow');
const { cfg } = require('../config');
const logger = require('../utils/logger');

const BASEEVM = 'https://api.moralis-streams.com/streams/evm';
const BASESOLANA = 'https://api.moralis-streams.com/streams/solana';

const MoralisService = {
  async addAddressEVM(address) {
    if (!cfg.moralis.streamId) return;
    await axios.post(
      `${BASEEVM}/${cfg.moralis.streamId}/address`,
      { address: [address] },
      {
        headers: {
          'x-api-key': cfg.moralis.apiKey,
          'Content-Type': 'application/json',
        },
      }
    );
    logger.info({ address }, 'Moralis stream add address');
  },

  async addAddressSolana(address) {
    if (!cfg.moralis.streamId) return;
    await axios.post(
      `${BASESOLANA}/${cfg.moralis.streamId}/address`,
      { address: [address] },
      {
        headers: {
          'x-api-key': cfg.moralis.apiKey,
          'Content-Type': 'application/json',
        },
      }
    );
    logger.info({ address }, 'Moralis Solana stream add address');
  },

  async removeAddressEVM(address) {
    if (!cfg.moralis.streamId) return;
    await axios.delete(`${BASEEVM}/${cfg.moralis.streamId}/address`, {
      headers: {
        'x-api-key': cfg.moralis.apiKey,
        'Content-Type': 'application/json',
      },
      data: { address: [address] },
    });
    logger.info({ address }, 'Moralis stream remove address');
  },

  async removeAddressSolana(address) {
    if (!cfg.moralis.streamId) return;
    await axios.delete(`${BASESOLANA}/${cfg.moralis.streamId}/address`, {
      headers: {
        'x-api-key': cfg.moralis.apiKey,
        'Content-Type': 'application/json',
      },
      data: { address: [address] },
    });
    logger.info({ address }, 'Moralis Solana stream remove address');
  },

  async syncAddressesEVM() {
    // push all EVM leaders into stream
    const leaders = (await WalletFollow.find({ chain: 'EVM' })).map(
      (x) => x.leader
    );
    if (!leaders.length) return { count: 0 };

    await axios.post(
      `${BASEEVM}/${cfg.moralis.streamId}/address`,
      { address: leaders },
      {
        headers: {
          'x-api-key': cfg.moralis.apiKey,
          'Content-Type': 'application/json',
        },
      }
    );


    return { count: leaders.length };
  },

  async syncAddressesSolana() {
    // push all Solana leaders into stream
    const leaders = (await WalletFollow.find({ chain: 'SOLANA' })).map(
      (x) => x.leader
    );
    if (!leaders.length) return { count: 0 };

    await axios.post(
      `${BASESOLANA}/${cfg.moralis.streamId}/address`,
      { address: leaders },
      {
        headers: {
          'x-api-key': cfg.moralis.apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    return { count: leaders.length };
  }
};

module.exports = {MoralisService};
