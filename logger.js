const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const logDirectory = path.join(__dirname, 'logs'); // Logs directory

const logger = winston.createLogger({
    level: 'info', // Default logging level
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        })
    ),
    transports: [
        new DailyRotateFile({
            filename: path.join(logDirectory, 'bot-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true, // Compress old logs
            maxSize: '20m', // Max size per log file
            maxFiles: '14d', // Keep logs for 14 days
        }),
        new DailyRotateFile({
            filename: path.join(logDirectory, 'error-%DATE%.log'),
            level: 'error',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '10m',
            maxFiles: '30d',
        }),
        new winston.transports.Console({ // Output to console
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
    ],
});

// Create log directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

module.exports = logger;
