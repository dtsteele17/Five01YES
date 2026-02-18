'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Camera, 
  Loader2, 
  Save, 
  ArrowLeft, 
  User, 
  MapPin, 
  Link as LinkIcon,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Profile {
  user_id: string;
  username: string;
  display_name?: string;
  bio?: string;
  location?: string;
  website?: string;
  avatar_url?: string;
}

export default function EditProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({
    display_name: '',
    bio: '',
    location: '',
    website: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);
        setFormData({
          display_name: data.display_name || '',
          bio: data.bio || '',
          location: data.location || '',
          website: data.website || '',
        });
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploadingImage(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          avatar_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : null);
      toast.success('Profile picture updated!');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Validate bio length
      if (formData.bio && formData.bio.length > 400) {
        toast.error('Bio must be less than 400 characters');
        return;
      }

      // Validate website URL
      let website = formData.website;
      if (website && !website.startsWith('http://') && !website.startsWith('https://')) {
        website = 'https://' + website;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: formData.display_name || null,
          bio: formData.bio || null,
          location: formData.location || null,
          website: website || null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Profile updated successfully!');
      router.push('/app/profile');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error(error.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="h-96 bg-slate-800/50 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/app/profile">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white">Edit Profile</h1>
          <p className="text-slate-400">Customize your profile information</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile Picture */}
        <Card className="bg-slate-800/40 border-slate-700/50 p-6">
          <h2 className="text-lg font-bold text-white mb-4">Profile Picture</h2>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="w-24 h-24 rounded-2xl border-4 border-slate-700">
                <AvatarImage 
                  src={profile?.avatar_url} 
                  alt={profile?.display_name || profile?.username}
                  className="object-cover"
                />
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-3xl font-black">
                  {profile?.display_name?.charAt(0) || profile?.username?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={handleImageClick}
                disabled={uploadingImage}
                className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 hover:bg-emerald-600 rounded-full border-4 border-slate-800 flex items-center justify-center transition-colors disabled:opacity-50"
              >
                {uploadingImage ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
            <div>
              <p className="text-white font-medium">Upload a new photo</p>
              <p className="text-slate-400 text-sm">JPG, PNG or GIF. Max 5MB.</p>
            </div>
          </div>
        </Card>

        {/* Basic Info */}
        <Card className="bg-slate-800/40 border-slate-700/50 p-6">
          <h2 className="text-lg font-bold text-white mb-4">Basic Information</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="display_name" className="text-white flex items-center gap-2">
                <User className="w-4 h-4" />
                Display Name
              </Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="How you want to be called"
                className="mt-2 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
                maxLength={50}
              />
            </div>

            <div>
              <Label htmlFor="bio" className="text-white">
                Bio
              </Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Tell us about yourself..."
                className="mt-2 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 min-h-[100px]"
                maxLength={400}
              />
              <p className="text-slate-500 text-sm mt-1">
                {formData.bio?.length || 0}/400 characters
              </p>
            </div>
          </div>
        </Card>

        {/* Location & Website */}
        <Card className="bg-slate-800/40 border-slate-700/50 p-6">
          <h2 className="text-lg font-bold text-white mb-4">Location & Links</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="location" className="text-white flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Location
              </Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="City, Country"
                className="mt-2 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
                maxLength={100}
              />
            </div>

            <div>
              <Label htmlFor="website" className="text-white flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                Website
              </Label>
              <Input
                id="website"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="yourwebsite.com"
                className="mt-2 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
        </Card>

        {/* Username (read-only) */}
        <Card className="bg-slate-800/40 border-slate-700/50 p-6">
          <h2 className="text-lg font-bold text-white mb-4">Username</h2>
          <div>
            <Label className="text-white">Your unique username</Label>
            <div className="mt-2 flex items-center gap-2 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
              <span className="text-slate-400">@</span>
              <span className="text-white">{profile?.username}</span>
              <Check className="w-4 h-4 text-emerald-500 ml-auto" />
            </div>
            <p className="text-slate-500 text-sm mt-2">
              Usernames cannot be changed.
            </p>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Link href="/app/profile" className="flex-1">
            <Button 
              type="button"
              variant="outline" 
              className="w-full border-slate-600 text-slate-300 hover:text-white"
            >
              Cancel
            </Button>
          </Link>
          <Button 
            type="submit"
            disabled={saving}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
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
        </div>
      </form>
    </div>
  );
}
