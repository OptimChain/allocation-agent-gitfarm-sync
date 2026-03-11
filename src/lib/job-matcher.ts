import type { GreenhouseJob, JobMatch } from "./types.js";
import type { CandidateProfile } from "../config/candidate.js";
import type { RankedJob } from "./pushdown-query.js";

/**
 * Score a job against the candidate profile.
 * Higher score = better match.
 */
function scoreJob(
  job: GreenhouseJob,
  candidate: CandidateProfile
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const titleLower = job.title.toLowerCase();
  const locationLower = job.location.name.toLowerCase();

  // Title match against target roles
  for (const role of candidate.targetRoles) {
    if (titleLower.includes(role)) {
      score += 30;
      reasons.push(`Title matches target role: "${role}"`);
    }
  }

  // Location match
  for (const loc of candidate.targetLocations) {
    if (locationLower.includes(loc)) {
      score += 20;
      reasons.push(`Location match: "${loc}"`);
      break;
    }
  }

  // Penalize intern roles
  if (titleLower.includes("intern")) {
    score -= 50;
    reasons.push("Internship role (penalized)");
  }

  // Penalize senior/staff/principal/lead (might still be relevant)
  if (titleLower.includes("senior") || titleLower.includes("staff") || titleLower.includes("principal")) {
    score += 5;
    reasons.push("Senior-level role");
  }

  // Boost for exact "data engineer" match
  if (titleLower.includes("data engineer")) {
    score += 25;
    reasons.push("Exact data engineer match");
  }

  // Boost for python-related roles
  if (titleLower.includes("python")) {
    score += 15;
    reasons.push("Python in title");
  }

  return { score, reasons };
}

/**
 * Find the best matching jobs across all companies.
 */
export function findMatchingJobs(
  allJobs: Array<{ boardToken: string; companyName: string; jobs: GreenhouseJob[] }>,
  candidate: CandidateProfile,
  limit: number = 10,
  minScore: number = 40
): JobMatch[] {
  const matches: JobMatch[] = [];

  for (const { boardToken, companyName, jobs } of allJobs) {
    for (const job of jobs) {
      const { score, reasons } = scoreJob(job, candidate);
      if (score >= minScore) {
        matches.push({
          job,
          boardToken,
          companyName,
          score,
          matchReasons: reasons,
        });
      }
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

/* ── Pushdown-Aware Matching ── */

/**
 * Convert pushdown query results (RankedJob[]) into JobMatch[] for downstream
 * consumption by batch-greenhouse and other application scripts.
 *
 * This bridges the pushdown query engine with the existing application pipeline,
 * allowing callers to use Redis-level filtered results instead of fetching all jobs.
 */
export function rankPushdownResults(
  rankedJobs: RankedJob[],
  candidate: CandidateProfile,
  limit: number = 30,
  minScore: number = 30
): JobMatch[] {
  const matches: JobMatch[] = [];

  for (const rj of rankedJobs) {
    const titleLower = rj.title.toLowerCase();
    const locationLower = rj.location.toLowerCase();
    let score = rj.score; // Start with pushdown score
    const reasons = [...rj.matchedFacets.map((f) => `Pushdown: ${f}`)];

    // Layer on candidate-specific scoring
    for (const role of candidate.targetRoles) {
      if (titleLower.includes(role)) {
        score += 15;
        reasons.push(`Profile role match: "${role}"`);
      }
    }

    for (const loc of candidate.targetLocations) {
      if (locationLower.includes(loc)) {
        score += 10;
        reasons.push(`Profile location: "${loc}"`);
        break;
      }
    }

    // Skill match against title
    for (const skill of candidate.skills) {
      if (titleLower.includes(skill)) {
        score += 5;
        reasons.push(`Skill in title: "${skill}"`);
      }
    }

    if (score < minScore) continue;

    matches.push({
      job: {
        id: parseInt(rj.jobId, 10) || 0,
        title: rj.title,
        absolute_url: rj.url,
        updated_at: rj.lastSeenAt,
        location: { name: rj.location },
        departments: rj.department ? [{ id: 0, name: rj.department }] : [],
      },
      boardToken: rj.boardToken,
      companyName: rj.companyName,
      score,
      matchReasons: reasons,
    });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}
