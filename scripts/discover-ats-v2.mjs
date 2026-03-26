#!/usr/bin/env node
/**
 * ATS Discovery v2 - tries broader slug variations + Ashby API
 */

const COMPANIES = [
  { name: "Anthropic", slugs: ["anthropic", "anthropicai"] },
  { name: "OpenAI", slugs: ["openai"] },
  { name: "Harvey", slugs: ["harvey", "harveyai", "harvey-ai", "harveylaw"] },
  { name: "Crusoe", slugs: ["crusoe", "crusoeinc", "crusoeenergy", "crusoeclean"] },
  { name: "Commure", slugs: ["commure", "commureinc", "athelas", "commureathelas"] },
  { name: "Suno", slugs: ["suno", "sunoai", "sunoinc", "sunomusic"] },
  { name: "Polymarket", slugs: ["polymarket"] },
  { name: "Snorkel AI", slugs: ["snorkelai", "snorkel"] },
  { name: "Fireworks AI", slugs: ["fireworksai", "fireworks", "fw-ai"] },
  { name: "Encord", slugs: ["encord", "encordtech"] },
  { name: "HockeyStack", slugs: ["hockeystack", "hockeystackhq"] },
  { name: "Regal", slugs: ["regal", "regalio", "regalvoice", "regal-io"] },
  { name: "AirOps", slugs: ["airops", "getairops"] },
  { name: "Lovable", slugs: ["lovable", "lovabledev", "gptengineer"] },
  { name: "Ambience", slugs: ["ambience", "ambiencehealthcare", "ambiencehealth"] },
  { name: "Laurel", slugs: ["laurel", "getlaurel", "laureltech"] },
  { name: "Numeral", slugs: ["numeral", "numeralhq", "trynumeral"] },
  { name: "Salient", slugs: ["salient", "salientlending", "usesalient"] },
  { name: "Omnea", slugs: ["omnea"] },
  { name: "Northwood", slugs: ["northwood", "northwoodspace"] },
  { name: "Arcade", slugs: ["arcade", "arcadesoftware", "tryarcade"] },
  { name: "Superpower", slugs: ["superpower", "superpowerlabs", "joinsuperpower"] },
  { name: "Finch", slugs: ["finch", "tryfinch", "usefinch", "finchlabs"] },
  { name: "Bretton AI", slugs: ["bretton", "brettonai"] },
  { name: "Deeptune", slugs: ["deeptune", "deeptunelabs"] },
  { name: "HockeyStack", slugs: ["hockeystack"] },
  { name: "Nevis", slugs: ["nevis", "nevistech", "withnevis"] },
  { name: "OffDeal", slugs: ["offdeal"] },
  { name: "Rowspace", slugs: ["rowspace"] },
  { name: "Abaka AI", slugs: ["abaka", "abakaai"] },
  { name: "Greenboard", slugs: ["greenboard", "getgreenboard"] },
  { name: "Hera", slugs: ["hera", "herahealth", "joinhera"] },
  { name: "Quadrillion Labs", slugs: ["quadrillion", "quadrillionlabs"] },
  { name: "Vals.ai", slugs: ["vals", "valsai"] },
  { name: "EnseAI", slugs: ["enseai", "ense"] },
  { name: "Cellular Intelligence", slugs: ["cellularintelligence", "cellintel", "cellintell"] },
];

const GH_API = "https://boards-api.greenhouse.io/v1/boards";
const LEVER_API = "https://api.lever.co/v0/postings";
const ASHBY_API = "https://api.ashbyhq.com/posting-api/job-board";

async function tryFetch(url, timeout = 6000) {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function probeAshby(slug) {
  // Ashby uses a different API pattern
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
  const data = await tryFetch(url);
  if (data && data.jobs && data.jobs.length > 0) {
    return { platform: "ashby", slug, jobCount: data.jobs.length, jobs: data.jobs };
  }
  return null;
}

async function discoverCompany(company) {
  for (const slug of company.slugs) {
    const [gh, lever, ashby] = await Promise.all([
      tryFetch(`${GH_API}/${slug}/jobs`).then(d => d?.jobs?.length > 0 ? { platform: "greenhouse", slug, jobs: d.jobs } : null),
      tryFetch(`${LEVER_API}/${slug}?mode=json`).then(d => Array.isArray(d) && d.length > 0 ? { platform: "lever", slug, jobs: d } : null),
      probeAshby(slug),
    ]);

    const result = gh || lever || ashby;
    if (result) {
      return { name: company.name, ...result };
    }
  }
  return { name: company.name, platform: "unknown", slug: null, jobs: [] };
}

async function main() {
  console.log("ATS Discovery v2 - Greenhouse + Lever + Ashby\n");

  const found = [];
  const notFound = [];

  // Process in batches of 4
  for (let i = 0; i < COMPANIES.length; i += 4) {
    const batch = COMPANIES.slice(i, i + 4);
    const results = await Promise.all(batch.map(discoverCompany));
    for (const r of results) {
      if (r.platform !== "unknown") {
        found.push(r);
        const jobCount = r.jobs?.length || 0;
        console.log(`FOUND: ${r.name} → ${r.platform} (${r.slug}) - ${jobCount} jobs`);
        // Show first 5 jobs
        const jobs = r.jobs?.slice(0, 5) || [];
        for (const j of jobs) {
          const title = j.title || j.text || j.name || "?";
          const loc = j.location?.name || j.categories?.location || j.location || "?";
          const id = j.id || j.internal_job_id || "?";
          console.log(`  → [${id}] ${title} (${typeof loc === 'string' ? loc : JSON.stringify(loc)})`);
        }
        if ((r.jobs?.length || 0) > 5) console.log(`  ... and ${r.jobs.length - 5} more`);
      } else {
        notFound.push(r);
        console.log(`NOT FOUND: ${r.name}`);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Found: ${found.length} | Not found: ${notFound.length}`);

  // Write results
  const { writeFileSync } = await import("fs");
  writeFileSync(
    new URL("./ats-discovery-v2.json", import.meta.url).pathname,
    JSON.stringify({ found, notFound: notFound.map(n => n.name) }, null, 2)
  );
  console.log("Results saved to scripts/ats-discovery-v2.json");
}

main().catch(console.error);
