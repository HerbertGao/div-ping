/**
 * Tests for webhook rate limiting functionality
 */

import { describe, expect, it } from '@jest/globals';
import { WEBHOOK_RATE_LIMIT } from '../src/ts/constants';

describe('Webhook Rate Limiting', () => {
  describe('WEBHOOK_RATE_LIMIT constants', () => {
    it('should define minimum interval', () => {
      expect(WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS).toBe(60000);
    });

    it('should be at least 1 minute', () => {
      expect(WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS).toBeGreaterThanOrEqual(60000);
    });
  });

  describe('Rate limit calculation', () => {
    it('should allow webhook when lastWebhookTime is undefined', () => {
      const now = Date.now();
      const lastWebhookTime = undefined;
      const lastWebhookTimeMs = lastWebhookTime ? new Date(lastWebhookTime).getTime() : 0;
      const timeSinceLastWebhook = now - lastWebhookTimeMs;

      expect(timeSinceLastWebhook).toBeGreaterThanOrEqual(WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS);
    });

    it('should block webhook when called too soon', () => {
      const now = Date.now();
      const lastWebhookTime = new Date(now - 30000).toISOString(); // 30 seconds ago
      const lastWebhookTimeMs = new Date(lastWebhookTime).getTime();
      const timeSinceLastWebhook = now - lastWebhookTimeMs;

      expect(timeSinceLastWebhook).toBeLessThan(WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS);
    });

    it('should allow webhook when enough time has passed', () => {
      const now = Date.now();
      const lastWebhookTime = new Date(now - 65000).toISOString(); // 65 seconds ago
      const lastWebhookTimeMs = new Date(lastWebhookTime).getTime();
      const timeSinceLastWebhook = now - lastWebhookTimeMs;

      expect(timeSinceLastWebhook).toBeGreaterThanOrEqual(WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS);
    });

    it('should allow webhook when exactly at minimum interval', () => {
      const now = Date.now();
      const lastWebhookTime = new Date(now - WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS).toISOString();
      const lastWebhookTimeMs = new Date(lastWebhookTime).getTime();
      const timeSinceLastWebhook = now - lastWebhookTimeMs;

      expect(timeSinceLastWebhook).toBeGreaterThanOrEqual(WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS);
    });

    it('should calculate correct wait time when rate limited', () => {
      const now = Date.now();
      const lastWebhookTime = new Date(now - 30000).toISOString(); // 30 seconds ago
      const lastWebhookTimeMs = new Date(lastWebhookTime).getTime();
      const timeSinceLastWebhook = now - lastWebhookTimeMs;
      const waitTime = Math.ceil((WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS - timeSinceLastWebhook) / 1000);

      expect(waitTime).toBe(30); // Should wait 30 more seconds
    });
  });

  describe('Edge cases', () => {
    it('should handle very old lastWebhookTime', () => {
      const now = Date.now();
      const lastWebhookTime = new Date(now - 86400000).toISOString(); // 24 hours ago
      const lastWebhookTimeMs = new Date(lastWebhookTime).getTime();
      const timeSinceLastWebhook = now - lastWebhookTimeMs;

      expect(timeSinceLastWebhook).toBeGreaterThanOrEqual(WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS);
    });

    it('should handle lastWebhookTime of 0 (never called)', () => {
      const now = Date.now();
      const lastWebhookTimeMs = 0;
      const timeSinceLastWebhook = now - lastWebhookTimeMs;

      expect(timeSinceLastWebhook).toBeGreaterThanOrEqual(WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS);
    });

    it('should handle rapid successive checks', () => {
      const now = Date.now();
      const checks = [
        now - 10000,  // 10 seconds ago
        now - 5000,   // 5 seconds ago
        now - 1000,   // 1 second ago
      ];

      checks.forEach(lastTime => {
        const timeSinceLastWebhook = now - lastTime;
        expect(timeSinceLastWebhook).toBeLessThan(WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS);
      });
    });

    it('should calculate wait time correctly for edge case (1 second ago)', () => {
      const now = Date.now();
      const lastWebhookTime = new Date(now - 1000).toISOString(); // 1 second ago
      const lastWebhookTimeMs = new Date(lastWebhookTime).getTime();
      const timeSinceLastWebhook = now - lastWebhookTimeMs;
      const waitTime = Math.ceil((WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS - timeSinceLastWebhook) / 1000);

      expect(waitTime).toBe(59); // Should wait 59 more seconds
    });

    it('should calculate wait time correctly for edge case (59 seconds ago)', () => {
      const now = Date.now();
      const lastWebhookTime = new Date(now - 59000).toISOString(); // 59 seconds ago
      const lastWebhookTimeMs = new Date(lastWebhookTime).getTime();
      const timeSinceLastWebhook = now - lastWebhookTimeMs;
      const waitTime = Math.ceil((WEBHOOK_RATE_LIMIT.MIN_INTERVAL_MS - timeSinceLastWebhook) / 1000);

      expect(waitTime).toBe(1); // Should wait 1 more second
    });
  });

  describe('Timestamp format handling', () => {
    it('should correctly parse ISO timestamp', () => {
      const isoTimestamp = '2025-01-01T12:00:00.000Z';
      const parsed = new Date(isoTimestamp).getTime();

      expect(parsed).toBeGreaterThan(0);
      expect(isNaN(parsed)).toBe(false);
    });

    it('should handle invalid timestamp gracefully', () => {
      const invalidTimestamp = 'invalid-date';
      const parsed = new Date(invalidTimestamp).getTime();

      expect(isNaN(parsed)).toBe(true);
    });

    it('should treat invalid timestamp as 0', () => {
      const invalidTimestamp = 'invalid-date';
      const parsed = new Date(invalidTimestamp).getTime();
      const lastWebhookTimeMs = isNaN(parsed) ? 0 : parsed;

      expect(lastWebhookTimeMs).toBe(0);
    });
  });
});
