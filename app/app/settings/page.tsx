'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bell, Shield, Palette, Key, Lock, Volume2, Target, User, Camera, Save, Loader2, AlertTriangle, ChevronLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { isInviteSoundEnabled, setInviteSoundEnabled, isGameOnSoundEnabled, setGameOnSoundEnabled } from '@/lib/sfx';
import { isDartbotVisualizationEnabled, setDartbotVisualizationEnabled } from '@/lib/dartbotSettings';
import Link from 'next/link';

interface ProfileData {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  username_changed_at: string | null;
  last_display_name_change: string | null;
}

// Settings stored in localStorage
interface LocalSettings {
  notifications_match_reminders: boolean;
  notifications_tournament_updates: boolean;
  notifications_league_announcements: boolean;
  notifications_achievements: boolean;
  notifications_messages: boolean;
  privacy_profile_visible: boolean;
  privacy_show_online: boolean;
  appearance_reduce_motion: boolean;
}

const DEFAULT_SETTINGS: LocalSettings = {
  notifications_match_reminders: true,
  notifications_tournament_updates: true,
  notifications_league_announcements: true,
  notifications_achievements: true,
  notifications_messages: true,
  privacy_profile_visible: true,
  privacy_show_online: true,
  appearance_reduce_motion: false,
};

function loadLocalSettings(): LocalSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem('five01_settings');
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveLocalSettings(settings: LocalSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('five01_settings', JSON.stringify(settings));
}

