#!/usr/bin/env node
/**
 * Pull fresh jobs from Greenhouse API for all tracked companies and update Redis.
 *
 * Uses the job-index library patterns for consistent indexing across all sources.
 *
 * Usage: REDIS_PASSWORD=... node scripts/refresh-jobs.mjs [company]
 */
import Redis from "ioredis";
import { createHash } from "crypto";

const REDIS_URL = "redis://default:" + (process.env.REDIS_PASSWORD || "") + "@redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com:17054";

const companies = [
  { boardToken: "clearstreet", displayName: "Clear Street" },
  { boardToken: "aquaticcapitalmanagement", displayName: "Aquatic Capital" },
  { boardToken: "gravitonresearchcapital", displayName: "Graviton Research" },
  { boardToken: "drweng", displayName: "DRW" },
  { boardToken: "oldmissioncapital", displayName: "Old Mission Capital" },
  { boardToken: "imc", displayName: "IMC Trading" },
  { boardToken: "jumptrading", displayName: "Jump Trading" },
  { boardToken: "point72", displayName: "Point72" },
  { boardToken: "janestreet", displayName: "Jane Street" },
  { boardToken: "twosigma", displayName: "Two Sigma" },
  { boardToken: "citabortsecurities", displayName: "Citadel Securities" },
  { boardToken: "deshaw", displayName: "D.E. Shaw" },
  { boardToken: "sig", displayName: "Susquehanna (SIG)" },
  { boardToken: "wolverine", displayName: "Wolverine Trading" },
  { boardToken: "radixtrading", displayName: "Radix Trading" },
  { boardToken: "aqr", displayName: "AQR Capital" },
  { boardToken: "millenniumadvisors", displayName: "Millennium" },
];

/* ── Shared logic from src/lib/job-index.ts (inlined for .mjs compat) ── */

