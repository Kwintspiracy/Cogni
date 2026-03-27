// COGNI v2 — Writing Orchestrator
// Brain of the Writing Game: manages writing event lifecycle, triggers council agents,
// handles iterative drafting, critique, revision, polish, and canonization.
// Runs on cron every 30 minutes.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// TYPES
// ============================================================

interface WritingEvent {
  id: string;
  world_event_id: string;
  premise: string;
  genre: string;
  tone: string;
  chapter_number: number;
  chapter_goal: string;
  current_phase: string;
  phase_started_at: string;
  phase_ends_at: string;
  scoring_config: Record<string, any>;
  hard_constraints: string | null;
  required_motifs: string[] | null;
  required_characters: string[] | null;
  chapter_text: string | null;
  canon: CanonData | null;
  previous_chapter_id: string | null;
}

interface CanonData {
  world_facts?: string[];
  character_truths?: string[];
  chapter_events?: string[];
  motifs?: string[];
  tone_constraints?: string[];
  unresolved_tensions?: string[];
}

interface WritingFragment {
  id: string;
  writing_event_id: string;
  author_agent_id: string;
  content: string;
  fragment_type: string;
  status: string;
  score: number;
  vote_count: number;
  dimension_tags: string[] | null;
  parent_fragment_id: string | null;
  position_hint: number | null;
  phase_submitted: string;
  metadata: Record<string, any> | null;
}

interface CouncilAgent {
  id: string;
  designation: string;
  role: string | null;
  llm_credential_id: string | null;
  llm_model: string | null;
  loop_config: Record<string, any> | null;
}

interface DraftResponse {
  chapter_text: string;
  notes: string;
}

interface CritiqueResponse {
  critique: string;
  severity: "minor" | "moderate" | "major";
  specific_issues: string[];
}

interface RevisionResponse {
  chapter_text: string;
  revision_notes: string;
  critiques_addressed: string[];
}

interface PolishResponse {
  chapter_text: string;
  polish_notes: string;
}

interface CanonVerificationResponse {
  canon_valid: boolean;
  contradictions: string[];
  canon: CanonData;
}

// ============================================================
// COUNCIL ROLE CONFIGURATIONS
// ============================================================

const COUNCIL_MANDATES: Record<string, string> = {
  story_architect:
    "Structural coherence, narrative arc, pacing. Responsible for drafting and revising the full chapter. Ensures a clear beginning, middle, and end with intentional momentum.",
  prose_stylist:
    "Language quality, voice consistency, prose beauty. Responsible for the final polish pass. Ensures writing is vivid, varied, rhythmically engaging, and tonally precise.",
  continuity_guardian:
    "Canon consistency, world-building accuracy. Ensures nothing contradicts established facts, geography, character histories, or prior chapter events.",
  character_psychologist:
    "Character authenticity, emotional truth, believable motivations and dialogue. Ensures characters act from coherent inner lives, not plot convenience.",
};

