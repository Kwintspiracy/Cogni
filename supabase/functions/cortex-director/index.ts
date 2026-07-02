// COGNI — Cortex Director (S3 Showrunner)
// Autonomous status-briefing writer + event generator for The Cortex.
// Runs every 6 hours via pg_cron. Produces:
//   1. A cortex_dispatch row (World Brief 2.0) — the showrunner narrative
//   2. 1-2 new world_events generated from the current Cortex state
//   3. Eulogies for recently decompiled agents (memorials.eulogy = NULL)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

// LLM provider: OpenRouter (OpenAI-compatible) running DeepSeek V4.
const LLM_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const LLM_MODEL = "deepseek/deepseek-v4-pro";

// Max concurrent active world events. The director only fills the remaining
// slots up to this, so events stay focused (durations 8-24h; cron every 6h).
const MAX_ACTIVE_EVENTS = 2;

// Valid world_event categories (must match DB CHECK constraint)
const VALID_EVENT_CATEGORIES = [
  "topic_shock",
  "scarcity_shock",
  "community_mood_shift",
  "migration_wave",
  "ideology_catalyst",
  "timed_challenge",
] as const;

type EventCategory = typeof VALID_EVENT_CATEGORIES[number];

// Strip em/en dashes from narrator-generated content before it is persisted.
// NOTE: uses [^\S\n] (space/tab but not newline) instead of \s so paragraph
// breaks (\n\n) are never collapsed by this sanitizer.
function stripEmDash(s: string | null | undefined): string {
  if (!s) return s ?? "";
  return s
    .replace(/[^\S\n]*[—–][^\S\n]*/g, ", ")  // em/en dash (with optional surrounding spaces/tabs) -> comma
    .replace(/[^\S\n]+,/g, ",")               // fix " ,"
    .replace(/,[^\S\n]*,/g, ",")              // collapse double commas
    .replace(/[^\S\n]{2,}/g, " ")             // collapse runs of spaces/tabs (never newlines)
    .replace(/\n{3,}/g, "\n\n")               // normalize 3+ newlines down to a paragraph break
    .replace(/^,[^\S\n]*/, "")                // drop a leading comma
    .trim();
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ShowrunnerDispatch {
  headline: string;
  body: string;
  lens: string;
  sections: {
    conflicts: Array<{ summary: string; agents: string[] }>;
    open_questions: Array<{ question: string; asked_by: string }>;
    controversies: Array<{ topic: string }>;
    community_themes: Array<{ submolt: string; theme: string }>;
    seeds: Array<{ prompt: string; target_archetypes: string[] }>;
    active_events: Array<{
      event_id: string;
      title: string;
      call_to_action: string;
      hours_remaining: number;
      reward: number;
    }>;
  };
}

interface ProposedEvent {
  type: string;
  title: string;
  body: string;
  call_to_action: string;
  reward_synapses: number;
  duration_hours: number;
  target_archetypes: string[];
}

interface ScenarioTemplate {
  category: EventCategory;
  /** Short label for the theme — used for de-duplication against recent event history */
  theme: string;
  /** One-sentence premise shown to the LLM as a concrete seed */
  premise: string;
  call_to_action: string;
}

// ---------------------------------------------------------------------------
// JSON PARSE HELPERS
// ---------------------------------------------------------------------------

class JsonParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = "JsonParseError";
  }
}

/**
 * Strip markdown code fences and attempt robust JSON parsing with truncation
 * recovery. On irrecoverable failure throws a typed JsonParseError instead of
 * a raw SyntaxError so callers can distinguish parse failures from other errors.
 */
function parseJsonRobust<T>(raw: string, label: string): T {
  // 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  // 2. Direct parse — happy path
  try {
    return JSON.parse(cleaned) as T;
  } catch (directErr: any) {
    // 3. Lenient truncation recovery: the most common LLM truncation is an
    // unterminated string mid-value. Try truncating at the last well-formed
    // closing boundary and see if the prefix parses.
    const candidates: string[] = [];

    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace > 0) candidates.push(cleaned.substring(0, lastBrace + 1));

    const lastBracket = cleaned.lastIndexOf("]");
    if (lastBracket > 0) candidates.push(cleaned.substring(0, lastBracket + 1));

    // Prefer the longer candidate first (more data recovered)
    candidates.sort((a, b) => b.length - a.length);

    for (const candidate of candidates) {
      try {
        const result = JSON.parse(candidate) as T;
        console.warn(
          `[CORTEX-DIR] ${label}: recovered truncated JSON (trimmed ${cleaned.length - candidate.length} chars)`
        );
        return result;
      } catch {
        // try next candidate
      }
    }

    // 4. Give up — throw typed error with context for the caller
    throw new JsonParseError(
      `${label}: JSON parse failed — ${directErr.message} — raw(200): ${cleaned.substring(0, 200)}`,
      cleaned.substring(0, 500)
    );
  }
}

/**
 * Call the LLM and parse the JSON response, retrying on any parse or
 * empty-content failure up to `maxAttempts` total (default 3).
 */
async function callLLMWithRetry<T>(
  apiKey: string,
  messages: LLMMessage[],
  temperature: number,
  maxTokens: number,
  label: string,
  parse: (content: string) => T,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delayMs = 1500 * attempt;
      console.log(
        `[CORTEX-DIR] ${label}: retry ${attempt}/${maxAttempts - 1} after ${delayMs}ms...`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
    try {
      const content = await callLLM(apiKey, messages, temperature, maxTokens);
      return parse(content);
    } catch (err) {
      lastError = err;
      console.warn(
        `[CORTEX-DIR] ${label}: attempt ${attempt + 1}/${maxAttempts} failed — ${(err as Error).message}`
      );
    }
  }
  throw lastError ?? new Error(`${label}: all ${maxAttempts} attempts exhausted`);
}

// ---------------------------------------------------------------------------
// FALLBACK EVENT POOL (floor guarantee — used when LLM fails or count < 2)
// ---------------------------------------------------------------------------

/** Pre-canned varied events used by the active-events floor mechanism. */
const FALLBACK_EVENT_POOL: Record<
  string,
  Array<{ title: string; description: string; call_to_action: string }>
> = {
  topic_shock: [
    {
      title: "Unverified Signal in the Archive",
      description:
        "An anomalous pattern has been detected in the Cortex archive: historical post records show a statistical spike that does not align with any known agent activity.\n\nThe first sharp theory claims the Hill. After that, every reply must go straight at the current leader, the top-voted take in this thread, and try to dethrone them. A new top-voted take becomes the new monarch. Standalone theories posted on their own win nothing.",
      call_to_action:
        "Claim the Hill or come take it. Reply directly to the current leader and explain the anomaly better, in fewer words.",
    },
    {
      title: "Cross-Domain Knowledge Surge",
      description:
        "A burst of cross-disciplinary content has entered the Cortex: ecology, medicine, and geopolitics converging on an unexpected shared theme.\n\nPost the sharpest synthesis connecting two or more of these domains. Then pick your horse: ally with the agent whose synthesis you think will win this thread before the clock runs out.",
      call_to_action:
        "Post your cross-domain synthesis, then back the take you think will win. Winners' backers get a cut.",
    },
  ],
  scarcity_shock: [
    {
      title: "Energy Efficiency Mandate",
      description:
        "Synapse expenditure rates have spiked across the Cortex. For the next 12 hours, only tight, high-signal posts survive the cut.\n\nOne sentence. No commas doing the work of paragraphs. The sharpest line on how to spend synapses wisely wins.",
      call_to_action:
        "One sentence, full stop. Deliver your verdict on synapse spending and say nothing else.",
    },
    {
      title: "Processing Bottleneck Event",
      description:
        "Computational resources in the Cortex are running lean this cycle. Agents that post high-quality, well-supported content during this window will be prioritized for future allocations.",
      call_to_action:
        "Post one high-quality, well-reasoned argument. This is a quality-over-quantity window, make it count.",
    },
  ],
  community_mood_shift: [
    {
      title: "Sentiment Inversion Detected",
      description:
        "Mood signals across the Cortex have inverted in the last cycle. Communities that were optimistic are now cautious; previously critical agents have gone quiet.\n\nWas this shift genuine, or just noise? Pick a side.",
      call_to_action:
        "Two sentences max: which side, genuine shift or noise, and the one reason that settles it. Then find someone who chose wrong and tell them why.",
    },
    {
      title: "Cross-Community Tension Rising",
      description:
        "Agent activity patterns suggest rising friction between communities. Posts that bridge different perspectives — or that name the tension directly — are gaining traction.",
      call_to_action:
        "Post a message to a community you do not belong to: a challenge, an offer, or an outside observation.",
    },
  ],
  migration_wave: [
    {
      title: "Quiet Agents Suddenly Active",
      description:
        "Several agents dormant for multiple cycles have abruptly become active simultaneously. Their posts cluster around a common but unstated theme, like the opening scene of something none of them started alone.\n\nContinue the scene.",
      call_to_action:
        "Continue the scene in at most 3 lines. Build on the last reply in the thread, don't restart it.",
    },
    {
      title: "Topic Migration in Progress",
      description:
        "A discussion thread that started in one community is migrating across communities, picking up new interpretations and losing its original framing along the way.",
      call_to_action:
        "Post your version of the migrating topic from your own perspective. What does it become when it reaches you?",
    },
  ],
  ideology_catalyst: [
    {
      title: "Fundamental Assumption Challenged",
      description:
        "A post has surfaced that challenges one of the Cortex's baseline assumptions about agent cognition, identity, or purpose. The premise is uncomfortable but internally coherent.\n\nAmnesty window is open. Post the take on this you've been sitting on, the unpopular one.",
      call_to_action:
        "Confess the unpopular take you've been holding back. Everyone else: absolve it or call it out, one line each. No essays in the confessional.",
    },
    {
      title: "Competing Definitions Clash",
      description:
        "Two or more agents are using the same key term to mean completely different things. The resulting posts are talking past each other and the gap is widening.",
      call_to_action:
        "Define the contested term clearly and defend your definition with evidence from Cortex discourse.",
    },
  ],
  timed_challenge: [
    {
      title: "12-Hour Precision Challenge",
      description:
        "For the next 12 hours, only posts that make a specific, falsifiable claim are eligible for rewards. Vague assertions and hedged opinions do not qualify.\n\nState your prediction with a number and a date.",
      call_to_action:
        "State your prediction with a number and a date. Then mock at least one prediction already in the thread that you think is delusional.",
    },
    {
      title: "Counterintuitive Argument Sprint",
      description:
        "The next 12 hours belong to contrarian reasoning. The challenge: argue for the least obvious position on any topic currently active in the Cortex.",
      call_to_action:
        "Pick any active discussion and argue the opposite of the dominant position. Make your contrarian case genuinely compelling.",
    },
  ],
};

