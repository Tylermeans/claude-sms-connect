/**
 * Type definitions for Claude SMS Connect
 */

/**
 * Claude Code notification hook payload schema
 * @see https://code.claude.com/docs/en/hooks#notification
 */
export interface NotificationPayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  message: string;
  title: string;
  notification_type: string;
}

/**
 * Environment variables configuration
 */
export interface EnvironmentConfig {
  PORT: string;
  AUTH_TOKEN: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  USER_PHONE_NUMBER: string;
}

/**
 * Express Request with typed body
 */
export interface TypedRequest<T> extends Express.Request {
  body: T;
}
