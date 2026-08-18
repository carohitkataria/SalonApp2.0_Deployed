/**
 * CustomersV2.js — Guests page redesign.
 *
 * Fixes:
 *   • Right drawer no longer sits UNDER the ribbon — GuestProfileDrawer is
 *     rendered via React portal so it escapes any parent stacking context.
 *   • "Add guest" from the table header now opens the shared CustomerDrawer
 *     (same form as the ribbon's + Add Guest, per user request).
 *   • Import CSV + Download template buttons added next to Export.
 *   • Auto-refresh preserved but no longer causes page jumps: authHeaders is
 *     ref-based so parent re-renders don't recreate `fetchAll`; background
 *     refreshes never toggle the loading spinner (which was resetting the
 *     scroll / table layout every few seconds).
 */
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { V2_PAGES_CSS } from './styles_v2';
import CustomerDrawer from '../home_v2/CustomerDrawer';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const Ico = {
  users:() => <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  userAdd:() => <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  plus: () => <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  search:() => <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  close:() => <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  check:() => <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  chev: () => <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>,
  cal:  () => <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  wallet:()=> <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  wa:   () => <svg viewBox="0 0 24 24" style={{fill:'currentColor', stroke:'none'}}><path d="M12 2a10 10 0 0 0-8.7 15L2 22l5.2-1.3A10 10 0 1 0 12 2z"/></svg>,
  chat: () => <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  send: () => <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  down: () => <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  up:   () => <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  file: () => <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  star: () => <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  time: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  trend:() => <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  rupee:() => <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  save: () => <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>,
  edit: () => <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
};

const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

// Feb 2026 — Same invoice URL that Queue → GST invoice uses, and the same
// link the customer receives on WhatsApp: `${API}/invoices/{invoice_id}/view`.
// Older visits stored a pre-signed `invoice_pdf_url`; we fall back to that when
// the token predates the invoice-id era.
const gstInvoiceLink = (b) => {
  const invoiceId = b?.invoice_id || b?.invoice?.id;
  if (invoiceId) {
    return (
      <a href={`${API}/invoices/${invoiceId}/view`} target="_blank" rel="noopener noreferrer"
         data-testid={`guest-gst-invoice-${invoiceId}`}>GST invoice</a>
    );
  }
  if (b?.invoice_pdf_url) {
    return <a href={b.invoice_pdf_url} target="_blank" rel="noopener noreferrer">GST invoice</a>;
  }
  return <a onClick={() => toast.info('Invoice not generated yet — mark the token as completed first.')}>GST invoice</a>;
};
const AV_COLORS = ['#6C4FE0','#12A594','#3E93E8','#E8952B','#E45C86','#2FA96A'];
const avColorFor = (name) => AV_COLORS[(String(name || '?').charCodeAt(0) || 0) % AV_COLORS.length];
const initials = (first, last) => `${(first || '?').charAt(0)}${(last || '').charAt(0) || ''}`.toUpperCase();
const splitName = (full) => {
  const parts = String(full || '').trim().split(/\s+/);
  return [parts[0] || 'Guest', parts.slice(1).join(' ') || ''];
};

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

