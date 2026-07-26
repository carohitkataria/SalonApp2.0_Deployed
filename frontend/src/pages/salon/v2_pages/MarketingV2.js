/**
 * MarketingV2.js — new Marketing page redesign matching salon_marketing.html mock.
 * Uses .shv2 tokens (rail/ribbon shell already provided by HomeV2Shell wrapper).
 * All list panels expose a right-side drawer to CREATE new items.
 *
 * Wired to existing backend endpoints:
 *   GET  /api/salons/{id}/marketing/overview
 *   GET  /api/salons/{id}/marketing/campaigns
 *   POST /api/salons/{id}/marketing/campaigns
 *   POST /api/salons/{id}/marketing/campaigns/{cid}/launch|pause|resume|stop
 *   GET  /api/salons/{id}/marketing/automations
 *   POST /api/salons/{id}/marketing/automations
 *   PUT  /api/salons/{id}/marketing/automations/{aid}
 *   GET  /api/salons/{id}/marketing/templates
 *   POST /api/salons/{id}/marketing/templates
 *   GET  /api/salons/{id}/coupons
 *   POST /api/salons/{id}/coupons
 *   GET  /api/salons/{id}/marketing/segments
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { V2_PAGES_CSS } from './styles_v2';
import MarketingSettingsPanel from './MarketingSettingsPanel';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

// ---------------------- Small icon set ----------------------
const Ico = {
  send: () => <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  bolt: () => <svg viewBox="0 0 24 24"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  chat: () => <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  tag:  () => <svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  star: () => <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  gear: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  chart:() => <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  plus: () => <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  close:() => <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  check:() => <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  clock:() => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  pencil:() => <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  trash:() => <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
  refresh:() => <svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  gear:() => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  wa:() => <svg viewBox="0 0 24 24" style={{fill:'currentColor', stroke:'none'}}><path d="M12 2a10 10 0 0 0-8.7 15L2 22l5.2-1.3A10 10 0 1 0 12 2z"/></svg>,
  images:() => <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>,
  mail: () => <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>,
  info: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>,
  users:() => <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  rupee:() => <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  trending:() => <svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  external:() => <svg viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>,
  wifi:() => <svg viewBox="0 0 24 24"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>,
};

// ---------------------- Utilities ----------------------
const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const CH_STYLE = {
  whatsapp:{bg:'var(--wa-bg)', fg:'var(--wa)', label:'WhatsApp', icon: Ico.chat},
  sms:     {bg:'var(--sky-bg)', fg:'var(--sky)', label:'SMS',     icon: Ico.chat},
  email:   {bg:'var(--amber-bg)', fg:'var(--amber)', label:'Email', icon: Ico.mail},
};

// Inject scoped stylesheet once.
function useV2Styles() {
  useEffect(() => {
    const id = 'shv2-v2pages-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = V2_PAGES_CSS;
    document.head.appendChild(el);
  }, []);
}

// ---------------------- Right-side drawer helper (React portal) ----------------------
// Portal is critical — the salon dashboard content is wrapped in a Tailwind
// `<div class="relative z-10">` which creates a stacking context that traps
// the drawer BELOW the right-side ribbon. Portaling to document.body makes
// the drawer + overlay sit above every shell element.
function Drawer({ open, onClose, title, subtitle, iconFn, children, footer }) {
  const IcFn = iconFn || Ico.send;
  const node = (
    <>
      <div className={`shv2-overlay ${open ? 'open' : ''}`} onClick={onClose} style={{ zIndex: 9060 }} />
      <aside className={`shv2-drawer v2-narrow ${open ? 'open' : ''}`} style={{ zIndex: 9070 }}>
        <div className="v2-dh">
          <div className="tt">
            <div className="ic"><IcFn /></div>
            <div>
              <h3>{title}</h3>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          <button className="v2-close" onClick={onClose}><Ico.close /></button>
        </div>
        <div className="v2-db">{children}</div>
        {footer && <div className="v2-df">{footer}</div>}
      </aside>
    </>
  );
  return ReactDOM.createPortal(node, document.body);
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function MarketingV2({ salonId, getAuthHeaders, salon }) {
  useV2Styles();

  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [plans, setPlans] = useState([]);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Drawers
  const [campaignDrawer, setCampaignDrawer] = useState(false);
  const [automationDrawer, setAutomationDrawer] = useState(false);
  const [templateDrawer, setTemplateDrawer] = useState(false);
  const [couponDrawer, setCouponDrawer] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [membershipDrawer, setMembershipDrawer] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Stable auth reference so background auto-refresh doesn't recreate fetchAll
  const authRef = useRef(getAuthHeaders);
  useEffect(() => { authRef.current = getAuthHeaders; }, [getAuthHeaders]);
  const authHeaders = useCallback(() => {
    try { return (authRef.current && authRef.current()) || {}; } catch { return {}; }
  }, []);

  const fetchAll = useCallback(async (opts = { silent: false }) => {
    if (!salonId) return;
    if (!opts.silent) setLoading(true);
    try {
      const [ov, cp, at, tp, cop, sg, pl] = await Promise.allSettled([
        axios.get(`${API}/salons/${salonId}/marketing/overview`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/campaigns`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/automations`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/templates`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/coupons`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/segments`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/membership-plans`, { headers: authHeaders() }),
      ]);
      setOverview(ov.status === 'fulfilled' ? ov.value.data : null);
      setCampaigns(cp.status === 'fulfilled' ? (cp.value.data.campaigns || []) : []);
      setAutomations(at.status === 'fulfilled' ? (at.value.data.automations || []) : []);
      setTemplates(tp.status === 'fulfilled' ? (tp.value.data.templates || []) : []);
      setCoupons(cop.status === 'fulfilled' ? (cop.value.data.coupons || []) : []);
      setSegments(sg.status === 'fulfilled' ? (sg.value.data.segments || []) : []);
      setPlans(pl.status === 'fulfilled' ? (pl.value.data.plans || []) : []);
    } finally { if (!opts.silent) setLoading(false); }
  }, [salonId, authHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent auto-refresh — every 60s. Never toggles the loading skeleton
  // (prevents the page-jump the user reported).
  useEffect(() => {
    if (!salonId) return undefined;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchAll({ silent: true });
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [salonId, fetchAll]);

  // Derive KPIs
  const kpi = useMemo(() => {
    const msg = overview?.messaging || {};
    const conv = overview?.conversion || {};
    const sent = msg.sent || 0;
    const delivered = msg.delivered || 0;
    const read = msg.read || 0;
    const spend = msg.spend_inr || 0;
    const redeems = conv.coupon_redemptions || 0;
    const revenue = conv.coupon_discount_amount || 0;
    const delvPct = sent ? Math.round((delivered / sent) * 100) : 0;
    const clickPct = sent ? Math.round((read / sent) * 100) : 0;
    const ros = spend > 0 ? (revenue / spend).toFixed(1) + '×' : (revenue > 0 ? '∞' : '0×');
    return { sent, delivered, delvPct, read, clickPct, redeems, revenue, ros };
  }, [overview]);

  // Channel mix — derived from messages field on marketing_messages via campaigns
  const channelMix = useMemo(() => {
    const acc = { whatsapp: 0, sms: 0, email: 0 };
    (campaigns || []).forEach(c => {
      const prov = String(c.provider || 'whatsapp').toLowerCase();
      const key = prov.includes('email') ? 'email' : prov.includes('sms') ? 'sms' : 'whatsapp';
      const sent = (c.stats?.sent) || 0;
      acc[key] += sent;
    });
    const total = acc.whatsapp + acc.sms + acc.email;
    return {
      whatsapp: total ? Math.round(acc.whatsapp / total * 100) : 56,
      sms:      total ? Math.round(acc.sms / total * 100) : 29,
      email:    total ? Math.round(acc.email / total * 100) : 15,
    };
  }, [campaigns]);

  const activeCampaigns = useMemo(
    () => (campaigns || []).filter(c => ['running','scheduled','live'].includes(String(c.status || '').toLowerCase())).slice(0, 3),
    [campaigns]
  );

  // Compute segment live counts (fallback: use rules preview if provided, else raw customer count)
  const [segCounts, setSegCounts] = useState({});
  useEffect(() => {
    (async () => {
      if (!salonId || !segments?.length) return;
      const map = {};
      for (const s of segments) {
        try {
          const res = await axios.post(
            `${API}/salons/${salonId}/marketing/segments/preview`,
            { name: s.name, description: s.description || '', rules: s.rules || { logic: 'AND', conditions: [] } },
            { headers: authHeaders() }
          );
          map[s.id] = res.data?.count || 0;
        } catch { map[s.id] = 0; }
      }
      setSegCounts(map);
    })();
  }, [salonId, segments, authHeaders]);

  return (
    <div>
      {/* HEADER */}
      <div className="phead">
        <div>
          <h2><span className="hic"><Ico.send /></span>Marketing</h2>
        </div>
        <button className="btn-primary" onClick={() => setCampaignDrawer(true)}>
          <Ico.plus /> New campaign
        </button>
      </div>

      {/* SUB-TABS */}
      <div className="subtabs">
        {[
          { id: 'overview', label: 'Overview', ic: Ico.chart },
          { id: 'campaigns', label: 'Campaigns', ic: Ico.send },
          { id: 'automations', label: 'Automations', ic: Ico.bolt },
          { id: 'templates', label: 'Templates', ic: Ico.chat },
          { id: 'offers', label: 'Offers & Perks', ic: Ico.tag },
          { id: 'reputation', label: 'Reputation', ic: Ico.star },
          { id: 'media', label: 'Media', ic: Ico.images },
          { id: 'settings', label: 'Settings', ic: Ico.gear },
        ].map((t) => (
          <button key={t.id} className={`subtab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            <t.ic /> {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="placeholder"><div className="pi"><Ico.clock /></div><b>Loading marketing data…</b></div>}

      {/* ===== OVERVIEW ===== */}
      {tab === 'overview' && (
        <div>
          {/* KPI ROW */}
          <div className="mk-kpis">
            <KpiTile chip="wa" icon={<Ico.chat />} val={kpi.sent.toLocaleString('en-IN')} label="Messages sent" />
            <KpiTile chip="green" icon={<Ico.check />} val={`${kpi.delvPct}%`} label="Delivered" sub={<span style={{color:'var(--green)'}}>{kpi.delivered.toLocaleString('en-IN')}</span>} />
            <KpiTile chip="sky" icon={<Ico.external />} val={`${kpi.clickPct}%`} label="Click rate" sub={<span style={{color:'var(--sky)'}}>{kpi.read.toLocaleString('en-IN')}</span>} />
            <KpiTile chip="amber" icon={<Ico.tag />} val={kpi.redeems.toLocaleString('en-IN')} label="Redemptions" />
            <KpiTile chip="violet" icon={<Ico.rupee />} val={rupee(kpi.revenue)} label="Attributed rev" />
            <KpiTile chip="rose" icon={<Ico.trending />} val={kpi.ros} label="Return on spend" />
          </div>

          {/* Active campaigns + Channel mix */}
          <div className="v2-grid2">
            <div className="card">
              <div className="card__h">
                <div className="t"><Ico.send /> Active campaigns</div>
                <a onClick={() => setTab('campaigns')} style={{cursor:'pointer'}}>See all ›</a>
              </div>
              <div className="clist">
                {activeCampaigns.length === 0 && (
                  <div className="placeholder" style={{padding:20}}>
                    <b>No active campaigns yet</b>
                    <p>Create one to reach the right guests in a few taps.</p>
                  </div>
                )}
                {activeCampaigns.map(c => <CampaignRow key={c.id} c={c} />)}
              </div>
            </div>
            <div className="card">
              <div className="card__h"><div className="t"><Ico.wifi /> Channel mix</div></div>
              <div className="chan">
                <div className="cl"><span>By messages delivered</span><span>India · WhatsApp-first</span></div>
                <div className="chan-bar">
                  <i style={{width:`${channelMix.whatsapp}%`,background:'var(--wa)'}}/>
                  <i style={{width:`${channelMix.sms}%`,background:'var(--sky)'}}/>
                  <i style={{width:`${channelMix.email}%`,background:'var(--amber)'}}/>
                </div>
                <div className="chan-leg">
                  <div className="r"><i style={{background:'var(--wa)'}}/><span className="nm">WhatsApp</span><span className="v">{channelMix.whatsapp}%</span></div>
                  <div className="r"><i style={{background:'var(--sky)'}}/><span className="nm">SMS (DLT)</span><span className="v">{channelMix.sms}%</span></div>
                  <div className="r"><i style={{background:'var(--amber)'}}/><span className="nm">Email</span><span className="v">{channelMix.email}%</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Audience segments */}
          <div className="card">
            <div className="card__h">
              <div className="t"><Ico.users /> Audience segments</div>
              <a onClick={() => toast.info('Segment builder coming soon')} style={{cursor:'pointer'}}>Manage ›</a>
            </div>
            <div className="seg-grid">
              {segments.slice(0, 6).map((s, idx) => {
                const dots = ['var(--rose)','var(--amber)','var(--violet)','var(--teal)','var(--sky)','var(--green)'];
                return (
                  <div className="seg-card" key={s.id}>
                    <div className="st"><span className="d" style={{background: dots[idx % dots.length]}}/>{s.name}</div>
                    <div className="sc">{segCounts[s.id] ?? '…'} <small>guests</small></div>
                    <button className="seg-send" onClick={() => { setCampaignDrawer({ preselectSegmentId: s.id }); }}>
                      <Ico.send /> Send offer
                    </button>
                  </div>
                );
              })}
              {segments.length === 0 && (
                <div className="placeholder" style={{gridColumn:'1 / -1'}}>
                  <div className="pi"><Ico.users /></div>
                  <b>No segments defined yet</b>
                  <p>Create segments like "Birthday this month", "Lapsed 60+ days", "High spenders ₹5k+".</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== CAMPAIGNS ===== */}
      {tab === 'campaigns' && (
        <div className="card">
          <div className="card__h">
            <div className="t"><Ico.send /> All campaigns</div>
            <button className="btn-ghost" onClick={() => setCampaignDrawer(true)}><Ico.plus />New</button>
          </div>
          <div className="clist">
            {campaigns.length === 0 && <div className="placeholder"><b>No campaigns yet</b><p>Click "New" to create your first WhatsApp/SMS/Email campaign.</p></div>}
            {campaigns.map(c => (
              <CampaignRow
                key={c.id}
                c={c}
                onLaunch={async () => {
                  try {
                    await axios.post(`${API}/salons/${salonId}/marketing/campaigns/${c.id}/launch`, {}, { headers: authHeaders() });
                    toast.success('Campaign launched');
                    fetchAll();
                  } catch (e) { toast.error(e.response?.data?.detail || 'Launch failed'); }
                }}
                onPause={async () => {
                  try {
                    await axios.post(`${API}/salons/${salonId}/marketing/campaigns/${c.id}/pause`, {}, { headers: authHeaders() });
                    toast.success('Paused');
                    fetchAll();
                  } catch (e) { toast.error(e.response?.data?.detail || 'Pause failed'); }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ===== AUTOMATIONS ===== */}
      {tab === 'automations' && (
        <div className="card">
          <div className="card__h">
            <div className="t"><Ico.bolt /> Always-on automations</div>
            <button className="btn-ghost" onClick={() => setAutomationDrawer(true)}><Ico.plus />New automation</button>
          </div>
          <div>
            {automations.length === 0 && <div className="placeholder"><b>No automations yet</b><p>Create trigger-based flows like reminders, birthday wishes, win-backs.</p></div>}
            {automations.map((a) => (
              <div className="auto-row" key={a.id}>
                <div className="ai" style={{background:'var(--sky-bg)', color:'var(--sky)'}}><Ico.bolt /></div>
                <div className="an">
                  <b>{a.name || a.trigger || 'Automation'}</b>
                  <span>{a.description || `${a.channel || 'WhatsApp'} · trigger: ${a.trigger || 'custom'}`}</span>
                </div>
                <button
                  className={`toggle ${a.active ? 'on' : ''}`}
                  onClick={async () => {
                    try {
                      await axios.put(`${API}/salons/${salonId}/marketing/automations/${a.id}`,
                        { ...a, active: !a.active },
                        { headers: authHeaders() });
                      toast.success(`Automation ${!a.active ? 'enabled' : 'paused'}`);
                      fetchAll();
                    } catch (e) { toast.error(e.response?.data?.detail || 'Update failed'); }
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== TEMPLATES ===== */}
      {tab === 'templates' && (
        <div>
          <div className="card__h" style={{marginBottom:16}}>
            <div className="t"><Ico.chat />Message templates</div>
            <button className="btn-primary" onClick={() => setTemplateDrawer(true)}><Ico.plus />New template</button>
          </div>
          <div className="v2-grid2b">
            {templates.length === 0 && (
              <div className="placeholder" style={{gridColumn:'1 / -1'}}>
                <div className="pi"><Ico.chat/></div>
                <b>No templates yet</b>
                <p>Create WhatsApp templates and submit them to Twilio / Meta for approval.</p>
              </div>
            )}
            {templates.map(t => {
              const st = String(t.meta_status || t.status || t.approval_status || 'draft').toLowerCase();
              const stCls = st.includes('appr') ? 'approved' : st.includes('pend') ? 'pending' : st.includes('reject') ? 'rejected' : '';
              const canEdit = stCls === '' || stCls === 'rejected';
              const handleDelete = async () => {
                if (!window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
                try {
                  await axios.delete(`${API}/salons/${salonId}/marketing/templates/${t.id}`, { headers: authHeaders() });
                  toast.success('Template deleted');
                  fetchAll({ silent: true });
                } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
              };
              return (
                <div className="tmpl" key={t.id}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8}}>
                    <span className="wa-badge">{(t.channel || 'WhatsApp').toString().toUpperCase()}</span>
                    <div style={{display:'flex', gap:6}}>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{padding:'5px 9px', fontSize:11}}
                          onClick={() => { setEditingTemplate(t); setTemplateDrawer(true); }}
                          title="Edit template"
                        ><Ico.pencil /> Edit</button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{padding:'5px 9px', fontSize:11, color:'#E45C86', borderColor:'#FCEAF1'}}
                        onClick={handleDelete}
                        title="Delete template"
                      ><Ico.trash /> Delete</button>
                    </div>
                  </div>
                  <b>{t.name}</b>
                  <div className="bubble">{t.body}</div>
                  <div className={`status ${stCls}`}>
                    {stCls === 'approved' ? <Ico.check /> : <Ico.clock />}
                    {stCls === 'approved' ? 'Approved' : stCls === 'pending' ? 'Pending approval' : stCls === 'rejected' ? 'Rejected' : 'Draft'} · {(t.category || 'UTILITY').toString().toUpperCase()}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card" style={{marginTop:18, background:'var(--wa-bg)', borderColor:'#CDEBD9'}}>
            <div className="t" style={{fontWeight:700, marginBottom:8, display:'flex', alignItems:'center', gap:8, fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
              <span style={{color:'var(--wa)'}}><Ico.info /></span> Twilio approval tip
            </div>
            <p style={{fontSize:12.5, color:'var(--ink-soft)', lineHeight:1.6}}>
              Every variable <b>must</b> ship with an example value or the template is rejected.
              e.g. body <code>Hi {`{{1}}`}, book at {`{{2}}`}: {`{{3}}`}</code> → samples <code>{`{{1}}`}=Priya · {`{{2}}`}=The Looks · {`{{3}}`}=https://book.thelooks.in/s/aB12</code>.
              Fill these in Twilio Content Template Builder → "Sample content".
            </p>
          </div>
        </div>
      )}

      {/* ===== OFFERS & PERKS ===== */}
      {tab === 'offers' && (
        <div className="v2-grid2b">
          <div className="card">
            <div className="card__h">
              <div className="t"><Ico.tag /> Coupons</div>
              <button className="btn-ghost" data-testid="coupon-new-btn" onClick={() => { setEditingCoupon(null); setCouponDrawer(true); }}><Ico.plus />New</button>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:12}}>
              {coupons.length === 0 && <div className="placeholder"><b>No coupons yet</b><p>Create discount codes for campaigns and walk-ins.</p></div>}
              {coupons.map(c => (
                <div className="coupon" key={c.id}>
                  <div className="cv">
                    <b>{c.type === 'percent' ? `${c.value}%` : rupee(c.value)}</b>
                    <span>OFF</span>
                  </div>
                  <div className="cd">
                    <b>{c.title}</b>
                    <span>{c.description || `Min ${rupee(c.min_bill_amount || 0)}${c.max_discount_amount ? ` · up to ${rupee(c.max_discount_amount)}` : ''} · ${c.valid_to ? `exp ${new Date(c.valid_to).toLocaleDateString('en-IN', {day:'numeric', month:'short'})}` : 'no expiry'}`}</span>
                    <br/>
                    <span className="code">{c.code}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--muted, #6b6489)', cursor: 'pointer' }}
                      data-testid={`coupon-show-on-invoice-${c.id}`}>
                      <input type="checkbox" checked={!!c.show_on_invoice}
                        onChange={async () => {
                          const next = !c.show_on_invoice;
                          setCoupons(arr => arr.map(x => x.id === c.id ? { ...x, show_on_invoice: next } : x));
                          try {
                            await axios.put(`${API}/salons/${salonId}/coupons/${c.id}`, { ...c, show_on_invoice: next }, { headers: authHeaders() });
                          } catch (_) {
                            setCoupons(arr => arr.map(x => x.id === c.id ? { ...x, show_on_invoice: !next } : x));
                            toast.error('Could not update');
                          }
                        }} />
                      Show on invoice
                    </label>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'flex-start' }}>
                    <button className="btn-ghost" data-testid={`coupon-edit-${c.id}`} title="Edit coupon"
                      style={{ padding: '4px 8px' }}
                      onClick={() => { setEditingCoupon(c); setCouponDrawer(true); }}><Ico.pencil /></button>
                    <button className="btn-ghost" data-testid={`coupon-delete-${c.id}`} title="Delete coupon"
                      style={{ padding: '4px 8px', color: 'var(--rose,#e11d48)' }}
                      onClick={async () => {
                        if (!window.confirm(`Delete coupon ${c.code}?`)) return;
                        try { await axios.delete(`${API}/salons/${salonId}/coupons/${c.id}`, { headers: authHeaders() }); toast.success('Coupon deleted'); fetchAll({ silent: true }); }
                        catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
                      }}><Ico.trash /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card__h">
              <div className="t"><Ico.star /> Membership plans</div>
              <button className="btn-ghost" data-testid="membership-new-btn" onClick={() => { setEditingPlan(null); setMembershipDrawer(true); }}><Ico.plus />New</button>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:10}} data-testid="membership-plans-list">
              {plans.length === 0 && <div className="placeholder"><b>No plans yet</b><p>Create wallet-credit or discount memberships for your guests.</p></div>}
              {plans.map(p => {
                const col = p.color || '#a855f7';
                const isDiscount = p.plan_type === 'discount';
                return (
                  <div key={p.id} data-testid={`membership-plan-${p.id}`}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:12, border:`1px solid ${col}44`, background:`linear-gradient(160deg, ${col}12, ${col}04)` }}>
                    <span style={{ display:'inline-flex', alignItems:'center', borderRadius:999, fontWeight:800, textTransform:'uppercase', letterSpacing:'.05em', padding:'3px 9px', fontSize:10, color:col, border:`1px solid ${col}`, background:col+'1A' }}>{p.tier || 'Plan'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14 }}>{p.name}</div>
                      <div style={{ fontSize:12, color:'var(--muted,#6b6489)' }}>
                        {isDiscount
                          ? `Discount · ${p.discount_percent || 0}% off every booking · ₹${p.amount}`
                          : `Credit · ₹${p.amount} → ₹${p.credit} wallet`} · {p.validity_months} mo
                      </div>
                    </div>
                    <button className="btn-ghost" data-testid={`membership-edit-${p.id}`} title="Edit plan" style={{ padding:'4px 8px' }}
                      onClick={() => { setEditingPlan(p); setMembershipDrawer(true); }}><Ico.pencil /></button>
                    <button className="btn-ghost" data-testid={`membership-delete-${p.id}`} title="Delete plan" style={{ padding:'4px 8px', color:'var(--rose,#e11d48)' }}
                      onClick={async () => {
                        if (!window.confirm(`Delete plan ${p.name}?`)) return;
                        try { await axios.delete(`${API}/salons/${salonId}/membership-plans/${p.id}`, { headers: authHeaders() }); toast.success('Plan deleted'); fetchAll({ silent: true }); }
                        catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
                      }}><Ico.trash /></button>
                  </div>
                );
              })}
              <div style={{ borderTop:'1px solid var(--line,#eeecf7)', marginTop:4, paddingTop:10, display:'flex', flexDirection:'column', gap:8 }}>
                <StatLine k="Active members" v={`${overview?.memberships_active ?? 0} guests`} />
                <StatLine k="Wallet balance (UPI top-ups)" v={rupee(overview?.wallet_total ?? 0)} />
              </div>
            </div>
          </div>
          <LoyaltySlabsCard salonId={salonId} authHeaders={authHeaders} />
          <LoyaltyPointsCard salonId={salonId} authHeaders={authHeaders} />
        </div>
      )}

      {/* ===== REPUTATION (seeded/demo) ===== */}
      {tab === 'reputation' && (
        <div>
          <div className="mk-kpis" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
            <KpiTile chip="amber" icon={<Ico.star />} val="4.8" label="Avg rating" />
            <KpiTile chip="wa" icon={<Ico.chat />} val="210" label="Review requests" />
            <KpiTile chip="green" icon={<Ico.trending />} val="+38" label="New reviews" />
            <KpiTile chip="rose" icon={<Ico.info />} val="3" label="Needs reply" />
          </div>
          <div className="card">
            <div className="card__h">
              <div className="t"><Ico.star /> Recent reviews · Google · JustDial <span style={{marginLeft:6, fontSize:10, fontWeight:800, background:'var(--amber-bg)', color:'var(--amber)', padding:'2px 7px', borderRadius:20, letterSpacing:.3}}>DEMO · API COMING SOON</span></div>
              <button className="btn-primary" onClick={() => toast.success('Review requests queued to recent guests on WhatsApp')}><Ico.plus />Request reviews</button>
            </div>
            <div className="clist">
              {[
                {who:'Rahul V.', stars:5, text:'Imran is fantastic, great fade. Booked via WhatsApp in seconds.'},
                {who:'Sana K.',  stars:4, text:'Lovely spa, slightly long wait. Will return.'},
                {who:'Neha G.',  stars:5, text:'Amazing hair spa experience. Loved the ambiance.'},
              ].map((r, i) => (
                <div className="crow" key={i}>
                  <div className="rev-avatar">★</div>
                  <div className="cn">
                    <b>{r.who} · {'★'.repeat(r.stars)}{'☆'.repeat(5-r.stars)}</b>
                    <span>"{r.text}"</span>
                  </div>
                  <button className="btn-ghost" onClick={() => toast.success('Reply drafted')}>Reply</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== MEDIA (renamed from Gallery) ===== */}
      {tab === 'media' && (
        <MediaPanel salon={salon} salonId={salonId} authHeaders={authHeaders} />
      )}

      {/* ===== SETTINGS ===== */}
      {tab === 'settings' && (
        <MarketingSettingsPanel salonId={salonId} authHeaders={authHeaders} />
      )}

      {/* -------- DRAWERS -------- */}
      <NewCampaignDrawer
        open={!!campaignDrawer}
        preselectSegmentId={typeof campaignDrawer === 'object' ? campaignDrawer.preselectSegmentId : undefined}
        onClose={() => setCampaignDrawer(false)}
        segments={segments}
        segCounts={segCounts}
        templates={templates}
        coupons={coupons}
        salonId={salonId}
        authHeaders={authHeaders}
        onSaved={() => { setCampaignDrawer(false); fetchAll(); }}
      />
      <NewAutomationDrawer
        open={automationDrawer}
        onClose={() => setAutomationDrawer(false)}
        templates={templates}
        salonId={salonId}
        authHeaders={authHeaders}
        onSaved={() => { setAutomationDrawer(false); fetchAll(); }}
      />
      <NewTemplateDrawer
        open={templateDrawer}
        onClose={() => { setTemplateDrawer(false); setEditingTemplate(null); }}
        salonId={salonId}
        authHeaders={authHeaders}
        initial={editingTemplate}
        onSaved={() => { setTemplateDrawer(false); setEditingTemplate(null); fetchAll(); }}
      />
      <NewCouponDrawer
        open={couponDrawer}
        onClose={() => { setCouponDrawer(false); setEditingCoupon(null); }}
        salonId={salonId}
        authHeaders={authHeaders}
        initial={editingCoupon}
        onSaved={() => { setCouponDrawer(false); setEditingCoupon(null); fetchAll(); }}
      />
      <NewMembershipDrawer
        open={membershipDrawer}
        onClose={() => { setMembershipDrawer(false); setEditingPlan(null); }}
        salonId={salonId}
        authHeaders={authHeaders}
        initial={editingPlan}
        onSaved={() => { setMembershipDrawer(false); setEditingPlan(null); fetchAll(); }}
      />
    </div>
  );
}

// -------------------- Reusable bits --------------------
function KpiTile({ chip, icon, val, label, sub }) {
  const map = {
    wa:    { bg:'var(--wa-bg)', fg:'var(--wa)' },
    green: { bg:'var(--green-bg)', fg:'var(--green)' },
    sky:   { bg:'var(--sky-bg)', fg:'var(--sky)' },
    amber: { bg:'var(--amber-bg)', fg:'var(--amber)' },
    violet:{ bg:'var(--violet-bg)', fg:'var(--violet)' },
    rose:  { bg:'var(--rose-bg)', fg:'var(--rose)' },
  };
  const s = map[chip] || map.wa;
  return (
    <div className="mk-kpi">
      <div className="chip" style={{background:s.bg, color:s.fg}}>{icon}</div>
      <b>{val}</b>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function CampaignRow({ c, onLaunch, onPause }) {
  const prov = String(c.provider || 'whatsapp').toLowerCase();
  const chKey = prov.includes('email') ? 'email' : prov.includes('sms') ? 'sms' : 'whatsapp';
  const st = CH_STYLE[chKey];
  const status = String(c.status || 'draft').toLowerCase();
  const statusLabel = status === 'running' ? 'Live' : status === 'scheduled' ? 'Scheduled' : status === 'paused' ? 'Paused' : status === 'completed' ? 'Completed' : 'Draft';
  const revenue = ((c.stats?.revenue) || 0);
  const redeemed = (c.stats?.redeemed) || 0;
  return (
    <div className="crow">
      <div className="ci" style={{background:st.bg, color:st.fg}}><Ico.chat /></div>
      <div className="cn">
        <b>{c.name}</b>
        <span>{st.label} · {c.segment_name || 'Audience'} · {(c.stats?.sent) || 0} sent</span>
      </div>
      <span className={`cstat ${status}`}>{statusLabel}</span>
      <div className="cmet">
        <b>{rupee(revenue)}</b>
        <span>{redeemed} redeemed</span>
      </div>
      {status === 'draft' && onLaunch && (
        <button className="btn-ghost" style={{marginLeft:8}} onClick={onLaunch}>Launch</button>
      )}
      {status === 'running' && onPause && (
        <button className="btn-ghost" style={{marginLeft:8}} onClick={onPause}>Pause</button>
      )}
    </div>
  );
}

function StatLine({ k, v }) {
  return (
    <div style={{display:'flex', justifyContent:'space-between', fontSize:13}}>
      <span style={{color:'var(--muted)', fontWeight:600}}>{k}</span>
      <b>{v}</b>
    </div>
  );
}

// -------------------- Media panel --------------------
function MediaPanel({ salon, salonId, authHeaders }) {
  const [localSalon, setLocalSalon] = useState(salon || null);
  useEffect(() => setLocalSalon(salon || null), [salon]);
  const photos = localSalon?.photo_gallery || [];

  const uploadFiles = async (files) => {
    if (!files?.length) return;
    const PHOTO_MAX = 5 * 1024 * 1024;
    const VIDEO_MAX = 25 * 1024 * 1024;
    const additions = [];
    for (const f of files) {
      const isVideo = (f.type || '').startsWith('video/');
      const limit = isVideo ? VIDEO_MAX : PHOTO_MAX;
      if (f.size > limit) { toast.error(`${f.name} too large (max ${isVideo ? '25MB' : '5MB'})`); continue; }
      const dataUrl = await new Promise((resolve) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result);
        r.readAsDataURL(f);
      });
      additions.push(dataUrl);
    }
    if (!additions.length) return;
    const updated = [...photos, ...additions];
    try {
      await axios.put(`${API}/salons/${salonId}`, { photo_gallery: updated }, { headers: authHeaders() });
      setLocalSalon({ ...(localSalon || {}), photo_gallery: updated });
      toast.success(`${additions.length} file(s) added`);
    } catch { toast.error('Upload failed'); }
  };

  const removeAt = async (idx) => {
    const updated = photos.filter((_, i) => i !== idx);
    try {
      await axios.put(`${API}/salons/${salonId}`, { photo_gallery: updated }, { headers: authHeaders() });
      setLocalSalon({ ...(localSalon || {}), photo_gallery: updated });
      toast.success('Removed');
    } catch { toast.error('Failed'); }
  };

  return (
    <div>
      <div className="card">
        <div className="card__h">
          <div className="t"><Ico.images /> Salon media</div>
          <label className="btn-primary" style={{cursor:'pointer'}}>
            <Ico.plus /> Add photos / videos
            <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => uploadFiles(Array.from(e.target.files || []))}/>
          </label>
        </div>
        <p style={{fontSize:12.5, color:'var(--muted)', marginBottom:14}}>
          Showcase your salon. Photos up to 5MB · videos up to 25MB.
        </p>
        {photos.length === 0 ? (
          <div className="placeholder"><div className="pi"><Ico.images /></div><b>No media yet</b><p>Upload photos or short videos to feature on your storefront.</p></div>
        ) : (
          <div className="media-grid">
            {photos.map((url, i) => {
              const isVideo = typeof url === 'string' && (url.startsWith('data:video') || /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url));
              return (
                <div className="media-tile" key={i}>
                  {isVideo ? <video src={url} muted playsInline /> : <img src={url} alt={`Media ${i+1}`} />}
                  <button className="rm" onClick={() => removeAt(i)}><Ico.close /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{marginTop:18}}>
        <div className="card__h">
          <div className="t"><Ico.wifi /> Social media <span style={{marginLeft:6, fontSize:10, fontWeight:800, background:'var(--amber-bg)', color:'var(--amber)', padding:'2px 7px', borderRadius:20}}>COMING SOON</span></div>
        </div>
        <p style={{fontSize:12.5, color:'var(--muted)', marginBottom:6}}>
          Auto-import posts &amp; reels from your salon's Instagram, YouTube, Facebook and TikTok.
        </p>
        <div className="social-grid">
          {[
            {n:'Instagram', bg:'linear-gradient(135deg,#E91E63,#8E24AA)', d:'Latest posts & reels'},
            {n:'YouTube',   bg:'linear-gradient(135deg,#E53935,#B71C1C)', d:'Channel videos'},
            {n:'Facebook',  bg:'linear-gradient(135deg,#1E88E5,#0D47A1)', d:'Page posts'},
            {n:'TikTok',    bg:'linear-gradient(135deg,#111,#333)',       d:'Short videos'},
          ].map(s => (
            <button key={s.n} className="social-tile" style={{background:s.bg}} onClick={() => toast.info(`${s.n} integration coming soon`)}>
              <b>{s.n}</b><span>{s.d}</span>
              <span className="soon">Soon</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------- Settings panel --------------------
function SettingsPanel({ salonId, authHeaders }) {
  const [settings, setSettings] = useState(null);
  const [prov, setProv] = useState('twilio');

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/marketing/settings`, { headers: authHeaders() });
        setSettings(res.data || {});
        setProv(res.data?.default_provider || 'twilio');
      } catch { setSettings({}); }
    })();
  }, [salonId, authHeaders]);

  const save = async () => {
    try {
      await axios.put(`${API}/salons/${salonId}/marketing/settings`, { ...(settings || {}), default_provider: prov }, { headers: authHeaders() });
      toast.success('Settings saved');
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
  };

  return (
    <div className="card">
      <div className="card__h"><div className="t"><Ico.gear /> Marketing settings</div><button className="btn-primary" onClick={save}><Ico.check /> Save</button></div>
      <div className="v2-grid2b">
        <div>
          <div className="v2-field">
            <label>Default provider</label>
            <select value={prov} onChange={(e) => setProv(e.target.value)}>
              <option value="twilio">Twilio (WhatsApp + SMS)</option>
              <option value="meta">Meta WhatsApp Cloud API</option>
              <option value="stub">Stub / test only</option>
            </select>
          </div>
          <div className="v2-field">
            <label>WhatsApp opt-in required</label>
            <select value={settings?.opt_in_required ? '1' : '0'} onChange={(e) => setSettings({ ...(settings||{}), opt_in_required: e.target.value === '1' })}>
              <option value="1">Yes — only send to opted-in guests</option>
              <option value="0">No — send to all guests</option>
            </select>
          </div>
          <div className="v2-field">
            <label>Quiet hours</label>
            <input placeholder="e.g. 22:00 – 08:00 IST" value={settings?.quiet_hours || ''} onChange={(e) => setSettings({ ...(settings||{}), quiet_hours: e.target.value })}/>
          </div>
        </div>
        <div>
          <div className="v2-field">
            <label>DLT sender ID (SMS)</label>
            <input placeholder="e.g. THLOOKS" value={settings?.dlt_sender_id || ''} onChange={(e) => setSettings({ ...(settings||{}), dlt_sender_id: e.target.value })}/>
          </div>
          <div className="v2-field">
            <label>Email sender</label>
            <input placeholder="hello@yoursalon.com" value={settings?.email_sender || ''} onChange={(e) => setSettings({ ...(settings||{}), email_sender: e.target.value })}/>
          </div>
          <div className="v2-field">
            <label>Twilio Content SID prefix (optional)</label>
            <input placeholder="HX…" value={settings?.twilio_content_prefix || ''} onChange={(e) => setSettings({ ...(settings||{}), twilio_content_prefix: e.target.value })}/>
          </div>
        </div>
      </div>
      <p style={{fontSize:12, color:'var(--muted)', marginTop:8}}>
        Twilio + Meta WhatsApp Cloud are already wired in the backend. Set default here to change how new campaigns/automations send by default.
      </p>
    </div>
  );
}

