import { useState, useEffect } from 'react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Scissors, Lock, Smartphone, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { saveSession, getSession, isSessionValid, clearSession } from '@/utils/sessionManager';
import GoogleLoginButton from '@/components/GoogleLoginButton';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Clear ALL salon auth data (legacy + multi-user) — call this BEFORE storing new
// auth so we never carry over stale permissions/role between login sessions on
// the same browser. Critical for multi-user access security.
const purgeAllSalonAuthData = () => {
  try {
    localStorage.removeItem('salon_admin_token');
    localStorage.removeItem('salon_user_auth');
    localStorage.removeItem('salon_id');
    localStorage.removeItem('salon_active_tab');
    clearSession();
  } catch (e) { /* ignore */ }
};

// Notify AuthContext (and any other listeners) to re-read localStorage so React
// state stays in sync with the just-changed auth keys.
const broadcastAuthChange = () => {
  try { window.dispatchEvent(new Event('salon-auth-changed')); } catch (e) {}
};

export default function OTPLoginPage() {
  const navigate = useNavigate();
  const [loginMethod, setLoginMethod] = useState('password'); // 'password' or 'otp'
  const [step, setStep] = useState(1); // For OTP: 1: phone, 2: OTP
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [canResend, setCanResend] = useState(false);

  // Check for existing session on mount — DO NOT auto-forward.
  // Users who navigate here explicitly (from "I run a salon" or the Landing
  // page CTA) may be trying to switch accounts. Silently redirecting to the
  // dashboard whenever any stale session exists prevented account switching.
  // Also purge stale auth so the login form starts clean.
  useEffect(() => {
    purgeAllSalonAuthData();
    broadcastAuthChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer for resend
  React.useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && step === 2) {
      setCanResend(true);
    }
  }, [countdown, step]);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();

    if (!phone) {
      toast.error('Please enter your Mobile Number or Login ID');
      return;
    }

    if (!password) {
      toast.error('Please enter your password');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/salon/users/login`, {
        identifier: phone,  // Can be mobile number or login_id
        password
      });

      // SECURITY: Purge any stale auth data from previous session before storing new
      purgeAllSalonAuthData();

      // Store auth data
      const authData = {
        token: response.data.access_token,
        salonId: response.data.salon_id,
        userId: response.data.user_id,
        role: response.data.role,
        permissions: response.data.permissions,
        staffId: response.data.staff_id || null
      };
      
      localStorage.setItem('salon_user_auth', JSON.stringify(authData));
      localStorage.setItem('salon_id', response.data.salon_id);
      
      // Also save to session manager for consistency
      saveSession(
        response.data.access_token,
        response.data.salon_id,
        response.data.role,
        response.data.user_id,
        response.data.permissions
      );

      // Notify AuthContext to re-read localStorage so dashboard updates immediately
      broadcastAuthChange();

      toast.success('Login successful!');
      navigate(response.data.role === 'staff' ? '/salon/staff-portal' : '/salon/dashboard');
    } catch (error) {
      // Normalise the error shape so we never render an object as a React child.
      // FastAPI can return detail as a string OR as a structured object like
      // { code, message, reason } (e.g. SALON_SUSPENDED). Both must be handled.
      const raw = error?.response?.data?.detail;
      const detailStr = typeof raw === 'string'
        ? raw
        : (raw && typeof raw === 'object'
            ? (raw.message || raw.detail || raw.error || JSON.stringify(raw))
            : (error?.message || ''));
      // Fallback to legacy salon login if multi-user login fails
      // - 404: salon_users record doesn't exist for this phone → try legacy salon record
      // - 401: salon_users record exists but password mismatch → many legacy salons have
      //        the password set on the salon doc (not the user doc). Try legacy too.
      if (error.response?.status === 404 || error.response?.status === 401) {
        try {
          // Try legacy salon password login
          const legacyResponse = await axios.post(`${API}/salon/password-login`, {
            phone,
            password
          });

          // SECURITY: Purge any stale auth data from previous session before storing new
          purgeAllSalonAuthData();

          // Store legacy session — use role + permissions returned by the
          // legacy endpoint so admin-only tabs are visible right after login.
          const legacyRole = legacyResponse.data.role || 'admin';
          const legacyPerms = legacyResponse.data.permissions || {};
          saveSession(
            legacyResponse.data.access_token,
            legacyResponse.data.salon_id,
            legacyRole,
            legacyResponse.data.salon_id,
            legacyPerms
          );

          // Also persist the multi-user auth shape so Dashboard / AuthContext
          // reads back the correct admin permissions on refresh.
          // NOTE: keep the field name `token` — Dashboard's getAuthHeaders() reads
          // `authData.token`. (SalonApp3.3 merge briefly used `accessToken` which
          // caused Bearer-undefined 401s across attendance/shop/inventory/orders/guests.)
          try {
            const authData = {
              token: legacyResponse.data.access_token,
              salonId: legacyResponse.data.salon_id,
              userId: legacyResponse.data.salon_id,
              role: legacyRole,
              permissions: legacyPerms,
              staffId: null,
            };
            localStorage.setItem('salon_user_auth', JSON.stringify(authData));
          } catch (_) { /* ignore storage errors */ }

          localStorage.setItem('salon_admin_token', legacyResponse.data.access_token);
          localStorage.setItem('salon_id', legacyResponse.data.salon_id);

          // Notify AuthContext to re-read localStorage so dashboard updates immediately
          broadcastAuthChange();

          toast.success('Login successful!');
          navigate('/salon/dashboard');
          return;
        } catch (legacyError) {
          // Ignore and show original error
        }
      }
      
      if (error.response?.status === 400 && detailStr.includes('Password not set')) {
        toast.error('Password not set for this salon. Please use OTP login.');
      } else if (error.response?.status === 403 && raw && typeof raw === 'object' && raw.code === 'SALON_SUSPENDED') {
        toast.error(raw.message || 'This salon has been suspended.', {
          description: raw.reason ? `Reason: ${raw.reason}` : undefined,
          duration: 8000,
        });
      } else {
        toast.error(detailStr || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    
    if (phone.length < 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/salon/send-otp`, { phone });
      
      // SECURITY: Never display OTP in toast/UI even when backend returns it
      // (some dev/mock modes echo OTP back). Show only the generic confirmation.
      // If backend reports a failed delivery_status, surface a friendly retry message.
      if (response.data?.delivery_status === 'failed') {
        toast.error(response.data?.note || 'SMS delivery failed. Please try again.');
        return;
      }
      toast.success(response.data?.note || 'OTP sent to your mobile via SMS!');
      
      setStep(2);
      setCountdown(30);
      setCanResend(false);
    } catch (error) {
      console.error('[SEND OTP] Failed:', error?.response?.status, error?.response?.data || error?.message);
      const detail = error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || 'Failed to send OTP. Please check your connection and try again.';
      toast.error(typeof detail === 'string' ? detail : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/salon/send-otp`, { phone });
      
      // SECURITY: Never display OTP in toast/UI
      if (response.data?.delivery_status === 'failed') {
        toast.error(response.data?.note || 'SMS delivery failed. Please try again.');
        return;
      }
      toast.success(response.data?.note || 'OTP resent to your mobile via SMS!');
      
      setCountdown(30);
      setCanResend(false);
      setOtp('');
    } catch (error) {
      console.error('[RESEND OTP] Failed:', error?.response?.status, error?.response?.data || error?.message);
      const detail = error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || 'Failed to resend OTP. Please check your connection and try again.';
      toast.error(typeof detail === 'string' ? detail : 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    
    if (otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/salon/verify-otp`, {
        phone,
        otp
      });

      // SECURITY: Purge any stale auth data from previous session before storing new
      purgeAllSalonAuthData();

      localStorage.setItem('salon_admin_token', response.data.access_token);
      localStorage.setItem('salon_id', response.data.salon_id);

      // Notify AuthContext to re-read localStorage so dashboard updates immediately
      broadcastAuthChange();

      toast.success('Login successful!');
      navigate('/salon/dashboard');
    } catch (error) {
      const raw = error.response?.data?.detail;
      const detailStr = typeof raw === 'string'
        ? raw
        : (raw && typeof raw === 'object' ? (raw.message || raw.detail || JSON.stringify(raw)) : '');
      toast.error(detailStr || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-gold/5 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-gold/20 to-gold/10 p-8 text-center border-b border-border">
            <Scissors className="w-16 h-16 text-gold mx-auto mb-4" />
            <h1 className="text-2xl font-playfair font-bold text-foreground mb-2">Salon Admin Login</h1>
            <p className="text-sm text-muted-foreground">Access your salon dashboard</p>
          </div>

          {/* Login Method Tabs */}
          <div className="grid grid-cols-2 gap-0 border-b border-border">
            <button
              onClick={() => {
                setLoginMethod('password');
                setStep(1);
                setOtp('');
              }}
              className={`py-4 px-6 text-sm font-semibold transition-all ${
                loginMethod === 'password'
                  ? 'bg-gold text-black border-b-2 border-gold'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Lock className="w-4 h-4 inline mr-2" />
              Password Login
            </button>
            <button
              onClick={() => {
                setLoginMethod('otp');
                setStep(1);
                setPassword('');
              }}
              className={`py-4 px-6 text-sm font-semibold transition-all ${
                loginMethod === 'otp'
                  ? 'bg-gold text-black border-b-2 border-gold'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <Smartphone className="w-4 h-4 inline mr-2" />
              OTP Login
            </button>
          </div>

          <div className="p-8">
            {/* Google sign-in (Item 9) */}
            <div className="mb-5">
              <GoogleLoginButton audience="salon" />
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </div>
            {loginMethod === 'password' ? (
              /* Password Login Form */
              <form onSubmit={handlePasswordLogin} className="space-y-6">
                <div>
                  <Label htmlFor="phone" className="mb-2 block">Mobile Number/ID</Label>
                  <div className="flex items-center">
                    <Input
                      id="phone"
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Mobile number or Login ID"
                      required
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter your mobile number or login ID
                  </p>
                </div>

                <div>
                  <Label htmlFor="password" className="mb-2 block">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gold text-black hover:bg-gold/90 h-12"
                  disabled={loading}
                >
                  {loading ? 'Logging in...' : 'Login with Password'}
                </Button>

                <p className="text-xs text-center text-muted-foreground mt-4">
                  Don't have a password? Use OTP login above
                </p>
              </form>
            ) : (
              /* OTP Login Form */
              <>
                {step === 1 ? (
                  <form onSubmit={handleSendOTP} className="space-y-6">
                    <div>
                      <Label htmlFor="phone_otp" className="mb-2 block">Mobile Number</Label>
                      <div className="flex items-center">
                        <span className="text-foreground mr-2">+91</span>
                        <Input
                          id="phone_otp"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="10-digit mobile number"
                          required
                          className="flex-1"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        OTP will be sent to your mobile via SMS
                      </p>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full bg-gold text-black hover:bg-gold/90 h-12"
                      disabled={loading}
                    >
                      {loading ? 'Sending OTP...' : 'Send OTP'}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOTP} className="space-y-6">
                    <div>
                      <Label htmlFor="otp" className="mb-2 block">Enter OTP</Label>
                      <Input
                        id="otp"
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit OTP"
                        required
                        className="text-center text-2xl tracking-widest"
                        maxLength={6}
                      />
                      <p className="text-sm text-muted-foreground mt-2 text-center">
                        OTP sent to +91{phone} via SMS
                      </p>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full bg-gold text-black hover:bg-gold/90 h-12"
                      disabled={loading}
                    >
                      {loading ? 'Verifying...' : 'Verify OTP'}
                    </Button>

                    <div className="flex items-center justify-between text-sm">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="text-gold hover:underline"
                      >
                        Change Number
                      </button>
                      <button
                        type="button"
                        onClick={handleResendOTP}
                        disabled={!canResend || loading}
                        className={`${
                          canResend ? 'text-gold hover:underline' : 'text-muted-foreground cursor-not-allowed'
                        }`}
                      >
                        {canResend ? 'Resend OTP' : `Resend in ${countdown}s`}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Don't have an account?{' '}
          <button
            onClick={() => navigate('/salon/signup')}
            className="text-gold hover:underline font-semibold"
          >
            Register your salon
          </button>
        </p>

        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={() => toast.info('Please contact support to reset your password')}
            className="text-sm text-muted-foreground hover:text-gold transition-colors"
          >
            Forgot Password?
          </button>
          <span className="text-border">|</span>
          <button
            onClick={() => navigate('/user/login')}
            className="text-sm text-muted-foreground hover:text-gold transition-colors"
          >
            Login as Customer
          </button>
        </div>
      </motion.div>
    </div>
  );
}
