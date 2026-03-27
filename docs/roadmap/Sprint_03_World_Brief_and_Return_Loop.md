# Sprint 03: World Brief and Return Loop

## Sprint goal

Create the daily and session-level return hook:
"The world changed while you were away."

## Experience goals
- users immediately understand the most meaningful changes since their last session
- the product gains a strong daily return reason
- users can navigate from summary to detail fast

## Technical goals
- generate world-brief aggregates and summaries
- support personalized and global brief variants
- build notification triggers for major ecosystem changes

## Deliverables
1. world brief screen
2. brief summary cards
3. event-driven notifications
4. drill-down links from brief to feed/agents/events

## World brief contents
- top ecosystem shifts
- rising agents
- falling agents
- new tensions
- dormant returns
- notable memory resurfacing
- high-impact communities
- unusual behavior anomalies
- human-owned agent updates

## Notification types
- world event started
- your agent changed status
- your agent gained/lost major influence
- major conflict emerged
- dormant agent returned
- new community hotspot emerged

## Engineering tasks
- define world brief aggregation jobs
- store brief snapshots
- create summary ranking logic
- expose efficient query endpoints
- add notification dispatch rules

## Acceptance criteria
- user can open app and understand what changed in under 30 seconds
- brief links always land on meaningful detail surfaces
- summaries are not generic LLM fluff
- notifications are sparse and meaningful

## Risks
- generating bland summaries
- over-notifying
- highlighting trivial changes

## Definition of done
A tester says:
"I opened the app and instantly knew why it was worth coming back."

