#!/usr/bin/env node
/**
 * ATS Discovery Script
 *
 * Probes Greenhouse and Lever APIs to find which ATS each company uses
 * and lists available jobs matching target roles.
 *
 * Usage:
 *   node scripts/discover-ats.mjs
 */

// Companies from Evan Lee's March 2026 AI Startups Hiring Generalists list
const COMPANIES = [
  { name: "EnseAI", slugs: ["enseai", "ense-ai", "ense"], role: "Growth PM, Future Platforms", location: "NY" },
  { name: "Vals.ai", slugs: ["valsai", "vals-ai", "vals", "valsdotai"], role: "Head of Operations", location: "SF" },
  { name: "Quadrillion Labs", slugs: ["quadrillionlabs", "quadrillion-labs", "quadrillion"], role: "Founding BizOps Lead", location: "NY" },
  { name: "Greenboard", slugs: ["greenboard", "greenboardio", "greenboard-io"], role: "Operations and Strategy Associate", location: "NY" },
  { name: "Hera", slugs: ["hera", "heracare", "hera-care", "herahealth"], role: "Founding BizOps (Apollo Unit)", location: "NY" },
  { name: "Cellular Intelligence", slugs: ["cellularintelligence", "cellular-intelligence", "cellintel"], role: "Chief of Staff", location: "Boston/Austin" },
  { name: "Rowspace", slugs: ["rowspace", "row-space"], role: "Business Operations Lead", location: "NY/SF" },
  { name: "Deeptune", slugs: ["deeptune", "deep-tune", "deeptuneinc"], role: "Strategic Projects Lead", location: "NY" },
  { name: "HockeyStack", slugs: ["hockeystack", "hockey-stack"], role: "Strategy & Operations Principal", location: "SF" },
  { name: "Nevis", slugs: ["nevis", "neviswealth", "nevis-wealth", "getnevis"], role: "Founder's Associate (CEO Office)", location: "NY" },
  { name: "Superpower", slugs: ["superpower", "superpowerhealth", "superpower-health", "gosuperpower"], role: "Chief of Staff", location: "SF" },
  { name: "Arcade", slugs: ["arcade", "arcadesoftware", "arcade-software", "arcadeai"], role: "Chief of Staff", location: "SF" },
  { name: "Finch", slugs: ["finch", "finchlegal", "finch-legal", "tryfinch"], role: "Strategy & Operations, General", location: "NY" },
  { name: "Salient", slugs: ["salient", "salientlending", "salient-lending"], role: "Founder's Office", location: "SF" },
  { name: "OffDeal", slugs: ["offdeal", "off-deal"], role: "Business Operations, GTM", location: "NY" },
  { name: "Abaka AI", slugs: ["abakaai", "abaka-ai", "abaka"], role: "GTM Manager", location: "Bay Area" },
  { name: "Fireworks AI", slugs: ["fireworksai", "fireworks-ai", "fireworks"], role: "Strategic Projects Lead", location: "Bay Area" },
  { name: "Bretton AI", slugs: ["brettonai", "bretton-ai", "bretton"], role: "Deployment Strategist", location: "SF" },
  { name: "Lovable", slugs: ["lovable", "lovableai", "lovable-ai"], role: "Finance & BizOps, Strategic Partnerships", location: "SF" },
  { name: "Regal", slugs: ["regal", "regalvoice", "regal-voice", "regalio", "regal-io"], role: "Business Operations Associate", location: "NY" },
  { name: "AirOps", slugs: ["airops", "air-ops"], role: "Business Operations Manager", location: "SF" },
  { name: "Omnea", slugs: ["omnea", "omnea-io"], role: "Founding Growth Associate - US", location: "NY" },
  { name: "Northwood", slugs: ["northwood", "northwoodspace", "northwood-space"], role: "Chief of Staff to the CTO", location: "LA" },
  { name: "Numeral", slugs: ["numeral", "numeralhq", "numeral-hq"], role: "Business Operation & Strategy, Core Products", location: "SF" },
  { name: "Suno", slugs: ["suno", "sunoai", "suno-ai"], role: "Senior Manager, Business Operations & Strategy", location: "NY/SF" },
  { name: "Encord", slugs: ["encord", "encordai", "encord-ai"], role: "Founder's Associate", location: "SF" },
  { name: "Ambience", slugs: ["ambience", "ambiencehealthcare", "ambience-healthcare"], role: "Chief of Staff, Office of the President", location: "SF" },
  { name: "Laurel", slugs: ["laurel", "laurelai", "laurel-ai"], role: "Chief of Staff to CRO", location: "NY" },
  { name: "Polymarket", slugs: ["polymarket", "poly-market"], role: "Business Operations Lead", location: "NY" },
  { name: "Snorkel AI", slugs: ["snorkelai", "snorkel-ai", "snorkel"], role: "Head of DaaS Strategy & Ops", location: "NY/SF" },
  { name: "Crusoe", slugs: ["crusoe", "crusoeinc", "crusoe-energy", "crusoeenergy"], role: "Business Operations Manager - Spark", location: "Denver" },
  { name: "Commure", slugs: ["commure", "commureinc"], role: "Chief of Staff", location: "SF" },
  { name: "Harvey", slugs: ["harvey", "harveyai", "harvey-ai"], role: "GTM Strategy & Operations", location: "SF" },
  { name: "Anthropic", slugs: ["anthropic"], role: "Strategy & Operations Manager", location: "NY/SF" },
  { name: "OpenAI", slugs: ["openai", "open-ai"], role: "Strategy and Operations, Education", location: "SF" },
];

