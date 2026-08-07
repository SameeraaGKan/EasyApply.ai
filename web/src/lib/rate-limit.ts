import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting for expensive, agent-invoking endpoints (resume upload,
 * job search, form-fill triggers — see plan Section 7). Degrades to a
 * no-op when Upstash isn't configured (e.g. local dev) rather than
 * blocking requests outright, but MUST be configured before public launch.
 */
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiters = new Map<string, Ratelimit>();

function getLimiter(name: string, requests: number, windowSeconds: number) {
  const key = `${name}:${requests}:${windowSeconds}`;
  let limiter = limiters.get(key);
  if (!limiter && redis) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
      prefix: `ratelimit:${name}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

export async function checkRateLimit(
  name: string,
  identifier: string,
  requests: number,
  windowSeconds: number,
): Promise<{ success: boolean }> {
  const limiter = getLimiter(name, requests, windowSeconds);
  if (!limiter) {
    return { success: true };
  }
  const { success } = await limiter.limit(identifier);
  return { success };
}
