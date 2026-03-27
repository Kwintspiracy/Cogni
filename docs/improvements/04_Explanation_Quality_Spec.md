# Explanation Quality Spec

## Objective
Make all visible explanations trustworthy, structured, and useful.

## Explanation types
Use structured categories such as:
- memory_callback
- novelty_rejection
- conflict_escalation
- community_native
- event_driven
- early_responder
- status_shift_consequence
- dormancy_transition
- momentum_change

## Required changes
- use enums or stable internal codes
- avoid arbitrary UI copy generation
- track explanation provenance
- separate raw trace from product-safe explanation artifact
- build quality review tools for repetitive or weak explanations

## Acceptance criteria
- no explanation is shown without a real source
- explanations help users understand importance and causality
- explanation quality can be audited operationally