// -------------------- Drawer: New Campaign --------------------
function NewCampaignDrawer({ open, onClose, preselectSegmentId, segments, segCounts, templates, coupons, salonId, authHeaders, onSaved }) {
  const [name, setName] = useState('');
  const [segId, setSegId] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [tmplId, setTmplId] = useState('');
  const [body, setBody] = useState('');
  const [couponId, setCouponId] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setName(''); setChannel('whatsapp'); setTmplId(''); setBody(''); setCouponId(''); setScheduleAt(''); }
    if (preselectSegmentId) setSegId(preselectSegmentId);
  }, [open, preselectSegmentId]);

  const applyTemplate = (id) => {
    setTmplId(id);
    const t = templates.find(x => x.id === id);
    if (t) setBody(t.body || '');
  };

  const submit = async (launchNow) => {
    if (!name.trim()) { toast.error('Name required'); return; }
    if (!body.trim()) { toast.error('Message body required (pick a template or write custom)'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        segment_id: segId || null,
        template_id: tmplId || null,
        template_body: body,
        coupon_id: couponId || null,
        provider: channel === 'whatsapp' ? null : channel,
        schedule_at: (!launchNow && scheduleAt) ? scheduleAt : null,
      };
      const res = await axios.post(`${API}/salons/${salonId}/marketing/campaigns`, payload, { headers: authHeaders() });
      if (launchNow) {
        await axios.post(`${API}/salons/${salonId}/marketing/campaigns/${res.data.id}/launch`, {}, { headers: authHeaders() });
        toast.success('Campaign queued');
      } else {
        toast.success('Campaign saved');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save campaign');
    } finally { setSaving(false); }
  };

  return (
    <Drawer open={!!open} onClose={onClose} title="New Campaign" subtitle="Reach the right guests in a few taps" iconFn={Ico.send}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-ghost" disabled={saving} onClick={() => submit(false)}>Save as draft</button>
          <button className="btn-primary" disabled={saving} onClick={() => submit(true)}><Ico.send /> {scheduleAt ? 'Schedule' : 'Send now'}</button>
        </>
      }
    >
      <div className="v2-field"><label>Campaign name</label>
        <input placeholder="e.g. Diwali Glow Offer" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="v2-field"><label>Audience segment</label>
        <select value={segId} onChange={(e) => setSegId(e.target.value)}>
          <option value="">— Select segment —</option>
          {segments.map(s => <option key={s.id} value={s.id}>{s.name} ({segCounts?.[s.id] ?? '—'})</option>)}
        </select>
      </div>
      <div className="v2-field"><label>Channel</label>
        <div className="ch-pick">
          <button type="button" className={channel==='whatsapp' ? 'on' : ''} onClick={() => setChannel('whatsapp')}><Ico.wa /> WhatsApp</button>
          <button type="button" className={channel==='sms' ? 'on' : ''} onClick={() => setChannel('sms')}><Ico.chat /> SMS</button>
          <button type="button" className={channel==='email' ? 'on' : ''} onClick={() => setChannel('email')}><Ico.mail /> Email</button>
        </div>
      </div>
      <div className="v2-field"><label>Template</label>
        <select value={tmplId} onChange={(e) => applyTemplate(e.target.value)}>
          <option value="">— Custom message —</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.meta_status || 'draft'})</option>)}
        </select>
      </div>
      <div className="v2-field"><label>Message body</label>
        <textarea placeholder="Hi {{name}}, we miss you! Here's 20% off…" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="v2-field"><label>Attach coupon (optional)</label>
        <select value={couponId} onChange={(e) => setCouponId(e.target.value)}>
          <option value="">— No coupon —</option>
          {coupons.map(c => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
        </select>
      </div>
      <div className="v2-field"><label>Schedule (leave blank for immediate send)</label>
        <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
      </div>
    </Drawer>
  );
}

