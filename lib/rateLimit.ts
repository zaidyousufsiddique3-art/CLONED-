import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Ensure Redis variables are present (though we assume they exist as per instructions)
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn("UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing.");
}

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

export type Duration = "1 s" | "1 m" | "5 m" | "1 h" | "1 d";

/**
 * Create a new sliding window rate limiter
 * @param requests Max requests allowed in the window
 * @param duration Window duration string (e.g. "5 m")
 */
export function createRateLimiter(requests: number, duration: Duration) {
    return new Ratelimit({
        redis: redis,
        limiter: Ratelimit.slidingWindow(requests, duration),
        analytics: true,
        // Using a common prefix, but keys will differ by the identifier passed to limit()
        prefix: "@upstash/ratelimit",
    });
}

/**
 * Safely extract client IP from request headers.
 * Priorities: x-forwarded-for > remoteAddress
 */
export function getClientIp(req: any): string {
    const forwarded = req.headers["x-forwarded-for"];
    // x-forwarded-for can be a string or array. If string, it might be comma-separated.
    const ip = forwarded
        ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0])
        : req.socket?.remoteAddress;

    return ip || "127.0.0.1";
}
