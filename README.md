# Email Scheduler

A production-grade distributed email scheduling engine and management dashboard built for ReachInbox. The system accepts scheduling requests via REST APIs and a modern React dashboard, schedules them with millisecond precision using **BullMQ delayed jobs backed by persistent Redis** (strictly **zero cron jobs**), enforces **worker concurrency**, **per-sender delay throttling**, and **hourly rate limiting**, dispatches messages through **Ethereal fake SMTP**, indexes records in **Elasticsearch** for full-text search, triggers real-time **Slack OAuth alerts** on rate-limit hits, and provides live queue observability via an embedded **Bull Board**.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Core Engineering & Design Guarantees](#core-engineering--design-guarantees)
   - [Zero Cron Scheduling](#1-zero-cron-scheduling)
   - [Restart Persistence](#2-restart-persistence)
   - [Idempotency & Duplicate Protection](#3-idempotency--duplicate-protection)
   - [Per-Sender Delay Throttling](#4-per-sender-delay-throttling)
   - [Hourly Rate Limiting & Auto-Rescheduling](#5-hourly-rate-limiting--auto-rescheduling)
   - [Real Slack OAuth Alerts](#6-real-slack-oauth-alerts)
   - [Full-Text Search with Elasticsearch](#7-full-text-search-with-elasticsearch)
4. [Prerequisites](#prerequisites)
5. [Step-by-Step Setup Guide](#step-by-step-setup-guide)
6. [Running the Application](#running-the-application)
7. [Demonstration Workflows](#demonstration-workflows)
   - [Demo 1: Google OAuth Login](#demo-1-google-oauth-login)
   - [Demo 2: CSV Upload & Email Scheduling](#demo-2-csv-upload--email-scheduling)
   - [Demo 3: Bull Board Live Queue Inspection](#demo-3-bull-board-live-queue-inspection)
   - [Demo 4: Restart Persistence Verification](#demo-4-restart-persistence-verification)
   - [Demo 5: Hourly Rate Limit & Slack Notification](#demo-5-hourly-rate-limit--slack-notification)
   - [Demo 6: Elasticsearch Search](#demo-6-elasticsearch-search)
8. [Database Schema Summary](#database-schema-summary)
9. [Assumptions, Shortcuts & Trade-offs](#assumptions-shortcuts--trade-offs)

---

## Architecture Overview

```
                 ┌────────────────────────────────┐
                 │     React Frontend (Vite)      │
                 │  TanStack Query + Tailwind CSS │
                 │      http://localhost:5173     │
                 └───────────────┬────────────────┘
                                 │ HTTP API / Cookies
                                 ▼
                 ┌────────────────────────────────┐
                 │       Express.js API           │
                 │   TypeScript + Layered Arch    │
                 │      http://localhost:4000     │
                 └──────┬─────────────────┬───────┘
                        │                 │
              ┌─────────┘                 └──────────┐
              ▼                                      ▼
        ┌───────────┐                          ┌───────────┐
        │   MySQL   │                          │   Redis   │
        │  (mysql2) │                          │  BullMQ   │
        └─────┬─────┘                          └─────┬─────┘
              │                                      │
              │  (Reads email data)                  │ (Consumes jobs)
              └───────────────┐        ┌─────────────┘
                              ▼        ▼
                      ┌──────────────────────┐
                      │  BullMQ Email Worker │
                      │  (Separate Process)  │
                      └───────┬──────┬───────┘
                              │      │
          ┌───────────────────┘      └──────────────────┐
          ▼                                             ▼
  ┌───────────────┐                             ┌───────────────┐
  │ Ethereal SMTP │                             │ Elasticsearch │
  │ Fake Delivery │                             │ Document Sync │
  └───────────────┘                             └───────────────┘
          │
          ▼ (When rate limit hit)
  ┌───────────────┐
  │ Slack Webhook │
  │  OAuth Alert  │
  └───────────────┘
```

### Bull Board Admin Queue Visibility
Bull Board is mounted directly on the Express server at:
`http://localhost:4000/admin/queues`
It provides real-time visibility into `email-send` and `slack-notification` queues across Delayed, Waiting, Active, Completed, and Failed states.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide React, TanStack Query | Fast, reactive, typed client-side architecture with automatic query invalidation and optimistic updates. |
| **Backend API** | Node.js, Express.js, TypeScript | Clean, layered architecture separating routes, controllers, services, repositories, and queue publishers. |
| **Worker** | Node.js, TypeScript, BullMQ | **Completely separate process** from the API server to prevent background work from degrading HTTP latency. |
| **Database** | MySQL (with `mysql2/promise`) | Explicit SQL migrations and parameterized queries. **No ORM** is used to guarantee clear and direct query control. |
| **Job Queue** | BullMQ + Redis + ioredis | Distributed delay scheduler and state coordination. Redis is configured with persistence. |
| **Search** | Elasticsearch 8 (`@elastic/elasticsearch`) | Full-text search on recipient email, subject, status, and sender identity. |
| **Authentication** | Google OAuth 2.0 | Real authorization code flow with HTTP-only session cookies and CSRF state verification. |
| **Slack Integration** | Slack OAuth v2 + Incoming Webhooks | Live authorization with encrypted token storage and deduped hourly alerts. |
| **Email SMTP** | Nodemailer + Ethereal Email | Real SMTP connection with preview URLs and message ID inspection for zero-cost testing. |

---

## Core Engineering & Design Guarantees

### 1. Zero Cron Scheduling
- **No `node-cron`, `crontab`, `agenda`, or `setInterval` polling loops.**
- When a user schedules an email batch for `T + delay * i`, the backend creates an individual row in MySQL and enqueues a delayed BullMQ job in Redis with:
  ```typescript
  delayMs = Math.max(0, scheduledAt.getTime() - Date.now())
  ```
- Redis internal sorted sets hold the delayed jobs. When the scheduled timestamp arrives, Redis promotes the job to `waiting`, and available workers pick it up instantly.

### 2. Restart Persistence
- If the Express API or BullMQ worker process crashes or restarts, **no jobs are lost or restarted from scratch**.
- Delayed jobs reside in Redis memory backed by disk persistence (`appendonly yes` or `save` snapshots).
- The worker does not re-query MySQL on startup to enqueue duplicates. On reconnection, BullMQ resumes watching the existing Redis keys seamlessly.

### 3. Idempotency & Duplicate Protection
- **Deterministic BullMQ Job IDs**: Every job is added with `jobId: email-${email.id}`. Enqueuing the same email multiple times is impossible.
- **Atomic State Reservation**:
  ```sql
  UPDATE emails 
  SET status = 'processing', attempt_count = attempt_count + 1, updated_at = NOW() 
  WHERE id = ? AND status = 'scheduled';
  ```
  Only the worker thread that changes 1 row proceeds to send. If 0 rows are affected, the job is discarded safely.
- **Sent Check**: If an email is already marked `sent`, the worker immediately exits without contacting SMTP.

### 4. Per-Sender Delay Throttling
- Providers throttle accounts that blast multiple emails within milliseconds.
- Minimum delay (default: `2000ms`, configurable via `DEFAULT_MIN_EMAIL_DELAY_MS`) is coordinated across multiple worker threads using an atomic **Redis Lua Script**:
  ```lua
  local key = KEYS[1] -- sender:{senderId}:next_send_at
  local now_ms = tonumber(ARGV[1])
  local min_delay_ms = tonumber(ARGV[2])
  local next_send = tonumber(redis.call('GET', key) or '0')
  if next_send < now_ms then next_send = now_ms end
  local send_at = next_send
  redis.call('SET', key, tostring(send_at + min_delay_ms))
  return tostring(send_at)
  ```
- If `send_at > now`, the job is delayed until the sender slot frees up, leaving the worker thread free for other senders.

### 5. Hourly Rate Limiting & Auto-Rescheduling
- Senders have an hourly limit (e.g., `200/hr`, or `3/hr` for rapid demo testing).
- Coordinated via atomic Redis counters keyed by `rate:{senderId}:{YYYY-MM-DD-HH}`.
- **Jobs are never dropped or permanently failed on rate-limit hit.**
- The worker calculates the start of the next UTC hour window (`getNextHourWindowStart()`), resets the email row to `scheduled`, reschedules the BullMQ job with `moveToDelayed()`, and yields cleanly.

### 6. Real Slack OAuth Alerts
- When an hourly limit is breached, the worker checks if the user has an active Slack connection.
- **Deduplication**: Uses Redis `SET NX EX 3700` with key `slack-rate-limit-notified:{senderId}:{hourWindow}` so only 1 Slack notification is fired per sender per hour.
- Disconnecting or reconnecting Slack works immediately without redeployment.

### 7. Full-Text Search with Elasticsearch
- Every scheduled and sent email is synchronized with Elasticsearch index `emails`.
- The search endpoint (`GET /api/emails/search?q=`) executes a `multi_match` fuzzy query against `recipientEmail`, `subject`, `status`, and `senderEmail`.

---

## Prerequisites

Ensure the following are installed on your system:

1. **Node.js**: v18.0.0 or higher (`node -v`)
2. **MySQL**: 8.x running locally on port 3306 (`mysql -u root -p`)
3. **Redis**: 7.x running locally on port 6379 (`redis-cli ping` -> `PONG`)
4. **Elasticsearch**: 8.x running locally on port 9200 (`curl http://localhost:9200`)
5. **Google Cloud OAuth 2.0 Credentials**:
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/).
   - Add Authorized Redirect URI: `http://localhost:4000/api/auth/google/callback`.
6. **Slack App Credentials** (Optional for Slack alert demo):
   - Create an app at [api.slack.com/apps](https://api.slack.com/apps).
   - Add OAuth Redirect URL: `http://localhost:4000/api/slack/callback`.
   - Add Bot Scopes: `incoming-webhook`, `chat:write`.
7. **Ethereal Email SMTP Account**:
   - Create free test credentials at [ethereal.email](https://ethereal.email/create).

---

## Step-by-Step Setup Guide

### 1. Clone & Enter Directory
```bash
cd C:\Users\anush\.gemini\antigravity-ide\scratch\email-scheduler
```

### 2. Install Monorepo Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your credentials in `.env`:
```env
PORT=4000
FRONTEND_URL=http://localhost:5173

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=email_scheduler
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password

REDIS_HOST=localhost
REDIS_PORT=6379

ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX=emails

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

SESSION_SECRET=a_very_secure_random_string_at_least_32_characters_long

SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret

SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your_ethereal_user
SMTP_PASSWORD=your_ethereal_password

DEFAULT_WORKER_CONCURRENCY=5
DEFAULT_MIN_EMAIL_DELAY_MS=2000
DEFAULT_MAX_EMAILS_PER_HOUR=200
```

### 4. Create MySQL Database
In MySQL command line or MySQL Workbench:
```sql
CREATE DATABASE IF NOT EXISTS email_scheduler CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. Run Database Migrations
Applies all 6 SQL migration scripts to set up tables and composite performance indexes:
```bash
npm run db:migrate
```

### 6. Seed Demo Senders
Creates sample sender accounts (using your configured Ethereal credentials):
```bash
npm run db:seed
```

---

## Running the Application

Start the 3 independent processes in separate terminals:

### Terminal 1: Backend API Server
```bash
npm run dev:backend
```
- API starts at `http://localhost:4000`
- Bull Board starts at `http://localhost:4000/admin/queues`
- Health check at `http://localhost:4000/health`

### Terminal 2: BullMQ Worker Process
```bash
npm run dev:worker
```
- Listens for delayed/ready jobs in Redis
- Handles slot reservation, rate limiting, and Ethereal SMTP dispatching

### Terminal 3: React Frontend Dashboard
```bash
npm run dev:frontend
```
- Starts Vite development server at `http://localhost:5173`

---

## Demonstration Workflows

### Demo 1: Google OAuth Login
1. Open `http://localhost:5173`.
2. Click **Sign in with Google**.
3. Complete the Google account selection.
4. You will be redirected to the dashboard with your Google avatar, name, and email in the top header.

### Demo 2: CSV Upload & Email Scheduling
1. Click **Compose New Email** in the top right.
2. Select a configured sender (e.g., Marketing Team).
3. Enter Subject and Body.
4. Upload `scripts/sample-leads.csv`.
5. Notice the detected count: `10 email addresses detected`.
6. Set Start Time, Delay (e.g., 2 seconds), and Hourly Limit.
7. Click **Schedule Campaign**.
8. Switch to the **Scheduled Emails** tab to watch jobs queued with their respective execution timestamps.

### Demo 3: Bull Board Live Queue Inspection
1. Open `http://localhost:4000/admin/queues` in your browser.
2. Select the `email-send` queue.
3. Observe jobs sitting in the **Delayed** tab.
4. When their scheduled time arrives, observe them transition into **Active**, then **Completed**.

### Demo 4: Restart Persistence Verification
1. Open **Compose New Email** and schedule 5 emails for **3 minutes into the future**.
2. Confirm the jobs appear in Bull Board as **Delayed**.
3. Stop Terminal 1 (Backend API: `Ctrl+C`).
4. Stop Terminal 2 (Worker: `Ctrl+C`).
5. Wait 30 seconds.
6. Restart both Terminal 1 (`npm run dev:backend`) and Terminal 2 (`npm run dev:worker`).
7. Observe Bull Board: the delayed jobs were **preserved intact** in Redis and trigger accurately at the scheduled time!

### Demo 5: Hourly Rate Limit & Slack Notification
1. Set in `.env`:
   ```env
   DEFAULT_MAX_EMAILS_PER_HOUR=3
   ```
   (Or configure an hourly limit of 3 directly in the Compose modal).
2. Connect Slack via the **Connect Slack** button in the dashboard.
3. Schedule 6 emails with a 1-second delay.
4. Observe:
   - The first 3 emails send successfully via Ethereal.
   - Email #4 triggers the rate limit: the worker reschedules emails 4, 5, and 6 to the start of the next hour window.
   - An instant Slack message is delivered to your channel:
     > ⚠️ *Rate Limit Reached*  
     > Sender `marketing@demo.ethereal.email` has reached its hourly email limit of 3.  
     > Emails are being automatically rescheduled to the next available window.

### Demo 6: Elasticsearch Search
1. In the search bar at the top of the dashboard, type any keyword from your campaign (e.g., recipient domain or subject word).
2. The results panel will render matching documents directly from Elasticsearch with their query relevance scores.

---

## Database Schema Summary

- **`users`**: `id`, `google_id`, `name`, `email`, `avatar_url`, `created_at`, `updated_at`.
- **`senders`**: `id`, `user_id`, `name`, `email`, `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password` (AES-256-GCM encrypted), `is_active`.
- **`slack_connections`**: `id`, `user_id`, `team_id`, `team_name`, `access_token` (encrypted), `webhook_url` (encrypted), `is_active`.
- **`email_campaigns`**: `id`, `user_id`, `sender_id`, `subject`, `body`, `start_time`, `delay_ms`, `hourly_limit`, `total_recipients`.
- **`emails`**: `id`, `campaign_id`, `user_id`, `sender_id`, `recipient_email`, `subject`, `body`, `scheduled_at`, `sent_at`, `status` (`scheduled`, `processing`, `sent`, `failed`), `attempt_count`, `bull_job_id`, `error_message`, `ethereal_message_id`, `ethereal_url`.

---

## Assumptions, Shortcuts & Trade-offs

1. **Ethereal Fake SMTP**: Ethereal is used per the specification. Emails are fully formatted and transmitted via authentic SMTP protocols, with web preview links stored in MySQL and visible in the UI.
2. **Distributed Exactly-Once Semantics**: While BullMQ job IDs and MySQL atomic status updates (`scheduled -> processing`) guarantee that our application never executes duplicate sends internally, SMTP providers themselves do not support transactional idempotency tokens. In the event of a power outage in the microsecond between SMTP acceptance and MySQL confirmation, an email could theoretically be re-attempted.
3. **Local Infrastructure**: Per project guidelines, standard local service installations (MySQL, Redis, Elasticsearch) are used without Docker containerization.
4. **Elasticsearch Fallback**: If Elasticsearch is temporarily unavailable, email scheduling and dispatching continue uninterrupted, while search gracefully reports the cluster state.
