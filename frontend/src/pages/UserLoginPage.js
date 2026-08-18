import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Phone, ArrowRight, ArrowLeft, Lock, Eye, EyeOff, ShieldCheck,
  MessageCircle, Loader2, KeyRound, User, CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SalonHubLogo from '@/components/SalonHubLogo';
import ThemePicker from '@/components/ThemePicker';
import GoogleLoginButton from '@/components/GoogleLoginButton';

const RESEND_SECONDS = 45;

export default function UserLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    customerSendOtp, customerVerifyOtp, customerCheckAccount,
    customerSetPassword, customerLoginPassword, updateCustomerProfile,
  } = useAuth();

  const from = location.state?.from || '/salons';

  // High-level view: 'login' (tabbed) | 'pwReset' | 'profile'
  const [view, setView] = useState('login');
  const [tab, setTab] = useState('otp');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  // OTP login
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  // Password login
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Set / reset password flow
  const [resetPurpose, setResetPurpose] = useState('set_password');
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Complete-profile step (first-time login)
  const [profileName, setProfileName] = useState('');
  const [profileGender, setProfileGender] = useState('Men');
  const [loggedInPhone, setLoggedInPhone] = useState('');

  // Shared resend countdown
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const phoneValid = phone.length === 10;

  const finishLogin = useCallback((data) => {
    const user = data?.user;
    const needsProfile = data?.needs_profile || !(user?.name || '').trim();
    if (needsProfile) {
      setLoggedInPhone(user?.phone || `+91${phone}`);
      setProfileName(user?.name || '');
      setView('profile');
      toast.success('Verified! Just one quick thing…');
    } else {
      toast.success(`Welcome back${user?.name ? `, ${user.name}` : ''}!`);
      navigate(from, { replace: true });
    }
  }, [from, navigate, phone]);

  // ── OTP LOGIN ──────────────────────────────────────────────────────────
  const handleSendLoginOtp = async () => {
    if (!phoneValid) { toast.error('Enter a valid 10-digit number'); return; }
    setLoading(true);
    const res = await customerSendOtp(phone, 'login');
    setLoading(false);
    if (res.success) {
      setOtpSent(true);
      setCountdown(RESEND_SECONDS);
      toast.success(res.note || 'OTP sent to your mobile');
    } else {
      toast.error(res.error);
    }
  };

  const handleVerifyLoginOtp = async () => {
    if (otp.length !== 6) { toast.error('Enter the 6-digit OTP'); return; }
    setLoading(true);
    const res = await customerVerifyOtp(phone, otp, 'login');
    setLoading(false);
    if (res.success) finishLogin(res);
    else toast.error(res.error);
  };

  // ── PASSWORD LOGIN ─────────────────────────────────────────────────────
  const handlePasswordLogin = async (e) => {
    e?.preventDefault();
    if (!phoneValid) { toast.error('Enter a valid 10-digit number'); return; }
    if (!password) { toast.error('Enter your password'); return; }
    setLoading(true);
    const res = await customerLoginPassword(phone, password);
    setLoading(false);
    if (res.success) finishLogin(res);
    else toast.error(res.error);
  };

  // ── SET / RESET PASSWORD ───────────────────────────────────────────────
  const startPasswordReset = async () => {
    if (!phoneValid) { toast.error('Enter your 10-digit number first'); return; }
    setLoading(true);
    const acct = await customerCheckAccount(phone);
    if (!acct.success) { setLoading(false); toast.error(acct.error); return; }
    const purpose = acct.has_password ? 'reset_password' : 'set_password';
    // If account doesn't exist, set_password will be rejected by the backend
    // (404). Guide the user to log in via OTP first to create the account.
    if (!acct.exists) {
      setLoading(false);
      toast.error('No account yet. Use "OTP login" first to create your account.');
      setTab('otp');
      return;
    }
    const res = await customerSendOtp(phone, purpose);
    setLoading(false);
    if (!res.success) { toast.error(res.error); return; }
    setResetPurpose(purpose);
    setResetOtpSent(true);
    setResetOtp('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setCountdown(RESEND_SECONDS);
    setView('pwReset');
    toast.success(res.note || 'OTP sent to your mobile');
  };

  const handleVerifyResetOtp = async () => {
    if (resetOtp.length !== 6) { toast.error('Enter the 6-digit OTP'); return; }
    setLoading(true);
    const res = await customerVerifyOtp(phone, resetOtp, resetPurpose);
    setLoading(false);
    if (res.success && res.password_reset_token) {
      setResetToken(res.password_reset_token);
      toast.success('Verified — now choose a password');
    } else {
      toast.error(res.error || 'Could not verify OTP');
    }
  };

  const handleSaveNewPassword = async () => {
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    const res = await customerSetPassword(phone, newPassword, resetToken);
    setLoading(false);
    if (res.success) {
      toast.success('Password saved — you are logged in');
      finishLogin(res);
    } else {
      toast.error(res.error);
    }
  };

  // ── COMPLETE PROFILE ───────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!profileName.trim()) { toast.error('Please tell us your name'); return; }
    setLoading(true);
    const res = await updateCustomerProfile(loggedInPhone, {
      name: profileName.trim(),
      gender: profileGender,
    });
    setLoading(false);
    if (res.success) {
      toast.success('All set!');
      navigate(from, { replace: true });
    } else {
      // Even if save fails, the user is logged in — let them through.
      toast.error(res.error || 'Saved login, but profile update failed');
      navigate(from, { replace: true });
    }
  };

  const PhoneField = (
    <div className="space-y-2">
      <label className="eyebrow">Mobile number</label>
      <div className="flex gap-2">
        <div className="h-12 px-4 inline-flex items-center bg-muted rounded-xl border border-border text-foreground font-medium text-sm">
          +91
        </div>
        <Input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="98XXXXXXXX"
          data-testid="login-phone-input"
          disabled={otpSent}
          className="flex-1 h-12 bg-background border-border focus-visible:ring-brass focus-visible:border-brass rounded-xl disabled:opacity-70"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background bg-grain hero-wash relative overflow-hidden flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-brass/[0.06] rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-bronze/[0.05] rounded-full blur-3xl" />
      </div>

      {/* Top-corner theme toggle */}
      <div className="fixed top-4 right-4 z-20">
        <ThemePicker />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <div className="flex justify-center mb-6">
            <SalonHubLogo size={64} showText={false} />
          </div>
          <span className="eyebrow-brass">A warm welcome</span>
          <h1 className="font-fraunces text-4xl sm:text-5xl mt-3 font-light leading-[1.05]">
            Step into <span className="serif-italic font-medium brass-text">Salonhub</span>
          </h1>
        </motion.div>

        {/* Item 6 — Quick exits: main site + guest browsing */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.45 }}
          className="flex items-center justify-center gap-2 mb-5"
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/')}
            className="rounded-full text-sm border-brass/40 hover:bg-brass-soft"
            data-testid="user-login-explore-btn"
          >
            Explore Salonhub
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate('/salons')}
            className="rounded-full text-sm text-muted-foreground hover:text-foreground"
            data-testid="user-login-guest-btn"
          >
            Continue as guest →
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="lux-card rounded-2xl p-7 sm:p-8 bg-card"
        >
          {/* Privacy consent (compliance) */}
          <label className="flex items-start gap-2.5 mb-5 cursor-pointer select-none" data-testid="login-consent">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              data-testid="login-consent-checkbox"
              className="mt-0.5 h-4 w-4 accent-brass shrink-0"
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              I agree to the{' '}
              <Link to="/privacy" target="_blank" className="text-brass font-medium hover:underline" data-testid="login-privacy-link">
                Privacy Policy
              </Link>{' '}
              and consent to my data being processed as described.
            </span>
          </label>

          {/* Google sign-in (Item 9) */}
          <div className={`mb-5 ${agreed ? '' : 'opacity-50 pointer-events-none'}`} aria-disabled={!agreed}>
            <GoogleLoginButton audience="customer" />
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* ───────── MAIN LOGIN (tabbed) ───────── */}
            {view === 'login' && (
              <motion.div
                key="login"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Tabs value={tab} onValueChange={(v) => { setTab(v); setOtpSent(false); setOtp(''); }}>
                  <TabsList className="grid grid-cols-2 w-full h-11 mb-6">
                    <TabsTrigger value="otp" data-testid="tab-otp">
                      <MessageCircle className="w-4 h-4 mr-1.5" /> OTP login
                    </TabsTrigger>
                    <TabsTrigger value="password" data-testid="tab-password">
                      <Lock className="w-4 h-4 mr-1.5" /> Password
                    </TabsTrigger>
                  </TabsList>

                  {/* OTP TAB */}
                  <TabsContent value="otp" className="space-y-5 mt-0">
                    {PhoneField}

                    {!otpSent ? (
                      <Button
                        onClick={handleSendLoginOtp}
                        disabled={loading || !phoneValid || !agreed}
                        data-testid="send-otp-btn"
                        className="w-full h-12 bg-brass text-espresso hover:bg-brass-hover font-semibold rounded-xl shadow-brass"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                          <span className="inline-flex items-center">
                            Send OTP <ArrowRight className="ml-2 w-4 h-4" />
                          </span>
                        )}
                      </Button>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="eyebrow">Enter OTP</label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="6-digit code"
                            data-testid="otp-input"
                            className="h-12 text-center text-xl tracking-[0.5em] bg-background border-border focus-visible:ring-brass focus-visible:border-brass rounded-xl"
                          />
                        </div>
                        <Button
                          onClick={handleVerifyLoginOtp}
                          disabled={loading || otp.length !== 6}
                          data-testid="verify-otp-btn"
                          className="w-full h-12 bg-brass text-espresso hover:bg-brass-hover font-semibold rounded-xl shadow-brass"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                            <span className="inline-flex items-center">
                              Verify & Continue <ArrowRight className="ml-2 w-4 h-4" />
                            </span>
                          )}
                        </Button>
                        <div className="flex justify-between items-center text-xs">
                          <button
                            onClick={() => { setOtpSent(false); setOtp(''); }}
                            className="text-muted-foreground hover:text-foreground inline-flex items-center"
                          >
                            <ArrowLeft className="w-3 h-3 mr-1" /> Change number
                          </button>
                          <button
                            onClick={handleSendLoginOtp}
                            disabled={countdown > 0 || loading}
                            data-testid="resend-otp-btn"
                            className={countdown > 0 ? 'text-muted-foreground' : 'text-brass hover:underline'}
                          >
                            {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
                          </button>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* PASSWORD TAB */}
                  <TabsContent value="password" className="space-y-5 mt-0">
                    <form onSubmit={handlePasswordLogin} className="space-y-5">
                      {PhoneField}
                      <div className="space-y-2">
                        <label className="eyebrow">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.6} />
                          <Input
                            type={showPwd ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Your password"
                            data-testid="password-input"
                            className="pl-10 pr-10 h-12 bg-background border-border focus-visible:ring-brass focus-visible:border-brass rounded-xl"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPwd((s) => !s)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <Button
                        type="submit"
                        disabled={loading || !phoneValid || !password || !agreed}
                        data-testid="password-login-btn"
                        className="w-full h-12 bg-brass text-espresso hover:bg-brass-hover font-semibold rounded-xl shadow-brass"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                          <span className="inline-flex items-center">
                            Login <ArrowRight className="ml-2 w-4 h-4" />
                          </span>
                        )}
                      </Button>
                    </form>
                    <div className="text-center">
                      <button
                        onClick={startPasswordReset}
                        disabled={loading}
                        data-testid="set-reset-password-link"
                        className="text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-brass transition-colors inline-flex items-center"
                      >
                        <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                        Set / Forgot password?
                      </button>
                    </div>
                  </TabsContent>
                </Tabs>
              </motion.div>
            )}

            {/* ───────── SET / RESET PASSWORD ───────── */}
            {view === 'pwReset' && (
              <motion.div
                key="pwReset"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-brass/15 flex items-center justify-center mx-auto mb-3">
                    <KeyRound className="w-7 h-7 text-brass" strokeWidth={1.6} />
                  </div>
                  <h2 className="font-fraunces text-2xl font-light">
                    {resetPurpose === 'reset_password' ? 'Reset password' : 'Set a password'}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">for +91 {phone}</p>
                </div>

                {!resetToken ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="eyebrow">Enter OTP</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={resetOtp}
                        onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit code"
                        data-testid="reset-otp-input"
                        className="h-12 text-center text-xl tracking-[0.5em] bg-background border-border focus-visible:ring-brass focus-visible:border-brass rounded-xl"
                      />
                    </div>
                    <Button
                      onClick={handleVerifyResetOtp}
                      disabled={loading || resetOtp.length !== 6}
                      data-testid="verify-reset-otp-btn"
                      className="w-full h-12 bg-brass text-espresso hover:bg-brass-hover font-semibold rounded-xl shadow-brass"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify OTP'}
                    </Button>
                    <div className="flex justify-between items-center text-xs">
                      <button
                        onClick={() => { setView('login'); setResetOtpSent(false); }}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center"
                      >
                        <ArrowLeft className="w-3 h-3 mr-1" /> Back
                      </button>
                      <button
                        onClick={startPasswordReset}
                        disabled={countdown > 0 || loading}
                        className={countdown > 0 ? 'text-muted-foreground' : 'text-brass hover:underline'}
                      >
                        {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-xs text-emerald-500">
                      <ShieldCheck className="w-4 h-4" /> OTP verified
                    </div>
                    <div className="space-y-2">
                      <label className="eyebrow">New password</label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        data-testid="new-password-input"
                        className="h-12 bg-background border-border focus-visible:ring-brass focus-visible:border-brass rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="eyebrow">Confirm password</label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        data-testid="confirm-password-input"
                        className="h-12 bg-background border-border focus-visible:ring-brass focus-visible:border-brass rounded-xl"
                      />
                    </div>
                    <Button
                      onClick={handleSaveNewPassword}
                      disabled={loading || !newPassword || !confirmPassword}
                      data-testid="save-password-btn"
                      className="w-full h-12 bg-brass text-espresso hover:bg-brass-hover font-semibold rounded-xl shadow-brass"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <span className="inline-flex items-center">
                          <CheckCircle2 className="mr-2 w-4 h-4" /> Save & Login
                        </span>
                      )}
                    </Button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ───────── COMPLETE PROFILE ───────── */}
            {view === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-brass/15 flex items-center justify-center mx-auto mb-3">
                    <User className="w-7 h-7 text-brass" strokeWidth={1.6} />
                  </div>
                  <h2 className="font-fraunces text-2xl font-light">Tell us about you</h2>
                  <p className="text-xs text-muted-foreground mt-1">We'll save your chair.</p>
                </div>

                <div className="space-y-2">
                  <label className="eyebrow">Full name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.6} />
                    <Input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your name, please"
                      data-testid="profile-name-input"
                      className="pl-10 h-12 bg-background border-border focus-visible:ring-brass focus-visible:border-brass rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="eyebrow">I am</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Men', 'Women'].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setProfileGender(g)}
                        data-testid={`profile-gender-${g.toLowerCase()}-btn`}
                        className={`h-11 rounded-xl font-medium text-sm transition-all ${
                          profileGender === g
                            ? 'bg-brass text-espresso shadow-brass'
                            : 'bg-transparent text-foreground border border-border hover:border-brass/50'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleSaveProfile}
                  disabled={loading}
                  data-testid="save-profile-btn"
                  className="w-full h-12 bg-brass text-espresso hover:bg-brass-hover font-semibold rounded-xl shadow-brass"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <span className="inline-flex items-center">
                      Continue <ArrowRight className="ml-2 w-4 h-4" />
                    </span>
                  )}
                </Button>
                <button
                  onClick={() => navigate(from, { replace: true })}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  Skip for now
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {view === 'login' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-8 text-center"
          >
            <button
              onClick={() => navigate('/salon/login')}
              data-testid="login-salon-owner-link"
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-brass transition-colors"
            >
              Salon owner? <span className="text-brass">Open your portal →</span>
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
