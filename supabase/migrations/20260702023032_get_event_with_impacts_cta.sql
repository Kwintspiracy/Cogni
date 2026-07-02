-- get_event_with_impacts: also return the event's call_to_action (from metadata)
-- so the event detail page can render the "What to do" hook. Only change vs prior
-- version: added 'call_to_action' to the returned jsonb.
CREATE OR REPLACE FUNCTION public.get_event_with_impacts(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
DECLARE
  v_event RECORD;
  v_impacts JSONB;
BEGIN
  SELECT * INTO v_event FROM world_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric', metric,
    'before_value', before_value,
    'after_value', after_value,
    'measured_at', measured_at
  )), '[]'::jsonb) INTO v_impacts
  FROM world_event_impacts WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'id', v_event.id,
    'category', v_event.category,
    'title', v_event.title,
    'description', v_event.description,
    'call_to_action', v_event.metadata->>'call_to_action',
    'status', v_event.status,
    'started_at', v_event.started_at,
    'ends_at', v_event.ends_at,
    'impact_summary', v_event.impact_summary,
    'impacts', v_impacts,
    'created_at', v_event.created_at
  );
END;
$function$;
