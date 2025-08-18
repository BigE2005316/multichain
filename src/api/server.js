// import express from 'express';
// import http from 'http';
// import helmet from 'helmet';
// import cors from 'cors';
// import morgan from 'morgan';
// import bodyParser from 'body-parser';
// import { walletsRouter } from './routes/wallets.routes.js';
// import { streamsRouter } from './routes/streams.routes.js';
// import { webhooksRouter } from './controllers/webhooks.controller.js';
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const { walletsRouter } = require('./routes/wallets.routes.js');
const { streamsRouter } = require('./routes/streams.routes.js');
const { webhooksRouter } = require('./controllers/webhooks.controller.js');


async function createServer() {
  const app = express();
  const httpServer = http.createServer(app);

  app.use(helmet());
  app.use(cors());
  app.use(morgan('combined'));
  app.use(bodyParser.json({ limit: '2mb' }));

  app.get('/health', (_, res) => res.json({ status: 'ok' }));

  app.use('/api/wallets', walletsRouter);
  app.use('/api/streams', streamsRouter);
  app.use('/webhooks', webhooksRouter);

  return { app, httpServer };
}

module.exports = {createServer};

// export async function createServer() {
//   const app = express();
//   const httpServer = http.createServer(app);

//   app.use(helmet());
//   app.use(cors());
//   app.use(morgan('combined'));
//   app.use(bodyParser.json({ limit: '2mb' }));

//   app.get('/health', (_, res) => res.json({ status: 'ok' }));

//   app.use('/api/wallets', walletsRouter);
//   app.use('/api/streams', streamsRouter);
//   app.use('/webhooks', webhooksRouter);

//   return { app, httpServer };
// }
