import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import LoyaltyProgramSettings from '@/components/LoyaltyProgramSettings';
import MembershipManagement from '@/components/MembershipManagement';
import SoldMembershipManagement from '@/components/SoldMembershipManagement';
import {
  Megaphone, BarChart3, Ticket, Gift, Award, Sparkles, Image as ImageIcon,
  Settings as SettingsIcon, Users as UsersIcon, Send, Plus, Trash2, Eye, EyeOff, RefreshCw,
  Zap, Play, Pause, Square, MessageCircle, Package, MessageSquare, CheckCircle2, Clock, XCircle, AlertCircle
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SUB_TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'campaigns', label: 'Campaigns', icon: Send },
  { id: 'automations', label: 'Automations', icon: Zap },
  { id: 'templates', label: 'Templates', icon: MessageSquare },
  { id: 'offers', label: 'Offers & Perks', icon: Gift },
  { id: 'gallery', label: 'Gallery', icon: ImageIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const OFFERS_TABS = [
  { id: 'coupons', label: 'Coupons', icon: Ticket },
  { id: 'rewards', label: 'Rewards', icon: Gift },
  { id: 'loyalty', label: 'Loyalty', icon: Award },
  { id: 'memberships', label: 'Memberships', icon: Sparkles },
];

const SEGMENT_FIELDS = [
  { value: 'birthday_month', label: 'Birthday in month', operand: 'month' },
  { value: 'wedding_anniversary_month', label: 'Wedding anniversary in month', operand: 'month' },
  { value: 'spouse_birthday_month', label: "Spouse's birthday in month", operand: 'month' },
  { value: 'gender', label: 'Gender', operand: 'gender' },
  { value: 'age_min', label: 'Age ≥ (years)', operand: 'number' },
  { value: 'age_max', label: 'Age ≤ (years)', operand: 'number' },
  { value: 'last_visit_min_days', label: 'Last visit ≥ N days ago', operand: 'number' },
  { value: 'last_visit_max_days', label: 'Last visit ≤ N days ago', operand: 'number' },
  { value: 'avg_spend_min', label: 'Avg spend ≥ ₹', operand: 'number' },
  { value: 'total_spend_min', label: 'Total spend ≥ ₹', operand: 'number' },
  { value: 'visit_count_min', label: 'Visits ≥', operand: 'number' },
  { value: 'has_wallet', label: 'Has membership wallet', operand: 'bool' },
];

export default function MarketingTab({ salonId, getAuthHeaders, children, onOpenSubtab }) {
  const [activeSub, setActiveSub] = useState('overview');

  const renderPanel = () => {
    if (activeSub === 'overview') return <OverviewPanel salonId={salonId} getAuthHeaders={getAuthHeaders} />;
    if (activeSub === 'campaigns') return <CampaignsPanel salonId={salonId} getAuthHeaders={getAuthHeaders} />;
    if (activeSub === 'automations') return <AutomationsPanel salonId={salonId} getAuthHeaders={getAuthHeaders} />;
    if (activeSub === 'templates') return <TemplatesPanel salonId={salonId} getAuthHeaders={getAuthHeaders} />;
    if (activeSub === 'offers') return <OffersAndPerksPanel salonId={salonId} getAuthHeaders={getAuthHeaders} />;
    if (activeSub === 'gallery') return children /* Gallery legacy panel rendered by parent */;
    if (activeSub === 'settings') return <MarketingSettingsPanel salonId={salonId} getAuthHeaders={getAuthHeaders} />;
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="bg-card/50 backdrop-blur-sm border border-gold/20 rounded-2xl p-3 md:p-5 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/30">
            <Megaphone className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-playfair font-bold text-foreground">Marketing</h2>
            <p className="text-xs text-muted-foreground">Campaigns · Automations · Templates · Offers &amp; Perks · Gallery · Settings</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {SUB_TABS.map(t => {
            const Icon = t.icon;
            const active = activeSub === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setActiveSub(t.id); onOpenSubtab && onOpenSubtab(t.id); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm border transition-all ${
                  active
                    ? 'bg-gold text-black border-gold shadow-sm'
                    : 'bg-background/70 text-foreground border-border hover:bg-accent/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {renderPanel()}
    </div>
  );
}


// ============ Overview ============

function OverviewPanel({ salonId, getAuthHeaders }) {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [dailySends, setDailySends] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const [ov, st, cp] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/marketing/overview`, { headers: getAuthHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/settings`, { headers: getAuthHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/campaigns`, { headers: getAuthHeaders() }),
      ]);
      setData(ov.data);
      setSettings(st.data);
      const list = cp.data.campaigns || [];
      setCampaigns(list);
      // Build a last-7-days bar from campaign message counts we have
      // (best-effort: fetch per-campaign messages for last-launched 3)
      const recent = list
        .filter(c => c.launched_at)
        .sort((a, b) => new Date(b.launched_at) - new Date(a.launched_at))
        .slice(0, 5);
      const buckets = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        buckets[d.toISOString().slice(0, 10)] = 0;
      }
      for (const c of recent) {
        try {
          const m = await axios.get(`${API}/salons/${salonId}/marketing/campaigns/${c.id}/messages?limit=500`, { headers: getAuthHeaders() });
          for (const msg of (m.data.messages || [])) {
            if (!msg.sent_at) continue;
            const k = msg.sent_at.slice(0, 10);
            if (k in buckets) buckets[k]++;
          }
        } catch (e) { /* skip */ }
      }
      setDailySends(Object.entries(buckets).map(([date, count]) => ({ date, count })));
    } catch (e) {
      toast.error('Failed to load overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [salonId]);

  const cards = [
    { label: 'Messages sent (30d)', value: data?.messaging?.sent ?? 0, tone: 'from-blue-500/20 to-blue-500/5', accent: 'text-blue-500' },
    { label: 'Delivered', value: data?.messaging?.delivered ?? 0, tone: 'from-emerald-500/20 to-emerald-500/5', accent: 'text-emerald-500' },
    { label: 'Read', value: data?.messaging?.read ?? 0, tone: 'from-violet-500/20 to-violet-500/5', accent: 'text-violet-500' },
    { label: 'Coupon redemptions', value: data?.conversion?.coupon_redemptions ?? 0, tone: 'from-amber-500/20 to-amber-500/5', accent: 'text-amber-500' },
    { label: 'Discount given (₹)', value: (data?.conversion?.coupon_discount_amount ?? 0).toFixed(2), tone: 'from-rose-500/20 to-rose-500/5', accent: 'text-rose-500' },
    { label: 'Failed sends', value: data?.messaging?.failed ?? 0, tone: 'from-red-500/20 to-red-500/5', accent: 'text-red-500' },
  ];

  const spend = Number(data?.messaging?.spend_inr ?? 0);
  const cap = Number(settings?.monthly_cap_inr ?? 0);
  const pct = cap > 0 ? Math.min(100, (spend / cap) * 100) : 0;
  const maxDaily = Math.max(1, ...dailySends.map(d => d.count));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Performance & Spend — Last 30 days</CardTitle>
            {data?.range?.from && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {new Date(data.range.from).toLocaleDateString()} — {new Date(data.range.to).toLocaleDateString()}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {cards.map((c, i) => (
              <div key={i} className={`p-3 rounded-xl border border-border bg-gradient-to-br ${c.tone}`}>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-2xl font-bold ${c.accent}`}>{c.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Spend vs Cap */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-gold" /> Spend vs Monthly Cap
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-2xl font-bold text-gold">₹{spend.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                {cap > 0 ? `of ₹${cap.toFixed(0)} cap` : 'no cap set'}
              </p>
            </div>
            <div className="h-2.5 w-full rounded-full bg-background/60 border border-border overflow-hidden">
              <div
                className={`h-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <p className="text-[10px] text-muted-foreground">{cap > 0 ? `${pct.toFixed(0)}% used` : 'set a cap in Settings'}</p>
              <p className="text-[10px] text-muted-foreground">
                {data?.campaigns_run || 0} campaign(s) · {data?.automations_active || 0} automation(s) active
              </p>
            </div>
            {settings?.spend_brake && (
              <p className="text-[11px] text-red-500 font-semibold mt-2">
                🛑 Spend brake is ON — all sending is paused.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Daily sends bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gold" /> Sends — Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailySends.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data yet.</p>
            ) : (
              <div className="flex items-end gap-1.5 h-24">
                {dailySends.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-gradient-to-t from-gold/60 to-gold rounded-t"
                      style={{ height: `${(d.count / maxDaily) * 100}%`, minHeight: d.count > 0 ? '4px' : '0' }}
                      title={`${d.date}: ${d.count}`}
                    />
                    <p className="text-[9px] text-muted-foreground">
                      {new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })[0]}
                    </p>
                    <p className="text-[9px] font-semibold">{d.count}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top campaigns */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="w-4 h-4 text-gold" /> Recent Campaigns
          </CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-xs text-muted-foreground">No campaigns yet. Head to the Campaigns tab to build one.</p>
          ) : (
            <div className="divide-y divide-border">
              {campaigns.slice(0, 5).map(c => (
                <div key={c.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.status} · sent {c.stats?.sent || 0} · failed {c.stats?.failed || 0}
                      {c.launched_at ? ` · ${new Date(c.launched_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                    c.status === 'completed' ? 'border-emerald-500/50 text-emerald-600' :
                    c.status === 'running' ? 'border-emerald-500/50 text-emerald-600' :
                    c.status === 'paused' ? 'border-amber-500/50 text-amber-600' :
                    c.status === 'stopped' || c.status === 'failed' ? 'border-red-500/50 text-red-500' :
                    'border-slate-500/50 text-slate-500'
                  }`}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Metrics refresh from the backend and provider webhook. Read/delivered require Meta WhatsApp Cloud API webhooks
        (Twilio doesn&apos;t forward read receipts for template messages).
      </p>
    </div>
  );
}


// ============ Campaigns (with embedded Segments builder) ============

function CampaignsPanel({ salonId, getAuthHeaders }) {
  const [segments, setSegments] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openBuilder, setOpenBuilder] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openComposer, setOpenComposer] = useState(false);
  const [openMessages, setOpenMessages] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const [s, c, cp] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/marketing/segments`, { headers: getAuthHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/campaigns`, { headers: getAuthHeaders() }),
        axios.get(`${API}/salons/${salonId}/coupons`, { headers: getAuthHeaders() }),
      ]);
      setSegments(s.data.segments || []);
      setCampaigns(c.data.campaigns || []);
      setCoupons(cp.data.coupons || []);
    } catch (e) {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [salonId]);

  const openNew = () => {
    setEditing({ name: '', description: '', rules: { logic: 'AND', conditions: [] } });
    setOpenBuilder(true);
  };
  const openEdit = (s) => {
    setEditing({ ...s, rules: s.rules || { logic: 'AND', conditions: [] } });
    setOpenBuilder(true);
  };
  const del = async (s) => {
    if (!window.confirm(`Delete segment "${s.name}"?`)) return;
    try {
      await axios.delete(`${API}/salons/${salonId}/marketing/segments/${s.id}`, { headers: getAuthHeaders() });
      toast.success('Segment deleted');
      load();
    } catch (e) { toast.error('Delete failed'); }
  };

  const launchCampaign = async (c) => {
    if (!window.confirm(`Launch campaign "${c.name}" now?`)) return;
    try {
      await axios.post(`${API}/salons/${salonId}/marketing/campaigns/${c.id}/launch`, {}, { headers: getAuthHeaders() });
      toast.success('Campaign launched — messages sending in background');
      setTimeout(load, 1200);
    } catch (e) { toast.error(e.response?.data?.detail || 'Launch failed'); }
  };
  const controlCampaign = async (c, action) => {
    try {
      await axios.post(`${API}/salons/${salonId}/marketing/campaigns/${c.id}/${action}`, {}, { headers: getAuthHeaders() });
      toast.success(`Campaign ${action}d`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || `${action} failed`); }
  };
  const deleteCampaign = async (c) => {
    if (!window.confirm(`Delete campaign "${c.name}"?`)) return;
    try {
      await axios.delete(`${API}/salons/${salonId}/marketing/campaigns/${c.id}`, { headers: getAuthHeaders() });
      toast.success('Campaign deleted');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  const statusColor = (s) => ({
    draft: 'border-slate-500/50 text-slate-500',
    scheduled: 'border-blue-500/50 text-blue-500',
    running: 'border-emerald-500/50 text-emerald-500',
    completed: 'border-emerald-500/50 text-emerald-500',
    paused: 'border-amber-500/50 text-amber-500',
    stopped: 'border-red-500/50 text-red-500',
    failed: 'border-red-500/50 text-red-500',
  }[s] || 'border-slate-500/50 text-slate-500');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4 text-gold" /> Campaigns
          </CardTitle>
          <Button size="sm" className="bg-gold text-black hover:bg-gold/90" onClick={() => setOpenComposer(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New campaign
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campaigns yet. Send a one-time WhatsApp blast to a segment or to specific phone numbers,
              or schedule it for later. The active provider is <b>{'Twilio'}</b> (change in Settings).
            </p>
          ) : (
            <div className="divide-y divide-border">
              {campaigns.map(c => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{c.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusColor(c.status)}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.segment_id ? 'To segment' : `To ${(c.ad_hoc_phones || []).length} phone(s)`} ·
                      sent {c.stats?.sent || 0} · failed {c.stats?.failed || 0}
                      {c.schedule_at ? ` · scheduled ${new Date(c.schedule_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setOpenMessages(c)}>
                      <MessageCircle className="w-3.5 h-3.5 mr-1" /> Messages
                    </Button>
                    {['draft', 'scheduled'].includes(c.status) && (
                      <Button variant="outline" size="sm" onClick={() => launchCampaign(c)}>
                        <Play className="w-3.5 h-3.5 mr-1" /> Launch
                      </Button>
                    )}
                    {c.status === 'running' && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => controlCampaign(c, 'pause')}>
                          <Pause className="w-3.5 h-3.5 mr-1" /> Pause
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => controlCampaign(c, 'stop')}>
                          <Square className="w-3.5 h-3.5 mr-1" /> Stop
                        </Button>
                      </>
                    )}
                    {c.status === 'paused' && (
                      <Button variant="outline" size="sm" onClick={() => controlCampaign(c, 'resume')}>
                        <Play className="w-3.5 h-3.5 mr-1" /> Resume
                      </Button>
                    )}
                    {['draft', 'completed', 'stopped', 'failed'].includes(c.status) && (
                      <Button variant="ghost" size="sm" onClick={() => deleteCampaign(c)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-gold" /> Audience Segments
          </CardTitle>
          <Button size="sm" className="bg-gold text-black hover:bg-gold/90" onClick={openNew}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New segment
          </Button>
        </CardHeader>
        <CardContent>
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No segments yet. Segments let you target customers by birthday/anniversary,
              last-visit-days, spend, gender and more.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {segments.map(s => (
                <div key={s.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {(s.rules?.conditions || []).length} rule(s) · {s.rules?.logic || 'AND'} · {s.description || 'No description'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => del(s)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {openBuilder && editing && (
        <SegmentBuilderDialog
          salonId={salonId}
          getAuthHeaders={getAuthHeaders}
          initial={editing}
          onClose={() => setOpenBuilder(false)}
          onSaved={() => { setOpenBuilder(false); load(); }}
        />
      )}

      {openComposer && (
        <CampaignComposerDialog
          salonId={salonId}
          getAuthHeaders={getAuthHeaders}
          segments={segments}
          coupons={coupons}
          onClose={() => setOpenComposer(false)}
          onSaved={() => { setOpenComposer(false); load(); }}
        />
      )}

      {openMessages && (
        <CampaignMessagesDialog
          salonId={salonId}
          getAuthHeaders={getAuthHeaders}
          campaign={openMessages}
          onClose={() => setOpenMessages(null)}
        />
      )}
    </div>
  );
}

function CampaignComposerDialog({ salonId, getAuthHeaders, segments, coupons, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '',
    segment_id: '',
    ad_hoc_phones: '',
    template_body: 'Hi {{name}}! Enjoy {{coupon_title}} — use code {{coupon_code}} at our salon.',
    coupon_id: '',
    schedule_at: '',
  });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  const previewAudience = async () => {
    try {
      const body = {
        segment_id: form.segment_id || null,
        ad_hoc_phones: form.ad_hoc_phones ? form.ad_hoc_phones.split(/[\s,]+/).filter(Boolean) : null,
      };
      const res = await axios.post(`${API}/salons/${salonId}/marketing/campaigns/preview-audience`, body, { headers: getAuthHeaders() });
      setPreview(res.data);
    } catch (e) { toast.error('Preview failed'); }
  };

  const save = async ({ launch }) => {
    if (!form.name.trim()) return toast.error('Campaign name is required');
    if (!form.template_body.trim()) return toast.error('Message body is required');
    if (!form.segment_id && !form.ad_hoc_phones.trim()) return toast.error('Pick a segment or enter phone numbers');
    try {
      setSaving(true);
      const body = {
        name: form.name.trim(),
        segment_id: form.segment_id || null,
        ad_hoc_phones: form.ad_hoc_phones ? form.ad_hoc_phones.split(/[\s,]+/).filter(Boolean) : null,
        template_body: form.template_body,
        coupon_id: form.coupon_id || null,
        schedule_at: form.schedule_at ? new Date(form.schedule_at).toISOString() : null,
      };
      const res = await axios.post(`${API}/salons/${salonId}/marketing/campaigns`, body, { headers: getAuthHeaders() });
      if (launch) {
        await axios.post(`${API}/salons/${salonId}/marketing/campaigns/${res.data.id}/launch`, {}, { headers: getAuthHeaders() });
        toast.success('Campaign launched');
      } else {
        toast.success(form.schedule_at ? 'Campaign scheduled' : 'Campaign saved as draft');
      }
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New WhatsApp campaign</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <Label>Campaign name</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Diwali offers" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Segment (optional)</Label>
              <select value={form.segment_id} onChange={e => setForm({ ...form, segment_id: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">— none —</option>
                {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Attach coupon (optional)</Label>
              <select value={form.coupon_id} onChange={e => setForm({ ...form, coupon_id: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">— none —</option>
                {coupons.map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Or send to specific phones (comma or space separated)</Label>
            <Input value={form.ad_hoc_phones} onChange={e => setForm({ ...form, ad_hoc_phones: e.target.value })} placeholder="9999900011, 9899900012" />
          </div>
          <div>
            <Label>Message body — supports {'{{name}}'} / {'{{coupon_code}}'} / {'{{coupon_title}}'} / {'{{coupon_value}}'}</Label>
            <textarea
              value={form.template_body}
              onChange={e => setForm({ ...form, template_body: e.target.value })}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              For Meta production sends, only pre-approved WhatsApp templates can be used outside the 24-hour service window. Twilio (currently active) uses your approved sender.
            </p>
          </div>
          <div>
            <Label>Schedule (optional, in your local time)</Label>
            <Input type="datetime-local" value={form.schedule_at} onChange={e => setForm({ ...form, schedule_at: e.target.value })} />
            <p className="text-[11px] text-muted-foreground mt-1">Leave blank to send immediately when you click Launch. Scheduled campaigns are picked up every 5 minutes.</p>
          </div>

          <div className="p-3 rounded-lg bg-background/50 border border-border">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold">Audience preview</p>
              <Button variant="outline" size="sm" onClick={previewAudience}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Preview
              </Button>
            </div>
            {preview ? (
              <p className="text-sm">
                <b className="text-gold text-lg">{preview.count}</b> customer(s) will receive this message.
                Estimated spend: <b>₹{preview.estimated_spend_inr}</b>
              </p>
            ) : <p className="text-xs text-muted-foreground">Click Preview to compute the audience and estimated cost.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => save({ launch: false })} disabled={saving}>
            {form.schedule_at ? 'Schedule' : 'Save draft'}
          </Button>
          <Button className="bg-gold text-black hover:bg-gold/90" onClick={() => save({ launch: true })} disabled={saving}>
            <Send className="w-3.5 h-3.5 mr-1" /> Save & Launch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignMessagesDialog({ salonId, getAuthHeaders, campaign, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/salons/${salonId}/marketing/campaigns/${campaign.id}/messages`, { headers: getAuthHeaders() });
      setMessages(res.data.messages || []);
    } catch (e) { toast.error('Failed to load messages'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaign.id]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{campaign.name} — Messages ({messages.length})</DialogTitle></DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
            messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet.</p> :
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2">Phone</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th>Sent</th>
                  <th>Read</th>
                </tr>
              </thead>
              <tbody>
                {messages.map(m => (
                  <tr key={m.id} className="border-b border-border/60">
                    <td className="py-1.5">{m.to_phone}</td>
                    <td className={`py-1.5 ${m.status === 'sent' || m.status === 'delivered' || m.status === 'read' ? 'text-emerald-500' : m.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'}`}>{m.status}</td>
                    <td className="py-1.5">{m.provider}</td>
                    <td className="py-1.5 text-xs">{m.sent_at ? new Date(m.sent_at).toLocaleTimeString() : '—'}</td>
                    <td className="py-1.5 text-xs">{m.read_at ? new Date(m.read_at).toLocaleTimeString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SegmentBuilderDialog({ salonId, getAuthHeaders, initial, onClose, onSaved }) {
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  const [logic, setLogic] = useState(initial.rules?.logic || 'AND');
  const [conditions, setConditions] = useState(initial.rules?.conditions || []);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial.id;

  const addRule = () => setConditions([...conditions, { field: 'birthday_month', op: 'eq', value: '' }]);
  const updateRule = (i, patch) => {
    const arr = [...conditions];
    arr[i] = { ...arr[i], ...patch };
    setConditions(arr);
  };
  const removeRule = (i) => setConditions(conditions.filter((_, idx) => idx !== i));

  const rulesPayload = () => ({
    logic,
    conditions: conditions
      .filter(c => c.field && c.value !== '' && c.value !== null && c.value !== undefined)
      .map(c => ({ field: c.field, op: c.op || 'eq', value: c.value })),
  });

  const doPreview = async () => {
    try {
      const res = await axios.post(
        `${API}/salons/${salonId}/marketing/segments/preview`,
        { name: name || 'preview', description, rules: rulesPayload() },
        { headers: getAuthHeaders() }
      );
      setPreview(res.data);
    } catch (e) { toast.error('Preview failed'); }
  };

  const save = async () => {
    if (!name.trim()) return toast.error('Name is required');
    try {
      setSaving(true);
      const body = { name, description, rules: rulesPayload() };
      if (isEdit) {
        await axios.put(`${API}/salons/${salonId}/marketing/segments/${initial.id}`, body, { headers: getAuthHeaders() });
      } else {
        await axios.post(`${API}/salons/${salonId}/marketing/segments`, body, { headers: getAuthHeaders() });
      }
      toast.success(isEdit ? 'Segment updated' : 'Segment created');
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit segment' : 'New segment'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Birthday - July" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Label>Match</Label>
            <select value={logic} onChange={e => setLogic(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
              <option value="AND">ALL conditions (AND)</option>
              <option value="OR">ANY condition (OR)</option>
            </select>
          </div>

          <div className="space-y-2">
            {conditions.length === 0 && (
              <p className="text-xs text-muted-foreground">No rules yet — add one to filter customers.</p>
            )}
            {conditions.map((c, i) => {
              const meta = SEGMENT_FIELDS.find(f => f.value === c.field) || SEGMENT_FIELDS[0];
              return (
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <select
                    value={c.field}
                    onChange={e => updateRule(i, { field: e.target.value, value: '' })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {SEGMENT_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  {meta.operand === 'month' && (
                    <select
                      value={c.value}
                      onChange={e => updateRule(i, { value: Number(e.target.value) })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">— pick —</option>
                      {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, idx) => (
                        <option key={idx} value={idx + 1}>{m}</option>
                      ))}
                    </select>
                  )}
                  {meta.operand === 'gender' && (
                    <select
                      value={c.value}
                      onChange={e => updateRule(i, { value: e.target.value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">— pick —</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  )}
                  {meta.operand === 'number' && (
                    <Input
                      type="number"
                      className="h-9 w-32"
                      value={c.value}
                      onChange={e => updateRule(i, { value: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  )}
                  {meta.operand === 'bool' && (
                    <select
                      value={String(c.value)}
                      onChange={e => updateRule(i, { value: e.target.value === 'true' })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">— pick —</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => removeRule(i)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={addRule}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add rule
            </Button>
          </div>

          <div className="p-3 rounded-lg bg-background/50 border border-border">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Live count</p>
              <Button variant="outline" size="sm" onClick={doPreview}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Preview
              </Button>
            </div>
            {preview ? (
              <>
                <p className="text-2xl font-bold text-gold">{preview.count} customer(s)</p>
                {preview.sample?.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Sample: {preview.sample.slice(0, 5).map(s => s.name || s.phone).join(', ')}
                    {preview.sample.length > 5 ? '…' : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Click <i>Preview</i> to see how many customers match.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold text-black hover:bg-gold/90" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create segment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ============ Coupons ============

function CouponsPanel({ salonId, getAuthHeaders }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/salons/${salonId}/coupons`, { headers: getAuthHeaders() });
      setCoupons(res.data.coupons || []);
    } catch (e) { toast.error('Failed to load coupons'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [salonId]);

  const remove = async (c) => {
    if (!window.confirm(`Delete coupon ${c.code}?`)) return;
    try {
      await axios.delete(`${API}/salons/${salonId}/coupons/${c.id}`, { headers: getAuthHeaders() });
      toast.success('Coupon deleted');
      load();
    } catch (e) { toast.error('Delete failed'); }
  };

  const publish = async (c, visibility) => {
    try {
      const action = visibility === 'published' ? 'publish' : 'unpublish';
      await axios.post(`${API}/salons/${salonId}/coupons/${c.id}/${action}`, {}, { headers: getAuthHeaders() });
      toast.success(action === 'publish' ? 'Published to customer app' : 'Made private');
      load();
    } catch (e) { toast.error('Update failed'); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Ticket className="w-4 h-4 text-gold" /> Salon Coupons
        </CardTitle>
        <Button size="sm" className="bg-gold text-black hover:bg-gold/90" onClick={() => setEditing({})}>
          <Plus className="w-3.5 h-3.5 mr-1" /> New coupon
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : coupons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No coupons yet. Create a % or flat-off coupon and publish it so it shows up in the customer app,
            or keep it private and share it via campaign messages.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {coupons.map(c => (
              <div key={c.id} className="py-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono font-bold text-gold">{c.code}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${c.visibility === 'published' ? 'border-emerald-500/50 text-emerald-600' : 'border-amber-500/50 text-amber-600'}`}>
                      {c.visibility}
                    </span>
                    {!c.is_active && <span className="text-[10px] text-red-500">inactive</span>}
                  </div>
                  <p className="text-sm">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`}
                    {c.min_bill_amount ? ` · min ₹${c.min_bill_amount}` : ''}
                    {c.max_discount_amount ? ` · cap ₹${c.max_discount_amount}` : ''}
                    {c.per_customer_limit ? ` · per-customer ${c.per_customer_limit}` : ''}
                    {c.total_cap ? ` · total ${c.total_cap}` : ''}
                    {typeof c.uses_count === 'number' ? ` · used ${c.uses_count}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.visibility === 'published' ? (
                    <Button variant="outline" size="sm" onClick={() => publish(c, 'private')}>
                      <EyeOff className="w-3.5 h-3.5 mr-1" /> Unpublish
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => publish(c, 'published')}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> Publish
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setEditing(c)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(c)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {editing !== null && (
        <CouponEditorDialog
          salonId={salonId}
          getAuthHeaders={getAuthHeaders}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </Card>
  );
}

function CouponEditorDialog({ salonId, getAuthHeaders, initial, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    code: initial?.code || '',
    title: initial?.title || '',
    description: initial?.description || '',
    type: initial?.type || 'percent',
    value: initial?.value ?? 10,
    min_bill_amount: initial?.min_bill_amount ?? 0,
    max_discount_amount: initial?.max_discount_amount ?? '',
    per_customer_limit: initial?.per_customer_limit ?? 1,
    total_cap: initial?.total_cap ?? '',
    valid_from: (initial?.valid_from || '').slice(0, 10) || '',
    valid_to: (initial?.valid_to || '').slice(0, 10) || '',
    stackable: !!initial?.stackable,
    visibility: initial?.visibility || 'private',
    is_active: initial?.is_active !== false,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.code || !form.title) return toast.error('Code and title are required');
    if (!form.value || Number(form.value) <= 0) return toast.error('Value must be > 0');
    try {
      setSaving(true);
      const body = {
        ...form,
        code: (form.code || '').toString().trim().replace(/\s+/g, '').toUpperCase(),
        value: Number(form.value),
        min_bill_amount: Number(form.min_bill_amount || 0),
        max_discount_amount: form.max_discount_amount === '' ? null : Number(form.max_discount_amount),
        per_customer_limit: form.per_customer_limit === '' ? null : Number(form.per_customer_limit),
        total_cap: form.total_cap === '' ? null : Number(form.total_cap),
        valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : null,
        valid_to: form.valid_to ? new Date(form.valid_to + 'T23:59:59').toISOString() : null,
      };
      if (isEdit) {
        await axios.put(`${API}/salons/${salonId}/coupons/${initial.id}`, body, { headers: getAuthHeaders() });
      } else {
        await axios.post(`${API}/salons/${salonId}/coupons`, body, { headers: getAuthHeaders() });
      }
      toast.success(isEdit ? 'Coupon updated' : 'Coupon created');
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit coupon ${initial.code}` : 'New coupon'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Code *</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. WELCOME10" />
            </div>
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Welcome 10% off" />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Type *</Label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="percent">Percent (%)</option>
                <option value="flat">Flat (₹)</option>
              </select>
            </div>
            <div>
              <Label>Value *</Label>
              <Input type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
            </div>
            <div>
              <Label>Min bill amount (₹)</Label>
              <Input type="number" value={form.min_bill_amount} onChange={e => setForm({ ...form, min_bill_amount: e.target.value })} />
            </div>
            <div>
              <Label>Max discount cap (₹)</Label>
              <Input type="number" value={form.max_discount_amount} onChange={e => setForm({ ...form, max_discount_amount: e.target.value })} placeholder="No cap" />
            </div>
            <div>
              <Label>Per-customer limit</Label>
              <Input type="number" value={form.per_customer_limit} onChange={e => setForm({ ...form, per_customer_limit: e.target.value })} />
            </div>
            <div>
              <Label>Total uses cap</Label>
              <Input type="number" value={form.total_cap} onChange={e => setForm({ ...form, total_cap: e.target.value })} placeholder="Unlimited" />
            </div>
            <div>
              <Label>Valid from</Label>
              <Input type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} />
            </div>
            <div>
              <Label>Valid to</Label>
              <Input type="date" value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} />
            </div>
            <div>
              <Label>Visibility</Label>
              <select value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="private">Private (share via campaign)</option>
                <option value="published">Published (show in customer app)</option>
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select value={form.is_active ? 'active' : 'inactive'} onChange={e => setForm({ ...form, is_active: e.target.value === 'active' })} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold text-black hover:bg-gold/90" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create coupon')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ============ Offers & Perks (merged Coupons + Rewards + Loyalty + Memberships) ============

function OffersAndPerksPanel({ salonId, getAuthHeaders }) {
  const [inner, setInner] = useState('coupons');
  const [membershipView, setMembershipView] = useState('plans'); // plans | sold

  const renderInner = () => {
    if (inner === 'coupons') return <CouponsPanel salonId={salonId} getAuthHeaders={getAuthHeaders} />;
    if (inner === 'rewards') return <RewardsPanel salonId={salonId} getAuthHeaders={getAuthHeaders} />;
    if (inner === 'loyalty') return (
      <LoyaltyProgramSettings salonId={salonId} getAuthHeaders={getAuthHeaders} />
    );
    if (inner === 'memberships') return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 p-2 rounded-xl bg-background/60 border border-border">
          <button
            onClick={() => setMembershipView('plans')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              membershipView === 'plans' ? 'bg-gold text-black shadow-sm' : 'text-muted-foreground hover:bg-accent/40'
            }`}
          >
            <Package className="w-3 h-3 inline mr-1" /> Plans
          </button>
          <button
            onClick={() => setMembershipView('sold')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              membershipView === 'sold' ? 'bg-gold text-black shadow-sm' : 'text-muted-foreground hover:bg-accent/40'
            }`}
          >
            <UsersIcon className="w-3 h-3 inline mr-1" /> Sold Memberships
          </button>
        </div>
        {membershipView === 'plans'
          ? <MembershipManagement salonId={salonId} getAuthHeaders={getAuthHeaders} />
          : <SoldMembershipManagement salonId={salonId} getAuthHeaders={getAuthHeaders} />}
      </div>
    );
    return null;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="w-4 h-4 text-gold" /> Offers &amp; Perks
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            One home for everything customers can earn or redeem — coupon codes, scratch/spin rewards,
            loyalty points, and membership plans.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {OFFERS_TABS.map(t => {
              const Icon = t.icon;
              const active = inner === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setInner(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    active
                      ? 'bg-gold text-black border-gold shadow-sm'
                      : 'bg-background/70 text-foreground border-border hover:bg-accent/40'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {renderInner()}
    </div>
  );
}


// ============ Placeholders (kept for future use, referenced nowhere now) ============

function PlaceholderPanel({ title, note, icon: Icon }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {Icon ? <Icon className="w-4 h-4 text-gold" /> : null}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}


// ============ Settings ============

function MarketingSettingsPanel({ salonId, getAuthHeaders }) {
  const [channels, setChannels] = useState(null);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [ch, st] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/marketing/channels`, { headers: getAuthHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/settings`, { headers: getAuthHeaders() }),
      ]);
      setChannels(ch.data);
      setSettings(st.data);
    } catch (e) { toast.error('Failed to load settings'); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [salonId]);

  const save = async () => {
    try {
      setSaving(true);
      await axios.put(`${API}/salons/${salonId}/marketing/settings`, settings, { headers: getAuthHeaders() });
      toast.success('Settings saved');
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-gold" /> WhatsApp Channel
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!channels ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <>
              <p className="text-sm text-foreground">Active provider: <b className="text-gold">{channels.active_provider}</b></p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {(channels.channels || []).map((c, i) => (
                  <div key={i} className={`p-3 rounded-lg border ${c.status === 'connected' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-amber-500/50 bg-amber-500/5'}`}>
                    <p className="text-xs text-muted-foreground">{c.provider}</p>
                    <p className="text-sm font-semibold">
                      {c.status === 'connected' ? 'Connected' : c.status === 'action_needed' ? 'Action needed' : 'Not connected'}
                    </p>
                    {c.display_number && <p className="text-xs text-muted-foreground">Number: {c.display_number}</p>}
                    {c.phone_number_id && <p className="text-xs text-muted-foreground">Phone ID: {c.phone_number_id}</p>}
                    {c.note && <p className="text-[11px] text-amber-600 mt-1">{c.note}</p>}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                To switch providers, set <code>WHATSAPP_PROVIDER=meta</code> (or <code>twilio</code>) in the backend
                <code>.env</code> and restart. Meta requires <code>META_WA_PHONE_NUMBER_ID</code> and{' '}
                <code>META_WA_ACCESS_TOKEN</code>.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget & Guardrails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Monthly messaging cap (₹)</Label>
                <Input type="number" value={settings.monthly_cap_inr ?? 0} onChange={e => setSettings({ ...settings, monthly_cap_inr: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Max messages per customer / week</Label>
                <Input type="number" value={settings.freq_cap_per_customer_per_week ?? 3} onChange={e => setSettings({ ...settings, freq_cap_per_customer_per_week: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Quiet hours start</Label>
                <Input value={settings.quiet_hours_start ?? '22:00'} onChange={e => setSettings({ ...settings, quiet_hours_start: e.target.value })} />
              </div>
              <div>
                <Label>Quiet hours end</Label>
                <Input value={settings.quiet_hours_end ?? '09:00'} onChange={e => setSettings({ ...settings, quiet_hours_end: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input id="spend_brake" type="checkbox" checked={!!settings.spend_brake} onChange={e => setSettings({ ...settings, spend_brake: e.target.checked })} />
                <Label htmlFor="spend_brake">Spend brake (pause all sending)</Label>
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input id="consent_required" type="checkbox" checked={settings.consent_required !== false} onChange={e => setSettings({ ...settings, consent_required: e.target.checked })} />
                <Label htmlFor="consent_required">Require customer consent</Label>
              </div>
            </div>
            <Button className="bg-gold text-black hover:bg-gold/90" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


// ============ Automations (M6) ============

const AUTOMATION_META = {
  birthday: { label: 'Birthday', desc: "Sent on the customer's birthday.", icon: '🎂' },
  wedding_anniversary: { label: 'Wedding anniversary', desc: 'Sent on the customer\'s wedding anniversary.', icon: '💍' },
  spouse_birthday: { label: "Spouse's birthday", desc: "Sent on the spouse's birthday.", icon: '🎁' },
  win_back: { label: 'Win-back', desc: 'Sent to customers who have not visited for N days.', icon: '🔁' },
  reminder: { label: 'Booking reminder', desc: 'Sent for tomorrow\'s bookings (offset_days=1) or today (0).', icon: '⏰' },
};

function AutomationsPanel({ salonId, getAuthHeaders }) {
  const [automations, setAutomations] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const [a, c] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/marketing/automations`, { headers: getAuthHeaders() }),
        axios.get(`${API}/salons/${salonId}/coupons`, { headers: getAuthHeaders() }),
      ]);
      setAutomations(a.data.automations || []);
      setCoupons(c.data.coupons || []);
    } catch (e) { toast.error('Failed to load automations'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [salonId]);

  const toggle = async (a) => {
    try {
      await axios.put(`${API}/salons/${salonId}/marketing/automations/${a.id}`,
        { ...a, active: !a.active }, { headers: getAuthHeaders() });
      toast.success(a.active ? 'Automation paused' : 'Automation activated');
      load();
    } catch (e) { toast.error('Update failed'); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Delete this automation?`)) return;
    try {
      await axios.delete(`${API}/salons/${salonId}/marketing/automations/${a.id}`, { headers: getAuthHeaders() });
      toast.success('Deleted');
      load();
    } catch (e) { toast.error('Delete failed'); }
  };
  const runNow = async (a) => {
    try {
      const res = await axios.post(`${API}/salons/${salonId}/marketing/automations/${a.id}/run-now`, {}, { headers: getAuthHeaders() });
      toast.success(`Sent ${res.data.sent} message(s)`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Run failed'); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="w-4 h-4 text-gold" /> Always-on Automations
        </CardTitle>
        <Button size="sm" className="bg-gold text-black hover:bg-gold/90" onClick={() => setEditing({})}>
          <Plus className="w-3.5 h-3.5 mr-1" /> New automation
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Automations run daily at 09:00 UTC and can also be triggered manually. They de-duplicate per customer per 20 hours.
        </p>
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          automations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No automations yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {automations.map(a => {
                const meta = AUTOMATION_META[a.type] || { label: a.type, desc: '', icon: '⚡' };
                return (
                  <div key={a.id} className="py-3 flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{meta.icon}</span>
                        <p className="text-sm font-semibold">{meta.label}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${a.active ? 'border-emerald-500/50 text-emerald-600' : 'border-slate-500/50 text-slate-500'}`}>
                          {a.active ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{a.template_body}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Last run: {a.last_run_at ? new Date(a.last_run_at).toLocaleString() : '—'}
                        {typeof a.last_run_sent === 'number' ? ` · sent ${a.last_run_sent}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => runNow(a)}>Run now</Button>
                      <Button variant="outline" size="sm" onClick={() => toggle(a)}>
                        {a.active ? 'Pause' : 'Activate'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditing(a)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(a)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </CardContent>

      {editing !== null && (
        <AutomationEditorDialog
          salonId={salonId}
          getAuthHeaders={getAuthHeaders}
          coupons={coupons}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </Card>
  );
}

function AutomationEditorDialog({ salonId, getAuthHeaders, coupons, initial, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    type: initial?.type || 'birthday',
    active: initial?.active !== false,
    template_body: initial?.template_body || 'Happy {{automation_type}} {{name}}! Enjoy our special offer with code {{coupon_code}}.',
    coupon_id: initial?.coupon_id || '',
    threshold_days: initial?.threshold_days ?? 90,
    offset_days: initial?.offset_days ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.template_body?.trim()) return toast.error('Message body is required');
    try {
      setSaving(true);
      const body = { ...form, coupon_id: form.coupon_id || null };
      if (isEdit) {
        await axios.put(`${API}/salons/${salonId}/marketing/automations/${initial.id}`, body, { headers: getAuthHeaders() });
      } else {
        await axios.post(`${API}/salons/${salonId}/marketing/automations`, body, { headers: getAuthHeaders() });
      }
      toast.success(isEdit ? 'Automation updated' : 'Automation created');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit automation' : 'New automation'}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <Label>Type</Label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
              {Object.entries(AUTOMATION_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">{AUTOMATION_META[form.type]?.desc}</p>
          </div>
          <div>
            <Label>Message body</Label>
            <textarea value={form.template_body} onChange={e => setForm({ ...form, template_body: e.target.value })} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <p className="text-[10px] text-muted-foreground mt-1">Vars: {'{{name}}'} {'{{spouse_name}}'} {'{{coupon_code}}'} {'{{coupon_title}}'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Coupon (optional)</Label>
              <select value={form.coupon_id} onChange={e => setForm({ ...form, coupon_id: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">— none —</option>
                {coupons.map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </select>
            </div>
            {form.type === 'win_back' && (
              <div>
                <Label>Not visited in ≥ (days)</Label>
                <Input type="number" value={form.threshold_days} onChange={e => setForm({ ...form, threshold_days: Number(e.target.value) })} />
              </div>
            )}
            {form.type === 'reminder' && (
              <div>
                <Label>Offset days (0=today, 1=tomorrow)</Label>
                <Input type="number" value={form.offset_days} onChange={e => setForm({ ...form, offset_days: Number(e.target.value) })} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input id="active" type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold text-black hover:bg-gold/90" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create automation')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ============ Rewards (M7) ============

const PRIZE_TYPES = [
  { value: 'wallet_credit', label: 'Wallet credit (₹)' },
  { value: 'loyalty_points', label: 'Loyalty points' },
  { value: 'coupon', label: 'Coupon code' },
  { value: 'free_addon', label: 'Free add-on service' },
  { value: 'better_luck', label: 'Better luck next time' },
];

function RewardsPanel({ salonId, getAuthHeaders }) {
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [issueFor, setIssueFor] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/salons/${salonId}/marketing/rewards`, { headers: getAuthHeaders() });
      setRewards(res.data.rewards || []);
    } catch (e) { toast.error('Failed to load rewards'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [salonId]);

  const remove = async (r) => {
    if (!window.confirm(`Delete reward "${r.name}"?`)) return;
    try {
      await axios.delete(`${API}/salons/${salonId}/marketing/rewards/${r.id}`, { headers: getAuthHeaders() });
      toast.success('Deleted');
      load();
    } catch (e) { toast.error('Delete failed'); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="w-4 h-4 text-gold" /> Rewards — Scratch Card & Spin Wheel
        </CardTitle>
        <Button size="sm" className="bg-gold text-black hover:bg-gold/90" onClick={() => setEditing({})}>
          <Plus className="w-3.5 h-3.5 mr-1" /> New reward
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Configure a prize table with weighted probabilities. When a customer redeems an invoice,
          issue a one-time signed play link (attach it to the WhatsApp receipt). The customer plays
          on a public page; wins are applied instantly (wallet credit / loyalty points / coupon).
        </p>
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          rewards.length === 0 ? <p className="text-sm text-muted-foreground">No rewards yet.</p> :
          <div className="divide-y divide-border">
            {rewards.map(r => (
              <div key={r.id} className="py-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{r.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gold/50 text-gold">
                      {r.type === 'scratch' ? 'Scratch card' : 'Spin wheel'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${r.active ? 'border-emerald-500/50 text-emerald-600' : 'border-slate-500/50 text-slate-500'}`}>
                      {r.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {(r.prize_table || []).length} prize(s) · {r.max_plays_per_day_per_customer || 1} play/day/customer
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIssueFor(r)}>Issue play link</Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(r)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        }
      </CardContent>

      {editing !== null && (
        <RewardEditorDialog
          salonId={salonId}
          getAuthHeaders={getAuthHeaders}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {issueFor && (
        <IssueRewardDialog
          salonId={salonId}
          getAuthHeaders={getAuthHeaders}
          reward={issueFor}
          onClose={() => setIssueFor(null)}
        />
      )}
    </Card>
  );
}

function RewardEditorDialog({ salonId, getAuthHeaders, initial, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    type: initial?.type || 'scratch',
    name: initial?.name || '',
    active: initial?.active !== false,
    max_plays_per_day_per_customer: initial?.max_plays_per_day_per_customer ?? 1,
    valid_from: (initial?.valid_from || '').slice(0, 10) || '',
    valid_to: (initial?.valid_to || '').slice(0, 10) || '',
    prize_table: initial?.prize_table || [
      { label: '₹50 off', weight: 2, prize_type: 'wallet_credit', prize_value: 50 },
      { label: 'Better luck', weight: 8, prize_type: 'better_luck' },
    ],
  });
  const [saving, setSaving] = useState(false);
  const totalWeight = useMemo(() => form.prize_table.reduce((s, p) => s + (Number(p.weight) || 0), 0), [form.prize_table]);

  const updatePrize = (i, patch) => {
    const arr = [...form.prize_table];
    arr[i] = { ...arr[i], ...patch };
    setForm({ ...form, prize_table: arr });
  };
  const addPrize = () => setForm({ ...form, prize_table: [...form.prize_table, { label: '', weight: 1, prize_type: 'better_luck' }] });
  const removePrize = (i) => setForm({ ...form, prize_table: form.prize_table.filter((_, idx) => idx !== i) });

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (form.prize_table.length === 0) return toast.error('Add at least one prize');
    try {
      setSaving(true);
      const body = {
        ...form,
        valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : null,
        valid_to: form.valid_to ? new Date(form.valid_to + 'T23:59:59').toISOString() : null,
      };
      if (isEdit) {
        await axios.put(`${API}/salons/${salonId}/marketing/rewards/${initial.id}`, body, { headers: getAuthHeaders() });
      } else {
        await axios.post(`${API}/salons/${salonId}/marketing/rewards`, body, { headers: getAuthHeaders() });
      }
      toast.success(isEdit ? 'Reward updated' : 'Reward created');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit reward' : 'New reward'}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="scratch">Scratch card</option>
                <option value="spin">Spin wheel</option>
              </select>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Diwali Scratch" />
            </div>
            <div>
              <Label>Max plays / day / customer</Label>
              <Input type="number" value={form.max_plays_per_day_per_customer} onChange={e => setForm({ ...form, max_plays_per_day_per_customer: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input id="rw-active" type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
              <Label htmlFor="rw-active">Active</Label>
            </div>
            <div>
              <Label>Valid from</Label>
              <Input type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} />
            </div>
            <div>
              <Label>Valid to</Label>
              <Input type="date" value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Prize table (total weight {totalWeight})</Label>
              <Button variant="outline" size="sm" onClick={addPrize}><Plus className="w-3.5 h-3.5 mr-1" /> Add prize</Button>
            </div>
            {form.prize_table.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-center">
                <Input className="col-span-4" placeholder="Prize label" value={p.label} onChange={e => updatePrize(i, { label: e.target.value })} />
                <select className="col-span-3 h-10 rounded-md border border-input bg-background px-2 text-sm" value={p.prize_type} onChange={e => updatePrize(i, { prize_type: e.target.value })}>
                  {PRIZE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <Input className="col-span-2" type="number" placeholder="Value" value={p.prize_value ?? ''} onChange={e => updatePrize(i, { prize_value: e.target.value === '' ? null : Number(e.target.value) })} disabled={p.prize_type === 'better_luck'} />
                <Input className="col-span-2" type="number" placeholder="Weight" value={p.weight} onChange={e => updatePrize(i, { weight: Number(e.target.value) })} />
                <Button className="col-span-1" variant="ghost" size="sm" onClick={() => removePrize(i)}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>
                <p className="col-span-12 text-[10px] text-muted-foreground -mt-1 ml-1">
                  Odds: {totalWeight ? ((Number(p.weight) / totalWeight) * 100).toFixed(1) : 0}%
                </p>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-gold text-black hover:bg-gold/90" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create reward')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueRewardDialog({ salonId, getAuthHeaders, reward, onClose }) {
  const [phone, setPhone] = useState('');
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);

  const issue = async () => {
    if (!phone) return toast.error('Enter a customer phone');
    try {
      setBusy(true);
      const res = await axios.post(`${API}/salons/${salonId}/marketing/rewards/${reward.id}/issue`, { customer_phone: phone }, { headers: getAuthHeaders() });
      setUrl(res.data.play_url);
      toast.success('Play link issued');
    } catch (e) { toast.error(e.response?.data?.detail || 'Issue failed'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Issue play link — {reward.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Customer phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="10-digit or +91… phone" />
          </div>
          {url && (
            <div className="p-3 rounded-lg border border-emerald-500/50 bg-emerald-500/5">
              <p className="text-xs text-muted-foreground mb-1">One-time play link (share via WhatsApp):</p>
              <a href={url} target="_blank" rel="noreferrer" className="text-xs break-all text-emerald-600 underline">{url}</a>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button className="bg-gold text-black hover:bg-gold/90" onClick={issue} disabled={busy}>
            {busy ? 'Issuing…' : 'Issue play link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



// ============ WhatsApp Templates (approval sync + author + submit) ============

const STATUS_PILL = {
  approved: { color: 'border-emerald-500/50 text-emerald-600', Icon: CheckCircle2 },
  pending: { color: 'border-amber-500/50 text-amber-600', Icon: Clock },
  submitted: { color: 'border-amber-500/50 text-amber-600', Icon: Clock },
  paused: { color: 'border-amber-500/50 text-amber-600', Icon: Clock },
  rejected: { color: 'border-red-500/50 text-red-500', Icon: XCircle },
  failed: { color: 'border-red-500/50 text-red-500', Icon: XCircle },
  draft: { color: 'border-slate-500/50 text-slate-500', Icon: MessageSquare },
  unknown: { color: 'border-slate-500/50 text-slate-500', Icon: AlertCircle },
};

function TemplatesPanel({ salonId, getAuthHeaders }) {
  const [templates, setTemplates] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState('');
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      setLoading(true);
      const [t, p] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/marketing/templates/list`, { headers: getAuthHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/templates/providers`, { headers: getAuthHeaders() }),
      ]);
      setTemplates(t.data.templates || []);
      setProviders(p.data.providers || []);
    } catch (e) { toast.error('Failed to load templates'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [salonId]);

  const syncProvider = async (provider) => {
    try {
      setSyncing(provider);
      const res = await axios.post(`${API}/salons/${salonId}/marketing/templates/sync-${provider}`, {}, { headers: getAuthHeaders() });
      toast.success(`${provider}: synced ${res.data.synced} template(s)`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || `${provider} sync failed`); }
    finally { setSyncing(''); }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"? (Only removes it from this dashboard — provider copy remains)`)) return;
    try {
      await axios.delete(`${API}/salons/${salonId}/marketing/templates/v2/${t.id}`, { headers: getAuthHeaders() });
      toast.success('Removed from dashboard');
      load();
    } catch (e) { toast.error('Delete failed'); }
  };

  const refreshStatus = async (t) => {
    try {
      const res = await axios.get(`${API}/salons/${salonId}/marketing/templates/${t.id}/refresh-status`, { headers: getAuthHeaders() });
      toast.success(`Status: ${res.data.approval_status}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Refresh failed'); }
  };

  const submit = async (t, provider) => {
    try {
      const res = await axios.post(`${API}/salons/${salonId}/marketing/templates/${t.id}/submit`,
        { provider }, { headers: getAuthHeaders() });
      toast.success(`Submitted → ${res.data.approval_status}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Submit failed'); }
  };

  const filtered = templates.filter(t => {
    if (filter === 'all') return true;
    return (t.approval_status || 'unknown').toLowerCase() === filter;
  });

  const counts = templates.reduce((acc, t) => {
    const k = (t.approval_status || 'unknown').toLowerCase();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Provider strip */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gold" /> WhatsApp Templates
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Compose messages, submit for WhatsApp approval, and see live status. Twilio and Meta both supported.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {providers.map(p => (
              <div key={p.id} className={`p-3 rounded-lg border flex items-center justify-between ${p.connected ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-amber-500/50 bg-amber-500/5'}`}>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{p.id}</p>
                  <p className="text-sm font-semibold">
                    {p.connected ? 'Connected' : 'Not connected'}
                  </p>
                  {p.note && <p className="text-[11px] text-amber-600 mt-1">{p.note}</p>}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!p.connected || syncing === p.id}
                  onClick={() => syncProvider(p.id)}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncing === p.id ? 'animate-spin' : ''}`} />
                  {syncing === p.id ? 'Syncing…' : 'Sync now'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Header + filter */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">Templates ({templates.length})</CardTitle>
            <div className="flex gap-1 flex-wrap">
              {['all', 'approved', 'pending', 'rejected', 'draft'].map(k => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase border transition ${
                    filter === k
                      ? 'bg-gold text-black border-gold'
                      : 'bg-background/60 text-muted-foreground border-border hover:bg-accent/40'
                  }`}
                >
                  {k}{k !== 'all' && counts[k] ? ` · ${counts[k]}` : ''}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" className="bg-gold text-black hover:bg-gold/90" onClick={() => setEditing({})}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New template
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
            filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No templates {filter !== 'all' ? `with status "${filter}"` : ''}. Compose a new one, or click <b>Sync now</b> above to pull existing templates from your provider.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(t => {
                  const status = (t.approval_status || 'unknown').toLowerCase();
                  const meta = STATUS_PILL[status] || STATUS_PILL.unknown;
                  const StatusIcon = meta.Icon;
                  return (
                    <div key={t.id} className="py-3 flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-mono font-semibold">{t.name}</p>
                          {t.provider && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gold/50 text-gold uppercase">
                              {t.provider}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${meta.color} flex items-center gap-1`}>
                            <StatusIcon className="w-3 h-3" /> {status}
                          </span>
                          {t.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/60 border border-border text-muted-foreground uppercase">
                              {t.category}
                            </span>
                          )}
                          {t.lang_code && <span className="text-[10px] text-muted-foreground">{t.lang_code}</span>}
                        </div>
                        {t.body && (
                          <p className="text-[12px] text-muted-foreground line-clamp-2 mt-1 whitespace-pre-wrap">
                            {t.body}
                          </p>
                        )}
                        {t.rejection_reason && (
                          <p className="text-[11px] text-red-500 mt-1">Rejection: {t.rejection_reason}</p>
                        )}
                        {t.last_synced_at && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Last synced: {new Date(t.last_synced_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        {status === 'draft' && (
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => submit(t, 'twilio')} disabled={!providers.find(p => p.id === 'twilio')?.connected}>Submit → Twilio</Button>
                            <Button variant="outline" size="sm" onClick={() => submit(t, 'meta')} disabled={!providers.find(p => p.id === 'meta')?.connected}>Submit → Meta</Button>
                          </div>
                        )}
                        {['pending', 'submitted', 'paused'].includes(status) && (
                          <Button variant="outline" size="sm" onClick={() => refreshStatus(t)}>
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                          </Button>
                        )}
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => setEditing(t)}>View</Button>
                          <Button variant="ghost" size="sm" onClick={() => remove(t)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          }
        </CardContent>
      </Card>

      {editing !== null && (
        <TemplateEditorDialog
          salonId={salonId}
          getAuthHeaders={getAuthHeaders}
          initial={editing}
          providers={providers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function TemplateEditorDialog({ salonId, getAuthHeaders, initial, providers, onClose, onSaved }) {
  const isView = !!initial?.id;
  const [form, setForm] = useState({
    name: initial?.name || '',
    friendly_name: initial?.friendly_name || '',
    category: initial?.category || 'utility',
    lang_code: initial?.lang_code || 'en',
    body: initial?.body || '',
    header_text: initial?.header_text || '',
    footer_text: initial?.footer_text || '',
    example_values: initial?.example_values || {}, // { "1": "Riya", "2": "Style Studio" }
  });
  const [saving, setSaving] = useState(false);

  // Extract placeholders {{1}}, {{2}} … from body/header/footer whenever they change.
  const placeholders = React.useMemo(() => {
    const blob = `${form.body || ''} ${form.header_text || ''} ${form.footer_text || ''}`;
    const set = new Set();
    (blob.match(/\{\{\s*(\d+)\s*\}\}/g) || []).forEach((m) => {
      const n = m.replace(/[^0-9]/g, '');
      if (n) set.add(Number(n));
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [form.body, form.header_text, form.footer_text]);

  // Suggested example strings for common placeholder positions.
  const EXAMPLE_HINTS = {
    1: 'Riya Sharma',
    2: 'Style Studio Connaught Place',
    3: 'https://salonhub.in/book/8c1a4d',
    4: 'Sun, 12 Oct at 4:00 PM',
    5: 'WELCOME10',
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name required');
    if (!/^[a-z0-9_]+$/.test(form.name)) return toast.error('Name must be lowercase letters, digits, underscores');
    if (!form.body.trim()) return toast.error('Body required');
    // Enforce example values on the client before the round-trip.
    const missing = placeholders.filter((n) => !(form.example_values?.[String(n)] || '').trim());
    if (missing.length) {
      return toast.error(
        `Please add example value(s) for placeholder(s): ${missing.map((n) => `{{${n}}}`).join(', ')}. ` +
        `WhatsApp needs an example for each variable before it can approve the template.`,
      );
    }
    try {
      setSaving(true);
      await axios.post(`${API}/salons/${salonId}/marketing/templates/draft`, form, { headers: getAuthHeaders() });
      toast.success('Draft saved');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isView ? `Template: ${initial.name}` : 'New template'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          {isView ? (
            <>
              <div className="p-3 rounded-lg bg-background/50 border border-border whitespace-pre-wrap text-sm">
                {initial.body || <span className="text-muted-foreground">(no body)</span>}
              </div>
              {initial.example_values && Object.keys(initial.example_values).length > 0 && (
                <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/5">
                  <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 mb-1.5">Example values (sent to WhatsApp reviewer)</p>
                  <div className="space-y-1">
                    {Object.entries(initial.example_values).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-xs">
                        <span className="font-mono w-14 shrink-0 text-amber-700 dark:text-amber-400">{`{{${k}}}`}</span>
                        <span className="text-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <p><span className="text-muted-foreground">Provider:</span> {initial.provider || '—'}</p>
                <p><span className="text-muted-foreground">Status:</span> {initial.approval_status || '—'}</p>
                <p><span className="text-muted-foreground">Category:</span> {initial.category || '—'}</p>
                <p><span className="text-muted-foreground">Language:</span> {initial.lang_code || '—'}</p>
                {initial.provider_sid && <p className="col-span-2 break-all"><span className="text-muted-foreground">Provider SID:</span> {initial.provider_sid}</p>}
                {initial.rejection_reason && <p className="col-span-2 text-red-500"><span className="text-muted-foreground">Rejection:</span> {initial.rejection_reason}</p>}
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Name * (lowercase, digits, underscores)</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value.toLowerCase() })} placeholder="e.g. booking_reminder_v2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Friendly name</Label>
                  <Input value={form.friendly_name} onChange={e => setForm({ ...form, friendly_name: e.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <Label>Category *</Label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                    <option value="utility">Utility</option>
                    <option value="marketing">Marketing</option>
                    <option value="authentication">Authentication</option>
                  </select>
                </div>
                <div>
                  <Label>Language code *</Label>
                  <Input value={form.lang_code} onChange={e => setForm({ ...form, lang_code: e.target.value })} placeholder="en, en_US, hi, etc." />
                </div>
              </div>
              <div>
                <Label>Message body *</Label>
                <textarea
                  value={form.body}
                  onChange={e => setForm({ ...form, body: e.target.value })}
                  rows={6}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Hi {{1}}, your appointment at {{2}} on {{3}} is confirmed."
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Use <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>, … for positional parameters (Twilio/Meta convention).
                </p>
              </div>

              {/* Example values (Twilio + Meta requirement) — visible ONLY when
                  the body has placeholders. WhatsApp reviewers use these to
                  render a preview; templates without examples are rejected. */}
              {placeholders.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 shrink-0 rounded-md bg-amber-500 text-white flex items-center justify-center text-xs font-bold">!</div>
                    <div className="text-xs">
                      <p className="font-bold text-foreground">Example values (required for WhatsApp approval)</p>
                      <p className="text-muted-foreground">
                        WhatsApp reviewers see a preview built from these examples. If you leave any blank, Twilio/Meta will
                        auto-reject the template. Use realistic sample values (a real name, salon, URL).
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5" data-testid="template-example-values">
                    {placeholders.map((n) => (
                      <div key={n} className="flex items-center gap-2">
                        <span className="text-xs font-mono w-14 shrink-0 text-amber-700 dark:text-amber-400">{`{{${n}}}`}</span>
                        <Input
                          value={form.example_values?.[String(n)] || ''}
                          onChange={(e) => setForm({
                            ...form,
                            example_values: { ...(form.example_values || {}), [String(n)]: e.target.value },
                          })}
                          placeholder={EXAMPLE_HINTS[n] || `example for {{${n}}}`}
                          data-testid={`template-example-${n}`}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[10px] text-muted-foreground">
                      Preview: <span className="italic">
                        {(() => {
                          let preview = form.body || '';
                          placeholders.forEach((n) => {
                            const v = (form.example_values?.[String(n)] || '').trim() || `{{${n}}}`;
                            preview = preview.replace(new RegExp(`\\{\\{\\s*${n}\\s*\\}\\}`, 'g'), v);
                          });
                          return preview.length > 120 ? preview.slice(0, 120) + '…' : preview;
                        })()}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const filled = { ...(form.example_values || {}) };
                        placeholders.forEach((n) => {
                          if (!(filled[String(n)] || '').trim()) filled[String(n)] = EXAMPLE_HINTS[n] || `Sample ${n}`;
                        });
                        setForm({ ...form, example_values: filled });
                      }}
                      className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold hover:underline"
                    >
                      Fill sensible defaults
                    </button>
                  </div>
                </div>
              )}
              <div className="p-3 rounded-lg border border-border bg-background/50">
                <p className="text-[11px] text-muted-foreground">
                  {placeholders.length > 0 ? (
                    <>Fill in an example value for every placeholder above (Twilio &amp; Meta reject templates without them).
                     After saving as draft, use <b>Submit → Twilio</b> or <b>Submit → Meta</b> in the list to send it for WhatsApp approval.</>
                  ) : (
                    <>After saving as draft, use <b>Submit → Twilio</b> or <b>Submit → Meta</b> in the list to send it for WhatsApp approval.</>
                  )}
                  {providers?.find(p => p.id === 'meta')?.connected === false && ' (Meta is not connected yet — only Twilio will be available.)'}
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isView ? 'Close' : 'Cancel'}</Button>
          {!isView && (
            <Button className="bg-gold text-black hover:bg-gold/90" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save as draft'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

