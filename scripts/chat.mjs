#!/usr/bin/env node

/**
 * Interactive poker strategy chatbot.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/chat.mjs
 *
 * Commands:
 *   /hand AhKd [board cards]  — Set hero hand + optional board for analysis
 *   /tier AKs                 — Look up starting hand tier
 *   /draw flush               — Look up draw completion odds
 *   /cluster B                — Look up hand strength cluster
 *   /quiz                     — Start a quiz scenario
 *   /reset                    — Clear conversation history
 *   /exit                     — Quit
 */

import { createInterface } from "node:readline";
import {
  createSession,
  chat,
  parseHandCommand,
  lookupTier,
  lookupDraw,
  lookupCluster,
  saveSession,
} from "../src/lib/chatbot.ts";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "\n🃏 You > ",
});

let session = createSession();
let persistToRedis = false;

console.log("─────────────────────────────────────────");
console.log("  Poker Strategy Chatbot");
console.log("  Powered by Claude + hand analysis data");
console.log("─────────────────────────────────────────");
console.log("Commands: /hand, /tier, /draw, /cluster, /quiz, /reset, /exit");
console.log("Or just type a poker question.\n");

if (process.argv.includes("--persist")) {
  persistToRedis = true;
  console.log("Session persistence: ON (Redis)\n");
}

rl.prompt();

rl.on("line", async (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  if (input === "/exit" || input === "/quit") {
    if (persistToRedis) {
      await saveSession(session);
      console.log(`Session saved: ${session.id}`);
    }
    console.log("GG. 👋");
    process.exit(0);
  }

  if (input === "/reset") {
    session = createSession();
    console.log("Conversation cleared.\n");
    rl.prompt();
    return;
  }

  // /tier lookup
  if (input.startsWith("/tier ")) {
    const hand = input.slice(6).trim();
    const result = lookupTier(hand);
    console.log(result || `Unknown hand: ${hand}`);
    rl.prompt();
    return;
  }

  // /draw lookup
  if (input.startsWith("/draw ")) {
    const drawType = input.slice(6).trim();
    const result = lookupDraw(drawType);
    console.log(result || `Unknown draw type: ${drawType}. Try: flush, gutshot, open-ended, overcards`);
    rl.prompt();
    return;
  }

  // /cluster lookup
  if (input.startsWith("/cluster ")) {
    const cluster = input.slice(9).trim();
    const result = lookupCluster(cluster);
    console.log(result || `Unknown cluster: ${cluster}. Use A-E.`);
    rl.prompt();
    return;
  }

  // /hand sets context then sends to LLM
  if (input.startsWith("/hand ")) {
    const ctx = parseHandCommand(input);
    if (ctx) {
      session.context = { ...session.context, ...ctx };
      const boardStr = ctx.boardCards?.length
        ? ` | Board: ${ctx.boardCards.join(" ")}`
        : "";
      const prompt = `Analyze my hand: ${ctx.heroCards.join(" ")}${boardStr}. What cluster am I in? What's my equity and best play?`;

      process.stdout.write("\n🤖 Coach > ");
      try {
        const reply = await chat(session, prompt);
        console.log(reply);
      } catch (err) {
        console.error(`Error: ${err.message}`);
      }
      rl.prompt();
      return;
    }
    console.log("Usage: /hand AhKd [Ts 7s 2c]");
    rl.prompt();
    return;
  }

  // /quiz mode
  if (input === "/quiz") {
    session.context.mode = "quiz";
    process.stdout.write("\n🤖 Coach > ");
    try {
      const reply = await chat(
        session,
        "Start a poker quiz. Give me a preflop or postflop scenario and ask what I would do. Wait for my answer before evaluating.",
      );
      console.log(reply);
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
    rl.prompt();
    return;
  }

  // Default: send to LLM
  process.stdout.write("\n🤖 Coach > ");
  try {
    const reply = await chat(session, input);
    console.log(reply);
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }

  if (persistToRedis) {
    await saveSession(session).catch(() => {});
  }

  rl.prompt();
});

rl.on("close", () => {
  console.log("\nGG. 👋");
  process.exit(0);
});
