DROP FUNCTION IF EXISTS auto_register_tournament_creator(uuid, uuid);

CREATE FUNCTION auto_register_tournament_creator(p_tournament_id UUID, p_creator_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  INSERT INTO tournament_participants (tournament_id, user_id, role, joined_at)
  VALUES (p_tournament_id, p_creator_user_id, 'admin', NOW())
  ON CONFLICT (tournament_id, user_id) DO NOTHING;
  RETURN jsonb_build_object('success', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION auto_register_tournament_creator(UUID, UUID) TO authenticated;
