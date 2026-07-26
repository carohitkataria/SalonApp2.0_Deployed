import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  Crown, Check, AlertTriangle, Loader2, ReceiptText, Building2, Info, Tag, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const getAuthHeaders = () => {
  const salonUserAuth = localStorage.getItem('salon_user_auth');
  if (salonUserAuth) {
    try {
      const authData = JSON.parse(salonUserAuth);
      return { Authorization: `Bearer ${authData.token}` };
    } catch (e) { /* ignore */ }
  }
  const legacyToken = localStorage.getItem('salon_admin_token');
  return legacyToken ? { Authorization: `Bearer ${legacyToken}` } : {};
};

const fmtDate = (iso) => {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (d.getFullYear() >= 2100) return 'Unlimited';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

const fmtMoney = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function SubscriptionPanel({ salonId }) {
  const {
    status, plan, refresh, loading, openPaywall, isPremium,
    setAppliedDiscount, clearAppliedDiscount, appliedDiscountCode,
  } = useSubscription();
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);

  // Trial eligibility: not premium AND backend says trial has never been used.
  const trialUsed = Boolean(status?.trial_used);
  const isTrial = Boolean(status?.is_trial);
  const canStartTrial = !isPremium && !trialUsed;

  const handleStartTrial = async () => {
    if (!salonId) return;
    setTrialLoading(true);
    try {
      await axios.post(
        `${API}/salons/${salonId}/subscription/start-trial`,
        {},
        { headers: getAuthHeaders() }
      );
      toast.success('30-day free trial activated!');
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not start trial');
    } finally {
      setTrialLoading(false);
    }
  };

  // Discount code preview state (Phase 3 wires the UI; Phase 4 validates; Phase 7 carries to checkout)
  const [codeInput, setCodeInput] = useState(appliedDiscountCode || '');
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const fetchTx = useCallback(async () => {
    if (!salonId) return;
    setTxLoading(true);
    try {
      const r = await axios.get(
        `${API}/salons/${salonId}/subscription/transactions`,
        { headers: getAuthHeaders() }
      );
      setTransactions(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      // ignore — user may not be admin in some legacy configs
    } finally {
      setTxLoading(false);
    }
  }, [salonId]);

  const fetchQuote = useCallback(async (code = null) => {
    if (!salonId) return;
    setQuoteLoading(true);
    try {
      const params = code ? `?discount_code=${encodeURIComponent(code)}` : '';
      const r = await axios.get(
        `${API}/salons/${salonId}/subscription/quote${params}`
      );
      setQuote(r.data);
      if (code && r.data?.discount_details && !r.data.discount_details.valid) {
        toast.error(r.data.discount_details.reason || 'Discount code not valid');
        clearAppliedDiscount();
      } else if (code && r.data?.discount_amount > 0) {
        toast.success(`Code ${code} applied — saved ${fmtMoney(r.data.discount_amount)}`);
        setAppliedDiscount(code, r.data);
      } else if (!code) {
        // Initial quote without a code — clear any stale applied code
        clearAppliedDiscount();
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Could not fetch quote');
      clearAppliedDiscount();
    } finally {
      setQuoteLoading(false);
    }
  }, [salonId, setAppliedDiscount, clearAppliedDiscount]);

  useEffect(() => {
    fetchTx();
    fetchQuote();
  }, [fetchTx, fetchQuote]);

  const expired = status?.status === 'expired';

  // Phase 2 (Part C) — per-branch pricing breakdown
  const pricePerBranch = Number(
    status?.price_per_branch ?? quote?.price_per_branch ?? plan?.price_per_branch ?? plan?.price ?? 499
  );
  const billableBranchCount = Number(
    status?.billable_branch_count ?? quote?.billable_branch_count ?? 1
  );
  const activeBranchCount = Number(
    status?.active_branch_count ?? billableBranchCount
  );
  const baseAmount = Number(status?.base_amount ?? quote?.base_amount ?? pricePerBranch * billableBranchCount);
  const totalAmount = Number(status?.total_amount ?? quote?.total_amount ?? baseAmount);
  const discountCode = quote?.discount_code_applied || status?.discount_code_applied;
  const discountAmount = Number(quote?.discount_amount ?? status?.discount_amount ?? 0);
  const nextRenewalAmount = Number(status?.next_renewal_amount ?? pricePerBranch * activeBranchCount);
  const branchesAddedMidCycle = Boolean(status?.branches_added_mid_cycle);

  const handleApplyCode = () => {
    const code = codeInput.trim();
    if (!code) {
      toast.error('Enter a discount code');
      return;
    }
    fetchQuote(code);
  };

  const handleClearCode = () => {
    setCodeInput('');
    fetchQuote();
  };

  return (
    <div className="space-y-6" data-testid="subscription-panel">
      <div className="flex items-center gap-3">
        <Crown className="w-7 h-7 text-amber-400" />
        <div>
          <h2 className="text-2xl font-playfair font-bold text-foreground">Subscription</h2>
          <p className="text-sm text-muted-foreground">Per-branch SalonHub Pro pricing</p>
        </div>
      </div>

      {/* Active-trial banner */}
      {isTrial && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3" data-testid="trial-active-banner">
          <Crown className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-foreground">
            You&apos;re on the <span className="font-semibold">30-day free trial</span>.
            {typeof status?.days_remaining === 'number' && (
              <> {status.days_remaining} day{status.days_remaining === 1 ? '' : 's'} remaining — subscribe before it ends to keep premium features.</>
            )}
          </p>
        </div>
      )}

      {/* Start-free-trial CTA */}
      {canStartTrial && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-testid="start-trial-card">
          <div className="flex items-start gap-3">
            <Crown className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-foreground">Start your 30-day free trial</p>
              <p className="text-xs text-muted-foreground mt-0.5">Unlock multi-branch, payroll, loyalty & analytics free for 1 month.</p>
            </div>
          </div>
          <Button
            onClick={handleStartTrial}
            disabled={trialLoading}
            className="bg-emerald-500 hover:bg-emerald-600 text-white shrink-0"
            data-testid="panel-start-trial-btn"
          >
            {trialLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Activate free trial
          </Button>
        </div>
      )}

      {/* Status card */}
      <div
        className={`rounded-2xl border p-6 ${
          isPremium
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : expired
            ? 'border-rose-500/40 bg-rose-500/5'
            : 'border-amber-500/30 bg-amber-500/5'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {isPremium ? (
                <span className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-emerald-400 font-semibold">
                  <Check className="w-3 h-3" /> Active
                </span>
              ) : expired ? (
                <span className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-rose-400 font-semibold">
                  <AlertTriangle className="w-3 h-3" /> Expired
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-amber-400 font-semibold">
                  Free Plan
                </span>
              )}
            </div>
            <h3 className="text-xl font-bold text-foreground">
              {isPremium || expired ? plan?.plan_name || 'SalonHub Pro' : 'Free Plan'}
            </h3>

            {/* Per-branch breakdown line */}
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5 flex-wrap">
              <Building2 className="w-3.5 h-3.5" />
              {fmtMoney(pricePerBranch)}/month/branch &nbsp;×&nbsp;{' '}
              <span className="text-foreground font-medium">
                {billableBranchCount} branch{billableBranchCount === 1 ? '' : 'es'}
              </span>{' '}
              = <span className="text-foreground font-semibold">{fmtMoney(baseAmount)}/month</span>
            </p>

            {/* Active discount line */}
            {discountCode && discountAmount > 0 && (
              <p className="text-sm text-emerald-400 mt-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                Code <span className="font-mono font-semibold">{discountCode}</span> applied — save {fmtMoney(discountAmount)}
              </p>
            )}

            {isPremium && status?.expiry_date && (
              <p className="text-sm text-muted-foreground mt-2">
                Next renewal on{' '}
                <span className="text-foreground font-medium">{fmtDate(status.expiry_date)}</span>
                {typeof status.days_remaining === 'number' && (
                  <> &nbsp;·&nbsp; {status.days_remaining} day{status.days_remaining === 1 ? '' : 's'} remaining</>
                )}
              </p>
            )}
            {expired && (
              <p className="text-sm text-rose-300 mt-2">
                Your premium features have stopped working. Existing data is safe and visible. Renew to unlock again.
              </p>
            )}
            {!isPremium && !expired && (
              <p className="text-sm text-muted-foreground mt-2">
                You're on the free plan. Upgrade to add multiple staff & branches.
              </p>
            )}
          </div>

          <div className="text-right">
            <div className="text-3xl font-bold text-foreground">
              {fmtMoney(totalAmount)}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                /{plan?.billing_cycle === 'yearly' ? 'year' : 'month'}
              </span>
            </div>
            <Button
              onClick={() => openPaywall()}
              className="mt-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
            >
              {isPremium ? 'Renew Now' : expired ? 'Re-subscribe' : 'Subscribe Now'}
            </Button>
          </div>
        </div>

        {plan?.features?.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {plan.features.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Next renewal banner — only if premium & there is a clear next-renewal amount */}
      {isPremium && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Your next renewal on{' '}
            <span className="text-foreground font-medium">{fmtDate(status?.expiry_date)}</span> will be{' '}
            <span className="text-foreground font-semibold">{fmtMoney(nextRenewalAmount)}</span> for{' '}
            <span className="text-foreground font-medium">
              {activeBranchCount} branch{activeBranchCount === 1 ? '' : 'es'}
            </span>
            .
          </p>
        </div>
      )}

      {/* Mid-cycle banner — only when branches were added after the last paid period */}
      {branchesAddedMidCycle && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 flex items-start gap-3">
          <Building2 className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            New branches added mid-cycle are billed from your next renewal.
          </p>
        </div>
      )}

      {/* Discount code input */}
      <div className="rounded-2xl border border-border bg-card/40 p-6">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-3">
          <Tag className="w-5 h-5 text-amber-400" />
          Discount code
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Have a promo code? Apply it here to see the discounted price before checkout.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Enter discount code"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            className="sm:max-w-xs"
            disabled={quoteLoading}
          />
          <Button
            onClick={handleApplyCode}
            disabled={quoteLoading || !codeInput.trim()}
            className="bg-zinc-800 hover:bg-zinc-700 text-white"
          >
            {quoteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
          </Button>
          {discountCode && (
            <Button variant="ghost" onClick={handleClearCode} disabled={quoteLoading}>
              <X className="w-4 h-4 mr-1" /> Remove
            </Button>
          )}
        </div>
      </div>

      {/* Transaction history */}
      <div className="rounded-2xl border border-border bg-card/40 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-amber-400" />
            Payment History
          </h3>
          <Button variant="ghost" size="sm" onClick={() => { fetchTx(); refresh(); fetchQuote(); }} disabled={loading || txLoading}>
            {(loading || txLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        {txLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No payments yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="py-2 text-left font-medium">Date</th>
                  <th className="py-2 text-left font-medium">Order ID</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                  <th className="py-2 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/40 last:border-0">
                    <td className="py-3">{fmtDate(tx.created_at)}</td>
                    <td className="py-3 font-mono text-xs text-muted-foreground">
                      {tx.gateway_order_id || tx.id?.slice(0, 12)}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {fmtMoney(tx.amount)}
                    </td>
                    <td className="py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          tx.payment_status === 'success'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : tx.payment_status === 'failed'
                            ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {tx.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
