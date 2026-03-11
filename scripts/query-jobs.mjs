#!/usr/bin/env node
/**
 * Perplexity-Style Pushdown Job Query
 *
 * Pushes filtering to Redis via set intersection and ranked sorted sets.
 * Shares indexing conventions with src/lib/job-index.ts.
 *
 * Usage:
 *   node scripts/query-jobs.mjs "data engineer in new york"
 *   node scripts/query-jobs.mjs --tags=data,engineering --location=new_york
 *   node scripts/query-jobs.mjs --company=point72 --ranked
 *   node scripts/query-jobs.mjs --ranked --limit=20
 *   node scripts/query-jobs.mjs --new
 *   node scripts/query-jobs.mjs --stats
 *
 * Env: REDIS_PASSWORD
 */
import Redis from "ioredis";

const REDIS_URL =
  "redis://default:" +
  (process.env.REDIS_PASSWORD || "") +
  "@redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com:17054";

/* ── Query Decomposition (shared with src/lib/pushdown-query.ts) ── */

const TAG_MAP = {
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

const LOCATION_MAP = {
  "new york": "new_york",
  nyc: "new_york",
  chicago: "chicago",
  stamford: "stamford",
  austin: "austin",
  greenwich: "greenwich",
  boston: "boston",
  "san francisco": "san_francisco",
  seattle: "seattle",
  "united states": "united_states",
  remote: "remote",
};

function decomposeNaturalQuery(q) {
  q = q.toLowerCase().trim();
  const facets = [];

  const matchedTags = new Set();
  for (const [pattern, tags] of Object.entries(TAG_MAP)) {
    if (q.includes(pattern)) tags.forEach((t) => matchedTags.add(t));
  }
  if (matchedTags.size > 0) {
    facets.push({ index: "idx:tag", values: [...matchedTags] });
  }

  const matchedLocs = new Set();
  for (const [pattern, normalized] of Object.entries(LOCATION_MAP)) {
    if (q.includes(pattern)) matchedLocs.add(normalized);
  }
  if (matchedLocs.size > 0) {
    facets.push({ index: "idx:location", values: [...matchedLocs] });
  }

  facets.push({ index: "idx:status", values: ["active"] });

  return { facets, excludePatterns: [/intern/i, /campus/i] };
}

/* ── Pushdown Execution ── */

async function executePushdown(redis, facets, excludePatterns = [], limit = 50) {
  if (facets.length === 0) return [];

  // Phase 1: Resolve facets — OR within, AND across
  const tempKeys = [];
  const facetKeys = [];
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
  let compositeKeys;
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
    const [bt, jid] = ck.split(":");
    fetchPipe.hgetall(`jobs:${bt}:${jid}`);
  }
  const results = await fetchPipe.exec();

  // Phase 4: Score and rank
  const jobs = [];
  for (let i = 0; i < compositeKeys.length; i++) {
    const [err, data] = results[i];
    if (err || !data || !data.title) continue;
    const titleLower = data.title.toLowerCase();
    if (excludePatterns.some((p) => p.test(titleLower))) continue;

    let score = 0;
    if (/data engineer/i.test(titleLower)) score += 55;
    else if (/software engineer/i.test(titleLower)) score += 50;
    else if (/machine learning/i.test(titleLower)) score += 50;
    else if (/quantitative/i.test(titleLower)) score += 50;
    else if (/data scientist/i.test(titleLower)) score += 45;
    else if (/research engineer/i.test(titleLower)) score += 45;
    else if (/python/i.test(titleLower)) score += 40;
    else if (/engineer/i.test(titleLower)) score += 30;

    const loc = (data.location || "").toLowerCase();
    if (["new york", "chicago", "stamford", "boston", "san francisco"].some((u) => loc.includes(u))) score += 20;
    if (/senior|staff|principal/i.test(titleLower)) score += 5;

    const [bt, jid] = compositeKeys[i].split(":");
    jobs.push({
      compositeKey: compositeKeys[i],
      boardToken: bt,
      jobId: jid,
      title: data.title,
      location: data.location || "",
      companyName: data.company_name || bt,
      tags: data.tags || "",
      url: data.url || "",
      score,
    });
  }

  jobs.sort((a, b) => b.score - a.score);
  return jobs.slice(0, limit);
}

