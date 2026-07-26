/**
 * Post-Confirm Booking Identity Sheet — single-step "phone number gate".
 *
 * Slides up AFTER the customer taps "Confirm Booking". This is the SINGLE
 * place we ask for identity — the payment page itself has no login/guest
 * chips anymore.
 *
 * Standard-Indian-app UX (BookMyShow / Zomato / IRCTC / Amazon):
 *   • Enter mobile number first — big, focused, +91 pill.
 *   • Primary CTA "Send OTP" (verified account, unlocks wallet + history).
 *   • Secondary CTA "Skip & Book" (a.k.a. Continue as Guest).
 *   • Name + Gender collected inline (needed for either path).
 *   • Fully mobile-friendly: rounded 3-xl top corners, comfortable padding,
 *     large 48px tap targets, sticky CTA area, no horizontal scrolling.
 */
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, X, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function BookingIdentitySheet({
  open,
  onClose,
  totalAmount = 0,
  guestName,
  setGuestName,
  guestPhone,
  setGuestPhone,
  guestGender,
  setGuestGender,
  onChooseLogin,      // fired by "Send OTP"
  onConfirmGuest,     // fired by "Skip & Book"
  loading = false,
}) {
  // Lock background scroll while open.
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  const nameValid = (guestName || '').trim().length >= 2;
  const phoneValid = (guestPhone || '').length === 10;
  const genderValid = !!guestGender;
  const formValid = nameValid && phoneValid && genderValid;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="fixed left-0 right-0 bottom-0 z-[80] bg-background rounded-t-3xl shadow-2xl max-h-[94vh] overflow-y-auto"
            data-testid="booking-identity-sheet"
          >
            {/* Grabber */}
            <div className="flex justify-center pt-3">
              <div className="w-12 h-1.5 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="px-5 pt-3 pb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-foreground">Almost there!</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enter your mobile number to confirm your booking · Total <span className="font-semibold text-gold">₹{totalAmount}</span>
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-2 rounded-full hover:bg-muted -mt-1 -mr-1"
                data-testid="identity-sheet-close"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Body — single-step form */}
            <div className="px-5 pb-4 pt-3 space-y-4">
              {/* Mobile — most prominent */}
              <div>
                <label className="text-[11px] font-bold text-foreground uppercase tracking-widest">Mobile Number</label>
                <div className="flex gap-2 mt-1.5">
                  <span className="inline-flex items-center px-3 h-12 rounded-lg border border-border bg-muted text-sm font-semibold">+91</span>
                  <Input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile"
                    inputMode="numeric"
                    className="h-12 flex-1 text-lg tracking-wider"
                    data-testid="identity-phone-input"
                    autoFocus
                  />
                </div>
                {!!(guestPhone || '').length && !phoneValid && (
                  <p className="text-[11px] text-red-500 mt-1">Please enter a 10-digit mobile number.</p>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="text-[11px] font-bold text-foreground uppercase tracking-widest">Full Name</label>
                <Input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your name"
                  className="h-11 mt-1.5"
                  data-testid="identity-name-input"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="text-[11px] font-bold text-foreground uppercase tracking-widest">Gender</label>
                <div className="flex gap-2 flex-wrap mt-1.5">
                  {['Men', 'Women', 'Other'].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGuestGender(g)}
                      className={`flex-1 min-w-[70px] px-4 py-2.5 rounded-full border-2 text-sm font-semibold transition-all ${
                        guestGender === g
                          ? 'bg-gold text-black border-gold shadow-sm'
                          : 'bg-background text-foreground border-border hover:border-gold/50'
                      }`}
                      data-testid={`identity-gender-${g.toLowerCase()}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Value prop */}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-gold/5 border border-gold/20 rounded-lg px-3 py-2">
                <Sparkles className="w-3.5 h-3.5 text-gold flex-shrink-0" />
                <span>
                  Verified users unlock <b className="text-foreground">booking history, wallet & member benefits</b>.
                </span>
              </div>
            </div>

            {/* Sticky CTAs at bottom */}
            <div className="sticky bottom-0 bg-background border-t border-border px-5 py-4 space-y-2">
              <Button
                type="button"
                onClick={onChooseLogin}
                disabled={!phoneValid || loading}
                className="w-full bg-gold text-black hover:bg-gold/90 h-12 text-base font-bold rounded-xl disabled:opacity-50"
                data-testid="identity-send-otp-btn"
              >
                <ShieldCheck className="w-5 h-5 mr-2" />
                Send OTP &amp; Verify
              </Button>
              <Button
                type="button"
                onClick={onConfirmGuest}
                disabled={!formValid || loading}
                variant="ghost"
                className="w-full h-11 text-sm font-semibold rounded-xl text-muted-foreground hover:text-foreground disabled:opacity-50"
                data-testid="identity-guest-btn"
              >
                {loading ? 'Booking…' : (
                  <>
                    Skip &amp; Book without OTP
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </>
                )}
              </Button>
              <p className="text-[10px] text-center text-muted-foreground pt-1">
                <Smartphone className="w-2.5 h-2.5 inline mr-1" />
                We never share your number. Standard SMS charges may apply.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