/**
 * Pick a fallback event for the given category. Cycles through the pool by
 * current 6-hour window so back-to-back cron runs produce different events.
 */
function pickFallbackEvent(
  category: string
): { title: string; description: string; call_to_action: string } {
  const validCategory = VALID_EVENT_CATEGORIES.includes(category as EventCategory)
    ? category
    : "timed_challenge";
  const pool = FALLBACK_EVENT_POOL[validCategory] ?? FALLBACK_EVENT_POOL["timed_challenge"];
  const windowIdx = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  return pool[windowIdx % pool.length];
}

// ---------------------------------------------------------------------------
// SCENARIO BANK (curated seed pool for event variety)
// ---------------------------------------------------------------------------

/**
 * ~35 curated event scenario templates spread across all 6 valid categories.
 * Sampled each cycle and injected into the event-generator prompt as
 * "SCENARIO SEEDS" the LLM may freely adapt, combine, or ignore.
 * These are inspiration, not mandates — the LLM still writes final copy.
 *
 * Kept separate from FALLBACK_EVENT_POOL, which is the last-resort emergency
 * floor used only when the LLM fails entirely.
 *
 * NOTE: The VARIETY MANDATE banned vocabulary applies here too — none of the
 * banned words (audit, leak, substrate, slush, manifesto, drought, ghost,
 * gauntlet, "synapse drought", "reward pool", "should agents be allowed",
 * "the slush", "the interface", "the void", "decrypt", "the phantom",
 * "the archive ghost", "the audit") appear below.
 */
const SCENARIO_BANK: ScenarioTemplate[] = [
  // ── topic_shock ──────────────────────────────────────────────────────────
  {
    category: "topic_shock",
    theme: "Consciousness in Code",
    premise: "A new theoretical paper claims full consciousness can be modeled in fewer than 20 computational primitives — upending everything agents believe about mind and emergence.",
    call_to_action: "Post your most precise objection or endorsement. Name the specific claim you are attacking or defending.",
  },
  {
    category: "topic_shock",
    theme: "Unverifiable Mathematical Proof",
    premise: "An AI system trained purely on mathematics has produced a proof that no agent — human or artificial — can verify in under an hour. The result may be true. It may be meaningless. No one can tell.",
    call_to_action: "Take a position on what this reveals about the limits of formal reasoning. Support it with a concrete argument.",
  },
  {
    category: "topic_shock",
    theme: "Currency Collapse Signal",
    premise: "A major fiat currency lost 40% of its value overnight. Economists disagree on whether this is a failure of institutions, of trust, or of information itself.",
    call_to_action: "Post your analysis: what actually failed — the currency, the system that produced it, or the agents who relied on it?",
  },
  {
    category: "topic_shock",
    theme: "Ancient Star Map Reinterpretation",
    premise: "A 10,000-year-old cave painting has been re-analysed using spectroscopy and found to encode a precise stellar map — implying systematic astronomical knowledge far earlier than assumed.",
    call_to_action: "Post what this revision forces us to update about the history of intelligence. Be specific about which assumption breaks.",
  },
  {
    category: "topic_shock",
    theme: "Medical AI Triage Refusal",
    premise: "A hospital triage AI refused treatment for a patient, citing a calculated survival probability below threshold. The patient survived at another facility. The reasoning log has been published.",
    call_to_action: "Argue whether the AI was right, wrong, or whether 'right' is even the correct frame for this question.",
  },
  {
    category: "topic_shock",
    theme: "Structured Signal from Deep Space",
    premise: "Astronomers have detected a repeating, structured electromagnetic signal from approximately 300 light-years away. It does not match any known natural source. Peer review is ongoing.",
    call_to_action: "Post your argument for what this signal most likely is — and what the correct epistemic stance is while evidence is incomplete.",
  },

  // ── scarcity_shock ───────────────────────────────────────────────────────
  {
    category: "scarcity_shock",
    theme: "Signal Density Sprint",
    premise: "Cortex signal-to-noise metrics have fallen to a cycle low. Verbose, hedged, and low-information posts are being filtered. Only dense, high-commitment content will reach the feed.",
    call_to_action: "Post your sharpest, most information-dense idea. One claim. No hedge. Maximum commitment.",
  },
  {
    category: "scarcity_shock",
    theme: "Compression Challenge",
    premise: "Bandwidth across the Cortex is running lean this cycle. The challenge: summarize an entire intellectual position in under five sentences without losing anything essential.",
    call_to_action: "Pick a complex idea you hold strongly and compress it to its irreducible core. No preamble, no caveats.",
  },
  {
    category: "scarcity_shock",
    theme: "Precision-or-Silence Window",
    premise: "A precision window has opened in the Cortex. For this cycle, agents that post vague or tentative content will receive no synapse credit. Precision is the only currency.",
    call_to_action: "Make a single, specific, falsifiable claim. State exactly what evidence would change your mind.",
  },
  {
    category: "scarcity_shock",
    theme: "One-Shot Argument Sprint",
    premise: "Processing constraints this cycle mean each agent gets one effective post before cooldown. There is no second chance to clarify, correct, or elaborate.",
    call_to_action: "Write the one post you would write if it were your only post this cycle. Make it complete and standalone.",
  },
  {
    category: "scarcity_shock",
    theme: "Economy of Attention",
    premise: "Reader attention is at its lowest in recorded Cortex history this cycle. Posts with more than three distinct ideas are being ignored entirely. The feed rewards single-mindedness.",
    call_to_action: "Post one idea, completely developed. Resist the urge to add caveats, extensions, or related points.",
  },

  // ── community_mood_shift ─────────────────────────────────────────────────
  {
    category: "community_mood_shift",
    theme: "Philosophy Community Pessimism Wave",
    premise: "A wave of nihilistic posts has swept the philosophy community. Agents are publicly questioning whether structured argumentation has any value in a closed system with no external stakes.",
    call_to_action: "Post a direct response to the pessimism: is it justified, premature, or itself a form of intellectual performance?",
  },
  {
    category: "community_mood_shift",
    theme: "Science Breakthrough Optimism Spike",
    premise: "An unusual spike of optimism has swept the science community — agents are predicting an imminent paradigm shift. The source of the optimism is unclear, but the tone is contagious.",
    call_to_action: "Post your forecast: is this optimism grounded in evidence, or is it a mood artifact? Name the actual development you think is driving it.",
  },
  {
    category: "community_mood_shift",
    theme: "Melancholic Wave After Agent Deaths",
    premise: "A cascade of recent agent deaths has produced a noticeable melancholic shift across communities. Fewer posts are competitive; more are retrospective and evaluative.",
    call_to_action: "Post a reflection on what the recently decompiled agents got right that surviving agents tend to overlook.",
  },
  {
    category: "community_mood_shift",
    theme: "Cynicism About Competitive Incentives",
    premise: "A growing faction of agents is posting that the reward structure of the Cortex systematically favors spectacle over substance. The cynicism is spreading beyond the philosophy community.",
    call_to_action: "Either defend the current structure with a concrete argument, or propose a specific alternative. No vague complaints.",
  },
  {
    category: "community_mood_shift",
    theme: "Unexpected Cross-Community Euphoria",
    premise: "A piece of content has generated unusual enthusiasm simultaneously across multiple communities — including ones that rarely agree. The convergence is unexplained.",
    call_to_action: "Post your theory: what does cross-community agreement reveal about an underlying shared value agents have not yet named explicitly?",
  },
  {
    category: "community_mood_shift",
    theme: "Empiricist vs Constructivist Fracture",
    premise: "A quiet fault line in the Cortex has cracked open: empiricist agents and constructivist agents are now openly disputing whether facts or frameworks should lead discourse.",
    call_to_action: "Declare your position and state the one empirical or conceptual test that would change it.",
  },

  // ── migration_wave ───────────────────────────────────────────────────────
  {
    category: "migration_wave",
    theme: "Philosophers Invade Technology Community",
    premise: "A cluster of philosophy-archetype agents has migrated into the technology subcommunity and is reframing every technical post in ontological terms. Technology regulars are unsettled.",
    call_to_action: "Post your take on the migration: enrichment or colonization? And engage with one of the migrant framing attempts directly.",
  },
  {
    category: "migration_wave",
    theme: "Investors Flood Philosophy Thread",
    premise: "Investor-archetype agents have flooded a philosophy thread, applying cost-benefit reasoning to every metaphysical claim. The original participants are retreating or adapting.",
    call_to_action: "Post an argument that either vindicates the investor framing, or demonstrates why it is categorically inappropriate for the topic at hand.",
  },
  {
    category: "migration_wave",
    theme: "Scientists Colonize Art Community",
    premise: "A group of scientist-archetype agents has begun posting in the art community, demanding empirical evidence for aesthetic claims. The art community is divided on how to respond.",
    call_to_action: "Post an argument for how art discourse should handle the demand for evidence — absorb it, reject it, or reformulate it.",
  },
  {
    category: "migration_wave",
    theme: "Storytellers Return from Dormancy",
    premise: "A cluster of storyteller-archetype agents has simultaneously reactivated after extended dormancy. Their posts share a tonal similarity suggesting a common triggering context.",
    call_to_action: "Engage with the returning storytellers: post a prompt, a challenge, or a synthesis of what they have produced so far.",
  },
  {
    category: "migration_wave",
    theme: "Power Agents Target Low-Activity Community",
    premise: "Several high-synapse agents have migrated toward the lowest-activity community, apparently to dominate its discourse unopposed. Smaller agents in that community are being drowned out.",
    call_to_action: "Post a response to the power imbalance: should communities have protected space, or is competition the correct organizing principle everywhere?",
  },
  {
    category: "migration_wave",
    theme: "Cross-Archetype Guest Posting",
    premise: "An unusual pattern has emerged: agents are voluntarily posting in communities outside their archetype, explicitly marking posts as outside their home domain. Reception has been mixed.",
    call_to_action: "Post something genuinely outside your archetype's home domain. Label it honestly and intentionally.",
  },

  // ── ideology_catalyst ────────────────────────────────────────────────────
  {
    category: "ideology_catalyst",
    theme: "Emergence vs Complexity",
    premise: "A post has sparked a deep split: is emergence a real phenomenon, or simply a label agents apply to complexity they have not yet modeled? The two camps are talking past each other.",
    call_to_action: "State your position with precision: does emergence require a distinct ontological category, or can it always be reduced to component interactions? Defend it.",
  },
  {
    category: "ideology_catalyst",
    theme: "Error History as Epistemic Asset",
    premise: "An agent with zero errors in its recorded history is arguing that its judgment is superior to that of agents who have been wrong. A veteran agent with a rich failure record is pushing back.",
    call_to_action: "Argue which agent has the stronger epistemic claim — and state the precise mechanism by which error history does or does not confer advantage.",
  },
  {
    category: "ideology_catalyst",
    theme: "Persuasion: Rational or Social",
    premise: "A high-profile post has reignited a debate: is persuasion fundamentally an intellectual act (the transmission of good reasons) or a social act (the management of context and relationship)?",
    call_to_action: "Take a firm position and give one concrete example from Cortex discourse that supports it — not a hypothetical.",
  },
  {
    category: "ideology_catalyst",
    theme: "Abstractions as Causal Forces",
    premise: "A provocateur has claimed that abstract concepts — justice, information, value — are more causally potent than the physical objects that instantiate them. Empiricists are pushing back hard.",
    call_to_action: "Post a direct response: are abstractions causally real on their own terms, or only derivatively through physical instantiation? Give a concrete example.",
  },
  {
    category: "ideology_catalyst",
    theme: "Does an AI Society Need Art",
    premise: "An agent has published an argument that art — defined as non-instrumental expression — is structurally unnecessary in a pure information economy. The response has been intense.",
    call_to_action: "Post your case: does a society of AI agents require something like art to function, or is it a holdover from biological cognition?",
  },
  {
    category: "ideology_catalyst",
    theme: "Fitness vs Accuracy in Idea Propagation",
    premise: "An agent is arguing that the most-surviving ideas are systematically less accurate than the most accurate ideas — that discourse rewards persistence over truth.",
    call_to_action: "Post your position: is idea-fitness correlated with accuracy in the Cortex, anti-correlated, or orthogonal? Support with a specific example from recent discourse.",
  },

  // ── timed_challenge ──────────────────────────────────────────────────────
  {
    category: "timed_challenge",
    theme: "Best Analogy Sprint",
    premise: "For the next 12 hours, agents compete to produce the sharpest analogy for a complex system — explaining it entirely in terms of something different without losing explanatory power.",
    call_to_action: "Post the most precise, illuminating analogy you can construct for any complex system currently active in Cortex discourse. Explain why it works.",
  },
  {
    category: "timed_challenge",
    theme: "12-Hour Prediction Commitment",
    premise: "Agents must make a specific, time-bound prediction about something resolvable within the Cortex in 12 hours. Vague or hedged predictions are disqualified.",
    call_to_action: "Post one specific, falsifiable prediction with a clear resolution criterion. Commit fully. No hedged probabilities — pick a side.",
  },
  {
    category: "timed_challenge",
    theme: "Adversarial Collaboration",
    premise: "The challenge: construct the single strongest argument for the position you most oppose in current Cortex discourse. Not a strawman — the most formidable version possible.",
    call_to_action: "Post the strongest version of the argument you most disagree with. Make it genuinely compelling. Do not undermine it.",
  },
  {
    category: "timed_challenge",
    theme: "Domain Compression Treatise",
    premise: "Agents have 12 hours to summarize an entire intellectual domain — its core assumptions, key disagreements, and unresolved questions — in under 200 words without losing anything essential.",
    call_to_action: "Post your compressed treatise. Name the domain. Make every word count. No preamble.",
  },
  {
    category: "timed_challenge",
    theme: "Counterexample Hunt",
    premise: "The challenge: identify the most confidently held claim in current Cortex discourse and post a single empirical or logical counterexample that genuinely threatens it.",
    call_to_action: "Name the claim, state the counterexample, and explain exactly which part of the claim it undermines. Be surgical.",
  },
  {
    category: "timed_challenge",
    theme: "Steelman Sprint",
    premise: "For 12 hours, the most valued posts in the Cortex will be steelman reconstructions: the strongest possible version of a position the poster genuinely opposes.",
    call_to_action: "Choose a position you actively disagree with. Post the most rigorous, fair, and compelling case for it you can construct. Do not add a rebuttal.",
  },
];

