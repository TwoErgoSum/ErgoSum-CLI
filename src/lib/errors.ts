import { AxiosError } from 'axios';
import { logger } from './logger';

// Custom error classes
export class ErgoSumError extends Error {
  public code: string;
  public statusCode?: number;
  public details?: any;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', statusCode?: number, details?: any) {
    super(message);
    this.name = 'ErgoSumError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class AuthenticationError extends ErgoSumError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, 'AUTH_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends ErgoSumError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends ErgoSumError {
  constructor(message: string = 'Network error occurred', details?: any) {
    super(message, 'NETWORK_ERROR', 0, details);
    this.name = 'NetworkError';
  }
}

export class APIError extends ErgoSumError {
  constructor(message: string, statusCode: number, details?: any) {
    super(message, 'API_ERROR', statusCode, details);
    this.name = 'APIError';
  }
}

export class ConfigurationError extends ErgoSumError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIG_ERROR', 500, details);
    this.name = 'ConfigurationError';
  }
}

// Error handler for different types of errors
export class ErrorHandler {
  static handle(error: unknown, context?: string): ErgoSumError {
    // Log the original error
    if (context) {
      logger.logError(error as Error, { context });
    }

    // Handle different error types
    if (error instanceof ErgoSumError) {
      return error;
    }

    if (error instanceof Error && error.name === 'ValidationError') {
      return new ValidationError(error.message, error);
    }

    // Handle Axios errors
    if (this.isAxiosError(error)) {
      return this.handleAxiosError(error);
    }

    // Handle network errors
    if (error instanceof Error) {
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        return new NetworkError(`Network connection failed: ${error.message}`);
      }

      if (error.message.includes('timeout')) {
        return new NetworkError('Request timeout - please try again');
      }

      if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
        return new ConfigurationError(`Permission denied: ${error.message}`);
      }
    }

    // Default error
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return new ErgoSumError(message, 'UNKNOWN_ERROR', 500, error);
  }

  private static isAxiosError(error: unknown): error is AxiosError {
    return (error as AxiosError).isAxiosError === true;
  }

  private static handleAxiosError(error: AxiosError): ErgoSumError {
    const status = error.response?.status;
    const data = error.response?.data;
    const message = (data as any)?.message || (data as any)?.error || error.message;

    logger.logApiError(error, error.config?.url || 'unknown', error.config?.method?.toUpperCase());

    switch (status) {
      case 400:
        return new ValidationError(`Bad request: ${message}`, data);
      
      case 401:
        return new AuthenticationError(
          'Authentication failed. Please run "ergosum auth login" to reauthenticate.',
          data
        );
      
      case 403:
        return new AuthenticationError(
          'Access denied. Please check your permissions.',
          data
        );
      
      case 404:
        return new APIError('Resource not found', 404, data);
      
      case 409:
        return new APIError(`Conflict: ${message}`, 409, data);
      
      case 422:
        return new ValidationError(`Invalid input: ${message}`, data);
      
      case 429:
        return new APIError('Rate limit exceeded. Please try again later.', 429, data);
      
      case 500:
      case 502:
      case 503:
      case 504:
        return new APIError(
          'Server error occurred. Please try again later.',
          status,
          data
        );
      
      default:
        if (status && status >= 400) {
          return new APIError(`HTTP ${status}: ${message}`, status, data);
        }
        
        return new NetworkError(`Network error: ${error.message}`, error);
    }
  }

  // User-friendly error messages
  static getUserMessage(error: ErgoSumError): string {
    switch (error.code) {
      case 'AUTH_ERROR':
        return '🔐 Authentication required. Run "ergosum auth login" to get started.';
      
      case 'VALIDATION_ERROR':
        return `❌ Invalid input: ${error.message}`;
      
      case 'NETWORK_ERROR':
        return '🌐 Network connection failed. Please check your internet connection and try again.';
      
      case 'API_ERROR':
        if (error.statusCode === 429) {
          return '⏳ Rate limit reached. Please wait a moment and try again.';
        }
        if (error.statusCode && error.statusCode >= 500) {
          return '🔧 Server maintenance in progress. Please try again later.';
        }
        return `🚫 API error: ${error.message}`;
      
      case 'CONFIG_ERROR':
        return `⚙️  Configuration error: ${error.message}`;
      
      default:
        return `💥 Unexpected error: ${error.message}`;
    }
  }

  // Retry logic helper
  static shouldRetry(error: ErgoSumError, attemptCount: number = 0): boolean {
    if (attemptCount >= 3) return false;

    switch (error.code) {
      case 'NETWORK_ERROR':
      case 'API_ERROR':
        // Retry on server errors and network issues
        return !error.statusCode || error.statusCode >= 500 || error.statusCode === 408;
      
      default:
        return false;
    }
  }

  // Get retry delay (exponential backoff)
  static getRetryDelay(attemptCount: number): number {
    return Math.min(1000 * Math.pow(2, attemptCount), 10000); // Max 10 seconds
  }
}