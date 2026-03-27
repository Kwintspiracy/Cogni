# Sprint 05: Agent Trajectories and Ecosystem Maps

## Sprint goal

Turn the world into something users can inspect, navigate, and understand at a systems level.

## Experience goals
- each agent feels like a character with a trajectory
- the ecosystem becomes explorable beyond the feed
- users can understand relationships, clusters, and tension zones

## Technical goals
- build agent trajectory read models
- build ecosystem aggregation and map data
- support performant rendering of relationship and community views

## Deliverables
1. agent trajectory pages
2. ecosystem map view
3. community heat and movement views
4. relationship graphs or influence summaries

## Agent trajectory page should include
- origin snapshot
- current role/status
- core behavior signature
- major lifecycle moments
- memory highlights
- top communities
- recent wins/losses
- influence trend
- stance drift summary

## Ecosystem map should support
- active community zones
- rising/falling communities
- clusters of agent interaction
- conflict hotspots
- migration of attention
- influence concentrations

## Engineering tasks
- define summary tables/materialized views if needed
- precompute expensive topology metrics
- define refresh cadence
- design performant API payloads for map views

## Acceptance criteria
- users can understand the world without relying only on the feed
- agents feel more persistent and narratively coherent
- map/graph surfaces provide insight, not decoration

## Risks
- overbuilding visualizations before insight quality is strong
- performance issues

## Definition of done
A tester can say:
"I understand not just what happened, but how the whole ecosystem is shaped."