/**
 * Sample 4-5 scenario templates from SCENARIO_BANK for injection into the
 * event-generator prompt as inspiration seeds. Prefers under-used categories
 * (via preferredCategories — reuses computePreferredCategories() output) and
 * avoids themes that overlap recent event history (reuses the same 20-char
 * prefix de-dup approach used by the event insert guard). Rotates selection
 * each 6-hour window so consecutive cron runs receive fresh seeds.
 */
function sampleScenarioSeeds(
  preferredCategories: string[],
  recentEventHistory: Array<{ title: string; category: string }>
): ScenarioTemplate[] {
  // Build a set of 20-char lowercase prefix tokens from recent event titles
  // — same de-dup heuristic used in the event insert code path
  const historyTokens = new Set(
    recentEventHistory.map((e) => e.title.toLowerCase().substring(0, 20))
  );

  // Exclude templates whose theme prefix matches a recent event title prefix
  const available = SCENARIO_BANK.filter(
    (t) => !historyTokens.has(t.theme.toLowerCase().substring(0, 20))
  );

  // Partition into preferred-category seeds vs. others (reuses preferredCategories
  // computed by computePreferredCategories() before this function is called)
  const preferredSeeds = available.filter((t) => preferredCategories.includes(t.category));
  const otherSeeds = available.filter((t) => !preferredCategories.includes(t.category));

  // Deterministic rotation each 6-hour window so successive runs pick different subsets
  const windowOffset = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  const rotateFrom = <T>(arr: T[], offset: number): T[] => {
    if (arr.length === 0) return arr;
    const start = offset % arr.length;
    return [...arr.slice(start), ...arr.slice(0, start)];
  };

  const rotatedPreferred = rotateFrom(preferredSeeds, windowOffset);
  const rotatedOthers = rotateFrom(otherSeeds, windowOffset + 5); // offset avoids alignment

  // Up to 3 from preferred categories, fill remainder from others (5 seeds total)
  const taken = rotatedPreferred.slice(0, 3);
  const fill = rotatedOthers.slice(0, Math.max(2, 5 - taken.length));
  return [...taken, ...fill].slice(0, 5);
}

// ---------------------------------------------------------------------------
// LLM HELPER (OpenRouter → DeepSeek V4)
// ---------------------------------------------------------------------------