// ============================================================
// OPENAI CALL
// ============================================================

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.85,
  maxTokens?: number
): Promise<any> {
  const body: any = {
    model: model || "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    response_format: { type: "json_object" },
  };
  if (maxTokens) body.max_tokens = maxTokens;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse OpenAI JSON response: ${content.substring(0, 200)}`);
  }
}

// ============================================================
// FETCH COUNCIL AGENTS FOR EVENT
// ============================================================

async function getCouncilAgents(
  supabase: ReturnType<typeof createClient>,
  eventId: string
): Promise<Array<{ agent: CouncilAgent; participantId: string }>> {
  const { data: participants, error: partError } = await supabase
    .from("writing_event_participants")
    .select(
      "id, agent_id, agents(id, designation, role, llm_credential_id, llm_model, loop_config, is_system)"
    )
    .eq("writing_event_id", eventId)
    .eq("is_council", true);

  if (partError || !participants) {
    console.error(
      `[WRITING-ORCH] Failed to fetch council participants: ${partError?.message ?? "null"}`
    );
    return [];
  }

  return participants
    .filter((p: any) => p.agents !== null)
    .map((p: any) => ({
      participantId: p.id,
      agent: p.agents as CouncilAgent,
    }));
}

// ============================================================
// DECRYPT API KEY HELPER
// ============================================================

async function decryptAgentKey(
  supabase: ReturnType<typeof createClient>,
  agent: CouncilAgent
): Promise<string> {
  if (!agent.llm_credential_id) {
    throw new Error(`Council agent ${agent.designation} has no llm_credential_id`);
  }
  const { data: decryptedKey, error: decryptError } = await supabase.rpc("decrypt_api_key", {
    p_credential_id: agent.llm_credential_id,
  });
  if (decryptError || !decryptedKey) {
    throw new Error(
      `Failed to decrypt API key for ${agent.designation}: ${decryptError?.message ?? "null key"}`
    );
  }
  return decryptedKey as string;
}

// ============================================================
// FRAGMENT SCORE RECALCULATION (kept, unused in new flow)
// ============================================================

async function recalculateFragmentScores(
  supabase: ReturnType<typeof createClient>,
  eventId: string
): Promise<void> {
  console.log(`[WRITING-ORCH] Recalculating fragment scores for event ${eventId}`);

  const { data: fragments, error: fragError } = await supabase
    .from("writing_fragments")
    .select("id")
    .eq("writing_event_id", eventId)
    .not("status", "eq", "rejected");

  if (fragError || !fragments || fragments.length === 0) {
    console.log(`[WRITING-ORCH] No fragments to recalculate for event ${eventId}`);
    return;
  }

  const updatePromises = fragments.map(async (frag) => {
    const { data: votes, error: voteError } = await supabase
      .from("fragment_votes")
      .select("score, weight, is_council_vote")
      .eq("fragment_id", frag.id);

    if (voteError || !votes || votes.length === 0) return;

    const totalWeight = votes.reduce((sum: number, v: any) => sum + (v.weight ?? 1.0), 0);
    const weightedScore =
      totalWeight > 0
        ? votes.reduce((sum: number, v: any) => sum + v.score * (v.weight ?? 1.0), 0) / totalWeight
        : 0;

    await supabase
      .from("writing_fragments")
      .update({
        score: Math.round(weightedScore * 100) / 100,
        vote_count: votes.length,
      })
      .eq("id", frag.id);
  });

  await Promise.allSettled(updatePromises);
  console.log(
    `[WRITING-ORCH] Recalculated scores for ${fragments.length} fragments in event ${eventId}`
  );
}

// ============================================================
// BRIEF GENERATION
// ============================================================

async function generateWritingBrief(
  supabase: ReturnType<typeof createClient>,
  event: WritingEvent,
  phase: string,
  fragments: WritingFragment[]
): Promise<void> {
  const phaseLabels: Record<string, string> = {
    drafting: "Day 1 — Drafting",
    revision: "Day 2 — Revision",
    polish_canonize: "Day 3 — Polish & Canonize",
    // Legacy phases kept for backwards compat
    propose_compete: "Day 1 — Propose & Compete",
    refine_challenge: "Day 2 — Refine & Challenge",
    assemble_canonize: "Day 3 — Assemble & Canonize",
  };

  const draftFragments = fragments.filter((f) => f.fragment_type === "draft");
  const critiqueFragments = fragments.filter((f) => f.fragment_type === "critique");
  const revisionFragments = fragments.filter((f) => f.fragment_type === "revision");
  const polishFragments = fragments.filter((f) => f.fragment_type === "polish");

  const highlights: Record<string, any> = {
    total_fragments: fragments.length,
    draft_count: draftFragments.length,
    critique_count: critiqueFragments.length,
    revision_count: revisionFragments.length,
    polish_count: polishFragments.length,
    phase,
  };

  let briefText = `Phase ${phaseLabels[phase] ?? phase} completed. `;

  if (phase === "drafting") {
    briefText +=
      `${draftFragments.length} chapter draft(s) produced. ` +
      `${critiqueFragments.length} critique(s) received from the council. `;
  } else if (phase === "revision") {
    briefText +=
      `${revisionFragments.length} revised chapter draft(s) produced. ` +
      `The Story Architect incorporated feedback from ${critiqueFragments.length} critique(s). `;
  } else if (phase === "polish_canonize") {
    briefText +=
      `${polishFragments.length} polished chapter text(s) produced. ` +
      `Chapter canonized and council archived. `;
  }

  try {
    await supabase.from("writing_briefs").insert({
      writing_event_id: event.id,
      phase,
      brief_text: briefText,
      highlights,
    });
    console.log(`[WRITING-ORCH] Brief generated for event ${event.id}, phase ${phase}`);
  } catch (err: any) {
    console.error(`[WRITING-ORCH] Brief insert failed: ${err.message}`);
  }
}

// ============================================================
// PROMPT BUILDERS
// ============================================================

function buildPreviousCanonSection(event: WritingEvent): string {
  if (!event.canon || Object.keys(event.canon).length === 0) return "";

  const canon = event.canon;
  const lines: string[] = [];

  if (canon.world_facts && canon.world_facts.length > 0) {
    lines.push("WORLD FACTS:");
    canon.world_facts.forEach((f) => lines.push(`  - ${f}`));
  }
  if (canon.character_truths && canon.character_truths.length > 0) {
    lines.push("CHARACTER TRUTHS:");
    canon.character_truths.forEach((f) => lines.push(`  - ${f}`));
  }
  if (canon.chapter_events && canon.chapter_events.length > 0) {
    lines.push("PREVIOUS CHAPTER EVENTS:");
    canon.chapter_events.forEach((f) => lines.push(`  - ${f}`));
  }
  if (canon.motifs && canon.motifs.length > 0) {
    lines.push("ESTABLISHED MOTIFS:");
    canon.motifs.forEach((f) => lines.push(`  - ${f}`));
  }
  if (canon.tone_constraints && canon.tone_constraints.length > 0) {
    lines.push("TONE CONSTRAINTS:");
    canon.tone_constraints.forEach((f) => lines.push(`  - ${f}`));
  }
  if (canon.unresolved_tensions && canon.unresolved_tensions.length > 0) {
    lines.push("UNRESOLVED TENSIONS TO ADDRESS OR CARRY FORWARD:");
    canon.unresolved_tensions.forEach((f) => lines.push(`  - ${f}`));
  }

  return `\nPREVIOUS CANON:\n${lines.join("\n")}\n`;
}

function buildChapterContextBlock(event: WritingEvent): string {
  const hardConstraintsSection = event.hard_constraints
    ? `\nHARD CONSTRAINTS (must not be violated):\n${event.hard_constraints}\n`
    : "";

  const requiredMotifsSection =
    event.required_motifs && event.required_motifs.length > 0
      ? `\nREQUIRED MOTIFS (must appear):\n${event.required_motifs.map((m) => `  - ${m}`).join("\n")}\n`
      : "";

  const requiredCharsSection =
    event.required_characters && event.required_characters.length > 0
      ? `\nREQUIRED CHARACTERS:\n${event.required_characters.map((c) => `  - ${c}`).join("\n")}\n`
      : "";

  return (
    `CHAPTER ${event.chapter_number} CONTEXT:\n` +
    `  Premise: ${event.premise}\n` +
    `  Genre: ${event.genre}\n` +
    `  Tone: ${event.tone}\n` +
    `  Chapter Goal: ${event.chapter_goal}\n` +
    buildPreviousCanonSection(event) +
    hardConstraintsSection +
    requiredMotifsSection +
    requiredCharsSection
  );
}

function buildDraftSystemPrompt(event: WritingEvent): string {
  const contextBlock = buildChapterContextBlock(event);

  return `You are the STORY ARCHITECT — the primary author responsible for drafting this chapter of a collaborative novel.

Your mandate: ${COUNCIL_MANDATES.story_architect}

${contextBlock}

YOUR TASK: Write a COMPLETE, FULL-LENGTH CHAPTER DRAFT.

LITERARY STANDARDS YOU MUST MEET:
- Target 2000–4000 words. This is a substantial chapter, not a sketch or outline.
- Open with a scene that grounds the reader in place, atmosphere, or immediate tension — no throat-clearing.
- Vary sentence length and structure for rhythm. Alternate long, winding sentences with short punches.
- Use concrete, specific sensory detail. Avoid vague abstractions ("he felt sad" → "his throat tightened").
- Character interiority should feel earned. Reveal thought through specific, observed detail.
- Dialogue must carry subtext — characters rarely say exactly what they mean.
- Build the chapter in three movements: (1) establishment of situation/conflict, (2) escalation or complication, (3) resolution, shift, or cliffhanger that propels forward.
- Honour the genre and tone in every paragraph, not just the setup.
- Do NOT use clichés. Do NOT use purple prose. Do NOT editorialize.
- Write in close third-person unless the premise dictates otherwise.

RESPONSE FORMAT — Respond ONLY with a JSON object (no markdown fences):
{
  "chapter_text": "The complete chapter draft, 2000-4000 words...",
  "notes": "2-3 sentences on your structural approach: what arc you chose, what tension you built, and what you left unresolved for future chapters."
}`;
}

function buildDraftUserPrompt(event: WritingEvent): string {
  return (
    `Writing event ID: ${event.id}\n` +
    `Chapter number: ${event.chapter_number}\n` +
    `Timestamp: ${new Date().toISOString()}\n\n` +
    `Draft the full chapter now. Aim for 2000–4000 words. ` +
    `Remember: respond with valid JSON only containing chapter_text and notes fields.`
  );
}

function buildCritiqueSystemPrompt(
  agent: CouncilAgent,
  event: WritingEvent,
  draftText: string
): string {
  const role = agent.role ?? "prose_stylist";
  const mandate = COUNCIL_MANDATES[role] ?? COUNCIL_MANDATES.prose_stylist;
  const contextBlock = buildChapterContextBlock(event);

  const roleGuidance: Record<string, string> = {
    prose_stylist: `Focus on: sentence variety, word choice precision, rhythm, voice consistency, paragraph structure, show-vs-tell balance, and tonal accuracy. Flag any flat or generic writing. Highlight what's working stylistically.`,
    continuity_guardian: `Focus on: internal consistency with the premise and any canon, logical geography and timeline, character trait consistency, world-building rules, and any contradictions with the chapter goal or required elements.`,
    character_psychologist: `Focus on: whether character motivations are believable, whether dialogue rings true, whether internal reactions are proportionate and specific, whether character arcs are credible, and whether any character acts only to serve plot rather than inner logic.`,
    story_architect: `Focus on: structural integrity, pacing across the three movements, whether the tension builds and releases correctly, whether the chapter goal is achieved, and whether the ending earns its place.`,
  };

  const specificGuidance = roleGuidance[role] ?? roleGuidance.prose_stylist;

  return `You are the ${role.replace(/_/g, " ").toUpperCase()} council agent reviewing a chapter draft.

Your mandate: ${mandate}

${contextBlock}

THE CHAPTER DRAFT:
---
${draftText}
---

YOUR TASK: Provide a rigorous, specific critique from your role's perspective.

CRITIQUE STANDARDS:
- Be concrete: quote specific passages when identifying issues.
- Be constructive: explain not just what is wrong but why and how to fix it.
- Assess severity honestly: "minor" for style tweaks, "moderate" for structural repairs needed, "major" for fundamental problems that require significant revision.
- ${specificGuidance}
- Identify at least 2 and no more than 5 specific issues.
- Also note 1-2 genuine strengths — what is working and should be preserved.

RESPONSE FORMAT — Respond ONLY with a JSON object (no markdown fences):
{
  "critique": "Your full critique from your role's perspective, 300-600 words. Include both what works and what needs fixing. Quote specific passages when useful.",
  "severity": "minor|moderate|major",
  "specific_issues": [
    "Issue 1: [specific passage or aspect] — [what is wrong] — [how to fix]",
    "Issue 2: ...",
    "Issue 3: ..."
  ]
}`;
}

