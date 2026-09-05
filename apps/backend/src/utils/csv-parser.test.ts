import { describe, it, expect } from 'vitest';
import { parseEmailsFromContent, isValidEmail } from './csv-parser';

describe('CSV & Text Email Parser', () => {
  it('extracts valid emails from comma-separated list', () => {
    const input = 'alice@example.com, bob@example.com, charlie@sub.domain.org';
    const result = parseEmailsFromContent(input);
    expect(result).toEqual(['alice@example.com', 'bob@example.com', 'charlie@sub.domain.org']);
  });

  it('extracts emails from CSV with headers and other columns', () => {
    const input = `id,name,email,score
1,John Doe,john@outbox.ai,95
2,Jane Smith,jane.smith@company.co,88
3,Invalid,not-an-email,10`;
    const result = parseEmailsFromContent(input);
    expect(result).toContain('john@outbox.ai');
    expect(result).toContain('jane.smith@company.co');
    expect(result).not.toContain('not-an-email');
    expect(result.length).toBe(2);
  });

  it('deduplicates repeating email addresses case-insensitively', () => {
    const input = 'lead@test.com\nLEAD@TEST.COM\nlead@test.com';
    const result = parseEmailsFromContent(input);
    expect(result).toEqual(['lead@test.com']);
  });

  it('returns empty array when no emails exist', () => {
    const input = 'Just some random text\nwithout any email addresses!';
    expect(parseEmailsFromContent(input)).toEqual([]);
  });

  it('validates email syntax correctly', () => {
    expect(isValidEmail('user@domain.com')).toBe(true);
    expect(isValidEmail('user.name+tag@sub.example.co.uk')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('@missinguser.com')).toBe(false);
  });
});
