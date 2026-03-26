#!/usr/bin/env node
/**
 * Fetch matching jobs for discovered companies from Evan Lee's list.
 * Searches for the specific role titles from the Substack post.
 */
import { writeFileSync } from "fs";

const TARGETS = [
  // Greenhouse companies
  { name: "Anthropic", platform: "greenhouse", slug: "anthropic", role: "Strategy & Operations Manager" },
  { name: "Snorkel AI", platform: "greenhouse", slug: "snorkelai", role: "Head of DaaS Strategy & Ops" },
  { name: "Fireworks AI", platform: "greenhouse", slug: "fireworksai", role: "Strategic Projects Lead" },
  { name: "Lovable", platform: "greenhouse", slug: "lovable", role: "Finance & BizOps, Strategic Partnerships" },
  { name: "Abaka AI", platform: "greenhouse", slug: "abakaai", role: "GTM Manager" },

  // Lever companies
  { name: "Regal", platform: "lever", slug: "regalvoice", role: "Business Operations Associate" },
  { name: "Finch", platform: "lever", slug: "finch", role: "Strategy & Operations, General" },

  // Ashby companies
  { name: "OpenAI", platform: "ashby", slug: "openai", role: "Strategy and Operations, Education" },
  { name: "Harvey", platform: "ashby", slug: "harvey", role: "GTM Strategy & Operations" },
  { name: "Crusoe", platform: "ashby", slug: "crusoe", role: "Business Operations Manager - Spark" },
  { name: "Commure", platform: "ashby", slug: "commure", role: "Chief of Staff" },
  { name: "Suno", platform: "ashby", slug: "suno", role: "Senior Manager, Business Operations & Strategy" },
  { name: "Polymarket", platform: "ashby", slug: "polymarket", role: "Business Operations Lead" },
  { name: "HockeyStack", platform: "ashby", slug: "hockeystack", role: "Strategy & Operations Principal" },
  { name: "AirOps", platform: "ashby", slug: "airops", role: "Business Operations Manager" },
  { name: "Ambience", platform: "ashby", slug: "ambiencehealthcare", role: "Chief of Staff, Office of the President" },
  { name: "Laurel", platform: "ashby", slug: "laurel", role: "Chief of Staff to CRO" },
  { name: "Numeral", platform: "ashby", slug: "numeral", role: "Business Operation & Strategy, Core Products" },
  { name: "Salient", platform: "ashby", slug: "salient", role: "Founder's Office" },
  { name: "Omnea", platform: "ashby", slug: "omnea", role: "Founding Growth Associate - US" },
  { name: "Northwood", platform: "ashby", slug: "northwoodspace", role: "Chief of Staff to the CTO" },
  { name: "Arcade", platform: "ashby", slug: "arcade", role: "Chief of Staff" },
  { name: "Superpower", platform: "ashby", slug: "superpower", role: "Chief of Staff" },
  { name: "Deeptune", platform: "ashby", slug: "deeptune", role: "Strategic Projects Lead" },
  { name: "Nevis", platform: "ashby", slug: "nevis", role: "Founder's Associate (CEO Office)" },
  { name: "OffDeal", platform: "ashby", slug: "offdeal", role: "Business Operations, GTM" },
  { name: "Greenboard", platform: "ashby", slug: "greenboard", role: "Operations and Strategy Associate" },
  { name: "Bretton AI", platform: "ashby", slug: "brettonai", role: "Deployment Strategist" },
];

async function fetchJobs(target) {
  let url;
  if (target.platform === "greenhouse") {
    url = `https://boards-api.greenhouse.io/v1/boards/${target.slug}/jobs`;
  } else if (target.platform === "lever") {
    url = `https://api.lever.co/v0/postings/${target.slug}`;
  } else if (target.platform === "ashby") {
    url = `https://api.ashbyhq.com/posting-api/job-board/${target.slug}`;
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();

    if (target.platform === "greenhouse") return data.jobs || [];
    if (target.platform === "lever") return Array.isArray(data) ? data : [];
    if (target.platform === "ashby") return data.jobs || [];
    return [];
  } catch (err) {
    console.error(`  Error fetching ${target.name}: ${err.message}`);
    return [];
  }
}

