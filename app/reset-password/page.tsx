'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  Shield,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';

// Password strength checker
function checkPasswordStrength(password: string) {
  const checks = {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;
  const strength = score < 2 ? 'weak' : score < 4 ? 'medium' : 'strong';
  
  return { checks, score, strength };
}

// Helper function to format error messages
function formatResetError(error: string): { title: string; message: string } {
  const lowerError = error.toLowerCase();
  
  if (lowerError.includes('invalid') && lowerError.includes('token')) {
    return {
      title: 'Invalid or expired link',
      message: 'This password reset link is invalid or has expired. Please request a new one.'
    };
  }
  
  if (lowerError.includes('weak password') || lowerError.includes('password')) {
    return {
      title: 'Password too weak',
      message: 'Please choose a stronger password with at least 8 characters, including uppercase, lowercase, numbers, and special characters.'
    };
  }
  
  if (lowerError.includes('rate limit') || lowerError.includes('too many requests')) {
    return {
      title: 'Too many attempts',
      message: 'For security reasons, please wait a few minutes before trying again.'
    };
  }
  
  return {
    title: 'Reset failed',
    message: error || 'An unexpected error occurred. Please try again.'
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [touched, setTouched] = useState({ password: false, confirmPassword: false });
  const [validatingToken, setValidatingToken] = useState(true);
  const [tokenError, setTokenError] = useState(false);

  const passwordStrength = checkPasswordStrength(password);
  const passwordsMatch = password === confirmPassword;
  const isFormValid = password && confirmPassword && passwordsMatch && passwordStrength.strength !== 'weak';

  // Validate the reset token when component mounts
  useEffect(() => {
    const validateToken = async () => {
      const supabase = createClient();
      const code = searchParams?.get('code');
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token') || searchParams?.get('access_token');
      const refreshToken = hashParams.get('refresh_token') || searchParams?.get('refresh_token');

      console.log('[ResetPassword] Params:', { 
        code: !!code, 
        accessToken: !!accessToken, 
        refreshToken: !!refreshToken,
        hash: window.location.hash ? 'present' : 'none',
      });

      // PKCE flow: exchange code for session
      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[ResetPassword] Code exchange error:', error);
            setTokenError(true);
          } else {
            console.log('[ResetPassword] Code exchanged successfully');
          }
        } catch (e) {
          console.error('[ResetPassword] Code exchange failed:', e);
          setTokenError(true);
        }
        setValidatingToken(false);
        return;
      }

      // Implicit flow: tokens in hash or query
      if (accessToken && refreshToken) {
        try {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) {
            console.error('[ResetPassword] Session error:', error);
            setTokenError(true);
          }
        } catch (e) {
          console.error('[ResetPassword] Token validation error:', e);
          setTokenError(true);
        }
        setValidatingToken(false);
        return;
      }

      // Check if session already exists (e.g. from auth callback redirect)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        console.log('[ResetPassword] Existing session found');
        setValidatingToken(false);
        return;
      }

      // Listen for auth events (Supabase JS may auto-process hash)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        console.log('[ResetPassword] Auth event:', event);
        if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
          setValidatingToken(false);
          subscription.unsubscribe();
        }
      });

      setTimeout(() => {
        subscription.unsubscribe();
        setTokenError(true);
        setValidatingToken(false);
      }, 5000);
    };

    validateToken();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isFormValid) {
      setError({
        title: 'Invalid form',
        message: 'Please ensure your password is strong and both passwords match.'
      });
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      console.log('[ResetPassword] Updating password');

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        console.error('[ResetPassword] Update error:', updateError);
        const formattedError = formatResetError(updateError.message);
        setError(formattedError);
        toast.error(formattedError.title);
        return;
      }

      console.log('[ResetPassword] Password updated successfully');
      setSuccess(true);
      toast.success('Password updated successfully!');

      // Redirect to app after a short delay
      setTimeout(() => {
        router.push('/app');
      }, 2000);

    } catch (error: any) {
      console.error('[ResetPassword] Unexpected error:', error);
      const formattedError = formatResetError(error.message);
      setError(formattedError);
      toast.error(formattedError.title);
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while validating token
  if (validatingToken) {
    return (
      <AuthLayout>
        <Card className="p-5 sm:p-8 lg:p-10 bg-card/40 backdrop-blur-xl border-border/50 rounded-2xl sm:rounded-3xl shadow-2xl">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
            <div>
              <h2 className="text-xl font-semibold text-foreground">Validating reset link...</h2>
              <p className="text-sm text-muted-foreground">Please wait while we verify your request.</p>
            </div>
          </div>
        </Card>
      </AuthLayout>
    );
  }

  // Show error if token is invalid
  if (tokenError) {
    return (
      <AuthLayout>
        <Card className="p-5 sm:p-8 lg:p-10 bg-card/40 backdrop-blur-xl border-border/50 rounded-2xl sm:rounded-3xl shadow-2xl">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Invalid Reset Link</h1>
              <p className="text-muted-foreground">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
            </div>
            <Link href="/forgot-password">
              <Button>Request New Reset Link</Button>
            </Link>
          </div>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card className="p-5 sm:p-8 lg:p-10 bg-card/40 backdrop-blur-xl border-border/50 rounded-2xl sm:rounded-3xl shadow-2xl">
        <div className="space-y-4 sm:space-y-6">
          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center space-y-4"
              >
                <div className="w-16 h-16 mx-auto bg-green-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">
                    Password Updated!
                  </h1>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Your password has been successfully updated. You're being redirected to your account.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Redirecting to dashboard...
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4 sm:space-y-6"
              >
                <div className="space-y-1 sm:space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">
                    Create new password
                  </h1>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Choose a strong password to secure your account.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                  {/* Error Display */}
                  <AnimatePresence mode="wait">
                    {error && (
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
                              <p className="text-destructive font-semibold text-sm">{error.title}</p>
                              <p className="text-destructive/80 text-sm mt-1">{error.message}</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* New Password */}
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-foreground font-medium">
                      New Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError(null);
                        }}
                        onBlur={() => setTouched({ ...touched, password: true })}
                        className="h-12 pl-11 pr-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all"
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
                    
                    {/* Password Strength Indicator */}
                    {touched.password && password && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1 flex-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <div
                                key={i}
                                className={`h-1 rounded-full flex-1 transition-colors ${
                                  i <= passwordStrength.score
                                    ? passwordStrength.strength === 'weak'
                                      ? 'bg-destructive'
                                      : passwordStrength.strength === 'medium'
                                      ? 'bg-yellow-500'
                                      : 'bg-green-500'
                                    : 'bg-muted'
                                }`}
                              />
                            ))}
                          </div>
                          <span className={`text-xs font-medium ${
                            passwordStrength.strength === 'weak'
                              ? 'text-destructive'
                              : passwordStrength.strength === 'medium'
                              ? 'text-yellow-600'
                              : 'text-green-600'
                          }`}>
                            {passwordStrength.strength.charAt(0).toUpperCase() + passwordStrength.strength.slice(1)}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <div className={`flex items-center gap-1 ${
                            passwordStrength.checks.length ? 'text-green-600' : 'text-muted-foreground'
                          }`}>
                            {passwordStrength.checks.length ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <div className="w-3 h-3 rounded-full border border-muted-foreground" />
                            )}
                            8+ characters
                          </div>
                          <div className={`flex items-center gap-1 ${
                            passwordStrength.checks.uppercase ? 'text-green-600' : 'text-muted-foreground'
                          }`}>
                            {passwordStrength.checks.uppercase ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <div className="w-3 h-3 rounded-full border border-muted-foreground" />
                            )}
                            Uppercase
                          </div>
                          <div className={`flex items-center gap-1 ${
                            passwordStrength.checks.lowercase ? 'text-green-600' : 'text-muted-foreground'
                          }`}>
                            {passwordStrength.checks.lowercase ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <div className="w-3 h-3 rounded-full border border-muted-foreground" />
                            )}
                            Lowercase
                          </div>
                          <div className={`flex items-center gap-1 ${
                            passwordStrength.checks.number ? 'text-green-600' : 'text-muted-foreground'
                          }`}>
                            {passwordStrength.checks.number ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <div className="w-3 h-3 rounded-full border border-muted-foreground" />
                            )}
                            Number
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-foreground font-medium">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setError(null);
                        }}
                        onBlur={() => setTouched({ ...touched, confirmPassword: true })}
                        className={`h-12 pl-11 pr-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                          touched.confirmPassword && confirmPassword && !passwordsMatch
                            ? 'border-destructive focus:border-destructive'
                            : touched.confirmPassword && passwordsMatch && confirmPassword
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
                    
                    {touched.confirmPassword && confirmPassword && !passwordsMatch && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Passwords do not match
                      </p>
                    )}
                    
                    {touched.confirmPassword && passwordsMatch && confirmPassword && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Passwords match
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={loading || !isFormValid}
                    className="w-full h-10 sm:h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20 transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Updating password...
                      </>
                    ) : (
                      <>
                        <Shield className="w-5 h-5 mr-2" />
                        Update password
                      </>
                    )}
                  </Button>
                </form>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors group"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-0.5 transition-transform" />
                    Back to login
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </AuthLayout>
  );
}