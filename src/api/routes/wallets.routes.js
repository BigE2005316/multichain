// import { Router } from 'express';
// import Joi from 'joi';
// import User from '../../models/User.js';
// import WalletFollow from '../../models/WalletFollow.js';
// import { MoralisService } from '../../services/moralis.service.js';
// import { HeliusService } from '../../services/helius.service.js';
// import { adminAuth } from '../middlewares/auth.js';
const { Router } = require('express');
const Joi = require('joi');
const User = require('../../models/User.js');
const WalletFollow = require('../../models/WalletFollow.js');

const { MoralisService } = require('../../services/moralis.service.js');
const { HeliusService } = require('../../services/helius.service.js');

const { adminAuth } = require('../middlewares/auth.js');

// export const walletsRouter = Router();
const walletsRouter = Router();

const addSchema = Joi.object({
  tgId: Joi.string().required(),
  chain: Joi.string().valid('EVM','SOL').required(),
  address: Joi.string().required(),
  ratio: Joi.number().min(0.01).max(10).default(1),
  slippageBps: Joi.number().min(1).max(500).default(50),
  maxUsdPerTrade: Joi.number().min(1).default(1000)
});

walletsRouter.post('/follow', adminAuth, async (req, res) => {
  const { value, error } = addSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  let user = await User.findOne({ tgId: value.tgId });
  if (!user) user = await User.create({ tgId: value.tgId, follows: [] });

  // upsert follow on user
  const idx = user.follows.findIndex(f => f.chain === value.chain && f.address.toLowerCase() === value.address.toLowerCase());
  const payload = { ...value, active: true };
  if (idx >= 0) user.follows[idx] = { ...user.follows[idx], ...payload };
  else user.follows.push(payload);
  await user.save();

  // upsert wallet aggregate
  let wf = await WalletFollow.findOne({ chain: value.chain, leader: value.address.toLowerCase() });
  if (!wf) wf = await WalletFollow.create({ chain: value.chain, leader: value.address.toLowerCase(), followers: [] });
  const fIdx = wf.followers.findIndex(f => String(f.userId) === String(user._id));
  const follower = { userId: user._id, ratio: value.ratio, slippageBps: value.slippageBps, maxUsdPerTrade: value.maxUsdPerTrade, active: true };
  if (fIdx >= 0) wf.followers[fIdx] = { ...wf.followers[fIdx], ...follower }; else wf.followers.push(follower);
  await wf.save();

  // ensure stream is tracking the leader
  if (value.chain === 'EVM') await MoralisService.addAddressEVM(value.address);
  else await HeliusService.addAddress(value.address);

  res.json({ ok: true });
});

walletsRouter.post('/unfollow', adminAuth, async (req, res) => {
  const { tgId, chain, address } = req.body;
  const user = await User.findOne({ tgId });
  if (!user) return res.json({ ok: true });

  user.follows = user.follows.filter(f => !(f.chain === chain && f.address.toLowerCase() === address.toLowerCase()));
  await user.save();

  const wf = await WalletFollow.findOne({ chain, leader: address.toLowerCase() });
  if (wf) {
    wf.followers = wf.followers.filter(f => String(f.userId) !== String(user._id));
    await wf.save();
    if (wf.followers.length === 0) {
      if (chain === 'EVM') await MoralisService.removeAddressEVM(address);
      else await HeliusService.removeAddress(address);
    }
  }
  res.json({ ok: true });
});

module.exports = {walletsRouter};