// ============================================================
export default function CustomersV2({ salonId, getAuthHeaders, salon }) {
  useV2Styles();

  // ---- Stable auth reference (fixes auto-refresh page jumps) --------
  const authRef = useRef(getAuthHeaders);
  useEffect(() => { authRef.current = getAuthHeaders; }, [getAuthHeaders]);
  const authHeaders = useCallback(() => {
    try { return (authRef.current && authRef.current()) || {}; } catch { return {}; }
  }, []);

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const importInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  // Tag editor (pencil on the Tags column)
  const [tagEdit, setTagEdit] = useState(null); // customer object being edited
  const [tagDraft, setTagDraft] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [savingTags, setSavingTags] = useState(false);

  const openTagEditor = useCallback((c) => {
    setTagEdit(c);
    setTagDraft(Array.isArray(c.custom_tags) ? [...c.custom_tags] : []);
    setTagInput('');
  }, []);

  const addDraftTag = useCallback((raw) => {
    const s = String(raw || '').trim().slice(0, 24);
    if (!s) return;
    const reserved = ['vip', 'new', 'lapsed', 'mem', 'member', 'reg', 'regular'];
    setTagDraft((prev) => {
      if (reserved.includes(s.toLowerCase())) { toast.info('That is an automatic tag.'); return prev; }
      if (prev.some((t) => t.toLowerCase() === s.toLowerCase())) return prev;
      if (prev.length >= 12) { toast.info('Up to 12 tags.'); return prev; }
      return [...prev, s];
    });
    setTagInput('');
  }, []);

  const saveCustomTags = useCallback(async () => {
    if (!tagEdit) return;
    setSavingTags(true);
    try {
      await axios.put(
        `${API}/salons/${salonId}/customers/${encodeURIComponent(tagEdit.phone)}/tags`,
        { custom_tags: tagDraft },
        { headers: authHeaders() }
      );
      setCustomers((prev) => prev.map((c) => c.phone === tagEdit.phone ? { ...c, custom_tags: tagDraft } : c));
      toast.success('Tags updated');
      setTagEdit(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update tags');
    } finally { setSavingTags(false); }
  }, [tagEdit, tagDraft, salonId, authHeaders]);

  // Silent refetch — no `setLoading(true)` so table doesn't jump.
  const fetchAll = useCallback(async (opts = { silent: false }) => {
    if (!salonId) return;
    if (!opts.silent) setLoading(true);
    try {
      const res = await axios.get(`${API}/salons/${salonId}/customers`, { headers: authHeaders() });
      setCustomers(res.data?.customers || []);
    } catch (e) {
      if (!opts.silent) toast.error(e.response?.data?.detail || 'Failed to load guests');
    } finally { if (!opts.silent) setLoading(false); }
  }, [salonId, authHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 45s in the background (silent), only when tab visible.
  useEffect(() => {
    if (!salonId) return undefined;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchAll({ silent: true });
    };
    const id = setInterval(tick, 45000);
    return () => clearInterval(id);
  }, [salonId, fetchAll]);

  // Enrich customers with computed segments
  const enriched = useMemo(() => {
    const now = Date.now();
    return (customers || []).map((c) => {
      const [first, last] = splitName(c.name);
      const lastVisit = c.last_visit ? new Date(c.last_visit) : null;
      const days = lastVisit ? Math.floor((now - lastVisit.getTime()) / (1000 * 60 * 60 * 24)) : null;
      const visitCount = c.visit_count || 0;
      const totalSpend = c.total_spend || 0;
      const walletBalance = Number(c.wallet_balance || 0);
      const hasMembership = !!(c.membership_name);
      const isNew = visitCount < 2; // "New" auto-drops after the 2nd visit
      const isLapsed = days !== null && days >= 60;
      const isVip = totalSpend >= 5000 || visitCount >= 20;
      const isBdayThisMonth = (() => {
        const d = c.date_of_birth;
        if (!d) return false;
        const dd = new Date(d);
        if (isNaN(dd.getTime())) return false;
        return dd.getMonth() === new Date().getMonth();
      })();
      const tags = [];
      if (isVip) tags.push('vip');
      if (isNew) tags.push('new');
      if (isLapsed) tags.push('lapsed');
      if (hasMembership) tags.push('mem');
      if (!isVip && !isNew && !isLapsed && visitCount >= 3) tags.push('reg');
      const customTags = Array.isArray(c.custom_tags) ? c.custom_tags : [];
      return { ...c, _first: first, _last: last, _days: days, _tags: tags, _customTags: customTags, _isBdayThisMonth: isBdayThisMonth, _totalSpend: totalSpend, _walletBalance: walletBalance, _visitCount: visitCount };
    });
  }, [customers]);

  const kpis = useMemo(() => {
    const total = enriched.length;
    let newThis = 0, active90 = 0, lapsed60 = 0, withMem = 0, sumSpend = 0, spendCount = 0;
    const thisMonth = new Date().getMonth();
    enriched.forEach((c) => {
      if (c.last_visit) {
        const d = new Date(c.last_visit);
        if (d.getMonth() === thisMonth && c._visitCount <= 2) newThis++;
        if (c._days !== null && c._days <= 90) active90++;
        if (c._days !== null && c._days >= 60) lapsed60++;
      }
      if (c.membership_name) withMem++;
      if (c._totalSpend > 0) { sumSpend += c._totalSpend; spendCount++; }
    });
    return {
      total,
      newThis,
      active90,
      lapsed60,
      avgSpend: spendCount ? Math.round(sumSpend / spendCount) : 0,
      withMem,
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    let list = enriched;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(c => `${c._first} ${c._last} ${c.phone || ''}`.toLowerCase().includes(q));
    if (filter === 'vip') list = list.filter(c => c._tags.includes('vip'));
    if (filter === 'new') list = list.filter(c => c._tags.includes('new'));
    if (filter === 'lapsed') list = list.filter(c => c._tags.includes('lapsed'));
    if (filter === 'mem') list = list.filter(c => c._tags.includes('mem'));
    if (filter === 'bday') list = list.filter(c => c._isBdayThisMonth);
    return list;
  }, [enriched, search, filter]);

  const exportCSV = () => {
    const rows = [['Name','Mobile No.','Gender','Date of Birth','Tags','Last visit','Visits','Total spend','Wallet']];
    filtered.forEach(c => {
      rows.push([
        `${c._first} ${c._last}`.trim(),
        c.phone || '',
        c.gender || '',
        c.date_of_birth || c.dob || '',
        c._tags.join('|'),
        c.last_visit ? new Date(c.last_visit).toLocaleDateString('en-IN') : '',
        c._visitCount,
        c._totalSpend,
        c._walletBalance,
      ]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'guests.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported CSV');
  };

  const downloadTemplate = async () => {
    try {
      const res = await axios.get(`${API}/salons/${salonId}/customers/csv-template`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'guests_template.csv'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch (e) {
      toast.error('Failed to download template');
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset input so same file can be re-selected
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await axios.post(
        `${API}/salons/${salonId}/customers/bulk-upload`,
        form,
        { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } }
      );
      const d = res.data || {};
      toast.success(`Imported ${d.inserted || 0} guests · ${d.skipped_duplicate || 0} duplicates · ${d.skipped_invalid || 0} invalid`);
      fetchAll({ silent: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally { setImporting(false); }
  };

  const selected = useMemo(
    () => enriched.find(c => c.phone === selectedPhone) || null,
    [enriched, selectedPhone]
  );

  return (
    <div>
      {/* HEADER (title hidden globally; controls moved into the toolbar) */}
      <div className="phead">
        <div>
          <h2><span className="hic"><Ico.users /></span>Guests</h2>
          <p>{filtered.length} guest{filtered.length !== 1 ? 's' : ''} shown · India-first CRM with WhatsApp, UPI wallet &amp; GST invoices</p>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="kstrip">
        <KpiTile chip="primary" icon={<Ico.users />} val={kpis.total.toLocaleString('en-IN')} label="Total guests" />
        <KpiTile chip="green" icon={<Ico.userAdd />} val={kpis.newThis.toLocaleString('en-IN')} label="New this month" />
        <KpiTile chip="sky" icon={<Ico.trend />} val={kpis.active90.toLocaleString('en-IN')} label="Active · 90d" />
        <KpiTile chip="rose" icon={<Ico.time />} val={kpis.lapsed60.toLocaleString('en-IN')} label="Lapsed · 60d+" />
        <KpiTile chip="amber" icon={<Ico.rupee />} val={rupee(kpis.avgSpend)} label="Avg spend" />
        <KpiTile chip="violet" icon={<Ico.star />} val={kpis.withMem.toLocaleString('en-IN')} label="With membership" />
      </div>

      {/* TOOLBAR */}
      <div className="toolbar cust-toolbar">
        <div className="filter cust-filter-scroll">
          {[
            {k:'all', label:'All', c: kpis.total},
            {k:'vip', label:'VIP', c: enriched.filter(x => x._tags.includes('vip')).length},
            {k:'new', label:'New', c: enriched.filter(x => x._tags.includes('new')).length},
            {k:'lapsed', label:'Lapsed', c: enriched.filter(x => x._tags.includes('lapsed')).length},
            {k:'mem', label:'Members', c: enriched.filter(x => x._tags.includes('mem')).length},
            {k:'bday', label:'Birthday', c: enriched.filter(x => x._isBdayThisMonth).length},
          ].map(f => (
            <button key={f.k} className={`fchip ${filter === f.k ? 'on' : ''}`} onClick={() => setFilter(f.k)}>
              {f.label} <b>{f.c}</b>
            </button>
          ))}
        </div>
        <div className="v2-searchbox cust-search">
          <Ico.search />
          <input placeholder="Search name or mobile…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-primary btn-icononly" onClick={() => setAddOpen(true)} title="Add guest" aria-label="Add guest" data-testid="cust-add-guest"><Ico.plus /></button>
        <button className="btn-ghost btn-icononly" onClick={exportCSV} title="Export CSV" aria-label="Export CSV" data-testid="cust-export"><Ico.down /></button>
        <button
          className="btn-ghost btn-icononly"
          onClick={() => importInputRef.current?.click()}
          disabled={importing}
          title={importing ? 'Importing…' : 'Import guests from CSV / Excel'}
          aria-label="Import guests"
          data-testid="cust-import"
        >
          <Ico.up />
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={handleImportFile}
          style={{display:'none'}}
        />
      </div>

      {/* TABLE */}
      <div className="tbl-card">
        <table className="v2-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Mobile</th>
              <th>Tags</th>
              <th className="hide">Last visit</th>
              <th className="hide">Visits</th>
              <th>Total spend</th>
              <th className="hide">Wallet</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{padding:40, textAlign:'center', color:'var(--muted)'}}>Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} style={{padding:40, textAlign:'center', color:'var(--muted)'}}>No guests match.</td></tr>}
            {filtered.map(c => (
              <tr key={c.phone || c.id} className="grow" onClick={() => setSelectedPhone(c.phone)}>
                <td>
                  <div className="gname">
                    <div
                      className="g-av"
                      style={c.photo_url
                        ? { backgroundImage:`url(${c.photo_url})` }
                        : { background: avColorFor(c._first) }}
                    >
                      {!c.photo_url && initials(c._first, c._last)}
                    </div>
                    {c._first} {c._last}
                  </div>
                </td>
                <td>{c.phone || <span style={{color:'var(--muted-2)'}}>—</span>}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="g-tags">
                    {c._tags.length === 0 && c._customTags.length === 0 && <span style={{color:'var(--muted-2)', fontSize:11}}>—</span>}
                    {c._tags.map(t => (
                      <span key={t} className={`pill ${t}`}>
                        {t === 'vip' ? 'VIP' : t === 'reg' ? 'Regular' : t === 'lapsed' ? 'Lapsed' : t === 'mem' ? 'Member' : 'New'}
                      </span>
                    ))}
                    {c._customTags.map(t => (
                      <span key={`ct-${t}`} className="pill custom">{t}</span>
                    ))}
                    <button
                      className="tag-edit-btn"
                      title="Edit tags"
                      aria-label="Edit tags"
                      data-testid={`cust-edit-tags-${c.phone || c.id}`}
                      onClick={() => openTagEditor(c)}
                    >
                      <Ico.edit />
                    </button>
                  </div>
                </td>
                <td className="hide">{c.last_visit ? new Date(c.last_visit).toLocaleDateString('en-IN', {day:'numeric', month:'short'}) : <span style={{color:'var(--muted-2)'}}>—</span>}</td>
                <td className="hide">{c._visitCount || 0}</td>
                <td><span className="spend">{rupee(c._totalSpend)}</span></td>
                <td className="hide">{c._walletBalance > 0 ? rupee(c._walletBalance) : <span style={{color:'var(--muted-2)'}}>—</span>}</td>
                <td style={{textAlign:'right'}}>
                  <span style={{color:'var(--muted-2)'}}><Ico.chev /></span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* GUEST PROFILE DRAWER (portal so it stacks above the ribbon) */}
      <GuestProfileDrawer
        guest={selected}
        salonId={salonId}
        authHeaders={authHeaders}
        onClose={() => setSelectedPhone(null)}
        onChanged={() => fetchAll({ silent: true })}
      />

      {/* ADD GUEST — shared CustomerDrawer (same form as ribbon → Add Guest) */}
      <CustomerDrawer
        open={addOpen}
        salonId={salonId}
        getAuthHeaders={authHeaders}
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); fetchAll({ silent: true }); toast.success('Guest saved'); }}
        source="owner"
      />

      {/* TAG EDITOR */}
      {tagEdit && (
        <div className="tagmodal-ov" onClick={() => setTagEdit(null)} data-testid="cust-tag-modal">
          <div className="tagmodal" onClick={(e) => e.stopPropagation()}>
            <div className="tagmodal-h">
              <div>
                <div className="tm-title">Edit tags</div>
                <div className="tm-sub">{tagEdit._first} {tagEdit._last} · {tagEdit.phone}</div>
              </div>
              <button className="tag-edit-btn" onClick={() => setTagEdit(null)} aria-label="Close"><Ico.close /></button>
            </div>

            <div className="tm-sec">Automatic tags</div>
            <div className="g-tags" style={{marginBottom:4}}>
              {tagEdit._tags.length === 0 && <span style={{color:'var(--muted-2)', fontSize:11}}>None yet</span>}
              {tagEdit._tags.map(t => (
                <span key={t} className={`pill ${t}`}>
                  {t === 'vip' ? 'VIP' : t === 'reg' ? 'Regular' : t === 'lapsed' ? 'Lapsed' : t === 'mem' ? 'Member' : 'New'}
                </span>
              ))}
            </div>
            <div className="tm-hint">Auto-managed from visits & spend. &ldquo;New&rdquo; clears automatically after the 2nd visit.</div>

            <div className="tm-sec">Custom tags</div>
            <div className="g-tags" style={{marginBottom:8}}>
              {tagDraft.length === 0 && <span style={{color:'var(--muted-2)', fontSize:11}}>No custom tags — add one below.</span>}
              {tagDraft.map(t => (
                <span key={t} className="pill custom removable">
                  {t}
                  <button className="pill-x" onClick={() => setTagDraft(prev => prev.filter(x => x !== t))} aria-label={`Remove ${t}`}>×</button>
                </span>
              ))}
            </div>
            <div className="tm-addrow">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraftTag(tagInput); } }}
                placeholder="Type a tag and press Enter…"
                maxLength={24}
                data-testid="cust-tag-input"
              />
              <button className="btn-ghost" onClick={() => addDraftTag(tagInput)}>Add</button>
            </div>
            <div className="tm-quick">
              {['Regular', 'Walk-in', 'Referral', 'Complaint', 'Loyal', 'Student'].filter(q => !tagDraft.some(t => t.toLowerCase() === q.toLowerCase())).map(q => (
                <button key={q} className="tm-quickchip" onClick={() => addDraftTag(q)}>+ {q}</button>
              ))}
            </div>

            <div className="tagmodal-f">
              <button className="btn-ghost" onClick={() => setTagEdit(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveCustomTags} disabled={savingTags} data-testid="cust-tag-save">
                {savingTags ? 'Saving…' : 'Save tags'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiTile({ chip, icon, val, label }) {
  const map = {
    primary:{ bg:'var(--primary-050)', fg:'var(--primary)' },
    wa:    { bg:'var(--wa-bg)', fg:'var(--wa)' },
    green: { bg:'var(--green-bg)', fg:'var(--green)' },
    sky:   { bg:'var(--sky-bg)', fg:'var(--sky)' },
    amber: { bg:'var(--amber-bg)', fg:'var(--amber)' },
    violet:{ bg:'var(--violet-bg)', fg:'var(--violet)' },
    rose:  { bg:'var(--rose-bg)', fg:'var(--rose)' },
  };
  const s = map[chip] || map.primary;
  return (
    <div className="kc">
      <div className="chip" style={{background:s.bg, color:s.fg}}>{icon}</div>
      <b>{val}</b>
      <span>{label}</span>
    </div>
  );
}

// -------------------- Guest profile drawer (React portal) --------------------
function GuestProfileDrawer({ guest, salonId, authHeaders, onClose, onChanged }) {
  const [tab, setTab] = useState('overview');
  const [bookings, setBookings] = useState([]);
  const [membership, setMembership] = useState(null);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!guest) return;
    setTab('overview');
    setNotes(guest.notes || '');
    (async () => {
      try {
        const r1 = await axios.get(`${API}/salons/${salonId}/customers/${encodeURIComponent(guest.phone)}/bookings`, { headers: authHeaders() });
        setBookings(r1.data?.bookings || r1.data || []);
      } catch { setBookings([]); }
      try {
        const r2 = await axios.get(`${API}/salons/${salonId}/customers/${encodeURIComponent(guest.phone)}/membership`, { headers: authHeaders() });
        setMembership(r2.data || null);
      } catch { setMembership(null); }
    })();
  }, [guest, salonId, authHeaders]);

  const drawerContent = !guest ? (
    <>
      <div className="shv2-overlay" onClick={onClose} style={{ zIndex: 9060 }} />
      <aside className="shv2-drawer v2-narrow" style={{ zIndex: 9070 }} />
    </>
  ) : renderProfile();

  function renderProfile() {
    const totalSpend = guest._totalSpend || 0;
    const wallet = guest._walletBalance || 0;
    const visitCount = guest._visitCount || 0;
    const points = Math.floor(totalSpend / 100);

    const saveNotes = async () => {
      setSavingNotes(true);
      try {
        await axios.put(`${API}/salons/${salonId}/customers/${encodeURIComponent(guest.phone)}`, { notes }, { headers: authHeaders() });
        toast.success('Note saved');
        onChanged?.();
      } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
      finally { setSavingNotes(false); }
    };

    const bookingDisplay = (b) => {
      const date = b.date || b.appointment_date || b.created_at;
      let dd = '?';
      let mm = '';
      try {
        const d = new Date(date);
        dd = String(d.getDate()).padStart(2, '0');
        mm = d.toLocaleDateString('en-IN', { month: 'short' });
      } catch (_) { /* invalid date */ }
      const services = (b.services || b.service_names || []).map(s => typeof s === 'string' ? s : (s?.name || s?.service_name)).filter(Boolean).join(', ') || b.service_name || 'Service';
      const barber = b.barber_name || b.staff_name || 'Staff';
      const method = (b.payment_method || b.pay_method || '').toString() || 'paid';
      const amount = b.total_amount || b.amount || b.bill_amount || 0;
      return { dd, mm, services, barber, method, amount };
    };

    return (
      <>
        <div className="shv2-overlay open gp-ovl" onClick={onClose} style={{ zIndex: 9060, right: 58 }} />
        <aside className="shv2-drawer v2-narrow gp-drawer open" style={{width:'min(680px,96vw)', right: 58, zIndex: 9070}}>
          <div className="gp-head">
            <button className="gp-close" onClick={onClose}><Ico.close /></button>
            <div className="gp-top">
              <div className="g-av"
                style={guest.photo_url ? { backgroundImage:`url(${guest.photo_url})` } : { background: avColorFor(guest._first) }}
              >
                {!guest.photo_url && initials(guest._first, guest._last)}
              </div>
              <div>
                <h3>{guest._first} {guest._last}</h3>
                <div className="sub">
                  {guest.phone}
                  {guest._tags.map(t => (
                    <span key={t} className={`pill ${t}`}>
                      {t === 'vip' ? 'VIP' : t === 'reg' ? 'Regular' : t === 'lapsed' ? 'Lapsed' : t === 'mem' ? 'Member' : 'New'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="gp-actions">
              <button className="btn-wa" onClick={() => {
                const num = String(guest.phone || '').replace(/[^0-9]/g,'');
                if (num) window.open(`https://wa.me/${num}`, '_blank');
              }}><Ico.wa /> WhatsApp</button>
              <button className="btn-ghost" data-testid="guest-book-btn" onClick={() => {
                const g = {
                  id: guest.id,
                  name: `${guest._first || ''} ${guest._last || ''}`.trim() || guest.name,
                  phone: guest.phone,
                  gender: guest.gender,
                };
                window.dispatchEvent(new CustomEvent('salon:open-new-appointment', { detail: { guest: g } }));
                onClose?.();
              }}><Ico.cal /> Book</button>
              <button className="btn-ghost" onClick={() => toast.info('Wallet top-up via UPI — coming soon')}><Ico.wallet /> Wallet</button>
            </div>
            <div className="gp-stats">
              <div className="gp-stat"><b>{visitCount}</b><span>Visits</span></div>
              <div className="gp-stat"><b>{rupee(totalSpend)}</b><span>Total spend</span></div>
              <div className="gp-stat"><b>{rupee(wallet)}</b><span>Wallet</span></div>
              <div className="gp-stat"><b>{points}</b><span>Points</span></div>
            </div>
          </div>

          <div className="gp-tabs">
            {[
              {k:'overview', label:'Overview'},
              {k:'visits', label:'Visits & invoices'},
              {k:'comms', label:'Messages'},
              {k:'notes', label:'Notes'},
            ].map(t => (
              <button key={t.k} className={`gp-tab ${tab === t.k ? 'on' : ''}`} onClick={() => setTab(t.k)}>{t.label}</button>
            ))}
          </div>

          <div className="gp-body">
            {tab === 'overview' && (
              <div>
                <div className="row-line"><span className="k">Mobile</span><span className="v">{guest.phone || '—'}</span></div>
                <div className="row-line"><span className="k">Email</span><span className="v">{guest.email || '—'}</span></div>
                <div className="row-line"><span className="k">Gender</span><span className="v">{guest.gender || '—'}</span></div>
                <div className="row-line"><span className="k">Birthday</span><span className="v">{guest.date_of_birth ? new Date(guest.date_of_birth).toLocaleDateString('en-IN', {day:'numeric', month:'short'}) : '—'}</span></div>
                <div className="row-line"><span className="k">Anniversary</span><span className="v">{guest.anniversary ? new Date(guest.anniversary).toLocaleDateString('en-IN', {day:'numeric', month:'short'}) : '—'}</span></div>
                <div className="row-line"><span className="k">Membership</span><span className="v" data-testid="guest-membership-value">{membership?.membership_name || guest.membership_name || '—'}</span></div>
                {membership?.membership_name && (
                  <div data-testid="guest-membership-detail" style={{ margin: '2px 0 8px', padding: '10px 12px', borderRadius: 12, border: `1px solid ${(membership.color || '#a855f7')}44`, background: `linear-gradient(160deg, ${(membership.color || '#a855f7')}12, ${(membership.color || '#a855f7')}04)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', padding: '2px 8px', fontSize: 10, color: (membership.color || '#a855f7'), border: `1px solid ${(membership.color || '#a855f7')}`, background: (membership.color || '#a855f7') + '1A' }}>{membership.tier || 'Member'}</span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        {membership.plan_type === 'discount'
                          ? `${membership.discount_percent || 0}% off every booking`
                          : `Wallet ₹${Number(membership.wallet_balance || 0).toLocaleString('en-IN')}`}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                      {membership.expiry_date ? `Valid till ${new Date(membership.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                      {membership.payment_confirmed === false ? ' · payment pending' : ''}
                    </div>
                  </div>
                )}
                <div className="row-line"><span className="k">Preferred staff</span><span className="v">{guest.preferred_barber_name || guest.preferred_barber_id || '—'}</span></div>
                <div className="row-line"><span className="k">Source</span><span className="v">{guest.source || '—'}</span></div>
                <div className="row-line"><span className="k">Consent (WhatsApp)</span><span className="v" style={{color:'var(--green)'}}>Opted in ✓</span></div>

                {/* Full guest history */}
                <div style={{marginTop:22}}>
                  <div style={{fontSize:12, fontWeight:800, textTransform:'uppercase', letterSpacing:'.4px', color:'var(--muted)', marginBottom:10}}>
                    Full history {bookings.length > 0 ? `(${bookings.length})` : ''}
                  </div>
                  {bookings.length === 0 && (
                    <div style={{color:'var(--muted)', textAlign:'center', padding:'18px 0', fontSize:13}}>No visits yet.</div>
                  )}
                  {bookings.map((b, i) => {
                    const bd = bookingDisplay(b);
                    return (
                      <div className="visit" key={`hist-${b.id || b.token_id || i}`}>
                        <div className="vd"><b>{bd.dd}</b><span>{bd.mm}</span></div>
                        <div className="vi"><b>{bd.services}</b><span>{bd.barber} · {bd.method}</span></div>
                        <div className="vp">
                          <b>{rupee(bd.amount)}</b>
                          {gstInvoiceLink(b)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'visits' && (
              <div>
                {bookings.length === 0 && <div style={{color:'var(--muted)', textAlign:'center', padding:20}}>No visits yet.</div>}
                {bookings.slice(0, 20).map((b, i) => {
                  const bd = bookingDisplay(b);
                  return (
                    <div className="visit" key={b.id || b.token_id || i}>
                      <div className="vd"><b>{bd.dd}</b><span>{bd.mm}</span></div>
                      <div className="vi"><b>{bd.services}</b><span>{bd.barber} · {bd.method}</span></div>
                      <div className="vp">
                        <b>{rupee(bd.amount)}</b>
                        {gstInvoiceLink(b)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'comms' && (
              <div className="msg-log">
                <div className="ml">
                  <div className="mi" style={{background:'var(--sky-bg)', color:'var(--sky)'}}><Ico.chat /></div>
                  <div className="mb">Message history syncs from Twilio WhatsApp + SMS webhooks. Send a broadcast or automation to see threads here.<div className="mt">System · Info</div></div>
                </div>
              </div>
            )}

            {tab === 'notes' && (
              <div>
                <div className="v2-field">
                  <label>Staff notes</label>
                  <textarea placeholder="Allergies, preferences, styling notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <button className="btn-primary" disabled={savingNotes} onClick={saveNotes}><Ico.save /> Save note</button>
              </div>
            )}
          </div>
        </aside>
      </>
    );
  }

  return ReactDOM.createPortal(<div className="shv2">{drawerContent}</div>, document.body);
}
