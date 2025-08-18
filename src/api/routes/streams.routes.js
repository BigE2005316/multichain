// import { Router } from 'express';
// import { MoralisService } from '../../services/moralis.service.js';
// import { HeliusService } from '../../services/helius.service.js';
// import { adminAuth } from '../middlewares/auth.js';
const { Router } = require('express');
const { MoralisService } = require('../../services/moralis.service.js');
const { HeliusService } = require('../../services/helius.service.js');
const { adminAuth } = require('../middlewares/auth.js');

// export const streamsRouter = Router();
const streamsRouter = Router();


streamsRouter.post('/moralis/sync', adminAuth, async (_req, res) => {
  const out = await MoralisService.syncAddressesEVM();
  res.json(out);
});

streamsRouter.post('/helius/sync', adminAuth, async (_req, res) => {
  const out = await HeliusService.syncAddresses();
  res.json(out);
});

module.exports = {streamsRouter};
