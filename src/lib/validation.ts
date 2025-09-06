import Joi from 'joi';

// Validation schemas for different data types
export const schemas = {
  // Memory validation
  memory: Joi.object({
    content: Joi.string().required().min(1).max(50000).trim(),
    title: Joi.string().optional().max(200).trim(),
    type: Joi.string().optional().valid('TEXT', 'CODE', 'LINK', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'),
    tags: Joi.array().items(Joi.string().trim().max(50)).max(20).optional(),
    metadata: Joi.object().optional(),
  }),

  // Search options validation
  searchOptions: Joi.object({
    query: Joi.string().optional().max(500).trim(),
    tags: Joi.array().items(Joi.string().trim().max(50)).max(10).optional(),
    type: Joi.string().optional().valid('TEXT', 'CODE', 'LINK', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'),
    limit: Joi.number().integer().min(1).max(100).optional(),
    offset: Joi.number().integer().min(0).optional(),
  }),

  // Configuration validation
  config: Joi.object({
    apiUrl: Joi.string().uri().required(),
    token: Joi.string().optional(),
    userId: Joi.string().optional(),
    organizationId: Joi.string().optional(),
    defaultTags: Joi.array().items(Joi.string().trim().max(50)).max(10).optional(),
    integrations: Joi.object({
      claudeCode: Joi.boolean().optional(),
      codex: Joi.boolean().optional(),
      gemini: Joi.boolean().optional(),
      cursor: Joi.boolean().optional(),
    }).optional(),
  }),

  // Authentication validation
  auth: Joi.object({
    token: Joi.string().required().min(10),
    refreshToken: Joi.string().optional(),
  }),

  // Context injection options
  contextOptions: Joi.object({
    query: Joi.string().required().min(1).max(500).trim(),
    limit: Joi.number().integer().min(1).max(50).default(5),
    format: Joi.string().valid('markdown', 'text', 'json', 'yaml').default('markdown'),
    includeRecent: Joi.boolean().default(false),
    includeMetadata: Joi.boolean().default(false),
  }),
};

// Validation helper functions
export class ValidationError extends Error {
  public details: Joi.ValidationErrorItem[];

  constructor(error: Joi.ValidationError) {
    super(`Validation failed: ${error.details.map(d => d.message).join(', ')}`);
    this.name = 'ValidationError';
    this.details = error.details;
  }
}

export function validate<T>(schema: Joi.Schema, data: unknown): T {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    throw new ValidationError(error);
  }

  return value as T;
}

// Specific validation functions
export const validateMemory = (data: unknown) => validate(schemas.memory, data);
export const validateSearchOptions = (data: unknown) => validate(schemas.searchOptions, data);
export const validateConfig = (data: unknown) => validate(schemas.config, data);
export const validateAuth = (data: unknown) => validate(schemas.auth, data);
export const validateContextOptions = (data: unknown) => validate(schemas.contextOptions, data);

// Input sanitization
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 10000); // Reasonable length limit
}

export function sanitizeTags(tags: string[]): string[] {
  return tags
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0 && tag.length <= 50)
    .filter(tag => /^[a-zA-Z0-9\-_]+$/.test(tag)) // Only alphanumeric, hyphens, underscores
    .slice(0, 20); // Max 20 tags
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isValidMemoryId(id: string): boolean {
  // UUID v4 pattern
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id);
}