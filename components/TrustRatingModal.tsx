'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { TrustLetter } from './TrustBadge';

interface TrustRatingModalProps {
  open: boolean;
  matchId: string;
  opponentId: string;
  onDone: () => void;
}

export function TrustRatingModal({ open, matchId, opponentId, onDone }: TrustRatingModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const supabase = createClient();

  const handleRating = async (rating: TrustLetter) => {
    if (submitting) return;

    setSubmitting(true);
    console.log('[TRUST_RATING] Submitting rating:', { matchId, opponentId, rating });

    try {
      const { data, error } = await supabase.rpc('rpc_submit_trust_rating', {
        p_match_room_id: matchId,
        p_rating: rating,
      });

      console.log('[TRUST_RATING] RPC response:', data);

      if (error) {
        console.error('[TRUST_RATING] Error:', error);
        toast.error(`Failed to submit rating: ${error.message}`);
        setSubmitting(false);
        return;
      }

      if (data && typeof data === 'object' && 'inserted' in data) {
        if (data.inserted === false) {
          console.log('[TRUST_RATING] Already rated this opponent');
          setAlreadyRated(true);
          toast.info('You already rated this player');
          setTimeout(() => {
            onDone();
          }, 1500);
          return;
        }

        if (data.inserted === true) {
          console.log('[TRUST_RATING] Rating submitted successfully');
          toast.success('Trust rating submitted');
          setTimeout(() => {
            onDone();
          }, 800);
          return;
        }
      }

      // Fallback for unexpected response
      console.log('[TRUST_RATING] Unexpected response, assuming success');
      toast.success('Trust rating submitted');
      setTimeout(() => {
        onDone();
      }, 800);
    } catch (error: any) {
      console.error('[TRUST_RATING] Exception:', error);
      toast.error(`Failed to submit rating: ${error.message}`);
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    console.log('[TRUST_RATING] User skipped rating');
    onDone();
  };

  const ratingButtons: { letter: TrustLetter; label: string; colorClass: string }[] = [
    { letter: 'E', label: 'E', colorClass: 'bg-red-600 hover:bg-red-700 text-white' },
    { letter: 'D', label: 'D', colorClass: 'bg-orange-500 hover:bg-orange-600 text-white' },
    { letter: 'C', label: 'C', colorClass: 'bg-yellow-500 hover:bg-yellow-600 text-gray-900' },
    { letter: 'B', label: 'B', colorClass: 'bg-lime-500 hover:bg-lime-600 text-gray-900' },
    { letter: 'A', label: 'A', colorClass: 'bg-green-600 hover:bg-green-700 text-white' },
  ];

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center mb-2">Trust Rating</DialogTitle>
          <p className="text-gray-400 text-center text-sm">
            Rate your opponent&apos;s trust
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {alreadyRated && (
            <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 text-center">
              <p className="text-blue-300 text-sm">Already rated this opponent</p>
            </div>
          )}

          <div className="flex justify-center gap-3">
            {ratingButtons.map(({ letter, label, colorClass }) => (
              <Button
                key={letter}
                onClick={() => handleRating(letter)}
                disabled={submitting || alreadyRated}
                className={`${colorClass} w-14 h-14 text-xl font-bold rounded-full p-0 transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex justify-center">
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={submitting || alreadyRated}
              className="text-gray-400 hover:text-white"
            >
              Skip
            </Button>
          </div>

          {submitting && (
            <div className="text-center text-sm text-gray-400">
              Submitting rating...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
