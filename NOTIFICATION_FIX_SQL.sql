-- Fix: Add DELETE policy for notifications so users can delete their own
-- Also add a function for bulk operations

-- Allow users to delete their own notifications
CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- RPC to delete all notifications for current user (belt and suspenders)
CREATE OR REPLACE FUNCTION rpc_delete_all_notifications()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM notifications WHERE user_id = auth.uid();
  RETURN json_build_object('ok', true);
END;
$$;

-- RPC to mark all as read for current user
CREATE OR REPLACE FUNCTION rpc_mark_all_notifications_read()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE notifications SET read_at = NOW() WHERE user_id = auth.uid() AND read_at IS NULL;
  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_delete_all_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_mark_all_notifications_read() TO authenticated;
