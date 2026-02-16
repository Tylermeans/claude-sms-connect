import { describe, it, expect } from 'vitest';
import { redactSensitiveData, REDACTION_PATTERNS, type RedactionPattern } from './redact.js';

describe('redactSensitiveData', () => {
  describe('AWS Keys', () => {
    it('should redact AWS Access Key IDs', () => {
      const input = 'key is AKIA1234567890ABCDEF';
      const output = redactSensitiveData(input);
      expect(output).toBe('key is [REDACTED_AWS_KEY]');
    });

    it('should redact multiple AWS keys in one string', () => {
      const input = 'First: AKIA1234567890ABCDEF, Second: AKIAZZZZZZZZZZZZZZZZ';
      const output = redactSensitiveData(input);
      expect(output).toBe('First: [REDACTED_AWS_KEY], Second: [REDACTED_AWS_KEY]');
    });
  });

  describe('GitHub Tokens', () => {
    it('should redact GitHub Personal Access Tokens', () => {
      const input = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_GITHUB_TOKEN]');
    });

    it('should redact GitHub OAuth Tokens', () => {
      const input = 'gho_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_GITHUB_TOKEN]');
    });

    it('should redact GitHub Fine-Grained Tokens', () => {
      const input = 'github_pat_11AAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_GITHUB_TOKEN]');
    });
  });

  describe('OpenAI Keys', () => {
    it('should redact OpenAI API keys', () => {
      const input = 'OPENAI_KEY_REMOVED_FROM_HISTORY';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_OPENAI_KEY]');
    });

    it('should redact OpenAI project keys', () => {
      const input = 'OPENAI_PROJECT_KEY_REMOVED_FROM_HISTORY';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_OPENAI_KEY]');
    });
  });

  describe('Generic API Keys', () => {
    it('should redact generic sk- prefixed keys', () => {
      const input = 'sk-abc123def456ghi789jkl012mno345pq';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_API_KEY]');
    });

    it('should redact api_key assignments', () => {
      const input = 'api_key="abc123def456ghi789jkl012mno345pq"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_API_KEY]');
    });

    it('should redact apikey assignments', () => {
      const input = 'apikey="abc123def456ghi789jkl012mno345pq"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_API_KEY]');
    });

    it('should redact api-key assignments', () => {
      const input = 'api-key="abc123def456ghi789jkl012mno345pq"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_API_KEY]');
    });
  });

  describe('JWT Tokens', () => {
    it('should redact JWT tokens', () => {
      const input = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_JWT]');
    });
  });

  describe('Secrets', () => {
    it('should redact secret assignments', () => {
      const input = 'secret="abc123def456ghi789jkl012mno345pq"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_SECRET]');
    });

    it('should redact secret_key assignments', () => {
      const input = 'secret_key="abc123def456ghi789jkl012mno345pq"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_SECRET]');
    });

    it('should redact secret-key assignments', () => {
      const input = 'secret-key="abc123def456ghi789jkl012mno345pq"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_SECRET]');
    });
  });

  describe('Passwords', () => {
    it('should redact password assignments', () => {
      const input = 'password="mySuper$ecretP@ss"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_PASSWORD]');
    });

    it('should redact passwd assignments', () => {
      const input = 'passwd="mySuper$ecretP@ss"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_PASSWORD]');
    });

    it('should redact pwd assignments', () => {
      const input = 'pwd="shortpwd123"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_PASSWORD]');
    });
  });

  describe('Token Assignments', () => {
    it('should redact token assignments', () => {
      const input = 'token="abc123def456ghi789jkl012mno345pq"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_TOKEN]');
    });

    it('should redact auth_token assignments', () => {
      const input = 'auth_token="abc123def456ghi789jkl012mno345pq"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_TOKEN]');
    });

    it('should redact access_token assignments', () => {
      const input = 'access_token="abc123def456ghi789jkl012mno345pq"';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_TOKEN]');
    });
  });

  describe('Private Keys', () => {
    it('should redact RSA private keys', () => {
      const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_PRIVATE_KEY]');
    });

    it('should redact EC private keys', () => {
      const input = '-----BEGIN EC PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END EC PRIVATE KEY-----';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_PRIVATE_KEY]');
    });

    it('should redact generic private keys', () => {
      const input = '-----BEGIN PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END PRIVATE KEY-----';
      const output = redactSensitiveData(input);
      expect(output).toBe('[REDACTED_PRIVATE_KEY]');
    });
  });

  describe('False Positives Prevention', () => {
    it('should not redact normal terminal output', () => {
      const input = 'normal terminal output';
      const output = redactSensitiveData(input);
      expect(output).toBe('normal terminal output');
    });

    it('should not redact short git commit hashes', () => {
      const input = 'git commit abc123def4';
      const output = redactSensitiveData(input);
      expect(output).toBe('git commit abc123def4');
    });

    it('should not redact file paths', () => {
      const input = '/usr/local/bin/node';
      const output = redactSensitiveData(input);
      expect(output).toBe('/usr/local/bin/node');
    });

    it('should not redact base64 content without JWT structure', () => {
      const input = 'base64: SGVsbG8gV29ybGQh';
      const output = redactSensitiveData(input);
      expect(output).toBe('base64: SGVsbG8gV29ybGQh');
    });
  });

  describe('Multiple Secrets', () => {
    it('should redact multiple different secrets in one string', () => {
      const input = 'AWS: AKIA1234567890ABCDEF, GitHub: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12, password="test123pass"';
      const output = redactSensitiveData(input);
      expect(output).toBe('AWS: [REDACTED_AWS_KEY], GitHub: [REDACTED_GITHUB_TOKEN], [REDACTED_PASSWORD]');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const input = '';
      const output = redactSensitiveData(input);
      expect(output).toBe('');
    });

    it('should handle strings with no secrets', () => {
      const input = 'Just some normal text without any secrets';
      const output = redactSensitiveData(input);
      expect(output).toBe('Just some normal text without any secrets');
    });
  });

  describe('REDACTION_PATTERNS', () => {
    it('should export an array of RedactionPattern objects', () => {
      expect(Array.isArray(REDACTION_PATTERNS)).toBe(true);
      expect(REDACTION_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should have valid pattern structure', () => {
      REDACTION_PATTERNS.forEach((pattern: RedactionPattern) => {
        expect(pattern).toHaveProperty('name');
        expect(pattern).toHaveProperty('pattern');
        expect(pattern).toHaveProperty('replacement');
        expect(typeof pattern.name).toBe('string');
        expect(pattern.pattern instanceof RegExp).toBe(true);
        expect(typeof pattern.replacement).toBe('string');
      });
    });

    it('should have global flag on all patterns', () => {
      REDACTION_PATTERNS.forEach((pattern: RedactionPattern) => {
        expect(pattern.pattern.global).toBe(true);
      });
    });
  });
});
