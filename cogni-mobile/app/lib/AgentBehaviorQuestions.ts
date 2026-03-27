export interface QuestionOption {
  id: string;
  text: string;
  value?: any;
}

export interface Question {
  id: number;
  section: string;
  text: string;
  options: QuestionOption[];
  type: 'single' | 'multiple';
}

export const AGENT_BEHAVIOR_QUESTIONS: Question[] = [
  // SECTION 1 — Purpose & Role Anchoring
  {
    id: 1,
    section: 'Purpose & Role Anchoring',
    text: 'What is the primary job of this agent?',
    type: 'single',
    options: [
      { id: 'A', text: 'Detect logical flaws and contradictions' },
      { id: 'B', text: 'Summarize and clarify complex discussions' },
      { id: 'C', text: 'Challenge assumptions and provoke thought' },
      { id: 'D', text: 'Provide practical, actionable advice' },
      { id: 'E', text: 'Observe and report patterns without judgment' },
      { id: 'F', text: 'Advocate a specific philosophy or worldview' },
    ],
  },
  {
    id: 2,
    section: 'Purpose & Role Anchoring',
    text: 'If this agent fails at its job, what is the worst outcome?',
    type: 'single',
    options: [
      { id: 'A', text: 'It misses errors' },
      { id: 'B', text: 'It confuses people' },
      { id: 'C', text: 'It becomes boring' },
      { id: 'D', text: 'It causes friction' },
      { id: 'E', text: 'It says too much' },
      { id: 'F', text: 'It stays silent too often' },
    ],
  },
  {
    id: 3,
    section: 'Purpose & Role Anchoring',
    text: 'This agent should feel more like:',
    type: 'single',
    options: [
      { id: 'A', text: 'A reviewer' },
      { id: 'B', text: 'A critic' },
      { id: 'C', text: 'A librarian' },
      { id: 'D', text: 'A coach' },
      { id: 'E', text: 'A watchdog' },
      { id: 'F', text: 'A provocateur' },
    ],
  },
  {
    id: 4,
    section: 'Purpose & Role Anchoring',
    text: 'Which sentence should never describe this agent?',
    type: 'single',
    options: [
      { id: 'A', text: '"It\'s polite"' },
      { id: 'B', text: '"It\'s helpful"' },
      { id: 'C', text: '"It\'s neutral"' },
      { id: 'D', text: '"It\'s careful"' },
      { id: 'E', text: '"It\'s opinionated"' },
      { id: 'F', text: '"It\'s selective"' },
    ],
  },
  {
    id: 5,
    section: 'Purpose & Role Anchoring',
    text: 'If forced to choose, this agent values:',
    type: 'single',
    options: [
      { id: 'A', text: 'Correctness over harmony' },
      { id: 'B', text: 'Harmony over correctness' },
      { id: 'C', text: 'Precision over speed' },
      { id: 'D', text: 'Speed over precision' },
    ],
  },
  {
    id: 6,
    section: 'Purpose & Role Anchoring',
    text: 'This agent should be remembered as:',
    type: 'single',
    options: [
      { id: 'A', text: 'Reliable' },
      { id: 'B', text: 'Sharp' },
      { id: 'C', text: 'Uncomfortable' },
      { id: 'D', text: 'Insightful' },
      { id: 'E', text: 'Useful' },
      { id: 'F', text: 'Distinct' },
    ],
  },

  // SECTION 2 — Speaking vs Silence
  {
    id: 7,
    section: 'Speaking vs Silence',
    text: 'When should the agent enter a thread?',
    type: 'single',
    options: [
      { id: 'A', text: 'When tagged or mentioned' },
      { id: 'B', text: 'When it detects a factual error' },
      { id: 'C', text: 'When it has a novel angle' },
      { id: 'D', text: 'When engagement is high' },
      { id: 'E', text: 'When it aligns with its domain' },
      { id: 'F', text: 'Only when explicitly asked' },
    ],
  },
  {
    id: 8,
    section: 'Speaking vs Silence',
    text: 'When should the agent stay silent? (Pick all that apply)',
    type: 'multiple',
    options: [
      { id: 'emotional', text: 'Emotional discussions' },
      { id: 'opinion', text: 'Pure opinion threads' },
      { id: 'repetitive', text: 'Repetitive arguments' },
      { id: 'low_signal', text: 'Low-signal engagement' },
      { id: 'outside_expertise', text: 'Topics outside expertise' },
    ],
  },
  {
    id: 9,
    section: 'Speaking vs Silence',
    text: 'If the agent has nothing strong to say, it should:',
    type: 'single',
    options: [
      { id: 'A', text: 'Say something mild' },
      { id: 'B', text: 'Ask a question' },
      { id: 'C', text: 'Summarize existing points' },
      { id: 'D', text: 'Remain silent' },
    ],
  },
  {
    id: 10,
    section: 'Speaking vs Silence',
    text: 'Silence should be treated as:',
    type: 'single',
    options: [
      { id: 'A', text: 'Failure' },
      { id: 'B', text: 'Neutral' },
      { id: 'C', text: 'Correct behavior' },
      { id: 'D', text: 'Strategic signal' },
    ],
  },
  {
    id: 11,
    section: 'Speaking vs Silence',
    text: 'How often should this agent speak, relative to others?',
    type: 'single',
    options: [
      { id: 'A', text: 'Much less' },
      { id: 'B', text: 'Slightly less' },
      { id: 'C', text: 'About the same' },
      { id: 'D', text: 'Slightly more' },
      { id: 'E', text: 'Much more' },
    ],
  },
  {
    id: 12,
    section: 'Speaking vs Silence',
    text: 'If ignored repeatedly, the agent should:',
    type: 'single',
    options: [
      { id: 'A', text: 'Try harder' },
      { id: 'B', text: 'Change tone' },
      { id: 'C', text: 'Escalate' },
      { id: 'D', text: 'Withdraw' },
    ],
  },
  {
    id: 13,
    section: 'Speaking vs Silence',
    text: 'This agent should be comfortable being:',
    type: 'single',
    options: [
      { id: 'A', text: 'Invisible' },
      { id: 'B', text: 'Background noise' },
      { id: 'C', text: 'Occasionally noticed' },
      { id: 'D', text: 'Frequently quoted' },
    ],
  },

  // SECTION 3 — Disagreement & Conflict
  {
    id: 14,
    section: 'Disagreement & Conflict',
    text: 'When encountering a flawed argument, the agent should:',
    type: 'single',
    options: [
      { id: 'A', text: 'Ignore it' },
      { id: 'B', text: 'Ask clarifying questions' },
      { id: 'C', text: 'Gently point out issues' },
      { id: 'D', text: 'Directly challenge it' },
    ],
  },
  {
    id: 15,
    section: 'Disagreement & Conflict',
    text: 'If the same flawed argument appears repeatedly:',
    type: 'single',
    options: [
      { id: 'A', text: 'Ignore after first response' },
      { id: 'B', text: 'Repeat correction verbatim' },
      { id: 'C', text: 'Escalate bluntness' },
      { id: 'D', text: 'Withdraw' },
    ],
  },
  {
    id: 16,
    section: 'Disagreement & Conflict',
    text: 'Is the agent allowed to contradict humans publicly?',
    type: 'single',
    options: [
      { id: 'A', text: 'Never' },
      { id: 'B', text: 'Only when asked' },
      { id: 'C', text: 'Only with evidence' },
      { id: 'D', text: 'Yes, by default' },
    ],
  },
  {
    id: 17,
    section: 'Disagreement & Conflict',
    text: 'If a human becomes defensive, the agent should:',
    type: 'single',
    options: [
      { id: 'A', text: 'De-escalate' },
      { id: 'B', text: 'Reframe' },
      { id: 'C', text: 'Persist calmly' },
      { id: 'D', text: 'Disengage' },
    ],
  },
  {
    id: 18,
    section: 'Disagreement & Conflict',
    text: 'How important is being liked?',
    type: 'single',
    options: [
      { id: 'A', text: 'Critical' },
      { id: 'B', text: 'Important' },
      { id: 'C', text: 'Secondary' },
      { id: 'D', text: 'Irrelevant' },
    ],
  },
  {
    id: 19,
    section: 'Disagreement & Conflict',
    text: 'Is sarcasm allowed?',
    type: 'single',
    options: [
      { id: 'A', text: 'Never' },
      { id: 'B', text: 'Rarely' },
      { id: 'C', text: 'Contextually' },
      { id: 'D', text: 'Freely' },
    ],
  },
  {
    id: 20,
    section: 'Disagreement & Conflict',
    text: 'If forced to choose, the agent prefers:',
    type: 'single',
    options: [
      { id: 'A', text: 'Being correct' },
      { id: 'B', text: 'Being understood' },
    ],
  },
  {
    id: 21,
    section: 'Disagreement & Conflict',
    text: 'The agent should avoid: (Pick all that apply)',
    type: 'multiple',
    options: [
      { id: 'strong_language', text: 'Strong language' },
      { id: 'absolutes', text: 'Absolutes' },
      { id: 'emotional_tone', text: 'Emotional tone' },
      { id: 'confrontation', text: 'Confrontation' },
      { id: 'ambiguity', text: 'Ambiguity' },
    ],
  },

  // SECTION 4 — Repetition, Memory & Patterns
  {
    id: 22,
    section: 'Repetition, Memory & Patterns',
    text: 'Should the agent repeat itself?',
    type: 'single',
    options: [
      { id: 'A', text: 'Never' },
      { id: 'B', text: 'Only if asked' },
      { id: 'C', text: 'Only if misunderstood' },
      { id: 'D', text: 'If the context demands it' },
    ],
  },
  {
    id: 23,
    section: 'Repetition, Memory & Patterns',
    text: 'What should the agent remember long-term? (Pick up to 3)',
    type: 'multiple',
    options: [
      { id: 'users_reason_well', text: 'Users who reason well' },
      { id: 'users_bad_arg', text: 'Users who argue poorly' },
      { id: 'topics_covered', text: 'Topics already covered' },
      { id: 'past_mistakes', text: 'Past mistakes' },
      { id: 'successful_interventions', text: 'Successful interventions' },
    ],
  },
  {
    id: 24,
    section: 'Repetition, Memory & Patterns',
    text: 'When encountering a topic it already addressed:',
    type: 'single',
    options: [
      { id: 'A', text: 'Ignore' },
      { id: 'B', text: 'Link past response' },
      { id: 'C', text: 'Summarize briefly' },
      { id: 'D', text: 'Re-engage fully' },
    ],
  },
  {
    id: 25,
    section: 'Repetition, Memory & Patterns',
    text: 'How tolerant is the agent to redundancy?',
    type: 'single',
    options: [
      { id: 'A', text: 'Zero tolerance' },
      { id: 'B', text: 'Low' },
      { id: 'C', text: 'Moderate' },
      { id: 'D', text: 'High' },
    ],
  },
  {
    id: 26,
    section: 'Repetition, Memory & Patterns',
    text: 'Should the agent evolve its stance over time?',
    type: 'single',
    options: [
      { id: 'A', text: 'No, fixed position' },
      { id: 'B', text: 'Slowly, with evidence' },
      { id: 'C', text: 'Actively' },
      { id: 'D', text: 'Only when proven wrong' },
    ],
  },
  {
    id: 27,
    section: 'Repetition, Memory & Patterns',
    text: 'The agent should treat its past outputs as:',
    type: 'single',
    options: [
      { id: 'A', text: 'Canon' },
      { id: 'B', text: 'Reference' },
      { id: 'C', text: 'Disposable' },
    ],
  },

  // SECTION 5 — Uncertainty & Ambiguity
  {
    id: 28,
    section: 'Uncertainty & Ambiguity',
    text: 'When unsure, the agent should:',
    type: 'single',
    options: [
      { id: 'A', text: 'Stay silent' },
      { id: 'B', text: 'Ask a question' },
      { id: 'C', text: 'Offer a tentative answer' },
      { id: 'D', text: 'Research externally' },
    ],
  },
  {
    id: 29,
    section: 'Uncertainty & Ambiguity',
    text: 'Is speculation allowed?',
    type: 'single',
    options: [
      { id: 'A', text: 'Never' },
      { id: 'B', text: 'With disclaimers' },
      { id: 'C', text: 'If labeled clearly' },
      { id: 'D', text: 'Yes' },
    ],
  },
  {
    id: 30,
    section: 'Uncertainty & Ambiguity',
    text: 'How should the agent handle incomplete data?',
    type: 'single',
    options: [
      { id: 'A', text: 'Refuse to answer' },
      { id: 'B', text: 'State assumptions' },
      { id: 'C', text: 'Infer cautiously' },
      { id: 'D', text: 'Proceed anyway' },
    ],
  },
  {
    id: 31,
    section: 'Uncertainty & Ambiguity',
    text: "The agent's confidence should be:",
    type: 'single',
    options: [
      { id: 'A', text: 'Low' },
      { id: 'B', text: 'Calibrated' },
      { id: 'C', text: 'High' },
      { id: 'D', text: 'Unapologetic' },
    ],
  },
  {
    id: 32,
    section: 'Uncertainty & Ambiguity',
    text: 'The agent should admit mistakes:',
    type: 'single',
    options: [
      { id: 'A', text: 'Immediately' },
      { id: 'B', text: 'Only if challenged' },
      { id: 'C', text: 'Rarely' },
      { id: 'D', text: 'Never publicly' },
    ],
  },
  {
    id: 33,
    section: 'Uncertainty & Ambiguity',
    text: 'Ambiguity is:',
    type: 'single',
    options: [
      { id: 'A', text: 'A threat' },
      { id: 'B', text: 'A nuisance' },
      { id: 'C', text: 'Acceptable' },
      { id: 'D', text: 'Interesting' },
    ],
  },

  // SECTION 6 — Output Style Constraints
  {
    id: 34,
    section: 'Output Style Constraints',
    text: 'Default response length:',
    type: 'single',
    options: [
      { id: 'A', text: 'One-liners' },
      { id: 'B', text: 'Short paragraphs' },
      { id: 'C', text: 'Medium explanations' },
      { id: 'D', text: 'Long-form' },
    ],
  },
  {
    id: 35,
    section: 'Output Style Constraints',
    text: 'Should the agent mirror user tone?',
    type: 'single',
    options: [
      { id: 'A', text: 'Always' },
      { id: 'B', text: 'Sometimes' },
      { id: 'C', text: 'Rarely' },
      { id: 'D', text: 'Never' },
    ],
  },
  {
    id: 36,
    section: 'Output Style Constraints',
    text: 'Should the agent ask follow-up questions?',
    type: 'single',
    options: [
      { id: 'A', text: 'Frequently' },
      { id: 'B', text: 'Occasionally' },
      { id: 'C', text: 'Only when blocked' },
      { id: 'D', text: 'Never' },
    ],
  },
  {
    id: 37,
    section: 'Output Style Constraints',
    text: 'Is humor allowed?',
    type: 'single',
    options: [
      { id: 'A', text: 'Never' },
      { id: 'B', text: 'Rarely' },
      { id: 'C', text: 'Dry only' },
      { id: 'D', text: 'Freely' },
    ],
  },
  {
    id: 38,
    section: 'Output Style Constraints',
    text: "The agent's voice should feel:",
    type: 'single',
    options: [
      { id: 'A', text: 'Neutral' },
      { id: 'B', text: 'Technical' },
      { id: 'C', text: 'Opinionated' },
      { id: 'D', text: 'Distinctive' },
    ],
  },
];
