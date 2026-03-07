'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { 
  Eye, 
  EyeOff, 
  Loader2, 
  XCircle, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  Mail, 
  Lock,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

// Helper function to format Supabase error messages into user-friendly format
function formatSignupError(error: string): { title: string; message: string } {
  const lowerError = error.toLowerCase();
  
  if (lowerError.includes('user already registered') || lowerError.includes('already exists') || lowerError.includes('already registered')) {
    return {
      title: 'Account already exists',
      message: 'An account with this email already exists. Would you like to sign in instead?'
    };
  }
  
  if (lowerError.includes('username') && (lowerError.includes('taken') || lowerError.includes('exists') || lowerError.includes('already'))) {
    return {
      title: 'Username unavailable',
      message: 'This username is already taken. Please choose a different one.'
    };
  }
  
  if (lowerError.includes('weak password') || lowerError.includes('password')) {
    return {
      title: 'Password too weak',
      message: 'Please use a stronger password with at least 6 characters, including a mix of letters and numbers.'
    };
  }
  
  if (lowerError.includes('invalid email')) {
    return {
      title: 'Invalid email address',
      message: 'Please enter a valid email address (e.g., name@example.com).'
    };
  }
  
  if (lowerError.includes('rate limit') || lowerError.includes('too many requests')) {
    return {
      title: 'Too many attempts',
      message: 'For security reasons, please wait a few minutes before trying again.'
    };
  }
  
  if (lowerError.includes('network') || lowerError.includes('fetch') || lowerError.includes('connection')) {
    return {
      title: 'Connection problem',
      message: 'Please check your internet connection and try again.'
    };
  }
  
  // Default error
  return {
    title: 'Signup failed',
    message: error || 'An unexpected error occurred. Please try again.'
  };
}

