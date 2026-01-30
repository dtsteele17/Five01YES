"use client";

import { useState } from 'react';
import { useTournaments } from '@/lib/context/TournamentsContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Mail, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface TournamentInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
}

export default function TournamentInviteModal({ open, onOpenChange, tournamentId }: TournamentInviteModalProps) {
  const { dispatch, getTournament } = useTournaments();
  const [input, setInput] = useState('');
  const tournament = getTournament(tournamentId);

  const handleInvite = () => {
    if (!input.trim()) {
      toast.error('Please enter an email or username');
      return;
    }

    const inputLower = input.trim().toLowerCase();

    if (tournament?.invitedEmails.some(e => e.toLowerCase() === inputLower)) {
      toast.error('This user has already been invited');
      return;
    }

    dispatch({
      type: 'ADD_INVITE',
      payload: {
        tournamentId,
        email: input.trim(),
      },
    });

    toast.success('Invite sent');
    setInput('');
  };

  const handleRemoveInvite = (inviteToRemove: string) => {
    if (!tournament) return;

    dispatch({
      type: 'UPDATE_TOURNAMENT',
      payload: {
        id: tournamentId,
        updates: {
          invitedEmails: tournament.invitedEmails.filter(e => e !== inviteToRemove),
        },
      },
    });

    toast.success('Invite removed');
  };

  const handleCopyLink = (invite: string) => {
    toast.success('Link copied (placeholder)');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-slate-900/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white">Invite Players</DialogTitle>
          <DialogDescription className="text-gray-400">
            Invite by email or FIVE01 username
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="invite-input" className="text-gray-300">Email or Username</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="invite-input"
                  type="text"
                  placeholder="player@example.com or username"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleInvite();
                    }
                  }}
                  className="pl-10 bg-slate-800/50 border-white/10 text-white placeholder:text-gray-500"
                />
              </div>
              <Button
                onClick={handleInvite}
                className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white"
              >
                Send Invite
              </Button>
            </div>
          </div>

          {tournament && tournament.invitedEmails.length > 0 && (
            <div className="space-y-2">
              <Label className="text-gray-300">Pending Invitations</Label>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {tournament.invitedEmails.map((invite, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2 border border-white/5"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-300 truncate">{invite}</span>
                      <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-xs flex-shrink-0">
                        Pending
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyLink(invite)}
                        className="h-8 w-8 p-0 hover:bg-teal-500/20 hover:text-teal-400"
                        title="Copy invite link"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveInvite(invite)}
                        className="h-8 w-8 p-0 hover:bg-red-500/20 hover:text-red-400"
                        title="Remove invite"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tournament && tournament.participants.length >= tournament.maxParticipants && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-sm text-yellow-400">
                This tournament is at maximum capacity ({tournament.maxParticipants} participants).
                You can still send invites, but new players won't be able to join until a spot opens up.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
