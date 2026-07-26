import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CreditCard, CheckCircle2, Clock, ShieldCheck, Smartphone, Landmark, RefreshCw } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Lets a salon admin set up in-app "Pay Online" by registering as a Cashfree
 * Easy Split vendor (UPI VPA or bank account + optional PAN). Cashfree verifies
 * asynchronously; until the vendor is ACTIVE, customers only see cash / direct
 * UPI. We poll status so a completed verification flips the salon live on its own.
 *
 * Props: salon (object with id), getAuthHeaders (fn).
 */
export default function PaymentVendorSetup({ salon, getAuthHeaders }) {
  const salonId = salon?.id;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [vendor, setVendor] = useState(null); // {onboarded, status, in_app_payment_enabled, method, masked_destination}
  const [method, setMethod] = useState('upi'); // 'upi' | 'bank'
  const [form, setForm] = useState({ upi_vpa: '', bank_account_number: '', bank_ifsc: '', account_holder: '', pan: '' });
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    if (!salonId) return;
    try {
      const res = await axios.get(`${API}/salons/${salonId}/payment-vendor/status`, { headers: getAuthHeaders() });
      setVendor(res.data);
      // Prefill UPI from the salon's on-file id the first time.
      if (!res.data?.onboarded && salon?.upi_id) {
        setForm((f) => ({ ...f, upi_vpa: f.upi_vpa || salon.upi_id }));
      }
      return res.data;
    } catch (e) {
      // 404-ish / not initialised — treat as not onboarded, don't spam errors.
      setVendor({ onboarded: false, status: null, in_app_payment_enabled: false });
      return null;
    } finally {
      setLoading(false);
    }
  }, [salonId, getAuthHeaders, salon?.upi_id]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // While verification is pending, poll every 8s (max ~2min) so the card flips
  // to "live" without the admin refreshing.
  useEffect(() => {
    const pending = vendor?.onboarded && !vendor?.in_app_payment_enabled;
    if (!pending) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks += 1;
      const data = await fetchStatus();
      if ((data && data.in_app_payment_enabled) || ticks >= 15) {
        clearInterval(pollRef.current); pollRef.current = null;
      }
    }, 8000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [vendor?.onboarded, vendor?.in_app_payment_enabled, fetchStatus]);

  const submit = async () => {
    // Client-side validation to catch obvious mistakes before hitting Cashfree.
    if (method === 'upi') {
      if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test((form.upi_vpa || '').trim())) {
        toast.error('Enter a valid UPI ID, e.g. salonname@okhdfcbank'); return;
      }
    } else {
      if (!/^\d{6,18}$/.test((form.bank_account_number || '').trim())) { toast.error('Enter a valid bank account number'); return; }
      if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test((form.bank_ifsc || '').trim())) { toast.error('Enter a valid IFSC code'); return; }
    }
    if (form.pan && !/^[A-Za-z]{5}\d{4}[A-Za-z]$/.test(form.pan.trim())) { toast.error('PAN looks invalid (e.g. ABCDE1234F)'); return; }

    const body = method === 'upi'
      ? { upi_vpa: form.upi_vpa.trim(), account_holder: form.account_holder.trim() || undefined, pan: form.pan.trim() || undefined }
      : { bank_account_number: form.bank_account_number.trim(), bank_ifsc: form.bank_ifsc.trim().toUpperCase(), account_holder: form.account_holder.trim() || undefined, pan: form.pan.trim() || undefined };

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/salons/${salonId}/payment-vendor/onboard`, body, { headers: getAuthHeaders() });
      toast.success(res.data?.message || 'Details submitted for verification.');
      await fetchStatus();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Could not submit. Please check the details and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-3 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading payment setup…
      </div>
    );
  }

  const isLive = !!vendor?.in_app_payment_enabled;
  const isPending = vendor?.onboarded && !isLive;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-gold/10 rounded-xl">
          <CreditCard className="w-5 h-5 text-gold" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-card-foreground">Accept payments in the app</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Let customers pay for bookings by UPI, card or net banking. Money settles
            directly to you — SalonHub takes no cut.
          </p>
        </div>
      </div>

      {/* Status banners */}
      {isLive && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-foreground">Online payments are live</p>
            <p className="text-muted-foreground">
              Payouts to {vendor?.method === 'bank' ? 'bank account' : 'UPI'}{' '}
              <span className="font-mono">{vendor?.masked_destination}</span>. Cashfree fees are netted from your payout.
            </p>
          </div>
        </div>
      )}

      {isPending && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <Clock className="w-6 h-6 text-amber-500 flex-shrink-0" />
          <div className="text-sm flex-1">
            <p className="font-bold text-foreground">Verification in progress</p>
            <p className="text-muted-foreground">
              We're verifying your {vendor?.method === 'bank' ? 'bank account' : 'UPI ID'}. This usually
              finishes within a few minutes — this page updates automatically.
              {vendor?.status ? <span className="font-mono ml-1">({vendor.status})</span> : null}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={fetchStatus} className="flex-shrink-0">
            <RefreshCw className="w-4 h-4 mr-1" /> Check
          </Button>
        </div>
      )}

      {/* Form — shown when not yet live (lets salon submit or re-submit details) */}
      {!isLive && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMethod('upi')}
              className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                method === 'upi' ? 'bg-gold/10 border-gold text-foreground' : 'bg-background border-border text-muted-foreground hover:border-gold/40'
              }`}
            >
              <Smartphone className="w-4 h-4" /> UPI ID
            </button>
            <button
              type="button"
              onClick={() => setMethod('bank')}
              className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                method === 'bank' ? 'bg-gold/10 border-gold text-foreground' : 'bg-background border-border text-muted-foreground hover:border-gold/40'
              }`}
            >
              <Landmark className="w-4 h-4" /> Bank account
            </button>
          </div>

          {method === 'upi' ? (
            <div>
              <Label htmlFor="upi_vpa">UPI ID (VPA)</Label>
              <Input
                id="upi_vpa"
                placeholder="salonname@okhdfcbank"
                value={form.upi_vpa}
                onChange={(e) => setForm({ ...form, upi_vpa: e.target.value })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="acct">Account number</Label>
                <Input id="acct" inputMode="numeric" value={form.bank_account_number}
                  onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ifsc">IFSC code</Label>
                <Input id="ifsc" placeholder="HDFC0001234" value={form.bank_ifsc}
                  onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value.toUpperCase() })} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="holder">Account holder name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="holder" value={form.account_holder}
                onChange={(e) => setForm({ ...form, account_holder: e.target.value })} placeholder={salon?.owner_name || salon?.salon_name || ''} />
            </div>
            <div>
              <Label htmlFor="pan">PAN <span className="text-muted-foreground font-normal">(optional, speeds up KYC)</span></Label>
              <Input id="pan" placeholder="ABCDE1234F" value={form.pan}
                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} />
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-600" />
            <span>Your bank details go straight to Cashfree for verification and settlement. SalonHub never stores your full account number.</span>
          </div>

          <Button onClick={submit} disabled={submitting}
            className="w-full bg-gold text-black hover:bg-gold/90 font-bold py-5 rounded-xl disabled:opacity-50">
            {submitting ? 'Submitting…' : (isPending ? 'Resubmit details' : 'Set up online payments')}
          </Button>
        </div>
      )}
    </div>
  );
}
