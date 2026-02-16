/**
 * Per-project rate limiting middleware
 *
 * Enforces OPS-01 requirement: Maximum 1 notification per 5 seconds per project.
 *
 * CRITICAL DESIGN:
 * - Uses project_id from request body as rate limit key (NOT IP address)
 * - All projects run on same machine with same IP - IP-based limiting would break multi-project support
 * - Falls back to IP only when project_id missing (logs warning)
 * - Returns 429 with project_id context when rate limit exceeded
 */

import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * Rate limiter for /api/notify endpoint.
 *
 * Limits each project to 1 notification per 5 seconds (OPS-01).
 *
 * WHY project_id instead of IP:
 * Multiple Claude Code projects run on same machine with same IP.
 * IP-based rate limiting would incorrectly block all projects when
 * one project hits the limit. Per-project keying ensures independent
 * rate limits for each project.
 *
 * Configuration:
 * - 5 second window (OPS-01)
 * - 1 request max per window per project
 * - Standard RateLimit-* headers included
 * - Returns 429 with project context on limit exceeded
 */
export const projectRateLimiter = rateLimit({
  windowMs: 5000, // 5 second window (OPS-01)
  max: 1, // 1 request per window per project
  standardHeaders: true, // Include RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers

  /**
   * Extract project_id from request body for per-project rate limiting.
   *
   * Falls back to IP if project_id missing (with warning logged).
   */
  keyGenerator: (req: Request): string => {
    const projectId = req.body?.project_id;

    if (!projectId) {
      console.warn('[rate-limit] Missing project_id in request body, falling back to IP');
      return req.ip || 'unknown';
    }

    return projectId;
  },

  /**
   * Custom handler for rate limit exceeded responses.
   *
   * Logs warning and returns 429 with project context.
   */
  handler: (req, res) => {
    const projectId = req.body?.project_id;
    console.warn(`[rate-limit] Rate limit exceeded for project: ${projectId}`);

    res.status(429).json({
      error: 'Too many notifications',
      message: 'Rate limit: max 1 notification per 5 seconds per project',
      project_id: projectId,
    });
  },
});
