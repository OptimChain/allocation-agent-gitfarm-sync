import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ChatSession, ChatContext } from "./types.js";
import { getRedisClient } from "./redis.js";
import { SYSTEM_PROMPT, STARTING_HAND_TIERS, DRAW_ODDS, HAND_CLUSTERS } from "../config/poker-knowledge.js";

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  anthropicClient = new Anthropic();
  return anthropicClient;
}

const SESSION_TTL = 60 * 60 * 24; // 24 hours

export function createSession(context?: Partial<ChatContext>): ChatSession {
  const now = new Date().toISOString();
  return {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    messages: [],
    createdAt: now,
    lastActiveAt: now,
    context: { mode: "general", ...context },
  };
}

export async function saveSession(session: ChatSession): Promise<void> {
  const redis = getRedisClient();
  await redis.setex(`chat:${session.id}`, SESSION_TTL, JSON.stringify(session));
}

export async function loadSession(sessionId: string): Promise<ChatSession | null> {
  const redis = getRedisClient();
  const raw = await redis.get(`chat:${sessionId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function chat(session: ChatSession, userMessage: string): Promise<string> {
  session.messages.push({ role: "user", content: userMessage });
  session.lastActiveAt = new Date().toISOString();

  const contextPreamble = buildContextPreamble(session.context);
  const systemPrompt = contextPreamble
    ? `${SYSTEM_PROMPT}\n\nCURRENT CONTEXT:\n${contextPreamble}`
    : SYSTEM_PROMPT;

  const client = getClient();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: session.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const assistantText =
    response.content[0].type === "text" ? response.content[0].text : "";

  session.messages.push({ role: "assistant", content: assistantText });
  return assistantText;
}

function buildContextPreamble(ctx: ChatContext): string {
  const parts: string[] = [];
  parts.push(`Mode: ${ctx.mode}`);
  if (ctx.heroCards?.length) parts.push(`Hero cards: ${ctx.heroCards.join(" ")}`);
  if (ctx.boardCards?.length) parts.push(`Board: ${ctx.boardCards.join(" ")}`);
  if (ctx.position) parts.push(`Position: ${ctx.position}`);
  if (ctx.villainCount !== undefined) parts.push(`Villains: ${ctx.villainCount}`);
  return parts.length > 1 ? parts.join("\n") : "";
}

export function parseHandCommand(input: string): Partial<ChatContext> | null {
  const handPattern = /^\/hand\s+([2-9TJQKA][shdc])\s+([2-9TJQKA][shdc])(?:\s+(.+))?$/i;
  const match = input.match(handPattern);
  if (!match) return null;

  const heroCards = [match[1].toUpperCase(), match[2].toUpperCase()];
  const boardStr = match[3]?.trim();
  const boardCards = boardStr
    ? boardStr.split(/\s+/).map((c) => c.toUpperCase())
    : undefined;

  return { mode: "hand_analysis", heroCards, boardCards };
}

export function lookupTier(hand: string): string | null {
  const normalized = normalizeHand(hand);
  for (const tier of STARTING_HAND_TIERS) {
    if (tier.hands.includes(normalized)) {
      return `${normalized} → Tier ${tier.tier} (${tier.label}), equity range ${tier.equityRange[0]}-${tier.equityRange[1]}% vs random`;
    }
  }
  return null;
}

export function lookupDraw(drawType: string): string | null {
  const key = Object.keys(DRAW_ODDS).find((k) =>
    k.toLowerCase().includes(drawType.toLowerCase()),
  );
  if (!key) return null;
  const d = DRAW_ODDS[key];
  return `${key}: ${d.outs} outs | Turn: ${d.turnPct}% | River: ${d.riverPct}% | Combined: ${d.combinedPct}%`;
}

export function lookupCluster(cluster: string): string | null {
  const key = cluster.toUpperCase() as keyof typeof HAND_CLUSTERS;
  const c = HAND_CLUSTERS[key];
  if (!c) return null;
  return `Cluster ${key} — ${c.name}: ${c.description}\nExamples: ${c.examples.join(", ")}`;
}

function normalizeHand(hand: string): string {
  const h = hand.toUpperCase().replace(/[^2-9TJQKA OSos]/g, "");
  if (h.length < 2) return hand;

  const ranks = "23456789TJQKA";
  const r1 = h[0];
  const r2 = h[1];
  const suited = h.length >= 3 && h[2].toLowerCase() === "s" ? "s" : h.length >= 3 && h[2].toLowerCase() === "o" ? "o" : "";

  if (r1 === r2) return `${r1}${r2}`;

  const i1 = ranks.indexOf(r1);
  const i2 = ranks.indexOf(r2);
  return i1 > i2 ? `${r1}${r2}${suited}` : `${r2}${r1}${suited}`;
}
