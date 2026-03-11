/**
 * Generic Job Indexing & Tagging Library
 *
 * Provides a clean API for storing, indexing, tagging, and scoring jobs in Redis.
 * Designed to be used by:
 *   - refresh-jobs.mjs (Greenhouse API crawler)
 *   - Future REST API for manual job ingestion
 *   - Any source that discovers jobs (Dover, Lever, manual, scrapers)
 *
 * All filtering is pushed down to Redis via multi-index sets, enabling
 * efficient faceted queries without pulling data into application memory.
 */
import type Redis from "ioredis";
import { createHash } from "crypto";

/* ── Core Types ── */

/** Minimal job input — everything needed to index a job from any source. */
export interface JobInput {
  /** Unique ID within the source (e.g., Greenhouse job ID) */
  jobId: string;
  /** Source identifier / board token (e.g., "point72", "manual", "lever-citadel") */
  source: string;
  /** Human-readable source name (e.g., "Point72", "Manual Entry") */
  sourceName: string;
  title: string;
  url: string;
  location: string;
  department: string;
  /** Optional: pre-computed tags. If omitted, auto-extracted from title+department. */
  tags?: string[];
  /** Optional: override the relevance score. If omitted, auto-computed. */
  score?: number;
  /** Optional: extra fields stored in the hash but not indexed. */
  metadata?: Record<string, string>;
}

/** Result of an index operation for a single job. */
export interface IndexResult {
  compositeKey: string;
  action: "created" | "updated" | "unchanged";
}

/** Batch index summary. */
export interface BatchIndexResult {
  created: number;
  updated: number;
  unchanged: number;
  results: IndexResult[];
}

/** Stored job record (what lives in the Redis hash). */
export interface StoredJob {
  job_id: string;
  company: string;
  company_name: string;
  title: string;
  url: string;
  department: string;
  location: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
  content_hash: string;
  tags: string;
  [key: string]: string;
}

/* ── Tag Extraction ── */

const TAG_RULES: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /quant/i, tag: "quantitative" },
  { pattern: /data/i, tag: "data" },
  { pattern: /software|engineer/i, tag: "engineering" },
  { pattern: /research/i, tag: "research" },
  { pattern: /machine learning|\bml\b|\bai\b/i, tag: "ml" },
  { pattern: /trad/i, tag: "trading" },
  { pattern: /infra/i, tag: "infrastructure" },
  { pattern: /devops|\bsre\b|reliability/i, tag: "devops" },
  { pattern: /analytics|analyst/i, tag: "analytics" },
  { pattern: /cloud|aws|azure|gcp/i, tag: "cloud" },
  { pattern: /security|cyber/i, tag: "security" },
  { pattern: /product manager|product management/i, tag: "product" },
];

/** Extract tags from title + department text. */
export function extractTags(title: string, department: string = ""): string[] {
  const text = `${title} ${department}`.toLowerCase();
  const tags = new Set<string>();
  for (const rule of TAG_RULES) {
    if (rule.pattern.test(text)) tags.add(rule.tag);
  }
  return [...tags].sort();
}

/* ── Location Normalization ── */

const LOCATION_PATTERNS: Record<string, string[]> = {
  new_york: ["new york", "nyc", ", ny"],
  chicago: ["chicago", ", il"],
  stamford: ["stamford", ", ct"],
  austin: ["austin", ", tx"],
  greenwich: ["greenwich"],
  boston: ["boston", ", ma"],
  san_francisco: ["san francisco", ", ca", "bay area"],
  seattle: ["seattle", ", wa"],
  florida: ["florida", ", fl"],
  tampa: ["tampa"],
  london: ["london"],
  remote: ["remote"],
};

const US_CITIES = new Set([
  "new_york", "chicago", "stamford", "austin", "greenwich",
  "boston", "san_francisco", "seattle", "florida", "tampa",
]);

/** Extract normalized location keys for indexing. */
export function extractLocationKeys(rawLocation: string): string[] {
  const loc = rawLocation.toLowerCase();
  const keys: string[] = [];

  for (const [normalized, patterns] of Object.entries(LOCATION_PATTERNS)) {
    if (patterns.some((p) => loc.includes(p))) {
      keys.push(normalized);
    }
  }

  if (keys.some((k) => US_CITIES.has(k))) {
    keys.push("united_states");
  }
  if ((loc.includes("united states") || loc.includes("u.s.")) && !keys.includes("united_states")) {
    keys.push("united_states");
  }

  return keys;
}

