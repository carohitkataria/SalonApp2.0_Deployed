/**
 * SalonHomeNew.js — Redesigned salon Home dashboard.
 *
 * Layout follows the SalonHome_Prototype.html spec:
 *   1. Greeting + Today/Tomorrow toggle + Live indicator
 *   2. Primary KPI strip (5 tiles, colourful) — clickable → drills into relevant tab
 *   3. Secondary metric pills (6) — clickable
 *   4. Quick actions (6 tiles including New Booking + Quick Invoice)
 *   5. Main grid: LEFT compact Upcoming Queue with inline actions; RIGHT quick-help widgets
 *   6. Insights A (3 cards): Staff leaderboard · Targets · Reviews
 *   7. Insights B (4 small charts): Revenue 7d · Payment mix · Top services · Busy hours
 *
 * Container capped at max-w-[1180px] so laptops/tablets render everything at intended
 * scale without stretching; content is fluid on phones.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Calendar, Clock, CheckCircle, DollarSign, Users, Scissors, TrendingUp,
  Zap, Phone as PhoneIcon, PhoneCall, User as UserIcon, ArrowRight, Star,
  Wallet as WalletIcon, TicketPercent, ShoppingBag, RefreshCcw, BadgeCheck,
  UserPlus, Ticket, ChevronRight, Sparkles, FileText, Send, Bell,
} from 'lucide-react';
import StaffCheckInWidget from '@/components/StaffCheckInWidget';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const KPI_TINTS = {
  gold: 'from-amber-400/20 to-amber-500/5 border-amber-500/30 text-amber-600 dark:text-amber-400',
  indigo: 'from-indigo-400/20 to-indigo-500/5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400',
  emerald: 'from-emerald-400/20 to-emerald-500/5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  rose: 'from-rose-400/20 to-rose-500/5 border-rose-500/30 text-rose-600 dark:text-rose-400',
  sky: 'from-sky-400/20 to-sky-500/5 border-sky-500/30 text-sky-600 dark:text-sky-400',
  violet: 'from-violet-400/20 to-violet-500/5 border-violet-500/30 text-violet-600 dark:text-violet-400',
  teal: 'from-teal-400/20 to-teal-500/5 border-teal-500/30 text-teal-600 dark:text-teal-400',
  pink: 'from-pink-400/20 to-pink-500/5 border-pink-500/30 text-pink-600 dark:text-pink-400',
  orange: 'from-orange-400/20 to-orange-500/5 border-orange-500/30 text-orange-600 dark:text-orange-400',
  lime: 'from-lime-400/20 to-lime-500/5 border-lime-500/30 text-lime-600 dark:text-lime-400',
};

const PILL_TINTS = {
  blue: 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400',
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  violet: 'bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400',
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400',
  teal: 'bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400',
};

export default function SalonHomeNew({
  salon,
  salonId,
  tokens = [],
  barbers = [],
  dateMode = 'today',
  setDateMode,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  dailySales = 0,
  goToTab,
  navigate: navigateProp,
  getAuthHeaders,
  handleCallToken,
  handleCompleteToken,
  handleOpenManualBooking,   // legacy modal fallback
  checkIsAdmin,
  checkIsBranchManager,
  checkHasPermission,
  salonUser,
}) {
  const navigateHook = useNavigate();
  const navigate = navigateProp || navigateHook;
  const [kpis, setKpis] = useState(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [barberFilter, setBarberFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchKpis();
    const t = setInterval(fetchKpis, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, dateMode, dateFrom, dateTo]);

  const fetchKpis = async () => {
    if (!salonId) return;
    setRefreshing(true);
    try {
      let url = `${API}/salons/${salonId}/home-kpis?date_mode=${dateMode || 'today'}`;
      if (dateMode === 'range' && dateFrom) url += `&date_from=${dateFrom}`;
      if (dateMode === 'range' && dateTo) url += `&date_to=${dateTo}`;
      const res = await axios.get(url, { headers: getAuthHeaders?.() || {} });
      setKpis(res.data);
    } catch (err) {
      console.warn('home-kpis fetch failed', err);
    } finally {
      setLoadingKpis(false);
      setRefreshing(false);
    }
  };

  const now = new Date();
  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const upcoming = useMemo(() => {
    return tokens
      .filter((t) => t.status === 'waiting' || t.status === 'called')
      .filter((t) => barberFilter === 'all' || t.barber_id === barberFilter)
      .slice(0, 6);
  }, [tokens, barberFilter]);

  const unpaid = useMemo(
    () => tokens.filter((t) => !t.payment_confirmed && (t.status === 'waiting' || t.status === 'called' || t.status === 'completed')),
    [tokens]
  );

  const primary = kpis?.primary || {};
  const secondary = kpis?.secondary || {};
  const staffLeaderboard = kpis?.staff_leaderboard || [];
  const reviews = kpis?.reviews || { avg_rating: 0, total_reviews: 0, distribution: {} };
  const targets = kpis?.targets || {};
  const revenue7d = kpis?.revenue_7d || [];
  const paymentMix = kpis?.payment_mix || {};
  const topServices = kpis?.top_services || [];
  const busyHours = kpis?.busy_hours || {};

  // Sparkline scaling
  const maxRev = Math.max(1, ...revenue7d.map((d) => Number(d.total || 0)));
  const paymentTotal = Object.values(paymentMix).reduce((a, b) => a + Number(b), 0) || 1;
  const paymentColors = { cash: '#10b981', upi: '#3b82f6', card: '#a855f7', wallet: '#f59e0b', unknown: '#6b7280' };
  const busyMax = Math.max(1, ...Object.values(busyHours).map(Number));

  const monthlyPct = Math.min(100, (Number(targets.monthly_actual || 0) * 100) / Math.max(1, Number(targets.monthly_target || 1)));
  const dailyPct = Math.min(100, (Number(targets.daily_actual || 0) * 100) / Math.max(1, Number(targets.daily_target || 1)));
  const memPct = Math.min(100, (Number(targets.membership_actual || 0) * 100) / Math.max(1, Number(targets.membership_target || 1)));

  return (
    <div className="max-w-[1180px] mx-auto space-y-4">
      {/* 1. Greeting row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-playfair font-bold text-foreground">
            {greeting}, <span className="text-gold">{salon?.salon_name || salon?.name || 'Salon'}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {['today', 'yesterday'].map((m) => (
              <button
                key={m}
                onClick={() => setDateMode && setDateMode(m)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                  dateMode === m ? 'bg-gold text-black' : 'text-foreground hover:bg-muted'
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
            <button
              onClick={() => setDateMode && setDateMode('range')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                dateMode === 'range' ? 'bg-gold text-black' : 'text-foreground hover:bg-muted'
              }`}
              title="Custom range"
            >
              Range
            </button>
          </div>
          {dateMode === 'range' && (
            <div className="inline-flex gap-1 items-center text-[11px]">
              <input type="date" value={dateFrom || ''} onChange={(e) => setDateFrom && setDateFrom(e.target.value)} className="h-7 px-1.5 rounded-md border border-border bg-background" />
              <span className="text-muted-foreground">→</span>
              <input type="date" value={dateTo || ''} onChange={(e) => setDateTo && setDateTo(e.target.value)} className="h-7 px-1.5 rounded-md border border-border bg-background" />
            </div>
          )}
          <button
            onClick={fetchKpis}
            className="p-1.5 rounded-lg border border-border hover:bg-muted"
            title="Refresh KPIs"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
            <span className="text-[10px] text-emerald-500 font-bold">LIVE</span>
          </div>
        </div>
      </div>

      {/* Staff self check-in */}
      {salonUser?.staffId && salonId && (
        <StaffCheckInWidget salonId={salonId} staffId={salonUser.staffId} getAuthHeaders={getAuthHeaders} />
      )}

      {/* 2. Primary KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <KpiCard
          tint="gold"
          label="Today's Sales"
          value={`₹${Number(primary.today_sales || dailySales || 0).toLocaleString('en-IN')}`}
          icon={DollarSign}
          onClick={() => goToTab && goToTab('analytics')}
        />
        <KpiCard
          tint="indigo"
          label="Rebooking Rate"
          value={`${Number(primary.rebooking_rate || 0)}%`}
          icon={RefreshCcw}
          onClick={() => goToTab && goToTab('customer-master')}
        />
        <KpiCard
          tint="emerald"
          label="Avg Ticket"
          value={`₹${Number(primary.avg_ticket || 0).toLocaleString('en-IN')}`}
          icon={Ticket}
          onClick={() => goToTab && goToTab('analytics')}
        />
        <KpiCard
          tint="rose"
          label="No-Show Rate"
          value={`${Number(primary.no_show_rate || 0)}%`}
          icon={Bell}
          onClick={() => goToTab && goToTab('queue')}
        />
        <KpiCard
          tint="sky"
          label="Chair Utilization"
          value={`${Number(primary.chair_utilization || 0)}%`}
          icon={Scissors}
          onClick={() => goToTab && goToTab('staff')}
        />
      </div>

      {/* 3. Secondary metric pills */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <MetricPill tint="blue" label="Appointments" value={secondary.appointments_count || tokens.length || 0} onClick={() => goToTab && goToTab('queue')} icon={Calendar} />
        <MetricPill tint="emerald" label="New Customers" value={secondary.new_clients_count || 0} onClick={() => navigate('/salon/dashboard?tab=customer-master&filter=new')} icon={UserPlus} />
        <MetricPill tint="violet" label="Retention" value={`${Number(secondary.retention_rate || 0)}%`} onClick={() => goToTab && goToTab('customer-master')} icon={Sparkles} />
        <MetricPill tint="amber" label="Retail Sales" value={`₹${Number(secondary.retail_sales || 0).toLocaleString('en-IN')}`} onClick={() => goToTab && goToTab('inventory')} icon={ShoppingBag} />
        <MetricPill tint="rose" label="Reminders" value={`${Number(secondary.reminder_confirmation_rate || 0)}%`} onClick={() => goToTab && goToTab('marketing')} icon={Send} />
        <MetricPill tint="teal" label="Waitlist" value={secondary.waitlist_count || 0} onClick={() => goToTab && goToTab('queue')} icon={Users} />
      </div>

      {/* 4. Quick actions */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <QuickAction
          label="New Booking"
          desc="Book / Invoice"
          icon={Calendar}
          tint="from-amber-400 to-yellow-500"
          onClick={() => window.dispatchEvent(new CustomEvent('salon:open-new-appointment'))}
          testId="quick-new-booking"
        />
        <QuickAction
          label="Quick Invoice"
          desc="Bill without queue"
          icon={FileText}
          tint="from-emerald-400 to-teal-500"
          onClick={() => window.dispatchEvent(new CustomEvent('salon:open-new-appointment'))}
          testId="quick-invoice"
        />
        <QuickAction
          label="Sell Membership"
          desc="Wallet top-up"
          icon={BadgeCheck}
          tint="from-violet-400 to-purple-500"
          onClick={() => navigate('/salon/dashboard/sell-membership')}
          testId="quick-membership"
        />
        <QuickAction
          label="Add Customer"
          desc="Quick create"
          icon={UserPlus}
          tint="from-blue-400 to-indigo-500"
          onClick={() => navigate('/salon/dashboard/add-customer')}
          testId="quick-add-customer"
        />
        <QuickAction
          label="Retail Sale"
          desc="Products / POS"
          icon={ShoppingBag}
          tint="from-pink-400 to-rose-500"
          onClick={() => window.dispatchEvent(new CustomEvent('salon:open-new-appointment'))}
          testId="quick-retail"
        />
        <QuickAction
          label="Marketing"
          desc="Coupons & Campaigns"
          icon={TicketPercent}
          tint="from-orange-400 to-red-500"
          onClick={() => goToTab && goToTab('marketing')}
          testId="quick-marketing"
        />
      </div>

      {/* 5. Main grid — LEFT compact queue + RIGHT sidebars */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Upcoming Queue (compact, ~5/12 on desktop) */}
        <section className="lg:col-span-5 bg-card border border-border rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-gold" /> Upcoming Queue
            </h3>
            <div className="flex items-center gap-1.5">
              <select
                value={barberFilter}
                onChange={(e) => setBarberFilter(e.target.value)}
                className="h-7 px-2 rounded-md border border-border bg-background text-[11px] focus:outline-none"
              >
                <option value="all">All</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button
                onClick={() => goToTab && goToTab('queue')}
                className="text-[11px] text-gold hover:text-gold/80 font-semibold flex items-center gap-0.5"
              >
                All <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle className="w-10 h-10 text-emerald-500/40 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">Queue is clear</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {upcoming.map((token, idx) => (
                <div
                  key={token.id}
                  className={`p-2 rounded-lg border transition-all ${
                    token.status === 'called'
                      ? 'border-blue-500/50 bg-blue-500/5'
                      : 'border-border hover:border-gold/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                        token.status === 'called' ? 'bg-blue-500 text-white' : 'bg-gold/10 text-gold'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold truncate">{token.customer_name}</span>
                        <span className="text-[10px] text-gold font-mono">{token.token_number}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {token.barber_name} · ₹{token.total_amount}
                        {token.payment_confirmed
                          ? <span className="text-emerald-500 ml-1">✓ {(token.payment_mode || '').toUpperCase()}</span>
                          : <span className="text-amber-500 ml-1">Unpaid</span>
                        }
                      </p>
                    </div>
                    {/* inline actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {token.phone && (
                        <a
                          href={`tel:${token.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 hover:bg-emerald-500 hover:text-white transition"
                          title={`Phone call ${token.phone}`}
                          data-testid={`home-token-phone-${token.id}`}
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {token.status === 'waiting' && (
                        <button
                          onClick={() => handleCallToken && handleCallToken(token.id)}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-md bg-blue-500/15 border border-blue-500/40 text-blue-600 hover:bg-blue-500 hover:text-white transition"
                          title="Call to service"
                          data-testid={`home-token-call-${token.id}`}
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleCompleteToken && handleCompleteToken(token.id)}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-md bg-green-500/15 border border-green-500/40 text-green-600 hover:bg-green-500 hover:text-white transition"
                        title="Mark complete"
                        data-testid={`home-token-complete-${token.id}`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right column — quick tools */}
        <section className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Needs attention */}
          <div className="bg-card border border-border rounded-2xl p-3">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-rose-500" /> Needs Attention
              {unpaid.length > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-rose-500 text-white rounded-full px-2 py-0.5">{unpaid.length}</span>
              )}
            </h3>
            {unpaid.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">All caught up ✓</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {unpaid.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-[11px] p-1.5 rounded-md bg-rose-500/5 border border-rose-500/20">
                    <span className="truncate flex-1">
                      <span className="font-semibold">{t.customer_name}</span>
                      <span className="text-muted-foreground"> · ₹{t.total_amount}</span>
                    </span>
                    <button
                      onClick={() => handleCompleteToken && handleCompleteToken(t.id)}
                      className="px-2 py-0.5 rounded bg-rose-500 text-white font-bold text-[10px]"
                    >
                      Collect
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* On the floor — barbers */}
          <div className="bg-card border border-border rounded-2xl p-3">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-500" /> On the Floor ({barbers.length})
            </h3>
            {barbers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No staff yet</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {barbers.slice(0, 6).map((b) => {
                  const busy = tokens.some((t) => t.barber_id === b.id && (t.status === 'called'));
                  return (
                    <div key={b.id} className="flex items-center gap-2 text-[11px] p-1.5 rounded-md bg-background border border-border">
                      <div className={`w-2 h-2 rounded-full ${busy ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                      <span className="font-medium flex-1 truncate">{b.name}</span>
                      <span className="text-muted-foreground">{busy ? 'busy' : 'free'}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Online booking link */}
          <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/30 rounded-2xl p-3 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-violet-500" /> Online Booking Link
                </h3>
                <p className="text-[11px] text-muted-foreground truncate">
                  Share this to let customers book online
                </p>
              </div>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/book/${salonId}`;
                  navigator.clipboard.writeText(url);
                }}
                className="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-semibold"
              >
                Copy Link
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* 6. Insights A — Staff leaderboard, Targets, Reviews */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Staff Leaderboard */}
        <div className="bg-card border border-border rounded-2xl p-3">
          <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> Staff Leaderboard
          </h3>
          {staffLeaderboard.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No data yet</p>
          ) : (
            <div className="space-y-1.5">
              {staffLeaderboard.slice(0, 5).map((s, i) => (
                <div key={s.barber_id} className="flex items-center gap-2 text-xs">
                  <span className={`w-5 h-5 flex items-center justify-center rounded font-bold text-[10px] ${
                    i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-400 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'bg-muted'
                  }`}>{i + 1}</span>
                  <span className="flex-1 truncate">{s.barber_name}</span>
                  <span className="font-bold text-gold">₹{Number(s.sales || 0).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Targets */}
        <div className="bg-card border border-border rounded-2xl p-3">
          <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-blue-500" /> Targets
          </h3>
          <ProgressRow label="Daily Sales" value={targets.daily_actual || 0} target={targets.daily_target || 0} pct={dailyPct} color="from-amber-400 to-amber-600" />
          <ProgressRow label="Monthly Sales" value={targets.monthly_actual || 0} target={targets.monthly_target || 0} pct={monthlyPct} color="from-emerald-400 to-emerald-600" />
          <ProgressRow label="Memberships" value={targets.membership_actual || 0} target={targets.membership_target || 0} pct={memPct} color="from-violet-400 to-violet-600" isCount />
        </div>

        {/* Reviews */}
        <div className="bg-card border border-border rounded-2xl p-3">
          <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
            <Star className="w-4 h-4 text-amber-500" /> Reviews
          </h3>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold text-amber-500">{Number(reviews.avg_rating || 0).toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">/ 5 · {reviews.total_reviews || 0} reviews</span>
          </div>
          <div className="space-y-0.5">
            {[5,4,3,2,1].map((k) => {
              const cnt = Number((reviews.distribution || {})[String(k)] || 0);
              const pct = reviews.total_reviews ? (cnt * 100) / reviews.total_reviews : 0;
              return (
                <div key={k} className="flex items-center gap-2 text-[10px]">
                  <span className="w-6">{k}★</span>
                  <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${pct}%` }}></div>
                  </div>
                  <span className="w-6 text-right text-muted-foreground">{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 7. Insights B — Revenue sparkline, Payment mix, Top services, Busy hours */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Revenue 7d */}
        <div className="bg-card border border-border rounded-2xl p-3">
          <h3 className="text-xs font-bold mb-2 text-muted-foreground">Revenue · Last 7d</h3>
          <div className="flex items-end gap-1 h-12">
            {revenue7d.map((d, i) => {
              const pct = (Number(d.total || 0) * 100) / maxRev;
              return (
                <div key={i} className="flex-1 relative group">
                  <div
                    className="w-full bg-gradient-to-t from-gold to-amber-300 rounded-t"
                    style={{ height: `${Math.max(4, pct)}%` }}
                    title={`${d.date}: ₹${d.total}`}
                  ></div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Peak ₹{maxRev.toLocaleString('en-IN')}
          </p>
        </div>

        {/* Payment mix donut (bars fallback) */}
        <div className="bg-card border border-border rounded-2xl p-3">
          <h3 className="text-xs font-bold mb-2 text-muted-foreground">Payment Mix</h3>
          <div className="space-y-1">
            {Object.entries(paymentMix).length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No sales yet</p>
            ) : (
              Object.entries(paymentMix).map(([k, v]) => {
                const pct = (Number(v) * 100) / paymentTotal;
                return (
                  <div key={k} className="flex items-center gap-1.5 text-[10px]">
                    <span className="w-2 h-2 rounded-full" style={{ background: paymentColors[k] || '#6b7280' }}></span>
                    <span className="capitalize flex-1">{k}</span>
                    <span className="font-bold">{pct.toFixed(0)}%</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Top services */}
        <div className="bg-card border border-border rounded-2xl p-3">
          <h3 className="text-xs font-bold mb-2 text-muted-foreground">Top Services</h3>
          {topServices.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-1">
              {topServices.map((s, i) => (
                <div key={s.service_id || i} className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span className="flex-1 truncate">{s.service_name}</span>
                  <span className="font-bold text-gold">{s.count}×</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Busy hours */}
        <div className="bg-card border border-border rounded-2xl p-3">
          <h3 className="text-xs font-bold mb-2 text-muted-foreground">Busy Hours (7d)</h3>
          <div className="grid grid-cols-12 gap-0.5 h-12 items-end">
            {Array.from({ length: 24 }, (_, h) => {
              const c = Number(busyHours[String(h)] || 0);
              const pct = (c * 100) / busyMax;
              return (
                <div
                  key={h}
                  className="w-full rounded-sm"
                  style={{
                    height: `${Math.max(4, pct)}%`,
                    background: `linear-gradient(to top, rgba(59,130,246,${0.3 + pct/200}), rgba(59,130,246,${0.6 + pct/200}))`,
                  }}
                  title={`${h}:00 — ${c}`}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Hours 0–23</p>
        </div>
      </div>
    </div>
  );
}

// ---------------- helpers ----------------

function KpiCard({ tint, label, value, icon: Icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-xl border bg-gradient-to-br ${KPI_TINTS[tint] || KPI_TINTS.gold} hover:shadow transition group`}
    >
      <div className="flex items-center justify-between mb-1">
        <Icon className="w-4 h-4 opacity-70" />
        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-70 transition" />
      </div>
      <p className="text-lg md:text-xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
    </button>
  );
}

function MetricPill({ tint, label, value, onClick, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-2.5 py-2 rounded-lg border ${PILL_TINTS[tint] || PILL_TINTS.blue} hover:shadow-sm transition text-left`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />}
      <div className="min-w-0">
        <p className="text-sm font-bold leading-none truncate">{value}</p>
        <p className="text-[10px] uppercase tracking-wide opacity-70 truncate">{label}</p>
      </div>
    </button>
  );
}

function QuickAction({ label, desc, icon: Icon, tint, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="p-2.5 bg-card border border-border rounded-xl hover:border-gold/40 hover:shadow transition text-left group"
    >
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${tint} flex items-center justify-center mb-1.5 shadow-sm`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-[11px] font-bold leading-tight group-hover:text-gold transition">{label}</p>
      <p className="text-[9px] text-muted-foreground truncate">{desc}</p>
    </button>
  );
}

function ProgressRow({ label, value, target, pct, color, isCount = false }) {
  const format = (n) => isCount ? Number(n) : `₹${Number(n).toLocaleString('en-IN')}`;
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold">{format(value)} / {format(target)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${color}`} style={{ width: `${Math.max(2, pct)}%` }}></div>
      </div>
    </div>
  );
}
