# Meet Without Fear

A guided process that helps two people understand each other better and find common ground.

## Project Structure

```
meet-without-fear/
├── backend/       # Express API with Prisma ORM
├── mobile/        # Expo React Native app
├── shared/        # Shared types and DTOs
├── docs-site/     # Docusaurus documentation
└── implementation/  # Implementation plans (not deployed)
```

## Prerequisites

- Node.js 20+
- [devenv](https://devenv.sh/) (for local PostgreSQL)
- Expo Go app on your phone (for mobile development)

## External Services

You'll need accounts for these services (all have generous free tiers):

| Service | Purpose | Sign Up |
|---------|---------|---------|
| **Clerk** | User authentication | [clerk.com](https://dashboard.clerk.com) |
| **Ably** | Real-time messaging | [ably.com](https://ably.com/accounts) |
| **Resend** | Email invitations | [resend.com](https://resend.com) |

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd meet-without-fear
npm install
```

### 2. Set up environment variables

Copy the example env files and add your API keys:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your keys:

```env
# Database (from devenv)
DATABASE_URL=postgresql://mwf_user:mwf_password@localhost:5432/meet_without_fear
DIRECT_URL=postgresql://mwf_user:mwf_password@localhost:5432/meet_without_fear

# Clerk - from https://dashboard.clerk.com → API Keys
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# Ably - from https://ably.com → Your App → API Keys
ABLY_API_KEY=xxxxx.xxxxx:xxxxx

# Resend - from https://resend.com → API Keys
RESEND_API_KEY=re_...
FROM_EMAIL=onboarding@resend.dev
```

### 3. Start PostgreSQL

```bash
devenv up -d
```

### 4. Run database migrations

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
cd ..
```

### 5. Set mobile API URL

```bash
cd mobile
npm run set-local-ip
cd ..
```

This detects your local IP and writes it to `mobile/.env`.

### 6. Start development servers

In separate terminals:

```bash
# Terminal 1: API server
npm run dev:api

# Terminal 2: Mobile app
npm run dev:mobile
```

Scan the QR code with Expo Go on your phone.

## Development Commands

```bash
npm run dev:api       # Start backend API (port 3000)
npm run dev:mobile    # Start Expo development server
npm run check         # Type check all workspaces
npm run test          # Run all tests
npm run migrate       # Run Prisma migrations
```

## Architecture

- **Backend**: Express.js API with Prisma ORM, Clerk auth, Ably realtime
- **Mobile**: Expo/React Native with React Query, expo-router
- **Shared**: TypeScript types, DTOs, and contracts used by both

## Documentation

- [MVP Planning](docs/mvp-planning/index.md) - Product planning documentation
