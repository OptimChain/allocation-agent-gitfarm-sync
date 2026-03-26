#!/usr/bin/env node
/**
 * Batch Apply - Evan Lee's March 2026 AI Startup Generalist List
 *
 * Applies to Strategy, Operations, BizOps, Chief of Staff, and GTM roles
 * at AI startups across Greenhouse, Lever, and Ashby ATS platforms.
 *
 * Usage:
 *   node scripts/batch-evanlee.mjs                     # apply to all
 *   node scripts/batch-evanlee.mjs --dry-run            # preview only
 *   node scripts/batch-evanlee.mjs --greenhouse-only    # only Greenhouse jobs
 *   node scripts/batch-evanlee.mjs --ashby-only         # only Ashby jobs
 *   node scripts/batch-evanlee.mjs --lever-only         # only Lever jobs
 *   node scripts/batch-evanlee.mjs --company "Harvey"   # single company
 *   node scripts/batch-evanlee.mjs --limit 5            # first N jobs only
 *
 * Env vars:
 *   REDIS_PASSWORD                                    - deduplication
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN - for Greenhouse email verification
 *   RESUME_PATH                                       - path to resume PDF
 *   CHROME_PATH                                       - headful Chrome binary
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import Redis from "ioredis";

// ── Config ──

const REDIS_URL =
  "redis://default:" +
  (process.env.REDIS_PASSWORD || "") +
  "@redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com:17054";

const RESUME_VARIANTS = [
  resolve(import.meta.dirname, "../blob/resume_jasonzb (1).pdf"),
  resolve(import.meta.dirname, "../blob/resume_jasonzb (2).pdf"),
  resolve(import.meta.dirname, "../blob/resume_jasonzb (3).pdf"),
  resolve(import.meta.dirname, "../blob/resume_jasonzb (4).pdf"),
  resolve(import.meta.dirname, "../blob/resume_jasonzb_oct10.pdf"),
  resolve(import.meta.dirname, "../blob/resume_jasonzb_oct15_m.pdf"),
];

// ── Curated Job List from Evan Lee's March 2026 AI Startup Generalist List ──
// Source: https://substack.com/@theevanlee/note/c-223546148

const JOBS = [
  // ── GREENHOUSE ──
  // Anthropic (Late stage, General AI research, NY/SF) - "Strategy & Operations Manager"
  { company: "Anthropic", platform: "greenhouse", slug: "anthropic", jobId: "5142005008", title: "Finance & Strategy, Deal Operations - Americas", location: "San Francisco, CA" },
  { company: "Anthropic", platform: "greenhouse", slug: "anthropic", jobId: "5164597008", title: "Partner Operations Manager, Recruitment & Activation", location: "San Francisco, CA | New York City, NY" },
  { company: "Anthropic", platform: "greenhouse", slug: "anthropic", jobId: "5136631008", title: "Copyright Operations Program Manager", location: "San Francisco, CA | New York City, NY | Seattle, WA" },
  { company: "Anthropic", platform: "greenhouse", slug: "anthropic", jobId: "5153690008", title: "Support Vendor Operations Manager", location: "San Francisco, CA | New York City, NY" },
  { company: "Anthropic", platform: "greenhouse", slug: "anthropic", jobId: "5107489008", title: "Finance & Strategy, Compute Infrastructure", location: "San Francisco, CA | New York City, NY" },

  // Snorkel AI (Series D, Data layer for specialized AI, NY/SF) - "Head of DaaS Strategy & Ops"
  { company: "Snorkel AI", platform: "greenhouse", slug: "snorkelai", jobId: "5802374004", title: "Head of DaaS Strategy & Operations", location: "New York City, NY; Redwood City, CA; San Francisco, CA" },

  // Fireworks AI (Series B, Open-source LLM infra, Bay Area) - "Strategic Projects Lead"
  { company: "Fireworks AI", platform: "greenhouse", slug: "fireworksai", jobId: "4163665009", title: "Strategic Projects Lead", location: "San Mateo, CA" },

  // Abaka AI (Series A, AI data services, Bay area) - "GTM Manager"
  { company: "Abaka AI", platform: "greenhouse", slug: "abakaai", jobId: "4064051009", title: "GTM Manager", location: "Palo Alto, CA" },

  // ── LEVER ──
  // Regal (Series B, CX voice AI agents, NY) - "Business Operations Associate"
  { company: "Regal", platform: "lever", slug: "regalvoice", jobId: "55159a32-e933-41e8-b331-178bf906942c", title: "Business Operations Associate", location: "New York, New York" },

  // ── ASHBY ──
  // OpenAI (Late stage, General AI research, SF) - "Strategy and Operations, Education"
  { company: "OpenAI", platform: "ashby", slug: "openai", jobId: "9747412d-a23d-48ba-bddd-ad1247c360f5", title: "Strategy & Operations, Support", location: "San Francisco" },
  { company: "OpenAI", platform: "ashby", slug: "openai", jobId: "bf9f8191-52d5-4334-862b-f2ab1524cdd7", title: "Growth, Business Strategy and Operations", location: "San Francisco" },
  { company: "OpenAI", platform: "ashby", slug: "openai", jobId: "3fd0ca32-e787-437d-985a-b9f7e3299ef4", title: "Partner Strategy & Operations", location: "San Francisco" },

  // Harvey (Series F, AI for legal, SF) - "GTM Strategy & Operations"
  { company: "Harvey", platform: "ashby", slug: "harvey", jobId: "f4b7b977-fb20-4f38-866d-0692234f6ad9", title: "GTM Strategy & Operations", location: "San Francisco" },
  { company: "Harvey", platform: "ashby", slug: "harvey", jobId: "80ba770e-24cb-4b52-a674-733f2e47cb0d", title: "GTM Strategy & Operations", location: "New York" },
  { company: "Harvey", platform: "ashby", slug: "harvey", jobId: "c65231c0-07e2-4fba-abcd-7a1bb3d406f3", title: "GTM Strategy & Planning", location: "New York" },

  // Crusoe (Series E, AI factory company, Denver) - "Business Operations Manager - Spark"
  { company: "Crusoe", platform: "ashby", slug: "crusoe", jobId: "2c606c2d-dedf-491c-8753-69575b4f4387", title: "Manager, Revenue Operations", location: "San Francisco, CA - US" },
  { company: "Crusoe", platform: "ashby", slug: "crusoe", jobId: "88f8a523-e7b8-4e0e-b25b-75bce7b766fc", title: "Manager, Revenue Operations", location: "Denver, CO - US" },

  // Suno (Series C, AI song creation, NY/SF) - "Senior Manager, Business Operations & Strategy"
  { company: "Suno", platform: "ashby", slug: "suno", jobId: "e93bafcf-a501-4204-88f9-13fe25982c0e", title: "Senior Manager, Business Operations & Strategy", location: "NYC" },

  // HockeyStack (Series A, AI for B2B GTM, SF) - "Strategy & Operations Principal"
  { company: "HockeyStack", platform: "ashby", slug: "hockeystack", jobId: "4004ca47-fae9-4f3a-a197-c72b2d90856a", title: "Strategy & Operations Principal", location: "San Francisco" },
  { company: "HockeyStack", platform: "ashby", slug: "hockeystack", jobId: "f8b9e39e-63ec-432b-921e-262f07eca81d", title: "Strategy & Operations Manager", location: "San Francisco" },

  // Ambience (Series C, AI healthcare platform, SF) - "Chief of Staff, Office of the President"
  { company: "Ambience", platform: "ashby", slug: "ambiencehealthcare", jobId: "e3689211-e008-48f7-b82d-c2cea4e283d3", title: "Chief of Staff, Office of the President", location: "San Francisco" },

  // Laurel (Series C, AI time tracking, NY) - "Chief of Staff to CRO"
  { company: "Laurel", platform: "ashby", slug: "laurel", jobId: "628fb49b-6ce8-465e-a88e-f242b0e120ca", title: "Revenue Strategy & Operations Lead & Chief of Staff to CRO", location: "New York Office" },

  // Numeral (Series B, AI for sales tax, SF) - "Business Operation & Strategy, Core Products"
  { company: "Numeral", platform: "ashby", slug: "numeral", jobId: "461587af-e510-4de7-ac41-e131d79bb39f", title: "Business Operation & Strategy, Core Products", location: "HQ - San Francisco, CA" },

  // Salient (Series A, AI-driven loan servicing, SF) - "Founder's Office"
  { company: "Salient", platform: "ashby", slug: "salient", jobId: "3d366f93-aa38-43a2-a4a6-2d9da18e9ef2", title: "Founder's Office", location: "SF Headquarters" },

  // Omnea (Series B, AI procurement platform, NY) - "Founding Growth Associate - US"
  { company: "Omnea", platform: "ashby", slug: "omnea", jobId: "3c5151e3-d1cd-4ebb-bf6f-5c6c2eafaa70", title: "Founding Growth Associate - US", location: "New York" },

  // Northwood (Series B, Spacecraft infra manufacturing, LA) - "Chief of Staff to the CTO"
  { company: "Northwood", platform: "ashby", slug: "northwoodspace", jobId: "88f836f9-ad73-46da-8953-bb894139e8f9", title: "Chief of Staff to the CTO", location: "Torrance, CA" },

  // Superpower (Series A, AI digital health platform, SF) - "Chief of Staff"
  { company: "Superpower", platform: "ashby", slug: "superpower", jobId: "e9b055d7-c292-4953-b9d1-7153d0255b84", title: "Chief of Staff", location: "San Francisco" },

  // Deeptune (Series A, Training gyms for AI agents, NY) - "Strategic Projects Lead"
  { company: "Deeptune", platform: "ashby", slug: "deeptune", jobId: "09ba6764-b43d-4431-b777-c51186c1f0fc", title: "Strategic Projects Lead", location: "New York City" },

  // Nevis (Series A, AI platform for wealth mgmt, NY) - "Founder's Associate (CEO Office)"
  { company: "Nevis", platform: "ashby", slug: "nevis", jobId: "28a9fcc8-b440-4333-b35e-d32b32f5f8ad", title: "Founder's Associate (CEO Office)", location: "New York" },

  // OffDeal (Series A, AI investment bank, NY) - "Business Operations, GTM"
  { company: "OffDeal", platform: "ashby", slug: "offdeal", jobId: "65772514-1113-4cce-9eff-7dbc3e20a78a", title: "Business Operations, GTM", location: "New York" },

  // Greenboard (Seed, AI OS for financial compliance, NY) - "Operations and Strategy Associate"
  { company: "Greenboard", platform: "ashby", slug: "greenboard", jobId: "8d30303c-f07c-4534-a08e-dbd51c07e039", title: "Operations and Strategy Associate", location: "New York City" },

  // Bretton AI (Series B, AI platform for financial crime, SF) - "Deployment Strategist"
  { company: "Bretton AI", platform: "ashby", slug: "brettonai", jobId: "51782321-7919-46b7-9238-7c75b86d0349", title: "Deployment Strategist", location: "San Francisco, CA" },

  // AirOps (Series B, AI search visibility, SF) - "Business Operations Manager"
  { company: "AirOps", platform: "ashby", slug: "airops", jobId: "ead990bf-a1e1-4d83-ba9d-093dece030b1", title: "Founding Biz Ops Manager", location: "San Francisco" },

  // Polymarket (Series C, Prediction market, NY) - "Business Operations Lead"
  { company: "Polymarket", platform: "ashby", slug: "polymarket", jobId: "13f17951-8755-48ee-88e3-53c8df4c2e3b", title: "Market Operations Analyst", location: "New York" },

  // ── NEWLY DISCOVERED (from research agent) ──

  // EliseAI (Series E, AI for housing & healthcare, NY) - "Growth PM, Future Platforms"
  { company: "EliseAI", platform: "ashby", slug: "eliseai", jobId: "7d2f5728-1ddf-49d6-87e8-54fc81cba65c", title: "Growth PM, Future Platforms | Housing", location: "New York City" },

  // Hera (Seed, Care mgmt for senior patients, NY) - "Founding BizOps (Apollo Unit)"
  { company: "Hera", platform: "ashby", slug: "hellohera", jobId: "f54090ee-4305-4430-9266-23f2eab43d6f", title: "Founding BizOps (Apollo Unit)", location: "New York, New York" },

  // Cellular Intelligence (Series A, AI-native TechBio company, Boston/Austin) - "Chief of Staff"
  { company: "Cellular Intelligence", platform: "ashby", slug: "cellular-intelligence", jobId: "17d6adf2-559d-4c89-b77c-e5974bfb58d3", title: "Chief of Staff", location: "Boston" },

  // Finch (Series A, AI for personal injury law firms, NY) - "Strategy & Operations, General"
  { company: "Finch", platform: "ashby", slug: "finch-legal", jobId: "e5fc1962-c077-45f6-879d-b58e6bfb5d5c", title: "Strategy & Operations, General", location: "New York City" },
  { company: "Finch", platform: "ashby", slug: "finch-legal", jobId: "8129d8bd-94c7-4fbc-b372-0db721af627c", title: "GTM Strategy & Ops", location: "New York City" },
];

// ── CLI Flags ──

const DRY_RUN = process.argv.includes("--dry-run");
const GH_ONLY = process.argv.includes("--greenhouse-only");
const ASHBY_ONLY = process.argv.includes("--ashby-only");
const LEVER_ONLY = process.argv.includes("--lever-only");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity;
const companyIdx = process.argv.indexOf("--company");
const COMPANY_FILTER = companyIdx !== -1 ? process.argv[companyIdx + 1] : null;

// ── Filter jobs ──

let filteredJobs = JOBS;
if (GH_ONLY) filteredJobs = filteredJobs.filter((j) => j.platform === "greenhouse");
if (ASHBY_ONLY) filteredJobs = filteredJobs.filter((j) => j.platform === "ashby");
if (LEVER_ONLY) filteredJobs = filteredJobs.filter((j) => j.platform === "lever");
if (COMPANY_FILTER) filteredJobs = filteredJobs.filter((j) => j.company.toLowerCase().includes(COMPANY_FILTER.toLowerCase()));
filteredJobs = filteredJobs.slice(0, LIMIT);

// ── Main ──

async function main() {
  console.log("=".repeat(70));
  console.log("BATCH APPLY - Evan Lee March 2026 AI Startup Generalist List");
  console.log("=".repeat(70));
  console.log(`Jobs: ${filteredJobs.length}/${JOBS.length} | DRY_RUN: ${DRY_RUN}`);
  console.log(`Platforms: GH=${filteredJobs.filter((j) => j.platform === "greenhouse").length} | Lever=${filteredJobs.filter((j) => j.platform === "lever").length} | Ashby=${filteredJobs.filter((j) => j.platform === "ashby").length}`);
  console.log();

  if (DRY_RUN) {
    console.log("DRY RUN - listing jobs without applying:\n");
    for (const job of filteredJobs) {
      const url =
        job.platform === "greenhouse"
          ? `https://boards.greenhouse.io/${job.slug}/jobs/${job.jobId}`
          : job.platform === "lever"
            ? `https://jobs.lever.co/${job.slug}/${job.jobId}`
            : `https://jobs.ashbyhq.com/${job.slug}/${job.jobId}`;
      console.log(`  [${job.platform.toUpperCase().padEnd(10)}] ${job.company.padEnd(20)} ${job.title}`);
      console.log(`  ${" ".repeat(14)} ${job.location} | ${url}`);
    }
    console.log(`\nTotal: ${filteredJobs.length} jobs`);
    return;
  }

  // Connect Redis
  let redis = null;
  try {
    redis = new Redis(REDIS_URL);
    await redis.ping();
    console.log("Redis connected ✓\n");
  } catch (err) {
    console.log(`Redis not available: ${err.message} - continuing without dedup\n`);
    redis = null;
  }

  let totalApplied = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let variantCounter = 0;
  const results = [];

  for (let i = 0; i < filteredJobs.length; i++) {
    const job = filteredJobs[i];
    const redisKey = `evanlee_applied:${job.slug}:${job.jobId}`;

    console.log(`\n${"─".repeat(70)}`);
    console.log(`[${i + 1}/${filteredJobs.length}] ${job.company} - ${job.title}`);
    console.log(`Platform: ${job.platform} | Location: ${job.location}`);

    // Check Redis dedup
    if (redis) {
      const existing = await redis.get(redisKey);
      if (existing) {
        const data = JSON.parse(existing);
        console.log(`SKIP: Already applied (${data.status}) on ${data.appliedAt}`);
        totalSkipped++;
        results.push({ ...job, status: "SKIP" });
        continue;
      }
    }

    // Pick resume
    const variant = RESUME_VARIANTS[variantCounter % RESUME_VARIANTS.length];
    const variantName = variant.split("/").pop();
    variantCounter++;
    console.log(`Resume: ${variantName}`);

    // Mark in-progress
    if (redis) {
      await redis.set(
        redisKey,
        JSON.stringify({ status: "in_progress", title: job.title, company: job.company, resumeVariant: variantName, startedAt: new Date().toISOString() }),
        "EX",
        86400 * 90
      );
    }

    let status = "ERROR";
    let message = "";

    try {
      if (job.platform === "greenhouse") {
        // Use existing test-apply.mjs for Greenhouse
        const output = execSync(`node scripts/test-apply.mjs ${job.slug} ${job.jobId}`, {
          cwd: resolve(import.meta.dirname, ".."),
          env: { ...process.env, RESUME_PATH: variant },
          timeout: 300_000,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        const lastLines = output.split("\n").slice(-10).join("\n");
        const isPASS = lastLines.includes("PASS") || output.includes("Application submitted");
        status = isPASS ? "PASS" : "FAIL";
        message = lastLines.substring(0, 300);

      } else if (job.platform === "lever") {
        // Use existing lever-apply.mjs for Lever
        const output = execSync(`node scripts/lever-apply.mjs ${job.slug} ${job.jobId}`, {
          cwd: resolve(import.meta.dirname, ".."),
          env: { ...process.env, RESUME_PATH: variant },
          timeout: 300_000,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        const lastLines = output.split("\n").slice(-10).join("\n");
        const isPASS = lastLines.includes("PASS") || output.includes("submitted") || output.includes("Thank");
        status = isPASS ? "PASS" : "FAIL";
        message = lastLines.substring(0, 300);

      } else if (job.platform === "ashby") {
        // Use ashby-apply.mjs for Ashby
        const output = execSync(`node scripts/ashby-apply.mjs ${job.slug} ${job.jobId}`, {
          cwd: resolve(import.meta.dirname, ".."),
          env: { ...process.env, RESUME_PATH: variant },
          timeout: 300_000,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        const lastLines = output.split("\n").slice(-10).join("\n");
        const isPASS = lastLines.includes("PASS") || output.includes("submitted") || output.includes("Thank");
        status = isPASS ? "PASS" : "FAIL";
        message = lastLines.substring(0, 300);
      }

      console.log(`RESULT: ${status}`);
      if (status === "PASS") totalApplied++;
      else totalFailed++;

    } catch (err) {
      const errOutput = (err.stdout || "") + "\n" + (err.stderr || "");
      message = errOutput.split("\n").slice(-5).join("\n").substring(0, 300);
      console.log(`ERROR: ${err.message?.substring(0, 100)}`);
      totalFailed++;
      status = "ERROR";
    }

    // Update Redis
    if (redis) {
      await redis.set(
        redisKey,
        JSON.stringify({
          status,
          title: job.title,
          company: job.company,
          platform: job.platform,
          resumeVariant: variantName,
          appliedAt: new Date().toISOString(),
          message: message.substring(0, 500),
        }),
        "EX",
        86400 * 90
      );
    }

    results.push({ ...job, status });

    // Wait between applications
    console.log("Waiting 5s...");
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Summary
  console.log(`\n\n${"=".repeat(70)}`);
  console.log("BATCH RESULTS SUMMARY");
  console.log("=".repeat(70));
  console.log(`Applied: ${totalApplied} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
  console.log();

  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : r.status === "SKIP" ? "⊘" : "✗";
    console.log(`  ${icon} ${r.status.padEnd(6)} [${r.platform}] ${r.company} — ${r.title}`);
  }

  if (redis) await redis.quit();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
