import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto';

describe('AES-256-GCM Credential Encryption', () => {
  it('encrypts and successfully decrypts sensitive SMTP passwords', () => {
    const secretPassword = 'super-secret-smtp-password-1234!';
    const encrypted = encrypt(secretPassword);

    expect(encrypted).not.toBe(secretPassword);
    expect(encrypted.split(':').length).toBe(3); // iv:authTag:ciphertext

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(secretPassword);
  });

  it('produces different ciphertexts for the same input due to random IVs', () => {
    const password = 'test-password';
    const enc1 = encrypt(password);
    const enc2 = encrypt(password);

    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(password);
    expect(decrypt(enc2)).toBe(password);
  });

  it('throws error when attempting to decrypt invalid format', () => {
    expect(() => decrypt('not-a-valid-encrypted-string')).toThrow();
  });
});
