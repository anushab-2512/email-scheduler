import { describe, it, expect } from 'vitest';
import { getHourWindow, getNextHourWindowStart, JOB_IDS } from './constants';

describe('Scheduler Constants & Time Helpers', () => {
  it('generates consistent UTC hour window format YYYY-MM-DD-HH', () => {
    const testDate = new Date('2026-09-03T14:35:22.000Z');
    const window = getHourWindow(testDate);
    expect(window).toBe('2026-09-03-14');
  });

  it('calculates the exact start of the next hour window', () => {
    const testDate = new Date('2026-09-03T14:35:22.000Z');
    const nextStart = getNextHourWindowStart(testDate);
    expect(nextStart.toISOString()).toBe('2026-09-03T15:00:00.000Z');
  });

  it('generates deterministic BullMQ job IDs for idempotency', () => {
    const emailId = 'b0e0081e-1234-4b5c-89de-123456789abc';
    const jobId = JOB_IDS.email(emailId);
    expect(jobId).toBe('email-b0e0081e-1234-4b5c-89de-123456789abc');
  });
});
