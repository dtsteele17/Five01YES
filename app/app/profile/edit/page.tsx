'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  User,
  MapPin,
  FileText,
  Target,
  Calendar,
  Hand,
  ImageIcon,
  Save,
  X,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { debounce } from '@/lib/utils';

// Profile interface from profiles table
interface Profile {
  id: string;
  user_id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  location?: string;
  about?: string;
  favorite_format?: '301' | '501' | null;
  playing_since?: number | null;
  preferred_hand?: 'Left' | 'Right' | null;
}

// Validation schema
const profileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username can only contain letters, numbers, and underscores'
    ),
  display_name: z
    .string()
    .max(50, 'Display name must be at most 50 characters')
    .optional()
    .or(z.literal('')),
  avatar_url: z
    .string()
    .url('Please enter a valid URL')
    .optional()
    .or(z.literal('')),
  location: z
    .string()
    .max(100, 'Location must be at most 100 characters')
    .optional()
    .or(z.literal('')),
  about: z
    .string()
    .max(500, 'About must be at most 500 characters')
    .optional()
    .or(z.literal('')),
  favorite_format: z.enum(['301', '501']).optional().or(z.literal('')),
  playing_since: z
    .union([
      z.number().int().min(1900, 'Year must be at least 1900').max(new Date().getFullYear(), `Year cannot be in the future`),
      z.nan(),
    ])
    .optional()
    .transform((val) => (val === undefined || Number.isNaN(val) ? undefined : val)),
  preferred_hand: z.enum(['Left', 'Right']).optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function EditProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [originalUsername, setOriginalUsername] = useState('');

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: '',
      display_name: '',
      avatar_url: '',
      location: '',
      about: '',
      favorite_format: '',
      playing_since: undefined,
      preferred_hand: '',
    },
  });

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to edit your profile');
          router.push('/auth/sign-in');
          return;
        }

        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (profileData) {
          setProfile(profileData);
          setOriginalUsername(profileData.username || '');
          
          // Reset form with profile data
          form.reset({
            username: profileData.username || '',
            display_name: profileData.display_name || '',
            avatar_url: profileData.avatar_url || '',
            location: profileData.location || '',
            about: profileData.about || '',
            favorite_format: profileData.favorite_format || '',
            playing_since: profileData.playing_since || undefined,
            preferred_hand: profileData.preferred_hand || '',
          });
        }
      } catch (error: any) {
        console.error('Error loading profile:', error);
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [supabase, router, form]);

  // Check username availability
  const checkUsernameAvailability = useCallback(
    debounce(async (username: string) => {
      if (!username || username.length < 3) {
        setUsernameAvailable(null);
        return;
      }

      // Skip check if username hasn't changed
      if (username.toLowerCase() === originalUsername.toLowerCase()) {
        setUsernameAvailable(null);
        return;
      }

      setUsernameChecking(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .maybeSingle();

        if (error) throw error;

        setUsernameAvailable(!data);
      } catch (error) {
        console.error('Error checking username:', error);
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 500),
    [supabase, originalUsername]
  );

  // Watch username changes for availability check
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'username') {
        checkUsernameAvailability(value.username || '');
      }
    });
    return () => subscription.unsubscribe();
  }, [form, checkUsernameAvailability]);

  const onSubmit = async (values: ProfileFormValues) => {
    // Check if username is available before submitting
    if (
      values.username.toLowerCase() !== originalUsername.toLowerCase() &&
      usernameAvailable === false
    ) {
      toast.error('Username is already taken');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to update your profile');
        return;
      }

      const updateData = {
        username: values.username,
        display_name: values.display_name || null,
        avatar_url: values.avatar_url || null,
        location: values.location || null,
        about: values.about || null,
        favorite_format: values.favorite_format || null,
        playing_since: values.playing_since || null,
        preferred_hand: values.preferred_hand || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('user_id', user.id);

      if (error) {
        if (error.code === '23505') {
          toast.error('Username is already taken');
          return;
        }
        throw error;
      }

      toast.success('Profile updated successfully!');
      router.push('/app/profile');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-10 w-10 bg-slate-800 rounded-xl animate-pulse" />
          <div className="h-8 w-48 bg-slate-800 rounded-lg animate-pulse" />
        </div>
        <Card className="bg-slate-800/50 border-slate-700/50 p-6 space-y-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 w-24 bg-slate-800 rounded animate-pulse" />
              <div className="h-10 w-full bg-slate-800 rounded-lg animate-pulse" />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/app/profile">
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-black text-white">Edit Profile</h1>
          <p className="text-slate-400">Update your profile information</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Info Card */}
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Basic Information</h2>
                  <p className="text-slate-400 text-sm">Your public profile details</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Username */}
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Username *</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter your username"
                          className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-emerald-500/50 pr-10"
                          disabled={saving}
                        />
                      </FormControl>
                      {usernameChecking && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                      )}
                      {!usernameChecking && usernameAvailable === true && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-xs">
                          Available
                        </span>
                      )}
                      {!usernameChecking && usernameAvailable === false && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-xs">
                          Taken
                        </span>
                      )}
                    </div>
                    <FormDescription className="text-slate-500">
                      3-20 characters, letters, numbers, and underscores only
                    </FormDescription>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              {/* Display Name */}
              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Display Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="How you want to be called"
                        className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-emerald-500/50"
                        disabled={saving}
                      />
                    </FormControl>
                    <FormDescription className="text-slate-500">
                      Your public display name (max 50 characters)
                    </FormDescription>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              {/* Avatar URL */}
              <FormField
                control={form.control}
                name="avatar_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Avatar URL
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="url"
                        placeholder="https://example.com/avatar.jpg"
                        className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-emerald-500/50"
                        disabled={saving}
                      />
                    </FormControl>
                    <FormDescription className="text-slate-500">
                      Link to your profile picture
                    </FormDescription>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              {/* Location */}
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Location
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="City, Country"
                        className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-emerald-500/50"
                        disabled={saving}
                      />
                    </FormControl>
                    <FormDescription className="text-slate-500">
                      Where you&apos;re based
                    </FormDescription>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              {/* About */}
              <FormField
                control={form.control}
                name="about"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      About
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Tell us about yourself..."
                        className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-emerald-500/50 min-h-[120px] resize-none"
                        disabled={saving}
                      />
                    </FormControl>
                    <FormDescription className="text-slate-500">
                      Brief bio (max 500 characters)
                    </FormDescription>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </div>
          </Card>

          {/* Darts Preferences Card */}
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Target className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Darts Preferences</h2>
                  <p className="text-slate-400 text-sm">Your playing preferences</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                {/* Favorite Format */}
                <FormField
                  control={form.control}
                  name="favorite_format"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Favorite Format
                      </FormLabel>
                      <Select
                        value={field.value || ''}
                        onValueChange={field.onChange}
                        disabled={saving}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white focus:ring-emerald-500/50">
                            <SelectValue placeholder="Select format" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="301" className="text-white focus:bg-slate-700 focus:text-white">
                            301
                          </SelectItem>
                          <SelectItem value="501" className="text-white focus:bg-slate-700 focus:text-white">
                            501
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-slate-500">
                        Preferred game format
                      </FormDescription>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                {/* Playing Since */}
                <FormField
                  control={form.control}
                  name="playing_since"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Playing Since
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder={new Date().getFullYear().toString()}
                          className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-emerald-500/50"
                          disabled={saving}
                          value={field.value || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            field.onChange(val === '' ? undefined : parseInt(val, 10));
                          }}
                          min={1900}
                          max={new Date().getFullYear()}
                        />
                      </FormControl>
                      <FormDescription className="text-slate-500">
                        Year you started playing
                      </FormDescription>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                {/* Preferred Hand */}
                <FormField
                  control={form.control}
                  name="preferred_hand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white flex items-center gap-2">
                        <Hand className="w-4 h-4" />
                        Preferred Hand
                      </FormLabel>
                      <Select
                        value={field.value || ''}
                        onValueChange={field.onChange}
                        disabled={saving}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white focus:ring-emerald-500/50">
                            <SelectValue placeholder="Select hand" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="Left" className="text-white focus:bg-slate-700 focus:text-white">
                            Left
                          </SelectItem>
                          <SelectItem value="Right" className="text-white focus:bg-slate-700 focus:text-white">
                            Right
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-slate-500">
                        Throwing hand
                      </FormDescription>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              type="submit"
              disabled={saving || usernameChecking}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-12"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
            <Link href="/app/profile" className="flex-1 sm:flex-initial">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                className="w-full border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 h-12"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Form>
    </div>
  );
}
