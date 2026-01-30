'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validateForm = () => {
    const newErrors: any = {};

    if (!formData.username) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const supabase = createClient();

      console.log('[Signup] Starting signup process for:', formData.email);

      // Sign up the user with username in metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            username: formData.username,
            display_name: formData.username,
          },
        },
      });

      if (authError) {
        console.error('[Signup] Auth error details:', {
          message: authError.message,
          status: authError.status,
          name: authError.name,
          fullError: authError,
        });
        toast.error(`Signup failed: ${authError.message} (Status: ${authError.status || 'N/A'})`);
        return;
      }

      if (!authData.user) {
        console.error('[Signup] No user returned from signup');
        toast.error('Signup failed. Please try again.');
        return;
      }

      console.log('[Signup] User created:', authData.user.id);

      // Check if we have an active session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      console.log('[Signup] Session check:', {
        hasSession: !!sessionData.session,
        sessionError: sessionError,
      });

      // If no session, email confirmation is likely required
      if (!sessionData.session) {
        console.log('[Signup] No active session - email confirmation may be required');
        toast.success('Account created! Please check your email to confirm your account.');
        setLoading(false);
        return;
      }

      // Profile is created automatically by trigger
      // Wait a moment for trigger to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify profile was created
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[Signup] Profile verification error:', {
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
          fullError: profileError,
        });
        toast.error(`Profile creation failed: ${profileError.message}`);
        return;
      }

      if (!profile) {
        console.error('[Signup] Profile not found after creation');
        toast.error('Profile was not created. Please contact support.');
        return;
      }

      console.log('[Signup] Profile verified:', profile.username);
      toast.success('Account created successfully! Redirecting...');

      // Force session refresh
      await supabase.auth.refreshSession();

      setTimeout(() => {
        router.push('/app');
        router.refresh();
      }, 500);
    } catch (error: any) {
      console.error('[Signup] Unexpected error:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        fullError: error,
      });
      toast.error(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      toast.error(error.message);
    }
  };

  return (
    <AuthLayout>
      <Card className="p-8 lg:p-10 bg-card/40 backdrop-blur-xl border-border/50 rounded-3xl shadow-2xl">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold font-display text-foreground">Create account</h1>
            <p className="text-muted-foreground">Join the FIVE01 community today</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground font-medium">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="dartmaster"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                className={`h-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                  errors.username ? 'border-destructive' : ''
                }`}
                disabled={loading}
              />
              {errors.username && (
                <p className="text-xs text-destructive mt-1">{errors.username}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className={`h-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                  errors.email ? 'border-destructive' : ''
                }`}
                disabled={loading}
              />
              {errors.email && (
                <p className="text-xs text-destructive mt-1">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  className={`h-12 pr-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                    errors.password ? 'border-destructive' : ''
                  }`}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive mt-1">{errors.password}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground font-medium">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  className={`h-12 pr-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                    errors.confirmPassword ? 'border-destructive' : ''
                  }`}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-destructive mt-1">{errors.confirmPassword}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-card text-muted-foreground">or</span>
            </div>
          </div>

          <GoogleButton onClick={handleGoogleSignup} disabled={loading} />

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-primary hover:text-primary/80 font-semibold transition-colors"
            >
              Log in
            </Link>
          </p>
        </div>
      </Card>
    </AuthLayout>
  );
}
