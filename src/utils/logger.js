const { createLogger, format, transports } = require('winston');

const isDev = process.env.NODE_ENV !== 'production';

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    isDev ? format.colorize({ level: true }) : format.uncolorize(),
    format.printf(({ timestamp, level, message, stack }) => {
      const levelFormatted = level.toUpperCase().padEnd(5);
      return stack
        ? `[${timestamp}] ${levelFormatted} | ${message}\n${stack}`
        : `[${timestamp}] ${levelFormatted} | ${message}`;
    })
  ),
  transports: [
    new transports.Console(),
  ],
});

module.exports = logger;
