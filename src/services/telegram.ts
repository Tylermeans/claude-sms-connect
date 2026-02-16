/**
 * TelegramService - Message sending via Telegram Bot API
 *
 * Provides simple interface for sending notifications to users via Telegram.
 * Uses native fetch (Node 22+) — zero external dependencies.
 *
 * CONFIGURATION REQUIREMENTS:
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather
 * - TELEGRAM_CHAT_ID: Your personal chat ID (from @userinfobot)
 *
 * ERROR HANDLING:
 * Notification failures should NEVER crash the server (OPS-04).
 * All send errors are logged but not thrown to ensure graceful degradation.
 */
export class TelegramService {
  private baseUrl: string | null = null;

  /**
   * Get the Telegram Bot API base URL, lazily initialized.
   * Validates TELEGRAM_BOT_TOKEN environment variable.
   */
  private getBaseUrl(): string {
    if (this.baseUrl) {
      return this.baseUrl;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        'Telegram bot token not configured. Set TELEGRAM_BOT_TOKEN environment variable.'
      );
    }

    this.baseUrl = `https://api.telegram.org/bot${token}`;
    return this.baseUrl;
  }

  /**
   * Get the configured chat ID for sending messages.
   */
  getChatId(): string | undefined {
    return process.env.TELEGRAM_CHAT_ID;
  }

  /**
   * Sends a message to the configured Telegram chat.
   *
   * GRACEFUL DEGRADATION:
   * - Validates environment variables before sending
   * - Logs errors but does NOT throw (prevents server crashes)
   * - Uses 5-second timeout per OPS-04 recommendation
   *
   * @param text - Message text content (supports Telegram markdown)
   */
  async sendMessage(text: string): Promise<void> {
    try {
      const chatId = this.getChatId();
      if (!chatId) {
        console.error('[TelegramService] TELEGRAM_CHAT_ID not configured');
        return;
      }

      const baseUrl = this.getBaseUrl();

      const response = await Promise.race([
        fetch(`${baseUrl}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Telegram API timeout')), 5000)
        ),
      ]);

      if (!response.ok) {
        const body = await response.text();
        console.error(`[TelegramService] API error ${response.status}: ${body}`);
        return;
      }

      console.log(`[TelegramService] Message sent successfully`);
    } catch (error) {
      // Log error but NEVER throw — notification failures shouldn't crash server
      console.error('[TelegramService] Failed to send message:', error);
      console.error(`[TelegramService] Message text: ${text.substring(0, 50)}...`);
    }
  }

  /**
   * Long-poll for new messages from Telegram.
   *
   * @param offset - Update ID offset (pass last update_id + 1 to acknowledge previous)
   * @param timeout - Long-poll timeout in seconds (0 for immediate return)
   * @returns Array of update objects, or empty array on error
   */
  async getUpdates(offset?: number, timeout: number = 30): Promise<TelegramUpdate[]> {
    try {
      const baseUrl = this.getBaseUrl();

      const params: Record<string, string | number> = { timeout };
      if (offset !== undefined) {
        params.offset = offset;
      }

      const queryString = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString();

      // Timeout should be longer than the long-poll timeout to avoid aborting valid polls
      const controller = new AbortController();
      const abortTimeout = setTimeout(
        () => controller.abort(),
        (timeout + 10) * 1000
      );

      try {
        const response = await fetch(`${baseUrl}/getUpdates?${queryString}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text();
          console.error(`[TelegramService] getUpdates error ${response.status}: ${body}`);
          return [];
        }

        const data = (await response.json()) as TelegramApiResponse;
        return data.ok ? data.result : [];
      } finally {
        clearTimeout(abortTimeout);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return [];
      }
      console.error('[TelegramService] getUpdates failed:', error);
      return [];
    }
  }
}

/** Telegram Bot API update object (subset of fields we use) */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number };
    chat: { id: number };
    text?: string;
  };
}

interface TelegramApiResponse {
  ok: boolean;
  result: TelegramUpdate[];
}

// Export singleton instance for application use
export const telegramService = new TelegramService();