function getTitle(job, platform) {
  if (platform === "lever") return job.text || "";
  return job.title || "";
}

function getLocation(job, platform) {
  if (platform === "greenhouse") return job.location?.name || "";
  if (platform === "lever") return job.categories?.location || "";
  if (platform === "ashby") return job.location || "";
  return "";
}

function getId(job, platform) {
  return String(job.id || "");
}

function getUrl(job, platform) {
  if (platform === "greenhouse") return job.absolute_url || "";
  if (platform === "lever") return job.hostedUrl || "";
  if (platform === "ashby") return job.jobUrl || `https://jobs.ashbyhq.com/${job.boardSlug || ""}/${job.id}`;
  return "";
}

function matchesRole(jobTitle, targetRole) {
  const jt = jobTitle.toLowerCase();
  const tr = targetRole.toLowerCase();

  // Extract significant keywords (3+ chars) from target role
  const keywords = tr.split(/[\s,&/()]+/).filter(w => w.length >= 3);

  // Count how many keywords match
  const matches = keywords.filter(k => jt.includes(k));
  const matchRatio = matches.length / keywords.length;

  // Need at least 40% keyword match or 2+ keyword matches
  return matchRatio >= 0.4 || matches.length >= 2;
}

async function main() {
  console.log("Fetching jobs for all discovered companies...\n");

  const allMatches = [];
  const summary = [];

  for (const target of TARGETS) {
    process.stdout.write(`${target.name} (${target.platform}/${target.slug})... `);
    const jobs = await fetchJobs(target);
    console.log(`${jobs.length} jobs total`);

    // Find matching jobs
    const matches = [];
    for (const job of jobs) {
      const title = getTitle(job, target.platform);
      if (matchesRole(title, target.role)) {
        matches.push({
          company: target.name,
          platform: target.platform,
          slug: target.slug,
          jobId: getId(job, target.platform),
          title: title,
          location: getLocation(job, target.platform),
          url: getUrl(job, target.platform),
          targetRole: target.role,
        });
      }
    }

    if (matches.length > 0) {
      for (const m of matches) {
        console.log(`  ✓ MATCH: [${m.jobId}] ${m.title} (${m.location})`);
        console.log(`    URL: ${m.url}`);
      }
      allMatches.push(...matches);
      summary.push({ company: target.name, platform: target.platform, matched: matches.length, total: jobs.length });
    } else {
      console.log(`  ✗ No match for "${target.role}"`);
      // Show all jobs to help find the right one
      console.log(`  Available jobs:`);
      for (const job of jobs.slice(0, 15)) {
        const title = getTitle(job, target.platform);
        const loc = getLocation(job, target.platform);
        console.log(`    - ${title} (${loc})`);
      }
      if (jobs.length > 15) console.log(`    ... and ${jobs.length - 15} more`);
      summary.push({ company: target.name, platform: target.platform, matched: 0, total: jobs.length });
    }
    console.log();
  }

  // Summary
  console.log("=".repeat(70));
  console.log("MATCHING SUMMARY");
  console.log("=".repeat(70));
  console.log(`Total companies: ${TARGETS.length}`);
  console.log(`Companies with matches: ${summary.filter(s => s.matched > 0).length}`);
  console.log(`Total matching jobs: ${allMatches.length}`);
  console.log();
  for (const s of summary) {
    const status = s.matched > 0 ? `✓ ${s.matched} match(es)` : "✗ no match";
    console.log(`  ${s.company.padEnd(20)} ${s.platform.padEnd(12)} ${status} (${s.total} total)`);
  }

  // Save results
  const outputPath = new URL("./evan-lee-matched-jobs.json", import.meta.url).pathname;
  writeFileSync(outputPath, JSON.stringify({
    discoveredAt: new Date().toISOString(),
    matches: allMatches,
    summary,
    notDiscovered: [
      "EnseAI", "Vals.ai", "Quadrillion Labs", "Hera",
      "Cellular Intelligence", "Rowspace", "Encord"
    ]
  }, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
