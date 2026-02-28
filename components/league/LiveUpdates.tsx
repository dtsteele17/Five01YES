"use client";

import { League, LiveUpdate } from '@/lib/context/LeaguesContext';
import { useLeagues } from '@/lib/context/LeaguesContext';
import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface LiveUpdatesProps {
  league: League;
  isAdmin: boolean;
}

export default function LiveUpdates({ league, isAdmin }: LiveUpdatesProps) {
  const { dispatch, state } = useLeagues();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [sendNotification, setSendNotification] = useState(false);

  const currentUser = league.players.find(p => p.id === state.currentUserId);

  const handlePostUpdate = () => {
    if (!message.trim()) {
      toast({
        title: 'Empty Message',
        description: 'Please enter a message to post',
        variant: 'destructive',
      });
      return;
    }

    if (!currentUser) return;

    const newUpdate: LiveUpdate = {
      id: `update-${Date.now()}`,
      authorId: currentUser.id,
      timestamp: new Date(),
      message: message.trim(),
      upvotes: [],
      downvotes: [],
      notificationSent: sendNotification,
    };

    dispatch({
      type: 'ADD_LIVE_UPDATE',
      payload: {
        leagueId: league.id,
        update: newUpdate,
      },
    });

    if (sendNotification) {
      toast({
        title: 'Update Posted',
        description: 'Notification sent to all league members',
      });
    } else {
      toast({
        title: 'Update Posted',
        description: 'Your update has been posted',
      });
    }

    setMessage('');
    setSendNotification(false);
  };

  const handleReaction = (updateId: string, type: 'upvote' | 'downvote') => {
    dispatch({
      type: 'TOGGLE_REACTION',
      payload: {
        leagueId: league.id,
        updateId,
        userId: state.currentUserId,
        type,
      },
    });
  };

  return (
    <div>
      {isAdmin && (
        <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-4 mb-6">
          <div className="mb-3">
            <label className="text-sm font-medium text-white mb-2 block">
              Post an Update
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Share news, announcements, or updates with the league..."
              className="min-h-[100px] bg-slate-900/50 border-slate-700"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2">
              <Checkbox
                id="notification"
                checked={sendNotification}
                onCheckedChange={(checked) => setSendNotification(checked as boolean)}
              />
              <label
                htmlFor="notification"
                className="text-sm text-slate-300 cursor-pointer flex items-center gap-2"
              >
                <Bell className="w-4 h-4" />
                Send notification to all players
              </label>
            </div>

            <Button
              onClick={handlePostUpdate}
              className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700"
              disabled={!message.trim()}
            >
              Post Update
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {league.liveUpdates.map(update => {
          const author = league.players.find(p => p.id === update.authorId);
          const userUpvoted = update.upvotes.includes(state.currentUserId);
          const userDownvoted = update.downvotes.includes(state.currentUserId);

          if (!author) return null;

          return (
            <div
              key={update.id}
              className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/30 rounded-xl p-4"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-semibold">
                  {author.displayName.charAt(0)}
                </div>

                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-medium text-white">{author.displayName}</span>
                    {author.role === 'Owner' && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded">
                        Owner
                      </span>
                    )}
                    {author.role === 'Admin' && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                        Admin
                      </span>
                    )}
                    {update.notificationSent && (
                      <Bell className="w-3 h-3 text-teal-400" />
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatDistanceToNow(update.timestamp, { addSuffix: true })}
                  </div>
                </div>
              </div>

              <div className="text-slate-200 mb-4 leading-relaxed">
                {update.message}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleReaction(update.id, 'upvote')}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all
                    ${userUpvoted
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 border border-slate-700/30'
                    }
                  `}
                >
                  <ThumbsUp className={`w-4 h-4 ${userUpvoted ? 'fill-current' : ''}`} />
                  <span className="text-sm font-medium">{update.upvotes.length}</span>
                </button>

                <button
                  onClick={() => handleReaction(update.id, 'downvote')}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all
                    ${userDownvoted
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 border border-slate-700/30'
                    }
                  `}
                >
                  <ThumbsDown className={`w-4 h-4 ${userDownvoted ? 'fill-current' : ''}`} />
                  <span className="text-sm font-medium">{update.downvotes.length}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {league.liveUpdates.length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-2">No updates yet</div>
          <div className="text-slate-500 text-sm">
            {isAdmin
              ? 'Post the first update to keep players informed'
              : 'Check back later for league updates and announcements'
            }
          </div>
        </div>
      )}
    </div>
  );
}
