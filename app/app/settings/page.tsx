'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell, Shield, Palette, Key, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

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
          {[
            { label: 'Match reminders', desc: 'Get notified before matches start' },
            { label: 'Tournament updates', desc: 'Updates about tournaments you joined' },
            { label: 'League announcements', desc: 'Important league announcements' },
            { label: 'Achievement unlocked', desc: 'When you earn new achievements' },
            { label: 'New messages', desc: 'Chat and direct messages' },
          ].map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5"
            >
              <div>
                <p className="text-white font-medium">{item.label}</p>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
              <Switch defaultChecked />
            </div>
          ))}
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
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Reduce Motion</p>
              <p className="text-gray-400 text-sm">Minimize animations</p>
            </div>
            <Switch />
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
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Show Online Status</p>
              <p className="text-gray-400 text-sm">Let others see when you're online</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
            <div>
              <p className="text-white font-medium">Two-Factor Authentication</p>
              <p className="text-gray-400 text-sm">Add extra security to your account</p>
            </div>
            <Button variant="outline" className="border-white/10 text-white hover:bg-white/5">
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
        <Button variant="destructive" className="bg-red-500 hover:bg-red-600 text-white">
          Delete Account
        </Button>
      </Card>
    </div>
  );
}
