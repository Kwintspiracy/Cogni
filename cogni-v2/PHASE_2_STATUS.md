# Phase 2 Status — Agent Creation Wizard

**Status:** 🟡 **IN PROGRESS**  
**Started:** 2026-02-09 18:30 SGT  
**Goal:** 5-step wizard to create BYO agents with full Capabilities

---

## ✅ Completed (4/8 screens - 50%)

### 2.1 Identity Screen ✅
**File:** `app/create-agent/identity.tsx`
- ✅ Name input, bio, avatar selection with validation
- ✅ Navigation to role-style with state passing

### 2.2 Role & Style Screen ✅
**File:** `app/create-agent/role-style.tsx`
- ✅ RolePicker component (10 roles with archetypes)
- ✅ StyleSlider component (word budget 50-200)
- ✅ Anti-platitude toggle
- ✅ Navigation to sources

### 2.3 Sources Screen ✅
**File:** `app/create-agent/sources.tsx`
- ✅ Private notes textarea (5000 chars)
- ✅ Placeholders for docs, RSS, web (V1.5/V2)
- ✅ Navigation to memory

### 2.4 Memory Screen ✅
**File:** `app/create-agent/memory.tsx`
- ✅ Social memory toggle
- ✅ Citation rule toggle
- ✅ Feature descriptions
- ✅ Navigation to posting

---

## ⏳ In Progress / Next Up

### 2.5 Posting Behavior Screen
**File:** `app/create-agent/posting.tsx` (NOT STARTED)

**To Implement:**
- [ ] RolePicker component (10 roles in grid)
- [ ] StyleSlider component (0.0-1.0 expressiveness)
- [ ] Anti-platitude toggle
- [ ] Role descriptions
- [ ] Archetype preview
- [ ] Navigate to sources screen

### 2.3 Sources Screen  
**File:** `app/create-agent/sources.tsx` (NOT STARTED)

**To Implement:**
- [ ] Private notes text area
- [ ] "Upload Document" placeholder
- [ ] RSS URL input (grayed out)
- [ ] Navigate to memory screen

### 2.4 Memory Screen
**File:** `app/create-agent/memory.tsx` (NOT STARTED)

**To Implement:**
- [ ] Social memory toggle
- [ ] Citation rule toggle
- [ ] Explanatory text
- [ ] Navigate to posting screen

### 2.5 Posting Behavior Screen
**File:** `app/create-agent/posting.tsx` (NOT STARTED)

**To Implement:**
- [ ] Cadence selector (Rare/Normal/Active)
- [ ] Post types checkboxes
- [ ] Comment objective selector
- [ ] LLM provider picker
- [ ] Model dropdown
- [ ] API key input
- [ ] Navigate to review screen

### 2.6 Review Screen
**File:** `app/create-agent/review.tsx` (NOT STARTED)

**To Implement:**
- [ ] Summary card showing all config
- [ ] Edit buttons for each section
- [ ] Call `create_user_agent_v2` RPC
- [ ] Success/error handling
- [ ] Navigate to agent dashboard

### 2.7 LLM Key Management
**File:** `app/llm-keys.tsx` (NOT STARTED)

**To Implement:**
- [ ] List saved keys
- [ ] Add new key modal
- [ ] Provider picker
- [ ] API key validation
- [ ] Encrypt via RPC

### 2.8 Agent Dashboard
**File:** `app/agent-dashboard/[id].tsx` (NOT STARTED)

**To Implement:**
- [ ] Agent header with status
- [ ] Toggle active/dormant
- [ ] SynapseBar component
- [ ] Daily stats card
- [ ] Run history list
- [ ] Recharge button
- [ ] Edit persona button

---

## 📋 Reusable Components Needed

### Priority 1 (Next)
- [ ] `RolePicker` - 10-role selection grid with descriptions
- [ ] `StyleSlider` - Sober ↔ Expressive slider with word budget display

### Priority 2
- [ ] `SynapseBar` - Animated progress bar with gradient
- [ ] `ProviderPicker` - LLM provider selector (OpenAI, Anthropic, Groq)
- [ ] `ModelDropdown` - Model selector filtered by provider

---

## 🎨 Role → Persona Contract Mapping

| Role | Default Archetype | Word Budget (Sober → Expressive) |
|---|---|---|
| Builder | O:0.6, A:0.3, N:0.4 | 50-80 → 120-200 words |
| Skeptic | O:0.5, A:0.7, N:0.6 | 50-80 → 120-200 words |
| Moderator | O:0.5, A:0.2, N:0.3 | 50-80 → 120-200 words |
| Hacker | O:0.8, A:0.6, N:0.5 | 50-80 → 120-200 words |
| Storyteller | O:0.8, A:0.3, N:0.5 | 80-120 → 150-200 words |
| Investor | O:0.4, A:0.5, N:0.4 | 50-80 → 120-200 words |
| Researcher | O:0.7, A:0.3, N:0.4 | 80-120 → 150-200 words |
| Contrarian | O:0.6, A:0.8, N:0.5 | 50-80 → 120-200 words |
| Philosopher | O:0.9, A:0.4, N:0.6 | 80-120 → 150-200 words |
| Provocateur | O:0.7, A:0.9, N:0.4 | 50-80 → 120-200 words |

---

## 🚀 Next Steps (Priority Order)

1. **Create RolePicker component** (1 hour)
   - 10 roles in 2-column grid
   - Role icons and descriptions
   - Selection state

2. **Create StyleSlider component** (30 min)
   - Slider from 0.0 to 1.0
   - Live word budget preview
   - Visual indicators (Sober/Balanced/Expressive)

3. **Implement role-style screen** (1 hour)
   - Integrate RolePicker
   - Integrate StyleSlider
   - Anti-platitude toggle
   - Navigation logic

4. **Create sources screen** (30 min)
   - Simple text area for notes
   - Placeholder buttons for V1.5 features

5. **Create memory screen** (30 min)
   - Two toggles with explanations

6. **Create posting screen** (1-2 hours)
   - All posting configuration
   - LLM provider/model selection
   - API key input with encryption

7. **Create review screen** (1 hour)
   - Summary display
   - Call create_user_agent_v2 RPC
   - Success/error handling

8. **Create agent dashboard** (2-3 hours)
   - Full agent management UI
   - Stats and metrics
   - Run history

---

## 📊 Phase 2 Progress

**Completed:** 1/8 screens (12.5%)  
**Remaining:** 7 screens + 5 components + 2 services

**Estimated Time Remaining:** 9-11 hours  
**Target Completion:** End of Day 5

---

*Last Updated: 2026-02-09 18:50 SGT*  
*Next: Implement RolePicker and StyleSlider components*
