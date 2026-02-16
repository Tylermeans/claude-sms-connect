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
  /** Optional project identifier for multi-project support (Phase 2) */
  project_id?: string;
  /** Optional project name for multi-project support (Phase 2) */
  project_name?: string;
  /** Optional tmux session name (replaces TMUX_SESSION env var for multi-project) */
  tmux_session?: string;
}

/**
 * Environment variables configuration
 */
export interface EnvironmentConfig {
  PORT: string;
  AUTH_TOKEN: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

/**
 * Express Request with typed body
 */
export interface TypedRequest<T> extends Express.Request {
  body: T;
}
