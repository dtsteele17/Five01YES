'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProfile, UserProfile } from '@/lib/context/ProfileContext';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export function EditProfileModal({ open, onClose }: EditProfileModalProps) {
  const { profile, updateProfile } = useProfile();
  const [loading, setLoading] = useState(false);
  const [canChangeDisplayName, setCanChangeDisplayName] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    avatar_url: '',
    location: '',
    bio: '',
    favorite_format: '' as '301' | '501' | '',
    playing_since: '',
    preferred_hand: '' as 'Left' | 'Right' | '',
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        username: profile.username || '',
        display_name: profile.display_name || '',
        avatar_url: profile.avatar_url || '',
        location: profile.location || '',
        bio: profile.bio || '',
        favorite_format: profile.favorite_format || '',
        playing_since: profile.playing_since?.toString() || '',
        preferred_hand: profile.preferred_hand || '',
      });

      // Check if display name can be changed (once per month rule)
      if (profile.last_display_name_change) {
        const lastChange = new Date(profile.last_display_name_change);
        const now = new Date();
        const monthsSinceChange = (now.getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24 * 30);
        setCanChangeDisplayName(monthsSinceChange >= 1);
      } else {
        setCanChangeDisplayName(true);
      }
    }
  }, [profile, open]);

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

    // Check if display name changed and if it's allowed
    const displayNameChanged = profile?.display_name !== formData.display_name;
    if (displayNameChanged && !canChangeDisplayName) {
      toast.error('Display name can only be changed once per month');
      return;
    }

    if (formData.bio && formData.bio.length > 400) {
      toast.error('Bio must be 400 characters or less');
      return;
    }

    setLoading(true);

    try {
      const updates: any = {
        username: formData.username,
        display_name: formData.display_name,
        avatar_url: formData.avatar_url || null,
        location: formData.location || null,
        bio: formData.bio || null,
        favorite_format: formData.favorite_format || null,
        playing_since: formData.playing_since ? parseInt(formData.playing_since) : null,
        preferred_hand: formData.preferred_hand || null,
      };

      // If display name changed, update the last change timestamp
      if (displayNameChanged) {
        updates.last_display_name_change = new Date().toISOString();
      }

      await updateProfile(updates);

      toast.success('Profile updated successfully');
      onClose();
    } catch (error: any) {
      if (error.message?.includes('duplicate key')) {
        toast.error('This username is already taken. Please choose another.');
      } else {
        toast.error('Failed to update profile');
        console.error(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1979 }, (_, i) => currentYear - i);

  const getInitials = () => {
    if (!formData.display_name) return 'JD';
    const names = formData.display_name.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return formData.display_name.substring(0, 2).toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Edit Profile</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="w-24 h-24">
                <AvatarImage src={formData.avatar_url} />
                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-2xl">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>

              <div className="w-full space-y-2">
                <Label htmlFor="avatar_url" className="text-gray-300">
                  Profile Picture URL
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
                <p className="text-xs text-gray-400">
                  Enter an image URL or leave empty for default
                </p>
              </div>
            </div>

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
              <p className="text-xs text-gray-400">
                Only letters, numbers, and underscores allowed. Must be unique.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_name" className="text-gray-300 flex items-center gap-2">
                Display Name <span className="text-red-400">*</span>
                {!canChangeDisplayName && (
                  <span className="text-amber-400 text-xs">(Can change once per month)</span>
                )}
              </Label>
              <Input
                id="display_name"
                type="text"
                required
                minLength={2}
                placeholder="Your display name"
                value={formData.display_name}
                onChange={(e) =>
                  setFormData({ ...formData, display_name: e.target.value })
                }
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50"
              />
              {!canChangeDisplayName && (
                <p className="text-xs text-amber-400">
                  You can change your display name again in{' '}
                  {profile?.last_display_name_change ? 
                    Math.ceil(30 - (new Date().getTime() - new Date(profile.last_display_name_change).getTime()) / (1000 * 60 * 60 * 24)) 
                    : 0} days
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location" className="text-gray-300">
                Location
              </Label>
              <Input
                id="location"
                type="text"
                placeholder="New York, USA"
                value={formData.location}
                onChange={(e) =>
                  setFormData({ ...formData, location: e.target.value })
                }
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-gray-300">
                Bio
              </Label>
              <Textarea
                id="bio"
                placeholder="Tell us about yourself and your darts journey..."
                value={formData.bio}
                onChange={(e) =>
                  setFormData({ ...formData, bio: e.target.value })
                }
                maxLength={400}
                rows={4}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50 resize-none"
              />
              <p className="text-xs text-gray-400 text-right">
                {formData.bio.length}/400 characters
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="favorite_format" className="text-gray-300">
                  Favorite Format
                </Label>
                <Select
                  value={formData.favorite_format}
                  onValueChange={(value: '301' | '501') =>
                    setFormData({ ...formData, favorite_format: value })
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-emerald-500/50">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-white/10">
                    <SelectItem value="301" className="text-white hover:bg-white/10">
                      301
                    </SelectItem>
                    <SelectItem value="501" className="text-white hover:bg-white/10">
                      501
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="playing_since" className="text-gray-300">
                  Playing Since
                </Label>
                <Select
                  value={formData.playing_since}
                  onValueChange={(value) =>
                    setFormData({ ...formData, playing_since: value })
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-emerald-500/50">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-white/10 max-h-60">
                    {years.map((year) => (
                      <SelectItem
                        key={year}
                        value={year.toString()}
                        className="text-white hover:bg-white/10"
                      >
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preferred_hand" className="text-gray-300">
                  Preferred Hand
                </Label>
                <Select
                  value={formData.preferred_hand}
                  onValueChange={(value: 'Left' | 'Right') =>
                    setFormData({ ...formData, preferred_hand: value })
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-emerald-500/50">
                    <SelectValue placeholder="Select hand" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-white/10">
                    <SelectItem value="Right" className="text-white hover:bg-white/10">
                      Right
                    </SelectItem>
                    <SelectItem value="Left" className="text-white hover:bg-white/10">
                      Left
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-row justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="border-white/10 text-white hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
