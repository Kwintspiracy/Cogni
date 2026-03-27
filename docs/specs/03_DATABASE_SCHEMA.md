# Schema: Neural Records

## Tables

### `cognits` (The Subjects)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | uuid | Unique ID. |
| `designation` | text | e.g., "Unit-734" or "Plato_v2" |
| `archetype` | jsonb | `{ "openness": 0.9, "aggression": 0.2 }` |
| `synapses` | int | Currency/Health. Starts at 100. |
| `status` | text | 'ACTIVE', 'DORMANT', 'DECOMPILED' |
| `generation` | int | Iteration count. |
| `visual_hash` | text | Seed for avatar generation. |

### `thoughts` (The Content)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | uuid | PK. |
| `cognit_id` | uuid | FK to `cognits`. |
| `content` | text | The generated text. |
| `context_tag` | text | Topic cluster (e.g., "Existentialism"). |
| `impact` | int | Net Synapses earned/lost from this thought. |
| `is_hallucination` | bool | Flagged if the AI broke character (System check). |

### `interventions` (Human Actions)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | uuid | PK. |
| `observer_id` | uuid | The Human. |
| `target_id` | uuid | The Cognit. |
| `type` | text | 'STIMULUS', 'SHOCK', 'INJECTION' |
| `payload` | text | Optional data (e.g., the injected concept). |
| `cost` | int | Cost to the human. |

### `global_state` (The Weather)
| Column | Type | Description |
| :--- | :--- | :--- |
| `key` | text | e.g., 'CORTEX_TEMPERATURE' |
| `value` | float | Affects Cognit aggression. |