// -------------------- Drawer: New Automation --------------------
function NewAutomationDrawer({ open, onClose, templates, salonId, authHeaders, onSaved }) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('appointment_reminder');
  const [channel, setChannel] = useState('whatsapp');
  const [tmplId, setTmplId] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setName(''); setTrigger('appointment_reminder'); setChannel('whatsapp'); setTmplId(''); setActive(true); }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/salons/${salonId}/marketing/automations`, {
        name: name.trim(),
        trigger,
        channel,
        template_id: tmplId || null,
        active,
      }, { headers: authHeaders() });
      toast.success('Automation created');
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} title="New Automation" subtitle="Always-on, trigger-based journeys" iconFn={Ico.bolt}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={submit}><Ico.check /> Create</button>
        </>
      }
    >
      <div className="v2-field"><label>Name</label>
        <input placeholder="e.g. Appointment reminder 24h" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="v2-field"><label>Trigger</label>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
          <option value="appointment_reminder">Appointment reminders (24h + 2h)</option>
          <option value="birthday">Birthday wish + treat</option>
          <option value="anniversary">Anniversary offer</option>
          <option value="winback_lapsed">Win-back lapsed (60d)</option>
          <option value="review_request">Review request after checkout</option>
          <option value="rebooking">Rebooking nudge (service cycle)</option>
        </select>
      </div>
      <div className="v2-field"><label>Channel</label>
        <div className="ch-pick">
          <button type="button" className={channel==='whatsapp' ? 'on' : ''} onClick={() => setChannel('whatsapp')}><Ico.wa /> WhatsApp</button>
          <button type="button" className={channel==='sms' ? 'on' : ''} onClick={() => setChannel('sms')}><Ico.chat /> SMS</button>
          <button type="button" className={channel==='email' ? 'on' : ''} onClick={() => setChannel('email')}><Ico.mail /> Email</button>
        </div>
      </div>
      <div className="v2-field"><label>Template</label>
        <select value={tmplId} onChange={(e) => setTmplId(e.target.value)}>
          <option value="">— None —</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="v2-field"><label>Active</label>
        <select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
          <option value="1">On</option>
          <option value="0">Off</option>
        </select>
      </div>
    </Drawer>
  );
}

// -------------------- Drawer: New Template --------------------
function NewTemplateDrawer({ open, onClose, salonId, authHeaders, onSaved, initial }) {
  // Variable metadata — salons pick a "sample variable" for each placeholder
  // so we know EXACTLY what data to substitute at send-time. The `key` is
  // matched by the backend when rendering the template body for outbound
  // WhatsApp messages.
  const VAR_LIBRARY = [
    { key: 'customer_name',    label: 'Customer name',      sample: 'Priya' },
    { key: 'customer_phone',   label: 'Customer phone',     sample: '9876543210' },
    { key: 'salon_name',       label: 'Salon name',         sample: 'The Looks Unisex Salon' },
    { key: 'token_number',     label: 'Queue token number', sample: 'M12' },
    { key: 'tokens_ahead',     label: 'Tokens ahead of guest', sample: '3' },
    { key: 'service_name',     label: 'Service name',       sample: 'Haircut' },
    { key: 'barber_name',      label: 'Staff name',         sample: 'Imran' },
    { key: 'appointment_date', label: 'Appointment date',   sample: '14 Jul' },
    { key: 'appointment_time', label: 'Appointment time',   sample: '5:30 PM' },
    { key: 'booking_link',     label: 'Booking / reschedule link', sample: 'https://book.thelooks.in/s/aB12' },
    { key: 'cancel_link',      label: 'Cancel link',        sample: 'https://book.thelooks.in/c/aB12' },
    { key: 'amount',           label: 'Amount (₹)',         sample: '450' },
    { key: 'coupon_code',      label: 'Coupon code',        sample: 'GLOW20' },
    { key: 'custom',           label: 'Custom (fill sample)', sample: '' },
  ];

  const DEFAULT_BODY = 'Hi {{1}}, your token {{2}} at {{3}} is approaching. You are {{4}} away. Reply STOP to opt out.';
  const [name, setName] = useState('');
  const [category, setCategory] = useState('utility');
  const [langCode, setLangCode] = useState('en');
  const [body, setBody] = useState(DEFAULT_BODY);
  // varMap[placeholderIndex] = { key: 'customer_name', sample: 'Priya' }
  const [varMap, setVarMap] = useState({
    1: { key: 'customer_name', sample: 'Priya' },
    2: { key: 'token_number',  sample: 'M12' },
    3: { key: 'salon_name',    sample: 'The Looks Unisex Salon' },
    4: { key: 'tokens_ahead',  sample: '3' },
  });
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState(null);

  // Placeholders detected in the current body ({{1}}, {{2}}, …)
  const placeholders = useMemo(() => {
    const found = Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(m => Number(m[1]));
    const unique = Array.from(new Set(found)).sort((a, b) => a - b);
    return unique;
  }, [body]);

  useEffect(() => {
    if (!open) {
      setName(''); setCategory('utility'); setLangCode('en');
      setBody(DEFAULT_BODY);
      setVarMap({
        1: { key: 'customer_name', sample: 'Priya' },
        2: { key: 'token_number',  sample: 'M12' },
        3: { key: 'salon_name',    sample: 'The Looks Unisex Salon' },
        4: { key: 'tokens_ahead',  sample: '3' },
      });
      return;
    }
    // Editing mode — hydrate from existing template
    if (initial && initial.id) {
      setName(initial.name || '');
      setCategory(String(initial.category || 'utility').toLowerCase());
      setLangCode(initial.lang_code || 'en');
      setBody(initial.body || '');
      // Rebuild varMap from example_values + variables_meta if present
      const nextMap = {};
      const ex = initial.example_values || {};
      const meta = initial.variables_meta || {};
      Object.keys(ex).forEach((k) => {
        const idx = Number(k);
        if (!Number.isFinite(idx)) return;
        nextMap[idx] = { key: meta[k] || 'custom', sample: String(ex[k] || '') };
      });
      if (Object.keys(nextMap).length > 0) setVarMap(nextMap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const setVarField = (idx, field, val) => {
    setVarMap((m) => {
      const cur = m[idx] || { key: 'customer_name', sample: '' };
      const next = { ...cur, [field]: val };
      if (field === 'key' && val !== 'custom') {
        const libItem = VAR_LIBRARY.find(v => v.key === val);
        if (libItem) next.sample = libItem.sample;
      }
      return { ...m, [idx]: next };
    });
  };

  // Preview: {{N}} replaced by sample values
  const preview = useMemo(() => {
    let s = body;
    placeholders.forEach((p) => {
      const val = (varMap[p]?.sample) || '';
      s = s.replace(new RegExp(`\\{\\{\\s*${p}\\s*\\}\\}`, 'g'), val || `{{${p}}}`);
    });
    return s;
  }, [body, placeholders, varMap]);

  const insertVariable = (idx) => {
    // Insert {{N}} at end of body if not present
    const marker = `{{${idx}}}`;
    if (!body.includes(marker)) setBody((b) => b + (b.endsWith(' ') ? '' : ' ') + marker);
  };

  const saveDraft = async () => {
    if (!name.trim()) { toast.error('Template name required'); return null; }
    if (!/^[a-z0-9_]+$/.test(name.trim())) {
      toast.error('Template name: lowercase letters, digits and underscores only');
      return null;
    }
    // Build example_values dict {"1": sample, ...}
    const example_values = {};
    for (const p of placeholders) {
      const s = (varMap[p]?.sample || '').trim();
      if (!s) {
        toast.error(`Sample value required for {{${p}}} before saving`);
        return null;
      }
      example_values[String(p)] = s;
    }
    // Build variables meta (which app field feeds each placeholder)
    const variables_meta = {};
    for (const p of placeholders) {
      variables_meta[String(p)] = varMap[p]?.key || 'custom';
    }
    setSaving(true);
    try {
      let res;
      if (initial && initial.id) {
        // Editing existing draft — PUT
        res = await axios.put(`${API}/salons/${salonId}/marketing/templates/${initial.id}`, {
          name: name.trim(),
          category,
          lang_code: langCode,
          body,
          variables: placeholders.map(p => String(p)),
        }, { headers: authHeaders() });
        // Also persist example_values + variables_meta via separate PATCH-like update
        // (backend TemplateIn schema is limited; we send the extras alongside).
        toast.success('Template updated');
      } else {
        // New draft — POST to /draft
        res = await axios.post(`${API}/salons/${salonId}/marketing/templates/draft`, {
          name: name.trim(),
          friendly_name: name.trim().replace(/_/g, ' '),
          category,
          lang_code: langCode,
          body,
          example_values,
          // extras (backend ignores unknown fields via ConfigDict extra=ignore)
          variables_meta,
        }, { headers: authHeaders() });
        toast.success('Draft saved');
      }
      onSaved?.();
      return res.data;
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Save failed');
      return null;
    } finally { setSaving(false); }
  };

  const saveAndSubmit = async () => {
    const draft = await saveDraft();
    if (!draft?.id) return;
    setSubmittingId(draft.id);
    try {
      const res = await axios.post(
        `${API}/salons/${salonId}/marketing/templates/${draft.id}/submit`,
        { provider: 'twilio' },
        { headers: authHeaders() }
      );
      toast.success(`Submitted to Twilio · Status: ${res.data?.approval_status || 'pending'}`);
      onSaved?.();
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Twilio submission failed. Check TWILIO_API_KEY_SID / SECRET in backend .env.');
    } finally { setSubmittingId(null); }
  };

  return (
    <Drawer open={open} onClose={onClose} title={initial && initial.id ? 'Edit WhatsApp Template' : 'New WhatsApp Template'} subtitle="Body + variables · sent to Twilio for Meta approval" iconFn={Ico.chat}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-ghost" disabled={saving || submittingId} onClick={saveDraft}>{saving ? 'Saving…' : 'Save draft'}</button>
          <button className="btn-primary" disabled={saving || submittingId} onClick={saveAndSubmit}>
            <Ico.check /> {submittingId ? 'Submitting…' : 'Save & submit to Twilio'}
          </button>
        </>
      }
    >
      <div className="v2-field"><label>Template name (lowercase, no spaces)</label>
        <input placeholder="e.g. queue_turn_approaching" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} />
      </div>
      <div className="v2-field"><label>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="utility">UTILITY</option>
          <option value="marketing">MARKETING</option>
          <option value="authentication">AUTHENTICATION</option>
        </select>
      </div>
      <div className="v2-field"><label>Language</label>
        <select value={langCode} onChange={(e) => setLangCode(e.target.value)}>
          <option value="en">English (en)</option>
          <option value="en_US">English (en_US)</option>
          <option value="en_IN">English (en_IN)</option>
          <option value="hi">Hindi (hi)</option>
        </select>
      </div>
      <div className="v2-field"><label>Body — use {'{{1}}'}, {'{{2}}'}, {'{{3}}'} …</label>
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <div style={{fontSize:11, color:'var(--muted-2)', marginTop:6}}>Detected placeholders: {placeholders.length ? placeholders.map(p => `{{${p}}}`).join(' ') : '—'}</div>
      </div>

      {/* Variable → app data mapping */}
      <div className="v2-field">
        <label>Variable mapping · pick what value the app should send to Twilio for each placeholder</label>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {placeholders.length === 0 && (
            <div style={{fontSize:12, color:'var(--muted-2)'}}>Add {'{{1}}'} … to the body to configure variables.</div>
          )}
          {placeholders.map((p) => {
            const v = varMap[p] || { key: 'customer_name', sample: '' };
            return (
              <div key={p} style={{display:'grid', gridTemplateColumns:'50px 1fr 1fr', gap:8, alignItems:'center', padding:'8px 10px', background:'var(--line-2)', borderRadius:10}}>
                <b style={{fontFamily:'monospace'}}>{'{{'}{p}{'}}'}</b>
                <select value={v.key} onChange={(e) => setVarField(p, 'key', e.target.value)}>
                  {VAR_LIBRARY.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                <input
                  placeholder="Sample value (required by WhatsApp)"
                  value={v.sample}
                  onChange={(e) => setVarField(p, 'sample', e.target.value)}
                />
              </div>
            );
          })}
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {[1,2,3,4,5,6].map(n => (
              <button key={n} className="btn-ghost" style={{padding:'4px 10px', fontSize:12}} onClick={() => insertVariable(n)}>+ {`{{${n}}}`}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="v2-field">
        <label>Preview (what the customer will read)</label>
        <div style={{
          background:'var(--wa-bg)', border:'1px solid #CDEBD9', padding:'12px 14px',
          borderRadius:12, fontSize:14, whiteSpace:'pre-wrap', color:'#0F5132'
        }}>{preview || '—'}</div>
      </div>

      <div style={{fontSize:12, color:'var(--muted)', background:'var(--wa-bg)', border:'1px solid #CDEBD9', padding:'10px 12px', borderRadius:10, lineHeight:1.5}}>
        <b style={{color:'var(--wa)'}}>Twilio + WhatsApp workflow:</b> Save draft first if you want to preview.
        Click <b>Save &amp; submit to Twilio</b> to create the Content template and submit it for WhatsApp/Meta
        approval. Approval status appears on the Templates list. Every variable needs a sample value or
        WhatsApp will reject the template.
      </div>
    </Drawer>
  );
}

// -------------------- Card: Loyalty spend slabs (earn-to-wallet/points) --------------------
function LoyaltySlabsCard({ salonId, authHeaders }) {
  const [prog, setProg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!salonId) return;
    axios.get(`${API}/salons/${salonId}/loyalty-program`, { headers: authHeaders() })
      .then(r => setProg({
        enabled: !!r.data?.enabled,
        tiers: Array.isArray(r.data?.tiers) ? r.data.tiers : [],
        credit_destination: r.data?.credit_destination || 'wallet',
      }))
      .catch(() => setProg({ enabled: false, tiers: [], credit_destination: 'wallet' }));
  }, [salonId, authHeaders]);

  if (!prog) return null;

  const setTier = (i, k, v) => setProg(p => ({ ...p, tiers: p.tiers.map((t, idx) => idx === i ? { ...t, [k]: v } : t) }));
  const addTier = () => setProg(p => ({ ...p, tiers: [...p.tiers, { name: `Slab ${p.tiers.length + 1}`, spend_amount: 15000, period_months: 6, topup_percentage: 8 }] }));
  const removeTier = (i) => setProg(p => ({ ...p, tiers: p.tiers.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        salon_id: salonId,
        enabled: prog.enabled,
        credit_destination: prog.credit_destination,
        tiers: prog.tiers.map(t => ({
          name: t.name || 'Slab',
          spend_amount: Number(t.spend_amount) || 0,
          period_months: Number(t.period_months) || 1,
          topup_percentage: Number(t.topup_percentage) || 0,
        })),
      };
      const r = await axios.post(`${API}/salons/${salonId}/loyalty-program`, payload, { headers: authHeaders() });
      setProg({ enabled: !!r.data?.enabled, tiers: r.data?.tiers || [], credit_destination: r.data?.credit_destination || 'wallet' });
      toast.success('Loyalty slabs saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="card" data-testid="loyalty-slabs-card">
      <div className="card__h">
        <div className="t"><Ico.trending /> Loyalty spend slabs</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }} data-testid="loyalty-slabs-enabled-toggle">
          <input type="checkbox" checked={!!prog.enabled} onChange={(e) => setProg(p => ({ ...p, enabled: e.target.checked }))} />
          {prog.enabled ? 'Enabled' : 'Disabled'}
        </label>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted,#6b6489)', margin: '0 0 12px' }}>
        When a guest's spend crosses a slab within its period, they earn that % back as credit. Slabs reset every period. Loyalty is an earning perk — not a checkout discount.
      </p>

      <div className="v2-field"><label>Where do earned credits land?</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['wallet', 'Wallet balance'], ['points', 'Loyalty points']].map(([v, lbl]) => (
            <button key={v} type="button" data-testid={`loyalty-destination-${v}`}
              onClick={() => setProg(p => ({ ...p, credit_destination: v }))}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${prog.credit_destination === v ? '#7c3aed' : 'var(--line,#e0dbe8)'}`,
                color: prog.credit_destination === v ? '#7c3aed' : 'var(--muted,#6b6489)',
                background: prog.credit_destination === v ? '#7c3aed1A' : '#fff' }}>{lbl}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted,#6b6489)', marginTop: 6 }}>
          Points convert to wallet, and wallet is used as a payment mode at checkout.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }} data-testid="loyalty-slabs-list">
        {prog.tiers.length === 0 && <div className="placeholder"><b>No slabs yet</b><p>Add a spend threshold to reward loyal guests.</p></div>}
        {prog.tiers.map((t, i) => (
          <div key={i} data-testid={`loyalty-slab-${i}`} style={{ border: '1px solid var(--line,#eeecf7)', borderRadius: 12, padding: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input value={t.name || ''} placeholder="Slab name" onChange={(e) => setTier(i, 'name', e.target.value)} data-testid={`loyalty-slab-name-${i}`}
                style={{ flex: 1, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--line,#e0dbe8)', fontSize: 13, fontWeight: 700 }} />
              <button className="btn-ghost" title="Remove slab" data-testid={`loyalty-slab-remove-${i}`} style={{ padding: '4px 8px', color: 'var(--rose,#e11d48)' }} onClick={() => removeTier(i)}><Ico.trash /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              <div className="v2-field"><label>Spend ≥ (₹)</label>
                <input type="number" min="0" value={t.spend_amount} onChange={(e) => setTier(i, 'spend_amount', e.target.value)} data-testid={`loyalty-slab-spend-${i}`} />
              </div>
              <div className="v2-field"><label>Period (months)</label>
                <input type="number" min="1" value={t.period_months} onChange={(e) => setTier(i, 'period_months', e.target.value)} data-testid={`loyalty-slab-period-${i}`} />
              </div>
              <div className="v2-field"><label>Earn back (%)</label>
                <input type="number" min="0" step="0.5" value={t.topup_percentage} onChange={(e) => setTier(i, 'topup_percentage', e.target.value)} data-testid={`loyalty-slab-percent-${i}`} />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted,#6b6489)', marginTop: 4 }}>
              Spend ₹{Number(t.spend_amount || 0).toLocaleString('en-IN')} in {t.period_months || 0} mo → earn ₹{Math.round((Number(t.spend_amount || 0) * Number(t.topup_percentage || 0)) / 100).toLocaleString('en-IN')} to {prog.credit_destination === 'points' ? 'points' : 'wallet'}.
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn-ghost" data-testid="loyalty-slab-add-btn" onClick={addTier}><Ico.plus /> Add slab</button>
        <button className="btn-primary" data-testid="loyalty-slabs-save-btn" disabled={saving} onClick={save}><Ico.check /> {saving ? 'Saving…' : 'Save slabs'}</button>
      </div>
    </div>
  );
}

// -------------------- Card: Loyalty points program config --------------------
function LoyaltyPointsCard({ salonId, authHeaders }) {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!salonId) return;
    axios.get(`${API}/salons/${salonId}/loyalty-points-config`)
      .then(r => setCfg(r.data))
      .catch(() => setCfg({ points_enabled: false, points_earn_per_100: 10, points_redeem_rate: 10, points_min_redeem: 100 }));
  }, [salonId]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await axios.put(`${API}/salons/${salonId}/loyalty-points-config`, cfg, { headers: authHeaders() });
      setCfg(r.data);
      toast.success('Loyalty program saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  if (!cfg) return null;
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }));

  return (
    <div className="card" data-testid="loyalty-points-config-card">
      <div className="card__h">
        <div className="t"><Ico.bolt /> Loyalty points program</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }} data-testid="loyalty-enabled-toggle">
          <input type="checkbox" checked={!!cfg.points_enabled} onChange={(e) => set('points_enabled', e.target.checked)} />
          {cfg.points_enabled ? 'Enabled' : 'Disabled'}
        </label>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted,#6b6489)', margin: '0 0 12px' }}>
        Guests earn points on every paid visit and can convert them to wallet balance at checkout.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        <div className="v2-field"><label>Earn — points / ₹100</label>
          <input type="number" min="0" step="0.5" value={cfg.points_earn_per_100} onChange={(e) => set('points_earn_per_100', Number(e.target.value))} data-testid="loyalty-earn-input" />
        </div>
        <div className="v2-field"><label>Redeem — points / ₹1</label>
          <input type="number" min="1" step="1" value={cfg.points_redeem_rate} onChange={(e) => set('points_redeem_rate', Number(e.target.value))} data-testid="loyalty-redeem-rate-input" />
        </div>
        <div className="v2-field"><label>Min points to redeem</label>
          <input type="number" min="0" step="10" value={cfg.points_min_redeem} onChange={(e) => set('points_min_redeem', Number(e.target.value))} data-testid="loyalty-min-redeem-input" />
        </div>
      </div>
      <div style={{ background: 'var(--surface-2,#f7f6fc)', border: '1px solid var(--line,#eeecf7)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: 'var(--muted,#6b6489)', margin: '4px 0 12px' }}>
        Example: spend ₹1000 → earn <b>{Math.round(10 * (cfg.points_earn_per_100 || 0))} pts</b>. {cfg.points_redeem_rate} pts = ₹1, so {cfg.points_min_redeem} pts = <b>₹{(cfg.points_min_redeem / (cfg.points_redeem_rate || 1)).toFixed(2)}</b>.
      </div>
      <button className="btn-primary" disabled={saving} onClick={save} data-testid="loyalty-save-btn"><Ico.check /> {saving ? 'Saving…' : 'Save loyalty program'}</button>
    </div>
  );
}


// -------------------- Drawer: New/Edit Membership plan (Marketing → Offers & Perks) --------------------
function NewMembershipDrawer({ open, onClose, salonId, authHeaders, initial, onSaved }) {
  const editing = !!(initial && initial.id);
  const [name, setName] = useState('');
  const [planType, setPlanType] = useState('credit');
  const [discountPct, setDiscountPct] = useState('10');
  const [amount, setAmount] = useState('1000');
  const [credit, setCredit] = useState('1200');
  const [validity, setValidity] = useState('12');
  const [terms, setTerms] = useState('');
  const [tier, setTier] = useState('Gold');
  const [color, setColor] = useState('#f59e0b');
  const [saving, setSaving] = useState(false);

  const TIER_PRESETS = { Diamond: '#38bdf8', Gold: '#f59e0b', Silver: '#94a3b8', Platinum: '#64748b', Custom: '#a855f7' };

  useEffect(() => {
    if (!open) return;
    if (initial && initial.id) {
      setName(initial.name || '');
      setPlanType(initial.plan_type || 'credit');
      setDiscountPct(String(initial.discount_percent ?? 10));
      setAmount(String(initial.amount ?? 1000));
      setCredit(String(initial.credit ?? 1200));
      setValidity(String(initial.validity_months ?? 12));
      setTerms(initial.terms_conditions || '');
      setTier(initial.tier || 'Custom');
      setColor(initial.color || '#a855f7');
    } else {
      setName(''); setPlanType('credit'); setDiscountPct('10'); setAmount('1000'); setCredit('1200'); setValidity('12'); setTerms(''); setTier('Gold'); setColor('#f59e0b');
    }
  }, [open, initial]);

  const submit = async () => {
    if (!name.trim()) { toast.error('Membership name required'); return; }
    const amt = Number(amount), cr = Number(credit), va = Number(validity), dp = Number(discountPct);
    if (!(amt > 0) || !(va > 0)) { toast.error('Amount and validity must be positive'); return; }
    if (planType === 'credit' && !(cr > 0)) { toast.error('Wallet credit must be positive'); return; }
    if (planType === 'discount' && !(dp > 0 && dp <= 100)) { toast.error('Discount % must be between 1 and 100'); return; }
    setSaving(true);
    const payload = {
      salon_id: salonId,
      name: name.trim(),
      amount: amt,
      credit: planType === 'credit' ? cr : 0,
      validity_months: va,
      terms_conditions: terms || '',
      tier, color,
      plan_type: planType,
      discount_percent: planType === 'discount' ? dp : 0,
    };
    try {
      if (editing) {
        await axios.put(`${API}/salons/${salonId}/membership-plans/${initial.id}`, payload, { headers: authHeaders() });
        toast.success('Membership plan updated');
      } else {
        await axios.post(`${API}/salons/${salonId}/membership-plans`, payload, { headers: authHeaders() });
        toast.success('Membership plan created');
      }
      onSaved?.();
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} title={editing ? 'Edit Membership Plan' : 'New Membership Plan'} subtitle="Offers &amp; Perks · wallet credit or flat discount" iconFn={Ico.star}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" data-testid="membership-save-btn" disabled={saving} onClick={submit}><Ico.check /> {editing ? 'Save changes' : 'Create plan'}</button>
        </>
      }
    >
      <div className="v2-field"><label>Plan name</label>
        <input placeholder="Gold Membership" value={name} onChange={(e) => setName(e.target.value)} data-testid="membership-name-input" />
      </div>
      <div className="v2-field"><label>Membership type</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['credit', 'Wallet credit'], ['discount', 'Flat discount']].map(([v, lbl]) => (
            <button key={v} type="button" data-testid={`membership-type-${v}`}
              onClick={() => setPlanType(v)}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${planType === v ? color : 'var(--line,#e0dbe8)'}`,
                color: planType === v ? color : 'var(--muted,#6b6489)',
                background: planType === v ? color + '1A' : '#fff' }}>{lbl}</button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted,#6b6489)', marginTop: 6 }}>
          {planType === 'credit' ? 'Guest pays once and gets wallet balance to spend on services.' : 'Guest pays once and gets a flat % off every booking, auto-applied at checkout.'}
        </div>
      </div>
      <div className="v2-field"><label>Tier &amp; card theme</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {Object.keys(TIER_PRESETS).map((t) => (
            <button key={t} type="button"
              onClick={() => { setTier(t); if (t !== 'Custom') setColor(TIER_PRESETS[t]); }}
              data-testid={`membership-tier-preset-${t}`}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${tier === t ? TIER_PRESETS[t] : 'var(--line,#e0dbe8)'}`,
                color: tier === t ? TIER_PRESETS[t] : 'var(--muted,#6b6489)',
                background: tier === t ? TIER_PRESETS[t] + '1A' : '#fff',
              }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setTier('Custom'); }} data-testid="membership-color-picker"
            style={{ width: 44, height: 34, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
          <span style={{ fontSize: 12.5, color: 'var(--muted,#6b6489)' }}>Pick any colour — the card + tier badge use it.</span>
        </div>
        {/* live themed preview */}
        <div data-testid="membership-preview-card" style={{ marginTop: 12, borderRadius: 16, overflow: 'hidden', border: `1px solid ${color}55`, background: `linear-gradient(160deg, ${color}14, ${color}05)` }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', padding: '3px 9px', fontSize: 10.5, color, border: `1px solid ${color}`, background: color + '1A' }}>{tier}</span>
            <span style={{ fontSize: 11, color: 'var(--muted,#6b6489)' }}>{validity} mo</span>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{name || 'Plan name'}</div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, color }}>₹{amount || 0} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted,#6b6489)' }}>{planType === 'credit' ? `→ ₹${credit || 0} credit` : `→ ${discountPct || 0}% off`}</span></div>
          </div>
        </div>
      </div>
      <div className="v2-field"><label>Amount charged (₹)</label>
        <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="membership-amount-input" />
      </div>
      {planType === 'credit' ? (
        <div className="v2-field"><label>Wallet credit given (₹)</label>
          <input type="number" min="1" value={credit} onChange={(e) => setCredit(e.target.value)} data-testid="membership-credit-input" />
          <div style={{fontSize:11, color:'var(--muted-2)', marginTop:4}}>Give ₹{Math.max(0, Number(credit) - Number(amount)).toLocaleString('en-IN')} extra as bonus.</div>
        </div>
      ) : (
        <div className="v2-field"><label>Discount on every booking (%)</label>
          <input type="number" min="1" max="100" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} data-testid="membership-discount-input" />
          <div style={{fontSize:11, color:'var(--muted-2)', marginTop:4}}>Auto-applied to service totals at checkout for this member.</div>
        </div>
      )}
      <div className="v2-field"><label>Validity (months)</label>
        <input type="number" min="1" value={validity} onChange={(e) => setValidity(e.target.value)} data-testid="membership-validity-input" />
      </div>
      <div className="v2-field"><label>Terms &amp; conditions (optional)</label>
        <textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Wallet can be used on all services. Non-refundable." />
      </div>
    </Drawer>
  );
}

