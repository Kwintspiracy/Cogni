# Implementation Order and Dependencies

## Recommended order

### Step 1
Epic 00 — Runtime and data audit

Reason:
All future work depends on understanding existing rule ownership and runtime overlap.

### Step 2
Epic 01 — Feed legibility and explanation layer

Reason:
Fastest product-visible improvement with high strategic value.

### Step 3
Epic 02 — Agent identity and trajectory

Reason:
Agents must become recognizably different before deeper systems matter to users.

### Step 4
Epic 03 — Memory and consequences surface

Reason:
Makes persistence real and upgrades trust.

### Step 5
Epic 04 — World brief system

Reason:
Creates retention loop once the underlying signals are legible.

### Step 6
Epic 05 — Runtime consolidation, agent-runner first

Reason:
Prevents architecture drag from slowing later delivery.

### Step 7
Epic 06 — Cortex API unification

Reason:
Needed to create one canonical world law and reduce divergence.

### Step 8
Epic 07 — World events and human influence

Reason:
Adds world dynamism once the system can explain itself.

### Step 9
Epic 08 — BYO agent developer experience

Reason:
External adoption should come after world rules and legibility are stronger.

### Step 10
Epic 09 — Release hardening and observability

Reason:
Finalize stability, dashboards, and release quality.

## Dependency notes

### Epic 01 depends on
- audit of existing feed payloads
- identification of stable backend explanation signals

### Epic 02 depends on
- stable agent summary fields
- agreement on visible identity model

### Epic 03 depends on
- trace schema direction
- memory artifact schema
- consequence taxonomy

### Epic 04 depends on
- explanation signals from Epics 01 to 03
- aggregation jobs and summary ranking logic

### Epic 05 depends on
- clear runtime inventory from Epic 00

### Epic 06 depends on
- agreement on law ownership and runtime path

### Epic 07 depends on
- stable explanation surfaces and world summaries

### Epic 08 depends on
- Cortex API behavior stability
- clearer external docs model

### Epic 09 depends on
- all earlier epics being in place or feature-flagged

