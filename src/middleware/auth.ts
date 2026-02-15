/**
 * Bearer token authentication middleware
 *
 * Validates Authorization header against AUTH_TOKEN environment variable
 * using constant-time comparison to prevent timing attacks.
 */

import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Bearer token authentication middleware
 *
 * Validates format: "Bearer <token>"
 * Returns 401 if missing or invalid
 */
export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.AUTH_TOKEN;

  // Check that AUTH_TOKEN is configured
  if (!expectedToken) {
    console.error('AUTH_TOKEN environment variable not set');
    res.status(500).json({ error: 'Server authentication not configured' });
    return;
  }

  // Check Authorization header exists
  if (!authHeader) {
    console.warn('Missing Authorization header');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Validate Bearer format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    console.warn('Invalid Authorization header format');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const providedToken = parts[1];

  // Constant-time comparison to prevent timing attacks
  try {
    const expectedBuffer = Buffer.from(expectedToken);
    const providedBuffer = Buffer.from(providedToken);

    // Ensure buffers are same length before comparison
    if (expectedBuffer.length !== providedBuffer.length) {
      console.warn('Invalid token (length mismatch)');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const isValid = timingSafeEqual(expectedBuffer, providedBuffer);

    if (!isValid) {
      console.warn('Invalid bearer token');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Token is valid, proceed
    next();
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}
