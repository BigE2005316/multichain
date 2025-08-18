// import pino from 'pino';
// const pino = require('pino');
// export default pino({ level: process.env.LOG_LEVEL || 'info' });

const pino = require('pino');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

module.exports = logger;
