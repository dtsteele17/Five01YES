"use client";

import { useState } from 'react';
import { useLeagues } from '@/lib/context/LeaguesContext';
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
import { Mail, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leagueId: string;
}

export default function InviteModal({ open, onOpenChange, leagueId }: InviteModalProps) {
  const { dispatch, getLeague } = useLeagues();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const league = getLeague(leagueId);

  const handleInvite = () => {
    if (!email.trim()) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    if (league?.invitedEmails.includes(email)) {
      toast({
        title: 'Already Invited',
        description: 'This email has already been invited',
        variant: 'destructive',
      });
      return;
    }

    dispatch({
      type: 'ADD_INVITE',
      payload: {
        leagueId,
        email,
      },
    });

    toast({
      title: 'Invite Sent',
      description: `Invitation sent to ${email}`,
    });

    setEmail('');
  };

  const handleRemoveInvite = (emailToRemove: string) => {
    if (!league) return;

    dispatch({
      type: 'UPDATE_LEAGUE',
      payload: {
        id: leagueId,
        updates: {
          invitedEmails: league.invitedEmails.filter(e => e !== emailToRemove),
        },
      },
    });

    toast({
      title: 'Invite Removed',
      description: `Removed invitation for ${emailToRemove}`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Invite Players</DialogTitle>
          <DialogDescription>
            Send invitations to players via email
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="player@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleInvite();
                    }
                  }}
                  className="pl-10"
                />
              </div>
              <Button onClick={handleInvite} className="bg-teal-600 hover:bg-teal-700">
                Send Invite
              </Button>
            </div>
          </div>

          {league && league.invitedEmails.length > 0 && (
            <div className="space-y-2">
              <Label>Pending Invitations</Label>
              <div className="space-y-2">
                {league.invitedEmails.map((invitedEmail, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-slate-800/30 rounded-lg px-3 py-2 border border-slate-700/30"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-300">{invitedEmail}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveInvite(invitedEmail)}
                      className="h-8 w-8 p-0 hover:bg-red-500/20 hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {league && league.players.length >= league.maxParticipants && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-sm text-yellow-500">
                This league is at maximum capacity ({league.maxParticipants} players).
                You can still send invites, but new players won't be able to join until a spot opens up.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
