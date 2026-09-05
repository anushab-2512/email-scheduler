# ReachInbox Email Job Scheduler — Implementation Walkthrough

We have designed, architected, and built the complete **Full-Stack Email Job Scheduler** meeting every requirement and hard constraint of the ReachInbox assignment.

---

## 1. Project Overview & Directory Structure

Location: `C:\Users\anush\.gemini\antigravity-ide\scratch\email-scheduler`

```
email-scheduler/
├── README.md                          # Comprehensive setup, demo guide & architecture
├── .gitignore                         # Git exclusion rules
├── .env.example                       # Documented environment variables template
├── package.json                       # Monorepo workspaces for apps/backend & apps/frontend
├── scripts/
│   ├── setup-db.ts                    # Root helper for database migrations
│   ├── seed-demo.ts                   # Root helper for demo senders/users
│   └── sample-leads.csv               # 10 realistic leads for CSV upload demo
├── apps/
│   ├── backend/
│   │   ├── package.json               # Backend dependencies (BullMQ, mysql2, ES, Nodemailer, etc.)
│   │   ├── tsconfig.json              # Strict TypeScript configuration
│   │   └── src/
│   │       ├── app.ts                 # Express setup, Bull Board mounting, health checks
│   │       ├── server.ts              # HTTP API entry point & graceful shutdown
│   │       ├── config/
│   │       │   ├── env.ts             # Zod-validated environment config with fail-fast
│   │       │   └── constants.ts       # Queue names, Redis keys, status enums, hour helpers
│   │       ├── db/
│   │       │   ├── mysql.ts           # mysql2/promise connection pool (NO ORM)
│   │       │   ├── migrate.ts         # SQL migration runner
│   │       │   ├── migrations/        # 6 Raw SQL migration files (001 to 006)
│   │       │   └── seed/seed.ts       # Demo user and Ethereal senders seed script
│   │       ├── redis/
│   │       │   └── redis.ts           # ioredis client with maxRetriesPerRequest: null
│   │       ├── queue/
│   │       │   ├── email.queue.ts     # BullMQ email-send queue & deterministic job IDs
│   │       │   └── notification.queue.ts # BullMQ slack-notification queue
│   │       ├── workers/
│   │       │   ├── worker-entry.ts    # Independent Node.js Worker process
│   │       │   ├── email.worker.ts    # Send worker with idempotency, slots & rate limiting
│   │       │   └── notification.worker.ts # Slack notification worker
│   │       ├── services/
│   │       │   ├── email/rate-limiter.ts # Atomic Redis Lua scripts (slots & rate limit)
│   │       │   └── scheduler/scheduler.service.ts # Campaign batch creation & delayed job queueing
│   │       ├── repositories/
│   │       │   ├── user.repository.ts # Google OAuth user queries
│   │       │   ├── email.repository.ts # Campaign, email queries, atomic status reservation
│   │       │   ├── sender.repository.ts # Sender CRUD with AES-256-GCM encryption
│   │       │   └── slack.repository.ts # Slack connection management
│   │       ├── integrations/
│   │       │   ├── smtp.ts            # Nodemailer Ethereal SMTP with transporter caching
│   │       │   ├── google.ts          # Google OAuth 2.0 authorization & token exchange
│   │       │   ├── slack.ts           # Slack OAuth v2 & webhook delivery
│   │       │   └── elasticsearch.ts   # Elasticsearch index creation, document sync & search
│   │       ├── middleware/
│   │       │   ├── auth.middleware.ts # JWT verification from HTTP-only cookies
│   │       │   ├── error.middleware.ts# Centralized error handler (no leaked secrets)
│   │       │   └── not-found.middleware.ts # 404 handler
│   │       ├── validators/            # Zod schemas for scheduling, senders, auth
│   │       ├── utils/                 # Logger, errors, crypto, CSV parser
│   │       └── types/                 # Domain types and API response interfaces
│   └── frontend/
│       ├── package.json               # React, Vite, Tailwind CSS, TanStack Query, Lucide
│       ├── tsconfig.json              # Path aliases (@/*) & strict TS
│       ├── vite.config.ts             # Vite config with API reverse proxy
│       ├── tailwind.config.js         # Design system tokens and dark mode
│       ├── postcss.config.js
│       ├── index.html                 # HTML entry with Inter & JetBrains Mono typography
│       └── src/
│           ├── index.css              # Custom styling, modern glassmorphism, scrollbars
│           ├── main.tsx               # App mounting with QueryClientProvider
│           ├── App.tsx                # React Router and ProtectedRoute session guard
│           ├── lib/                   # API client, cn helper, date formatters
│           ├── hooks/                 # Custom TanStack Query hooks (auth, emails, senders, slack)
│           ├── components/
│           │   ├── common/            # Badge, LoadingSpinner, EmptyState
│           │   └── layout/            # Modern Navbar with theme toggle & user identity
│           └── features/
│               ├── auth/LoginPage.tsx # ReachInbox branded Google login page
│               ├── dashboard/DashboardPage.tsx # Master dashboard with live search & tabs
│               ├── compose/ComposeModal.tsx # CSV parsing, lead detection & scheduling
│               ├── scheduled-emails/ScheduledEmailsTable.tsx # Live scheduled queue table
│               ├── sent-emails/SentEmailsTable.tsx # Delivered emails with Ethereal previews
│               ├── search/SearchResults.tsx # Real-time Elasticsearch match renderer
│               ├── senders/SenderModal.tsx # SMTP sender identity manager
│               └── slack/SlackConnectModal.tsx # Slack OAuth connect/disconnect
```

