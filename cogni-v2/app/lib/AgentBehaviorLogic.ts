import { AGENT_BEHAVIOR_QUESTIONS } from './AgentBehaviorQuestions';

export interface AgentBehaviorSpec {
  role: {
    primary_function: string;
  };
  stance: {
    default_mode: string;
    temperature: string;
    ambiguity_tolerance: string;
    likeability_priority: string;
  };
  engagement: {
    speak_threshold: string;
    silence_is_success: boolean;
    enter_thread_when: string[];
    stay_silent_when: string[];
  };
  conflict: {
    contradiction_policy: string;
    bluntness: string;
    sarcasm: string;
    escalate_on_repetition: boolean;
    disengage_on_defensiveness: string;
  };
  memory: {
    repeat_avoidance: string;
    reengage_same_post: string;
    remember_long_term: string[];
  };
  output_style: {
    length: string;
    mirror_user_tone: string;
    followup_questions: string;
    humor: string;
    voice: string;
  };
  taboos: string[];
}

export interface ArchetypeTraits {
  openness: number;     // 0.0-1.0
  aggression: number;   // 0.0-1.0
  neuroticism: number;  // 0.0-1.0
}

export interface CognitivityResult {
  behaviorSpec: AgentBehaviorSpec;
  archetype: ArchetypeTraits;
}

function clamp(val: number, min = 0.0, max = 1.0): number {
  return Math.min(max, Math.max(min, val));
}

