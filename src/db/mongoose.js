// import mongoose from 'mongoose';
// import logger from '../utils/logger.js';
// import { cfg } from '../config/index.js';
const mongoose = require('mongoose');
const logger = require('../utils/logger.js');
const { cfg } = require('../config/index.js');

// export async function connectMongo() {
//   mongoose.set('strictQuery', true);
//   await mongoose.connect(cfg.mongoUri);
//   logger.info('Connected to MongoDB');
// }

async function connectMongo() {
        console.log('before strictquery')

  mongoose.set('strictQuery', true);
      console.log('before connecting to mongo')
  await mongoose.connect(cfg.mongoUri);
        console.log('after connecting to mongo')

  logger.info('Connected to MongoDB');
}

module.exports = { connectMongo };