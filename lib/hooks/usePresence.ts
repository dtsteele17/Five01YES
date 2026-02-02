import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PresenceOptions {
  activity_type?: 'quick_match' | 'ranked_match' | 'private_match' | 'training' | 'practice' | null;
  activity_id?: string | null;
  activity_label?: string | null;
  score_snapshot?: any;
}

export function usePresence(options: PresenceOptions = {}) {
  const supabase = createClient();

  useEffect(() => {
    const updatePresence = async () => {
      await supabase.rpc('rpc_set_presence', {
        p_is_online: true,
        p_activity_type: options.activity_type || null,
        p_activity_id: options.activity_id || null,
        p_activity_label: options.activity_label || null,
        p_score_snapshot: options.score_snapshot || null,
      });
    };

    updatePresence();

    const interval = setInterval(updatePresence, 30000);

    const handleBeforeUnload = async () => {
      await supabase.rpc('rpc_set_presence', {
        p_is_online: false,
        p_activity_type: null,
        p_activity_id: null,
        p_activity_label: null,
        p_score_snapshot: null,
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [options.activity_type, options.activity_id, options.activity_label, JSON.stringify(options.score_snapshot)]);
}