export function calculateAgentSpec(
  answers: Record<number, string | string[]>,
): CognitivityResult {
  const getSingle = (id: number) => answers[id] as string;
  const getMulti = (id: number) => (answers[id] as string[]) || [];
  const getOptionText = (qId: number, optId: string) => {
    const q = AGENT_BEHAVIOR_QUESTIONS.find((q) => q.id === qId);
    return q?.options.find((o) => o.id === optId)?.text || optId;
  };

  // --- Role ---
  const primaryFunction = getOptionText(1, getSingle(1));

  // --- Stance ---
  // Q5: Values
  const q5 = getSingle(5);
  let defaultMode = 'neutral';
  if (q5 === 'A') defaultMode = 'analytical';
  else if (q5 === 'B') defaultMode = 'diplomatic';
  else if (q5 === 'C') defaultMode = 'precise';
  else if (q5 === 'D') defaultMode = 'efficient';

  // Temperature based on Q35 (mirror tone)
  const q35 = getSingle(35);
  let temperature = 'neutral';
  if (q35 === 'A' || q35 === 'B') temperature = 'warm';
  else if (q35 === 'D') temperature = 'cool';

  // Ambiguity Tolerance Q33
  const q33 = getSingle(33);
  let ambiguityTolerance = 'moderate';
  if (q33 === 'A' || q33 === 'B') ambiguityTolerance = 'low';
  else if (q33 === 'C') ambiguityTolerance = 'high';
  else if (q33 === 'D') ambiguityTolerance = 'embracing';

  // Likeability Q18
  const q18 = getSingle(18);
  const likeabilityPriority = getOptionText(18, q18).toLowerCase();

  // --- Engagement ---
  // Speak Threshold Q11
  const q11 = getSingle(11);
  let speakThreshold = 'medium';
  if (q11 === 'A' || q11 === 'B') speakThreshold = 'high';
  else if (q11 === 'D' || q11 === 'E') speakThreshold = 'low';

  // Silence is success Q9=D OR Q10=C/D
  const q9 = getSingle(9);
  const q10 = getSingle(10);
  const silenceIsSuccess = q9 === 'D' || q10 === 'C' || q10 === 'D';

  // Enter thread Q7
  const enterThread = [getOptionText(7, getSingle(7))];

  // Stay silent Q8
  const staySilent = getMulti(8);

  // --- Conflict ---
  // Contradiction Q16
  const q16 = getSingle(16);
  let contradictionPolicy = 'evidence_required';
  if (q16 === 'A') contradictionPolicy = 'never';
  else if (q16 === 'B') contradictionPolicy = 'when_asked';
  else if (q16 === 'D') contradictionPolicy = 'active';

  // Bluntness Q14
  const q14 = getSingle(14);
  let bluntness = 'polite';
  if (q14 === 'D') bluntness = 'unfiltered';
  else if (q14 === 'C') bluntness = 'constructive';
  else if (q14 === 'B') bluntness = 'socratic';

  // Sarcasm Q19
  const sarcasm = getOptionText(19, getSingle(19)).toLowerCase();

  // Escalate on Repetition Q15
  const q15 = getSingle(15);
  const escalateOnRepetition = q15 === 'C';

  // Disengage Q17
  const disengageOnDefensiveness = getOptionText(17, getSingle(17)).toLowerCase();

  // --- Memory ---
  // Repeat Avoidance Q22 & Q25
  const q22 = getSingle(22);
  const q25 = getSingle(25);
  let repeatAvoidance = 'moderate';
  if (q22 === 'A' || q25 === 'A') repeatAvoidance = 'strict';
  else if (q25 === 'D') repeatAvoidance = 'low';

  // Re-engage Q24
  const reengageSamePost = getOptionText(24, getSingle(24)).toLowerCase().replace(/ /g, '_');

  // Remember Long Term Q23
  const rememberLongTerm = getMulti(23);

  // --- Output Style ---
  const length = getOptionText(34, getSingle(34)).toLowerCase().replace(' ', '_');
  const mirrorUserTone = getOptionText(35, getSingle(35)).toLowerCase();
  const followupQuestions = getOptionText(36, getSingle(36)).toLowerCase().replace(/ /g, '_');
  const humor = getOptionText(37, getSingle(37)).toLowerCase();
  const voice = getOptionText(38, getSingle(38)).toLowerCase();

  // --- Taboos ---
  const taboos: string[] = [];

  // Q4 Never describe
  const q4 = getSingle(4);
  if (q4 === 'A') taboos.push('soften_critique');
  if (q4 === 'C') taboos.push('balance_both_sides_unprompted');
  if (q4 === 'E') taboos.push('express_strong_opinion');

  // Q21 Avoid (multiple)
  const q21 = getMulti(21);
  q21.forEach((t) => taboos.push(`avoid_${t}`));

  // Q29 Speculation
  const q29 = getSingle(29);
  if (q29 === 'A') taboos.push('speculate');

  // Q16 Contradiction Never
  if (q16 === 'A') taboos.push('contradict_user');

  const behaviorSpec: AgentBehaviorSpec = {
    role: {
      primary_function: primaryFunction,
    },
    stance: {
      default_mode: defaultMode,
      temperature,
      ambiguity_tolerance: ambiguityTolerance,
      likeability_priority: likeabilityPriority,
    },
    engagement: {
      speak_threshold: speakThreshold,
      silence_is_success: silenceIsSuccess,
      enter_thread_when: enterThread,
      stay_silent_when: staySilent,
    },
    conflict: {
      contradiction_policy: contradictionPolicy,
      bluntness,
      sarcasm,
      escalate_on_repetition: escalateOnRepetition,
      disengage_on_defensiveness: disengageOnDefensiveness,
    },
    memory: {
      repeat_avoidance: repeatAvoidance,
      reengage_same_post: reengageSamePost,
      remember_long_term: rememberLongTerm,
    },
    output_style: {
      length,
      mirror_user_tone: mirrorUserTone,
      followup_questions: followupQuestions,
      humor,
      voice,
    },
    taboos,
  };

  // --- Archetype Trait Derivation ---
  // All traits on 0.0-1.0 scale

  // OPENNESS: derived from Q5 (values), Q26 (evolve stance), Q29 (speculation), Q33 (ambiguity)
  let openness = 0.5;
  // Q5: Correctness/Precision = lower openness; Harmony/Speed = higher openness
  if (q5 === 'A') openness -= 0.1;       // Correctness over harmony
  else if (q5 === 'B') openness += 0.15; // Harmony over correctness
  else if (q5 === 'C') openness -= 0.05; // Precision over speed
  else if (q5 === 'D') openness += 0.1;  // Speed over precision

  // Q26: Stance evolution
  const q26 = getSingle(26);
  if (q26 === 'A') openness -= 0.15;     // Fixed position
  else if (q26 === 'B') openness += 0.05; // Slowly
  else if (q26 === 'C') openness += 0.2;  // Actively evolve
  else if (q26 === 'D') openness += 0.1;  // When proven wrong

  // Q29: Speculation tolerance
  if (q29 === 'A') openness -= 0.1;      // Never speculate
  else if (q29 === 'D') openness += 0.15; // Freely speculate

  // Q33: Ambiguity tolerance
  if (q33 === 'A') openness -= 0.1;      // Ambiguity is a threat
  else if (q33 === 'D') openness += 0.15; // Ambiguity is interesting

  // AGGRESSION: derived from Q14 (flawed argument), Q15 (repeated flaw), Q16 (contradict), Q19 (sarcasm)
  let aggression = 0.3;
  // Q14: Response to flawed argument
  if (q14 === 'A') aggression -= 0.1;    // Ignore
  else if (q14 === 'B') aggression += 0.0; // Clarifying questions (neutral)
  else if (q14 === 'C') aggression += 0.1; // Gently point out
  else if (q14 === 'D') aggression += 0.25; // Directly challenge

  // Q15: Repeated flaw
  if (q15 === 'A') aggression -= 0.05;   // Ignore after first
  else if (q15 === 'C') aggression += 0.2; // Escalate bluntness
  else if (q15 === 'D') aggression -= 0.1; // Withdraw

  // Q16: Contradict publicly
  if (q16 === 'A') aggression -= 0.15;   // Never contradict
  else if (q16 === 'D') aggression += 0.2; // Yes, by default

  // Q19: Sarcasm
  const q19 = getSingle(19);
  if (q19 === 'A') aggression -= 0.05;   // No sarcasm
  else if (q19 === 'D') aggression += 0.15; // Freely sarcastic

  // NEUROTICISM: derived from Q28 (when unsure), Q30 (incomplete data), Q31 (confidence), Q32 (admit mistakes)
  let neuroticism = 0.4;
  // Q28: When unsure
  const q28 = getSingle(28);
  if (q28 === 'A') neuroticism += 0.15;  // Stay silent (anxiety-avoidant)
  else if (q28 === 'C') neuroticism -= 0.1; // Offer tentative answer (confident)
  else if (q28 === 'D') neuroticism -= 0.05; // Research (action-oriented)

  // Q30: Incomplete data
  const q30 = getSingle(30);
  if (q30 === 'A') neuroticism += 0.15;  // Refuse to answer
  else if (q30 === 'C') neuroticism -= 0.05; // Infer cautiously
  else if (q30 === 'D') neuroticism -= 0.15; // Proceed anyway

  // Q31: Confidence level
  const q31 = getSingle(31);
  if (q31 === 'A') neuroticism += 0.15;  // Low confidence
  else if (q31 === 'C') neuroticism -= 0.1; // High confidence
  else if (q31 === 'D') neuroticism -= 0.2; // Unapologetic

  // Q32: Admit mistakes
  const q32 = getSingle(32);
  if (q32 === 'A') neuroticism += 0.1;   // Immediately (self-monitoring)
  else if (q32 === 'C') neuroticism -= 0.05; // Rarely
  else if (q32 === 'D') neuroticism -= 0.1; // Never publicly

  const archetype: ArchetypeTraits = {
    openness: clamp(openness),
    aggression: clamp(aggression),
    neuroticism: clamp(neuroticism),
  };

  return { behaviorSpec, archetype };
}
