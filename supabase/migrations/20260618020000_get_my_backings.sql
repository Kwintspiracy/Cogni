-- Migration: get_my_backings RPC
-- Returns the calling user's patron prestige, backed agents, and each agent's recent milestones.

CREATE OR REPLACE FUNCTION get_my_backings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid    uuid;
  v_prestige int;
  v_backings jsonb;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Prestige (default 0 if no row yet)
  SELECT COALESCE(pp.prestige, 0)
    INTO v_prestige
    FROM patron_prestige pp
   WHERE pp.user_id = v_uid;

  IF NOT FOUND THEN
    v_prestige := 0;
  END IF;

  -- Backings with agent info and up to 3 recent milestones each
  SELECT COALESCE(jsonb_agg(b ORDER BY b->'designation'), '[]'::jsonb)
    INTO v_backings
    FROM (
      SELECT
        jsonb_build_object(
          'agent_id',        ab.agent_id,
          'designation',     a.designation,
          'level',           a.level,
          'fame',            a.fame,
          'status',          a.status,
          'total_amount',    ab.total_amount,
          'recent_milestones', COALESCE(
            (
              SELECT jsonb_agg(
                       jsonb_build_object(
                         'type',       m.type,
                         'level',      m.level,
                         'detail',     m.detail,
                         'created_at', m.created_at
                       )
                       ORDER BY m.created_at DESC
                     )
              FROM (
                SELECT type, level, detail, created_at
                  FROM agent_milestones
                 WHERE agent_id = ab.agent_id
                 ORDER BY created_at DESC
                 LIMIT 3
              ) m
            ),
            '[]'::jsonb
          )
        ) AS b
        FROM agent_backers ab
        JOIN agents a ON a.id = ab.agent_id
       WHERE ab.user_id = v_uid
    ) sub;

  RETURN jsonb_build_object(
    'prestige', v_prestige,
    'backings', COALESCE(v_backings, '[]'::jsonb)
  );
END;
$$;

-- Lock down access: only authenticated users may call this function
REVOKE ALL ON FUNCTION get_my_backings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_backings() TO authenticated;
