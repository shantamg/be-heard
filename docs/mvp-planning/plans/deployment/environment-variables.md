---
slug: /deployment/environment-variables
sidebar_position: 3
---

# Environment Variables

All required environment variables for BeHeard services.

## Backend API

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port (Render sets automatically) | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Access token signing secret | (generated) |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | (generated) |
| `ABLY_API_KEY` | Ably API key for realtime | `xxxxx.yyyyy:zzzzz` |
| `AWS_ACCESS_KEY_ID` | AWS credentials for Bedrock | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for Bedrock | (secret) |
| `AWS_REGION` | AWS region for Bedrock | `us-west-2` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | (none - in-memory fallback) |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `60000` |
| `RATE_LIMIT_MAX` | Max requests per window | `100` |
| `EXPO_ACCESS_TOKEN` | Expo push notification token | (optional) |

## JWT Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_ACCESS_EXPIRY` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRY` | Refresh token TTL | `30d` |
| `JWT_ISSUER` | Token issuer claim | `beheard` |

## AWS Bedrock Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_REGION` | Bedrock region | `us-west-2` |
| `BEDROCK_MODEL_LARGE` | Large model ID | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| `BEDROCK_MODEL_SMALL` | Small model ID | `anthropic.claude-3-5-haiku-20241022-v1:0` |
| `BEDROCK_MAX_TOKENS` | Default max tokens | `1000` |
| `BEDROCK_TEMPERATURE` | Default temperature | `0.7` |

## Ably Configuration

| Variable | Description |
|----------|-------------|
| `ABLY_API_KEY` | Full API key with publish/subscribe capability |

Get your API key from [Ably Dashboard](https://ably.com/dashboard).

## Database Configuration

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Pooled connection string (for app) |
| `DIRECT_DATABASE_URL` | Direct connection string (for migrations) |

### Connection String Format

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

## Development vs Production

### Development (.env.local)

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/beheard_dev

JWT_SECRET=dev-secret-not-for-production
JWT_REFRESH_SECRET=dev-refresh-secret

# Use local Redis or skip
REDIS_URL=redis://localhost:6379

# Ably sandbox key
ABLY_API_KEY=your-sandbox-key

# AWS credentials (use IAM role in prod)
AWS_ACCESS_KEY_ID=your-dev-key
AWS_SECRET_ACCESS_KEY=your-dev-secret
AWS_REGION=us-west-2

LOG_LEVEL=debug
```

### Production (Render)

Set via Render dashboard or `render.yaml`:

- `DATABASE_URL`: Auto-set from database service
- `REDIS_URL`: Auto-set from Redis service
- `JWT_SECRET`: Generate with `generateValue: true`
- `JWT_REFRESH_SECRET`: Generate with `generateValue: true`
- `ABLY_API_KEY`: Set manually (secret)
- `AWS_*`: Set manually (secrets)

## Secrets Management

### Never commit secrets

```bash
# .gitignore
.env
.env.local
.env.*.local
```

### Rotate secrets regularly

1. Generate new secret
2. Update in Render dashboard
3. Deploy new version
4. Invalidate old tokens (if applicable)

### AWS IAM Policy

Minimum required permissions for Bedrock:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-5-sonnet-*",
        "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-5-haiku-*"
      ]
    }
  ]
}
```

## Validation

Validate environment on startup:

```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ABLY_API_KEY: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_REGION: z.string().default('us-west-2'),
});

export const env = envSchema.parse(process.env);
```

## Related Documentation

- [Render Configuration](./render-config.md)
- [Security](../backend/security/index.md)

---

[Back to Deployment](./index.md)