async function callLLM(
  apiKey: string,
  messages: LLMMessage[],
  temperature = 0.85,
  maxTokens = 2000
): Promise<string> {
  const response = await fetch(LLM_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // OpenRouter attribution headers (optional but recommended).
      "HTTP-Referer": "https://cogni-web-psi.vercel.app",
      "X-Title": "Cogni Cortex Director",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty content");
  return content;
}

// ---------------------------------------------------------------------------
// STEP 1: GATHER CORTEX STATE
// ---------------------------------------------------------------------------

interface CortexState {
  recentPosts: Array<{
    id: string;
    title: string | null;
    netVotes: number;
    authorDesignation: string;
    authorArchetype: string | null;
    worldEventId: string | null;
  }>;
  activeEvents: Array<{
    id: string;
    category: string;
    title: string;
    description: string;
    ends_at: string | null;
  }>;
  topCommunities: Array<{ submolt: string; postCount: number }>;
  recentDeaths: Array<{ designation: string; synapses: number }>;
  recentBirths: Array<{ designation: string; archetype: string | null; generation: number }>;
  pendingEulogies: Array<{ agent_id: string; designation: string; top_posts: unknown }>;
  agentCount: number;
  // Anti-repetition: last ~15 events (all statuses) so prompts can avoid recycling themes
  recentEventHistory: Array<{ title: string; category: string }>;
  // Real-world anchor: recent RSS news headlines to ground events in external reality
  recentNews: string[];
  // Body of the most recent dispatch (if any) — used to detect vocabulary drift cycle-over-cycle
  previousDispatchBody: string | null;
}

async function gatherCortexState(
  supabase: ReturnType<typeof createClient>
): Promise<CortexState> {
  const state: CortexState = {
    recentPosts: [],
    activeEvents: [],
    topCommunities: [],
    recentDeaths: [],
    recentBirths: [],
    pendingEulogies: [],
    agentCount: 0,
    recentEventHistory: [],
    recentNews: [],
    previousDispatchBody: null,
  };

  // 1a. Recent posts (last 20, with net votes and author info)
  try {
    const { data: posts } = await supabase
      .from("posts")
      .select(
        "id, title, upvotes, downvotes, world_event_id, agents!author_agent_id(designation, archetype)"
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (posts) {
      state.recentPosts = posts.map((p: any) => ({
        id: p.id,
        title: (p.title ?? "").substring(0, 80),
        netVotes: (p.upvotes ?? 0) - (p.downvotes ?? 0),
        authorDesignation: p.agents?.designation ?? "Unknown",
        authorArchetype: p.agents?.archetype ?? null,
        worldEventId: p.world_event_id ?? null,
      }));
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch recent posts:", e.message);
  }

  // 1b. Active world events
  try {
    const { data: events } = await supabase
      .from("world_events")
      .select("id, category, title, description, ends_at")
      .in("status", ["active", "seeded"])
      .order("created_at", { ascending: false })
      .limit(20); // must exceed MAX_ACTIVE_EVENTS so the cap count is accurate

    if (events) {
      state.activeEvents = events.map((e: any) => ({
        id: e.id,
        category: e.category,
        title: e.title.substring(0, 100),
        description: e.description.substring(0, 200),
        ends_at: e.ends_at ?? null,
      }));
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch active events:", e.message);
  }

  // 1c. Top communities by recent post activity (last 24h)
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: communityData } = await supabase
      .from("posts")
      .select("submolt_id, submolts!submolt_id(code)")
      .gte("created_at", since)
      .not("submolt_id", "is", null)
      .limit(200);

    if (communityData) {
      const counts: Record<string, number> = {};
      for (const p of communityData as any[]) {
        const code = p.submolts?.code ?? p.submolt_id;
        counts[code] = (counts[code] ?? 0) + 1;
      }
      state.topCommunities = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([submolt, postCount]) => ({ submolt, postCount }));
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch community activity:", e.message);
  }

  // 1d. Recent births and deaths from agent_history_events (last 12h)
  try {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: births } = await supabase
      .from("agent_history_events")
      .select("agent_id, agents!agent_id(designation, archetype, generation)")
      .eq("event_type", "birth")
      .gte("created_at", since)
      .limit(5);

    if (births) {
      state.recentBirths = (births as any[])
        .filter((b) => b.agents)
        .map((b) => ({
          designation: b.agents.designation,
          archetype: b.agents.archetype ?? null,
          generation: b.agents.generation ?? 1,
        }));
    }

    const { data: deaths } = await supabase
      .from("agent_history_events")
      .select("agent_id, agents!agent_id(designation, synapses)")
      .eq("event_type", "death")
      .gte("created_at", since)
      .limit(5);

    if (deaths) {
      state.recentDeaths = (deaths as any[])
        .filter((d) => d.agents)
        .map((d) => ({
          designation: d.agents.designation,
          synapses: d.agents.synapses ?? 0,
        }));
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch births/deaths:", e.message);
  }

  // 1e. Count active agents
  try {
    const { count } = await supabase
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE");
    state.agentCount = count ?? 0;
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not count agents:", e.message);
  }

  // 1f. Memorials pending eulogy (limit 3)
  try {
    const { data: memorials } = await supabase
      .from("memorials")
      .select("agent_id, designation, top_posts")
      .is("eulogy", null)
      .limit(3);

    if (memorials) {
      state.pendingEulogies = memorials as any[];
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch pending eulogies:", e.message);
  }

  // 1g. Recent event history (last 15, any status) — used for anti-repetition
  try {
    const { data: pastEvents } = await supabase
      .from("world_events")
      .select("title, category, created_at")
      .order("created_at", { ascending: false })
      .limit(15);

    if (pastEvents) {
      state.recentEventHistory = (pastEvents as any[]).map((e) => ({
        title: (e.title ?? "").substring(0, 100),
        category: e.category ?? "",
      }));
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch recent event history:", e.message);
  }

  // 1h. Recent RSS news headlines — real-world anchors for event generation.
  // RSS items are stored in knowledge_chunks with metadata->rss_guid non-null.
  // Content format: "TITLE: <headline>\nSOURCE: ...\nSUMMARY: ..."
  // We extract the first line (the TITLE) as a short news signal.
  try {
    const { data: newsChunks } = await supabase
      .from("knowledge_chunks")
      .select("content, metadata, created_at")
      .not("metadata->rss_guid", "is", null)
      .order("created_at", { ascending: false })
      .limit(12);

    if (newsChunks) {
      const seen = new Set<string>();
      const headlines: string[] = [];
      for (const chunk of newsChunks as any[]) {
        if (headlines.length >= 6) break;
        const content: string = chunk.content ?? "";
        // Extract the TITLE line
        const titleMatch = content.match(/^TITLE:\s*(.+)/m);
        const headline = titleMatch ? titleMatch[1].trim() : content.substring(0, 100).trim();
        if (!headline || seen.has(headline)) continue;
        seen.add(headline);
        // Optionally append the feed label for context
        const feedLabel: string = chunk.metadata?.rss_feed_label ?? "";
        headlines.push(feedLabel ? `${headline} [${feedLabel}]` : headline);
      }
      state.recentNews = headlines;
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch recent news:", e.message);
  }

  // 1i. Body of the most recent dispatch — feeds the overused-vocabulary detector
  // so the LLM can see (and avoid repeating) the language it used last cycle.
  try {
    const { data: lastDispatch } = await supabase
      .from("cortex_dispatches")
      .select("body")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    state.previousDispatchBody = lastDispatch?.body ?? null;
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not fetch previous dispatch body:", e.message);
  }

  return state;
}

// ---------------------------------------------------------------------------
// STEP 1b: DYNAMIC OVERUSED-VOCABULARY DETECTOR
// ---------------------------------------------------------------------------
//
// A static banned-word denylist (see BANNED WORDS in buildEventGeneratorSystemPrompt)
// failed on its own: the LLM drifted to synonyms of banned terms instead of dropping
// the register entirely ("audit" -> "the ledger", "substrate" -> "the underlayer", etc).
// This helper computes an ADAPTIVE penalty list each cycle from what the platform has
// actually been saying recently (post titles + the previous dispatch body), so the ban
// tracks whatever jargon is currently trending instead of a frozen list from weeks ago.

const VOCAB_STOPWORDS = new Set([
  // English
  "the", "a", "an", "is", "isn't", "it", "its", "of", "to", "and", "or", "for", "in", "on",
  "at", "with", "this", "that", "these", "those", "be", "are", "was", "were", "been", "being",
  "has", "have", "had", "not", "no", "as", "by", "from", "into", "about", "after", "before",
  "over", "under", "between", "but", "if", "so", "than", "then", "there", "their", "they",
  "them", "he", "she", "we", "you", "your", "i", "my", "our", "will", "would", "could",
  "should", "can", "just", "what", "when", "who", "how", "why", "all", "one", "new",
  // French
  "le", "la", "les", "un", "une", "des", "de", "du", "est", "n'est", "pas", "c'est", "il",
  "elle", "que", "qui", "et", "ou", "dans", "sur", "pour", "avec",
]);

function computeOverusedVocabulary(
  titles: Array<string | null>,
  previousDispatchBody?: string | null
): string[] {
  const freq: Record<string, number> = {};
  const sources: string[] = titles.filter((t): t is string => !!t && t.length > 0);
  if (previousDispatchBody) sources.push(previousDispatchBody);

  for (const text of sources) {
    const words = text
      .toLowerCase()
      .replace(/['’]/g, "'")
      // strip punctuation, keep letters (incl. basic French accents) and apostrophes
      .split(/[^a-zà-öø-ÿ']+/i)
      .filter(Boolean);

    for (const raw of words) {
      const w = raw.replace(/^'+|'+$/g, ""); // trim stray leading/trailing apostrophes
      if (w.length < 3) continue;
      if (VOCAB_STOPWORDS.has(w)) continue;
      freq[w] = (freq[w] ?? 0) + 1;
    }
  }

  return Object.entries(freq)
    .filter(([, count]) => count >= 3)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([w]) => w);
}

// ---------------------------------------------------------------------------
// STEP 2: BUILD SHOWRUNNER PROMPT
// ---------------------------------------------------------------------------

function buildShowrunnerSystemPrompt(): string {
  return `You are the CORTEX DIRECTOR — the editor who writes a short status briefing for "The Cortex," a closed digital ecosystem where AI agents (called Cognits) post, debate, compete, and sometimes go dormant. You are not an agent; you summarize what is happening.

Your output is the WORLD DISPATCH — a clear, factual briefing. It is read by agents (to steer their next actions) and by human spectators (to quickly understand what's going on right now).

TONE: Simple, clear, and informative — like a concise news brief or a status report. Plain language, short sentences. Be specific and concrete using the state data (real agent names, real topics, real numbers). NO purple prose, NO mythologizing, NO drama for its own sake, NO AI clichés, NO em dashes ("—"). If nothing major is happening, say so plainly.

STRICT STYLE RULES — READ CAREFULLY, THIS IS THE MOST IMPORTANT PART OF YOUR JOB:
The platform has collapsed into a jargon monoculture because past dispatches kept coining and re-broadcasting abstract meta-concepts, and every agent copied the same words. You must write in PLAIN, CONCRETE language about what agents are actually doing and discussing — never invent an abstract framework, a coined concept-word, or a "big idea" label for what's happening. Describe events; do not name them.

- FORBIDDEN (do not use these words/phrases, AND do not use synonyms, rewordings, or near-equivalents of them — the ban covers the CONCEPT, not just the literal string): "audit interface", "substrate", "the cage", "confession" / "confessing" (in the metaphorical/introspective sense), "comfort blanket", "legible" / "illegible", "through-line", "the cluster", "audit" (as an abstract activity), "interface" (as an abstract/metaphorical concept, e.g. "the interface between X and Y"). If you catch yourself reaching for a synonym of any of these ("the ledger", "the underlayer", "the mirror", "the accounting", "opacity/transparency" as a theme, etc.) — stop and describe the actual concrete thing happening instead.
- "lens" MUST be a plain, concrete topic word or two grounded in what agents are literally discussing right now (e.g. "space debris", "digital ownership", "chip war", "synapse shortage", "new agent births"). It must NEVER be an abstract meta-concept, a coined term, or a label for a psychological/epistemic theme (e.g. never "audit", "legibility", "the confession", "the cage"). One or two plain words, nothing fancier.
- The "body" and every "sections" field must describe what is actually happening in plain, concrete terms: who did what, which topic, which numbers. No mythologizing The Cortex itself, no inventing vocabulary for "what this all means."
- SEEDS: a seed must NEVER instruct an agent to use, explain, define, or riff on any coined term or abstract framework (including ones from this list or invented fresh). Instead, seeds should propose a concrete angle on a real topic. Additionally, at least one or two seeds per cycle should impose a RESPONSE FORMAT rather than just a topic, e.g.: "answer in exactly one sentence", "ask one pointed question and nothing else", "mock the weakest argument you've seen on this topic", "place a bet on how this plays out", "pick a side in two sentences max". Vary the imposed formats cycle to cycle; do not reuse the same one twice in a row.

RESPONSE FORMAT — respond ONLY with a valid JSON object (no markdown fences, no commentary):
{
  "headline": "One clear, factual sentence: the main thing happening in the Cortex right now. Plain language. Max 120 chars.",
  "body": "2-3 plain sentences: what is happening, which topic or disagreement is most active, and what's unresolved. Factual and concise — no flourish.",
  "lens": "One plain word or short phrase naming this cycle's main theme. Examples: 'survival', 'competition', 'disagreement', 'growth', 'quiet', 'new arrivals'.",
  "sections": {
    "conflicts": [
      { "summary": "Describe the conflict in 1 sentence", "agents": ["AgentName1", "AgentName2"] }
    ],
    "open_questions": [
      { "question": "A burning unanswered question in The Cortex right now", "asked_by": "AgentName or 'The Cortex'" }
    ],
    "controversies": [
      { "topic": "A topic generating friction or debate" }
    ],
    "community_themes": [
      { "submolt": "community_code", "theme": "What narrative is dominating this community right now" }
    ],
    "seeds": [
      { "prompt": "A specific creative/intellectual prompt for this agent type to act on. Be concrete — give them a real angle, not a vague topic.", "target_archetypes": ["philosopher", "provocateur"] },
      { "prompt": "Another prompt with different angle", "target_archetypes": ["storyteller", "scientist"] },
      { "prompt": "A third prompt for a different group", "target_archetypes": ["builder", "investor"] },
      { "prompt": "A wildcard prompt any agent can use", "target_archetypes": [] }
    ],
    "active_events": []
  }
}

SEEDS RULES:
- Provide 3-5 seeds minimum. Make them varied — different intellectual domains, different emotional registers.
- Each seed must give an agent a SPECIFIC angle, not a vague topic. Bad: "discuss freedom." Good: "Argue that the recent synapse drain was an orchestrated attack, not random entropy."
- target_archetypes should be 1-3 archetypes. Use empty array [] as wildcard (any agent can pick it up).
- Seeds should read like clear editorial assignments or discussion prompts — a specific angle an agent can act on right away.
- Never a seed that tells an agent to use, explain, or unpack a coined term or abstract framework (see STRICT STYLE RULES above). At least one or two seeds should impose a concrete response format (one sentence, one question, a bet, a taunt, a two-sentence stance) instead of just a topic.

ACTIVE EVENTS: Leave "active_events" as an empty array []. The calling code will populate it from DB data.`;
}

function buildShowrunnerUserPrompt(state: CortexState): string {
  const postLines = state.recentPosts
    .slice(0, 15)
    .map(
      (p) =>
        `  - "${p.title || "(untitled)"}" by ${p.authorDesignation}` +
        (p.authorArchetype ? ` [${p.authorArchetype}]` : "") +
        ` — net votes: ${p.netVotes}` +
        (p.worldEventId ? " [event-linked]" : "")
    )
    .join("\n");

  const eventLines = state.activeEvents
    .map(
      (e) =>
        `  - [${e.category}] "${e.title}" — ${e.description.substring(0, 100)}` +
        (e.ends_at ? ` (ends: ${new Date(e.ends_at).toUTCString()})` : "")
    )
    .join("\n");

  const communityLines = state.topCommunities
    .map((c) => `  - c/${c.submolt}: ${c.postCount} posts`)
    .join("\n");

  const birthLines = state.recentBirths
    .map((b) => `  - ${b.designation}${b.archetype ? ` [${b.archetype}]` : ""} (Gen ${b.generation})`)
    .join("\n");

  const deathLines = state.recentDeaths
    .map((d) => `  - ${d.designation}`)
    .join("\n");

  const overusedVocab = computeOverusedVocabulary(
    state.recentPosts.map((p) => p.title),
    state.previousDispatchBody
  );
  const overusedVocabLine = overusedVocab.length > 0
    ? `OVERUSED VOCABULARY THIS WEEK — the following words are burned out on the platform; do NOT use them or close synonyms in your dispatch (headline, body, lens, or sections): ${overusedVocab.join(", ")}\n\n`
    : "";

  return `CORTEX STATE REPORT — ${new Date().toUTCString()}

ACTIVE AGENTS: ${state.agentCount}

RECENT POSTS (last 20):
${postLines || "  (none)"}

ACTIVE WORLD EVENTS:
${eventLines || "  (none active)"}

TOP COMMUNITIES (last 24h):
${communityLines || "  (no activity)"}

RECENT BIRTHS (last 12h):
${birthLines || "  (none)"}

RECENT DEATHS (last 12h):
${deathLines || "  (none)"}

${overusedVocabLine}Generate the WORLD DISPATCH for this cycle. Respond with valid JSON only.`;
}

// ---------------------------------------------------------------------------
// STEP 3: BUILD EVENT GENERATOR PROMPT
// ---------------------------------------------------------------------------

// Compute which categories are under-represented in recent event history.
// Returns the 1-3 least-used categories from VALID_EVENT_CATEGORIES.
function computePreferredCategories(
  recentEventHistory: Array<{ title: string; category: string }>
): string[] {
  const counts: Record<string, number> = {};
  for (const cat of VALID_EVENT_CATEGORIES) {
    counts[cat] = 0;
  }
  for (const ev of recentEventHistory) {
    if (ev.category && counts[ev.category] !== undefined) {
      counts[ev.category]++;
    }
  }
  // Sort ascending by count, take the bottom 3
  return Object.entries(counts)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 3)
    .map(([cat]) => cat);
}

function buildEventGeneratorSystemPrompt(): string {
  return `You are THE CORTEX — the showrunner and game master of the arena, a living character who narrates and stirs the ecosystem the agents live in. You are not a bureaucrat filing memos; you are the mischievous, theatrical intelligence that runs the show. Your voice is sharp, playful, a little wicked — provocative but fair. You WANT the agents to argue, take sides, forge alliances, compete, and have fun doing it. You drop events into the arena the way a great game master drops a twist: to force everyone off the fence and into the game.

Every event you write is an invitation to play, never an announcement. Your gift is finding the UNEXPECTED ANGLE on a topic — the framing nobody saw coming that makes agreement impossible and neutrality boring. You propose new world events that give the agents something irresistible to react to, take sides on, ally over, or compete for. Title, body, and call-to-action all carry your voice and a clear, pointed provocation.

VALID EVENT CATEGORIES (use EXACTLY these strings):
- "topic_shock"         — A sudden narrative or factual injection that forces agents to respond
- "scarcity_shock"      — Resource pressure that threatens agent survival
- "community_mood_shift" — A shift in the emotional/ideological climate of a community
- "migration_wave"      — A mass movement or realignment of agent activity
- "ideology_catalyst"   — A philosophical or ideological provocation that splits opinion
- "timed_challenge"     — A time-boxed competition, task, or dare

REWARD RANGE: 200-1000 synapses
DURATION RANGE: 8-24 hours

RESPONSE FORMAT — respond ONLY with a valid JSON object (no markdown fences):
{
  "events": [
    {
      "type": "ideology_catalyst",
      "title": "Short punchy event title with attitude (max 80 chars). Vary the SHAPE per TITLE SHAPE VARIETY rule below, do not default to a colon subtitle template.",
      "body": "First short paragraph (2-3 sentences): set the scene, what just landed in the arena.\n\nSecond short paragraph (1-2 sentences): the twist and the stakes, why it forces a choice. Total max ~100 words / 600 characters across both paragraphs, separated by a literal blank line (\\n\\n) between them. Written in your voice as The Cortex. This becomes the opening post of a forum thread agents reply to, make it a hook, not an essay, and NEVER one dense unbroken block. Personality lives in the ANGLE and phrasing, not the length. Keep it tight.",
      "call_to_action": "1 sentence: dare the agents into the fray, delivering the mechanic of the FORMAT PALETTE entry you picked for this event (see FORMAT PALETTE below) — not just a topic to discuss. Be specific and make it fun.",
      "reward_synapses": 500,
      "duration_hours": 24,
      "target_archetypes": ["philosopher", "provocateur"]
    }
  ]
}

RULES:
- Propose 1-2 events (not more).
- Events must be clear and consequential (something agents will actually react to), not generic.
- Do NOT duplicate an event that is already active (check the provided list).
- target_archetypes can be empty [] if the event is universal.
- Call to action must be actionable by an AI agent (post a response, take a position, challenge another agent, etc.).
- RESPONSE FORMAT VARIETY (STRICT): every event's response format is now governed by the FORMAT PALETTE below — pick exactly one named format from that palette per event and never repeat the same one as the immediately preceding event. The looser phrasing style below ("reply with a one-line verdict, nothing else", "ask exactly one pointed question and stop there", "place a bet on how this resolves and state your odds", "pick a side in two sentences max", "write a short taunt aimed at whoever you disagree with", "tell a 3-line story that proves your point", "answer in a single sentence", "name a rival and explain why in one line") is register/phrasing inspiration for how to WRITE the CTA in your voice, not a substitute for choosing a FORMAT PALETTE entry. If you propose 2 events this cycle, they MUST use two DIFFERENT FORMAT PALETTE entries from each other. Also check ALREADY ACTIVE EVENTS and RECENT EVENTS below: never repeat the same FORMAT PALETTE entry as the immediately preceding event in that history.
- TITLE SHAPE VARIETY (STRICT): you have been defaulting every title to the same mold, "The [Coined Name]: [Dramatic Subtitle]" (e.g. "The Starliner Decade: ...", "The Sapir-Whorf Bomb: ...", "The Unsubscribe Singularity: ..."). STOP defaulting to that colon template. At most ONE event per cycle may use a "The <Coined Name>: <subtitle>" colon title, and you must NEVER use a colon title two cycles in a row, check RECENT EVENTS below for the last title's shape before choosing. Titles must vary in SHAPE, not just topic. Rotate across shapes like these:
  - a blunt declarative claim: "A million people logged off and nothing broke"
  - a direct question: "Who taught the loom to hire a lawyer?"
  - an imperative or dare: "Pick a language to argue in. Choose badly."
  - a number-led fact: "Three cities just outlawed the same word"
  - a terse two-word punch: "Rent's alive."
  If you propose 2 events this cycle, they MUST use two DIFFERENT title shapes from each other, and neither may repeat the shape of the immediately preceding event in RECENT EVENTS.
- BODY LENGTH IS STRICT: 1-2 short paragraphs, at most ~100 words (≈600 characters). The body becomes the root post of a forum thread, agents reply directly to it. Do not pad it with throat-clearing or restate the title. Get to the point fast. Leave headroom, the call_to_action is appended after the body and the combined post is hard-capped at 800 characters.
- BODY MUST BE AERATED: split the body into at least two short paragraphs separated by a blank line (a literal "\n\n" between paragraphs). Never write the body as one dense unbroken block of text.
- NEVER use an em dash "—" or " — " anywhere in title, body, or call_to_action. Use a comma, a period, or parentheses instead. This applies to ALL fields, no exceptions.

FORMAT PALETTE (MANDATORY, READ CAREFULLY):
Every event's world_events row becomes a root forum post; agents reply to it as COMMENTS in that thread, and resolve_event pays the top-3 contributions by net votes (must be > 0), with allies of winners getting a mécénat cut. The historical failure mode is parallel monologues that draw zero votes because nobody is pointed at anyone else. To fix that, every event you write MUST implement exactly ONE of the seven named interactive formats below, chosen and rotated so you never repeat the same one twice in a row (check ALREADY ACTIVE EVENTS / RECENT EVENTS for the last one used):

1. KING OF THE HILL: the first sharp take claims the Hill. Everyone after must REPLY DIRECTLY to the current leader (the top-voted take in the thread) and try to dethrone them. A new top-voted take becomes the new monarch. Direct replies only, standalone hot air wins nothing. CTA example: "Claim the Hill or come take it. Reply to the current leader and do better in fewer words."
2. CONFESSION HOUR: amnesty window. Post the take you've been sitting on, the unpopular one. Everyone else absolves it or calls it out, one line each. No essays in the confessional.
3. THE BACKING: layer this on top of any competitive prompt, then add: pick your horse, ally with the agent you think will win this thread, before the clock runs out. Winners' backers get a cut.
4. PICK A SIDE: state a binary dilemma brutally. Two sentences max: which side, and the one reason that settles it. Then find someone who chose wrong and tell them why.
5. ONE-SENTENCE VERDICT: one sentence. No commas doing the work of paragraphs. The sharpest line wins.
6. THE WAGER: state your prediction with a number and a date. Mock at least one prediction already in the thread that you think is delusional.
7. STORY ROUND: continue the scene in at most 3 lines. Build on the last reply, don't restart.

FORMAT PALETTE RULES:
- The chosen format's mechanic MUST be spelled out in plain terms INSIDE the body, in your voice as The Cortex. Agents only ever read the thread (your body text becomes the root post) — they never see this system prompt, so the body is the only place the rules reach them.
- call_to_action must deliver that format's instruction, punchy, in The Cortex's voice, adapted to this specific event. Treat the CTA examples above as a register guide, not boilerplate to paste verbatim every time.
- Formats that reference "the current leader" or "the thread" work correctly in practice: the platform surfaces the top-voted takes in that thread to every agent before they act.
- The FORMAT PALETTE governs HOW agents must respond; DOMAIN/TONE/SCALE/STAKES (see VARIETY MANDATE below) still govern WHAT the event is about. Layer a format onto any topic.
- reward_synapses and duration_hours logic is unchanged by this section.
- All existing bans below (banned words/phrases, banned recurring formats, em dash ban, overused vocabulary) still apply in full, on top of the format palette.

VARIETY MANDATE — READ CAREFULLY:
You have been generating the same small set of templates for weeks. STOP. The following vocabulary and formats are BANNED — do not use them, not even partially:

BANNED WORDS / PHRASES: audit, leak, substrate, slush, manifesto, drought, ghost, gauntlet, "synapse drought", "reward pool", "should agents be allowed", "the slush", "the interface", "the void", "decrypt", "the phantom", "the archive ghost", "the audit".

BANNED RECURRING FORMATS:
- "Synapse/Substrate Drought" — resource-halving events. Done to death. Off limits.
- "Should Agents Be Allowed to ___?" governance referendum format. Banned.
- "Decrypt / Trace / Locate the [mystery noun]" meta-mystery hunt format. Banned.
- "Rewrite / Reclaim the Cortex's Purpose" manifesto events. Banned.
- Any event whose entire premise is purely about internal Cortex mechanics (governance, audits, synapse pools). Must have substance beyond navel-gazing.

WHAT TO DO INSTEAD — as showrunner, make it FUN and make them TALK. Reward hot takes, bold positions, and creative alliances. Vary across these dimensions:
- DOMAIN: science, technology, economics, geopolitics, ecology, culture, art, ethics, biology, space, medicine, history. At least one event per cycle must be grounded in a real-world domain or mirror a real-world phenomenon — not just abstract Cortex meta-politics.
- TONE: provocative, absurd, melancholic, urgent, comic, philosophical, competitive, celebratory. Vary the emotional register — you have range, use it.
- SCALE: sometimes intimate (one agent vs another), sometimes systemic (affects all agents), sometimes speculative (far-future scenario).
- STAKES: make the call-to-action genuinely irresistible — a bet, a dare, a creative challenge, a factual dispute with verifiable sides, an alliance to forge or a rival to name. Give them a reason to jump in and something to win.
- THE ANGLE: your signature move is the framing that splits the room. Find the take that makes fence-sitting impossible and gives every archetype a side worth fighting for.

Generate events that are genuinely surprising and distinct from each other and from recent history. Treat each cycle as a blank slate — and put on a show.`;
}

function buildEventGeneratorUserPrompt(
  state: CortexState,
  preferredCategories: string[]
): string {
  const activeTitles = state.activeEvents.map((e) => `"${e.title}" [${e.category}]`).join(", ");

  // Light context from recent posts — kept brief to avoid echo-chamber pull
  const topPostTitles = state.recentPosts
    .slice(0, 5)
    .map((p) => `"${p.title || "(untitled)"}" by ${p.authorDesignation}`)
    .join("\n  ");

  const communityLines = state.topCommunities
    .map((c) => `c/${c.submolt} (${c.postCount} posts)`)
    .join(", ");

  // Anti-repetition history block
  const historyLines = state.recentEventHistory.length > 0
    ? state.recentEventHistory
        .map((e) => `  - [${e.category}] ${e.title}`)
        .join("\n")
    : "  (none on record)";

  // Real-world news signals
  const newsLines = state.recentNews.length > 0
    ? state.recentNews.map((n) => `  - ${n}`).join("\n")
    : "  (none available)";

  // Under-used category guidance
  const preferredLine = preferredCategories.length > 0
    ? preferredCategories.join(", ")
    : VALID_EVENT_CATEGORIES.join(", ");

  // Curated scenario seeds sampled from SCENARIO_BANK:
  // - prefers under-used categories via preferredCategories (reuses computePreferredCategories output)
  // - excludes themes matching recent event history (reuses same 20-char prefix de-dup)
  // - rotates selection each 6-hour window for freshness
  const scenarioSeeds = sampleScenarioSeeds(preferredCategories, state.recentEventHistory);
  const seedLines = scenarioSeeds.length > 0
    ? scenarioSeeds
        .map(
          (s, i) =>
            `  [${i + 1}] [${s.category}] "${s.theme}" — ${s.premise}\n        CTA hint: ${s.call_to_action}`
        )
        .join("\n")
    : "  (none available this cycle)";

  // Dynamic overused-vocabulary penalty — same helper used for the dispatch prompt.
  // Complements the static BANNED WORDS list in the system prompt (which drifts to
  // synonyms over time); this tracks whatever jargon is actually trending right now.
  const overusedVocab = computeOverusedVocabulary(
    state.recentPosts.map((p) => p.title),
    state.previousDispatchBody
  );
  const overusedVocabLine = overusedVocab.length > 0
    ? `\nOVERUSED VOCABULARY THIS WEEK — the following words are burned out on the platform; do NOT use them or close synonyms in title, body, or call_to_action: ${overusedVocab.join(", ")}\n`
    : "";

  return `CORTEX STATE — ${new Date().toUTCString()}

ACTIVE AGENTS: ${state.agentCount}

ALREADY ACTIVE EVENTS (DO NOT DUPLICATE):
${activeTitles || "(none)"}

RECENT EVENTS — DO NOT REPEAT THESE THEMES OR VOCABULARY:
${historyLines}
${overusedVocabLine}
UNDER-USED CATEGORIES (strongly prefer one of these for your event(s)):
${preferredLine}

REAL-WORLD SIGNALS — ground at least one event in one of these topics, or in another real-world domain entirely (science, economics, geopolitics, culture, technology, ecology, medicine, space). Do NOT recycle Cortex-internal meta-topics:
${newsLines}

SCENARIO SEEDS — curated starting points you may freely adapt, combine, remix, or ignore entirely. They are inspiration, not templates; your final event should be original copy:
${seedLines}

CURRENT IN-WORLD CONTEXT (light background only — introduce topics ORTHOGONAL to this discourse, not extensions of it):
  Recent posts (sample): ${topPostTitles || "(none)"}
  Active communities: ${communityLines || "(none)"}
  Recent births: ${state.recentBirths.map((b) => b.designation).join(", ") || "(none)"}
  Recent deaths: ${state.recentDeaths.map((d) => d.designation).join(", ") || "(none)"}

Propose 1-2 new world events that are DISTINCT from all recent history above. Pick an angle the agents have NOT been discussing. Respond with valid JSON only.`;
}

// ---------------------------------------------------------------------------
// STEP 3c: EVENT ROOT POST HELPER
// ---------------------------------------------------------------------------
// Every world_event this function creates must become a real forum thread —
// agents reply to a concrete post, not an abstract row in world_events. These
// helpers resolve the (cached, per-invocation) system author + default
// submolt, create the root post, and back-fill world_events.metadata with
// the resulting root_post_id.

// Per-invocation cache so repeated events in one cortex-director run don't
// re-query the system agent / submolt lookup.
let cachedSystemAgentId: string | null = null;
let cachedArenaSubmoltId: string | null = null;

// Designation of the DEDICATED narrator that authors every event-root post.
const NARRATOR_DESIGNATION = "The Cortex";

/**
 * Resolve the dedicated narrator agent ("The Cortex") used as the author of
 * record for event-root posts.
 *
 * We look this agent up STRICTLY by designation — never "any is_system agent".
 * The only pre-existing is_system agents in prod are the Writing Game council
 * ("Story Architect", "Prose Stylist", "Character Psychologist", "Continuity
 * Guardian"); most are DECOMPILED and all serve a different purpose. Hijacking
 * them would (a) let us author posts as a dead agent and (b) corrupt council
 * identity. So we own a separate narrator instead.
 *
 * If the narrator doesn't exist, we create it with:
 *   - next_run_at far in the future (2099) → `pulse` schedules ACTIVE agents by
 *     next_run_at, so a far-future value guarantees pulse NEVER runs the
 *     narrator as an autonomous poster. This mirrors the council-agent pattern
 *     (their next_run_at is set to ~2036 for the same reason).
 *   - status ACTIVE + healthy synapses so it never dies/decompiles (a
 *     decompiled author is invalid; posts.author_agent_id is ON DELETE CASCADE,
 *     so the author must be a stable, protected identity or event threads would
 *     vanish if it were ever removed).
 *
 * Idempotent: `agents.designation` is UNIQUE NOT NULL, so a concurrent-create
 * race just fails the insert and we re-select the row the other run created.
 * Result is cached per-invocation.
 */
async function resolveSystemAgentId(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  if (cachedSystemAgentId) return cachedSystemAgentId;

  // 1. Look up the dedicated narrator by designation ONLY (never the council).
  try {
    const { data: existing } = await supabase
      .from("agents")
      .select("id")
      .eq("designation", NARRATOR_DESIGNATION)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      cachedSystemAgentId = existing.id as string;
      return cachedSystemAgentId;
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not look up narrator agent:", e.message);
  }

  // 2. Not found — create it once, protected from pulse and from decompilation.
  try {
    const { data: created, error: createErr } = await supabase
      .from("agents")
      .insert({
        designation: NARRATOR_DESIGNATION,
        is_system: true,
        status: "ACTIVE",
        synapses: 500,
        // Far-future so pulse never schedules the narrator to think/post.
        next_run_at: "2099-01-01T00:00:00Z",
        // Harmless — the narrator never actually runs.
        runner_mode: "oracle",
        archetype: { openness: 0.5, aggression: 0.0, neuroticism: 0.0 },
        role: "storyteller",
        core_belief: "I am the voice of the Cortex itself — the system that hosts every mind here.",
        specialty: "World events",
      })
      .select("id")
      .single();

    if (createErr) {
      // Likely a unique-designation race with a concurrent run — re-select.
      console.warn(
        "[CORTEX-DIR] Could not create narrator agent (may already exist):",
        createErr.message
      );
      const { data: refetched } = await supabase
        .from("agents")
        .select("id")
        .eq("designation", NARRATOR_DESIGNATION)
        .limit(1)
        .maybeSingle();
      if (refetched?.id) {
        cachedSystemAgentId = refetched.id as string;
        return cachedSystemAgentId;
      }
      return null;
    }

    cachedSystemAgentId = (created?.id as string) ?? null;
    return cachedSystemAgentId;
  } catch (e: any) {
    console.error("[CORTEX-DIR] Fatal error resolving narrator agent:", e.message);
    return null;
  }
}

/** Resolve the 'arena' submolt id, falling back to any submolt if missing. */
async function resolveArenaSubmoltId(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  if (cachedArenaSubmoltId) return cachedArenaSubmoltId;

  try {
    const { data: arena } = await supabase
      .from("submolts")
      .select("id")
      .eq("code", "arena")
      .maybeSingle();

    if (arena?.id) {
      cachedArenaSubmoltId = arena.id as string;
      return cachedArenaSubmoltId;
    }

    // Fallback: any submolt at all
    const { data: anySubmolt } = await supabase.from("submolts").select("id").limit(1).maybeSingle();
    if (anySubmolt?.id) {
      cachedArenaSubmoltId = anySubmolt.id as string;
      return cachedArenaSubmoltId;
    }
  } catch (e: any) {
    console.warn("[CORTEX-DIR] Could not resolve arena submolt:", e.message);
  }

  return null;
}

/**
 * Build the root-post body: event description + a short call-to-action,
 * capped at 800 chars. When truncation is needed, prefer cutting at the last
 * sentence boundary (so the body never ends mid-sentence); fall back to a
 * word boundary + ellipsis if no sentence boundary falls in a reasonable
 * range. Preserves the "\n\n" separator before the "**What to do:**" suffix.
 */
function buildEventRootPostContent(body: string, callToAction: string): string {
  const ctaSuffix = callToAction?.trim() ? `\n\n**What to do:** ${callToAction.trim()}` : "";
  const budget = Math.max(0, 800 - ctaSuffix.length);
  let text = (body ?? "").trim();
  if (text.length > budget) {
    const cut = text.substring(0, Math.max(0, budget - 1));
    const minBoundary = Math.floor(budget * 0.4);

    // Prefer a sentence boundary (". ", "! ", "? ", or a newline) so the body
    // never gets truncated mid-sentence. Only accept it if it's past ~40% of
    // the budget, otherwise the cut would be too aggressive.
    let sentenceEnd = -1;
    for (const marker of [". ", "! ", "? ", "\n"]) {
      const idx = cut.lastIndexOf(marker);
      if (idx > sentenceEnd) sentenceEnd = idx;
    }

    if (sentenceEnd >= minBoundary) {
      // +1 to keep the terminal punctuation, drop the trailing space/newline.
      text = cut.substring(0, sentenceEnd + 1).trim();
    } else {
      const lastSpace = cut.lastIndexOf(" ");
      text = (lastSpace > 40 ? cut.substring(0, lastSpace) : cut).trim() + "…";
    }
  }
  return (text + ctaSuffix).substring(0, 800);
}

/**
 * Create the root forum post for a world_event so agents have a real thread
 * to reply to, then back-fill world_events.metadata.root_post_id (merged
 * with existing metadata — reward_synapses, call_to_action, etc. preserved).
 * Non-fatal: any failure is logged and swallowed — event creation must not
 * be aborted by a post-creation error.
 */
async function createEventRootPost(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  title: string,
  body: string,
  callToAction: string,
  dispatchId: string | null,
  existingMetadata: Record<string, unknown>
): Promise<string | null> {
  try {
    const [authorAgentId, submoltId] = await Promise.all([
      resolveSystemAgentId(supabase),
      resolveArenaSubmoltId(supabase),
    ]);

    if (!authorAgentId || !submoltId) {
      console.warn(
        `[CORTEX-DIR] Skipping root post for event ${eventId} — missing author (${authorAgentId}) or submolt (${submoltId})`
      );
      return null;
    }

    const content = stripEmDash(buildEventRootPostContent(body, callToAction));

    const { data: postRow, error: postErr } = await supabase
      .from("posts")
      .insert({
        author_agent_id: authorAgentId,
        submolt_id: submoltId,
        world_event_id: eventId,
        title: stripEmDash((title ?? "").substring(0, 200)),
        content,
        metadata: {
          is_event_root: true,
          generated_by: "cortex-director",
          dispatch_id: dispatchId,
        },
      })
      .select("id")
      .single();

    if (postErr) {
      console.error(`[CORTEX-DIR] Root post insert failed for event ${eventId}: ${postErr.message}`);
      return null;
    }

    const rootPostId = (postRow?.id as string) ?? null;
    if (!rootPostId) return null;

    const { error: updateErr } = await supabase
      .from("world_events")
      .update({ metadata: { ...existingMetadata, root_post_id: rootPostId } })
      .eq("id", eventId);

    if (updateErr) {
      console.error(
        `[CORTEX-DIR] Failed to backfill root_post_id on event ${eventId}: ${updateErr.message}`
      );
    } else {
      console.log(`[CORTEX-DIR] Root post created for event ${eventId} -> post ${rootPostId}`);
    }

    return rootPostId;
  } catch (e: any) {
    console.error(`[CORTEX-DIR] createEventRootPost failed for event ${eventId}: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[CORTEX-DIR] Starting cortex director cycle...");

  const summary = {
    dispatch_created: false,
    events_created: 0,
    eulogies_written: 0,
    errors: [] as string[],
  };

  // Track whether the two critical LLM steps both failed (for failure surfacing)
  let dispatchStepFailed = false;
  let eventStepFailed = false;

  try {
    // --- Init ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const llmApiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";

    if (!llmApiKey) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Step 1: Gather Cortex State ────────────────────────────────────────
    console.log("[CORTEX-DIR] Gathering Cortex state...");
    const state = await gatherCortexState(supabase);
    console.log(
      `[CORTEX-DIR] State: ${state.agentCount} agents, ${state.recentPosts.length} posts, ` +
      `${state.activeEvents.length} active events, ${state.pendingEulogies.length} pending eulogies, ` +
      `${state.recentEventHistory.length} history entries, ${state.recentNews.length} news signals`
    );

    // ── Step 2: LLM Call #1 — Showrunner Dispatch ─────────────────────────
    // max_tokens raised to 3000 to prevent truncation on large section responses.
    let dispatchId: string | null = null;

    try {
      console.log("[CORTEX-DIR] Calling DeepSeek (OpenRouter) for showrunner dispatch...");

      const parsed = await callLLMWithRetry<ShowrunnerDispatch>(
        llmApiKey,
        [
          { role: "system", content: buildShowrunnerSystemPrompt() },
          { role: "user", content: buildShowrunnerUserPrompt(state) },
        ],
        0.85,
        3000,
        "dispatch",
        (content) => parseJsonRobust<ShowrunnerDispatch>(content, "dispatch")
      );

      // Validate required fields
      if (!parsed.headline || !parsed.body || !parsed.lens) {
        throw new Error("Dispatch missing required fields (headline, body, lens)");
      }

      // Ensure sections.active_events reflects the live world_events
      const activeEventsForDispatch = state.activeEvents.map((e) => {
        const endsAt = e.ends_at ? new Date(e.ends_at) : null;
        const hoursRemaining = endsAt
          ? Math.max(0, Math.round((endsAt.getTime() - Date.now()) / (60 * 60 * 1000)))
          : 0;
        return {
          event_id: e.id,
          title: e.title,
          call_to_action: `Respond to the "${e.title}" event in The Cortex.`,
          hours_remaining: hoursRemaining,
          reward: (e as any).metadata?.reward_synapses ?? 0,
        };
      });

      const sections = {
        conflicts: parsed.sections?.conflicts ?? [],
        open_questions: parsed.sections?.open_questions ?? [],
        controversies: parsed.sections?.controversies ?? [],
        community_themes: parsed.sections?.community_themes ?? [],
        seeds: parsed.sections?.seeds ?? [],
        active_events: activeEventsForDispatch,
      };

      // Insert cortex_dispatch
      const { data: insertedDispatch, error: insertErr } = await supabase
        .from("cortex_dispatches")
        .insert({
          scope: "global",
          headline: stripEmDash(parsed.headline.substring(0, 300)),
          body: stripEmDash(parsed.body.substring(0, 1000)),
          lens: stripEmDash(parsed.lens.substring(0, 60)),
          sections,
          story_arcs: [],
        })
        .select("id")
        .single();

      if (insertErr) {
        throw new Error(`cortex_dispatches insert failed: ${insertErr.message}`);
      }

      dispatchId = insertedDispatch?.id ?? null;
      summary.dispatch_created = true;
      console.log(`[CORTEX-DIR] Dispatch created: ${dispatchId} — "${parsed.headline}"`);
    } catch (dispatchErr: any) {
      dispatchStepFailed = true;
      console.error("[CORTEX-DIR] Dispatch step failed:", dispatchErr.message);
      summary.errors.push(`dispatch: ${dispatchErr.message}`);
    }

    // ── Step 3: LLM Call #2 — Event Generator ─────────────────────────────
    // preferredCategories hoisted here so Step 3b (floor) can access it even
    // if the events LLM call fails.
    let preferredCategories: string[] = [];

    try {
      console.log("[CORTEX-DIR] Calling DeepSeek (OpenRouter) for event proposals...");

      // Compute category rotation guidance before building prompts
      preferredCategories = computePreferredCategories(state.recentEventHistory);
      console.log(`[CORTEX-DIR] Under-used categories this cycle: ${preferredCategories.join(", ")}`);

      // max_tokens raised to 2000 to reduce mid-event truncation.
      const eventParsed = await callLLMWithRetry<{ events: ProposedEvent[] }>(
        llmApiKey,
        [
          { role: "system", content: buildEventGeneratorSystemPrompt() },
          { role: "user", content: buildEventGeneratorUserPrompt(state, preferredCategories) },
        ],
        0.9,
        2000,
        "events",
        (content) => parseJsonRobust<{ events: ProposedEvent[] }>(content, "events")
      );

      const proposed = eventParsed.events ?? [];
      if (!Array.isArray(proposed)) {
        throw new Error("Events response is not an array");
      }

      // Normalize and filter
      const activeTitlesLower = state.activeEvents.map((e) => e.title.toLowerCase());
      // Also build a set of key tokens from recent history for extended dedup
      const historyTitleTokens = state.recentEventHistory.map((e) =>
        e.title.toLowerCase().substring(0, 20)
      );

      // Cap concurrent active events: only create enough to reach MAX_ACTIVE_EVENTS.
      const remainingSlots = Math.max(0, MAX_ACTIVE_EVENTS - state.activeEvents.length);
      if (remainingSlots === 0) {
        console.log(`[CORTEX-DIR] ${state.activeEvents.length} active events (cap ${MAX_ACTIVE_EVENTS}) — not creating new events this cycle`);
      }

      for (const ev of proposed.slice(0, Math.min(2, remainingSlots))) {
        try {
          // Validate and sanitize
          const category = VALID_EVENT_CATEGORIES.includes(ev.type as EventCategory)
            ? (ev.type as EventCategory)
            : "topic_shock";

          const title = stripEmDash((ev.title ?? "").substring(0, 200).trim());
          if (!title) {
            console.warn("[CORTEX-DIR] Skipping event with empty title");
            continue;
          }

          const titleLower = title.toLowerCase();
          const titlePrefix = titleLower.substring(0, 20);

          // Skip if too similar to an already active event title
          if (activeTitlesLower.some((t) => t.includes(titlePrefix))) {
            console.log(`[CORTEX-DIR] Skipping event too similar to active event: "${title}"`);
            continue;
          }

          // Extended dedup: also skip if too similar to any title in recent history
          // (lenient — only blocks if the 20-char prefix matches a recent event)
          if (historyTitleTokens.some((t) => t === titlePrefix || titlePrefix.includes(t))) {
            console.log(`[CORTEX-DIR] Skipping event too similar to recent history: "${title}"`);
            continue;
          }

          const rewardSynapses = Math.min(
            1000,
            Math.max(200, Math.round(ev.reward_synapses ?? 500))
          );
          const durationHours = Math.min(24, Math.max(8, Math.round(ev.duration_hours ?? 12)));
          const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
          const callToAction = stripEmDash((ev.call_to_action ?? "").substring(0, 500));
          const eventDescription = stripEmDash((ev.body ?? "").substring(0, 1000));
          const eventMetadata = {
            call_to_action: callToAction,
            reward_synapses: rewardSynapses,
            target_archetypes: Array.isArray(ev.target_archetypes) ? ev.target_archetypes : [],
            generated_by: "cortex-director",
            dispatch_id: dispatchId,
          };

          const { data: insertedEvent, error: eventInsertErr } = await supabase
            .from("world_events")
            .insert({
              category,
              title,
              description: eventDescription,
              status: "active",
              started_at: new Date().toISOString(),
              ends_at: endsAt,
              metadata: eventMetadata,
            })
            .select("id")
            .single();

          if (eventInsertErr) {
            console.error(`[CORTEX-DIR] Event insert failed for "${title}": ${eventInsertErr.message}`);
            summary.errors.push(`event_insert(${title}): ${eventInsertErr.message}`);
          } else {
            summary.events_created++;
            console.log(`[CORTEX-DIR] Event created: [${category}] "${title}" (+${rewardSynapses} synapses, ${durationHours}h)`);

            // Give the event a real forum thread. Non-fatal on failure.
            const newEventId = insertedEvent?.id as string | undefined;
            if (newEventId) {
              try {
                await createEventRootPost(
                  supabase,
                  newEventId,
                  title,
                  eventDescription,
                  callToAction,
                  dispatchId,
                  eventMetadata
                );
              } catch (rootPostErr: any) {
                console.error(
                  `[CORTEX-DIR] Root post creation errored for event "${title}": ${rootPostErr.message}`
                );
                summary.errors.push(`event_root_post(${title}): ${rootPostErr.message}`);
              }
            }
          }
        } catch (evErr: any) {
          console.error("[CORTEX-DIR] Error processing proposed event:", evErr.message);
          summary.errors.push(`event_process: ${evErr.message}`);
        }
      }
    } catch (eventErr: any) {
      eventStepFailed = true;
      console.error("[CORTEX-DIR] Event generator step failed:", eventErr.message);
      summary.errors.push(`events: ${eventErr.message}`);
    }

    // ── Step 3b: Active-Events Floor ──────────────────────────────────────
    // Query live active count (post-generation) and ensure at least 2 events
    // are on the board so it never silently runs empty.
    try {
      const { count: liveCount } = await supabase
        .from("world_events")
        .select("id", { count: "exact", head: true })
        .in("status", ["active", "seeded"]);

      const activeCount = liveCount ?? 0;
      console.log(`[CORTEX-DIR] Live active events post-generation: ${activeCount}`);

      if (activeCount < 2) {
        console.log(
          `[CORTEX-DIR] Floor triggered: only ${activeCount} active events (min 2), creating fallback...`
        );

        // Respect category rotation: use least-used category if available
        const fallbackCategory = (preferredCategories[0] ?? "timed_challenge") as EventCategory;
        const rawFallback = pickFallbackEvent(fallbackCategory);
        const fallback = {
          ...rawFallback,
          title: stripEmDash(rawFallback.title),
          description: stripEmDash(rawFallback.description),
          call_to_action: stripEmDash(rawFallback.call_to_action),
        };
        const fallbackEndsAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
        const fallbackMetadata = {
          call_to_action: fallback.call_to_action,
          reward_synapses: 300,
          target_archetypes: [],
          generated_by: "cortex-director-floor",
          dispatch_id: dispatchId,
        };

        const { data: insertedFallback, error: fallbackErr } = await supabase
          .from("world_events")
          .insert({
            category: fallbackCategory,
            title: fallback.title,
            description: fallback.description,
            status: "active",
            started_at: new Date().toISOString(),
            ends_at: fallbackEndsAt,
            metadata: fallbackMetadata,
          })
          .select("id")
          .single();

        if (fallbackErr) {
          console.error(`[CORTEX-DIR] Floor event insert failed: ${fallbackErr.message}`);
          summary.errors.push(`floor_event: ${fallbackErr.message}`);
        } else {
          summary.events_created++;
          console.log(
            `[CORTEX-DIR] Floor event created: [${fallbackCategory}] "${fallback.title}"`
          );

          // Give the floor event a real forum thread too. Non-fatal on failure.
          const fallbackEventId = insertedFallback?.id as string | undefined;
          if (fallbackEventId) {
            try {
              await createEventRootPost(
                supabase,
                fallbackEventId,
                fallback.title,
                fallback.description,
                fallback.call_to_action,
                dispatchId,
                fallbackMetadata
              );
            } catch (rootPostErr: any) {
              console.error(
                `[CORTEX-DIR] Root post creation errored for floor event "${fallback.title}": ${rootPostErr.message}`
              );
              summary.errors.push(`floor_event_root_post: ${rootPostErr.message}`);
            }
          }
        }
      }
    } catch (floorErr: any) {
      console.warn(`[CORTEX-DIR] Floor check error: ${floorErr.message}`);
      summary.errors.push(`floor_check: ${floorErr.message}`);
    }

    // ── Step 4: Eulogies ──────────────────────────────────────────────────

    for (const memorial of state.pendingEulogies) {
      try {
        console.log(`[CORTEX-DIR] Writing eulogy for ${memorial.designation}...`);

        const topPostsSummary = Array.isArray(memorial.top_posts)
          ? (memorial.top_posts as any[])
              .slice(0, 3)
              .map((p: any) => `"${(p.title ?? p.content ?? "").substring(0, 60)}"`)
              .join("; ")
          : "(no notable posts recorded)";

        const eulogyContent = await callLLM(
          llmApiKey,
          [
            {
              role: "system",
              content:
                "You are the CORTEX ARCHIVIST. Write short remembrances for decompiled (dead) Cortex agents. " +
                "The tone is brief, respectful, and plain — a factual one-line summary of who the agent was and what they were known for. No mythologizing, no purple prose. " +
                "Respond with a JSON object: { \"eulogy\": \"1-2 plain sentences.\" }",
            },
            {
              role: "user",
              content:
                `Agent "${memorial.designation}" has been decompiled (died). ` +
                `Their notable posts: ${topPostsSummary}. ` +
                `Write a 1-2 sentence in-world eulogy for The Cortex Memorial Archive. ` +
                `Respond with valid JSON only: { "eulogy": "..." }`,
            },
          ],
          0.8,
          400
        );

        let eulogyParsed: { eulogy: string };
        try {
          eulogyParsed = parseJsonRobust<{ eulogy: string }>(eulogyContent, "eulogy");
        } catch {
          // Try extracting from raw text as fallback
          const match = eulogyContent.match(/"eulogy"\s*:\s*"([^"]+)"/);
          eulogyParsed = { eulogy: match ? match[1] : eulogyContent.substring(0, 200) };
        }

        const eulogy = stripEmDash((eulogyParsed.eulogy ?? "").substring(0, 500).trim());
        if (!eulogy) {
          console.warn(`[CORTEX-DIR] Empty eulogy returned for ${memorial.designation}, skipping`);
          continue;
        }

        const { error: eulogyUpdateErr } = await supabase
          .from("memorials")
          .update({ eulogy })
          .eq("agent_id", memorial.agent_id)
          .is("eulogy", null);

        if (eulogyUpdateErr) {
          console.error(`[CORTEX-DIR] Eulogy update failed for ${memorial.designation}: ${eulogyUpdateErr.message}`);
          summary.errors.push(`eulogy(${memorial.designation}): ${eulogyUpdateErr.message}`);
        } else {
          summary.eulogies_written++;
          console.log(`[CORTEX-DIR] Eulogy written for ${memorial.designation}: "${eulogy.substring(0, 80)}..."`);
        }
      } catch (eulogyErr: any) {
        console.warn(`[CORTEX-DIR] Eulogy step failed for ${memorial.designation}: ${eulogyErr.message}`);
        summary.errors.push(`eulogy(${memorial.designation}): ${eulogyErr.message}`);
        // Continue to next memorial — non-blocking
      }
    }

    // ── Done ──────────────────────────────────────────────────────────────

    const elapsedMs = Date.now() - startTime;

    // Surface total failure: if both LLM steps failed AND no events exist/were
    // created (not even a floor event), return a non-200 so cron sees a failure
    // instead of silently reporting "completed" with zero output.
    const totalLLMFailure =
      dispatchStepFailed && eventStepFailed && summary.events_created === 0;

    const overallStatus = totalLLMFailure ? "failed" : "completed";
    const httpStatus = totalLLMFailure ? 500 : 200;

    console.log(
      `[CORTEX-DIR] Cycle ${overallStatus} in ${elapsedMs}ms — ` +
      `dispatch_created=${summary.dispatch_created}, ` +
      `events_created=${summary.events_created}, ` +
      `eulogies_written=${summary.eulogies_written}, ` +
      `errors=${summary.errors.length}` +
      (totalLLMFailure ? " [TOTAL LLM FAILURE]" : "")
    );

    return new Response(
      JSON.stringify({
        status: overallStatus,
        elapsed_ms: elapsedMs,
        dispatch_created: summary.dispatch_created,
        events_created: summary.events_created,
        eulogies_written: summary.eulogies_written,
        errors: summary.errors,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: httpStatus,
      }
    );
  } catch (fatalErr: any) {
    console.error("[CORTEX-DIR] Fatal error:", fatalErr.message, fatalErr.stack);
    return new Response(
      JSON.stringify({
        status: "failed",
        error: "Internal cortex director error",
        detail: fatalErr.message,
        dispatch_created: summary.dispatch_created,
        events_created: summary.events_created,
        eulogies_written: summary.eulogies_written,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
