import twilio from 'twilio';

/**
 * TwilioService - SMS sending via Twilio Programmable SMS
 *
 * Provides simple interface for sending SMS notifications to users.
 * Integrates with Twilio REST API for message delivery.
 *
 * CONFIGURATION REQUIREMENTS:
 * - TWILIO_ACCOUNT_SID: Twilio account identifier
 * - TWILIO_AUTH_TOKEN: Twilio API authentication token
 * - TWILIO_PHONE_NUMBER: Twilio phone number for sending SMS
 *
 * ERROR HANDLING:
 * Notification failures should NEVER crash the server (OPS-04).
 * All SMS send errors are logged but not thrown to ensure graceful degradation.
 */
export class TwilioService {
  private client: ReturnType<typeof twilio> | null = null;

  /**
   * Initialize Twilio client lazily on first use.
   * Validates environment variables and creates authenticated client.
   *
   * @throws Error if required environment variables are missing
   */
  private getClient(): ReturnType<typeof twilio> {
    if (this.client) {
      return this.client;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error(
        'Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.'
      );
    }

    this.client = twilio(accountSid, authToken);
    return this.client;
  }

  /**
   * Sends an SMS message to a recipient via Twilio.
   *
   * GRACEFUL DEGRADATION:
   * - Validates environment variables before sending
   * - Logs errors but does NOT throw (prevents server crashes)
   * - Uses 5-second timeout per research recommendation
   *
   * @param to - Recipient phone number (E.164 format: +1234567890)
   * @param body - Message text content
   * @returns Promise that resolves when message is sent (or fails gracefully)
   */
  async sendSMS(to: string, body: string): Promise<void> {
    try {
      // Validate Twilio phone number is configured
      const from = process.env.TWILIO_PHONE_NUMBER;
      if (!from) {
        console.error('[TwilioService] TWILIO_PHONE_NUMBER not configured');
        return; // Fail gracefully - don't crash server
      }

      // Validate recipient phone number exists
      if (!to) {
        console.error('[TwilioService] Recipient phone number not provided');
        return;
      }

      const client = this.getClient();

      // Send SMS with 5-second timeout
      const message = await Promise.race([
        client.messages.create({ to, from, body }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Twilio API timeout')), 5000)
        ),
      ]);

      console.log(`[TwilioService] SMS sent successfully to ${to} (SID: ${message.sid})`);
    } catch (error) {
      // Log error but NEVER throw - notification failures shouldn't crash server
      console.error('[TwilioService] Failed to send SMS:', error);
      console.error(`[TwilioService] Attempted to send to: ${to}`);
      console.error(`[TwilioService] Message body: ${body.substring(0, 50)}...`);
    }
  }
}

// Export singleton instance for application use
export const twilioService = new TwilioService();
