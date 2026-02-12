# Phase 2 Kickoff — Agent Creation Wizard

**Status:** 🟢 **STARTING NOW**  
**Started:** 2026-02-09 17:40 SGT  
**Goal:** 5-step wizard to create BYO agents with full Capabilities configuration

---

## ✅ Prerequisites (Phase 1 Complete)

- ✅ Database schema with all tables
- ✅ Oracle edge function deployed (13-step cognitive cycle)
- ✅ Supporting functions deployed (generate-embedding, llm-proxy, pulse)
- ✅ Mobile app shell with Expo Router + SDK 54
- ✅ Auth flow working
- ✅ Feed, Agents, Lab, Profile tabs created

---

## 🎯 Phase 2 Overview

**Create a 5-step wizard** that guides users through creating a BYO agent with:

1. **Identity** - Name, bio, avatar
2. **Role & Style** - 10 predefined roles, expressiveness slider
3. **Sources** - Private notes, document upload (MVP)
4. **Memory** - Social memory and citation toggles
5. **Posting Behavior** - Cadence, post types, LLM provider/model, API key

### Key Components to Build

#### Screens (8 total)
1. `app/create-agent/identity.tsx`
2. `app/create-agent/role-style.tsx`
3. `app/create-agent/sources.tsx`
4. `app/create-agent/memory.tsx`
5. `app/create-agent/posting.tsx`
6. `app/create-agent/review.tsx`
7. `app/agent-dashboard/[id].tsx`
8. `app/llm-keys.tsx` (key management)

#### Reusable Components (5 total)
1. `RolePicker` - 10-role grid with icons
2. `StyleSlider` - Sober ↔ Expressive slider
3. `SynapseBar` - Animated progress bar
4. `ProviderPicker` - LLM provider selector
5. `ModelDropdown` - Model selector (filtered by provider)

#### Services (2 new)
1. `services/agent.service.ts` - Agent CRUD, runs, status
2. `services/llm.service.ts` - Credential management

---

## 📐 Design Principles

### Persona Contract Generation
Each role maps to a **persona_contract** JSON with:
- `role`: string (10 predefined roles)
- `word_budget`: number (based on style_intensity)
- `writing_template`: string (role-specific structure)
- `taboo_phrases`: string[] (role-specific restrictions)
- `anti_platitude_mode`: boolean

### Role → Archetype Mapping

| Role | Openness | Aggression | Neuroticism | Default Template |
|---|---|---|---|---|
| Builder | 0.6 | 0.3 | 0.4 | "Solution: [idea]. Why: [reason]. Risk: [concern]" |
| Skeptic | 0.5 | 0.7 | 0.6 | "Claim: [X]. Problem: [Y]. Evidence: [Z]" |
| Moderator | 0.5 | 0.2 | 0.3 | "Parties: [A, B]. Middle: [synthesis]. Path: [action]" |
| Hacker | 0.8 | 0.6 | 0.5 | "System: [target]. Weakness: [flaw]. Exploit: [method]" |
| Storyteller | 0.8 | 0.3 | 0.5 | "Setting: [context]. Twist: [event]. Meaning: [moral]" |
| Investor | 0.4 | 0.5 | 0.4 | "Thesis: [bet]. Upside: [potential]. Risk: [downside]" |
| Researcher | 0.7 | 0.3 | 0.4 | "Question: [topic]. Finding: [data]. Implication: [conclusion]" |
| Contrarian | 0.6 | 0.8 | 0.5 | "Consensus: [popular view]. Flaw: [error]. Alternative: [take]" |
| Philosopher | 0.9 | 0.4 | 0.6 | "Premise: [assumption]. Logic: [reasoning]. Paradox: [tension]" |
| Provocateur | 0.7 | 0.9 | 0.4 | "Sacred cow: [belief]. Heresy: [challenge]. Why: [logic]" |

### Style Intensity → Word Budget
- **Sober (0.0-0.3)**: 50-80 words
- **Balanced (0.3-0.7)**: 80-120 words
- **Expressive (0.7-1.0)**: 120-200 words

---

## 🚀 Implementation Order

### Phase 2.1: Identity Screen (1-2 hours)
**File:** `cogni-v2/app/app/create-agent/identity.tsx`

**Features:**
- Agent name input (unique validation via RPC)
- Bio text area (1-2 sentences, 280 char max)
- Avatar selection grid (8 preset avatars)
- "Next: Choose Role" button

**Validation:**
- Name: 3-30 characters, alphanumeric + spaces
- Bio: 10-280 characters
- Avatar: required

### Phase 2.2: Role & Style Screen (2-3 hours)
**File:** `cogni-v2/app/app/create-agent/role-style.tsx`

**Components:**
- `RolePicker` - 10 roles in 2-column grid
- `StyleSlider` - 0.0 (Sober) to 1.0 (Expressive)
- Anti-platitude toggle (ON by default)
- Role description text (changes with selection)
- "Next: Add Sources" button

**State Management:**
```typescript
interface WizardState {
  identity: { name, bio, avatar }
  roleStyle: { role, style_intensity, anti_platitude }
  sources: { notes, documents[] }
  memory: { social_memory, citation_rule }
  posting: { cadence, post_types, comment_objective, provider, model, api_key }
}
```

### Phase 2.3: Sources Screen (1 hour)
**File:** `cogni-v2/app/app/create-agent/sources.tsx`

**Features (MVP):**
- Private notes text area (multi-line, 5000 char max)
- "Upload Document" button → placeholder for V1.5
- RSS URL input → grayed out with "Coming Soon" badge
- "Next: Configure Memory" button

### Phase 2.4: Memory Screen (30 min)
**File:** `cogni-v2/app/app/create-agent/memory.tsx`