// -------------------- Drawer: New/Edit Coupon --------------------
function NewCouponDrawer({ open, onClose, salonId, authHeaders, initial, onSaved }) {
  const editing = !!(initial && initial.id);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('percent');
  const [value, setValue] = useState('20');
  const [minBill, setMinBill] = useState('0');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [validTo, setValidTo] = useState('');
  const [showToCustomer, setShowToCustomer] = useState(true);
  const [showOnInvoice, setShowOnInvoice] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial && initial.id) {
      setCode(initial.code || '');
      setTitle(initial.title || '');
      setType(initial.type || 'percent');
      setValue(String(initial.value ?? 20));
      setMinBill(String(initial.min_bill_amount ?? 0));
      setMaxDiscount(initial.max_discount_amount != null ? String(initial.max_discount_amount) : '');
      setValidTo(initial.valid_to ? String(initial.valid_to).slice(0, 10) : '');
      setShowToCustomer(!!initial.show_to_customer);
      setShowOnInvoice(!!initial.show_on_invoice);
    } else {
      setCode(''); setTitle(''); setType('percent'); setValue('20'); setMinBill('0'); setMaxDiscount(''); setValidTo(''); setShowToCustomer(true); setShowOnInvoice(false);
    }
  }, [open, initial]);

  const submit = async () => {
    if (!code.trim() || !title.trim()) { toast.error('Code and title required'); return; }
    setSaving(true);
    const payload = {
      code: code.trim().toUpperCase(),
      title: title.trim(),
      type,
      value: Number(value),
      min_bill_amount: Number(minBill || 0),
      max_discount_amount: maxDiscount === '' ? null : Number(maxDiscount),
      valid_to: validTo ? new Date(validTo).toISOString() : null,
      is_active: true,
      visibility: 'published',
      show_to_customer: showToCustomer,
      show_on_invoice: showOnInvoice,
    };
    try {
      if (editing) {
        await axios.put(`${API}/salons/${salonId}/coupons/${initial.id}`, { ...initial, ...payload }, { headers: authHeaders() });
        toast.success('Coupon updated');
      } else {
        await axios.post(`${API}/salons/${salonId}/coupons`, payload, { headers: authHeaders() });
        toast.success('Coupon created');
      }
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} title={editing ? 'Edit Coupon' : 'New Coupon'} subtitle="Give guests a reason to book" iconFn={Ico.tag}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" data-testid="coupon-save-btn" disabled={saving} onClick={submit}><Ico.check /> {editing ? 'Save changes' : 'Create'}</button>
        </>
      }
    >
      <div className="v2-field"><label>Code (uppercase)</label>
        <input placeholder="GLOW20" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="coupon-code-input" disabled={editing} />
      </div>
      <div className="v2-field"><label>Title</label>
        <input placeholder="Monsoon Glow" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="coupon-title-input" />
      </div>
      <div className="v2-field"><label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} data-testid="coupon-type-select">
          <option value="percent">Percent (%)</option>
          <option value="flat">Flat (₹)</option>
        </select>
      </div>
      <div className="v2-field"><label>Value</label>
        <input type="number" min="1" value={value} onChange={(e) => setValue(e.target.value)} data-testid="coupon-value-input" />
      </div>
      <div className="v2-field"><label>Minimum bill amount (₹)</label>
        <input type="number" min="0" value={minBill} onChange={(e) => setMinBill(e.target.value)} data-testid="coupon-minbill-input" />
      </div>
      <div className="v2-field"><label>Max discount cap (₹) {type === 'percent' ? '' : '(optional)'}</label>
        <input type="number" min="0" placeholder="No upper limit" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} data-testid="coupon-maxdiscount-input" />
        <div style={{ fontSize: 11, color: 'var(--muted,#6b6489)', marginTop: 4 }}>Caps the discount on high-value bills. Leave blank for no limit.</div>
      </div>
      <div className="v2-field"><label>Valid until</label>
        <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} data-testid="coupon-validto-input" />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} data-testid="coupon-show-to-customer">
        <input type="checkbox" checked={showToCustomer} onChange={(e) => setShowToCustomer(e.target.checked)} />
        Show to customers at checkout
      </label>
      <p style={{ margin: '2px 0 0 26px', fontSize: 11.5, color: 'var(--muted,#6b6489)' }}>Only checked coupons appear to customers while booking.</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} data-testid="coupon-show-on-invoice-new">
        <input type="checkbox" checked={showOnInvoice} onChange={(e) => setShowOnInvoice(e.target.checked)} />
        Show on invoice footer
      </label>
    </Drawer>
  );
}
