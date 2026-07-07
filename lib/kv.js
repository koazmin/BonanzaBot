// Key-value store: Upstash Redis (recommended for production) with an
// in-memory fallback so the bot still works before Redis env vars are set.
// Used for: message deduplication, per-conversation human-takeover pause.
import { Redis } from '@upstash/redis';

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// In-memory fallback (per serverless instance only — fine for dev/testing)
const memoryStore = new Map();

function memoryGet(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key, value, ttlSeconds) {
  memoryStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

export async function kvGet(key) {
  try {
    if (redis) return await redis.get(key);
  } catch (err) {
    console.error('❗ Redis GET error, falling back to memory:', err.message);
  }
  return memoryGet(key);
}

export async function kvSet(key, value, ttlSeconds) {
  try {
    if (redis) {
      await redis.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined);
      return;
    }
  } catch (err) {
    console.error('❗ Redis SET error, falling back to memory:', err.message);
  }
  memorySet(key, value, ttlSeconds);
}

export async function kvDelete(key) {
  try {
    if (redis) {
      await redis.del(key);
      return;
    }
  } catch (err) {
    console.error('❗ Redis DEL error, falling back to memory:', err.message);
  }
  memoryStore.delete(key);
}

// Set only if the key does not exist yet. Returns true if this call claimed
// the key (i.e. first time seen) — used to deduplicate webhook deliveries.
export async function kvSetIfNotExists(key, value, ttlSeconds) {
  try {
    if (redis) {
      const result = await redis.set(key, value, { nx: true, ex: ttlSeconds || 3600 });
      return result === 'OK';
    }
  } catch (err) {
    console.error('❗ Redis SETNX error, falling back to memory:', err.message);
  }
  if (memoryGet(key) !== null) return false;
  memorySet(key, value, ttlSeconds);
  return true;
}
