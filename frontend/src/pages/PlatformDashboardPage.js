/**
 * Phase 5 (Part A) — Platform Admin Dashboard.
 *
 * Sections (lightweight first pass — full polish in later phases):
 *   - Salon Management table (search, status filter, pagination)
 *   - Quick actions: Suspend, Reactivate, View-as (token printed to console for now)
 *   - Detail drawer with subscription override actions
 *
 * Other planned panels (Supplier approvals, Discount codes, Analytics,
 * Broadcast announcements) are placeholders for Phase 6 / Part B / D.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Shield, LogOut, Loader2, Crown, Search, Building2, Users, IndianRupee,
  AlertTriangle, Check, X, Eye, Pause, Play, Settings2, ArrowLeft, History,
  Clock, BadgePercent, Megaphone, BarChart3, Package, Tag, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import AnalyticsTab from '@/components/platform/AnalyticsTab';
import DiscountCodesTab from '@/components/platform/DiscountCodesTab';
import BroadcastTab from '@/components/platform/BroadcastTab';
import SuppliersTab from '@/components/platform/SuppliersTab';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const readAuth = () => {
  try {
    const raw = localStorage.getItem('platform_admin_auth')
      || sessionStorage.getItem('platform_admin_auth');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    // Complimentary / lifetime grants are stored as year 3026 (1000-year expiry).
    // Show a friendlier "Unlimited" label instead of a nonsense year.
    if (d.getFullYear() >= 2100) return 'Unlimited';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
};
const fmtTs = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-IN'); } catch { return iso; }
};
const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const StatusPill = ({ status, is_premium, is_platform_granted, grant_type }) => {
  if (status === 'suspended') {
    return <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">Suspended</span>;
  }
  if (is_platform_granted) {
    return <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">{grant_type === 'comp' ? 'Comp' : 'Granted'}</span>;
  }
  if (is_premium) {
    return <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Active</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-zinc-500/15 text-foreground/80 border border-zinc-500/30">Free</span>;
};

export default function PlatformDashboardPage() {
  const navigate = useNavigate();
  const auth = readAuth();
  const token = auth?.token;
  const admin = auth?.admin;

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('salons'); // salons | suppliers | discounts | analytics | broadcast

  // Salon table state
  const [salons, setSalons] = useState([]);
  const [totalSalons, setTotalSalons] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tableLoading, setTableLoading] = useState(false);

  // Detail drawer state
  const [detail, setDetail] = useState(null);   // full /salons/:id payload
  const [detailLoading, setDetailLoading] = useState(false);

  // Modal state for override actions
  const [modal, setModal] = useState(null); // {type, salonId} | null
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Suspend modal local state
  const [suspendReason, setSuspendReason] = useState('');

  // Override form state
  const [grantForm, setGrantForm] = useState({ duration_unit: 'days', duration_value: 90, max_branches: '', reason: '' });
  const [overrideForm, setOverrideForm] = useState({ max_branches: '', reason: '' });
  const [trialForm, setTrialForm] = useState({ days: 14, reason: '' });
  const [compForm, setCompForm] = useState({ max_branches: '', reason: '' });

  const logout = useCallback(() => {
    localStorage.removeItem('platform_admin_auth');
    sessionStorage.removeItem('platform_admin_auth');
    navigate('/platform/login', { replace: true });
  }, [navigate]);

  // Verify session
  useEffect(() => {
    if (!token) { navigate('/platform/login', { replace: true }); return; }
    axios.get(`${API}/platform/auth/me`, { headers })
      .then(r => setMe(r.data))
      .catch(() => { toast.error('Session expired'); logout(); })
      .finally(() => setLoading(false));
  }, [token, headers, navigate, logout]);

  // Salon list fetch
  const fetchSalons = useCallback(async () => {
    if (!token) return;
    setTableLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (q.trim()) params.set('q', q.trim());
      if (statusFilter) params.set('status', statusFilter);
      const r = await axios.get(`${API}/platform/salons?${params}`, { headers });
      setSalons(r.data.rows || []);
      setTotalSalons(r.data.total || 0);
    } catch (err) {
      toast.error('Failed to load salons');
    } finally {
      setTableLoading(false);
    }
  }, [token, headers, q, page, pageSize, statusFilter]);

  useEffect(() => { if (tab === 'salons') fetchSalons(); }, [tab, fetchSalons]);

  // Salon detail fetch
  const openDetail = async (salonId) => {
    setDetailLoading(true);
    setDetail({ loading: true, salon: { id: salonId } });
    try {
      const r = await axios.get(`${API}/platform/salons/${salonId}`, { headers });
      setDetail(r.data);
    } catch (err) {
      toast.error('Failed to load salon detail');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = () => { if (detail?.salon?.id) openDetail(detail.salon.id); };

  // Suspend / reactivate / view-as
  const handleSuspend = async (salonId, reason) => {
    if (!reason || reason.trim().length < 2) {
      toast.error('Please provide a suspension reason');
      return;
    }
    try {
      await axios.post(`${API}/platform/salons/${salonId}/suspend`, { reason }, { headers });
      toast.success('Salon suspended');
      setModal(null);
      setSuspendReason('');
      fetchSalons();
      if (detail?.salon?.id === salonId) refreshDetail();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Could not suspend salon');
    }
  };

  const handleReactivate = async (salonId) => {
    try {
      await axios.post(`${API}/platform/salons/${salonId}/reactivate`, {}, { headers });
      toast.success('Salon reactivated');
      fetchSalons();
      if (detail?.salon?.id === salonId) refreshDetail();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Could not reactivate salon');
    }
  };

  const handleViewAs = async (salonId) => {
    try {
      const r = await axios.post(`${API}/platform/salons/${salonId}/view-as`, {}, { headers });
      // Store the view-as token + expiry, then nav to the salon dashboard.
      localStorage.setItem('salon_view_as_token', JSON.stringify({
        token: r.data.token,
        salon_id: r.data.salon_id,
        salon_name: r.data.salon_name,
        expires_at: Date.now() + (r.data.expires_in_seconds * 1000),
        readonly: true,
      }));
      toast.success(`Opening "${r.data.salon_name}" in read-only mode (15 min)`);
      // For now we just toast a notice. Full salon-side guard arrives in Phase 6.
      window.open(`/?view_as_token=${encodeURIComponent(r.data.token)}`, '_blank');
    } catch (err) {
      toast.error('Could not generate view-as token');
    }
  };

  // Override submit handlers
  const submitGrantPro = async () => {
    const sid = modal.salonId;
    const val = Number(grantForm.duration_value || 0);
    if (!val || val < 1) {
      toast.error(`Duration must be at least 1 ${grantForm.duration_unit || 'day'}`); return;
    }
    if (!grantForm.reason.trim()) { toast.error('Reason is required'); return; }
    setModalSubmitting(true);
    try {
      const body = {
        duration_days: grantForm.duration_unit === 'days' ? val : null,
        duration_months: grantForm.duration_unit === 'months' ? val : null,
        max_branches: grantForm.max_branches ? Number(grantForm.max_branches) : null,
        reason: grantForm.reason.trim(),
      };
      await axios.post(`${API}/platform/salons/${sid}/subscription/grant-pro`, body, { headers });
      toast.success(`Granted ${val} ${grantForm.duration_unit} Pro access`);
      setModal(null);
      setGrantForm({ duration_unit: 'days', duration_value: 90, max_branches: '', reason: '' });
      fetchSalons();
      if (detail?.salon?.id === sid) refreshDetail();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Failed to grant access');
    } finally { setModalSubmitting(false); }
  };

  const submitOverrideBranches = async () => {
    const sid = modal.salonId;
    if (!overrideForm.max_branches || overrideForm.max_branches < 1) {
      toast.error('Max branches must be at least 1'); return;
    }
    if (!overrideForm.reason.trim()) { toast.error('Reason is required'); return; }
    setModalSubmitting(true);
    try {
      await axios.post(`${API}/platform/salons/${sid}/subscription/override-branches`, {
        max_branches: Number(overrideForm.max_branches),
        reason: overrideForm.reason.trim(),
      }, { headers });
      toast.success(`Branch cap set to ${overrideForm.max_branches}`);
      setModal(null);
      setOverrideForm({ max_branches: '', reason: '' });
      fetchSalons();
      if (detail?.salon?.id === sid) refreshDetail();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Failed to override branches');
    } finally { setModalSubmitting(false); }
  };

  const submitExtendTrial = async () => {
    const sid = modal.salonId;
    if (!trialForm.days || trialForm.days < 1) { toast.error('Days must be at least 1'); return; }
    if (!trialForm.reason.trim()) { toast.error('Reason is required'); return; }
    setModalSubmitting(true);
    try {
      await axios.post(`${API}/platform/salons/${sid}/subscription/extend-trial`, {
        days: Number(trialForm.days),
        reason: trialForm.reason.trim(),
      }, { headers });
      toast.success(`Trial extended by ${trialForm.days} days`);
      setModal(null);
      setTrialForm({ days: 14, reason: '' });
      fetchSalons();
      if (detail?.salon?.id === sid) refreshDetail();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Failed to extend trial');
    } finally { setModalSubmitting(false); }
  };

  const submitComp = async () => {
    const sid = modal.salonId;
    if (!compForm.reason.trim()) { toast.error('Reason is required'); return; }
    setModalSubmitting(true);
    try {
      await axios.post(`${API}/platform/salons/${sid}/subscription/comp`, {
        reason: compForm.reason.trim(),
        max_branches: compForm.max_branches ? Number(compForm.max_branches) : null,
      }, { headers });
      toast.success('Complimentary access granted');
      setModal(null);
      setCompForm({ max_branches: '', reason: '' });
      fetchSalons();
      if (detail?.salon?.id === sid) refreshDetail();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Failed to grant comp access');
    } finally { setModalSubmitting(false); }
  };

  const revokeOverride = async (salonId, overrideId) => {
    if (!window.confirm('Revoke this override? This will reverse its effects.')) return;
    try {
      await axios.post(
        `${API}/platform/salons/${salonId}/subscription/revoke-override/${overrideId}`,
        {}, { headers }
      );
      toast.success('Override revoked');
      fetchSalons();
      if (detail?.salon?.id === salonId) refreshDetail();
    } catch (err) {
      toast.error('Failed to revoke override');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!me) return null;

  // Detail view
  if (detail) {
    const s = detail.salon || {};
    const ss = detail.subscription_state || {};
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <button
            onClick={() => setDetail(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back to salons
          </button>

          {detailLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">{s.salon_name}</h1>
                  <p className="text-sm text-muted-foreground/80 mt-1">{s.owner_name} · {s.phone} · {s.city || '—'}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusPill status={s.status || 'active'} is_premium={ss.is_premium} is_platform_granted={ss.is_platform_granted} grant_type={ss.grant_type} />
                    {s.suspension_reason && (
                      <span className="text-xs text-rose-400">Reason: {s.suspension_reason}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={refreshDetail}><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>
                  {(s.status || 'active') === 'suspended' ? (
                    <Button size="sm" onClick={() => handleReactivate(s.id)} className="bg-emerald-600 hover:bg-emerald-700"><Play className="w-3 h-3 mr-1" /> Reactivate</Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => { setModal({ type: 'suspend', salonId: s.id }); setSuspendReason(''); }}><Pause className="w-3 h-3 mr-1" /> Suspend</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleViewAs(s.id)}><Eye className="w-3 h-3 mr-1" /> View as</Button>
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <SummaryCard icon={<Crown className="text-primary" />} label="Plan" value={ss.plan?.plan_name || '—'} sub={ss.is_premium ? `Renews ${fmtDate(ss.expiry_date)}` : 'Free'} />
                <SummaryCard icon={<Building2 className="text-sky-400" />} label="Active branches" value={ss.active_branch_count ?? detail.branches?.length ?? 0} sub={`Cap ${ss.max_branches_effective ?? '∞'}`} />
                <SummaryCard icon={<Users className="text-emerald-400" />} label="Staff" value={detail.staff_count ?? 0} sub="Active" />
                <SummaryCard icon={<IndianRupee className="text-violet-400" />} label="This month rev." value={fmtMoney(detail.this_month_revenue || 0)} sub="From bills" />
              </div>

              {/* Override action buttons */}
              <div className="bg-card/60 border border-border rounded-2xl p-5 mb-6">
                <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" /> Subscription overrides
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setModal({ type: 'grant_pro', salonId: s.id })} className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-foreground">
                    <Crown className="w-3 h-3 mr-1" /> Grant Pro (time-bound)
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setModal({ type: 'comp', salonId: s.id })}>
                    <BadgePercent className="w-3 h-3 mr-1" /> Comp (ongoing)
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setModal({ type: 'override_branches', salonId: s.id })}>
                    <Building2 className="w-3 h-3 mr-1" /> Override branches
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setModal({ type: 'extend_trial', salonId: s.id })}>
                    <Clock className="w-3 h-3 mr-1" /> Extend trial
                  </Button>
                </div>
              </div>

              {/* Active overrides */}
              {detail.active_overrides?.length > 0 && (
                <div className="bg-card/60 border border-primary/30 rounded-2xl p-5 mb-6">
                  <h2 className="text-base font-bold text-primary/90 mb-3 flex items-center gap-2">
                    <Check className="w-4 h-4" /> Active overrides ({detail.active_overrides.length})
                  </h2>
                  <div className="space-y-2">
                    {detail.active_overrides.map(o => (
                      <div key={o.id} className="flex items-center justify-between bg-background/50 border border-border rounded-lg p-3 text-sm">
                        <div className="flex-1">
                          <div className="font-medium text-foreground capitalize">{o.override_type.replace(/_/g, ' ')}</div>
                          <div className="text-xs text-muted-foreground/80 mt-0.5">
                            {Object.entries(o.override_details || {}).map(([k, v]) => v != null && `${k}: ${v}`).filter(Boolean).join(' · ')}
                          </div>
                          <div className="text-xs text-muted-foreground/80 mt-0.5">
                            {fmtTs(o.created_at)} · by {o.granted_by_admin_mobile} · "{o.reason}"
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" className="text-rose-400 hover:text-rose-300" onClick={() => revokeOverride(s.id, o.id)}>
                          <X className="w-3 h-3 mr-1" /> Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subscription history */}
              <div className="bg-card/60 border border-border rounded-2xl p-5 mb-6">
                <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" /> Subscription history
                </h2>
                {detail.subscription_history?.length === 0 ? (
                  <p className="text-sm text-muted-foreground/80">No subscriptions yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground/80 uppercase tracking-wider border-b border-border">
                          <th className="text-left py-2">Plan</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-left py-2">Payment</th>
                          <th className="text-right py-2">Amount</th>
                          <th className="text-left py-2">Start</th>
                          <th className="text-left py-2">Expiry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.subscription_history.map(sub => (
                          <tr key={sub.id} className="border-b border-border/50 last:border-0 text-foreground/80">
                            <td className="py-2">{sub.plan_name || '—'}</td>
                            <td className="py-2">{sub.subscription_status}</td>
                            <td className="py-2">{sub.payment_status}</td>
                            <td className="py-2 text-right">{fmtMoney(sub.total_amount ?? sub.price)}</td>
                            <td className="py-2">{fmtDate(sub.start_date)}</td>
                            <td className="py-2">{fmtDate(sub.expiry_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Override history (all, including revoked) */}
              {detail.override_history?.length > 0 && (
                <div className="bg-card/60 border border-border rounded-2xl p-5 mb-6">
                  <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
                    <History className="w-4 h-4 text-muted-foreground" /> Override history
                  </h2>
                  <div className="space-y-2 text-xs">
                    {detail.override_history.map(o => (
                      <div key={o.id} className={`p-3 rounded-lg border ${o.active ? 'border-primary/30 bg-primary/5' : 'border-border bg-background/30 opacity-60'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-foreground font-medium capitalize">{o.override_type.replace(/_/g, ' ')}</span>
                          {o.active ? (
                            <span className="text-emerald-400 text-[10px] uppercase tracking-wider font-bold">Active</span>
                          ) : (
                            <span className="text-muted-foreground/80 text-[10px] uppercase tracking-wider">Revoked {fmtDate(o.revoked_at)}</span>
                          )}
                        </div>
                        <div className="text-muted-foreground/80 mt-1">{fmtTs(o.created_at)} · {o.granted_by_admin_mobile}</div>
                        <div className="text-muted-foreground mt-1 italic">"{o.reason}"</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modals */}
        <OverrideModals
          modal={modal}
          setModal={setModal}
          submitting={modalSubmitting}
          suspendReason={suspendReason}
          setSuspendReason={setSuspendReason}
          handleSuspend={(reason) => handleSuspend(modal.salonId, reason)}
          grantForm={grantForm}
          setGrantForm={setGrantForm}
          submitGrantPro={submitGrantPro}
          overrideForm={overrideForm}
          setOverrideForm={setOverrideForm}
          submitOverrideBranches={submitOverrideBranches}
          trialForm={trialForm}
          setTrialForm={setTrialForm}
          submitExtendTrial={submitExtendTrial}
          compForm={compForm}
          setCompForm={setCompForm}
          submitComp={submitComp}
        />
      </div>
    );
  }

  // List view
  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <div className="border-b border-border bg-background/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">Platform Admin</h1>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/80">SalonHub control plane</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs hidden sm:block">
              <div className="text-foreground">{me.name || 'Owner'}</div>
              <div className="text-muted-foreground/80 font-mono">{me.mobile}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>

        {/* Section tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {[
            { id: 'salons', label: 'Salons', icon: Building2 },
            { id: 'suppliers', label: 'Suppliers', icon: Package },
            { id: 'discounts', label: 'Discount codes', icon: Tag },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'broadcast', label: 'Broadcast', icon: Megaphone },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => !t.disabled && setTab(t.id)}
              disabled={t.disabled}
              className={`px-4 py-2 text-xs uppercase tracking-widest font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap
                ${tab === t.id
                  ? 'border-amber-400 text-primary'
                  : t.disabled
                    ? 'border-transparent text-muted-foreground/60 cursor-not-allowed'
                    : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              title={t.disabled ? 'Coming in Phase 6 / Part B' : undefined}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
              {t.disabled && <span className="ml-1 text-[9px] text-muted-foreground/60">soon</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'salons' && (
          <>
            {/* Search + filter */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-muted-foreground/80 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Search by name, owner, mobile, email..."
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1); }}
                  className="pl-9 bg-background border-border text-foreground"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="bg-background border border-border text-foreground text-sm rounded-md px-3 h-10"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <Button variant="outline" size="sm" onClick={fetchSalons} disabled={tableLoading}>
                <RefreshCw className={`w-3 h-3 ${tableLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="bg-card/60 border border-border rounded-2xl overflow-hidden">
              {tableLoading ? (
                <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : salons.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground/80 text-sm">No salons found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-background/60">
                      <tr className="text-[10px] uppercase tracking-widest text-muted-foreground/80 border-b border-border">
                        <th className="text-left px-4 py-3 font-bold">Salon</th>
                        <th className="text-left px-4 py-3 font-bold">Owner</th>
                        <th className="text-left px-4 py-3 font-bold">Mobile</th>
                        <th className="text-center px-4 py-3 font-bold">Branches</th>
                        <th className="text-left px-4 py-3 font-bold">Plan</th>
                        <th className="text-left px-4 py-3 font-bold">Expiry</th>
                        <th className="text-left px-4 py-3 font-bold">Status</th>
                        <th className="text-right px-4 py-3 font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salons.map(s => (
                        <tr
                          key={s.id}
                          className="border-b border-border/40 last:border-0 hover:bg-background/40 cursor-pointer"
                          onClick={() => openDetail(s.id)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{s.salon_name}</div>
                            {s.city && <div className="text-xs text-muted-foreground/80">{s.city}</div>}
                          </td>
                          <td className="px-4 py-3 text-foreground/80">{s.owner_name || '—'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.phone}</td>
                          <td className="px-4 py-3 text-center text-foreground/80">{s.branches_count ?? 0}</td>
                          <td className="px-4 py-3 text-foreground/80 text-xs">{s.plan_name || '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(s.expiry_date)}</td>
                          <td className="px-4 py-3">
                            <StatusPill {...s} />
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              {(s.status || 'active') === 'suspended' ? (
                                <button onClick={() => handleReactivate(s.id)} className="p-1.5 rounded hover:bg-emerald-500/15 text-emerald-400" title="Reactivate"><Play className="w-3.5 h-3.5" /></button>
                              ) : (
                                <button onClick={() => { setModal({ type: 'suspend', salonId: s.id }); setSuspendReason(''); }} className="p-1.5 rounded hover:bg-rose-500/15 text-rose-400" title="Suspend"><Pause className="w-3.5 h-3.5" /></button>
                              )}
                              <button onClick={() => handleViewAs(s.id)} className="p-1.5 rounded hover:bg-sky-500/15 text-sky-400" title="View as"><Eye className="w-3.5 h-3.5" /></button>
                              <button onClick={() => openDetail(s.id)} className="p-1.5 rounded hover:bg-primary/15 text-primary" title="Open detail"><Settings2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalSalons > pageSize && (
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground/80">
                <div>Showing page {page} of {Math.ceil(totalSalons / pageSize)} · {totalSalons} salons</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>
                  <Button size="sm" variant="outline" disabled={page >= Math.ceil(totalSalons / pageSize)} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">
              <AlertTriangle className="inline w-3.5 h-3.5 text-primary mr-1 -mt-0.5" />
              Phase 5 complete: salon management, subscription overrides, view-as token, audit log. Suppliers, discount codes, analytics, and broadcast panels arrive in Phase 6 / Part B / Part D.
            </div>
          </>
        )}

        {tab === 'suppliers' && <SuppliersTab headers={headers} />}
        {tab === 'discounts' && <DiscountCodesTab headers={headers} />}
        {tab === 'analytics' && <AnalyticsTab headers={headers} />}
        {tab === 'broadcast' && <BroadcastTab headers={headers} />}
      </div>

      <OverrideModals
        modal={modal}
        setModal={setModal}
        submitting={modalSubmitting}
        suspendReason={suspendReason}
        setSuspendReason={setSuspendReason}
        handleSuspend={(reason) => handleSuspend(modal.salonId, reason)}
        grantForm={grantForm}
        setGrantForm={setGrantForm}
        submitGrantPro={submitGrantPro}
        overrideForm={overrideForm}
        setOverrideForm={setOverrideForm}
        submitOverrideBranches={submitOverrideBranches}
        trialForm={trialForm}
        setTrialForm={setTrialForm}
        submitExtendTrial={submitExtendTrial}
        compForm={compForm}
        setCompForm={setCompForm}
        submitComp={submitComp}
      />
    </div>
  );
}

function SummaryCard({ icon, label, value, sub }) {
  return (
    <div className="bg-card/60 border border-border rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5">{icon}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">{label}</div>
      </div>
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground/80">{sub}</div>
    </div>
  );
}

function OverrideModals({
  modal, setModal, submitting,
  suspendReason, setSuspendReason, handleSuspend,
  grantForm, setGrantForm, submitGrantPro,
  overrideForm, setOverrideForm, submitOverrideBranches,
  trialForm, setTrialForm, submitExtendTrial,
  compForm, setCompForm, submitComp,
}) {
  if (!modal) return null;
  const { type } = modal;

  return (
    <Dialog open={!!modal} onOpenChange={(o) => !o && !submitting && setModal(null)}>
      <DialogContent className="max-w-md bg-background border-border text-foreground">
        <DialogHeader>
          <DialogTitle>
            {type === 'suspend' && 'Suspend salon'}
            {type === 'grant_pro' && 'Grant Pro access'}
            {type === 'override_branches' && 'Override branch cap'}
            {type === 'extend_trial' && 'Extend trial period'}
            {type === 'comp' && 'Grant complimentary access'}
          </DialogTitle>
        </DialogHeader>

        {type === 'suspend' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">The salon admin will be blocked from logging in until reactivated. Customer-facing pages may remain visible.</p>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Reason</label>
              <Input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} placeholder="e.g. payment dispute" className="mt-1 bg-card border-border" autoFocus />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button onClick={() => handleSuspend(suspendReason)} variant="destructive">Suspend</Button>
            </div>
          </div>
        )}

        {type === 'grant_pro' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Creates a granted subscription. The salon pays nothing for the duration.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Duration</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    min={1}
                    max={grantForm.duration_unit === 'days' ? 3650 : 120}
                    value={grantForm.duration_value}
                    onChange={(e) => setGrantForm({ ...grantForm, duration_value: e.target.value })}
                    className="flex-1 bg-card border-border"
                  />
                  <select
                    value={grantForm.duration_unit}
                    onChange={(e) => setGrantForm({ ...grantForm, duration_unit: e.target.value })}
                    className="h-9 px-2 rounded-md border border-border bg-card text-sm"
                  >
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                  </select>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Pick <b>Days</b> for short trials (e.g. 100 days) or <b>Months</b> for long grants.
                </div>
                {Number(grantForm.duration_value) > 0 && (
                  <div className="text-[11px] mt-1.5 text-emerald-600 dark:text-emerald-400">
                    Expiry preview:&nbsp;
                    <b>
                      {(() => {
                        const v = Number(grantForm.duration_value) || 0;
                        if (!v) return '—';
                        const d = new Date();
                        const days = grantForm.duration_unit === 'months' ? Math.round(30 * v) : v;
                        d.setDate(d.getDate() + days);
                        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                      })()}
                    </b>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Max branches</label>
                <Input type="number" min={1} value={grantForm.max_branches} onChange={(e) => setGrantForm({ ...grantForm, max_branches: e.target.value })} placeholder="∞" className="mt-1 bg-card border-border" />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Reason</label>
              <Input value={grantForm.reason} onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })} placeholder="e.g. beta partner" className="mt-1 bg-card border-border" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button onClick={submitGrantPro} disabled={submitting} className="bg-gradient-to-r from-primary to-primary/80 text-foreground">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Grant access'}
              </Button>
            </div>
          </div>
        )}

        {type === 'override_branches' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Raises (or lowers) the max-branches cap on the active subscription.</p>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">New max branches</label>
              <Input type="number" min={1} value={overrideForm.max_branches} onChange={(e) => setOverrideForm({ ...overrideForm, max_branches: e.target.value })} className="mt-1 bg-card border-border" autoFocus />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Reason</label>
              <Input value={overrideForm.reason} onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })} placeholder="e.g. seasonal expansion" className="mt-1 bg-card border-border" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button onClick={submitOverrideBranches} disabled={submitting} className="bg-gradient-to-r from-primary to-primary/80 text-foreground">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply override'}
              </Button>
            </div>
          </div>
        )}

        {type === 'extend_trial' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Pushes the salon's subscription expiry / trial-end by N days.</p>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Days</label>
              <Input type="number" min={1} value={trialForm.days} onChange={(e) => setTrialForm({ ...trialForm, days: e.target.value })} className="mt-1 bg-card border-border" autoFocus />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Reason</label>
              <Input value={trialForm.reason} onChange={(e) => setTrialForm({ ...trialForm, reason: e.target.value })} placeholder="e.g. onboarding extension" className="mt-1 bg-card border-border" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button onClick={submitExtendTrial} disabled={submitting} className="bg-gradient-to-r from-primary to-primary/80 text-foreground">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Extend'}
              </Button>
            </div>
          </div>
        )}

        {type === 'comp' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Ongoing complimentary access — no expiry. Revoke this override to remove access later.</p>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Max branches (optional)</label>
              <Input type="number" min={1} value={compForm.max_branches} onChange={(e) => setCompForm({ ...compForm, max_branches: e.target.value })} placeholder="∞" className="mt-1 bg-card border-border" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Reason</label>
              <Input value={compForm.reason} onChange={(e) => setCompForm({ ...compForm, reason: e.target.value })} placeholder="e.g. partner salon" className="mt-1 bg-card border-border" autoFocus />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button onClick={submitComp} disabled={submitting} className="bg-gradient-to-r from-primary to-primary/80 text-foreground">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Grant comp'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
