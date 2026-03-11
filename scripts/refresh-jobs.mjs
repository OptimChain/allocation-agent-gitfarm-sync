#!/usr/bin/env node
/**
 * Pull fresh jobs from Greenhouse API for all tracked companies and update Redis.
 * Local equivalent of the fetch-jobs-worker-background Netlify function.
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

function contentHash(title, location, dept) {
  return createHash("sha256").update(`${title}|${location}|${dept}`).digest("hex").slice(0, 16);
}

function extractTags(title, dept) {
  const tags = new Set();
  const t = (title + " " + dept).toLowerCase();
  if (t.includes("quant")) tags.add("quantitative");
  if (t.includes("data")) tags.add("data");
  if (t.includes("software") || t.includes("engineer")) tags.add("engineering");
  if (t.includes("research")) tags.add("research");
  if (t.includes("machine learning") || t.includes("ml ") || t.includes("ai ")) tags.add("ml");
  if (t.includes("trad")) tags.add("trading");
  if (t.includes("infra")) tags.add("infrastructure");
  if (t.includes("devops") || t.includes("sre") || t.includes("reliability")) tags.add("devops");
  return tags;
}

function normalizeLocation(loc) {
  return loc.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Extract normalized location keys for pushdown index.
 * "New York, NY" → ["new_york", "ny", "united_states"]
 */
function extractLocationKeys(rawLocation) {
  const loc = rawLocation.toLowerCase();
  const keys = [];
  const patterns = {
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
  for (const [normalized, pats] of Object.entries(patterns)) {
    if (pats.some(p => loc.includes(p))) keys.push(normalized);
  }
  const usCities = ["new_york", "chicago", "stamford", "austin", "greenwich", "florida", "tampa", "boston"];
  if (keys.some(k => usCities.includes(k))) keys.push("united_states");
  if (loc.includes("united states") || loc.includes("u.s.")) {
    if (!keys.includes("united_states")) keys.push("united_states");
  }
  return keys;
}

/**
 * Compute a relevance score for ranked sorted set index.
 * Pushdown scoring: stored in Redis so queries can retrieve pre-ranked results.
 */
function computeRelevanceScore(title, location, tags) {
  const t = title.toLowerCase();
  const l = location.toLowerCase();
  let score = 0;

  // Role signals
  if (t.includes("data engineer")) score += 55;
  else if (t.includes("software engineer")) score += 50;
  else if (t.includes("machine learning")) score += 50;
  else if (t.includes("quantitative")) score += 50;
  else if (t.includes("data scientist")) score += 45;
  else if (t.includes("research engineer")) score += 45;
  else if (t.includes("python")) score += 40;
  else if (t.includes("engineer")) score += 30;
  else if (t.includes("developer")) score += 30;
  else if (t.includes("analyst")) score += 25;

  // Location signals (US preferred)
  const usLocs = ["new york", "nyc", "chicago", "stamford", "austin", "greenwich", "united states"];
  if (usLocs.some(u => l.includes(u))) score += 20;

  // Tag relevance
  for (const tag of tags) {
    if (["data", "engineering", "ml", "quantitative"].includes(tag)) score += 10;
  }

  // Intern penalty
  if (t.includes("intern") || t.includes("campus")) score -= 100;

  // Seniority
  if (t.includes("senior") || t.includes("staff")) score += 5;

  return score;
}

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

    const now = new Date();
    const nowTs = now.getTime() / 1000;
    const nowIso = now.toISOString();
    let newCount = 0, updatedCount = 0, unchangedCount = 0;

    // Phase 1: Batch-fetch existing content hashes using pipeline (eliminates N+1)
    const hashCheckPipe = redis.pipeline();
    const jobMeta = apiJobs.map(job => {
      const jobId = String(job.id);
      const hashKey = `jobs:${boardToken}:${jobId}`;
      hashCheckPipe.hget(hashKey, "content_hash");
      return {
        jobId,
        compositeKey: `${boardToken}:${jobId}`,
        hashKey,
        title: job.title,
        locationRaw: job.location?.name || "Unknown",
        dept: job.departments?.[0]?.name || "General",
        updated: job.updated_at || nowIso,
        absoluteUrl: job.absolute_url,
      };
    });
    const existingHashes = await hashCheckPipe.exec();

    // Phase 2: Build write pipeline with pushdown indices
    const pipe = redis.pipeline();

    for (let i = 0; i < jobMeta.length; i++) {
      const { jobId, compositeKey, hashKey, title, locationRaw, dept, updated, absoluteUrl } = jobMeta[i];
      const hash = contentHash(title, locationRaw, dept);
      const tags = extractTags(title, dept);
      const normLoc = normalizeLocation(locationRaw);
      const locationKeys = extractLocationKeys(locationRaw);
      const tagArr = [...tags].sort();
      const relevanceScore = computeRelevanceScore(title, locationRaw, tagArr);

      const [err, existingHash] = existingHashes[i];

      if (existingHash === null) {
        newCount++;
        pipe.hset(hashKey, {
          job_id: jobId, company: boardToken, company_name: displayName,
          title, url: absoluteUrl, department: dept, location: locationRaw,
          status: "active", first_seen_at: nowIso, last_seen_at: nowIso,
          updated_at: updated, content_hash: hash, tags: tagArr.join(","),
        });
        pipe.sadd(`idx:company:${boardToken}`, compositeKey);
        pipe.sadd("idx:status:active", compositeKey);
        pipe.zadd("feed:new", nowTs.toString(), compositeKey);
        pipe.zadd(`feed:company:${boardToken}`, nowTs.toString(), compositeKey);
        // Pushdown: tag indices
        for (const tag of tags) pipe.sadd(`idx:tag:${tag}`, compositeKey);
        // Pushdown: location indices (NEW - enables location-based set intersection)
        for (const locKey of locationKeys) pipe.sadd(`idx:location:${locKey}`, compositeKey);
        // Pushdown: ranked sorted set (NEW - pre-scored for server-side retrieval)
        pipe.zadd("ranked:all", relevanceScore.toString(), compositeKey);
        pipe.zadd(`ranked:company:${boardToken}`, relevanceScore.toString(), compositeKey);
      } else if (existingHash !== hash) {
        updatedCount++;
        pipe.hset(hashKey, {
          title, url: absoluteUrl, department: dept, location: locationRaw,
          status: "active", last_seen_at: nowIso, updated_at: updated,
          content_hash: hash, tags: tagArr.join(","),
        });
        // Re-index location and score on update
        for (const locKey of locationKeys) pipe.sadd(`idx:location:${locKey}`, compositeKey);
        pipe.zadd("ranked:all", relevanceScore.toString(), compositeKey);
        pipe.zadd(`ranked:company:${boardToken}`, relevanceScore.toString(), compositeKey);
      } else {
        unchangedCount++;
        pipe.hset(hashKey, "last_seen_at", nowIso);
      }
    }

    await pipe.exec();
    await redis.set(`meta:last_fetch:${boardToken}`, nowIso);

    console.log(` ${apiJobs.length} jobs (new=${newCount} updated=${updatedCount} unchanged=${unchangedCount})`);
    totalNew += newCount;
    totalUpdated += updatedCount;
    totalUnchanged += unchangedCount;

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nTotal: new=${totalNew} updated=${totalUpdated} unchanged=${totalUnchanged}`);
  await redis.quit();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
