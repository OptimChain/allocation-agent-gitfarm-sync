/**
 * Perplexity-Style Pushdown Query Engine
 *
 * Inspired by how Perplexity AI decomposes search queries into parallel
 * sub-retrieval tasks, fans them out across indices, and merges ranked results.
 *
 * Instead of pulling all jobs into JS memory and filtering client-side,
 * this module pushes filtering to Redis using:
 *   1. Set intersection (SINTER) for compound filters (tag + location + status)
 *   2. Sorted set scoring for ranked retrieval
 *   3. Pipeline batch reads for efficient hash fetches
 *   4. Query decomposition — break "data engineer in NYC" into sub-queries
 */
import type Redis from "ioredis";

/* ── Types ── */

export interface QueryFacet {
  /** Index key prefix, e.g. "idx:tag", "idx:location", "idx:company" */
  index: string;
  /** Values to OR within this facet, e.g. ["data", "engineering"] */
  values: string[];
}

export interface PushdownQuery {
  /** Facets are AND-ed together; values within a facet are OR-ed */
  facets: QueryFacet[];
  /** Exclude composite keys matching these patterns */
  excludePatterns?: RegExp[];
  /** Min score threshold for ranked results (default 0) */
  minScore?: number;
  /** Max results to return (default 50) */
  limit?: number;
  /** Sort order: "score" (from sorted set) or "recency" (from feed) */
  sortBy?: "score" | "recency";
}

