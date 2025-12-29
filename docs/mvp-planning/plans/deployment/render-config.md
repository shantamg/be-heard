---
slug: /deployment/render-config
sidebar_position: 2
---

# Render Configuration

Render.com service definitions for Meet Without Fear.

## render.yaml

```yaml
services:
  # Backend API
  - type: web
    name: meetwithoutfear-api
    runtime: node
    region: oregon
    plan: starter
    buildCommand: npm ci && npm run build
    startCommand: npm run start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: meetwithoutfear-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: meetwithoutfear-redis
          type: redis
          property: connectionString
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_REFRESH_SECRET
        generateValue: true
      - key: ABLY_API_KEY
        sync: false  # Set manually
      - key: AWS_ACCESS_KEY_ID
        sync: false
      - key: AWS_SECRET_ACCESS_KEY
        sync: false
      - key: AWS_REGION
        value: us-west-2
      - key: EXPO_ACCESS_TOKEN
        sync: false
    autoDeploy: true

databases:
  # PostgreSQL with pgvector
  - name: meetwithoutfear-db
    plan: starter
    region: oregon
    postgresMajorVersion: 15
    ipAllowList: []  # Only allow from Render services

# Note: Redis is configured separately in Render dashboard
# as it requires the paid tier for persistence
```

## Database Setup

After database creation, enable pgvector:

```sql
-- Connect to database and run:
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify
SELECT * FROM pg_extension WHERE extname = 'vector';
```

## Build Configuration

### package.json scripts

```json
{
  "scripts": {
    "build": "tsc && prisma generate",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "db:migrate": "prisma migrate deploy",
    "db:push": "prisma db push",
    "postinstall": "prisma generate"
  }
}
```

### Prisma Configuration

```prisma
// schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")  // For migrations
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}
```

## Health Check Endpoint

```typescript
// src/routes/health.ts
import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

export default router;
```

## Deployment Workflow

### Initial Deployment

1. Create services in Render dashboard
2. Set environment variables (secrets)
3. Deploy backend
4. Run database migrations
5. Enable pgvector extension
6. Verify health endpoint

### Database Migrations

```bash
# Run migrations on deployment
npm run db:migrate

# Or push schema directly (dev only)
npm run db:push
```

### Environment Variable Updates

1. Update in Render dashboard
2. Trigger manual deploy or wait for auto-deploy
3. Verify via health endpoint

## Scaling Considerations

### Horizontal Scaling

Render auto-scales within plan limits. For manual scaling:

```yaml
# render.yaml
services:
  - type: web
    name: meetwithoutfear-api
    scaling:
      minInstances: 1
      maxInstances: 3
      targetMemoryPercent: 80
      targetCPUPercent: 80
```

### Database Connection Pooling

For higher traffic, use PgBouncer or Prisma connection pooling:

```typescript
// With Prisma Data Proxy
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // Pooled connection
}
```

## Monitoring

### Render Dashboard

- CPU/Memory metrics
- Request logs
- Deploy history

### Custom Logging

```typescript
// Structured logging for Render
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: process.env.NODE_ENV !== 'production' }
  }
});
```

## Related Documentation

- [Environment Variables](./environment-variables.md)
- [Architecture](../backend/overview/architecture.md)
- [Render Documentation](https://render.com/docs)

---

[Back to Deployment](./index.md)
