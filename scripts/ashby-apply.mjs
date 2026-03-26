#!/usr/bin/env node
/**
 * Ashby Auto-Apply (Headful Chrome)
 *
 * Ashby job boards at jobs.ashbyhq.com use React forms.
 * This script automates the application process using Puppeteer.
 *
 * Usage:
 *   node scripts/ashby-apply.mjs <companySlug> <jobId>
 *   node scripts/ashby-apply.mjs harvey f4b7b977-fb20-4f38-866d-0692234f6ad9
 *
 * Env vars:
 *   RESUME_PATH (optional - path to resume PDF)
 *   REDIS_PASSWORD (optional - stores results)
 *   CHROME_PATH (optional - Chrome binary path)
 */

import puppeteer from "puppeteer-core";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import Redis from "ioredis";

// ── Config ──

const companySlug = process.argv[2];
const jobId = process.argv[3];

if (!companySlug || !jobId) {
  console.error("Usage: node scripts/ashby-apply.mjs <companySlug> <jobId>");
  process.exit(1);
}

const RESUME_PDF_PATH =
  process.env.RESUME_PATH ||
  resolve(import.meta.dirname, "../blob/resume_jasonzb_oct10.pdf");

const candidate = {
  firstName: "Jason",
  lastName: "Bian",
  email: "jason.bian64@gmail.com",
  phone: "+1-734-730-6569",
  linkedinUrl: "https://www.linkedin.com/in/jason-bian-7b9027a5/",
  githubUrl: "https://github.com/IamJasonBian",
  location: "New York, NY",
  currentCompany: "Amazon",
  currentTitle: "Data Engineer",
};

// ── Redis ──

let redisClient = null;

function getRedis() {
  if (redisClient) return redisClient;
  const host = "redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com";
  const port = 17054;
  const password = process.env.REDIS_PASSWORD || "";
  if (!password) return null;
  redisClient = new Redis({ host, port, password, connectTimeout: 5000, commandTimeout: 10000, maxRetriesPerRequest: 3 });
  return redisClient;
}

async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// ── Chrome launcher ──

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const paths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

// ── Main ──