export interface RankedJob {
  compositeKey: string;
  boardToken: string;
  jobId: string;
  title: string;
  location: string;
  department: string;
  company: string;
  companyName: string;
  tags: string[];
  url: string;
  score: number;
  matchedFacets: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

/* ── Query Decomposition ── */

/**
 * Decompose a natural language query into faceted sub-queries.
 * Perplexity-style: break "senior data engineer in new york" into
 *   { tags: ["data", "engineering"], locations: ["new_york"], levels: ["senior"] }
 */
export function decomposeQuery(naturalQuery: string): PushdownQuery {
  const q = naturalQuery.toLowerCase().trim();
  const facets: QueryFacet[] = [];
  const words = q.split(/\s+/);

  // Tag extraction
  const tagMap: Record<string, string[]> = {
    data: ["data"],
    engineer: ["engineering"],
    software: ["engineering"],
    quant: ["quantitative", "trading"],
    quantitative: ["quantitative"],
    research: ["research"],
    ml: ["ml"],
    "machine learning": ["ml"],
    trading: ["trading"],
    infrastructure: ["infrastructure"],
    devops: ["devops"],
    platform: ["infrastructure"],
    backend: ["engineering"],
    scientist: ["data", "research"],
  };

  const matchedTags = new Set<string>();
  // Check multi-word patterns first
  for (const [pattern, tags] of Object.entries(tagMap)) {
    if (q.includes(pattern)) {
      tags.forEach((t) => matchedTags.add(t));
    }
  }

  if (matchedTags.size > 0) {
    facets.push({ index: "idx:tag", values: [...matchedTags] });
  }

  // Location extraction
  const locationMap: Record<string, string> = {
    "new york": "new_york",
    nyc: "new_york",
    ny: "new_york",
    chicago: "chicago",
    stamford: "stamford",
    austin: "austin",
    greenwich: "greenwich",
    "united states": "united_states",
    us: "united_states",
    remote: "remote",
    florida: "florida",
    tampa: "tampa",
  };

  const matchedLocations = new Set<string>();
  for (const [pattern, normalized] of Object.entries(locationMap)) {
    if (q.includes(pattern)) {
      matchedLocations.add(normalized);
    }
  }

  if (matchedLocations.size > 0) {
    facets.push({ index: "idx:location", values: [...matchedLocations] });
  }

  // Always filter to active jobs
  facets.push({ index: "idx:status", values: ["active"] });

  // Exclude patterns
  const excludePatterns: RegExp[] = [];
  if (!q.includes("intern")) {
    excludePatterns.push(/intern/i);
  }
  if (!q.includes("campus")) {
    excludePatterns.push(/campus/i);
  }

  return {
    facets,
    excludePatterns,
    limit: 50,
    sortBy: "score",
  };
}

/* ── Pushdown Execution ── */

/**
 * Execute a faceted query using Redis set operations.
 * Each facet is resolved by OR-ing its values (SUNION),
 * then all facets are AND-ed together (SINTER).
 */
export async function executePushdownQuery(
  redis: Redis,
  query: PushdownQuery
): Promise<RankedJob[]> {
  const { facets, excludePatterns = [], minScore = 0, limit = 50, sortBy = "score" } = query;

  if (facets.length === 0) {
    return [];
  }

  // Phase 1: Resolve each facet to a set of composite keys
  // Use temp keys for OR-ed facet values, cleaned up after
  const tempKeys: string[] = [];
  const facetKeys: string[] = [];

  const pipe = redis.pipeline();

  for (let i = 0; i < facets.length; i++) {
    const facet = facets[i];
    const memberKeys = facet.values.map((v) => `${facet.index}:${v}`);

    if (memberKeys.length === 1) {
      // Single value — use the index key directly
      facetKeys.push(memberKeys[0]);
    } else {
      // Multiple values — SUNION into a temp key
      const tempKey = `_tmp:query:${Date.now()}:${i}`;
      tempKeys.push(tempKey);
      facetKeys.push(tempKey);
      pipe.sunionstore(tempKey, ...memberKeys);
      pipe.expire(tempKey, 30); // auto-cleanup
    }
  }

  if (tempKeys.length > 0) {
    await pipe.exec();
  }

  // Phase 2: SINTER all facet keys to get matching composite keys
  let compositeKeys: string[];
  if (facetKeys.length === 1) {
    compositeKeys = await redis.smembers(facetKeys[0]);
  } else {
    compositeKeys = await redis.sinter(...facetKeys);
  }

  // Cleanup temp keys
  if (tempKeys.length > 0) {
    await redis.del(...tempKeys);
  }

  if (compositeKeys.length === 0) {
    return [];
  }

  // Phase 3: Batch-fetch job hashes using pipeline
  const fetchPipe = redis.pipeline();
  for (const ck of compositeKeys) {
    const [boardToken, jobId] = ck.split(":");
    fetchPipe.hgetall(`jobs:${boardToken}:${jobId}`);
  }

  const results = await fetchPipe.exec();
  if (!results) return [];

  // Phase 4: Build ranked results with scoring
  const ranked: RankedJob[] = [];

  for (let i = 0; i < compositeKeys.length; i++) {
    const [err, data] = results[i] as [Error | null, Record<string, string>];
    if (err || !data || !data.title) continue;

    const title = data.title || "";
    const titleLower = title.toLowerCase();

    // Apply exclude patterns
    if (excludePatterns.some((p) => p.test(titleLower))) continue;

    // Compute score based on matched facets
    let score = 0;
    const matchedFacets: string[] = [];
    const tags = (data.tags || "").split(",").filter(Boolean);

    // Tag relevance score
    for (const facet of facets) {
      if (facet.index === "idx:tag") {
        const tagMatches = facet.values.filter((v) => tags.includes(v));
        score += tagMatches.length * 20;
        matchedFacets.push(...tagMatches.map((t) => `tag:${t}`));
      }
      if (facet.index === "idx:location") {
        score += 15;
        matchedFacets.push("location:match");
      }
    }

    // Title keyword boosting (Perplexity-style relevance signal)
    if (titleLower.includes("data engineer")) score += 25;
    if (titleLower.includes("software engineer")) score += 20;
    if (titleLower.includes("machine learning")) score += 20;
    if (titleLower.includes("quantitative")) score += 20;
    if (titleLower.includes("python")) score += 15;
    if (titleLower.includes("senior") || titleLower.includes("staff")) score += 5;
    if (titleLower.includes("lead") || titleLower.includes("principal")) score += 5;

    if (score < minScore) continue;

    const [boardToken, jobId] = compositeKeys[i].split(":");
    ranked.push({
      compositeKey: compositeKeys[i],
      boardToken,
      jobId,
      title: data.title,
      location: data.location || "",
      department: data.department || "",
      company: data.company || boardToken,
      companyName: data.company_name || boardToken,
      tags,
      url: data.url || "",
      score,
      matchedFacets,
      firstSeenAt: data.first_seen_at || "",
      lastSeenAt: data.last_seen_at || "",
    });
  }

  // Phase 5: Sort and limit
  if (sortBy === "recency") {
    ranked.sort((a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime());
  } else {
    ranked.sort((a, b) => b.score - a.score);
  }

  return ranked.slice(0, limit);
}

/* ── Convenience: Multi-Query Fan-Out ── */

/**
 * Fan out multiple sub-queries in parallel and merge results.
 * Perplexity-style: decompose a broad search into focused sub-queries,
 * retrieve each independently, then deduplicate and re-rank the union.
 */
export async function fanOutQuery(
  redis: Redis,
  subQueries: PushdownQuery[],
  limit: number = 50
): Promise<RankedJob[]> {
  const allResults = await Promise.all(
    subQueries.map((q) => executePushdownQuery(redis, q))
  );

  // Deduplicate by composite key, keeping highest score
  const seen = new Map<string, RankedJob>();
  for (const results of allResults) {
    for (const job of results) {
      const existing = seen.get(job.compositeKey);
      if (!existing || job.score > existing.score) {
        seen.set(job.compositeKey, job);
      }
    }
  }

  // Re-rank the merged set
  const merged = [...seen.values()];
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, limit);
}

/* ── Index Management Helpers ── */

/**
 * Build a location index key from a raw location string.
 * E.g., "New York, NY" → ["new_york", "ny", "united_states"]
 */
export function extractLocationKeys(rawLocation: string): string[] {
  const loc = rawLocation.toLowerCase();
  const keys: string[] = [];

  const locationPatterns: Record<string, string[]> = {
    new_york: ["new york", "nyc", ", ny"],
    chicago: ["chicago", ", il"],
    stamford: ["stamford", ", ct"],
    austin: ["austin", ", tx"],
    greenwich: ["greenwich"],
    florida: ["florida", ", fl"],
    tampa: ["tampa"],
    boston: ["boston", ", ma"],
    london: ["london"],
    remote: ["remote"],
  };

  for (const [normalized, patterns] of Object.entries(locationPatterns)) {
    if (patterns.some((p) => loc.includes(p))) {
      keys.push(normalized);
    }
  }

  // If any US city matched, also add united_states
  const usCities = ["new_york", "chicago", "stamford", "austin", "greenwich", "florida", "tampa", "boston"];
  if (keys.some((k) => usCities.includes(k))) {
    keys.push("united_states");
  }

  // Explicit US mentions
  if (loc.includes("united states") || loc.includes("u.s.")) {
    if (!keys.includes("united_states")) keys.push("united_states");
  }

  return keys;
}

/**
 * Compute a relevance score for a job based on candidate profile.
 * Can be stored in a Redis sorted set for server-side ranked retrieval.
 */
export function computeRelevanceScore(
  title: string,
  location: string,
  tags: string[],
  targetRoles: string[],
  targetLocations: string[]
): number {
  const titleLower = title.toLowerCase();
  const locLower = location.toLowerCase();
  let score = 0;

  // Role matching
  for (const role of targetRoles) {
    if (titleLower.includes(role)) {
      score += 30;
      break; // Only count best role match
    }
  }

  // Location matching
  for (const loc of targetLocations) {
    if (locLower.includes(loc)) {
      score += 20;
      break;
    }
  }

  // Tag relevance
  const highValueTags = ["data", "engineering", "ml", "quantitative"];
  for (const tag of tags) {
    if (highValueTags.includes(tag)) score += 10;
  }

  // Intern penalty
  if (titleLower.includes("intern") || titleLower.includes("campus")) {
    score -= 100;
  }

  // Seniority boost
  if (titleLower.includes("senior") || titleLower.includes("staff")) {
    score += 5;
  }

  return score;
}
