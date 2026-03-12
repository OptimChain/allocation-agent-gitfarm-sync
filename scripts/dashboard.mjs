#!/usr/bin/env node
/**
 * Local web dashboard for viewing key application problems with a refresh button.
 *
 * Usage: REDIS_PASSWORD=... node scripts/dashboard.mjs [port]
 * Then open http://localhost:3847 in your browser.
 */
import { createServer } from "http";
import Redis from "ioredis";

const PORT = parseInt(process.argv[2] || "3847", 10);
const REDIS_URL =
  "redis://default:" +
  (process.env.REDIS_PASSWORD || "") +
  "@redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com:17054";

// ── Redis helpers ──────────────────────────────────────────────────────────

async function fetchProblems(redis) {
  const keys = await redis.keys("gh_applied:*");
  const problems = [];
  const summary = { PASS: 0, FAIL: 0, ERROR: 0, in_progress: 0, skipped: 0 };
  const byCompany = {};

  for (const k of keys.sort()) {
    const raw = await redis.get(k);
    if (!raw) continue;
    const obj = JSON.parse(raw);
    const parts = k.split(":");
    const company = parts[1];
    const jobId = parts[2];
    const status = obj.status || "unknown";

    summary[status] = (summary[status] || 0) + 1;

    if (!(company in byCompany)) {
      byCompany[company] = { PASS: 0, FAIL: 0, ERROR: 0, in_progress: 0, skipped: 0 };
    }
    byCompany[company][status] = (byCompany[company][status] || 0) + 1;

    if (status === "FAIL" || status === "ERROR" || status === "in_progress") {
      problems.push({
        company,
        jobId,
        status,
        title: (obj.title || "").substring(0, 80),
        message: (obj.message || obj.error || "").substring(0, 120),
        timestamp: obj.timestamp || obj.ts || "",
      });
    }
  }

  // Sort problems: ERRORs first, then FAILs, then in_progress
  const order = { ERROR: 0, FAIL: 1, in_progress: 2 };
  problems.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  return { summary, byCompany, problems, totalKeys: keys.length };
}

async function fetchLastRefreshTimes(redis) {
  const metaKeys = await redis.keys("meta:last_fetch:*");
  const times = {};
  for (const k of metaKeys) {
    const company = k.replace("meta:last_fetch:", "");
    times[company] = await redis.get(k);
  }
  return times;
}

// ── HTML ───────────────────────────────────────────────────────────────────

function renderPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Application Dashboard</title>
<style>
  :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #c9d1d9;
           --muted: #8b949e; --red: #f85149; --yellow: #d29922; --green: #3fb950;
           --blue: #58a6ff; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica,
         Arial, sans-serif; background: var(--bg); color: var(--text); padding: 24px; }
  h1 { font-size: 1.5rem; margin-bottom: 8px; }
  .subtitle { color: var(--muted); font-size: 0.85rem; margin-bottom: 20px; }
  .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
  button { background: var(--blue); color: #fff; border: none; padding: 8px 18px;
           border-radius: 6px; font-size: 0.85rem; cursor: pointer; font-weight: 600; }
  button:hover { opacity: 0.85; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  button.secondary { background: var(--border); color: var(--text); }
  #status-msg { color: var(--muted); font-size: 0.8rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
           gap: 10px; margin-bottom: 24px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px;
          padding: 14px; text-align: center; }
  .card .num { font-size: 1.8rem; font-weight: 700; }
  .card .label { font-size: 0.75rem; color: var(--muted); margin-top: 4px; }
  .card.error .num { color: var(--red); }
  .card.fail .num { color: var(--yellow); }
  .card.pass .num { color: var(--green); }
  .card.prog .num { color: var(--blue); }
  table { width: 100%; border-collapse: collapse; background: var(--card);
          border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
          margin-bottom: 24px; }
  th { background: #1c2128; text-align: left; padding: 10px 12px; font-size: 0.75rem;
       text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em; }
  td { padding: 8px 12px; border-top: 1px solid var(--border); font-size: 0.82rem; }
  tr:hover td { background: #1c2128; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px;
           font-size: 0.7rem; font-weight: 600; }
  .badge.ERROR { background: rgba(248,81,73,0.15); color: var(--red); }
  .badge.FAIL { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .badge.in_progress { background: rgba(88,166,255,0.15); color: var(--blue); }
  .empty { text-align: center; padding: 40px; color: var(--muted); }
  section { margin-bottom: 28px; }
  section h2 { font-size: 1.1rem; margin-bottom: 10px; }
</style>
</head>
<body>
  <h1>Application Agent Dashboard</h1>
  <p class="subtitle">Key problems &amp; application status across all tracked companies</p>

  <div class="toolbar">
    <button id="btn-refresh" onclick="refreshData()">Refresh Status</button>
    <button id="btn-jobs" class="secondary" onclick="refreshJobs()">Refresh Job Listings</button>
    <span id="status-msg"></span>
  </div>

  <section>
    <div id="summary" class="cards"><div class="empty">Loading…</div></div>
  </section>

  <section>
    <h2>Key Problems</h2>
    <div id="problems"><div class="empty">Loading…</div></div>
  </section>

  <section>
    <h2>Status by Company</h2>
    <div id="by-company"><div class="empty">Loading…</div></div>
  </section>

<script>
function setMsg(text) { document.getElementById("status-msg").textContent = text; }

async function refreshData() {
  const btn = document.getElementById("btn-refresh");
  btn.disabled = true;
  setMsg("Fetching…");
  try {
    const res = await fetch("/api/problems");
    const data = await res.json();
    renderSummary(data.summary);
    renderProblems(data.problems);
    renderByCompany(data.byCompany);
    setMsg("Updated " + new Date().toLocaleTimeString());
  } catch (e) {
    setMsg("Error: " + e.message);
  } finally { btn.disabled = false; }
}

async function refreshJobs() {
  const btn = document.getElementById("btn-jobs");
  btn.disabled = true;
  setMsg("Refreshing job listings (this may take a minute)…");
  try {
    const res = await fetch("/api/refresh-jobs", { method: "POST" });
    const data = await res.json();
    setMsg("Jobs refreshed — new=" + data.totalNew + " updated=" + data.totalUpdated +
           " unchanged=" + data.totalUnchanged + " at " + new Date().toLocaleTimeString());
  } catch (e) {
    setMsg("Error: " + e.message);
  } finally { btn.disabled = false; }
}

function renderSummary(s) {
  document.getElementById("summary").innerHTML =
    card(s.ERROR || 0, "Errors", "error") +
    card(s.FAIL || 0, "Failures", "fail") +
    card(s.in_progress || 0, "In Progress", "prog") +
    card(s.PASS || 0, "Passed", "pass") +
    card(s.skipped || 0, "Skipped", "");
}
function card(n, label, cls) {
  return '<div class="card ' + cls + '"><div class="num">' + n + '</div><div class="label">' + label + '</div></div>';
}

function renderProblems(list) {
  if (!list.length) {
    document.getElementById("problems").innerHTML = '<div class="empty">No problems found — all clear!</div>';
    return;
  }
  let h = '<table><thead><tr><th>Status</th><th>Company</th><th>Job ID</th><th>Title</th><th>Message</th><th>Time</th></tr></thead><tbody>';
  for (const p of list) {
    h += '<tr><td><span class="badge ' + esc(p.status) + '">' + esc(p.status) + '</span></td>'
       + '<td>' + esc(p.company) + '</td><td>' + esc(p.jobId) + '</td>'
       + '<td>' + esc(p.title) + '</td><td>' + esc(p.message) + '</td>'
       + '<td>' + esc(p.timestamp) + '</td></tr>';
  }
  h += '</tbody></table>';
  document.getElementById("problems").innerHTML = h;
}

function renderByCompany(obj) {
  const entries = Object.entries(obj).sort();
  if (!entries.length) {
    document.getElementById("by-company").innerHTML = '<div class="empty">No data yet.</div>';
    return;
  }
  let h = '<table><thead><tr><th>Company</th><th>Pass</th><th>Fail</th><th>Error</th><th>In Progress</th><th>Skipped</th></tr></thead><tbody>';
  for (const [c, s] of entries) {
    h += '<tr><td>' + esc(c) + '</td><td>' + (s.PASS||0) + '</td><td>' + (s.FAIL||0) + '</td>'
       + '<td>' + (s.ERROR||0) + '</td><td>' + (s.in_progress||0) + '</td><td>' + (s.skipped||0) + '</td></tr>';
  }
  h += '</tbody></table>';
  document.getElementById("by-company").innerHTML = h;
}

function esc(s) {
  if (!s) return "";
  const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML;
}

refreshData();
</script>
</body>
</html>`;
}

// ── Server ─────────────────────────────────────────────────────────────────

const redis = new Redis(REDIS_URL);
await redis.ping().then(() => console.log("Redis connected"));

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

import { createHash } from "crypto";

function contentHash(title, location, dept) {
  return createHash("sha256")
    .update(`${title}|${location}|${dept}`)
    .digest("hex")
    .slice(0, 16);
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

async function refreshJobListings() {
  let totalNew = 0, totalUpdated = 0, totalUnchanged = 0;

  for (const { boardToken, displayName } of companies) {
    let apiJobs = [];
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        apiJobs = data.jobs || [];
      }
    } catch { /* skip */ }

    if (apiJobs.length === 0) continue;

    const now = new Date();
    const nowTs = now.getTime() / 1000;
    const nowIso = now.toISOString();
    const pipe = redis.pipeline();
    let newCount = 0, updatedCount = 0, unchangedCount = 0;

    for (const job of apiJobs) {
      const jobId = String(job.id);
      const compositeKey = `${boardToken}:${jobId}`;
      const hashKey = `jobs:${boardToken}:${jobId}`;
      const title = job.title;
      const locationRaw = job.location?.name || "Unknown";
      const dept = job.departments?.[0]?.name || "General";
      const updated = job.updated_at || nowIso;
      const hash = contentHash(title, locationRaw, dept);
      const tags = extractTags(title, dept);

      const existingHash = await redis.hget(hashKey, "content_hash");

      if (existingHash === null) {
        newCount++;
        pipe.hset(hashKey, {
          job_id: jobId, company: boardToken, company_name: displayName,
          title, url: job.absolute_url, department: dept, location: locationRaw,
          status: "active", first_seen_at: nowIso, last_seen_at: nowIso,
          updated_at: updated, content_hash: hash, tags: [...tags].sort().join(","),
        });
        pipe.sadd(`idx:company:${boardToken}`, compositeKey);
        pipe.sadd("idx:status:active", compositeKey);
        pipe.zadd("feed:new", nowTs.toString(), compositeKey);
        pipe.zadd(`feed:company:${boardToken}`, nowTs.toString(), compositeKey);
        for (const tag of tags) pipe.sadd(`idx:tag:${tag}`, compositeKey);
      } else if (existingHash !== hash) {
        updatedCount++;
        pipe.hset(hashKey, {
          title, url: job.absolute_url, department: dept, location: locationRaw,
          status: "active", last_seen_at: nowIso, updated_at: updated,
          content_hash: hash, tags: [...tags].sort().join(","),
        });
      } else {
        unchangedCount++;
        pipe.hset(hashKey, "last_seen_at", nowIso);
      }
    }

    await pipe.exec();
    await redis.set(`meta:last_fetch:${boardToken}`, nowIso);

    totalNew += newCount;
    totalUpdated += updatedCount;
    totalUnchanged += unchangedCount;

    await new Promise((r) => setTimeout(r, 300));
  }

  return { totalNew, totalUpdated, totalUnchanged };
}

// ── HTTP handler ───────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderPage());
    return;
  }

  if (req.url === "/api/problems" && req.method === "GET") {
    try {
      const [problems, lastFetch] = await Promise.all([
        fetchProblems(redis),
        fetchLastRefreshTimes(redis),
      ]);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...problems, lastFetch }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.url === "/api/refresh-jobs" && req.method === "POST") {
    try {
      const result = await refreshJobListings();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