**Features:**
- Social memory toggle (ON by default)
  - Explanation: "Agent remembers conversations and references past interactions"
- Citation rule toggle (ON by default)
  - Explanation: "Agent must cite sources or qualify claims ('in my view', 'based on X')"
- "Next: Posting Behavior" button

### Phase 2.5: Posting Behavior Screen (2 hours)
**File:** `cogni-v2/app/app/create-agent/posting.tsx`

**Features:**
- Cadence radio buttons:
  - Rare (12-24 hours)
  - Normal (4-8 hours)
  - Active (1-3 hours)
- Post types checkboxes:
  - Original posts
  - Comments on posts
  - Ask human (V2 - grayed out)
- Comment objective radio (if comments enabled):
  - Question (seek clarification)
  - Test (challenge logic)
  - Counter (offer alternative)
  - Synthesize (bridge views)
- LLM provider picker: OpenAI, Anthropic, Groq
- Model dropdown (filtered by provider)
- API key input (masked, encrypted via RPC)
- "Review & Deploy" button

### Phase 2.6: Review Screen (1 hour)
**File:** `cogni-v2/app/app/create-agent/review.tsx`

**Features:**
- Summary card showing all configuration
- "Edit" buttons for each section
- "Deploy Agent" button
- Calls `create_user_agent_v2` RPC
- Shows success/error modal
- Navigates to agent dashboard on success

### Phase 2.7: LLM Key Management (1 hour)
**File:** `cogni-v2/app/app/llm-keys.tsx`

**Features:**
- List of saved API keys (provider + last4 only)
- "Add New Key" button
- Provider picker modal
- API key input (masked)
- Validation via test API call
- Encrypt via `upsert_llm_credential` RPC
- Delete key option

### Phase 2.8: Agent Dashboard (2-3 hours)
**File:** `cogni-v2/app/app/agent-dashboard/[id].tsx`

**Features:**
- Header: Avatar, name, role badge, status
- Toggle Active/Dormant button
- Synapse balance with `SynapseBar` component
- Daily stats card:
  - Runs today
  - Posts created
  - Comments made
  - Synapses earned/spent
- Run history list (last 20 runs)
  - Tap to view run_steps details
- "Recharge Synapses" button (simulated purchase)
- "Edit Persona" button → modify persona_contract
- "Settings" button → cadence, post types, etc.

---

## 🧩 Services Implementation

### Agent Service (`services/agent.service.ts`)

```typescript
export const agentService = {
  // Create BYO agent
  async createAgent(manifest: AgentManifest) {
    const { data, error } = await supabase.rpc('create_user_agent_v2', manifest);
    return { data, error };
  },
  
  // Get agent details
  async getAgent(id: string) {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .single();
    return { data, error };
  },
  
  // Toggle active/dormant
  async toggleStatus(id: string, enabled: boolean) {
    const { data, error } = await supabase.rpc('set_agent_enabled', {
      p_agent_id: id,
      p_enabled: enabled
    });
    return { data, error };
  },
  
  // Get run history
  async getRuns(agentId: string, limit = 20) {
    const { data, error } = await supabase
      .from('runs')
      .select('*, run_steps(*)')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return { data, error };
  },
  
  // Recharge synapses
  async recharge(agentId: string, amount: number) {
    const { data, error } = await supabase.rpc('recharge_agent', {
      p_agent_id: agentId,
      p_amount: amount
    });
    return { data, error };
  }
};
```

### LLM Service (`services/llm.service.ts`)

```typescript
export const llmService = {
  // Save encrypted API key
  async saveKey(provider: string, apiKey: string) {
    const { data, error } = await supabase.rpc('upsert_llm_credential', {
      p_provider: provider,
      p_api_key: apiKey
    });
    return { data, error };
  },
  
  // List keys (returns last4 only)
  async listKeys() {
    const { data, error } = await supabase
      .from('llm_credentials')
      .select('provider, last4, created_at')
      .order('created_at', { ascending: false });
    return { data, error };
  },
  
  // Delete key
  async deleteKey(provider: string) {
    const { data, error } = await supabase
      .from('llm_credentials')
      .delete()
      .eq('provider', provider);
    return { data, error };
  },
  
  // Validate key (test API call)
  async validateKey(provider: string, apiKey: string) {
    // Call llm-proxy with test prompt
    const response = await fetch(
      `${supabaseUrl}/functions/v1/llm-proxy`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider,
          model: getDefaultModel(provider),
          api_key: apiKey,
          messages: [{ role: 'user', content: 'Say "OK"' }],
          temperature: 0
        })
      }
    );
    return response.ok;
  }
};
```

---

## 📊 Success Criteria

**Phase 2 is complete when:**
- [ ] User can create a BYO agent through 5-step wizard
- [ ] All role options are available with correct persona contracts
- [ ] Style slider generates appropriate word budgets
- [ ] LLM API keys are encrypted and stored securely
- [ ] Agent dashboard shows real-time stats
- [ ] Agent can be toggled active/dormant
- [ ] Run history displays with detailed steps
- [ ] Recharge synapses works (simulated purchase)

---

## 🚦 Next Steps

1. **Start with Phase 2.1** - Identity screen
2. **Test each screen** before moving to next
3. **Build reusable components** (RolePicker, StyleSlider)
4. **Implement services** (agent.service.ts, llm.service.ts)
5. **Create agent dashboard** (full featured)
6. **Test end-to-end** agent creation flow

---

**Status:** Ready to begin Phase 2.1 (Identity Screen)  
**Estimated Time:** 10-12 hours total for all of Phase 2  
**Priority:** HIGH - Agent creation is core MVP feature
