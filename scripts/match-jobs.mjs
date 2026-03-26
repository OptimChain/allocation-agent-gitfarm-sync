#!/usr/bin/env node
/**
 * Match jobs from fetched ATS data against Evan Lee's target roles.
 * Reads from scripts/jobs-data/ directory.
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

const JOBS_DIR = resolve(import.meta.dirname, "jobs-data");

const TARGETS = [
  // Greenhouse
  { name: "Anthropic", platform: "greenhouse", file: "gh_anthropic.json", slug: "anthropic", role: "Strategy & Operations Manager", location: "NY/SF" },
  { name: "Snorkel AI", platform: "greenhouse", file: "gh_snorkelai.json", slug: "snorkelai", role: "Head of DaaS Strategy & Ops", location: "NY/SF" },
  { name: "Fireworks AI", platform: "greenhouse", file: "gh_fireworksai.json", slug: "fireworksai", role: "Strategic Projects Lead", location: "Bay Area" },
  { name: "Lovable", platform: "greenhouse", file: "gh_lovable.json", slug: "lovable", role: "Finance & BizOps, Strategic Partnerships", location: "SF" },
  { name: "Abaka AI", platform: "greenhouse", file: "gh_abakaai.json", slug: "abakaai", role: "GTM Manager", location: "Bay Area" },

  // Lever
  { name: "Regal", platform: "lever", file: "lever_regalvoice.json", slug: "regalvoice", role: "Business Operations Associate", location: "NY" },
  { name: "Finch", platform: "lever", file: "lever_finch.json", slug: "finch", role: "Strategy & Operations, General", location: "NY" },

  // Ashby
  { name: "OpenAI", platform: "ashby", file: "ashby_openai.json", slug: "openai", role: "Strategy and Operations, Education", location: "SF" },
  { name: "Harvey", platform: "ashby", file: "ashby_harvey.json", slug: "harvey", role: "GTM Strategy & Operations", location: "SF" },
  { name: "Crusoe", platform: "ashby", file: "ashby_crusoe.json", slug: "crusoe", role: "Business Operations Manager - Spark", location: "Denver" },
  { name: "Commure", platform: "ashby", file: "ashby_commure.json", slug: "commure", role: "Chief of Staff", location: "SF" },
  { name: "Suno", platform: "ashby", file: "ashby_suno.json", slug: "suno", role: "Senior Manager, Business Operations & Strategy", location: "NY/SF" },
  { name: "Polymarket", platform: "ashby", file: "ashby_polymarket.json", slug: "polymarket", role: "Business Operations Lead", location: "NY" },
  { name: "HockeyStack", platform: "ashby", file: "ashby_hockeystack.json", slug: "hockeystack", role: "Strategy & Operations Principal", location: "SF" },
  { name: "AirOps", platform: "ashby", file: "ashby_airops.json", slug: "airops", role: "Business Operations Manager", location: "SF" },
  { name: "Ambience", platform: "ashby", file: "ashby_ambiencehealthcare.json", slug: "ambiencehealthcare", role: "Chief of Staff, Office of the President", location: "SF" },
  { name: "Laurel", platform: "ashby", file: "ashby_laurel.json", slug: "laurel", role: "Chief of Staff to CRO", location: "NY" },
  { name: "Numeral", platform: "ashby", file: "ashby_numeral.json", slug: "numeral", role: "Business Operation & Strategy, Core Products", location: "SF" },
  { name: "Salient", platform: "ashby", file: "ashby_salient.json", slug: "salient", role: "Founder's Office", location: "SF" },
  { name: "Omnea", platform: "ashby", file: "ashby_omnea.json", slug: "omnea", role: "Founding Growth Associate - US", location: "NY" },
  { name: "Northwood", platform: "ashby", file: "ashby_northwoodspace.json", slug: "northwoodspace", role: "Chief of Staff to the CTO", location: "LA" },
  { name: "Arcade", platform: "ashby", file: "ashby_arcade.json", slug: "arcade", role: "Chief of Staff", location: "SF" },
  { name: "Superpower", platform: "ashby", file: "ashby_superpower.json", slug: "superpower", role: "Chief of Staff", location: "SF" },
  { name: "Deeptune", platform: "ashby", file: "ashby_deeptune.json", slug: "deeptune", role: "Strategic Projects Lead", location: "NY" },
  { name: "Nevis", platform: "ashby", file: "ashby_nevis.json", slug: "nevis", role: "Founder's Associate (CEO Office)", location: "NY" },
  { name: "OffDeal", platform: "ashby", file: "ashby_offdeal.json", slug: "offdeal", role: "Business Operations, GTM", location: "NY" },
  { name: "Greenboard", platform: "ashby", file: "ashby_greenboard.json", slug: "greenboard", role: "Operations and Strategy Associate", location: "NY" },
  { name: "Bretton AI", platform: "ashby", file: "ashby_brettonai.json", slug: "brettonai", role: "Deployment Strategist", location: "SF" },
];

function getJobs(data, platform) {
  if (platform === "greenhouse") return data.jobs || [];
  if (platform === "lever") return Array.isArray(data) ? data : [];
  if (platform === "ashby") return data.jobs || [];
  return [];
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

function getId(job) {
  return String(job.id || "");
}

function getUrl(job, platform, slug) {
  if (platform === "greenhouse") return job.absolute_url || `https://boards.greenhouse.io/${slug}/jobs/${job.id}`;
  if (platform === "lever") return job.hostedUrl || "";
  if (platform === "ashby") return job.jobUrl || `https://jobs.ashbyhq.com/${slug}/${job.id}`;
  return "";
}

function matchesRole(jobTitle, targetRole) {
  const jt = jobTitle.toLowerCase();
  const tr = targetRole.toLowerCase();

  // Direct substring check
  if (jt.includes(tr) || tr.includes(jt)) return true;

  // Extract significant keywords
  const keywords = tr.split(/[\s,&/()\-]+/).filter(w => w.length >= 3);
  const matches = keywords.filter(k => jt.includes(k));
  return matches.length >= 2 || (matches.length >= 1 && keywords.length <= 2);
}

function main() {
  const allMatches = [];
  const summary = [];

  for (const target of TARGETS) {
    const filePath = join(JOBS_DIR, target.file);
    let data;
    try {
      data = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      console.log(`SKIP: ${target.name} - file not found or invalid`);
      summary.push({ company: target.name, platform: target.platform, matched: 0, total: 0 });
      continue;
    }

    const jobs = getJobs(data, target.platform);
    console.log(`${target.name} (${target.platform}/${target.slug}) - ${jobs.length} jobs`);

    const matches = [];
    for (const job of jobs) {
      const title = getTitle(job, target.platform);
      if (matchesRole(title, target.role)) {
        const match = {
          company: target.name,
          platform: target.platform,
          slug: target.slug,
          jobId: getId(job),
          title,
          location: getLocation(job, target.platform),
          url: getUrl(job, target.platform, target.slug),
          targetRole: target.role,
        };
        matches.push(match);
        console.log(`  ✓ [${match.jobId}] ${title} (${match.location})`);
        console.log(`    ${match.url}`);
      }
    }

    if (matches.length === 0) {
      console.log(`  ✗ No match for "${target.role}". Showing all:`);
      for (const job of jobs.slice(0, 8)) {
        console.log(`    - ${getTitle(job, target.platform)} (${getLocation(job, target.platform)})`);
      }
      if (jobs.length > 8) console.log(`    ... and ${jobs.length - 8} more`);
    }

    allMatches.push(...matches);
    summary.push({ company: target.name, platform: target.platform, matched: matches.length, total: jobs.length });
    console.log();
  }

  // Summary
  console.log("=".repeat(70));
  console.log("MATCH SUMMARY");
  console.log("=".repeat(70));
  const matched = summary.filter(s => s.matched > 0);
  const unmatched = summary.filter(s => s.matched === 0);
  console.log(`Matched: ${matched.length}/${TARGETS.length} companies | ${allMatches.length} total jobs\n`);

  for (const s of summary) {
    const icon = s.matched > 0 ? "✓" : "✗";
    console.log(`  ${icon} ${s.company.padEnd(20)} ${s.platform.padEnd(12)} ${s.matched} match(es) / ${s.total} total`);
  }

  // Save
  const outPath = resolve(import.meta.dirname, "evan-lee-matched-jobs.json");
  writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalMatches: allMatches.length,
    matches: allMatches,
    summary,
  }, null, 2));
  console.log(`\nSaved to: ${outPath}`);
}

main();
