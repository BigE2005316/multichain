const dotenv = require('dotenv');
dotenv.config();

const cfg = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.PUBLIC_BASE_URL,
  mongoUri: process.env.MONGO_URI,
  redisUrl: process.env.REDIS_URL,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,

  moralis: {
    apiKey: process.env.MORALIS_API_KEY,
    streamId: process.env.MORALIS_STREAM_ID,
    streamSecret: process.env.MORALIS_STREAM_SECRET,
    evmChainId: process.env.MORALIS_EVM_CHAIN_ID || '0x1'
  },

  helius: {
    apiKey: process.env.HELIUS_API_KEY,
    webhookId: process.env.HELIUS_WEBHOOK_ID,
    authSecret: process.env.HELIUS_AUTH_SECRET
  },

  evm: {
    zeroXBase: process.env.ZEROX_BASE || 'https://api.0x.org',
    zeroXApiKey: process.env.ZEROX_API_KEY,
    privateKey: process.env.EVM_PRIVATE_KEY
  },

  sol: {
    rpc: process.env.SOLANA_RPC,
    privateKeyBase58: process.env.SOLANA_PRIVATE_KEY_BASE58
  }
};

module.exports = { cfg };

// export const cfg = {
//   env: process.env.NODE_ENV || 'development',
//   port: Number(process.env.PORT || 3000),
//   baseUrl: process.env.PUBLIC_BASE_URL,
//   mongoUri: process.env.MONGO_URI,
//   redisUrl: process.env.REDIS_URL,
//   telegramToken: process.env.TELEGRAM_BOT_TOKEN,

//   moralis: {
//     apiKey: process.env.MORALIS_API_KEY,
//     streamId: process.env.MORALIS_STREAM_ID,
//     streamSecret: process.env.MORALIS_STREAM_SECRET,
//     evmChainId: process.env.MORALIS_EVM_CHAIN_ID || '0x1'
//   },

//   helius: {
//     apiKey: process.env.HELIUS_API_KEY,
//     webhookId: process.env.HELIUS_WEBHOOK_ID,
//     authSecret: process.env.HELIUS_AUTH_SECRET
//   },

//   evm: {
//     zeroXBase: process.env.ZEROX_BASE || 'https://api.0x.org',
//     zeroXApiKey: process.env.ZEROX_API_KEY,
//     privateKey: process.env.EVM_PRIVATE_KEY
//   },

//   sol: {
//     rpc: process.env.SOLANA_RPC,
//     privateKeyBase58: process.env.SOLANA_PRIVATE_KEY_BASE58
//   }
// };