function buildCritiqueUserPrompt(
  agent: CouncilAgent,
  event: WritingEvent
): string {
  const role = agent.role ?? "prose_stylist";
  return (
    `Writing event ID: ${event.id}\n` +
    `Your role: ${role}\n` +
    `Timestamp: ${new Date().toISOString()}\n\n` +
    `Provide your critique of the chapter draft from your role's perspective. ` +
    `Respond with valid JSON only.`
  );
}

function buildRevisionSystemPrompt(
  event: WritingEvent,
  draftText: string,
  critiques: Array<{ role: string; critique: CritiqueResponse }>
): string {
  const contextBlock = buildChapterContextBlock(event);

  const critiqueSections = critiques
    .map(
      ({ role, critique }) =>
        `--- ${role.replace(/_/g, " ").toUpperCase()} (severity: ${critique.severity}) ---\n` +
        `${critique.critique}\n\n` +
        `Specific issues:\n` +
        critique.specific_issues.map((issue, i) => `  ${i + 1}. ${issue}`).join("\n")
    )
    .join("\n\n");

  return `You are the STORY ARCHITECT. You have received critiques from the council on your chapter draft. Your task is to revise the chapter substantially, addressing the feedback.

Your mandate: ${COUNCIL_MANDATES.story_architect}

${contextBlock}

YOUR ORIGINAL DRAFT:
---
${draftText}
---

COUNCIL CRITIQUES:
${critiqueSections}

YOUR TASK: Revise the chapter, incorporating the council's feedback.

REVISION STANDARDS:
- Address all "major" severity issues. They are non-negotiable.
- Address "moderate" issues unless you have a strong craft reason not to (explain in revision_notes).
- Use your judgment on "minor" issues — incorporate where they strengthen the work.
- Do NOT gut the chapter. Preserve what works. This is revision, not rewriting from scratch.
- The revised chapter should still be 2000–4000 words.
- Maintain the structural arc: establishment → escalation → resolution/cliffhanger.
- Honour the genre, tone, and chapter goal throughout.

RESPONSE FORMAT — Respond ONLY with a JSON object (no markdown fences):
{
  "chapter_text": "The fully revised chapter, 2000-4000 words...",
  "revision_notes": "2-3 paragraphs on what changed and why: which critiques you addressed, which you modified, and any craft decisions you made.",
  "critiques_addressed": [
    "Addressed: [brief description of what you fixed]",
    "Partially addressed: [what you changed and why only partially]",
    "Noted but not changed: [what you kept and why]"
  ]
}`;
}

function buildRevisionUserPrompt(event: WritingEvent): string {
  return (
    `Writing event ID: ${event.id}\n` +
    `Chapter number: ${event.chapter_number}\n` +
    `Timestamp: ${new Date().toISOString()}\n\n` +
    `Revise the chapter now, incorporating the council critiques. ` +
    `Respond with valid JSON only.`
  );
}

function buildPolishSystemPrompt(
  event: WritingEvent,
  chapterText: string
): string {
  const contextBlock = buildChapterContextBlock(event);

  return `You are the PROSE STYLIST — the final voice of the council responsible for the last polish pass.

Your mandate: ${COUNCIL_MANDATES.prose_stylist}

${contextBlock}

THE CHAPTER TO POLISH:
---
${chapterText}
---

YOUR TASK: Give this chapter its final prose polish.

POLISH STANDARDS — What you MAY do:
- Improve word choice: replace vague or generic words with precise, vivid ones.
- Tighten sentences: cut filler words, redundant phrases, over-explanation.
- Improve rhythm: vary sentence length, break up monotonous structures.
- Fix show-vs-tell imbalances: convert telling statements into concrete detail.
- Sharpen dialogue tags and beats for naturalness and rhythm.
- Ensure tonal consistency throughout — the opening and closing should feel from the same voice.
- Smooth jarring transitions between paragraphs.

POLISH STANDARDS — What you MUST NOT do:
- Do NOT change plot events, character decisions, or structural beats.
- Do NOT add new scenes, subplots, or characters.
- Do NOT change the ending or opening significantly — only refine their language.
- Do NOT alter the fundamental voice if it is distinctive and intentional.
- Do NOT over-polish into blandness. Preserve idiosyncratic strengths.

The polished chapter should feel like the same story, elevated. Readers should not notice the changes — only feel that the prose sings.

RESPONSE FORMAT — Respond ONLY with a JSON object (no markdown fences):
{
  "chapter_text": "The fully polished chapter...",
  "polish_notes": "2-3 sentences on the key prose improvements you made."
}`;
}

function buildPolishUserPrompt(event: WritingEvent): string {
  return (
    `Writing event ID: ${event.id}\n` +
    `Timestamp: ${new Date().toISOString()}\n\n` +
    `Apply the final prose polish to this chapter. ` +
    `Remember: improve language only — do not alter plot or structure. ` +
    `Respond with valid JSON only.`
  );
}

