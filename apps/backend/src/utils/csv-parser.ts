/**
 * Parse email addresses from CSV/text content.
 * Supports:
 * - One email per line
 * - CSV with email column (auto-detected)
 * - Comma-separated emails
 */
export function parseEmailsFromContent(content: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const lines = content.split(/[\r\n]+/).filter(line => line.trim());

  if (lines.length === 0) return [];

  const emails = new Set<string>();

  for (const line of lines) {
    const matches = line.match(emailRegex);
    if (matches) {
      for (const email of matches) {
        emails.add(email.toLowerCase().trim());
      }
    }
  }

  return Array.from(emails);
}

/**
 * Validate a single email address format.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}
