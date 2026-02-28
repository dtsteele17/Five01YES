'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function JoinMatch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setInviteCode(code.toUpperCase());
    }
  }, [searchParams]);

  async function joinMatch() {
    if (!inviteCode.trim()) {
      toast.error('Please enter an invite code');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to join a match');
        router.push('/login');
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/join-online-match`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inviteCode: inviteCode.toUpperCase() }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success('Joined match!');
        router.push(`/app/play/private/lobby/${result.match.id}`);
      } else {
        toast.error(result.error || 'Failed to join match');
      }
    } catch (error) {
      console.error('Error joining match:', error);
      toast.error('Failed to join match');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6">
      <Card className="bg-slate-900 border-white/10 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Join Match</h1>
          <p className="text-gray-400">Enter the invite code to join a private match</p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="inviteCode" className="text-white mb-2 block">
              Invite Code
            </Label>
            <Input
              id="inviteCode"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="bg-slate-800 border-white/10 text-white text-center text-2xl font-mono tracking-wider"
              maxLength={6}
              autoFocus
            />
          </div>

          <Button
            onClick={joinMatch}
            disabled={loading || !inviteCode.trim()}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Joining...
              </>
            ) : (
              'Join Match'
            )}
          </Button>

          <Button
            onClick={() => router.push('/app/play')}
            variant="outline"
            className="w-full border-white/10 text-white hover:bg-white/5"
          >
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}