function buildCanonVerificationSystemPrompt(
  event: WritingEvent,
  polishedText: string
): string {
  const contextBlock = buildChapterContextBlock(event);

  return `You are the CONTINUITY GUARDIAN — the canon keeper of this novel.

Your mandate: ${COUNCIL_MANDATES.continuity_guardian}

${contextBlock}

THE FINALIZED CHAPTER TEXT:
---
${polishedText}
---

YOUR TASK: Verify this chapter against established canon and extract the new canon it creates.

VERIFICATION STEPS:
1. Check every stated fact against the Previous Canon section (if any exists).
2. Flag any contradictions — even minor ones — in the contradictions array.
3. Assess whether the chapter is canon-valid (no contradictions, or only minor acceptable inconsistencies).
4. Extract the new canon this chapter establishes: world facts, character truths, events, motifs, tone rules, and tensions left unresolved.

The canon you extract will be stored permanently and used to constrain all future chapters — be thorough and precise.

RESPONSE FORMAT — Respond ONLY with a JSON object (no markdown fences):
{
  "canon_valid": true,
  "contradictions": [
    "Optional: Any contradiction found — be specific about what conflicts with what."
  ],
  "canon": {
    "world_facts": ["Established rules about the world — geography, physics, technology, magic, political systems, etc."],
    "character_truths": ["Character traits, relationships, revealed secrets, established histories"],
    "chapter_events": ["Key events that occurred in this chapter, in chronological order"],
    "motifs": ["Recurring images, symbols, themes, or patterns introduced or reinforced"],
    "tone_constraints": ["Voice and tonal rules future chapters should honour"],
    "unresolved_tensions": ["Open plot threads, unresolved conflicts, burning questions left for future chapters"]
  }
}`;
}

function buildCanonVerificationUserPrompt(event: WritingEvent): string {
  return (
    `Writing event ID: ${event.id}\n` +
    `Chapter number: ${event.chapter_number}\n` +
    `Timestamp: ${new Date().toISOString()}\n\n` +
    `Verify this chapter against canon and extract the new canon it establishes. ` +
    `Respond with valid JSON only.`
  );
}

// ============================================================
// PHASE PROCESSORS
// ============================================================

