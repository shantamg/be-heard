/**
 * Auth Contracts Tests
 */

import {
  updateProfileRequestSchema,
  updatePushTokenRequestSchema,
  userDTOSchema,
} from '../auth';

describe('userDTOSchema', () => {
  it('accepts valid user', () => {
    const result = userDTOSchema.safeParse({
      id: 'user-123',
      email: 'test@example.com',
      name: 'John Doe',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null name', () => {
    const result = userDTOSchema.safeParse({
      id: 'user-123',
      email: 'test@example.com',
      name: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = userDTOSchema.safeParse({
      id: 'user-123',
      email: 'not-an-email',
      name: 'John',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateProfileRequestSchema', () => {
  it('accepts valid name', () => {
    const result = updateProfileRequestSchema.safeParse({
      name: 'John Doe',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateProfileRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects empty string name', () => {
    const result = updateProfileRequestSchema.safeParse({
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name over 100 chars', () => {
    const result = updateProfileRequestSchema.safeParse({
      name: 'x'.repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe('updatePushTokenRequestSchema', () => {
  it('accepts valid iOS token', () => {
    const result = updatePushTokenRequestSchema.safeParse({
      pushToken: 'abc123token',
      platform: 'ios',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid Android token', () => {
    const result = updatePushTokenRequestSchema.safeParse({
      pushToken: 'abc123token',
      platform: 'android',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing pushToken', () => {
    const result = updatePushTokenRequestSchema.safeParse({
      platform: 'ios',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid platform', () => {
    const result = updatePushTokenRequestSchema.safeParse({
      pushToken: 'abc123',
      platform: 'web',
    });
    expect(result.success).toBe(false);
  });
});
