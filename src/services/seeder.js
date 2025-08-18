
const User = require('../models/User');

const seeder = async function (){
const newUser = new User({
    tgId: '7988426563',
    username: 'akanowo',
    firstName: 'Akanowo',
    chain: 'solana',
    amount: 0.1,
    custodialWallets: {
      solana: {
        address: 'BgYv4EdYDRUAYvnaDLcgaG5VXnNu8MpY2xXzi1xeikiT',
        privateKey: 'ba3886b438bda5a776b6b63aa1193696:b6cc117f3330e0176cc54cd2001a6e7a:7df00f5976473720476ceaf4aa3a79492c0509c2c3607410bbcf9bdee3faba2c9d1fe30e47fb22f330310ca81a13499050497af2408ac7caa9e5a89c4fde37dde17357df5877b9e8655636529a50f8286ae3fb79e9e62ec828f287c1a075553306e70c42a802fd8f4490238ee68a1ba2cfa24b9b0754367c6ae0b4d9f0c42530',
        mnemonic: null,
        createdAt: new Date('2025-07-04T15:49:35.021Z'),
        balance: 0,
        totalReceived: 0,
        totalSent: 0.034,
        txCount: 34,
        lastUpdated: new Date('2025-07-30T06:05:56.691Z')
      }
    },
    copySettings: {
      copySells: true,
      customTPSL: false,
      takeProfit: [],
      stopLossPercent: 0,
      sellMode: 'proportional'
    },
    positions: {
      EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
        totalAmount: 0.001538828,
        avgPrice: 5.673148655990143,
        tokenSymbol: 'Unknown',
        tokenName: 'Unknown Token',
        chain: 'solana',
        copyTrades: []
      }
    },
    stats: {
      totalTrades: 9,
      wins: 0,
      losses: 0,
      totalPnL: 0,
      dailySpent: 0.00194,
      lastResetDate: new Date('2025-07-30'),
      lastActive: new Date('2025-07-30T06:06:00.702Z')
    },
    walletNames: {},
    smartSlippage: false,
    transactions: [],
    roles: ['user']
  });

  await newUser.save();
  console.log('User inserted!');}

module.exports = {seeder}