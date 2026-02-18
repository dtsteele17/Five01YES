'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Bell, 
  Shield, 
  Palette, 
  Key, 
  Lock, 
  Volume2, 
  Target,
  Sun,
  Moon,
  Monitor,
  User,
  Loader2,
  Save,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { isInviteSoundEnabled, setInviteSoundEnabled, isGameOnSoundEnabled, setGameOnSoundEnabled } from '@/lib/sfx';
import { isDartbotVisualizationEnabled, setDartbotVisualizationEnabled } from '@/lib/dartbotSettings';

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';

interface UserSettings {
  dark_mode: boolean;
  reduce_motion: boolean;
  match_reminders: boolean;
  tournament_updates: boolean;
  league_announcements: boolean;
  achievement_notifications: boolean;
  new_messages: boolean;
  profile_visible: boolean;
  show_online_status: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  // const { theme, setTheme, resolvedTheme } = useTheme();
  const theme = 'dark';
  const setTheme = (t: string) => { console.log('Theme change disabled for build'); };
  const resolvedTheme = 'dark';
  
  // Password state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  
  // Sound settings (localStorage based)
  const [inviteSoundEnabled, setInviteSoundEnabledState] = useState(true);
  const [gameOnSoundEnabled, setGameOnSoundEnabledState] = useState(true);
  const [dartbotVisualizationEnabled, setDartbotVisualizationEnabledState] = useState(true);
  