async function main() {
  const jobUrl = `https://jobs.ashbyhq.com/${companySlug}/${jobId}`;
  console.log(`\nAshby Auto-Apply`);
  console.log(`Company: ${companySlug}`);
  console.log(`Job ID: ${jobId}`);
  console.log(`URL: ${jobUrl}`);
  console.log(`Resume: ${RESUME_PDF_PATH}`);

  // Check Redis dedup
  const redis = getRedis();
  if (redis) {
    const key = `ashby_applied:${companySlug}:${jobId}`;
    const existing = await redis.get(key);
    if (existing) {
      const data = JSON.parse(existing);
      console.log(`\nSKIP: Already applied (${data.status}) on ${data.appliedAt}`);
      await disconnectRedis();
      return;
    }
  }

  const chromePath = findChrome();
  if (!chromePath) {
    console.error("Chrome not found. Set CHROME_PATH env var.");
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--window-size=1280,900",
    ],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();

  // Stealth: hide webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    delete navigator.__proto__.webdriver;
  });

  let status = "ERROR";
  let message = "";
  let jobTitle = "";

  try {
    console.log("\nNavigating to job page...");
    await page.goto(jobUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Get job title
    jobTitle = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      return h1?.textContent?.trim() || document.title;
    });
    console.log(`Job title: ${jobTitle}`);

    // Look for "Apply" button and click it
    const applyClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, a"));
      const applyBtn = buttons.find((b) => {
        const text = b.textContent?.trim().toLowerCase() || "";
        return text === "apply" || text === "apply now" || text === "apply for this job";
      });
      if (applyBtn) {
        applyBtn.click();
        return true;
      }
      return false;
    });

    if (applyClicked) {
      console.log("Clicked Apply button");
      await new Promise((r) => setTimeout(r, 3000));
    }

    // Wait for form to appear
    const formSelector = 'input[name="firstName"], input[name="_systemfield_name"], input[placeholder*="First"], form input[type="text"]';
    await page.waitForSelector(formSelector, { timeout: 15000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 1000));

    // Fill fields using React-compatible approach
    console.log("Filling form fields...");

    // Try multiple approaches for field filling
    const fillResult = await page.evaluate((cand) => {
      const results = [];
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;

      function setInputValue(input, value) {
        if (!input) return false;
        if (nativeSetter) nativeSetter.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
      }

      function setTextareaValue(ta, value) {
        if (!ta) return false;
        if (nativeTextareaSetter) nativeTextareaSetter.call(ta, value);
        else ta.value = value;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.dispatchEvent(new Event("change", { bubbles: true }));
        ta.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
      }

      // Map of field patterns to values
      const fieldMap = [
        { patterns: ["firstName", "first_name", "first name"], value: cand.firstName },
        { patterns: ["lastName", "last_name", "last name"], value: cand.lastName },
        { patterns: ["email"], value: cand.email },
        { patterns: ["phone", "phoneNumber", "phone_number"], value: cand.phone },
        { patterns: ["linkedin"], value: cand.linkedinUrl },
        { patterns: ["github"], value: cand.githubUrl },
        { patterns: ["location", "city"], value: cand.location },
        { patterns: ["company", "current_company", "currentCompany", "org"], value: cand.currentCompany },
        { patterns: ["title", "current_title", "currentTitle", "jobTitle"], value: cand.currentTitle },
      ];

      // Find and fill inputs by name, id, placeholder, or label
      const allInputs = document.querySelectorAll("input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio])");

      for (const input of allInputs) {
        const name = (input.name || "").toLowerCase();
        const id = (input.id || "").toLowerCase();
        const placeholder = (input.placeholder || "").toLowerCase();
        const ariaLabel = (input.getAttribute("aria-label") || "").toLowerCase();
        // Get label from parent
        const parent = input.closest("[class*='field'], [class*='Field'], [class*='form-group'], [class*='FormField'], div");
        const labelEl = parent?.querySelector("label");
        const labelText = (labelEl?.textContent || "").toLowerCase().trim();

        for (const field of fieldMap) {
          const matches = field.patterns.some(
            (p) =>
              name.includes(p.toLowerCase()) ||
              id.includes(p.toLowerCase()) ||
              placeholder.includes(p.toLowerCase()) ||
              ariaLabel.includes(p.toLowerCase()) ||
              labelText.includes(p.toLowerCase())
          );
          if (matches && !input.value) {
            setInputValue(input, field.value);
            results.push({ field: name || id || placeholder || labelText, value: field.value.substring(0, 30) });
            break;
          }
        }
      }

      // Fill textareas (cover letter, additional info)
      document.querySelectorAll("textarea").forEach((ta) => {
        if (ta.value) return;
        const parent = ta.closest("[class*='field'], [class*='Field'], div");
        const label = parent?.querySelector("label")?.textContent?.trim()?.toLowerCase() || ta.name?.toLowerCase() || "";

        let answer = "";
        if (label.includes("cover") || label.includes("letter")) {
          answer = "I'm excited to apply for this role. With 5+ years of experience in data engineering and software development at Amazon, I bring strong technical expertise in building scalable systems, data pipelines, and ML infrastructure. I'm passionate about leveraging technology to drive business impact and would love to contribute to your team's mission.";
        } else if (label.includes("why") || label.includes("interest")) {
          answer = "I'm drawn to this company's mission and the opportunity to combine my technical background with strategic thinking. My experience building data-driven systems at scale directly informs my ability to drive operational excellence and business strategy.";
        } else if (label.includes("project") || label.includes("achievement")) {
          answer = "Led the development of a real-time data pipeline at Amazon processing millions of events daily using Spark, Kafka, and AWS services. This system reduced data latency by 80% and enabled near-real-time business intelligence dashboards used by senior leadership.";
        } else if (label.includes("additional") || label.includes("anything")) {
          answer = "";
        } else {
          answer = "I have 5+ years of experience in software engineering and data engineering at Amazon, with expertise in Python, SQL, Java, TypeScript, and cloud infrastructure. I'm passionate about applying my technical skills to drive strategic initiatives and operational improvements.";
        }

        if (answer) {
          setTextareaValue(ta, answer);
          results.push({ field: label.substring(0, 40), value: answer.substring(0, 50) });
        }
      });

      // Handle select elements
      document.querySelectorAll("select").forEach((sel) => {
        if (sel.value && sel.value !== "") return;
        const label = sel.closest("div")?.querySelector("label")?.textContent?.trim()?.toLowerCase() || "";
        const opts = Array.from(sel.options).filter((o) => o.value);

        if (label.includes("authorized") || label.includes("eligible") || label.includes("work in")) {
          const yesOpt = opts.find((o) => o.text.toLowerCase().includes("yes"));
          if (yesOpt) { sel.value = yesOpt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
        } else if (label.includes("sponsor")) {
          const noOpt = opts.find((o) => o.text.toLowerCase().includes("no"));
          if (noOpt) { sel.value = noOpt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
        } else if (opts.length > 0) {
          sel.value = opts[0].value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
        results.push({ field: label.substring(0, 40), value: sel.options[sel.selectedIndex]?.text || "?" });
      });

      // Handle radio buttons
      const radioGroups = {};
      document.querySelectorAll('input[type="radio"]').forEach((r) => {
        if (!r.name) return;
        if (!radioGroups[r.name]) radioGroups[r.name] = [];
        radioGroups[r.name].push(r);
      });
      for (const [name, radios] of Object.entries(radioGroups)) {
        if (radios.some((r) => r.checked)) continue;
        const parent = radios[0].closest("[class*='field'], div");
        const label = parent?.querySelector("label")?.textContent?.trim()?.toLowerCase() || name;
        const labels = radios.map((r) => r.parentElement?.textContent?.trim()?.toLowerCase() || r.value?.toLowerCase() || "");

        let idx = -1;
        if (label.includes("authorized") || label.includes("eligible") || label.includes("legally")) {
          idx = labels.findIndex((l) => l.includes("yes"));
        } else if (label.includes("sponsor")) {
          idx = labels.findIndex((l) => l.includes("no"));
        } else if (label.includes("gender") || label.includes("veteran") || label.includes("disability") || label.includes("race") || label.includes("ethnicity")) {
          idx = labels.findIndex((l) => l.includes("decline") || l.includes("prefer not"));
          if (idx === -1) idx = labels.length - 1;
        } else {
          idx = 0;
        }

        if (idx >= 0 && idx < radios.length) {
          radios[idx].click();
          results.push({ field: label.substring(0, 40), value: `radio: ${labels[idx]?.substring(0, 30)}` });
        }
      }

      // Handle checkboxes (consent, agree, etc.)
      document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (cb.checked) return;
        const label = cb.closest("div")?.textContent?.trim()?.toLowerCase() || "";
        if (label.includes("agree") || label.includes("consent") || label.includes("acknowledge") || label.includes("privacy") || label.includes("terms")) {
          cb.click();
          results.push({ field: label.substring(0, 40), value: "checked" });
        }
      });

      return results;
    }, candidate);

    for (const f of fillResult) {
      console.log(`  Filled: ${f.field} → ${f.value}`);
    }

    // Upload resume
    if (existsSync(RESUME_PDF_PATH)) {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.uploadFile(RESUME_PDF_PATH);
        console.log("Resume uploaded");
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        console.log("WARNING: No file input found for resume");
      }
    }

    // Also try clicking + typing for inputs not filled by the evaluate
    // Some Ashby forms use custom React components that don't respond to native setters
    const unfilledFields = await page.evaluate(() => {
      const empty = [];
      document.querySelectorAll("input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio])").forEach((input) => {
        if (!input.value) {
          const label = input.closest("div")?.querySelector("label")?.textContent?.trim() || input.name || input.placeholder || "";
          empty.push(label);
        }
      });
      return empty;
    });

    if (unfilledFields.length > 0) {
      console.log(`WARNING: ${unfilledFields.length} unfilled fields: ${unfilledFields.join(", ")}`);
    }

    await new Promise((r) => setTimeout(r, 1000));

    // Submit the form
    console.log("Submitting...");
    const submitClicked = await page.evaluate(() => {
      // Look for submit button
      const buttons = Array.from(document.querySelectorAll("button"));
      const submitBtn = buttons.find((b) => {
        const text = b.textContent?.trim().toLowerCase() || "";
        const type = b.type?.toLowerCase() || "";
        return type === "submit" || text === "submit" || text === "submit application" || text === "apply" || text === "send application";
      });
      if (submitBtn) {
        submitBtn.click();
        return submitBtn.textContent?.trim();
      }
      return null;
    });

    if (!submitClicked) {
      console.log("WARNING: Submit button not found, trying form.submit()");
      await page.evaluate(() => {
        const form = document.querySelector("form");
        if (form) form.submit();
      });
    } else {
      console.log(`Clicked: "${submitClicked}"`);
    }

    // Wait for result
    await new Promise((r) => setTimeout(r, 6000));

    // Check result
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || "");
    const currentUrl = page.url();

    if (
      bodyText.toLowerCase().includes("thank") ||
      bodyText.toLowerCase().includes("received your application") ||
      bodyText.toLowerCase().includes("application has been submitted") ||
      bodyText.toLowerCase().includes("submitted") ||
      currentUrl.includes("success") ||
      currentUrl.includes("thank")
    ) {
      status = "PASS";
      message = "Application submitted successfully";
      console.log("\n✓ PASS - Application submitted!");
    } else if (bodyText.toLowerCase().includes("error") || bodyText.toLowerCase().includes("required")) {
      // Check for specific validation errors
      const errors = await page.evaluate(() => {
        const errs = [];
        document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"]').forEach((el) => {
          if (el.textContent?.trim()) errs.push(el.textContent.trim());
        });
        return errs.slice(0, 5);
      });
      status = "FAIL";
      message = errors.length > 0 ? `Validation: ${errors.join("; ")}` : bodyText.substring(0, 200);
      console.log(`\n✗ FAIL - ${message}`);
    } else {
      // Ambiguous - assume submitted if no errors
      status = "PASS";
      message = "Submitted (no errors detected)";
      console.log(`\n? PASS (assumed) - no errors detected`);
    }

  } catch (err) {
    status = "ERROR";
    message = err.message;
    console.log(`\n✗ ERROR: ${err.message}`);
  } finally {
    // Store result in Redis
    if (redis) {
      const key = `ashby_applied:${companySlug}:${jobId}`;
      await redis.set(
        key,
        JSON.stringify({
          company: companySlug,
          jobId,
          jobTitle,
          status,
          message: message.substring(0, 500),
          appliedAt: new Date().toISOString(),
        }),
        "EX",
        86400 * 90
      );
    }

    await browser.close();
    await disconnectRedis();
  }

  console.log(`\nFinal: ${status}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
