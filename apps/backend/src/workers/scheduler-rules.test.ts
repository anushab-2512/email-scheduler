import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getRedis, closeRedis } from '../redis/redis';
import { REDIS_KEYS, getHourWindow, getNextHourWindowStart } from '../config/constants';
import { checkAndReserveSendSlot, rollbackSendSlot, shouldNotifySlack } from '../services/email/rate-limiter';
import { processEmailJob } from './email.worker';
import { emailRepository } from '../repositories/email.repository';
import { senderRepository } from '../repositories/sender.repository';
import * as smtp from '../integrations/smtp';
import { Queue, Worker, Job } from 'bullmq';
import { EmailJobData } from '../types/queue.types';

describe('Email Scheduling & Worker Rules (Delay + Hourly Limit)', () => {
  const redis = getRedis();

  beforeEach(async () => {
    // Clean up test keys in Redis before each test
    const keys = await redis.keys('test-*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    const rateKeys = await redis.keys('rate:test-*');
    if (rateKeys.length > 0) {
      await redis.del(...rateKeys);
    }
    const senderKeys = await redis.keys('sender:test-*');
    if (senderKeys.length > 0) {
      await redis.del(...senderKeys);
    }
    const slackKeys = await redis.keys('slack-rate-limit-notified:test-*');
    if (slackKeys.length > 0) {
      await redis.del(...slackKeys);
    }
  });

  afterAll(async () => {
    // Clean up test keys
    const testKeys = await redis.keys('*test-*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 1: 10 emails, delay = 2 sec, hourlyLimit = 1
  // Expected: 1 email per hourly window, remaining rescheduled
  // ─────────────────────────────────────────────────────────────
  it('TEST 1: 10 emails with delay=2s and hourlyLimit=1 sends exactly 1 email per hourly window', async () => {
    const senderId = 'test-sender-test1';
    const delayMs = 2000;
    const hourlyLimit = 1;

    // Start time: 10:00:00 UTC
    const baseDate = new Date('2026-09-05T10:00:00.000Z');

    const executionLog: Array<{ candidate: number; time: string; action: string }> = [];

    // Candidate 1 at 10:00:00
    const cand1 = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, baseDate);
    expect(cand1.status).toBe('ALLOWED');
    if (cand1.status === 'ALLOWED') {
      executionLog.push({ candidate: 1, time: baseDate.toISOString(), action: 'SENT' });
    }

    // Candidate 2 at 10:00:02 (delay satisfied, but hourly limit reached!)
    const timeCand2 = new Date(baseDate.getTime() + 2000); // 10:00:02
    const cand2 = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, timeCand2);
    expect(cand2.status).toBe('HOURLY_LIMIT_EXCEEDED');
    if (cand2.status === 'HOURLY_LIMIT_EXCEEDED') {
      executionLog.push({
        candidate: 2,
        time: timeCand2.toISOString(),
        action: 'RESCHEDULED_TO_' + cand2.nextWindowStart.toISOString(),
      });
      expect(cand2.nextWindowStart.toISOString()).toBe('2026-09-05T11:00:00.000Z');
    }

    // Candidate 2 runs in next hourly window: 11:00:00
    const hour11 = new Date('2026-09-05T11:00:00.000Z');
    const cand2Rescheduled = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, hour11);
    expect(cand2Rescheduled.status).toBe('ALLOWED');
    if (cand2Rescheduled.status === 'ALLOWED') {
      executionLog.push({ candidate: 2, time: hour11.toISOString(), action: 'SENT' });
    }

    // Candidate 3 at 11:00:02 (hourly limit for 11:00 reached!)
    const timeCand3 = new Date(hour11.getTime() + 2000);
    const cand3 = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, timeCand3);
    expect(cand3.status).toBe('HOURLY_LIMIT_EXCEEDED');
    expect(cand3.status === 'HOURLY_LIMIT_EXCEEDED' && cand3.nextWindowStart.toISOString()).toBe('2026-09-05T12:00:00.000Z');

    // Simulate remaining candidates across hours 12 to 19
    for (let c = 3; c <= 10; c++) {
      const candidateHour = 10 + (c - 1); // 12, 13, 14... 19
      const candidateTime = new Date(`2026-09-05T${candidateHour.toString().padStart(2, '0')}:00:00.000Z`);

      const result = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, candidateTime);
      expect(result.status).toBe('ALLOWED');
      executionLog.push({ candidate: c, time: candidateTime.toISOString(), action: 'SENT' });
    }

    const sentEntries = executionLog.filter(e => e.action === 'SENT');
    expect(sentEntries).toHaveLength(10);
    expect(sentEntries[0].time).toBe('2026-09-05T10:00:00.000Z');
    expect(sentEntries[1].time).toBe('2026-09-05T11:00:00.000Z');
    expect(sentEntries[2].time).toBe('2026-09-05T12:00:00.000Z');
    expect(sentEntries[9].time).toBe('2026-09-05T19:00:00.000Z');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 2: 10 emails, delay = 2 sec, hourlyLimit = 5
  // Expected: 5 emails in 1st hour, remaining 5 in 2nd hour
  // ─────────────────────────────────────────────────────────────
  it('TEST 2: 10 emails with delay=2s and hourlyLimit=5 sends 5 in first hour and 5 in next hour', async () => {
    const senderId = 'test-sender-test2';
    const delayMs = 2000;
    const hourlyLimit = 5;

    // Hour 1: 10:00:00 UTC
    const hour1 = new Date('2026-09-05T10:00:00.000Z');
    const hour1Sent: number[] = [];
    const hour1Blocked: number[] = [];

    for (let i = 1; i <= 10; i++) {
      const evalTime = new Date(hour1.getTime() + (i - 1) * delayMs);
      const res = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, evalTime);
      if (res.status === 'ALLOWED') {
        hour1Sent.push(i);
      } else if (res.status === 'HOURLY_LIMIT_EXCEEDED') {
        hour1Blocked.push(i);
        expect(res.nextWindowStart.toISOString()).toBe('2026-09-05T11:00:00.000Z');
      }
    }

    // Exactly 5 sent in hour 1 (Candidates 1 to 5)
    expect(hour1Sent).toEqual([1, 2, 3, 4, 5]);
    // Remaining 5 blocked in hour 1 (Candidates 6 to 10)
    expect(hour1Blocked).toEqual([6, 7, 8, 9, 10]);

    // Hour 2: 11:00:00 UTC - Remaining 5 candidates send
    const hour2 = new Date('2026-09-05T11:00:00.000Z');
    const hour2Sent: number[] = [];

    for (let idx = 0; idx < hour1Blocked.length; idx++) {
      const candidateNumber = hour1Blocked[idx];
      const evalTime = new Date(hour2.getTime() + idx * delayMs);
      const res = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, evalTime);
      expect(res.status).toBe('ALLOWED');
      hour2Sent.push(candidateNumber);
    }

    expect(hour2Sent).toEqual([6, 7, 8, 9, 10]);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 3: 10 emails, delay = 2 sec, hourlyLimit = 100
  // Expected: All 10 sent spaced approximately 2s apart
  // ─────────────────────────────────────────────────────────────
  it('TEST 3: 10 emails with delay=2s and hourlyLimit=100 are sent spaced by delay', async () => {
    const senderId = 'test-sender-test3';
    const delayMs = 2000;
    const hourlyLimit = 100;

    const baseTime = new Date('2026-09-05T10:00:00.000Z');

    // 1. Sending with 2s spacing should succeed for all 10
    for (let i = 1; i <= 10; i++) {
      const candidateTime = new Date(baseTime.getTime() + (i - 1) * delayMs);
      const res = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, candidateTime);
      expect(res.status).toBe('ALLOWED');
      if (res.status === 'ALLOWED') {
        expect(res.currentCount).toBe(i);
        expect(res.nextSendAt).toBe(candidateTime.getTime() + delayMs);
      }
    }

    // 2. An attempt before the delay has elapsed must return DELAY_NOT_SATISFIED
    // Last email was at 10:00:18, next send at is 10:00:20
    const earlyTime = new Date(baseTime.getTime() + 9 * delayMs + 500); // 10:00:18.500
    const earlyRes = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, earlyTime);
    expect(earlyRes.status).toBe('DELAY_NOT_SATISFIED');
    if (earlyRes.status === 'DELAY_NOT_SATISFIED') {
      expect(earlyRes.nextSendAt).toBe(baseTime.getTime() + 10 * delayMs); // 10:00:20.000
    }
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Restart worker while delayed jobs exist
  // Expected: Delayed BullMQ jobs survive and continue in Redis
  // ─────────────────────────────────────────────────────────────
  it('TEST 4: BullMQ delayed jobs persist in Redis across worker lifecycle', async () => {
    const queueName = 'test-queue-worker-restart';
    const queue = new Queue<EmailJobData>(queueName, { connection: getRedis() });

    // Add 3 delayed jobs
    await queue.add('test-job', { emailId: 'email-1', campaignId: 'c1', senderId: 's1' }, { delay: 60000 });
    await queue.add('test-job', { emailId: 'email-2', campaignId: 'c1', senderId: 's1' }, { delay: 120000 });
    await queue.add('test-job', { emailId: 'email-3', campaignId: 'c1', senderId: 's1' }, { delay: 180000 });

    // Verify jobs are currently delayed
    let delayedCount = await queue.getDelayedCount();
    expect(delayedCount).toBe(3);

    // Simulate worker 1 starting and closing (e.g. process restart / crash)
    const worker1 = new Worker(queueName, async () => {}, { connection: getRedis() });
    await worker1.close();

    // Verify delayed jobs STILL exist in Redis after worker closed
    delayedCount = await queue.getDelayedCount();
    expect(delayedCount).toBe(3);

    // Simulate worker 2 starting after restart
    const delayedJobs = await queue.getDelayed();
    expect(delayedJobs).toHaveLength(3);
    expect(delayedJobs.map(j => j.data.emailId)).toEqual(expect.arrayContaining(['email-1', 'email-2', 'email-3']));

    await queue.obliterate({ force: true });
    await queue.close();
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Concurrency & Multi-Worker Race Conditions
  // Expected: Atomic reservation prevents concurrent workers from bypassing limits
  // ─────────────────────────────────────────────────────────────
  it('TEST 5: Concurrent workers cannot bypass hourlyLimit or sender delay', async () => {
    const senderId = 'test-sender-race';
    const delayMs = 2000;
    const hourlyLimit = 1;
    const now = new Date('2026-09-05T10:00:00.000Z');

    // 10 concurrent worker requests at the EXACT same millisecond
    const promises = Array.from({ length: 10 }).map(() =>
      checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, now)
    );

    const results = await Promise.all(promises);

    const allowed = results.filter(r => r.status === 'ALLOWED');
    const hourlyExceeded = results.filter(r => r.status === 'HOURLY_LIMIT_EXCEEDED');
    const delayNotSatisfied = results.filter(r => r.status === 'DELAY_NOT_SATISFIED');

    // EXACTLY 1 worker was allowed through!
    expect(allowed).toHaveLength(1);
    // ALL other 9 workers were rejected without race condition!
    expect(hourlyExceeded.length + delayNotSatisfied.length).toBe(9);

    // Verify rate limit counter in Redis is exactly 1
    const hourWindow = getHourWindow(now);
    const countInRedis = await redis.get(REDIS_KEYS.RATE_LIMIT(senderId, hourWindow));
    expect(countInRedis).toBe('1');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Idempotency — Processing already sent email
  // Expected: Skips sending if MySQL status is already sent
  // ─────────────────────────────────────────────────────────────
  it('TEST 6: Worker does not re-send an email if already marked as sent', async () => {
    const emailId = 'test-email-already-sent';
    const senderId = 'test-sender-id';

    // Mock email repository to return email with status 'sent'
    vi.spyOn(emailRepository, 'findByIdWithCampaign').mockResolvedValueOnce({
      id: emailId,
      campaign_id: 'c1',
      user_id: 'u1',
      sender_id: senderId,
      recipient_email: 'user@example.com',
      subject: 'Test',
      body: 'Hello',
      scheduled_at: new Date(),
      sent_at: new Date(),
      status: 'sent',
      attempt_count: 1,
      bull_job_id: 'job-1',
      error_message: null,
      ethereal_message_id: 'msg-123',
      ethereal_url: 'https://ethereal.email/msg/123',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const sendEmailSpy = vi.spyOn(smtp, 'sendEmail');

    const fakeJob = {
      id: 'job-1',
      data: { emailId, campaignId: 'c1', senderId },
      token: 'token-1',
    } as unknown as Job<EmailJobData>;

    await processEmailJob(fakeJob);

    // SMTP sendEmail must NEVER be called for already-sent email
    expect(sendEmailSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Slack notification deduplication
  // Expected: Only 1 notification per sender per hourly window
  // ─────────────────────────────────────────────────────────────
  it('Deduplicates Slack rate limit notifications per sender and hour window', async () => {
    const senderId = 'test-sender-slack';
    const hourWindow = '2026-09-05-10';

    const notify1 = await shouldNotifySlack(senderId, hourWindow);
    const notify2 = await shouldNotifySlack(senderId, hourWindow);
    const notify3 = await shouldNotifySlack(senderId, hourWindow);

    expect(notify1).toBe(true);  // First notification allowed
    expect(notify2).toBe(false); // Subsequent notifications blocked
    expect(notify3).toBe(false);

    // New hour window resets deduplication
    const notifyNextHour = await shouldNotifySlack(senderId, '2026-09-05-11');
    expect(notifyNextHour).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 8: Rollback rate limit slot on transient failure
  // Expected: Decrements counter so failed send doesn't burn limit
  // ─────────────────────────────────────────────────────────────
  it('Rolls back rate limit count if send fails', async () => {
    const senderId = 'test-sender-rollback';
    const delayMs = 2000;
    const hourlyLimit = 1;
    const now = new Date('2026-09-05T10:00:00.000Z');
    const hourWindow = getHourWindow(now);

    // 1. Reserve slot
    const res = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, now);
    expect(res.status).toBe('ALLOWED');

    const countBefore = await redis.get(REDIS_KEYS.RATE_LIMIT(senderId, hourWindow));
    expect(countBefore).toBe('1');

    // 2. Rollback
    await rollbackSendSlot(senderId, hourWindow);

    const countAfter = await redis.get(REDIS_KEYS.RATE_LIMIT(senderId, hourWindow));
    expect(countAfter).toBe('0');

    // 3. Slot is free again in the same hour
    const retryRes = await checkAndReserveSendSlot(senderId, delayMs, hourlyLimit, new Date(now.getTime() + 2000));
    expect(retryRes.status).toBe('ALLOWED');
  });
});