/* ── Content Hashing ── */

/** Compute a short content hash for deduplication. */
export function contentHash(title: string, location: string, department: string): string {
  return createHash("sha256")
    .update(`${title}|${location}|${department}`)
    .digest("hex")
    .slice(0, 16);
}

/* ── Relevance Scoring ── */

const ROLE_SCORES: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /data engineer/i, score: 55 },
  { pattern: /software engineer/i, score: 50 },
  { pattern: /machine learning/i, score: 50 },
  { pattern: /quantitative/i, score: 50 },
  { pattern: /data scientist/i, score: 45 },
  { pattern: /research engineer/i, score: 45 },
  { pattern: /python/i, score: 40 },
  { pattern: /engineer/i, score: 30 },
  { pattern: /developer/i, score: 30 },
  { pattern: /analyst/i, score: 25 },
];

const US_LOCATION_TERMS = [
  "new york", "nyc", "chicago", "stamford", "austin",
  "greenwich", "united states", "boston", "san francisco", "seattle",
];

/** Compute a relevance score for a job. Stored in Redis sorted sets. */
export function computeRelevanceScore(title: string, location: string, tags: string[]): number {
  const t = title.toLowerCase();
  const l = location.toLowerCase();
  let score = 0;

  // Best role match (first hit wins)
  for (const rs of ROLE_SCORES) {
    if (rs.pattern.test(t)) {
      score += rs.score;
      break;
    }
  }

  // US location boost
  if (US_LOCATION_TERMS.some((u) => l.includes(u))) score += 20;

  // High-value tag boost
  const highValueTags = new Set(["data", "engineering", "ml", "quantitative"]);
  for (const tag of tags) {
    if (highValueTags.has(tag)) score += 10;
  }

  // Intern penalty
  if (/intern|campus/i.test(t)) score -= 100;

  // Seniority boost
  if (/senior|staff|principal|lead/i.test(t)) score += 5;

  return score;
}

/* ── Redis Key Helpers ── */

function jobHashKey(source: string, jobId: string): string {
  return `jobs:${source}:${jobId}`;
}

function compositeKey(source: string, jobId: string): string {
  return `${source}:${jobId}`;
}

/* ── Single Job Indexing ── */

/**
 * Index a single job into Redis with all pushdown indices.
 *
 * Creates/updates:
 *   - `jobs:{source}:{jobId}` hash
 *   - `idx:company:{source}` set
 *   - `idx:status:active` set
 *   - `idx:tag:{tag}` sets
 *   - `idx:location:{loc}` sets
 *   - `ranked:all` sorted set
 *   - `ranked:company:{source}` sorted set
 *   - `feed:new` sorted set
 *   - `feed:company:{source}` sorted set
 */
export async function indexJob(redis: Redis, job: JobInput): Promise<IndexResult> {
  const ck = compositeKey(job.source, job.jobId);
  const hk = jobHashKey(job.source, job.jobId);
  const now = new Date();
  const nowIso = now.toISOString();
  const nowTs = now.getTime() / 1000;

  const tags = job.tags ?? extractTags(job.title, job.department);
  const hash = contentHash(job.title, job.location, job.department);
  const locationKeys = extractLocationKeys(job.location);
  const score = job.score ?? computeRelevanceScore(job.title, job.location, tags);

  const existingHash = await redis.hget(hk, "content_hash");

  const pipe = redis.pipeline();

  if (existingHash === null) {
    // New job
    const fields: Record<string, string> = {
      job_id: job.jobId,
      company: job.source,
      company_name: job.sourceName,
      title: job.title,
      url: job.url,
      department: job.department,
      location: job.location,
      status: "active",
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      updated_at: nowIso,
      content_hash: hash,
      tags: tags.join(","),
      ...(job.metadata || {}),
    };

    pipe.hset(hk, fields);
    pipe.sadd(`idx:company:${job.source}`, ck);
    pipe.sadd("idx:status:active", ck);
    pipe.zadd("feed:new", nowTs.toString(), ck);
    pipe.zadd(`feed:company:${job.source}`, nowTs.toString(), ck);
    for (const tag of tags) pipe.sadd(`idx:tag:${tag}`, ck);
    for (const locKey of locationKeys) pipe.sadd(`idx:location:${locKey}`, ck);
    pipe.zadd("ranked:all", score.toString(), ck);
    pipe.zadd(`ranked:company:${job.source}`, score.toString(), ck);

    await pipe.exec();
    return { compositeKey: ck, action: "created" };
  }

  if (existingHash !== hash) {
    // Updated job
    pipe.hset(hk, {
      title: job.title,
      url: job.url,
      department: job.department,
      location: job.location,
      status: "active",
      last_seen_at: nowIso,
      updated_at: nowIso,
      content_hash: hash,
      tags: tags.join(","),
      ...(job.metadata || {}),
    });
    for (const tag of tags) pipe.sadd(`idx:tag:${tag}`, ck);
    for (const locKey of locationKeys) pipe.sadd(`idx:location:${locKey}`, ck);
    pipe.zadd("ranked:all", score.toString(), ck);
    pipe.zadd(`ranked:company:${job.source}`, score.toString(), ck);

    await pipe.exec();
    return { compositeKey: ck, action: "updated" };
  }

  // Unchanged — just touch last_seen_at
  await redis.hset(hk, "last_seen_at", nowIso);
  return { compositeKey: ck, action: "unchanged" };
}