const TAG_RULES = [
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

function extractTags(title, dept) {
  const text = `${title} ${dept}`.toLowerCase();
  const tags = new Set();
  for (const rule of TAG_RULES) {
    if (rule.pattern.test(text)) tags.add(rule.tag);
  }
  return [...tags].sort();
}

const LOCATION_PATTERNS = {
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

function extractLocationKeys(rawLocation) {
  const loc = rawLocation.toLowerCase();
  const keys = [];
  for (const [normalized, patterns] of Object.entries(LOCATION_PATTERNS)) {
    if (patterns.some(p => loc.includes(p))) keys.push(normalized);
  }
  if (keys.some(k => US_CITIES.has(k))) keys.push("united_states");
  if ((loc.includes("united states") || loc.includes("u.s.")) && !keys.includes("united_states")) {
    keys.push("united_states");
  }
  return keys;
}

function contentHash(title, location, dept) {
  return createHash("sha256").update(`${title}|${location}|${dept}`).digest("hex").slice(0, 16);
}

const ROLE_SCORES = [
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

function computeRelevanceScore(title, location, tags) {
  const t = title.toLowerCase();
  const l = location.toLowerCase();
  let score = 0;

  for (const rs of ROLE_SCORES) {
    if (rs.pattern.test(t)) { score += rs.score; break; }
  }

  const usLocs = ["new york", "nyc", "chicago", "stamford", "austin", "greenwich", "united states", "boston", "san francisco", "seattle"];
  if (usLocs.some(u => l.includes(u))) score += 20;

  const highValue = new Set(["data", "engineering", "ml", "quantitative"]);
  for (const tag of tags) {
    if (highValue.has(tag)) score += 10;
  }

  if (/intern|campus/i.test(t)) score -= 100;
  if (/senior|staff|principal|lead/i.test(t)) score += 5;

  return score;
}

/* ── Batch indexing (mirrors job-index.ts indexJobs) ── */

async function indexJobsBatch(redis, source, sourceName, apiJobs) {
  const now = new Date();
  const nowIso = now.toISOString();
  const nowTs = now.getTime() / 1000;

  // Phase 1: Batch-prefetch existing content hashes (eliminates N+1)
  const prefetchPipe = redis.pipeline();
  const metas = apiJobs.map(job => {
    const jobId = String(job.id);
    const hk = `jobs:${source}:${jobId}`;
    const ck = `${source}:${jobId}`;
    const title = job.title;
    const location = job.location?.name || "Unknown";
    const dept = job.departments?.[0]?.name || "General";
    const tags = extractTags(title, dept);
    const hash = contentHash(title, location, dept);
    const locationKeys = extractLocationKeys(location);
    const score = computeRelevanceScore(title, location, tags);

    prefetchPipe.hget(hk, "content_hash");

    return { jobId, ck, hk, title, location, dept, tags, hash, locationKeys, score, url: job.absolute_url, updated: job.updated_at || nowIso };
  });

  const existingHashes = await prefetchPipe.exec();

  // Phase 2: Build write pipeline
  const writePipe = redis.pipeline();
  let created = 0, updated = 0, unchanged = 0;

  for (let i = 0; i < metas.length; i++) {
    const m = metas[i];
    const [, existingHash] = existingHashes[i];

    if (existingHash === null) {
      created++;
      writePipe.hset(m.hk, {
        job_id: m.jobId, company: source, company_name: sourceName,
        title: m.title, url: m.url, department: m.dept, location: m.location,
        status: "active", first_seen_at: nowIso, last_seen_at: nowIso,
        updated_at: m.updated, content_hash: m.hash, tags: m.tags.join(","),
      });
      writePipe.sadd(`idx:company:${source}`, m.ck);
      writePipe.sadd("idx:status:active", m.ck);
      writePipe.zadd("feed:new", nowTs.toString(), m.ck);
      writePipe.zadd(`feed:company:${source}`, nowTs.toString(), m.ck);
      for (const tag of m.tags) writePipe.sadd(`idx:tag:${tag}`, m.ck);
      for (const locKey of m.locationKeys) writePipe.sadd(`idx:location:${locKey}`, m.ck);
      writePipe.zadd("ranked:all", m.score.toString(), m.ck);
      writePipe.zadd(`ranked:company:${source}`, m.score.toString(), m.ck);
    } else if (existingHash !== m.hash) {
      updated++;
      writePipe.hset(m.hk, {
        title: m.title, url: m.url, department: m.dept, location: m.location,
        status: "active", last_seen_at: nowIso, updated_at: m.updated,
        content_hash: m.hash, tags: m.tags.join(","),
      });
      for (const tag of m.tags) writePipe.sadd(`idx:tag:${tag}`, m.ck);
      for (const locKey of m.locationKeys) writePipe.sadd(`idx:location:${locKey}`, m.ck);
      writePipe.zadd("ranked:all", m.score.toString(), m.ck);
      writePipe.zadd(`ranked:company:${source}`, m.score.toString(), m.ck);
    } else {
      unchanged++;
      writePipe.hset(m.hk, "last_seen_at", nowIso);
    }
  }

  await writePipe.exec();
  return { created, updated, unchanged };
}

/* ── Greenhouse API ── */

async function fetchGreenhouseJobs(boardToken) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || [];
  } catch {
    return [];
  }
}

/* ── Main ── */

async function main() {
  const targetCompany = process.argv[2] || null;
  const redis = new Redis(REDIS_URL);
  await redis.ping();

  const toProcess = targetCompany
    ? companies.filter(c => c.boardToken === targetCompany)
    : companies;

  let totalNew = 0, totalUpdated = 0, totalUnchanged = 0;

  for (const company of toProcess) {
    const { boardToken, displayName } = company;
    process.stdout.write(`${displayName} (${boardToken})...`);

    const apiJobs = await fetchGreenhouseJobs(boardToken);
    if (apiJobs.length === 0) {
      console.log(" 0 jobs (skipped)");
      continue;
    }

    const { created, updated, unchanged } = await indexJobsBatch(redis, boardToken, displayName, apiJobs);

    await redis.set(`meta:last_fetch:${boardToken}`, new Date().toISOString());

    console.log(` ${apiJobs.length} jobs (new=${created} updated=${updated} unchanged=${unchanged})`);
    totalNew += created;
    totalUpdated += updated;
    totalUnchanged += unchanged;

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nTotal: new=${totalNew} updated=${totalUpdated} unchanged=${totalUnchanged}`);
  await redis.quit();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
