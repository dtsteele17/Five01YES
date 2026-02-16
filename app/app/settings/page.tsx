'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Bell, Shield, Palette, Key, Lock, Volume2, Target, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { isInviteSoundEnabled, setInviteSoundEnabled, isGameOnSoundEnabled, setGameOnSoundEnabled } from '@/lib/sfx';
import { isDartbotVisualizationEnabled, setDartbotVisualizationEnabled } from '@/lib/dartbotSettings';
import { useNotificationSettings, useAppearanceSettings, usePrivacySettings, useAccountDeletion } from '@/lib/settings/useSettings';

export default function SettingsPage() {
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
  const [inviteSoundEnabled, setInviteSoundEnabledState] = useState(true);
  const [gameOnSoundEnabled, setGameOnSoundEnabledState] = useState(true);
  const [dartbotVisualizationEnabled, setDartbotVisualizationEnabledState] = useState(true);

  // Custom hooks for settings
  const {
    matchReminders,
    tournamentUpdates,
    leagueAnnouncements,
    achievementUnlocked,
    newMessages,
    toggleMatchReminders,
    toggleTournamentUpdates,
    toggleLeagueAnnouncements,
    toggleAchievementUnlocked,
    toggleNewMessages,
  } = useNotificationSettings();

  const {
    darkMode,
    reduceMotion,
    toggleDarkMode,
    toggleReduceMotion,
  } = useAppearanceSettings();

  const {
    profileVisibility,
    showOnlineStatus,
    isSaving: isSavingPrivacy,
    toggleProfileVisibility,
    toggleShowOnlineStatus,
  } = usePrivacySettings();

  const { isDeleting, deleteAccount } = useAccountDeletion();

  // Dialog states
  const [is2FADialogOpen, setIs2FADialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    setInviteSoundEnabledState(isInviteSoundEnabled());
    setGameOnSoundEnabledState(isGameOnSoundEnabled());
    setDartbotVisualizationEnabledState(isDartbotVisualizationEnabled());
  }, []);

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

  const handleNotificationToggle = async (
    enabled: boolean,
    toggleFn: (enabled: boolean) => void,
    label: string
  ) => {
    toggleFn(enabled);
    toast.success(`${label} ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handlePrivacyToggle = async (
    enabled: boolean,
    toggleFn: (enabled: boolean) => Promise<boolean>,
    label: string
  ) => {
    const success = await toggleFn(enabled);
    if (success) {
      toast.success(`${label} ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      toast.error(`Failed to update ${label.toLowerCase()}`);
    }
  };

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
      const supabase = createClient();
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

  const handleDeleteAccount = async () => {
    setDeletePasswordError('');
    
    if (!deletePassword) {
      setDeletePasswordError('Please enter your password');
      return;
    }

    setIsConfirmingDelete(true);
    
    try {
      const success = await deleteAccount(deletePassword);
      if (success) {
        toast.success('Account deleted successfully');
        // Redirect will happen automatically after sign out
        window.location.href = '/';
      } else {
        setDeletePasswordError('Invalid password or failed to delete account');
      }
    } catch (error: any) {
      setDeletePasswordError(error.message || 'Failed to delete account');
    } finally {
      setIsConfirmingDelete(false);
    }
  };

  const openDeleteDialog = () => {
    setDeletePassword('');
    setDeletePasswordError('');
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-white mb-2">Settings</h1>
        <p className="text-gray-400">Manage your account settings and preferences.</p>
      </div>

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
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50"
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
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50"
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
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50"
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

      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Notifications</h2>
        </div>

        <div className="space-y-4">
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

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Match reminders</p>
              <p className="text-gray-400 text-sm">Get notified before matches start</p>
            </div>
            <Switch 
              checked={matchReminders} 
              onCheckedChange={(enabled) => handleNotificationToggle(enabled, toggleMatchReminders, 'Match reminders')} 
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Tournament updates</p>
              <p className="text-gray-400 text-sm">Updates about tournaments you joined</p>
            </div>
            <Switch 
              checked={tournamentUpdates} 
              onCheckedChange={(enabled) => handleNotificationToggle(enabled, toggleTournamentUpdates, 'Tournament updates')} 
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">League announcements</p>
              <p className="text-gray-400 text-sm">Important league announcements</p>
            </div>
            <Switch 
              checked={leagueAnnouncements} 
              onCheckedChange={(enabled) => handleNotificationToggle(enabled, toggleLeagueAnnouncements, 'League announcements')} 
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Achievement unlocked</p>
              <p className="text-gray-400 text-sm">When you earn new achievements</p>
            </div>
            <Switch 
              checked={achievementUnlocked} 
              onCheckedChange={(enabled) => handleNotificationToggle(enabled, toggleAchievementUnlocked, 'Achievement unlocked')} 
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">New messages</p>
              <p className="text-gray-400 text-sm">Chat and direct messages</p>
            </div>
            <Switch 
              checked={newMessages} 
              onCheckedChange={(enabled) => handleNotificationToggle(enabled, toggleNewMessages, 'New messages')} 
            />
          </div>
        </div>
      </Card>

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
              <p className="text-white font-medium">Dark Mode</p>
              <p className="text-gray-400 text-sm">Use dark theme</p>
            </div>
            <Switch 
              checked={darkMode} 
              onCheckedChange={toggleDarkMode}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Reduce Motion</p>
              <p className="text-gray-400 text-sm">Minimize animations</p>
            </div>
            <Switch 
              checked={reduceMotion} 
              onCheckedChange={toggleReduceMotion}
            />
          </div>
        </div>
      </Card>

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
            <Switch checked={dartbotVisualizationEnabled} onCheckedChange={handleDartbotVisualizationToggle} />
          </div>
        </div>
      </Card>

      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Privacy & Security</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Profile Visibility</p>
              <p className="text-gray-400 text-sm">Show profile to everyone</p>
            </div>
            <Switch 
              checked={profileVisibility} 
              onCheckedChange={(enabled) => handlePrivacyToggle(enabled, toggleProfileVisibility, 'Profile visibility')}
              disabled={isSavingPrivacy}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Show Online Status</p>
              <p className="text-gray-400 text-sm">Let others see when you're online</p>
            </div>
            <Switch 
              checked={showOnlineStatus} 
              onCheckedChange={(enabled) => handlePrivacyToggle(enabled, toggleShowOnlineStatus, 'Online status')}
              disabled={isSavingPrivacy}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Two-Factor Authentication</p>
              <p className="text-gray-400 text-sm">Add extra security to your account</p>
            </div>
            <Button 
              variant="outline" 
              className="border-white/10 text-white hover:bg-white/5"
              onClick={() => setIs2FADialogOpen(true)}
            >
              Enable
            </Button>
          </div>
        </div>
      </Card>

      <Card className="bg-red-500/10 backdrop-blur-sm border-red-500/30 p-6">
        <h2 className="text-xl font-bold text-white mb-2">Danger Zone</h2>
        <p className="text-gray-300 mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <Button 
          variant="destructive" 
          className="bg-red-500 hover:bg-red-600 text-white"
          onClick={openDeleteDialog}
        >
          Delete Account
        </Button>
      </Card>

      {/* 2FA Coming Soon Dialog */}
      <Dialog open={is2FADialogOpen} onOpenChange={setIs2FADialogOpen}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              Two-Factor Authentication
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              We're working hard to bring you enhanced security features.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
              <p className="text-emerald-400 font-medium mb-2">Coming Soon!</p>
              <p className="text-gray-300 text-sm">
                Two-factor authentication will be available in a future update. 
                You'll be able to secure your account with authenticator apps like Google Authenticator or Authy.
              </p>
            </div>
          </div>
          <Button 
            onClick={() => setIs2FADialogOpen(false)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white w-full"
          >
            Got it
          </Button>
        </DialogContent>
      </Dialog>

      {/* Account Deletion Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-900 border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm font-medium mb-2">Warning:</p>
              <ul className="text-gray-300 text-sm list-disc list-inside space-y-1">
                <li>All your match history will be deleted</li>
                <li>Your achievements and stats will be lost</li>
                <li>You will be removed from all leagues and tournaments</li>
                <li>This action is irreversible</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deletePassword" className="text-white">
                Enter your password to confirm
              </Label>
              <Input
                id="deletePassword"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-red-500/50"
                placeholder="Your current password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleDeleteAccount();
                  }
                }}
              />
              {deletePasswordError && (
                <p className="text-red-400 text-sm">{deletePasswordError}</p>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel 
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteAccount();
              }}
              disabled={isConfirmingDelete || isDeleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isConfirmingDelete || isDeleting ? 'Deleting...' : 'Delete Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
