import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * TmuxService - Safe tmux integration for capturing terminal context and sending user input
 *
 * SECURITY DESIGN (SEC-04, SEC-05 from research):
 * - Uses execFile with args array (NEVER exec) to prevent shell injection
 * - Validates session names against strict regex before execution
 * - Uses -l (literal) flag for send-keys to prevent tmux key binding interpretation
 * - Separates user input from control characters (Enter sent separately)
 *
 * This service enables bidirectional communication with Claude Code tmux sessions:
 * - Capture terminal output for SMS context
 * - Send user responses back to sessions without command injection vulnerabilities
 */
export class TmuxService {
  /**
   * Validates tmux session name to prevent command injection.
   *
   * Only allows alphanumeric characters, underscores, and hyphens.
   * Rejects any session names with shell metacharacters or tmux special chars.
   *
   * @param session - Session name to validate
   * @throws Error if session name contains invalid characters
   */
  validateSessionName(session: string): void {
    const validSessionRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validSessionRegex.test(session)) {
      const error = `Invalid tmux session name: "${session}". Only alphanumeric, underscore, and hyphen allowed.`;
      console.error(`[TmuxService] ${error}`);
      throw new Error(error);
    }
  }

  /**
   * Checks if a tmux session exists.
   *
   * @param session - Session name to check
   * @returns true if session exists, false otherwise
   */
  async hasSession(session: string): Promise<boolean> {
    this.validateSessionName(session);

    try {
      await execFileAsync('tmux', ['has-session', '-t', session]);
      return true;
    } catch (error) {
      // tmux has-session exits with non-zero if session doesn't exist
      return false;
    }
  }

  /**
   * Captures the last N lines of output from a tmux pane.
   *
   * Returns raw terminal output including ANSI codes. Caller should use
   * sanitize library to clean output before SMS transmission.
   *
   * @param session - Tmux session name
   * @param lines - Number of lines to capture (default: 8)
   * @returns Raw terminal output with ANSI codes
   * @throws Error if session doesn't exist or capture fails
   */
  async captureContext(session: string, lines: number = 8): Promise<string> {
    this.validateSessionName(session);

    const exists = await this.hasSession(session);
    if (!exists) {
      throw new Error(`Tmux session "${session}" does not exist`);
    }

    const { stdout } = await execFileAsync('tmux', [
      'capture-pane',
      '-t', session,
      '-p',           // print to stdout
      '-S', `-${lines}` // start N lines back
    ]);

    return stdout;
  }

  /**
   * Sends user input to a tmux session with command injection protection.
   *
   * SECURITY CRITICAL:
   *
   * 1. WHY execFile + args array:
   *    - Prevents shell injection: user input never goes through shell parsing
   *    - Example: input="$(whoami)" sends literal string, not command substitution
   *
   * 2. WHY -l (literal) flag:
   *    - Prevents tmux key binding interpretation
   *    - Without -l: input="C-c" would send Ctrl+C signal
   *    - With -l: input="C-c" sends literal text "C-c"
   *
   * 3. WHY separate Enter command:
   *    - Enter key must NOT be literal (needs to be interpreted as key press)
   *    - Separating ensures user can't inject control characters by including \n
   *
   * These three protections together ensure user SMS responses cannot:
   * - Execute arbitrary commands (shell injection blocked)
   * - Send terminal control signals (literal flag blocks)
   * - Inject special key sequences (separation blocks)
   *
   * @param session - Tmux session name
   * @param input - User input to send (will be sent literally)
   * @throws Error if session doesn't exist or send fails
   */
  async sendKeys(session: string, input: string): Promise<void> {
    this.validateSessionName(session);

    const exists = await this.hasSession(session);
    if (!exists) {
      throw new Error(`Tmux session "${session}" does not exist`);
    }

    // Send user input with literal flag (prevents interpretation)
    await execFileAsync('tmux', [
      'send-keys',
      '-t', session,
      '-l',  // CRITICAL: literal mode
      input
    ]);

    // Send Enter as separate command (must be interpreted as key press)
    await execFileAsync('tmux', [
      'send-keys',
      '-t', session,
      'Enter'
    ]);
  }
}

// Export singleton instance for application use
export const tmuxService = new TmuxService();
