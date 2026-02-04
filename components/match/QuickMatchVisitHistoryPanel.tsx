'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Edit } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import EditVisitWithDartsModal from '@/components/app/EditVisitWithDartsModal';
import { toast } from 'sonner';

interface Dart {
  n: number;
  mult: string;
}

interface Visit {
  id: string;
  visitNumber: number;
  score: number;
  remaining: number;
  remainingBefore: number;
  isBust: boolean;
  isCheckout: boolean;
  darts: Dart[];
  dartsThrown: number;
  dartsAtDouble: number;
}

interface QuickMatchVisitHistoryPanelProps {
  roomId: string;
  currentLeg: number;
  myUserId: string;
  opponentUserId: string;
  myName: string;
  opponentName: string;
  myColor: string;
  opponentColor: string;
  doubleOutEnabled: boolean;
  onEditVisit?: (visitNumber: number, newScore: number) => void;
}

export function QuickMatchVisitHistoryPanel({
  roomId,
  currentLeg,
  myUserId,
  opponentUserId,
  myName,
  opponentName,
  myColor,
  opponentColor,
  doubleOutEnabled,
  onEditVisit,
}: QuickMatchVisitHistoryPanelProps) {
  const [showAllModal, setShowAllModal] = useState(false);
  const [myVisits, setMyVisits] = useState<Visit[]>([]);
  const [opponentVisits, setOpponentVisits] = useState<Visit[]>([]);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const maxVisibleVisits = 8;

  const supabase = createClient();

  // Fetch visits from database
  useEffect(() => {
    if (!roomId || !currentLeg || !myUserId || !opponentUserId) return;

    async function fetchVisits() {
      const { data, error } = await supabase
        .from('quick_match_visits')
        .select('*')
        .eq('room_id', roomId)
        .eq('leg', currentLeg)
        .order('turn_no', { ascending: true });

      if (error) {
        console.error('[VISIT_HISTORY] Error fetching visits:', error);
        return;
      }

      if (!data) return;

      // Separate visits by player
      const myVisitsData = data
        .filter(v => v.player_id === myUserId)
        .map(v => ({
          id: v.id,
          visitNumber: v.turn_no,
          score: v.score,
          remaining: v.remaining_after,
          remainingBefore: v.remaining_before,
          isBust: v.is_bust || false,
          isCheckout: v.is_checkout || false,
          darts: v.darts || [],
          dartsThrown: v.darts_thrown || 3,
          dartsAtDouble: v.darts_at_double || 0,
        }));

      const opponentVisitsData = data
        .filter(v => v.player_id === opponentUserId)
        .map(v => ({
          id: v.id,
          visitNumber: v.turn_no,
          score: v.score,
          remaining: v.remaining_after,
          remainingBefore: v.remaining_before,
          isBust: v.is_bust || false,
          isCheckout: v.is_checkout || false,
          darts: v.darts || [],
          dartsThrown: v.darts_thrown || 3,
          dartsAtDouble: v.darts_at_double || 0,
        }));

      setMyVisits(myVisitsData);
      setOpponentVisits(opponentVisitsData);
    }

    fetchVisits();
  }, [roomId, currentLeg, myUserId, opponentUserId, supabase]);

  // Subscribe to realtime inserts, updates, and deletes
  useEffect(() => {
    if (!roomId || !currentLeg || !myUserId || !opponentUserId) return;

    const channel = supabase
      .channel(`quick_match_visits:${roomId}:${currentLeg}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quick_match_visits',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newVisit = payload.new as any;

          if (newVisit.leg !== currentLeg) return;

          const visit: Visit = {
            id: newVisit.id,
            visitNumber: newVisit.turn_no,
            score: newVisit.score,
            remaining: newVisit.remaining_after,
            remainingBefore: newVisit.remaining_before,
            isBust: newVisit.is_bust || false,
            isCheckout: newVisit.is_checkout || false,
            darts: newVisit.darts || [],
            dartsThrown: newVisit.darts_thrown || 3,
            dartsAtDouble: newVisit.darts_at_double || 0,
          };

          if (newVisit.player_id === myUserId) {
            setMyVisits(prev => [...prev, visit]);
          } else if (newVisit.player_id === opponentUserId) {
            setOpponentVisits(prev => [...prev, visit]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quick_match_visits',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const updatedVisit = payload.new as any;

          if (updatedVisit.leg !== currentLeg) return;

          const visit: Visit = {
            id: updatedVisit.id,
            visitNumber: updatedVisit.turn_no,
            score: updatedVisit.score,
            remaining: updatedVisit.remaining_after,
            remainingBefore: updatedVisit.remaining_before,
            isBust: updatedVisit.is_bust || false,
            isCheckout: updatedVisit.is_checkout || false,
            darts: updatedVisit.darts || [],
            dartsThrown: updatedVisit.darts_thrown || 3,
            dartsAtDouble: updatedVisit.darts_at_double || 0,
          };

          if (updatedVisit.player_id === myUserId) {
            setMyVisits(prev =>
              prev.map(v => v.id === visit.id ? visit : v)
            );
          } else if (updatedVisit.player_id === opponentUserId) {
            setOpponentVisits(prev =>
              prev.map(v => v.id === visit.id ? visit : v)
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'quick_match_visits',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const deletedVisit = payload.old as any;

          if (deletedVisit.player_id === myUserId) {
            setMyVisits(prev => prev.filter(v => v.id !== deletedVisit.id));
          } else if (deletedVisit.player_id === opponentUserId) {
            setOpponentVisits(prev => prev.filter(v => v.id !== deletedVisit.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, currentLeg, myUserId, opponentUserId, supabase]);

  const formatDarts = (darts: Dart[]): string => {
    if (!darts || darts.length === 0) return '';

    return darts.map(dart => {
      if (dart.mult === 'SB') return 'SB';
      if (dart.mult === 'DB') return 'DB';
      if (dart.mult === 'T') return `T${dart.n}`;
      if (dart.mult === 'D') return `D${dart.n}`;
      return `${dart.n}`;
    }).join(', ');
  };

  const handleEditVisit = async (
    visitId: string,
    darts: Dart[],
    score: number,
    dartsThrown: number,
    dartsAtDouble: number
  ) => {
    try {
      const { data, error } = await supabase.rpc('rpc_edit_visit_with_darts', {
        p_visit_id: visitId,
        p_darts: darts,
        p_score: score,
        p_darts_thrown: dartsThrown,
        p_darts_at_double: dartsAtDouble,
      });

      if (error) throw error;

      if (!data?.ok) {
        throw new Error('Failed to edit visit');
      }

      toast.success('Visit updated successfully');
    } catch (err: any) {
      console.error('[EDIT_VISIT] Error:', err);
      toast.error(err.message || 'Failed to edit visit');
      throw err;
    }
  };

  const handleDeleteVisit = async (visitId: string) => {
    try {
      const { data, error } = await supabase.rpc('rpc_delete_visit', {
        p_visit_id: visitId,
      });

      if (error) throw error;

      if (!data?.ok) {
        throw new Error('Failed to delete visit');
      }

      toast.success('Visit deleted successfully');
    } catch (err: any) {
      console.error('[DELETE_VISIT] Error:', err);
      toast.error(err.message || 'Failed to delete visit');
      throw err;
    }
  };

  const renderVisitRow = (visit: Visit, playerName: string, color: string, editable: boolean) => {
    const dartsDisplay = formatDarts(visit.darts);

    return (
      <div
        key={`${playerName}-${visit.visitNumber}`}
        className="flex items-center justify-between py-2 px-3 rounded hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center space-x-3 flex-1">
          <span className="text-xs text-gray-500 w-8">#{visit.visitNumber}</span>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${color}`}>
                {visit.score}
              </span>
              {visit.isBust && (
                <span className="text-xs text-red-400 font-semibold">BUST</span>
              )}
              {visit.isCheckout && (
                <span className="text-xs text-amber-400 font-semibold">CHECKOUT!</span>
              )}
            </div>
            {dartsDisplay && (
              <span className="text-xs text-gray-500 truncate">{dartsDisplay}</span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-400">{visit.remaining}</span>
          {editable && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditingVisit(visit)}
              className="h-7 w-7 p-0 hover:bg-white/5"
            >
              <Edit className="w-3 h-3 text-gray-400" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  const recentMyVisits = myVisits.slice(-maxVisibleVisits);
  const recentOpponentVisits = opponentVisits.slice(-maxVisibleVisits);

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold ${myColor}`}>{myName} (You)</h3>
              <span className="text-xs text-gray-500">{myVisits.length} visits</span>
            </div>
            <div className="space-y-1">
              {recentMyVisits.map((visit) => renderVisitRow(visit, myName, myColor, true))}
              {myVisits.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No visits yet</p>
              )}
            </div>
          </div>

          <Separator className="bg-white/5" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold ${opponentColor}`}>{opponentName}</h3>
              <span className="text-xs text-gray-500">{opponentVisits.length} visits</span>
            </div>
            <div className="space-y-1">
              {recentOpponentVisits.map((visit) => renderVisitRow(visit, opponentName, opponentColor, false))}
              {opponentVisits.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No visits yet</p>
              )}
            </div>
          </div>
        </div>

        {(myVisits.length > maxVisibleVisits || opponentVisits.length > maxVisibleVisits) && (
          <Button
            onClick={() => setShowAllModal(true)}
            variant="outline"
            className="w-full mt-3 border-white/10 text-white hover:bg-white/5"
          >
            View All Visits
          </Button>
        )}

        <Dialog open={showAllModal} onOpenChange={setShowAllModal}>
          <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Complete Visit History</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <div>
                <h3 className={`text-sm font-semibold ${myColor} mb-2`}>{myName} (You)</h3>
                <div className="space-y-1">
                  {myVisits.map((visit) => renderVisitRow(visit, myName, myColor, true))}
                </div>
              </div>
              <Separator className="bg-white/5" />
              <div>
                <h3 className={`text-sm font-semibold ${opponentColor} mb-2`}>{opponentName}</h3>
                <div className="space-y-1">
                  {opponentVisits.map((visit) => renderVisitRow(visit, opponentName, opponentColor, false))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Visit Modal */}
      {editingVisit && (
        <EditVisitWithDartsModal
          open={!!editingVisit}
          onOpenChange={(open) => !open && setEditingVisit(null)}
          visitId={editingVisit.id}
          visitNumber={editingVisit.visitNumber}
          originalDarts={editingVisit.darts}
          originalScore={editingVisit.score}
          remainingBefore={editingVisit.remainingBefore}
          isCheckout={editingVisit.isCheckout}
          doubleOutRequired={doubleOutEnabled}
          onSave={handleEditVisit}
          onDelete={handleDeleteVisit}
        />
      )}
    </>
  );
}