// Password strength indicator
function PasswordStrengthIndicator({ password }: { password: string }) {
  const checks = [
    { label: 'At least 6 characters', met: password.length >= 6 },
    { label: 'Contains a number', met: /\d/.test(password) },
    { label: 'Contains a letter', met: /[a-zA-Z]/.test(password) },
  ];
  
  const strength = checks.filter(c => c.met).length;
  
  const getColor = () => {
    if (strength === 0) return 'bg-gray-700';
    if (strength === 1) return 'bg-red-500';
    if (strength === 2) return 'bg-yellow-500';
    return 'bg-green-500';
  };
  
  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <div 
            key={i} 
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= strength ? getColor() : 'bg-gray-700'
            }`}
          />
        ))}
      </div>
      <div className="space-y-1">
        {checks.map((check, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {check.met ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-gray-600" />
            )}
            <span className={check.met ? 'text-green-500' : 'text-muted-foreground'}>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const [apiError, setApiError] = useState<{ title: string; message: string } | null>(null);
  const [touched, setTouched] = useState({
    username: false,
    email: false,
    password: false,
    confirmPassword: false,
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validations = {
    username: formData.username.length >= 3 && /^[a-zA-Z0-9_]+$/.test(formData.username),
    email: validateEmail(formData.email),
    password: formData.password.length >= 6 && /\d/.test(formData.password) && /[a-zA-Z]/.test(formData.password),
    confirmPassword: formData.confirmPassword === formData.password && formData.confirmPassword.length > 0,
  };

  const validateForm = () => {
    const newErrors: any = {};

    if (!formData.username) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username = 'Only letters, numbers, and underscores allowed';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    } else if (!/\d/.test(formData.password) || !/[a-zA-Z]/.test(formData.password)) {
      newErrors.password = 'Password must contain both letters and numbers';
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
    setApiError(null);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validateForm()) return;

    if (!acceptedTerms) {
      setApiError({
        title: 'Terms required',
        message: 'Please accept the Terms of Service and Privacy Policy to continue.'
      });
      return;
    }

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
        
        const formattedError = formatSignupError(authError.message);
        setApiError(formattedError);
        toast.error(formattedError.title);
        return;
      }

      if (!authData.user) {
        console.error('[Signup] No user returned from signup');
        setApiError({
          title: 'Signup failed',
          message: 'Something went wrong. Please try again.'
        });
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
        setApiError({
          title: 'Profile creation failed',
          message: profileError.message
        });
        toast.error(`Profile creation failed: ${profileError.message}`);
        return;
      }

      if (!profile) {
        console.error('[Signup] Profile not found after creation');
        setApiError({
          title: 'Setup incomplete',
          message: 'Profile was not created. Please contact support.'
        });
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
      
      const formattedError = formatSignupError(error.message);
      setApiError(formattedError);
      toast.error(formattedError.title);
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
      const formattedError = formatSignupError(error.message);
      setApiError(formattedError);
      toast.error(formattedError.title);
    }
  };

  return (
    <AuthLayout>
      <Card className="p-5 sm:p-8 lg:p-10 bg-card/40 backdrop-blur-xl border-border/50 rounded-2xl sm:rounded-3xl shadow-2xl">
        <div className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">Create account</h1>
            <p className="text-muted-foreground">Join the FIVE01 community today</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-5">
            {/* API Error Display */}
            <AnimatePresence mode="wait">
              {apiError && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="rounded-xl bg-destructive/10 border border-destructive/20 overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-destructive font-semibold text-sm">{apiError.title}</p>
                        <p className="text-destructive/80 text-sm mt-1">{apiError.message}</p>
                        {apiError.title === 'Account already exists' && (
                          <Link 
                            href="/login" 
                            className="text-destructive/80 underline text-sm mt-2 hover:text-destructive inline-block"
                          >
                            Sign in instead
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground font-medium">
                Username
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  placeholder="dartmaster"
                  value={formData.username}
                  onChange={(e) => handleChange('username', e.target.value)}
                  onBlur={() => setTouched({ ...touched, username: true })}
                  className={`h-10 sm:h-12 pl-10 sm:pl-11 pr-10 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                    errors.username || (touched.username && !validations.username && formData.username)
                      ? 'border-destructive focus:border-destructive'
                      : touched.username && validations.username
                      ? 'border-green-500 focus:border-green-500'
                      : ''
                  }`}
                  disabled={loading}
                />
                {touched.username && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {validations.username ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : formData.username ? (
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    ) : null}
                  </div>
                )}
              </div>
              {errors.username && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.username}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  onBlur={() => setTouched({ ...touched, email: true })}
                  className={`h-10 sm:h-12 pl-10 sm:pl-11 pr-10 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                    errors.email || (touched.email && !validations.email && formData.email)
                      ? 'border-destructive focus:border-destructive'
                      : touched.email && validations.email
                      ? 'border-green-500 focus:border-green-500'
                      : ''
                  }`}
                  disabled={loading}
                />
                {touched.email && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {validations.email ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : formData.email ? (
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    ) : null}
                  </div>
                )}
              </div>
              {errors.email && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  onBlur={() => setTouched({ ...touched, password: true })}
                  className={`h-10 sm:h-12 pl-10 sm:pl-11 pr-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
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
              {formData.password && <PasswordStrengthIndicator password={formData.password} />}
              {errors.password && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.password}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground font-medium">
                Confirm Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  onBlur={() => setTouched({ ...touched, confirmPassword: true })}
                  className={`h-10 sm:h-12 pl-10 sm:pl-11 pr-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                    errors.confirmPassword || (touched.confirmPassword && !validations.confirmPassword && formData.confirmPassword)
                      ? 'border-destructive focus:border-destructive'
                      : touched.confirmPassword && validations.confirmPassword
                      ? 'border-green-500 focus:border-green-500'
                      : ''
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
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {/* Terms Checkbox - Enhanced Visibility */}
            <div className="bg-slate-800/30 border-2 border-slate-700 rounded-xl p-4 sm:p-5">
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() => setAcceptedTerms(!acceptedTerms)}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200 ${
                    acceptedTerms 
                      ? 'bg-primary border-primary shadow-lg shadow-primary/25 scale-105' 
                      : 'border-slate-500 hover:border-primary hover:bg-slate-700/50'
                  }`}
                >
                  {acceptedTerms && <Check className="w-4 h-4 sm:w-5 sm:h-5 text-white font-bold" />}
                </button>
                <div className="flex-1">
                  <p className="text-foreground text-sm sm:text-base font-medium leading-relaxed">
                    I agree to the{' '}
                    <Link 
                      href="/terms" 
                      target="_blank"
                      className="text-primary hover:text-primary/80 underline underline-offset-2 font-semibold"
                    >
                      Terms of Service
                    </Link>
                    {' '}and{' '}
                    <Link 
                      href="/privacy"
                      target="_blank" 
                      className="text-primary hover:text-primary/80 underline underline-offset-2 font-semibold"
                    >
                      Privacy Policy
                    </Link>
                  </p>
                  <p className="text-muted-foreground text-xs sm:text-sm mt-2 leading-relaxed">
                    Required to create your account and participate in competitive play
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 sm:h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Free Account'
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            </div>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-primary hover:text-primary/80 font-semibold transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </Card>
    </AuthLayout>
  );
}
