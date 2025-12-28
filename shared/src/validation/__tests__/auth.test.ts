/**
 * Auth Validation Tests
 *
 * Tests for auth validation schemas (re-exported from contracts/auth.ts).
 */

import {
  updatePushTokenRequestSchema,
  updateProfileRequestSchema,
  getMeResponseSchema,
  ablyTokenResponseSchema,
  userDTOSchema,
  updateBiometricPreferenceRequestSchema,
  updateBiometricPreferenceResponseSchema,
} from '../auth';

describe('userDTOSchema', () => {
  it('accepts valid user', () => {
    const result = userDTOSchema.safeParse({
      id: 'user-123',
      email: 'test@example.com',
      name: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      biometricEnabled: false,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts user with null name', () => {
    const result = userDTOSchema.safeParse({
      id: 'user-123',
      email: 'test@example.com',
      name: null,
      firstName: null,
      lastName: null,
      biometricEnabled: true,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = userDTOSchema.safeParse({
      id: 'user-123',
      email: 'not-an-email',
      name: 'John',
      firstName: 'John',
      lastName: null,
      biometricEnabled: false,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('getMeResponseSchema', () => {
  it('accepts valid response', () => {
    const result = getMeResponseSchema.safeParse({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'John',
        firstName: 'John',
        lastName: null,
        biometricEnabled: false,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      activeSessions: 2,
      pushNotificationsEnabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero active sessions', () => {
    const result = getMeResponseSchema.safeParse({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        firstName: null,
        lastName: null,
        biometricEnabled: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      activeSessions: 0,
      pushNotificationsEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative active sessions', () => {
    const result = getMeResponseSchema.safeParse({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        firstName: null,
        lastName: null,
        biometricEnabled: false,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      activeSessions: -1,
      pushNotificationsEnabled: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('updatePushTokenRequestSchema', () => {
  it('accepts valid iOS token', () => {
    const result = updatePushTokenRequestSchema.safeParse({
      pushToken: 'ExponentPushToken[xxxxxx]',
      platform: 'ios',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid Android token', () => {
    const result = updatePushTokenRequestSchema.safeParse({
      pushToken: 'fcm-token-123',
      platform: 'android',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty push token', () => {
    const result = updatePushTokenRequestSchema.safeParse({
      pushToken: '',
      platform: 'ios',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid platform', () => {
    const result = updatePushTokenRequestSchema.safeParse({
      pushToken: 'token-123',
      platform: 'web',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateProfileRequestSchema', () => {
  it('accepts name update', () => {
    const result = updateProfileRequestSchema.safeParse({
      name: 'Jane Doe',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateProfileRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
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

describe('ablyTokenResponseSchema', () => {
  it('accepts valid Ably token response', () => {
    const result = ablyTokenResponseSchema.safeParse({
      tokenRequest: {
        keyName: 'app-key-name',
        ttl: 3600000,
        timestamp: Date.now(),
        capability: '{"*":["*"]}',
        clientId: 'user-123',
        nonce: 'random-nonce',
        mac: 'hmac-signature',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fields', () => {
    const result = ablyTokenResponseSchema.safeParse({
      tokenRequest: {
        keyName: 'app-key-name',
        ttl: 3600000,
        // missing other required fields
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBiometricPreferenceRequestSchema', () => {
  it('accepts enabled true', () => {
    const result = updateBiometricPreferenceRequestSchema.safeParse({
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts enabled false', () => {
    const result = updateBiometricPreferenceRequestSchema.safeParse({
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing enabled', () => {
    const result = updateBiometricPreferenceRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean enabled', () => {
    const result = updateBiometricPreferenceRequestSchema.safeParse({
      enabled: 'true',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBiometricPreferenceResponseSchema', () => {
  it('accepts valid response with enrollment date', () => {
    const result = updateBiometricPreferenceResponseSchema.safeParse({
      biometricEnabled: true,
      biometricEnrolledAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid response with null enrollment date', () => {
    const result = updateBiometricPreferenceResponseSchema.safeParse({
      biometricEnabled: false,
      biometricEnrolledAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fields', () => {
    const result = updateBiometricPreferenceResponseSchema.safeParse({
      biometricEnabled: true,
    });
    expect(result.success).toBe(false);
  });
});
