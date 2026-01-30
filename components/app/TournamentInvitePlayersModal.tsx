'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface TournamentInvitePlayersModalProps {
  tournamentId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface User {
  id: string;
  username: string;
  display_name: string;
}

export function TournamentInvitePlayersModal({
  tournamentId,
  isOpen,
  onClose,
}: TournamentInvitePlayersModalProps) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      searchUsers();
    }
  }, [isOpen, search]);

  async function searchUsers() {
    setLoading(true);
    const supabase = createClient();

    const query = supabase
      .from('profiles')
      .select('id, username, display_name')
      .limit(20);

    if (search) {
      query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    const { data } = await query;

    setUsers(data || []);
    setLoading(false);
  }

  function toggleUser(userId: string) {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  }

  async function sendInvites() {
    if (selectedUsers.size === 0) {
      toast.error('Please select at least one user');
      return;
    }

    setInviting(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase.rpc('invite_users_to_tournament', {
        tournament_uuid: tournamentId,
        user_ids: Array.from(selectedUsers),
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Invited ${data.invitedCount} players`);
        setSelectedUsers(new Set());
        onClose();
      } else {
        toast.error(data?.error || 'Failed to send invites');
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setInviting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Players</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by username or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white"
            />
          </div>

          <ScrollArea className="h-[300px] border border-white/10 rounded-lg p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <UserPlus className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No users found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center space-x-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer"
                    onClick={() => toggleUser(user.id)}
                  >
                    <Checkbox
                      checked={selectedUsers.has(user.id)}
                      onCheckedChange={() => toggleUser(user.id)}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">
                        {user.display_name}
                      </p>
                      <p className="text-xs text-gray-400">@{user.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>{selectedUsers.size} players selected</span>
          </div>

          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-white/10 text-white hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={sendInvites}
              disabled={inviting || selectedUsers.size === 0}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600"
            >
              {inviting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                `Invite ${selectedUsers.size > 0 ? selectedUsers.size : ''} Player${
                  selectedUsers.size !== 1 ? 's' : ''
                }`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