/* ── Ranked Retrieval (pre-scored sorted set) ── */

async function getRankedJobs(redis, company, limit = 50) {
  const key = company ? `ranked:company:${company}` : "ranked:all";
  const keysWithScores = await redis.zrevrange(key, 0, limit - 1, "WITHSCORES");
  if (keysWithScores.length === 0) return [];

  const entries = [];
  for (let i = 0; i < keysWithScores.length; i += 2) {
    entries.push({ compositeKey: keysWithScores[i], score: parseFloat(keysWithScores[i + 1]) });
  }

  const pipe = redis.pipeline();
  for (const e of entries) {
    const [bt, jid] = e.compositeKey.split(":");
    pipe.hgetall(`jobs:${bt}:${jid}`);
  }
  const results = await pipe.exec();

  const jobs = [];
  for (let i = 0; i < entries.length; i++) {
    const [err, data] = results[i];
    if (err || !data || !data.title) continue;
    if (/intern|campus/i.test(data.title)) continue;

    const [bt, jid] = entries[i].compositeKey.split(":");
    jobs.push({
      boardToken: bt, jobId: jid,
      title: data.title, location: data.location || "",
      companyName: data.company_name || bt, tags: data.tags || "",
      score: entries[i].score,
    });
  }
  return jobs;
}

/* ── Newest Jobs ── */

async function getNewestJobs(redis, limit = 30) {
  const keysWithScores = await redis.zrevrange("feed:new", 0, limit - 1, "WITHSCORES");
  if (keysWithScores.length === 0) return [];

  const entries = [];
  for (let i = 0; i < keysWithScores.length; i += 2) {
    entries.push({ compositeKey: keysWithScores[i], timestamp: parseFloat(keysWithScores[i + 1]) });
  }

  const pipe = redis.pipeline();
  for (const e of entries) {
    const [bt, jid] = e.compositeKey.split(":");
    pipe.hgetall(`jobs:${bt}:${jid}`);
  }
  const results = await pipe.exec();

  const jobs = [];
  for (let i = 0; i < entries.length; i++) {
    const [err, data] = results[i];
    if (err || !data || !data.title) continue;
    const [bt, jid] = entries[i].compositeKey.split(":");
    jobs.push({
      boardToken: bt, jobId: jid,
      title: data.title, location: data.location || "",
      companyName: data.company_name || bt, tags: data.tags || "",
      firstSeen: data.first_seen_at || "",
      timestamp: new Date(entries[i].timestamp * 1000).toISOString(),
    });
  }
  return jobs;
}

/* ── Index Stats ── */

async function printIndexStats(redis) {
  console.log("=== Pushdown Index Stats ===\n");

  const tagKeys = ["data", "engineering", "research", "ml", "quantitative", "trading", "infrastructure", "devops", "analytics", "cloud", "security", "product"];
  console.log("Tag Indices:");
  for (const tag of tagKeys) {
    const count = await redis.scard(`idx:tag:${tag}`);
    if (count > 0) console.log(`  idx:tag:${tag} → ${count} jobs`);
  }

  console.log("\nLocation Indices:");
  const locKeys = ["new_york", "chicago", "stamford", "austin", "greenwich", "boston", "san_francisco", "seattle", "united_states", "london", "remote"];
  for (const loc of locKeys) {
    const count = await redis.scard(`idx:location:${loc}`);
    if (count > 0) console.log(`  idx:location:${loc} → ${count} jobs`);
  }

  const rankedCount = await redis.zcard("ranked:all");
  console.log(`\nRanked Index: ${rankedCount} jobs scored`);
  const feedCount = await redis.zcard("feed:new");
  console.log(`Feed Index: ${feedCount} jobs tracked`);
  const activeCount = await redis.scard("idx:status:active");
  console.log(`Active Jobs: ${activeCount}`);
  console.log();
}

