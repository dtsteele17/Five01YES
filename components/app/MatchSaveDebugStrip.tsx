'use client';

import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { type SaveStatus } from '@/lib/hooks/useMatchPersistence';

interface MatchSaveDebugStripProps {
  saveStatus: SaveStatus;
  savedMatchId: string | null;
  saveError: string | null;
}

/**
 * Debug strip that shows match save status
 * Helps identify save failures immediately
 */
export function MatchSaveDebugStrip({ saveStatus, savedMatchId, saveError }: MatchSaveDebugStripProps) {
  if (saveStatus === 'idle') {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 rounded-lg border p-4 shadow-lg z-50 ${
        saveStatus === 'saving'
          ? 'bg-blue-900/90 border-blue-500'
          : saveStatus === 'saved'
          ? 'bg-green-900/90 border-green-500'
          : 'bg-red-900/90 border-red-500'
      }`}
    >
      <div className="flex items-center gap-3">
        {saveStatus === 'saving' && (
          <>
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
            <div>
              <p className="text-white font-semibold">Saving match...</p>
              <p className="text-blue-200 text-sm">Recording your stats</p>
            </div>
          </>
        )}

        {saveStatus === 'saved' && savedMatchId && (
          <>
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            <div>
              <p className="text-white font-semibold">Saved ✅</p>
              <p className="text-green-200 text-sm font-mono text-xs">
                Match ID: {savedMatchId.substring(0, 8)}...
              </p>
            </div>
          </>
        )}

        {saveStatus === 'error' && (
          <>
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-white font-semibold">Failed ❌</p>
              <p className="text-red-200 text-sm break-words">
                {saveError || 'Unknown error occurred'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
