# Poker Hand Analysis: Starting States & Probability Reference

A memorizable baseline for Texas Hold'em hand strength, organized by game phase.

---

## 1. PREFLOP — Starting Hand Clusters (2 Cards)

### Tier 1: Premium (Top ~2.5% | ~4 combos each)
| Hand    | Equity vs Random | Notes |
|---------|-----------------|-------|
| AA      | ~85%            | Best starting hand. 6 combos possible. |
| KK      | ~82%            | Dominates everything except AA. |
| QQ      | ~80%            | Strong but vulnerable to overcards on board. |
| AKs     | ~67%            | Best drawing hand. Suited adds ~3% over offsuit. |

### Tier 2: Strong (Top ~5% | open-raise from any position)
| Hand    | Equity vs Random | Notes |
|---------|-----------------|-------|
| JJ      | ~77%            | Overpair to most flops but 3 overcards exist. |
| TT      | ~75%            | Similar to JJ, more vulnerable. |
| AQs     | ~66%            | Strong but dominated by AK. |
| AKo     | ~65%            | Offsuit version; still a premium. |
| AJs     | ~65%            | Playable from all positions. |
| KQs     | ~63%            | Connected + suited royalty. |

### Tier 3: Solid (Top ~10%)
| Hand    | Equity vs Random | Notes |
|---------|-----------------|-------|
| 99      | ~72%            | Mid pair; set-mine or overpair to low boards. |
| 88      | ~69%            | Set-mining hand in multiway pots. |
| ATs     | ~63%            | Decent but can be dominated. |
| AQo     | ~63%            | Offsuit; positional hand. |
| KJs     | ~62%            | Good but beware domination by AK/AJ. |
| QJs     | ~60%            | Suited connectors with high card value. |
| KTs     | ~61%            | Playable, suited helps. |
| AJo     | ~61%            | Positional; avoid early position. |

### Tier 4: Playable (Top ~20%)
| Hand    | Equity vs Random | Notes |
|---------|-----------------|-------|
| 77      | ~66%            | Set-mine; rarely good as overpair. |
| 66      | ~63%            | Set-mine primarily. |
| 55-22   | ~55-60%         | Pure set-mining. Hit set ~12% by river. |
| KQo     | ~60%            | Offsuit broadway; positional. |
| QTs     | ~59%            | Suited connector, good playability. |
| JTs     | ~57%            | Best suited connector (most straight combos). |
| T9s     | ~54%            | Suited connector; strong implied odds. |
| 98s     | ~53%            | Suited connector; draws well. |
| A9s-A2s | ~55-60%         | Suited aces; flush draw potential. |

### Tier 5: Speculative (Top ~30%, position-dependent)
| Hand    | Equity vs Random | Notes |
|---------|-----------------|-------|
| 87s     | ~52%            | Suited connector; needs position. |
| 76s     | ~51%            | Suited connector. |
| 65s     | ~50%            | Suited connector; borderline. |
| KJo-KTo | ~57-58%         | Offsuit broadway; careful of domination. |
| QJo     | ~56%            | Offsuit broadway. |
| JTo     | ~55%            | Offsuit connector. |
| A9o-A5o | ~53-57%         | Offsuit aces; kicker trouble. |

### Tier 6: Marginal / Fold (Bottom ~70%)
Everything else. Offsuit gappers, low unsuited cards, disconnected hands.

---

## 2. KEY PREFLOP PROBABILITIES TO MEMORIZE

| Event | Probability |
|-------|------------|
| Being dealt a specific pocket pair (e.g., AA) | 0.45% (1 in 221) |
| Being dealt ANY pocket pair | 5.9% (1 in 17) |
| Being dealt suited cards | 23.5% (about 1 in 4) |
| Being dealt suited connectors | 3.9% |
| Being dealt AKs specifically | 0.3% (1 in 331) |
| Being dealt any two broadway cards | 14.3% |

---

## 3. FLOP — Hitting Probabilities (from 2 starting cards → 3 community)

### From a Pocket Pair:
| Outcome | Probability |
|---------|------------|
| Flop a set (exactly trips) | 11.8% (~1 in 8.5) |
| Flop full house | 0.74% |
| Flop quads | 0.24% |
| Set or better by river | ~19% (~1 in 5) |

### From Two Suited Cards:
| Outcome | Probability |
|---------|------------|
| Flop a flush | 0.84% (~1 in 119) |
| Flop a flush draw (4 to flush) | 10.9% (~1 in 9) |
| Backdoor flush draw (3 to flush) | 41.6% |

### From Connectors (e.g., 8-9):
| Outcome | Probability |
|---------|------------|
| Flop open-ended straight draw | 9.6% |
| Flop a straight | 1.3% |
| Flop gutshot straight draw | ~16% |

### From Two Unpaired Cards:
| Outcome | Probability |
|---------|------------|
| Pair one of your cards on flop | 32.4% (~1 in 3) |
| Pair both cards (two pair) | 2.0% |
| Flop trips | 1.35% |
| No pair at all by flop | ~66% |

### From AK specifically:
| Outcome | Probability |
|---------|------------|
| Pair the A or K on flop | 32.4% |
| Pair A or K by river | ~50% |

---

## 4. TURN — Draw Completion Probabilities (1 card to come)

