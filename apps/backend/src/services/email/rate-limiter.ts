import { getRedis } from '../../redis/redis';
import { REDIS_KEYS, getHourWindow, getNextHourWindowStart } from '../../config/constants';
import { logger } from '../../utils/logger';

/**
 * Atomic Redis Lua script for sender delay and hourly rate limit coordination.
 *
 * Atomically checks:
 * 1. Hourly rate limit for rate:{senderId}:{hourWindow} (Hourly limit takes priority)
 * 2. Minimum sender delay for sender:{senderId}:next_send_at
 *
 * If both pass, atomically:
 * 1. Increments rate counter with 7200s TTL
 * 2. Sets sender next_send_at = now_ms + delay_ms with 7200s TTL
 *
 * Prevents race conditions across concurrent workers.
 */
const CHECK_AND_RESERVE_SCRIPT = `
local delay_key = KEYS[1]
local rate_key = KEYS[2]

local now_ms = tonumber(ARGV[1])
local delay_ms = tonumber(ARGV[2])
local hourly_limit = tonumber(ARGV[3])

-- 1. Check hourly rate limit (priority over delay)
local current_rate = tonumber(redis.call('GET', rate_key) or '0')
if current_rate >= hourly_limit then
  return {'HOURLY_LIMIT_EXCEEDED', tostring(current_rate)}
end

-- 2. Check sender delay
local next_send_at = tonumber(redis.call('GET', delay_key) or '0')
if now_ms < next_send_at then
  return {'DELAY_NOT_SATISFIED', tostring(next_send_at)}
end

-- 3. Both satisfied: Atomically reserve send slot
local new_rate = redis.call('INCR', rate_key)
if new_rate == 1 then
  redis.call('EXPIRE', rate_key, 7200)
end

local new_next_send = now_ms + delay_ms
redis.call('SET', delay_key, tostring(new_next_send))
redis.call('EXPIRE', delay_key, 7200)

return {'ALLOWED', tostring(new_next_send), tostring(new_rate)}
`;

export type ReserveSlotResult =
  | { status: 'ALLOWED'; nextSendAt: number; currentCount: number }
  | { status: 'HOURLY_LIMIT_EXCEEDED'; currentCount: number; nextWindowStart: Date }
  | { status: 'DELAY_NOT_SATISFIED'; nextSendAt: number };

/**
 * Atomically evaluate sender delay and hourly limit, reserving the slot if both pass.
 */
export async function checkAndReserveSendSlot(
  senderId: string,
  delayMs: number,
  hourlyLimit: number,
  now: Date = new Date()
): Promise<ReserveSlotResult> {
  const redis = getRedis();
  const hourWindow = getHourWindow(now);
  const delayKey = REDIS_KEYS.SENDER_NEXT_SEND(senderId);
  const rateKey = REDIS_KEYS.RATE_LIMIT(senderId, hourWindow);
  const nowMs = now.getTime();

  const rawResult = (await redis.eval(
    CHECK_AND_RESERVE_SCRIPT,
    2,
    delayKey,
    rateKey,
    nowMs.toString(),
    delayMs.toString(),
    hourlyLimit.toString()
  )) as [string, string, string?];

  const status = rawResult[0];

  if (status === 'HOURLY_LIMIT_EXCEEDED') {
    const currentCount = parseInt(rawResult[1], 10);
    const nextWindowStart = getNextHourWindowStart(now);
    logger.info('SCHEDULER', 'Hourly limit reached for sender', {
      senderId,
      hourWindow,
      currentCount,
      hourlyLimit,
      nextWindowStart: nextWindowStart.toISOString(),
    });
    return {
      status: 'HOURLY_LIMIT_EXCEEDED',
      currentCount,
      nextWindowStart,
    };
  }

  if (status === 'DELAY_NOT_SATISFIED') {
    const nextSendAt = parseInt(rawResult[1], 10);
    logger.info('SCHEDULER', 'Sender delay not satisfied, must wait', {
      senderId,
      nowMs,
      nextSendAt,
      waitMs: nextSendAt - nowMs,
    });
    return {
      status: 'DELAY_NOT_SATISFIED',
      nextSendAt,
    };
  }

  const nextSendAt = parseInt(rawResult[1], 10);
  const currentCount = parseInt(rawResult[2] || '1', 10);

  logger.debug('SCHEDULER', 'Send slot reserved successfully', {
    senderId,
    hourWindow,
    currentCount,
    nextSendAt: new Date(nextSendAt).toISOString(),
  });

  return {
    status: 'ALLOWED',
    nextSendAt,
    currentCount,
  };
}

/**
 * Rollback rate limit counter if an email fails to send (e.g. SMTP transient error),
 * so an unsent email does not consume the sender's hourly limit.
 */
export async function rollbackSendSlot(senderId: string, hourWindow: string): Promise<void> {
  const redis = getRedis();
  const rateKey = REDIS_KEYS.RATE_LIMIT(senderId, hourWindow);

  const ROLLBACK_SCRIPT = `
    local key = KEYS[1]
    local current = tonumber(redis.call('GET', key) or '0')
    if current > 0 then
      return redis.call('DECR', key)
    end
    return 0
  `;

  await redis.eval(ROLLBACK_SCRIPT, 1, rateKey);
  logger.debug('SCHEDULER', 'Rolled back sender hourly rate limit slot', { senderId, hourWindow });
}

/**
 * Check if a Slack notification has already been sent for this sender/hour.
 * Uses Redis SET NX with 7200s TTL to ensure only one notification per sender per hour window.
 * Returns true if this is the first notification (should send), false if already notified.
 */
export async function shouldNotifySlack(senderId: string, hourWindow: string): Promise<boolean> {
  const redis = getRedis();
  const key = REDIS_KEYS.SLACK_NOTIFIED(senderId, hourWindow);

  const result = await redis.set(key, '1', 'EX', 7200, 'NX');
  return result === 'OK';
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  nextWindowStart?: Date;
}

/**
 * Legacy compatibility wrapper for checkRateLimit
 */
export async function checkRateLimit(
  senderId: string,
  hourlyLimit: number,
  now: Date = new Date()
): Promise<RateLimitResult> {
  const redis = getRedis();
  const hourWindow = getHourWindow(now);
  const key = REDIS_KEYS.RATE_LIMIT(senderId, hourWindow);

  const current = parseInt((await redis.get(key)) || '0', 10);
  if (current >= hourlyLimit) {
    return {
      allowed: false,
      currentCount: current,
      nextWindowStart: getNextHourWindowStart(now),
    };
  }

  return { allowed: true, currentCount: current };
}

/**
 * Legacy compatibility wrapper for reserveSenderSlot
 */
export async function reserveSenderSlot(senderId: string, minDelayMs: number): Promise<number> {
  const redis = getRedis();
  const key = REDIS_KEYS.SENDER_NEXT_SEND(senderId);
  const nowMs = Date.now();

  const nextSend = parseInt((await redis.get(key)) || '0', 10);
  const sendAt = Math.max(nowMs, nextSend);
  await redis.set(key, (sendAt + minDelayMs).toString(), 'EX', 7200);

  return sendAt;
}
