import winston from 'winston';
import { config } from './config';

// Custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Determine log level based on environment
const level = () => {
  // Only show debug logs when explicitly requested
  if (process.env.DEBUG === '1' || process.env.VERBOSE === '1') return 'debug';
  if (process.env.NODE_ENV === 'test') return 'error';
  
  // Default to error level to keep output clean for end users
  return 'error';
};

// Console format
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// File format
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports
const transports: winston.transport[] = [
  // Console transport - only show when debugging is explicitly enabled
  new winston.transports.Console({
    format: consoleFormat,
    silent: process.env.NODE_ENV === 'test' || (!process.env.DEBUG && !process.env.VERBOSE),
  }),
];

// Add file transport in development or when explicitly requested
if (process.env.NODE_ENV === 'development' || process.env.LOG_FILE) {
  transports.push(
    new winston.transports.File({
      filename: 'ergosum-cli.log',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Extend winston logger with custom methods
interface CustomLogger extends winston.Logger {
  logRequest(method: string, url: string, status?: number, duration?: number): void;
  logError(error: Error, context?: Record<string, any>): void;
  logApiError(error: any, endpoint: string, method?: string): void;
}

// Create the logger
const baseLogger = winston.createLogger({
  level: level(),
  levels,
  format: fileFormat,
  transports,
});

// Add custom methods
const logger = baseLogger as CustomLogger;

// Add request/response logging helper
logger.logRequest = (method: string, url: string, status?: number, duration?: number) => {
  const message = `${method} ${url}${status ? ` - ${status}` : ''}${duration ? ` (${duration}ms)` : ''}`;
  if (status && status >= 400) {
    logger.error(message);
  } else {
    logger.http(message);
  }
};

// Add error logging with context
logger.logError = (error: Error, context?: Record<string, any>) => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
  };
  logger.error('Error occurred', errorInfo);
};

// Add API error logging
logger.logApiError = (error: any, endpoint: string, method: string = 'GET') => {
  const errorInfo = {
    endpoint,
    method,
    status: error.response?.status,
    statusText: error.response?.statusText,
    data: error.response?.data,
    message: error.message,
  };
  logger.error('API Error', errorInfo);
};

export { logger };