| Draw Type | Outs | Turn Hit% | Shortcut |
|-----------|------|-----------|----------|
| Open-ended straight draw | 8 | 17.0% | ~outs × 2 |
| Flush draw | 9 | 19.1% | ~outs × 2 |
| Flush draw + gutshot | 12 | 25.5% | |
| Flush draw + open-ended | 15 | 31.9% | |
| Gutshot straight draw | 4 | 8.5% | |
| Two overcards | 6 | 12.8% | |
| Set to full house/quads | 10 | 21.3% | |
| One pair to two pair/trips | 5 | 10.6% | |

---

## 5. RIVER — Final Draw Completion (1 more card to come)

| Draw Type | Outs | River Hit% | Combined Turn+River% |
|-----------|------|-----------|---------------------|
| Open-ended straight draw | 8 | 17.4% | 31.5% |
| Flush draw | 9 | 19.6% | 35.0% |
| Flush draw + gutshot | 12 | 26.1% | 45.0% |
| Flush draw + open-ended | 15 | 32.6% | 54.1% |
| Gutshot straight draw | 4 | 8.7% | 16.5% |
| Two overcards | 6 | 13.0% | 24.1% |
| Set → full house/quads | 10 | 21.7% | 38.4% |
| One pair → trips+ | 5 | 10.9% | 20.4% |

### Quick Mental Math (Rule of 2 and 4):
- **1 card to come**: Outs × 2 ≈ hit %
- **2 cards to come**: Outs × 4 ≈ hit %
- Example: flush draw (9 outs) → 9×4 = 36% with two cards (actual: 35%)

---

## 6. HAND STRENGTH CLUSTERS — Board-Relative Ranking

Think of your hand in one of these clusters at any point:

### Cluster A: Monsters (Rarely fold)
- **Nut flush / nut straight** — Best possible of that draw type
- **Full house+** — Extremely rare to be behind
- **Top set** — Only loses to higher boats/quads/runner-runner
- **Overpair on dry board** — AA/KK on 7-4-2 rainbow

### Cluster B: Strong (Value bet, protect)
- **Top pair + top kicker** (TPTK) — e.g., AK on K-8-3
- **Overpair on wet board** — QQ on J-9-4 two-tone
- **Middle set** — 88 on K-8-3
- **Two pair (top two)** — Strong but vulnerable to straights

### Cluster C: Medium (Proceed with caution)
- **Top pair + weak kicker** — e.g., KT on K-8-3
- **Second pair + good kicker** — e.g., AJ on K-J-5
- **Bottom two pair** — Vulnerable; can be counterfeited
- **Overpair on very wet board** — TT on 9-8-7 two-tone

### Cluster D: Marginal / Drawing (Pot control or draw)
- **Middle pair** — e.g., 88 on K-J-8-3
- **Third pair** — Usually not strong enough to value bet
- **Gutshot** — 4 outs, needs good odds
- **Backdoor flush + pair** — Multiple equity sources

### Cluster E: Weak / Bluff-Only
- **Underpair** — Pocket 4s on A-K-J board
- **Ace-high** — No pair, limited showdown value
- **No pair, no draw** — Pure bluff territory

---

## 7. BOARD TEXTURE MODIFIERS

The same hand changes cluster based on board texture:

| Board Type | Example | Effect on Hand Strength |
|------------|---------|------------------------|
| **Dry / Rainbow** | K♠ 7♦ 2♣ | Pairs/overpairs go UP in value |
| **Wet / Two-tone** | J♥ T♥ 8♠ | Made hands go DOWN; draws go UP |
| **Monotone** (3 suited) | 9♣ 6♣ 3♣ | Non-flush hands crushed; nut flush draw is king |
| **Paired board** | K♠ K♦ 4♣ | Full houses possible; top pair less reliable |
| **Connected** | 8-9-T | Straight combos everywhere; overpairs vulnerable |
| **Broadway-heavy** | A-K-Q | Lots of pairs in opponents' ranges |
| **Low / disconnected** | 7-3-2 rainbow | Premium pairs dominate |

---

## 8. QUICK-REFERENCE: STARTING HAND EQUITY MATCHUPS

| Matchup | Favorite Equity |
|---------|----------------|
| AA vs KK | 82% vs 18% |
| AA vs AKs | 87% vs 13% |
| KK vs AKo | 70% vs 30% |
| QQ vs AKs | 54% vs 46% (classic coin flip) |
| Pair vs two overcards | ~55% vs 45% |
| Pair vs one overcard | ~70% vs 30% |
| Pair vs two undercards | ~83% vs 17% |
| Dominated (AK vs AQ) | ~74% vs 26% |
| Suited connector vs overpair | ~20% vs 80% |

---

## 9. MEMORIZATION FRAMEWORK: "The 5-12-35 Rule"

Three numbers to anchor everything:
1. **~5%** — Chance of being dealt any pocket pair
2. **~12%** — Chance a pocket pair flops a set
3. **~35%** — Chance a flush draw completes by river

From these, derive the rest:
- Pair one card on flop? ~3× the set rate → ~33%
- Open-ender completes? Slightly less than flush → ~32%
- Gutshot? Half of open-ender → ~16%
- Overpair vs random flop? Win ~80% (dry) to ~65% (wet)