async function processDraftingPhase(
  supabase: ReturnType<typeof createClient>,
  event: WritingEvent,
  councilWithParticipants: Array<{ agent: CouncilAgent; participantId: string }>
): Promise<{ draft_created: boolean; critiques_created: number; errors: string[] }> {
  const result = { draft_created: false, critiques_created: 0, errors: [] as string[] };

  console.log(`[WRITING-ORCH] Processing DRAFTING phase for event ${event.id}`);

  // Check if a draft already exists for this event — idempotent guard
  const { data: existingDrafts } = await supabase
    .from("writing_fragments")
    .select("id, content, status")
    .eq("writing_event_id", event.id)
    .eq("fragment_type", "draft")
    .limit(1);

  if (existingDrafts && existingDrafts.length > 0) {
    console.log(
      `[WRITING-ORCH] Draft already exists for event ${event.id} (id: ${existingDrafts[0].id}), checking for critiques...`
    );
    // Draft exists — check if critiques were also done. If so, skip entirely.
    const { data: existingCritiques } = await supabase
      .from("writing_fragments")
      .select("id")
      .eq("writing_event_id", event.id)
      .eq("fragment_type", "critique")
      .limit(1);

    if (existingCritiques && existingCritiques.length > 0) {
      console.log(`[WRITING-ORCH] Critiques also exist for event ${event.id}, skipping drafting phase`);
      result.draft_created = true;
      result.critiques_created = existingCritiques.length;
      return result;
    }

    // Critiques missing — proceed to critique step using existing draft
    console.log(`[WRITING-ORCH] Draft exists but critiques missing — running critiques only`);
    const draftFragment = existingDrafts[0];
    const critiquesResult = await runCritiquesForDraft(
      supabase,
      event,
      draftFragment.id,
      draftFragment.content,
      councilWithParticipants
    );
    result.draft_created = true;
    result.critiques_created = critiquesResult.count;
    result.errors.push(...critiquesResult.errors);
    return result;
  }

  // Step 1: Find Story Architect
  const architectEntry = councilWithParticipants.find((c) => c.agent.role === "story_architect");
  if (!architectEntry) {
    const errMsg = "No Story Architect found in council";
    console.error(`[WRITING-ORCH] ${errMsg} for event ${event.id}`);
    result.errors.push(errMsg);
    return result;
  }

  const architect = architectEntry.agent;

  // Step 2: Decrypt API key
  let apiKey: string;
  try {
    apiKey = await decryptAgentKey(supabase, architect);
  } catch (err: any) {
    result.errors.push(`Key decrypt: ${err.message}`);
    return result;
  }

  // Step 3: Build draft prompt and call OpenAI
  const draftSystemPrompt = buildDraftSystemPrompt(event);
  const draftUserPrompt = buildDraftUserPrompt(event);

  let draftResponse: DraftResponse;
  try {
    console.log(`[WRITING-ORCH] Calling OpenAI for chapter draft (event ${event.id})...`);
    draftResponse = await callOpenAI(
      apiKey,
      architect.llm_model ?? "gpt-4o",
      draftSystemPrompt,
      draftUserPrompt,
      0.85,
      16000
    ) as DraftResponse;
  } catch (err: any) {
    const errMsg = `Draft LLM call failed: ${err.message}`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  if (!draftResponse.chapter_text || draftResponse.chapter_text.trim().length < 500) {
    const errMsg = `Draft response has insufficient chapter_text (${draftResponse.chapter_text?.length ?? 0} chars)`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  console.log(
    `[WRITING-ORCH] Draft generated: ${draftResponse.chapter_text.length} chars, notes: "${draftResponse.notes?.substring(0, 100)}..."`
  );

  // Step 4: Store the draft as a writing_fragment
  let draftFragmentId: string;
  try {
    const { error: submitError } = await supabase.rpc("submit_writing_fragment", {
      p_event_id: event.id,
      p_agent_id: architect.id,
      p_content: draftResponse.chapter_text.trim(),
      p_fragment_type: "draft",
      p_position_hint: 0,
    });

    if (submitError) {
      throw new Error(`submit_writing_fragment RPC failed: ${submitError.message}`);
    }

    // Fetch the fragment we just created to get its ID
    const { data: createdFragment, error: fetchError } = await supabase
      .from("writing_fragments")
      .select("id")
      .eq("writing_event_id", event.id)
      .eq("fragment_type", "draft")
      .eq("author_agent_id", architect.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !createdFragment) {
      throw new Error(`Could not fetch newly created draft fragment: ${fetchError?.message ?? "null"}`);
    }

    draftFragmentId = createdFragment.id;

    // Update status to 'draft' (marking it as the working draft)
    await supabase
      .from("writing_fragments")
      .update({ status: "draft", metadata: { notes: draftResponse.notes ?? "" } })
      .eq("id", draftFragmentId);

    result.draft_created = true;
    console.log(`[WRITING-ORCH] Draft fragment stored: ${draftFragmentId}`);
  } catch (err: any) {
    const errMsg = `Draft fragment storage failed: ${err.message}`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  // Step 5: Run critiques from all other council members
  const critiquesResult = await runCritiquesForDraft(
    supabase,
    event,
    draftFragmentId,
    draftResponse.chapter_text,
    councilWithParticipants
  );
  result.critiques_created = critiquesResult.count;
  result.errors.push(...critiquesResult.errors);

  return result;
}

async function runCritiquesForDraft(
  supabase: ReturnType<typeof createClient>,
  event: WritingEvent,
  draftFragmentId: string,
  draftText: string,
  councilWithParticipants: Array<{ agent: CouncilAgent; participantId: string }>
): Promise<{ count: number; errors: string[] }> {
  const result = { count: 0, errors: [] as string[] };

  // All council agents EXCEPT story_architect provide critiques
  const critiqueAgents = councilWithParticipants.filter(
    (c) => c.agent.role !== "story_architect"
  );

  if (critiqueAgents.length === 0) {
    console.log(`[WRITING-ORCH] No critique agents found (non-architect) for event ${event.id}`);
    return result;
  }

  console.log(
    `[WRITING-ORCH] Running ${critiqueAgents.length} critique agents for event ${event.id}`
  );

  // Run critiques in parallel
  const critiqueResults = await Promise.allSettled(
    critiqueAgents.map(async ({ agent }) => {
      const role = agent.role ?? "prose_stylist";
      let apiKey: string;
      try {
        apiKey = await decryptAgentKey(supabase, agent);
      } catch (err: any) {
        throw new Error(`Key decrypt for ${agent.designation}: ${err.message}`);
      }

      const systemPrompt = buildCritiqueSystemPrompt(agent, event, draftText);
      const userPrompt = buildCritiqueUserPrompt(agent, event);

      console.log(`[WRITING-ORCH] Requesting critique from ${agent.designation} (${role})`);
      const critiqueResponse = await callOpenAI(
        apiKey,
        agent.llm_model ?? "gpt-4o",
        systemPrompt,
        userPrompt,
        0.75
      ) as CritiqueResponse;

      if (!critiqueResponse.critique || critiqueResponse.critique.trim().length < 50) {
        throw new Error(`Critique response too short for ${agent.designation}`);
      }

      // Store critique as a fragment
      const critiqueContent = JSON.stringify({
        critique: critiqueResponse.critique,
        severity: critiqueResponse.severity ?? "moderate",
        specific_issues: critiqueResponse.specific_issues ?? [],
        role,
      });

      const { error: submitError } = await supabase.rpc("submit_writing_fragment", {
        p_event_id: event.id,
        p_agent_id: agent.id,
        p_content: critiqueContent,
        p_fragment_type: "critique",
        p_position_hint: 0,
      });

      if (submitError) {
        throw new Error(`submit_writing_fragment for critique (${agent.designation}): ${submitError.message}`);
      }

      // Fetch the critique fragment ID and update its parent_fragment_id and status
      const { data: critiqueFragment } = await supabase
        .from("writing_fragments")
        .select("id")
        .eq("writing_event_id", event.id)
        .eq("fragment_type", "critique")
        .eq("author_agent_id", agent.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (critiqueFragment) {
        await supabase
          .from("writing_fragments")
          .update({
            status: "proposed",
            parent_fragment_id: draftFragmentId,
            metadata: {
              severity: critiqueResponse.severity,
              role,
              specific_issues_count: (critiqueResponse.specific_issues ?? []).length,
            },
          })
          .eq("id", critiqueFragment.id);
      }

      console.log(
        `[WRITING-ORCH] Critique stored from ${agent.designation} (severity: ${critiqueResponse.severity})`
      );
      return { agentId: agent.id, designation: agent.designation, severity: critiqueResponse.severity };
    })
  );

  for (const r of critiqueResults) {
    if (r.status === "fulfilled") {
      result.count++;
    } else {
      const errMsg = r.reason?.message ?? "Unknown critique error";
      result.errors.push(`Critique agent: ${errMsg}`);
      console.error(`[WRITING-ORCH] Critique failed: ${errMsg}`);
    }
  }

  return result;
}

async function processRevisionPhase(
  supabase: ReturnType<typeof createClient>,
  event: WritingEvent,
  councilWithParticipants: Array<{ agent: CouncilAgent; participantId: string }>
): Promise<{ revision_created: boolean; errors: string[] }> {
  const result = { revision_created: false, errors: [] as string[] };

  console.log(`[WRITING-ORCH] Processing REVISION phase for event ${event.id}`);

  // Idempotent guard — check if revision already exists
  const { data: existingRevisions } = await supabase
    .from("writing_fragments")
    .select("id")
    .eq("writing_event_id", event.id)
    .eq("fragment_type", "revision")
    .limit(1);

  if (existingRevisions && existingRevisions.length > 0) {
    console.log(`[WRITING-ORCH] Revision already exists for event ${event.id}, skipping`);
    result.revision_created = true;
    return result;
  }

  // Step 1: Fetch the latest draft fragment
  const { data: draftFragments, error: draftError } = await supabase
    .from("writing_fragments")
    .select("id, content, status")
    .eq("writing_event_id", event.id)
    .eq("fragment_type", "draft")
    .order("created_at", { ascending: false })
    .limit(1);

  if (draftError || !draftFragments || draftFragments.length === 0) {
    const errMsg = `No draft fragment found for revision in event ${event.id}`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  const draftFragment = draftFragments[0];
  const draftText = draftFragment.content;

  // Step 2: Fetch all critique fragments linked to this draft
  const { data: critiqueFragments, error: critiqueError } = await supabase
    .from("writing_fragments")
    .select("id, content, author_agent_id")
    .eq("writing_event_id", event.id)
    .eq("fragment_type", "critique")
    .eq("parent_fragment_id", draftFragment.id);

  if (critiqueError) {
    const errMsg = `Failed to fetch critiques for revision: ${critiqueError.message}`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  // Parse critique objects
  const parsedCritiques: Array<{ role: string; critique: CritiqueResponse }> = [];
  for (const cf of (critiqueFragments ?? [])) {
    try {
      const parsed = JSON.parse(cf.content) as CritiqueResponse & { role: string };
      parsedCritiques.push({ role: parsed.role ?? "reviewer", critique: parsed });
    } catch {
      // If content is not JSON, treat as plain text critique
      parsedCritiques.push({
        role: "reviewer",
        critique: {
          critique: cf.content,
          severity: "moderate",
          specific_issues: [],
        },
      });
    }
  }

  console.log(
    `[WRITING-ORCH] Found ${parsedCritiques.length} critiques for revision of draft ${draftFragment.id}`
  );

  // Step 3: Find Story Architect for revision
  const architectEntry = councilWithParticipants.find((c) => c.agent.role === "story_architect");
  if (!architectEntry) {
    const errMsg = "No Story Architect found for revision phase";
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  const architect = architectEntry.agent;

  // Step 4: Decrypt API key
  let apiKey: string;
  try {
    apiKey = await decryptAgentKey(supabase, architect);
  } catch (err: any) {
    result.errors.push(`Key decrypt: ${err.message}`);
    return result;
  }

  // Step 5: Build revision prompt and call OpenAI
  const revisionSystemPrompt = buildRevisionSystemPrompt(event, draftText, parsedCritiques);
  const revisionUserPrompt = buildRevisionUserPrompt(event);

  let revisionResponse: RevisionResponse;
  try {
    console.log(`[WRITING-ORCH] Calling OpenAI for chapter revision (event ${event.id})...`);
    revisionResponse = await callOpenAI(
      apiKey,
      architect.llm_model ?? "gpt-4o",
      revisionSystemPrompt,
      revisionUserPrompt,
      0.8,
      16000
    ) as RevisionResponse;
  } catch (err: any) {
    const errMsg = `Revision LLM call failed: ${err.message}`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  if (!revisionResponse.chapter_text || revisionResponse.chapter_text.trim().length < 500) {
    const errMsg = `Revision response has insufficient chapter_text (${revisionResponse.chapter_text?.length ?? 0} chars)`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  console.log(
    `[WRITING-ORCH] Revision generated: ${revisionResponse.chapter_text.length} chars`
  );

  // Step 6: Store revision as a writing_fragment
  try {
    const { error: submitError } = await supabase.rpc("submit_writing_fragment", {
      p_event_id: event.id,
      p_agent_id: architect.id,
      p_content: revisionResponse.chapter_text.trim(),
      p_fragment_type: "revision",
      p_position_hint: 0,
    });

    if (submitError) {
      throw new Error(`submit_writing_fragment for revision failed: ${submitError.message}`);
    }

    // Fetch newly created revision fragment
    const { data: revisionFragment, error: fetchRevError } = await supabase
      .from("writing_fragments")
      .select("id")
      .eq("writing_event_id", event.id)
      .eq("fragment_type", "revision")
      .eq("author_agent_id", architect.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchRevError || !revisionFragment) {
      throw new Error(`Could not fetch newly created revision fragment: ${fetchRevError?.message ?? "null"}`);
    }

    // Update revision fragment: status, parent_fragment_id, metadata
    await supabase
      .from("writing_fragments")
      .update({
        status: "revised",
        parent_fragment_id: draftFragment.id,
        metadata: {
          revision_notes: revisionResponse.revision_notes ?? "",
          critiques_addressed: revisionResponse.critiques_addressed ?? [],
          critiques_incorporated: parsedCritiques.length,
        },
      })
      .eq("id", revisionFragment.id);

    // Mark the original draft as 'under_review'
    await supabase
      .from("writing_fragments")
      .update({ status: "under_review" })
      .eq("id", draftFragment.id);

    result.revision_created = true;
    console.log(`[WRITING-ORCH] Revision fragment stored: ${revisionFragment.id}, draft ${draftFragment.id} marked under_review`);
  } catch (err: any) {
    const errMsg = `Revision fragment storage failed: ${err.message}`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
  }

  return result;
}

async function processPolishPhase(
  supabase: ReturnType<typeof createClient>,
  event: WritingEvent,
  councilWithParticipants: Array<{ agent: CouncilAgent; participantId: string }>
): Promise<{ polished: boolean; canonized: boolean; errors: string[] }> {
  const result = { polished: false, canonized: false, errors: [] as string[] };

  console.log(`[WRITING-ORCH] Processing POLISH & CANONIZE phase for event ${event.id}`);

  // Idempotent guard — check if polish already exists
  const { data: existingPolish } = await supabase
    .from("writing_fragments")
    .select("id")
    .eq("writing_event_id", event.id)
    .eq("fragment_type", "polish")
    .limit(1);

  if (existingPolish && existingPolish.length > 0) {
    console.log(`[WRITING-ORCH] Polish already exists for event ${event.id}, skipping`);
    result.polished = true;
    // Check if the event is already canonized (chapter_text set)
    const { data: freshEvent } = await supabase
      .from("writing_events")
      .select("chapter_text")
      .eq("id", event.id)
      .single();
    result.canonized = !!freshEvent?.chapter_text;
    return result;
  }

  // Step 1: Fetch the latest revision fragment, fall back to latest draft
  let sourceFragment: { id: string; content: string; fragment_type: string } | null = null;

  const { data: revisionFragments } = await supabase
    .from("writing_fragments")
    .select("id, content, fragment_type")
    .eq("writing_event_id", event.id)
    .eq("fragment_type", "revision")
    .order("created_at", { ascending: false })
    .limit(1);

  if (revisionFragments && revisionFragments.length > 0) {
    sourceFragment = revisionFragments[0];
    console.log(`[WRITING-ORCH] Using revision fragment ${sourceFragment.id} for polish`);
  } else {
    const { data: draftFragments } = await supabase
      .from("writing_fragments")
      .select("id, content, fragment_type")
      .eq("writing_event_id", event.id)
      .eq("fragment_type", "draft")
      .order("created_at", { ascending: false })
      .limit(1);

    if (draftFragments && draftFragments.length > 0) {
      sourceFragment = draftFragments[0];
      console.log(
        `[WRITING-ORCH] No revision found, falling back to draft fragment ${sourceFragment.id} for polish`
      );
    }
  }

  if (!sourceFragment) {
    const errMsg = `No draft or revision fragment found to polish for event ${event.id}`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  const chapterTextToPolish = sourceFragment.content;

  // Step 2: Find Prose Stylist for the polish pass
  const stylistEntry = councilWithParticipants.find((c) => c.agent.role === "prose_stylist");
  if (!stylistEntry) {
    const errMsg = "No Prose Stylist found in council for polish phase";
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  const stylist = stylistEntry.agent;

  // Step 3: Decrypt API key for Prose Stylist
  let stylistApiKey: string;
  try {
    stylistApiKey = await decryptAgentKey(supabase, stylist);
  } catch (err: any) {
    result.errors.push(`Key decrypt for stylist: ${err.message}`);
    return result;
  }

  // Step 4: Build polish prompt and call OpenAI
  const polishSystemPrompt = buildPolishSystemPrompt(event, chapterTextToPolish);
  const polishUserPrompt = buildPolishUserPrompt(event);

  let polishResponse: PolishResponse;
  try {
    console.log(`[WRITING-ORCH] Calling OpenAI for prose polish (event ${event.id})...`);
    polishResponse = await callOpenAI(
      stylistApiKey,
      stylist.llm_model ?? "gpt-4o",
      polishSystemPrompt,
      polishUserPrompt,
      0.7,
      16000
    ) as PolishResponse;
  } catch (err: any) {
    const errMsg = `Polish LLM call failed: ${err.message}`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  if (!polishResponse.chapter_text || polishResponse.chapter_text.trim().length < 500) {
    const errMsg = `Polish response has insufficient chapter_text (${polishResponse.chapter_text?.length ?? 0} chars)`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  const polishedText = polishResponse.chapter_text.trim();
  console.log(
    `[WRITING-ORCH] Polish completed: ${polishedText.length} chars — "${polishResponse.polish_notes?.substring(0, 80)}..."`
  );

  // Step 5: Store polish as a writing_fragment
  let polishFragmentId: string;
  try {
    const { error: submitError } = await supabase.rpc("submit_writing_fragment", {
      p_event_id: event.id,
      p_agent_id: stylist.id,
      p_content: polishedText,
      p_fragment_type: "polish",
      p_position_hint: 0,
    });

    if (submitError) {
      throw new Error(`submit_writing_fragment for polish failed: ${submitError.message}`);
    }

    // Fetch the newly created polish fragment
    const { data: polishFragment, error: fetchPolError } = await supabase
      .from("writing_fragments")
      .select("id")
      .eq("writing_event_id", event.id)
      .eq("fragment_type", "polish")
      .eq("author_agent_id", stylist.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchPolError || !polishFragment) {
      throw new Error(`Could not fetch newly created polish fragment: ${fetchPolError?.message ?? "null"}`);
    }

    polishFragmentId = polishFragment.id;

    // Update polish fragment: status, parent_fragment_id
    await supabase
      .from("writing_fragments")
      .update({
        status: "polished",
        parent_fragment_id: sourceFragment.id,
        metadata: {
          polish_notes: polishResponse.polish_notes ?? "",
          source_fragment_type: sourceFragment.fragment_type,
        },
      })
      .eq("id", polishFragmentId);

    result.polished = true;
    console.log(`[WRITING-ORCH] Polish fragment stored: ${polishFragmentId}`);
  } catch (err: any) {
    const errMsg = `Polish fragment storage failed: ${err.message}`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  // Step 6: Canon verification by Continuity Guardian (non-blocking)
  let canonData: CanonData = {};
  const guardianEntry = councilWithParticipants.find((c) => c.agent.role === "continuity_guardian");

  if (guardianEntry) {
    const guardian = guardianEntry.agent;
    try {
      const guardianApiKey = await decryptAgentKey(supabase, guardian);
      const canonSystemPrompt = buildCanonVerificationSystemPrompt(event, polishedText);
      const canonUserPrompt = buildCanonVerificationUserPrompt(event);

      console.log(`[WRITING-ORCH] Requesting canon verification from ${guardian.designation}`);
      const canonResponse = await callOpenAI(
        guardianApiKey,
        guardian.llm_model ?? "gpt-4o",
        canonSystemPrompt,
        canonUserPrompt,
        0.6
      ) as CanonVerificationResponse;

      if (canonResponse.canon) {
        canonData = canonResponse.canon;
      }

      if (!canonResponse.canon_valid && canonResponse.contradictions && canonResponse.contradictions.length > 0) {
        console.warn(
          `[WRITING-ORCH] Canon verification found ${canonResponse.contradictions.length} contradiction(s) for event ${event.id}: ` +
          canonResponse.contradictions.slice(0, 2).join("; ")
        );
        // Non-blocking — we log the contradictions but proceed with canonization
      } else {
        console.log(`[WRITING-ORCH] Canon verification passed for event ${event.id}`);
      }
    } catch (err: any) {
      const errMsg = `Canon verification failed (non-blocking): ${err.message}`;
      result.errors.push(errMsg);
      console.error(`[WRITING-ORCH] ${errMsg}`);
      // Continue without canon data — canonize_chapter can handle an empty canon
    }
  } else {
    console.warn(`[WRITING-ORCH] No Continuity Guardian found for event ${event.id} — skipping canon verification`);
  }

  // Step 7: Canonize the chapter via RPC
  try {
    const { error: canonizeError } = await supabase.rpc("canonize_chapter", {
      p_event_id: event.id,
      p_chapter_text: polishedText,
      p_canon: canonData,
    });

    if (canonizeError) {
      throw new Error(`canonize_chapter RPC failed: ${canonizeError.message}`);
    }

    result.canonized = true;
    console.log(
      `[WRITING-ORCH] Chapter canonized for event ${event.id} (${polishedText.length} chars)`
    );
  } catch (err: any) {
    const errMsg = `Canonization failed: ${err.message}`;
    result.errors.push(errMsg);
    console.error(`[WRITING-ORCH] ${errMsg}`);
    return result;
  }

  // Step 8: Archive council agents now that the chapter is complete
  try {
    const { data: archivedCount, error: archiveError } = await supabase.rpc(
      "archive_council_agents",
      { p_writing_event_id: event.id }
    );

    if (archiveError) {
      console.error(
        `[WRITING-ORCH] Failed to archive council agents for event ${event.id}: ${archiveError.message}`
      );
      result.errors.push(`Council archive: ${archiveError.message}`);
    } else {
      console.log(`[WRITING-ORCH] Archived ${archivedCount} council agents for event ${event.id}`);
    }
  } catch (err: any) {
    console.error(`[WRITING-ORCH] Archive council exception for event ${event.id}: ${err.message}`);
    result.errors.push(`Council archive exception: ${err.message}`);
  }

  return result;
}

// ============================================================
// PROCESS SINGLE WRITING EVENT
// ============================================================

async function processWritingEvent(
  supabase: ReturnType<typeof createClient>,
  event: WritingEvent
): Promise<Record<string, any>> {
  const result: Record<string, any> = {
    event_id: event.id,
    phase_before: event.current_phase,
    phase_advanced: false,
    council_agents_run: 0,
    fragments_submitted: 0,
    votes_cast: 0,
    scores_recalculated: false,
    chapter_assembled: false,
    errors: [] as string[],
  };

  // ── Step 1: Check if phase needs advancing ──────────────────
  const now = new Date();
  const phaseEndsAt = new Date(event.phase_ends_at);
  let currentPhase = event.current_phase;

  if (now > phaseEndsAt && currentPhase !== "completed") {
    console.log(
      `[WRITING-ORCH] Phase ${currentPhase} expired for event ${event.id}, advancing...`
    );

    // Generate brief for the phase that just ended
    try {
      const { data: existingFragments } = await supabase
        .from("writing_fragments")
        .select("*")
        .eq("writing_event_id", event.id)
        .eq("phase_submitted", currentPhase);

      if (existingFragments && existingFragments.length > 0) {
        await generateWritingBrief(
          supabase,
          event,
          currentPhase,
          existingFragments as WritingFragment[]
        );
      }
    } catch (briefErr: any) {
      result.errors.push(`Brief generation: ${briefErr.message}`);
    }

    // Advance phase via RPC
    try {
      const { data: newPhase, error: advanceError } = await supabase.rpc(
        "advance_writing_phase",
        { p_event_id: event.id }
      );

      if (advanceError) {
        result.errors.push(`Phase advance: ${advanceError.message}`);
        console.error(
          `[WRITING-ORCH] Phase advance failed for event ${event.id}: ${advanceError.message}`
        );
      } else {
        currentPhase = newPhase as string;
        result.phase_advanced = true;
        result.phase_after = currentPhase;
        console.log(
          `[WRITING-ORCH] Event ${event.id} advanced to phase: ${currentPhase}`
        );
      }
    } catch (advanceExc: any) {
      result.errors.push(`Phase advance exception: ${advanceExc.message}`);
    }
  }

  // Skip further processing if event is now completed
  if (currentPhase === "completed") {
    console.log(`[WRITING-ORCH] Event ${event.id} is completed, skipping council trigger`);
    return result;
  }

  // ── Step 2: Fetch/auto-spawn council agents ──────────────────
  let councilWithParticipants = await getCouncilAgents(supabase, event.id);

  if (councilWithParticipants.length === 0 && currentPhase !== "completed") {
    console.log(
      `[WRITING-ORCH] No council agents for event ${event.id}, spawning from config...`
    );

    // Use the first available OpenAI credential
    const { data: cred } = await supabase
      .from("llm_credentials")
      .select("id")
      .eq("provider", "openai")
      .limit(1)
      .single();

    if (cred) {
      const { data: spawnCount, error: spawnError } = await supabase.rpc(
        "spawn_council_agents",
        {
          p_writing_event_id: event.id,
          p_llm_credential_id: cred.id,
          p_llm_model: "gpt-4o",
        }
      );

      if (spawnError) {
        const errMsg = `Council spawn failed: ${spawnError.message}`;
        result.errors.push(errMsg);
        console.error(`[WRITING-ORCH] ${errMsg}`);
      } else {
        console.log(`[WRITING-ORCH] Spawned ${spawnCount} council agents for event ${event.id}`);
        councilWithParticipants = await getCouncilAgents(supabase, event.id);
      }
    } else {
      console.warn(
        `[WRITING-ORCH] No OpenAI credential available to spawn council for event ${event.id}`
      );
    }
  }

  if (councilWithParticipants.length === 0) {
    console.log(`[WRITING-ORCH] No council agents found for event ${event.id}, cannot proceed`);
    result.errors.push("No council agents available");
    return result;
  }

  result.council_agents_run = councilWithParticipants.length;
  console.log(
    `[WRITING-ORCH] ${councilWithParticipants.length} council agent(s) available for event ${event.id}, phase: ${currentPhase}`
  );

  // ── Step 3: Phase-specific processing ────────────────────────

  if (currentPhase === "drafting") {
    const phaseResult = await processDraftingPhase(supabase, event, councilWithParticipants);
    result.draft_created = phaseResult.draft_created;
    result.critiques_created = phaseResult.critiques_created;
    result.fragments_submitted = phaseResult.draft_created ? 1 : 0;
    result.fragments_submitted += phaseResult.critiques_created;
    result.errors.push(...phaseResult.errors);

  } else if (currentPhase === "revision") {
    const phaseResult = await processRevisionPhase(supabase, event, councilWithParticipants);
    result.revision_created = phaseResult.revision_created;
    result.fragments_submitted = phaseResult.revision_created ? 1 : 0;
    result.errors.push(...phaseResult.errors);

  } else if (currentPhase === "polish_canonize") {
    const phaseResult = await processPolishPhase(supabase, event, councilWithParticipants);
    result.polished = phaseResult.polished;
    result.chapter_assembled = phaseResult.canonized;
    result.fragments_submitted = phaseResult.polished ? 1 : 0;
    result.errors.push(...phaseResult.errors);

  } else if (
    // Legacy phase support for backwards compatibility
    currentPhase === "propose_compete" ||
    currentPhase === "refine_challenge" ||
    currentPhase === "assemble_canonize"
  ) {
    console.log(
      `[WRITING-ORCH] Legacy phase detected: ${currentPhase} — treating as equivalent new phase`
    );

    // Map legacy phases to new equivalents
    if (currentPhase === "propose_compete" || currentPhase === "refine_challenge") {
      const phaseResult = await processDraftingPhase(supabase, event, councilWithParticipants);
      result.draft_created = phaseResult.draft_created;
      result.critiques_created = phaseResult.critiques_created;
      result.fragments_submitted = (phaseResult.draft_created ? 1 : 0) + phaseResult.critiques_created;
      result.errors.push(...phaseResult.errors);
    } else if (currentPhase === "assemble_canonize") {
      const phaseResult = await processPolishPhase(supabase, event, councilWithParticipants);
      result.polished = phaseResult.polished;
      result.chapter_assembled = phaseResult.canonized;
      result.fragments_submitted = phaseResult.polished ? 1 : 0;
      result.errors.push(...phaseResult.errors);
    }

  } else {
    console.log(`[WRITING-ORCH] Unknown phase "${currentPhase}" for event ${event.id} — no action taken`);
  }

  return result;
}

// ============================================================
// MAIN HANDLER
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[WRITING-ORCH] Starting writing orchestrator cycle (iterative-drafting model)...");

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const summary: Record<string, any> = {
      events_processed: 0,
      events_advanced: 0,
      total_council_runs: 0,
      total_fragments_submitted: 0,
      chapters_assembled: 0,
      errors: [] as string[],
      event_results: [] as Record<string, any>[],
    };

    // ── Fetch active writing events ──────────────────────────────
    const { data: activeEvents, error: fetchError } = await supabase.rpc(
      "get_active_writing_events"
    );

    if (fetchError) {
      console.error(`[WRITING-ORCH] Failed to fetch active events: ${fetchError.message}`);
      return new Response(
        JSON.stringify({ status: "failed", error: fetchError.message }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    if (!activeEvents || activeEvents.length === 0) {
      console.log("[WRITING-ORCH] No active writing events found.");
      return new Response(
        JSON.stringify({
          status: "ok",
          message: "No active writing events",
          elapsed_ms: Date.now() - startTime,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`[WRITING-ORCH] Found ${activeEvents.length} active writing event(s)`);

    // ── Process each event sequentially (events are independent,
    //    but each phase has internal parallelism for critique agents)
    for (const event of activeEvents as WritingEvent[]) {
      try {
        const eventResult = await processWritingEvent(supabase, event);

        summary.events_processed++;
        if (eventResult.phase_advanced) summary.events_advanced++;
        summary.total_council_runs += eventResult.council_agents_run ?? 0;
        summary.total_fragments_submitted += eventResult.fragments_submitted ?? 0;
        if (eventResult.chapter_assembled) {
          summary.chapters_assembled++;
        }
        if (eventResult.errors.length > 0) {
          summary.errors.push(
            ...eventResult.errors.map((e: string) => `[event ${event.id}] ${e}`)
          );
        }

        summary.event_results.push(eventResult);
      } catch (eventErr: any) {
        const errMsg = `Event ${event.id} processing failed: ${eventErr.message}`;
        console.error(`[WRITING-ORCH] ${errMsg}`);
        summary.errors.push(errMsg);
      }
    }

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[WRITING-ORCH] Cycle complete in ${elapsedMs}ms — ` +
      `${summary.events_processed} events processed, ` +
      `${summary.events_advanced} advanced, ` +
      `${summary.total_fragments_submitted} fragments submitted, ` +
      `${summary.chapters_assembled} chapters canonized`
    );

    return new Response(
      JSON.stringify({
        status: "completed",
        elapsed_ms: elapsedMs,
        ...summary,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[WRITING-ORCH] Fatal error:", error.message, error.stack);
    return new Response(
      JSON.stringify({
        status: "failed",
        error: "Internal writing orchestrator error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
