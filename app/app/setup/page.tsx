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
import { User, Target, Sparkles, ArrowRight, Upload } from 'lucide-react';

export default function ProfileSetupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    avatar_url: '',
    bio: '',
  });

  useEffect(() => {
    checkAuthAndProfile();
  }, []);

  const checkAuthAndProfile = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        router.push('/login');
        return;
      }

      setUser(authUser);

      // Check if profile needs setup
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, bio, created_at')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profile && profile.username && profile.display_name) {
        // Profile already setup, redirect to app
        router.push('/app');
        return;
      }

      // Pre-fill with any existing data
      if (profile) {
        setFormData({
          username: profile.username || '',
          display_name: profile.display_name || authUser.user_metadata?.full_name || '',
          avatar_url: profile.avatar_url || authUser.user_metadata?.avatar_url || '',
          bio: profile.bio || '',
        });
      } else {
        // Use metadata from OAuth provider
        setFormData({
          username: '',
          display_name: authUser.user_metadata?.full_name || '',
          avatar_url: authUser.user_metadata?.avatar_url || '',
          bio: '',
        });
      }
    } catch (error) {
      console.error('Error checking auth/profile:', error);
      toast.error('Something went wrong. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate username
    if (!formData.username || formData.username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      toast.error('Username can only contain letters, numbers, and underscores');
      return;
    }

    // Validate display name
    if (!formData.display_name || formData.display_name.length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }

    if (formData.bio && formData.bio.length > 400) {
      toast.error('Bio must be 400 characters or less');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: formData.username,
          display_name: formData.display_name,
          avatar_url: formData.avatar_url || null,
          bio: formData.bio || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        if (error.message?.includes('duplicate key')) {
          toast.error('This username is already taken. Please choose another.');
          return;
        }
        throw error;
      }

      toast.success('Profile setup complete! Welcome to FIVE01!');
      router.push('/app');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = () => {
    if (!formData.display_name) return 'U';
    const names = formData.display_name.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return formData.display_name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/50 p-8">
          {/* Header */}
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
            <p className="text-slate-400">Let's set up your FIVE01 profile to get started</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="w-24 h-24">
                <AvatarImage src={formData.avatar_url} />
                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-2xl">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>

              <div className="w-full space-y-2">
                <Label htmlFor="avatar_url" className="text-gray-300">
                  Profile Picture URL (Optional)
                </Label>
                <Input
                  id="avatar_url"
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={formData.avatar_url}
                  onChange={(e) =>
                    setFormData({ ...formData, avatar_url: e.target.value })
                  }
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50"
                />
              </div>
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
                  setFormData({ 
                    ...formData, 
                    username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') 
                  })
                }
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50"
              />
              <p className="text-xs text-gray-400">
                Only letters, numbers, and underscores. Must be unique.
              </p>
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

            {/* Bio */}
            <div className="space-y-2">
              <Label htmlFor="bio" className="text-gray-300">
                Bio (Optional)
              </Label>
              <Textarea
                id="bio"
                placeholder="Tell us about yourself and your darts journey..."
                value={formData.bio}
                onChange={(e) =>
                  setFormData({ ...formData, bio: e.target.value })
                }
                maxLength={400}
                rows={3}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50 resize-none"
              />
              <p className="text-xs text-gray-400 text-right">
                {formData.bio.length}/400 characters
              </p>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading || !formData.username || !formData.display_name}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold py-3 h-auto text-lg shadow-xl shadow-emerald-500/25"
            >
              {loading ? (
                'Setting up...'
              ) : (
                <>
                  Complete Setup
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}