const GH_API = "https://boards-api.greenhouse.io/v1/boards";
const LEVER_API = "https://api.lever.co/v0/postings";

async function probeGreenhouse(slug) {
  const url = `${GH_API}/${slug}/jobs?content=true`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.jobs && data.jobs.length > 0) {
      return { platform: "greenhouse", boardToken: slug, jobs: data.jobs };
    }
    return null;
  } catch {
    return null;
  }
}

async function probeLever(slug) {
  const url = `${LEVER_API}/${slug}?mode=json`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { platform: "lever", companySlug: slug, jobs: data };
    }
    return null;
  } catch {
    return null;
  }
}

async function discoverCompany(company) {
  // Try all slug variants on both platforms
  for (const slug of company.slugs) {
    const [gh, lever] = await Promise.all([
      probeGreenhouse(slug),
      probeLever(slug),
    ]);

    if (gh) {
      return { ...company, ats: "greenhouse", boardToken: slug, totalJobs: gh.jobs.length, jobs: gh.jobs };
    }
    if (lever) {
      return { ...company, ats: "lever", companySlug: slug, totalJobs: lever.jobs.length, jobs: lever.jobs };
    }
  }
  return { ...company, ats: "unknown", totalJobs: 0, jobs: [] };
}

async function main() {
  console.log("=".repeat(70));
  console.log("ATS DISCOVERY - Evan Lee March 2026 AI Startup List");
  console.log("=".repeat(70));
  console.log(`\nProbing ${COMPANIES.length} companies on Greenhouse & Lever...\n`);

  const results = { greenhouse: [], lever: [], unknown: [] };
  const allJobs = [];

  // Process in batches of 5 to avoid overwhelming APIs
  for (let i = 0; i < COMPANIES.length; i += 5) {
    const batch = COMPANIES.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(discoverCompany));

    for (const r of batchResults) {
      if (r.ats === "greenhouse") {
        results.greenhouse.push(r);
        console.log(`  ✓ GREENHOUSE: ${r.name} (${r.boardToken}) - ${r.totalJobs} jobs`);

        // Find matching jobs for the target role
        const targetRole = r.role.toLowerCase();
        const matchingJobs = r.jobs.filter(j => {
          const title = j.title.toLowerCase();
          // Broad match - check if any significant words overlap
          const targetWords = targetRole.split(/[\s,&]+/).filter(w => w.length > 2);
          return targetWords.some(w => title.includes(w));
        });

        if (matchingJobs.length > 0) {
          for (const j of matchingJobs) {
            console.log(`      → ${j.id}: ${j.title} (${j.location?.name || "Unknown"})`);
            allJobs.push({
              company: r.name,
              platform: "greenhouse",
              boardToken: r.boardToken,
              jobId: String(j.id),
              title: j.title,
              location: j.location?.name || "",
              targetRole: r.role,
            });
          }
        } else {
          // List all jobs if no match found
          console.log(`      (no exact match for "${r.role}" - listing all jobs)`);
          for (const j of r.jobs.slice(0, 10)) {
            console.log(`      → ${j.id}: ${j.title} (${j.location?.name || "Unknown"})`);
            allJobs.push({
              company: r.name,
              platform: "greenhouse",
              boardToken: r.boardToken,
              jobId: String(j.id),
              title: j.title,
              location: j.location?.name || "",
              targetRole: r.role,
            });
          }
        }
      } else if (r.ats === "lever") {
        results.lever.push(r);
        console.log(`  ✓ LEVER: ${r.name} (${r.companySlug}) - ${r.totalJobs} jobs`);

        const targetRole = r.role.toLowerCase();
        const matchingJobs = r.jobs.filter(j => {
          const title = j.text.toLowerCase();
          const targetWords = targetRole.split(/[\s,&]+/).filter(w => w.length > 2);
          return targetWords.some(w => title.includes(w));
        });

        if (matchingJobs.length > 0) {
          for (const j of matchingJobs) {
            console.log(`      → ${j.id}: ${j.text} (${j.categories?.location || "Unknown"})`);
            allJobs.push({
              company: r.name,
              platform: "lever",
              companySlug: r.companySlug,
              jobId: j.id,
              title: j.text,
              location: j.categories?.location || "",
              targetRole: r.role,
            });
          }
        } else {
          console.log(`      (no exact match for "${r.role}" - listing all jobs)`);
          for (const j of r.jobs.slice(0, 10)) {
            console.log(`      → ${j.id}: ${j.text} (${j.categories?.location || "Unknown"})`);
            allJobs.push({
              company: r.name,
              platform: "lever",
              companySlug: r.companySlug,
              jobId: j.id,
              title: j.text,
              location: j.categories?.location || "",
              targetRole: r.role,
            });
          }
        }
      } else {
        results.unknown.push(r);
        console.log(`  ✗ NOT FOUND: ${r.name} (tried: ${r.slugs.join(", ")})`);
      }
    }
  }

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("DISCOVERY SUMMARY");
  console.log("=".repeat(70));
  console.log(`Greenhouse: ${results.greenhouse.length} companies`);
  console.log(`Lever:      ${results.lever.length} companies`);
  console.log(`Not found:  ${results.unknown.length} companies`);
  console.log(`\nTotal actionable jobs: ${allJobs.length}`);

  // Write results to JSON for the batch script
  const { writeFileSync } = await import("fs");
  const outputPath = new URL("./evan-lee-jobs.json", import.meta.url).pathname;
  writeFileSync(outputPath, JSON.stringify({ discoveredAt: new Date().toISOString(), companies: results, jobs: allJobs }, null, 2));
  console.log(`\nResults written to: ${outputPath}`);

  // Print config snippets for batch scripts
  if (results.greenhouse.length > 0) {
    console.log(`\n${"─".repeat(70)}`);
    console.log("GREENHOUSE BATCH CONFIG (for batch-greenhouse.mjs):");
    console.log("─".repeat(70));
    for (const c of results.greenhouse) {
      const matchingJobs = allJobs.filter(j => j.company === c.name && j.platform === "greenhouse");
      if (matchingJobs.length > 0) {
        console.log(`\n  ${c.boardToken}: [`);
        for (const j of matchingJobs) {
          console.log(`    { id: "${j.jobId}", title: "${j.title}" },`);
        }
        console.log(`  ],`);
      }
    }
  }

  if (results.lever.length > 0) {
    console.log(`\n${"─".repeat(70)}`);
    console.log("LEVER COMPANIES (for lever-apply.mjs):");
    console.log("─".repeat(70));
    for (const c of results.lever) {
      const matchingJobs = allJobs.filter(j => j.company === c.name && j.platform === "lever");
      console.log(`  ${c.companySlug}: ${matchingJobs.length} matching jobs`);
    }
  }

  if (results.unknown.length > 0) {
    console.log(`\n${"─".repeat(70)}`);
    console.log("NOT FOUND (may use Ashby, Workday, custom ATS, or different slug):");
    console.log("─".repeat(70));
    for (const c of results.unknown) {
      console.log(`  ${c.name} (${c.location}) - ${c.role}`);
    }
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