export default function SettingsPage() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Profile state
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Profile form
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });

  // Username change tracking
  const [canChangeUsername, setCanChangeUsername] = useState(true);
  const [usernameNextChangeDate, setUsernameNextChangeDate] = useState<string | null>(null);
  const [canChangeDisplayName, setCanChangeDisplayName] = useState(true);
  const [displayNameNextChangeDate, setDisplayNameNextChangeDate] = useState<string | null>(null);

  // Password state
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  // Sound settings
  const [inviteSoundOn, setInviteSoundOn] = useState(true);
  const [gameOnSoundOn, setGameOnSoundOn] = useState(true);
  const [dartbotVizOn, setDartbotVizOn] = useState(true);

  // Local settings (notifications, privacy, appearance)
  const [localSettings, setLocalSettings] = useState<LocalSettings>(DEFAULT_SETTINGS);

  const loadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, bio, location, avatar_url, username_changed_at, last_display_name_change')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[Settings] Error loading profile:', error);
        return;
      }

      if (data) {
        setProfile(data);
        setUsername(data.username || '');
        setDisplayName(data.display_name || '');
        setBio(data.bio || '');
        setLocation(data.location || '');
        setAvatarPreview(data.avatar_url);

        if (data.username_changed_at) {
          const lastChange = new Date(data.username_changed_at);
          const nextAllowed = new Date(lastChange.getTime() + 30 * 24 * 60 * 60 * 1000);
          if (new Date() < nextAllowed) {
            setCanChangeUsername(false);
            setUsernameNextChangeDate(nextAllowed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
          }
        }

        if (data.last_display_name_change) {
          const lastChange = new Date(data.last_display_name_change);
          const nextAllowed = new Date(lastChange.getTime() + 30 * 24 * 60 * 60 * 1000);
          if (new Date() < nextAllowed) {
            setCanChangeDisplayName(false);
            setDisplayNameNextChangeDate(nextAllowed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
          }
        }
      }
    } catch (err) {
      console.error('[Settings] Error:', err);
    } finally {
      setProfileLoading(false);
    }
  }, [supabase]);

  const clampCropOffset = (zoomValue: number, nextOffset: { x: number; y: number }) => {
    if (!cropImage) return { x: 0, y: 0 };
    const canvasSize = 320;
    const baseScale = Math.max(canvasSize / cropImage.width, canvasSize / cropImage.height);
    const drawW = cropImage.width * baseScale * zoomValue;
    const drawH = cropImage.height * baseScale * zoomValue;
    const maxX = Math.max(0, (drawW - canvasSize) / 2);
    const maxY = Math.max(0, (drawH - canvasSize) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextOffset.x)),
      y: Math.min(maxY, Math.max(-maxY, nextOffset.y)),
    };
  };

  useEffect(() => {
    loadProfile();
    setInviteSoundOn(isInviteSoundEnabled());
    setGameOnSoundOn(isGameOnSoundEnabled());
    setDartbotVizOn(isDartbotVisualizationEnabled());
    setLocalSettings(loadLocalSettings());
  }, [loadProfile]);

  useEffect(() => {
    const canvas = cropCanvasRef.current;
    if (!canvas || !cropImage || !cropModalOpen) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasSize = 320;
    canvas.width = canvasSize;
    canvas.height = canvasSize;

    const baseScale = Math.max(canvasSize / cropImage.width, canvasSize / cropImage.height);
    const scale = baseScale * cropZoom;
    const drawW = cropImage.width * scale;
    const drawH = cropImage.height * scale;
    const x = (canvasSize - drawW) / 2 + cropOffset.x;
    const y = (canvasSize - drawH) / 2 + cropOffset.y;

    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.drawImage(cropImage, x, y, drawW, drawH);
  }, [cropImage, cropZoom, cropOffset, cropModalOpen]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        setCropImage(image);
        setCropImageUrl(reader.result as string);
        setCropZoom(1);
        setCropOffset({ x: 0, y: 0 });
        setCropModalOpen(true);
      };
      image.onerror = () => toast.error('Failed to load selected image');
      image.src = reader.result as string;
    };
    reader.onerror = () => toast.error('Failed to read selected file');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragPointerIdRef.current = event.pointerId;
    dragStartRef.current = { x: event.clientX - cropOffset.x, y: event.clientY - cropOffset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragPointerIdRef.current !== event.pointerId || !dragStartRef.current) return;
    const candidate = {
      x: event.clientX - dragStartRef.current.x,
      y: event.clientY - dragStartRef.current.y,
    };
    setCropOffset(clampCropOffset(cropZoom, candidate));
  };

  const handleCropPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragPointerIdRef.current === event.pointerId) {
      dragPointerIdRef.current = null;
      dragStartRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleConfirmCrop = async () => {
    if (!cropImage) return;
    setAvatarUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const outputSize = 512;
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = outputSize;
      outputCanvas.height = outputSize;
      const ctx = outputCanvas.getContext('2d');
      if (!ctx) throw new Error('Failed to initialize image cropper');

      const baseScale = Math.max(outputSize / cropImage.width, outputSize / cropImage.height);
      const scale = baseScale * cropZoom;
      const drawW = cropImage.width * scale;
      const drawH = cropImage.height * scale;
      const x = (outputSize - drawW) / 2 + cropOffset.x * (outputSize / 320);
      const y = (outputSize - drawH) / 2 + cropOffset.y * (outputSize / 320);
      ctx.drawImage(cropImage, x, y, drawW, drawH);

      const blob = await new Promise<Blob | null>((resolve) => outputCanvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Failed to process cropped image');

      const filePath = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { upsert: true, contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      setAvatarPreview(publicUrl);
      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      setCropModalOpen(false);
      setCropImageUrl(null);
      setCropImage(null);
      toast.success('Profile picture updated!');
    } catch (err: any) {
      console.error('[Settings] Avatar upload error:', err);
      toast.error(err.message || 'Failed to upload avatar');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const updates: Record<string, any> = {
        bio: bio || null,
        location: location || null,
      };

      if (displayName !== (profile?.display_name || '')) {
        if (!canChangeDisplayName) {
          toast.error(`Display name can only be changed once per month. Next change available: ${displayNameNextChangeDate}`);
          setProfileSaving(false);
          return;
        }
        updates.display_name = displayName || null;
        updates.last_display_name_change = new Date().toISOString();
      }

      // Handle username change
      if (username !== profile?.username) {
        if (!canChangeUsername) {
          toast.error(`Username can only be changed once per month. Next change available: ${usernameNextChangeDate}`);
          setProfileSaving(false);
          return;
        }
        if (username.length < 3) {
          toast.error('Username must be at least 3 characters');
          setProfileSaving(false);
          return;
        }
        if (username.length > 20) {
          toast.error('Username must be 20 characters or less');
          setProfileSaving(false);
          return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
          toast.error('Username can only contain letters, numbers, underscores and hyphens');
          setProfileSaving(false);
          return;
        }

        // Check if username is taken
        const { data: existing } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('username', username)
          .neq('user_id', user.id)
          .maybeSingle();

        if (existing) {
          toast.error('Username is already taken');
          setProfileSaving(false);
          return;
        }

        updates.username = username;
        updates.username_changed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (error) throw error;

      // Update local state
      if (updates.username) {
        setCanChangeUsername(false);
        const nextDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        setUsernameNextChangeDate(nextDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
      }
      if (updates.last_display_name_change) {
        setCanChangeDisplayName(false);
        const nextDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        setDisplayNameNextChangeDate(nextDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
      }
      setProfile(prev => prev ? { ...prev, ...updates } : prev);
      toast.success('Profile updated!');
    } catch (err: any) {
      console.error('[Settings] Save error:', err);
      toast.error(err.message || 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrors({});
    if (!passwordForm.currentPassword) { setPasswordErrors({ currentPassword: 'Required' }); return; }
    if (passwordForm.newPassword.length < 8) { setPasswordErrors({ newPassword: 'Minimum 8 characters' }); return; }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { setPasswordErrors({ confirmPassword: 'Passwords do not match' }); return; }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (error) throw error;
      toast.success('Password updated');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const updateLocalSetting = (key: keyof LocalSettings, value: boolean) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    saveLocalSettings(updated);
    toast.success('Setting saved');
  };

  if (profileLoading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12 max-sm:px-1">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/app/profile" className="text-slate-400 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-gray-400">Manage your profile, account, and preferences.</p>
        </div>
      </div>

      {/* ═══════════════ PROFILE ═══════════════ */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Edit Profile</h2>
        </div>

        <div className="space-y-6">
          {/* Avatar Upload */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <Avatar className="w-24 h-24 rounded-2xl border-4 border-slate-700">
                {avatarPreview ? (
                  <AvatarImage src={avatarPreview} alt="Avatar" />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-3xl font-black rounded-2xl">
                  {displayName?.charAt(0) || username?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {avatarUploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div>
              <p className="text-white font-medium">Profile Picture</p>
              <p className="text-slate-400 text-sm">Click to upload. Max 2MB. JPG, PNG, WebP or GIF.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 border-white/10 text-slate-300 hover:text-white"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
              >
                {avatarUploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Camera className="w-3 h-3 mr-1" />}
                Upload Photo
              </Button>
            </div>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label className="text-white">Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              disabled={!canChangeUsername}
              className="bg-white/5 border-white/10 text-white"
              placeholder="username"
              maxLength={20}
            />
            {!canChangeUsername && (
              <p className="text-amber-400 text-xs flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Username can be changed again on {usernameNextChangeDate}
              </p>
            )}
            <p className="text-slate-500 text-xs">3-20 characters. Letters, numbers, underscores, hyphens. One change per month.</p>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label className="text-white">Display Name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={!canChangeDisplayName}
              className="bg-white/5 border-white/10 text-white"
              placeholder="Your display name"
              maxLength={30}
            />
            <p className="text-amber-400 text-xs">You can only change your display name once per month</p>
            {!canChangeDisplayName && (
              <p className="text-amber-400 text-xs flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Display name can be changed again on {displayNameNextChangeDate}
              </p>
            )}
            <p className="text-slate-500 text-xs">Shown on your profile and in matches.</p>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label className="text-white">Bio</Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="bg-white/5 border-white/10 text-white resize-none"
              placeholder="Tell others about yourself..."
              maxLength={200}
              rows={3}
            />
            <p className="text-slate-500 text-xs">{bio.length}/200</p>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label className="text-white">Location</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
              placeholder="e.g. London, UK"
              maxLength={50}
            />
          </div>

          <Button
            onClick={handleSaveProfile}
            disabled={profileSaving}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {profileSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {profileSaving ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </Card>

      {/* ═══════════════ PASSWORD ═══════════════ */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Password & Security</h2>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white">Current Password</Label>
            <Input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="bg-white/5 border-white/10 text-white" placeholder="Enter current password" />
            {passwordErrors.currentPassword && <p className="text-red-400 text-sm">{passwordErrors.currentPassword}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-white">New Password</Label>
            <Input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="bg-white/5 border-white/10 text-white" placeholder="Enter new password" />
            {passwordErrors.newPassword && <p className="text-red-400 text-sm">{passwordErrors.newPassword}</p>}
            <p className="text-slate-500 text-xs">Minimum 8 characters</p>
          </div>
          <div className="space-y-2">
            <Label className="text-white">Confirm New Password</Label>
            <Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="bg-white/5 border-white/10 text-white" placeholder="Confirm new password" />
            {passwordErrors.confirmPassword && <p className="text-red-400 text-sm">{passwordErrors.confirmPassword}</p>}
          </div>
          <Button type="submit" disabled={passwordLoading} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            <Key className="w-4 h-4 mr-2" />
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </Card>

      {/* ═══════════════ NOTIFICATIONS ═══════════════ */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Notifications</h2>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
            <div className="flex items-center space-x-3 min-w-0">
              <Volume2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-white font-medium">Invite Notification Sound</p>
                <p className="text-gray-400 text-sm">Play sound when you receive match invites</p>
              </div>
            </div>
            <Switch checked={inviteSoundOn} onCheckedChange={(v) => { setInviteSoundOn(v); setInviteSoundEnabled(v); toast.success(v ? 'Invite sound enabled' : 'Invite sound disabled'); }} />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
            <div className="flex items-center space-x-3 min-w-0">
              <Volume2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-white font-medium">Match Start Sound</p>
                <p className="text-gray-400 text-sm">Play sound when a match begins</p>
              </div>
            </div>
            <Switch checked={gameOnSoundOn} onCheckedChange={(v) => { setGameOnSoundOn(v); setGameOnSoundEnabled(v); toast.success(v ? 'Match start sound enabled' : 'Match start sound disabled'); }} />
          </div>

          {([
            { key: 'notifications_match_reminders' as const, label: 'Match Reminders', desc: 'Get notified before matches start' },
            { key: 'notifications_tournament_updates' as const, label: 'Tournament Updates', desc: 'Updates about tournaments you joined' },
            { key: 'notifications_league_announcements' as const, label: 'League Announcements', desc: 'Important league announcements' },
            { key: 'notifications_achievements' as const, label: 'Achievement Unlocked', desc: 'When you earn new achievements' },
            { key: 'notifications_messages' as const, label: 'New Messages', desc: 'Chat and direct messages' },
          ]).map((item) => (
            <div key={item.key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-white/5 rounded-xl border border-white/5">
              <div>
                <p className="text-white font-medium">{item.label}</p>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
              <Switch checked={localSettings[item.key]} onCheckedChange={(v) => updateLocalSetting(item.key, v)} />
            </div>
          ))}
        </div>
      </Card>

      {/* ═══════════════ TRAINING ═══════════════ */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Training</h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
          <div className="flex items-center space-x-3 min-w-0">
            <Target className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-white font-medium">Show Dartbot Dartboard</p>
              <p className="text-gray-400 text-sm">Visualize where Dartbot throws</p>
            </div>
          </div>
          <Switch checked={dartbotVizOn} onCheckedChange={(v) => { setDartbotVizOn(v); setDartbotVisualizationEnabled(v); toast.success(v ? 'Dartbot visualization enabled' : 'Dartbot visualization disabled'); }} />
        </div>
      </Card>

      {/* ═══════════════ APPEARANCE ═══════════════ */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Palette className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Appearance</h2>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Dark Mode</p>
              <p className="text-gray-400 text-sm">Use dark theme (always on)</p>
            </div>
            <Switch checked={true} disabled />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Reduce Motion</p>
              <p className="text-gray-400 text-sm">Minimize animations</p>
            </div>
            <Switch checked={localSettings.appearance_reduce_motion} onCheckedChange={(v) => updateLocalSetting('appearance_reduce_motion', v)} />
          </div>
        </div>
      </Card>

      {/* ═══════════════ PRIVACY ═══════════════ */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Privacy</h2>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Profile Visibility</p>
              <p className="text-gray-400 text-sm">Show profile to everyone</p>
            </div>
            <Switch checked={localSettings.privacy_profile_visible} onCheckedChange={(v) => updateLocalSetting('privacy_profile_visible', v)} />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Show Online Status</p>
              <p className="text-gray-400 text-sm">Let others see when you&apos;re online</p>
            </div>
            <Switch checked={localSettings.privacy_show_online} onCheckedChange={(v) => updateLocalSetting('privacy_show_online', v)} />
          </div>
        </div>
      </Card>

      {/* ═══════════════ DANGER ZONE ═══════════════ */}
      <Card className="bg-red-500/10 backdrop-blur-sm border-red-500/30 p-4 sm:p-6">
        <h2 className="text-xl font-bold text-white mb-2">Danger Zone</h2>
        <p className="text-gray-300 mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <Button
          variant="destructive"
          className="bg-red-500 hover:bg-red-600 text-white"
          onClick={() => toast.error('Account deletion is not yet available. Contact support.')}
        >
          Delete Account
        </Button>
      </Card>

      <Dialog open={cropModalOpen} onOpenChange={(open) => {
        if (!avatarUploading) {
          setCropModalOpen(open);
          if (!open) {
            setCropImageUrl(null);
            setCropImage(null);
          }
        }
      }}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-[calc(100vw-1.5rem)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Crop Profile Picture</DialogTitle>
            <DialogDescription className="text-slate-400">
              Drag to move and use zoom to fit your image inside the circular frame.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative w-full aspect-square max-w-[320px] mx-auto rounded-xl overflow-hidden touch-none">
              <canvas
                ref={cropCanvasRef}
                className="w-full h-full cursor-grab active:cursor-grabbing select-none"
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerCancel={handleCropPointerUp}
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[80%] h-[80%] rounded-full border-2 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.55)]" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-white">Zoom</Label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={cropZoom}
                onChange={(e) => {
                  const nextZoom = Number(e.target.value);
                  setCropZoom(nextZoom);
                  setCropOffset((prev) => clampCropOffset(nextZoom, prev));
                }}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/10 text-slate-300 hover:text-white"
                onClick={() => {
                  setCropModalOpen(false);
                  setCropImageUrl(null);
                  setCropImage(null);
                }}
                disabled={avatarUploading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={handleConfirmCrop}
                disabled={avatarUploading || !cropImageUrl}
              >
                {avatarUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {avatarUploading ? 'Uploading...' : 'Crop & Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