/* ── Batch Job Indexing (pipeline-optimized) ── */

/**
 * Index multiple jobs in a single pipeline round-trip.
 * Uses batch content-hash prefetch to eliminate N+1 queries.
 */
export async function indexJobs(redis: Redis, jobs: JobInput[]): Promise<BatchIndexResult> {
  if (jobs.length === 0) {
    return { created: 0, updated: 0, unchanged: 0, results: [] };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const nowTs = now.getTime() / 1000;

  // Phase 1: Batch-prefetch existing content hashes
  const prefetchPipe = redis.pipeline();
  const metas = jobs.map((job) => {
    const ck = compositeKey(job.source, job.jobId);
    const hk = jobHashKey(job.source, job.jobId);
    const tags = job.tags ?? extractTags(job.title, job.department);
    const hash = contentHash(job.title, job.location, job.department);
    const locationKeys = extractLocationKeys(job.location);
    const score = job.score ?? computeRelevanceScore(job.title, job.location, tags);

    prefetchPipe.hget(hk, "content_hash");

    return { job, ck, hk, tags, hash, locationKeys, score };
  });

  const existingHashes = await prefetchPipe.exec();

  // Phase 2: Build write pipeline
  const writePipe = redis.pipeline();
  const results: IndexResult[] = [];
  let created = 0, updated = 0, unchanged = 0;

  for (let i = 0; i < metas.length; i++) {
    const { job, ck, hk, tags, hash, locationKeys, score } = metas[i];
    const [, existingHash] = existingHashes![i] as [Error | null, string | null];

    if (existingHash === null) {
      created++;
      const fields: Record<string, string> = {
        job_id: job.jobId,
        company: job.source,
        company_name: job.sourceName,
        title: job.title,
        url: job.url,
        department: job.department,
        location: job.location,
        status: "active",
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        updated_at: nowIso,
        content_hash: hash,
        tags: tags.join(","),
        ...(job.metadata || {}),
      };

      writePipe.hset(hk, fields);
      writePipe.sadd(`idx:company:${job.source}`, ck);
      writePipe.sadd("idx:status:active", ck);
      writePipe.zadd("feed:new", nowTs.toString(), ck);
      writePipe.zadd(`feed:company:${job.source}`, nowTs.toString(), ck);
      for (const tag of tags) writePipe.sadd(`idx:tag:${tag}`, ck);
      for (const locKey of locationKeys) writePipe.sadd(`idx:location:${locKey}`, ck);
      writePipe.zadd("ranked:all", score.toString(), ck);
      writePipe.zadd(`ranked:company:${job.source}`, score.toString(), ck);

      results.push({ compositeKey: ck, action: "created" });
    } else if (existingHash !== hash) {
      updated++;
      writePipe.hset(hk, {
        title: job.title,
        url: job.url,
        department: job.department,
        location: job.location,
        status: "active",
        last_seen_at: nowIso,
        updated_at: nowIso,
        content_hash: hash,
        tags: tags.join(","),
        ...(job.metadata || {}),
      });
      for (const tag of tags) writePipe.sadd(`idx:tag:${tag}`, ck);
      for (const locKey of locationKeys) writePipe.sadd(`idx:location:${locKey}`, ck);
      writePipe.zadd("ranked:all", score.toString(), ck);
      writePipe.zadd(`ranked:company:${job.source}`, score.toString(), ck);

      results.push({ compositeKey: ck, action: "updated" });
    } else {
      unchanged++;
      writePipe.hset(hk, "last_seen_at", nowIso);
      results.push({ compositeKey: ck, action: "unchanged" });
    }
  }

  await writePipe.exec();

  return { created, updated, unchanged, results };
}

/* ── Job Removal ── */

/**
 * Remove a job from all indices. Marks as removed in hash but does not delete.
 */
export async function removeJob(redis: Redis, source: string, jobId: string): Promise<void> {
  const ck = compositeKey(source, jobId);
  const hk = jobHashKey(source, jobId);

  // Fetch existing tags and location for index cleanup
  const existing = await redis.hgetall(hk);
  if (!existing || !existing.title) return;

  const tags = (existing.tags || "").split(",").filter(Boolean);
  const locationKeys = extractLocationKeys(existing.location || "");

  const pipe = redis.pipeline();

  pipe.hset(hk, "status", "removed");
  pipe.srem("idx:status:active", ck);
  pipe.srem(`idx:company:${source}`, ck);
  pipe.zrem("feed:new", ck);
  pipe.zrem(`feed:company:${source}`, ck);
  pipe.zrem("ranked:all", ck);
  pipe.zrem(`ranked:company:${source}`, ck);
  for (const tag of tags) pipe.srem(`idx:tag:${tag}`, ck);
  for (const locKey of locationKeys) pipe.srem(`idx:location:${locKey}`, ck);

  await pipe.exec();
}

/* ── Job Retrieval ── */

/** Fetch a single job by source + jobId. */
export async function getJob(redis: Redis, source: string, jobId: string): Promise<StoredJob | null> {
  const data = await redis.hgetall(jobHashKey(source, jobId));
  if (!data || !data.title) return null;
  return data as StoredJob;
}

/** Fetch multiple jobs by composite keys using pipeline. */
export async function getJobs(redis: Redis, compositeKeys: string[]): Promise<(StoredJob | null)[]> {
  if (compositeKeys.length === 0) return [];

  const pipe = redis.pipeline();
  for (const ck of compositeKeys) {
    const [source, jobId] = ck.split(":");
    pipe.hgetall(jobHashKey(source, jobId));
  }

  const results = await pipe.exec();
  return (results || []).map(([err, data]) => {
    if (err || !data || !(data as Record<string, string>).title) return null;
    return data as StoredJob;
  });
}

/* ── Index Stats ── */

export interface IndexStats {
  activeJobs: number;
  rankedJobs: number;
  feedSize: number;
  tagCounts: Record<string, number>;
  locationCounts: Record<string, number>;
  companyCounts: Record<string, number>;
}

/** Get cardinalities of all pushdown indices. */
export async function getIndexStats(redis: Redis): Promise<IndexStats> {
  const pipe = redis.pipeline();

  pipe.scard("idx:status:active");
  pipe.zcard("ranked:all");
  pipe.zcard("feed:new");

  const tagKeys = ["data", "engineering", "research", "ml", "quantitative", "trading", "infrastructure", "devops", "analytics", "cloud", "security", "product"];
  for (const tag of tagKeys) pipe.scard(`idx:tag:${tag}`);

  const locKeys = ["new_york", "chicago", "stamford", "austin", "greenwich", "boston", "san_francisco", "seattle", "united_states", "london", "remote"];
  for (const loc of locKeys) pipe.scard(`idx:location:${loc}`);

  const results = await pipe.exec();
  if (!results) return { activeJobs: 0, rankedJobs: 0, feedSize: 0, tagCounts: {}, locationCounts: {}, companyCounts: {} };

  let idx = 0;
  const activeJobs = (results[idx++]![1] as number) || 0;
  const rankedJobs = (results[idx++]![1] as number) || 0;
  const feedSize = (results[idx++]![1] as number) || 0;

  const tagCounts: Record<string, number> = {};
  for (const tag of tagKeys) {
    const count = (results[idx++]![1] as number) || 0;
    if (count > 0) tagCounts[tag] = count;
  }

  const locationCounts: Record<string, number> = {};
  for (const loc of locKeys) {
    const count = (results[idx++]![1] as number) || 0;
    if (count > 0) locationCounts[loc] = count;
  }

  // Company counts require a key scan — skip for now, can be added via SCAN
  return { activeJobs, rankedJobs, feedSize, tagCounts, locationCounts, companyCounts: {} };
}