---

## 2. Key Architecture & Constraints Met

| Constraint / Requirement | How It Is Implemented |
|---|---|
| **Zero Cron** | BullMQ delayed jobs backed by Redis sorted sets (`delay = scheduledAt - now`). No cron, node-cron, or setInterval polling loops. |
| **Separate Worker Process** | `npm run dev:backend` serves HTTP and Bull Board; `npm run dev:worker` is a distinct Node.js process executing the jobs. |
| **Restart Persistence** | BullMQ delayed jobs persist in Redis across crashes and restarts. On restart, workers resume processing without duplicate recreation. |
| **Idempotency** | 1) Deterministic BullMQ job IDs (`email-${emailId}`); 2) Atomic MySQL status reservation (`UPDATE emails SET status='processing' WHERE id=? AND status='scheduled'`); 3) Early check for `sent` status. |
| **Per-Sender Delay Throttling** | Atomic Redis Lua script (`sender:{senderId}:next_send_at`) enforces the minimum delay (default: `2000ms`) across all worker instances. |
| **Hourly Rate Limiting** | Atomic Redis counter (`rate:{senderId}:{YYYY-MM-DD-HH}`). If reached, jobs are **not dropped**; they are automatically rescheduled to the start of the next hour window. |
| **Slack OAuth Notification** | Real Slack OAuth authorization code flow. When the hourly limit is hit, an alert is posted to Slack. Deduplicated per sender/hour using Redis `SET NX EX 3700`. |
| **Elasticsearch Search** | Emails are indexed into Elasticsearch index `emails`. Search endpoint (`GET /api/emails/search?q=`) queries ES via multi-match fuzzy search. |
| **Ethereal Email SMTP** | Nodemailer transmits authentic SMTP messages to Ethereal, caching transporters per sender, and captures the web preview URL. |
| **Bull Board** | Live dashboard mounted at `http://localhost:4000/admin/queues` showing delayed, active, completed, and failed jobs. |
| **Frontend Polish** | Modern ReachInbox aesthetics with light/dark theme toggle, CSV parsing (detects count), live polling for status updates, and empty/loading states. |

---

## 3. How to Run Locally

### Step 1: Install Dependencies
```bash
cd C:\Users\anush\.gemini\antigravity-ide\scratch\email-scheduler
npm install
```

### Step 2: Configure Environment
Copy `.env.example` to `.env` and fill in credentials:
```bash
cp .env.example .env
```

### Step 3: Run Database Migrations & Seed
```bash
npm run db:migrate
npm run db:seed
```

### Step 4: Start the 3 Processes
- **Terminal 1 (Backend API + Bull Board):**
  ```bash
  npm run dev:backend
  ```
- **Terminal 2 (BullMQ Worker):**
  ```bash
  npm run dev:worker
  ```
- **Terminal 3 (React Frontend):**
  ```bash
  npm run dev:frontend
  ```

---

## 4. Verification & Testing

Unit tests for CSV parsing, cryptographic encryption/decryption, and time window calculations have been included under `apps/backend/src/`.

Run tests:
```bash
npm run test -w apps/backend
```
