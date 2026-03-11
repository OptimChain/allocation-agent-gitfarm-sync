/**
 * Perplexity-Style Pushdown Query Engine
 *
 * Pushes filtering to Redis using set intersection (SINTER), sorted set
 * scoring, pipeline batch reads, and query decomposition.
 *
 * Indexing primitives (tags, locations, scoring, hashing) are provided by
 * job-index.ts — this module handles the query side.
 */
import type Redis from "ioredis";
import { extractLocationKeys, extractTags, computeRelevanceScore } from "./job-index.js";

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
  /** Sort order: "score" or "recency" */
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

const TAG_MAP: Record<string, string[]> = {
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
  analytics: ["analytics"],
  cloud: ["cloud"],
  security: ["security"],
};

const LOCATION_MAP: Record<string, string> = {
  "new york": "new_york",
  nyc: "new_york",
  ny: "new_york",
  chicago: "chicago",
  stamford: "stamford",
  austin: "austin",
  greenwich: "greenwich",
  boston: "boston",
  "san francisco": "san_francisco",
  seattle: "seattle",
  "united states": "united_states",
  us: "united_states",
  remote: "remote",
  florida: "florida",
  tampa: "tampa",
};

/**
 * Decompose a natural language query into faceted sub-queries.
 * "senior data engineer in new york" →
 *   { tags: ["data", "engineering"], locations: ["new_york"], status: ["active"] }
 */
export function decomposeQuery(naturalQuery: string): PushdownQuery {
  const q = naturalQuery.toLowerCase().trim();
  const facets: QueryFacet[] = [];

  const matchedTags = new Set<string>();
  for (const [pattern, tags] of Object.entries(TAG_MAP)) {
    if (q.includes(pattern)) {
      tags.forEach((t) => matchedTags.add(t));
    }
  }
  if (matchedTags.size > 0) {
    facets.push({ index: "idx:tag", values: [...matchedTags] });
  }

  const matchedLocations = new Set<string>();
  for (const [pattern, normalized] of Object.entries(LOCATION_MAP)) {
    if (q.includes(pattern)) {
      matchedLocations.add(normalized);
    }
  }
  if (matchedLocations.size > 0) {
    facets.push({ index: "idx:location", values: [...matchedLocations] });
  }

  facets.push({ index: "idx:status", values: ["active"] });

  const excludePatterns: RegExp[] = [];
  if (!q.includes("intern")) excludePatterns.push(/intern/i);
  if (!q.includes("campus")) excludePatterns.push(/campus/i);

  return { facets, excludePatterns, limit: 50, sortBy: "score" };
}

/* ── Pushdown Execution ── */

/**
 * Execute a faceted query using Redis set operations.
 * Each facet: OR its values (SUNION). Then AND all facets (SINTER).
 */
export async function executePushdownQuery(
  redis: Redis,
  query: PushdownQuery
): Promise<RankedJob[]> {
  const { facets, excludePatterns = [], minScore = 0, limit = 50, sortBy = "score" } = query;

  if (facets.length === 0) return [];

  // Phase 1: Resolve facets
  const tempKeys: string[] = [];
  const facetKeys: string[] = [];
  const pipe = redis.pipeline();

  for (let i = 0; i < facets.length; i++) {
    const facet = facets[i];
    const memberKeys = facet.values.map((v) => `${facet.index}:${v}`);

    if (memberKeys.length === 1) {
      facetKeys.push(memberKeys[0]);
    } else {
      const tempKey = `_tmp:query:${Date.now()}:${i}`;
      tempKeys.push(tempKey);
      facetKeys.push(tempKey);
      pipe.sunionstore(tempKey, ...memberKeys);
      pipe.expire(tempKey, 30);
    }
  }

  if (tempKeys.length > 0) await pipe.exec();

  // Phase 2: SINTER
  let compositeKeys: string[];
  if (facetKeys.length === 1) {
    compositeKeys = await redis.smembers(facetKeys[0]);
  } else {
    compositeKeys = await redis.sinter(...facetKeys);
  }

  if (tempKeys.length > 0) await redis.del(...tempKeys);
  if (compositeKeys.length === 0) return [];

  // Phase 3: Batch-fetch
  const fetchPipe = redis.pipeline();
  for (const ck of compositeKeys) {
    const [boardToken, jobId] = ck.split(":");
    fetchPipe.hgetall(`jobs:${boardToken}:${jobId}`);
  }

  const results = await fetchPipe.exec();
  if (!results) return [];

  // Phase 4: Score and filter
  const ranked: RankedJob[] = [];

  for (let i = 0; i < compositeKeys.length; i++) {
    const [err, data] = results[i] as [Error | null, Record<string, string>];
    if (err || !data || !data.title) continue;

    const titleLower = data.title.toLowerCase();
    if (excludePatterns.some((p) => p.test(titleLower))) continue;

    const tags = (data.tags || "").split(",").filter(Boolean);
    let score = 0;
    const matchedFacets: string[] = [];

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

    // Title boosting
    score += computeRelevanceScore(data.title, data.location || "", tags);

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

/* ── Multi-Query Fan-Out ── */

/**
 * Fan out sub-queries in parallel, deduplicate, and re-rank.
 */
export async function fanOutQuery(
  redis: Redis,
  subQueries: PushdownQuery[],
  limit: number = 50
): Promise<RankedJob[]> {
  const allResults = await Promise.all(
    subQueries.map((q) => executePushdownQuery(redis, q))
  );

  const seen = new Map<string, RankedJob>();
  for (const results of allResults) {
    for (const job of results) {
      const existing = seen.get(job.compositeKey);
      if (!existing || job.score > existing.score) {
        seen.set(job.compositeKey, job);
      }
    }
  }

  const merged = [...seen.values()];
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, limit);
}

/* ── Re-exports from job-index for convenience ── */
export { extractLocationKeys, extractTags, computeRelevanceScore } from "./job-index.js";
