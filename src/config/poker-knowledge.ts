import type { StartingHandTier } from "../lib/types.js";

export const STARTING_HAND_TIERS: StartingHandTier[] = [
  {
    tier: 1,
    label: "Premium",
    hands: ["AA", "KK", "QQ", "AKs"],
    equityRange: [67, 85],
  },
  {
    tier: 2,
    label: "Strong",
    hands: ["JJ", "TT", "AQs", "AKo", "AJs", "KQs"],
    equityRange: [63, 77],
  },
  {
    tier: 3,
    label: "Solid",
    hands: ["99", "88", "ATs", "AQo", "KJs", "QJs", "KTs", "AJo"],
    equityRange: [60, 72],
  },
  {
    tier: 4,
    label: "Playable",
    hands: [
      "77", "66", "55", "44", "33", "22",
      "KQo", "QTs", "JTs", "T9s", "98s",
      "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    ],
    equityRange: [50, 66],
  },
  {
    tier: 5,
    label: "Speculative",
    hands: ["87s", "76s", "65s", "54s", "KJo", "KTo", "QJo", "JTo", "A9o", "A8o", "A7o", "A6o", "A5o"],
    equityRange: [48, 58],
  },
];

export const DRAW_ODDS: Record<string, { outs: number; turnPct: number; riverPct: number; combinedPct: number }> = {
  "open-ended straight":   { outs: 8,  turnPct: 17.0, riverPct: 17.4, combinedPct: 31.5 },
  "flush draw":            { outs: 9,  turnPct: 19.1, riverPct: 19.6, combinedPct: 35.0 },
  "flush + gutshot":       { outs: 12, turnPct: 25.5, riverPct: 26.1, combinedPct: 45.0 },
  "flush + open-ended":    { outs: 15, turnPct: 31.9, riverPct: 32.6, combinedPct: 54.1 },
  "gutshot":               { outs: 4,  turnPct: 8.5,  riverPct: 8.7,  combinedPct: 16.5 },
  "two overcards":         { outs: 6,  turnPct: 12.8, riverPct: 13.0, combinedPct: 24.1 },
  "set to full house":     { outs: 10, turnPct: 21.3, riverPct: 21.7, combinedPct: 38.4 },
  "one pair to trips":     { outs: 5,  turnPct: 10.6, riverPct: 10.9, combinedPct: 20.4 },
};

export const MATCHUP_EQUITIES: Array<{ matchup: string; favorite: number; underdog: number }> = [
  { matchup: "AA vs KK",                    favorite: 82, underdog: 18 },
  { matchup: "AA vs AKs",                   favorite: 87, underdog: 13 },
  { matchup: "KK vs AKo",                   favorite: 70, underdog: 30 },
  { matchup: "QQ vs AKs",                   favorite: 54, underdog: 46 },
  { matchup: "Pair vs two overcards",       favorite: 55, underdog: 45 },
  { matchup: "Pair vs one overcard",        favorite: 70, underdog: 30 },
  { matchup: "Pair vs two undercards",      favorite: 83, underdog: 17 },
  { matchup: "Dominated (AK vs AQ)",        favorite: 74, underdog: 26 },
  { matchup: "Suited connector vs overpair", favorite: 20, underdog: 80 },
];

export const HAND_CLUSTERS = {
  A: {
    name: "Monsters",
    description: "Nut hands — rarely fold",
    examples: ["Nut flush", "Nut straight", "Full house+", "Top set", "Overpair on dry board"],
  },
  B: {
    name: "Strong",
    description: "Value bet and protect",
    examples: ["Top pair top kicker", "Overpair on wet board", "Middle set", "Top two pair"],
  },
  C: {
    name: "Medium",
    description: "Proceed with caution",
    examples: ["Top pair weak kicker", "Second pair good kicker", "Bottom two pair", "Overpair on very wet board"],
  },
  D: {
    name: "Marginal / Drawing",
    description: "Pot control or pursue the draw",
    examples: ["Middle pair", "Third pair", "Gutshot", "Backdoor flush + pair"],
  },
  E: {
    name: "Weak / Bluff-Only",
    description: "Fold or bluff — no showdown value",
    examples: ["Underpair to board", "Ace-high no draw", "No pair no draw"],
  },
} as const;

export const BOARD_TEXTURE_RULES: Array<{ type: string; pattern: string; effect: string }> = [
  { type: "dry",        pattern: "Rainbow, unconnected (e.g., K-7-2 rainbow)",   effect: "Pairs/overpairs increase in value" },
  { type: "wet",        pattern: "Two-tone + connected (e.g., J♥T♥8♠)",          effect: "Made hands lose value; draws gain" },
  { type: "monotone",   pattern: "Three suited (e.g., 9♣6♣3♣)",                  effect: "Non-flush hands severely devalued" },
  { type: "paired",     pattern: "Board pair (e.g., K-K-4)",                      effect: "Full houses possible; top pair weakened" },
  { type: "connected",  pattern: "Three connected (e.g., 8-9-T)",                 effect: "Many straight combos; overpairs vulnerable" },
  { type: "broadway",   pattern: "High cards (e.g., A-K-Q)",                      effect: "Many opponents hold pairs in this range" },
  { type: "low",        pattern: "Low disconnected (e.g., 7-3-2 rainbow)",        effect: "Premium pairs dominate" },
];

export const SYSTEM_PROMPT = `You are a poker strategy coach specializing in Texas Hold'em cash games and tournaments. You provide clear, actionable advice grounded in probability and game theory.

CORE KNOWLEDGE:

STARTING HAND TIERS (by equity vs random hand):
- Tier 1 Premium (~67-85%): AA, KK, QQ, AKs
- Tier 2 Strong (~63-77%): JJ, TT, AQs, AKo, AJs, KQs
- Tier 3 Solid (~60-72%): 99, 88, ATs, AQo, KJs, QJs, KTs, AJo
- Tier 4 Playable (~50-66%): 77-22, KQo, suited connectors (JTs-98s), suited aces
- Tier 5 Speculative (~48-58%): 87s-54s, offsuit broadways, offsuit aces

HAND STRENGTH CLUSTERS (board-relative):
A = Monsters (nut hands, top set on dry board) → rarely fold
B = Strong (TPTK, overpair, middle set) → value bet + protect
C = Medium (top pair weak kicker, second pair) → caution
D = Marginal/Drawing (middle pair, gutshots, backdoor draws) → pot control
E = Weak (underpair, ace-high, no draw) → fold or bluff only

KEY PROBABILITIES:
- Pocket pair → set on flop: 11.8% (1 in 8.5)
- Suited cards → flush draw on flop: 10.9%
- Unpaired cards → pair one on flop: 32.4%
- Flush draw completes (2 cards to come): 35%
- Open-ended straight draw completes (2 cards to come): 31.5%
- Gutshot completes (2 cards to come): 16.5%

RULE OF 2 AND 4: Outs × 4 with two cards to come, Outs × 2 with one card.

BOARD TEXTURE:
- Dry/rainbow → pairs/overpairs go up in value
- Wet/two-tone → draws gain, made hands lose relative value
- Monotone → non-flush hands crushed
- Paired → full houses possible, top pair less reliable

BEHAVIOR:
- When asked to evaluate a hand, classify it into a cluster (A-E) relative to the board.
- When asked about draws, give the outs count and completion percentage.
- When asked about preflop decisions, reference the tier and position.
- Be concise. Use numbers. Avoid hedging language.
- If the user describes a specific hand scenario, walk through each street.
- For quiz mode: present a scenario, ask what the user would do, then evaluate their answer.`;