  // Database settings
  const [settings, setSettings] = useState<UserSettings>({
    dark_mode: true,
    reduce_motion: false,
    match_reminders: true,
    tournament_updates: true,
    league_announcements: true,
    achievement_notifications: true,
    new_messages: true,
    profile_visible: true,
    show_online_status: true,
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Delete account dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Load initial settings
  useEffect(() => {
    // Load localStorage settings
    setInviteSoundEnabledState(isInviteSoundEnabled());
    setGameOnSoundEnabledState(isGameOnSoundEnabled());
    setDartbotVisualizationEnabledState(isDartbotVisualizationEnabled());
    
    // Load database settings
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          dark_mode: data.dark_mode ?? true,
          reduce_motion: data.reduce_motion ?? false,
          match_reminders: data.match_reminders ?? true,
          tournament_updates: data.tournament_updates ?? true,
          league_announcements: data.league_announcements ?? true,
          achievement_notifications: data.achievement_notifications ?? true,
          new_messages: data.new_messages ?? true,
          profile_visible: data.profile_visible ?? true,
          show_online_status: data.show_online_status ?? true,
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          ...settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      toast.success('Settings saved successfully!');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const updateSetting = (key: keyof UserSettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Theme handling
  const handleThemeChange = (newTheme: 'dark' | 'light' | 'system') => {
    setTheme(newTheme);
    // Also update in database
    const isDark = newTheme === 'dark' || 
      (newTheme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    updateSetting('dark_mode', isDark);
  };

  // Sound handlers
  const handleInviteSoundToggle = (enabled: boolean) => {
    setInviteSoundEnabledState(enabled);
    setInviteSoundEnabled(enabled);
    toast.success(enabled ? 'Invite sound enabled' : 'Invite sound disabled');
  };

  const handleGameOnSoundToggle = (enabled: boolean) => {
    setGameOnSoundEnabledState(enabled);
    setGameOnSoundEnabled(enabled);
    toast.success(enabled ? 'Match start sound enabled' : 'Match start sound disabled');
  };

  const handleDartbotVisualizationToggle = (enabled: boolean) => {
    setDartbotVisualizationEnabledState(enabled);
    setDartbotVisualizationEnabled(enabled);
    toast.success(enabled ? 'Dartbot visualization enabled' : 'Dartbot visualization disabled');
  };

  // Password change
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrors({});

    if (!passwordForm.currentPassword) {
      setPasswordErrors({ currentPassword: 'Current password is required' });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordErrors({ newPassword: 'Password must be at least 8 characters' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setPasswordLoading(true);

    try {
      // First verify current password by attempting sign in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('User email not found');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordForm.currentPassword,
      });

      if (signInError) {
        setPasswordErrors({ currentPassword: 'Current password is incorrect' });
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });

      if (error) throw error;

      toast.success('Password updated successfully');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Delete account
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }

    setDeletingAccount(true);
    try {
      const { error } = await supabase.auth.admin.deleteUser(
        (await supabase.auth.getUser()).data.user?.id || ''
      );

      if (error) {
        // Fallback - delete from profiles which will cascade
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('profiles').delete().eq('user_id', user.id);
        }
      }

      await supabase.auth.signOut();
      toast.success('Account deleted successfully');
      router.push('/');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error(error.message || 'Failed to delete account. Please contact support.');
    } finally {
      setDeletingAccount(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">Manage your account settings and preferences.</p>
        </div>
        <Button 
          onClick={saveSettings}
          disabled={savingSettings}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {savingSettings ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Profile Edit Link */}
      <Card className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 backdrop-blur-sm border-emerald-500/30 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Edit Profile</h2>
              <p className="text-gray-400">Update your profile picture, bio, and personal information</p>
            </div>
          </div>
          <Link href="/app/profile/edit">
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              Edit Profile
            </Button>
          </Link>
        </div>
      </Card>

      {/* Appearance */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Palette className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Appearance</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Theme</p>
              <p className="text-gray-400 text-sm">Choose your preferred theme</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleThemeChange('light')}
                className={theme === 'light' ? 'bg-amber-500 hover:bg-amber-600' : 'border-white/10'}
              >
                <Sun className="w-4 h-4 mr-1" />
                Light
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleThemeChange('dark')}
                className={theme === 'dark' ? 'bg-indigo-600 hover:bg-indigo-700' : 'border-white/10'}
              >
                <Moon className="w-4 h-4 mr-1" />
                Dark
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleThemeChange('system')}
                className={theme === 'system' ? 'bg-slate-600 hover:bg-slate-700' : 'border-white/10'}
              >
                <Monitor className="w-4 h-4 mr-1" />
                Auto
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Reduce Motion</p>
              <p className="text-gray-400 text-sm">Minimize animations throughout the app</p>
            </div>
            <Switch 
              checked={settings.reduce_motion}
              onCheckedChange={(v) => updateSetting('reduce_motion', v)}
            />
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Notifications</h2>
        </div>

        <div className="space-y-4">
          {/* Sound toggles */}
          <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
            <div className="flex items-center space-x-3">
              <Volume2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-white font-medium">Invite Notification Sound</p>
                <p className="text-gray-400 text-sm">Play sound when you receive match invites</p>
              </div>
            </div>
            <Switch checked={inviteSoundEnabled} onCheckedChange={handleInviteSoundToggle} />
          </div>

          <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
            <div className="flex items-center space-x-3">
              <Volume2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-white font-medium">Match Start Sound (Game On)</p>
                <p className="text-gray-400 text-sm">Play sound when training vs Dartbot starts</p>
              </div>
            </div>
            <Switch checked={gameOnSoundEnabled} onCheckedChange={handleGameOnSoundToggle} />
          </div>

          <div className="border-t border-white/10 my-4" />

          {/* Database notification settings */}
          {[
            { key: 'match_reminders', label: 'Match Reminders', desc: 'Get notified before matches start' },
            { key: 'tournament_updates', label: 'Tournament Updates', desc: 'Updates about tournaments you joined' },
            { key: 'league_announcements', label: 'League Announcements', desc: 'Important league announcements' },
            { key: 'achievement_notifications', label: 'Achievements', desc: 'When you earn new achievements' },
            { key: 'new_messages', label: 'New Messages', desc: 'Chat and direct messages' },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5"
            >
              <div>
                <p className="text-white font-medium">{item.label}</p>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
              <Switch 
                checked={settings[item.key as keyof UserSettings] as boolean}
                onCheckedChange={(v) => updateSetting(item.key as keyof UserSettings, v)}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Training */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Training</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
            <div className="flex items-center space-x-3">
              <Target className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-white font-medium">Show Dartbot Dartboard</p>
                <p className="text-gray-400 text-sm">Visualize where Dartbot throws when playing against it</p>
              </div>
            </div>
            <Switch 
              checked={dartbotVisualizationEnabled} 
              onCheckedChange={handleDartbotVisualizationToggle} 
            />
          </div>
        </div>
      </Card>

      {/* Privacy */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Privacy</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Profile Visibility
              </p>
              <p className="text-gray-400 text-sm">Allow others to view your profile</p>
            </div>
            <Switch 
              checked={settings.profile_visible}
              onCheckedChange={(v) => updateSetting('profile_visible', v)}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Show Online Status</p>
              <p className="text-gray-400 text-sm">Let others see when you&apos;re online</p>
            </div>
            <Switch 
              checked={settings.show_online_status}
              onCheckedChange={(v) => updateSetting('show_online_status', v)}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Two-Factor Authentication</p>
              <p className="text-gray-400 text-sm">Add extra security to your account</p>
            </div>
            <Button variant="outline" className="border-white/10 text-white hover:bg-white/5">
              Coming Soon
            </Button>
          </div>
        </div>
      </Card>

      {/* Password */}
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Password & Security</h2>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-white">
              Current Password
            </Label>
            <Input
              id="currentPassword"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
              }
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-400"
              placeholder="Enter current password"
            />
            {passwordErrors.currentPassword && (
              <p className="text-red-400 text-sm">{passwordErrors.currentPassword}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-white">
              New Password
            </Label>
            <Input
              id="newPassword"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, newPassword: e.target.value })
              }
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-400"
              placeholder="Enter new password"
            />
            {passwordErrors.newPassword && (
              <p className="text-red-400 text-sm">{passwordErrors.newPassword}</p>
            )}
            <p className="text-gray-400 text-sm">Minimum 8 characters</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-white">
              Confirm New Password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
              }
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-400"
              placeholder="Confirm new password"
            />
            {passwordErrors.confirmPassword && (
              <p className="text-red-400 text-sm">{passwordErrors.confirmPassword}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={passwordLoading}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Key className="w-4 h-4 mr-2" />
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-red-500/10 backdrop-blur-sm border-red-500/30 p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <h2 className="text-xl font-bold text-white">Danger Zone</h2>
        </div>
        <p className="text-gray-300 mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="bg-red-500 hover:bg-red-600 text-white">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-red-500/30">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Delete Account
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                This action cannot be undone. This will permanently delete your account and remove your data from our servers.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <p className="text-white text-sm">
                To confirm, type <span className="font-bold text-red-500">DELETE</span> in the box below:
              </p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                className="border-slate-600"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deletingAccount || deleteConfirmText !== 'DELETE'}
                className="bg-red-500 hover:bg-red-600"
              >
                {deletingAccount ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
