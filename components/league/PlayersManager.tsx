"use client";

import { League } from '@/lib/context/LeaguesContext';
import { useLeagues } from '@/lib/context/LeaguesContext';
import { useState } from 'react';
import { UserPlus, MoreVertical, Shield, UserMinus, Ban, Calendar, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import InviteModal from './InviteModal';
import { useToast } from '@/hooks/use-toast';

interface PlayersManagerProps {
  league: League;
  isAdmin: boolean;
}

export default function PlayersManager({ league, isAdmin }: PlayersManagerProps) {
  const { dispatch } = useLeagues();
  const { toast } = useToast();
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const handleBanPlayer = (playerId: string, playerName: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Banned' ? 'Active' : 'Banned';
    dispatch({
      type: 'UPDATE_PLAYER',
      payload: {
        leagueId: league.id,
        playerId,
        updates: { status: newStatus },
      },
    });

    toast({
      title: newStatus === 'Banned' ? 'Player Banned' : 'Player Unbanned',
      description: `${playerName} has been ${newStatus === 'Banned' ? 'banned from' : 'unbanned in'} the league`,
    });
  };

  const handleRemovePlayer = (playerId: string, playerName: string) => {
    dispatch({
      type: 'REMOVE_PLAYER',
      payload: {
        leagueId: league.id,
        playerId,
      },
    });

    toast({
      title: 'Player Removed',
      description: `${playerName} has been removed from the league`,
      variant: 'destructive',
    });
  };

  const handlePromoteToAdmin = (playerId: string, playerName: string) => {
    dispatch({
      type: 'UPDATE_PLAYER',
      payload: {
        leagueId: league.id,
        playerId,
        updates: { role: 'Admin' },
      },
    });

    toast({
      title: 'Player Promoted',
      description: `${playerName} is now an admin`,
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Players ({league.players.length}/{league.maxParticipants})
          </h3>
          <p className="text-sm text-slate-400">Manage league members and permissions</p>
        </div>

        {isAdmin && (
          <Button
            onClick={() => setInviteModalOpen(true)}
            className="bg-teal-600 hover:bg-teal-700"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Invite Player
          </Button>
        )}
      </div>

      {league.invitedEmails && league.invitedEmails.length > 0 && (
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-yellow-500 mb-1">Pending Invites</div>
              <div className="space-y-1">
                {league.invitedEmails.map((email, index) => (
                  <div key={index} className="text-sm text-slate-300">
                    {email}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {league.players.map(player => (
          <div
            key={player.id}
            className={`
              bg-slate-800/30 backdrop-blur-sm border rounded-xl p-4
              ${player.status === 'Banned'
                ? 'border-red-500/30 opacity-60'
                : 'border-slate-700/30'
              }
            `}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3 flex-1">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-semibold text-lg">
                  {player.displayName.charAt(0)}
                </div>

                <div className="flex-1">
                  <div className="font-medium text-white mb-1">{player.displayName}</div>
                  <div className="flex flex-wrap gap-2">
                    {player.role === 'Owner' && (
                      <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                        <Shield className="w-3 h-3 mr-1" />
                        Owner
                      </Badge>
                    )}
                    {player.role === 'Admin' && (
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        Admin
                      </Badge>
                    )}
                    {player.status === 'Banned' && (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                        <Ban className="w-3 h-3 mr-1" />
                        Banned
                      </Badge>
                    )}
                    {player.status === 'Active' && (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        Active
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {isAdmin && player.role !== 'Owner' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => {}}>
                      <Calendar className="w-4 h-4 mr-2" />
                      Assign Match
                    </DropdownMenuItem>
                    {player.role === 'Player' && (
                      <DropdownMenuItem onClick={() => handlePromoteToAdmin(player.id, player.displayName)}>
                        <Shield className="w-4 h-4 mr-2" />
                        Promote to Admin
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleBanPlayer(player.id, player.displayName, player.status)}
                    >
                      <Ban className="w-4 h-4 mr-2" />
                      {player.status === 'Banned' ? 'Unban Player' : 'Ban Player'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleRemovePlayer(player.id, player.displayName)}
                      className="text-red-400"
                    >
                      <UserMinus className="w-4 h-4 mr-2" />
                      Remove Player
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {league.cameraRequired && (
              <div className="flex items-center gap-2 text-sm">
                {player.cameraRequiredAcknowledged ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-400">Camera requirement acknowledged</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    <span className="text-yellow-500">Pending camera acknowledgment</span>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {league.players.length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-2">No players yet</div>
          <div className="text-slate-500 text-sm">Invite players to start building your league</div>
        </div>
      )}

      <InviteModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        leagueId={league.id}
      />
    </div>
  );
}
