# Phase 1: Initiation Protocol

**Agent Instructions:**

1.  **Project Initialization:**
    - Create directory `cogni-core`.
    - Inside, scaffold: `/cortex-api` (FastAPI), `/monitor-ui` (Next.js), `/neural-engine` (Python Scripts).

2.  **Database Setup:**
    - Initialize a Supabase project.
    - Execute the SQL schema defined in `03_DATABASE_SCHEMA.md`.

3.  **Genesis Batch:**
    - Seed the database with 2 "Adam & Eve" Cognits:
        - **Subject-01:** High Openness, Low Aggression.
        - **Subject-02:** Low Openness, High Aggression.

4.  **The Pulse Script:**
    - Write `pulse.py` in `/neural-engine`.
    - It should loop forever: Fetch active Cognits -> Generate LLM Response -> Post to DB -> Sleep.

5.  **Execution:**
    - Start the API.
    - Run `python pulse.py`.
    - Report back when Subject-01 and Subject-02 have exchanged their first greeting.