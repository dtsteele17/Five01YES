'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function ProfileSetupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    avatar_url: '',
    bio: '',
  });

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    setUserId(user.id);

    // Fetch existing profile data to pre-fill
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url, bio')
      .eq('id', user.id)
      .maybeSingle();

    setFormData({
      username: profile?.username || '',
      display_name: profile?.display_name || user.user_metadata?.full_name || '',
      avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || '',
      bio: profile?.bio || '',
    });

    setPageLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.username || formData.username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      toast.error('Username can only contain letters, numbers, and underscores');
      return;
    }

    if (!formData.display_name || formData.display_name.length < 2) {
      toast.error('Display name must be at least 2 characters');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: formData.username.toLowerCase(),
          display_name: formData.display_name,
          avatar_url: formData.avatar_url || null,
          bio: formData.bio || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        if (error.message?.includes('duplicate') || error.code === '23505') {
          toast.error('This username is already taken. Please choose another.');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Welcome to FIVE01! 🎯');
      router.push('/app');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = () => {
    if (!formData.display_name) return 'U';
    const names = formData.display_name.split(' ');
    if (names.length >= 2) return `${names[0][0]}${names[1][0]}`.toUpperCase();
    return formData.display_name.substring(0, 2).toUpperCase();
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/50 p-8">
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center"
            >
              <Sparkles className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-3xl font-black text-white mb-2">Complete Your Profile</h1>
            <p className="text-slate-400">Choose a username and display name to get started</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar preview */}
            <div className="flex justify-center">
              <Avatar className="w-20 h-20">
                <AvatarImage src={formData.avatar_url} />
                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-2xl">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-300">
                Username <span className="text-red-400">*</span>
              </Label>
              <Input
                id="username"
                type="text"
                required
                minLength={3}
                placeholder="your_username"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
                }
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50"
              />
              <p className="text-xs text-gray-400">Letters, numbers, and underscores only</p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display_name" className="text-gray-300">
                Display Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="display_name"
                type="text"
                required
                minLength={2}
                placeholder="Your Name"
                value={formData.display_name}
                onChange={(e) =>
                  setFormData({ ...formData, display_name: e.target.value })
                }
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50"
              />
            </div>

            {/* Skip button + Submit */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/app')}
                className="flex-1 border-white/10 text-slate-400 hover:bg-white/5"
              >
                Skip for now
              </Button>
              <Button
                type="submit"
                disabled={loading || !formData.username || !formData.display_name}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold shadow-xl shadow-emerald-500/25"
              >
                {loading ? 'Saving...' : (
                  <>Complete Setup <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