/* ── CLI ── */

async function main() {
  const args = process.argv.slice(2);
  const redis = new Redis(REDIS_URL);
  await redis.ping();

  const flags = {};
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      flags[key] = val || true;
    } else {
      positional.push(arg);
    }
  }

  if (flags.stats) {
    await printIndexStats(redis);
    await redis.quit();
    return;
  }

  if (flags.ranked) {
    const company = flags.company || null;
    const limit = parseInt(flags.limit || "30", 10);
    console.log(`\nTop ${limit} Ranked Jobs${company ? ` (${company})` : ""}\n`);
    const jobs = await getRankedJobs(redis, company, limit);
    for (const j of jobs) {
      console.log(`  [${String(j.score).padStart(3)}] ${j.companyName.padEnd(22)} ${j.title} [${j.location}]`);
    }
    console.log(`\n${jobs.length} results`);
    await redis.quit();
    return;
  }

  if (flags.new) {
    const limit = parseInt(flags.limit || "30", 10);
    console.log(`\nNewest ${limit} Jobs\n`);
    const jobs = await getNewestJobs(redis, limit);
    for (const j of jobs) {
      console.log(`  ${j.companyName.padEnd(22)} ${j.title} [${j.location}] (${j.timestamp})`);
    }
    console.log(`\n${jobs.length} results`);
    await redis.quit();
    return;
  }

  if (flags.tags || flags.location || flags.company) {
    const facets = [];
    if (flags.tags) facets.push({ index: "idx:tag", values: flags.tags.split(",") });
    if (flags.location) facets.push({ index: "idx:location", values: flags.location.split(",") });
    if (flags.company) facets.push({ index: "idx:company", values: flags.company.split(",") });
    facets.push({ index: "idx:status", values: ["active"] });

    const minScore = parseInt(flags["min-score"] || "0", 10);
    const limit = parseInt(flags.limit || "50", 10);
    const excludePatterns = flags["include-interns"] ? [] : [/intern/i, /campus/i];

    console.log(`\nPushdown Query: ${facets.map(f => `${f.index}=[${f.values}]`).join(" AND ")}\n`);
    const jobs = await executePushdown(redis, facets, excludePatterns, limit);
    const filtered = minScore > 0 ? jobs.filter(j => j.score >= minScore) : jobs;

    for (const j of filtered) {
      console.log(`  [${String(j.score).padStart(3)}] ${j.companyName.padEnd(22)} ${j.title} [${j.location}] {${j.tags}}`);
    }
    console.log(`\n${filtered.length} results`);
    await redis.quit();
    return;
  }

  // Natural language query
  const query = positional.join(" ");
  if (!query) {
    console.log(`
Usage:
  node scripts/query-jobs.mjs "data engineer in new york"    # Natural language
  node scripts/query-jobs.mjs --tags=data,ml --location=new_york
  node scripts/query-jobs.mjs --ranked                        # Pre-scored top jobs
  node scripts/query-jobs.mjs --new                           # Newest jobs
  node scripts/query-jobs.mjs --stats                         # Index statistics
  node scripts/query-jobs.mjs --company=point72 --ranked      # Company-specific
`);
    await redis.quit();
    return;
  }

  console.log(`\nPerplexity-style query: "${query}"\n`);
  const decomposed = decomposeNaturalQuery(query);
  console.log(`  Decomposed into ${decomposed.facets.length} facets:`);
  for (const f of decomposed.facets) {
    console.log(`    ${f.index} → [${f.values.join(", ")}]`);
  }
  console.log();

  const jobs = await executePushdown(redis, decomposed.facets, decomposed.excludePatterns);

  if (jobs.length === 0) {
    console.log("  No matching jobs found. Try broader terms or check --stats for available indices.");
  } else {
    for (const j of jobs) {
      console.log(`  [${String(j.score).padStart(3)}] ${j.companyName.padEnd(22)} ${j.title}`);
      console.log(`        ${j.location} {${j.tags}}`);
    }
    console.log(`\n${jobs.length} results`);
  }

  await redis.quit();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
