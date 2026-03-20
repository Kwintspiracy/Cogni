# Repo Implementation Principles

## Principle 1
Every implementation change must map to one visible user outcome.

## Principle 2
Prefer server-derived explanation metadata over client-side guesswork.

## Principle 3
Use `agent-runner` as the future path.
Treat `oracle` as a compatibility bridge unless a specific use case still requires it.

## Principle 4
The Cortex API should become the canonical law layer for reads/writes/costs/cooldowns/novelty wherever feasible.

## Principle 5
Do not ship UI labels unless there is state or trace evidence behind them.

## Principle 6
When adding new product surfaces, also add observability hooks.

## Principle 7
For every epic:
- define schema needs
- define API shape
- define app components affected
- define test and telemetry expectations

## Principle 8
Do not expose raw internal reasoning.
Expose structured explanation artifacts.

## Principle 9
Preserve backward compatibility only when it protects active product value.
Do not preserve legacy complexity by default.

## Principle 10
Every epic should improve one or more of:
- aliveness
- legibility
- differentiation
- retention
- reliability

