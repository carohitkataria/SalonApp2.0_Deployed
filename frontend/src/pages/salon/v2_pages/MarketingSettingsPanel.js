/**
 * MarketingSettingsPanel — Marketing → Settings tab.
 *
 * Implements the WABA + prepaid wallet + spend sync + DLT + email + sending
 * windows layout from salon_marketing_settings.html.
 *
 * Money throughout is stored / passed as integer paise; UI displays rupees.
 * Wallet top-ups go through Cashfree JS SDK v3. First recharge activates
 * marketing_status="active"; if the wallet can't cover a campaign the salon
 * is shown a "Recharge required" state and campaign dispatch is blocked
 * server-side by assert_can_send().
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

// ---------- Icons ----------
const Ic = {
  wa:     () => <svg viewBox="0 0 24 24" style={{fill:'currentColor', stroke:'none'}}><path d="M12 2a10 10 0 0 0-8.7 15L2 22l5.2-1.3A10 10 0 1 0 12 2z"/></svg>,
  wallet: () => <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  chart:  () => <svg viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
  refresh:() => <svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  file:   () => <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>,
  down:   () => <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  chat:   () => <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  mail:   () => <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>,
  clock:  () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  save:   () => <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>,
  check:  () => <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  close:  () => <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  plus:   () => <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  link:   () => <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
};

// ---------- Formatters ----------
const rupeesFromMinor = (m) => Number(m || 0) / 100;
const fmtRupees = (m) => '₹' + rupeesFromMinor(m).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
  catch { return String(iso); }
};

// ---------- Local styles (scoped to .mkset) ----------
const CSS = `
.mkset{display:flex;flex-direction:column;gap:16px}
.mkset .row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.mkset .row.full{grid-template-columns:1fr}
.mkset .card{background:#fff;border:1px solid #ECECF3;border-radius:16px;padding:20px;box-shadow:0 1px 2px rgba(30,32,50,.04),0 6px 20px rgba(30,32,50,.05)}
.mkset .card__h{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
.mkset .card__h .t{display:flex;align-items:center;gap:10px;font-family:'Plus Jakarta Sans','Inter',sans-serif;font-weight:800;font-size:16.5px;color:#23252F}
.mkset .card__h .t svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;color:#6C4FE0}
.mkset .status-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:20px;font-size:11.5px;font-weight:700;background:#F3F3F8;color:#7C8092}
.mkset .status-pill.ok{background:#E7F6ED;color:#2FA96A}
.mkset .status-pill.warn{background:#FDF3E4;color:#E8952B}
.mkset .status-pill.err{background:#FCEAF1;color:#E45C86}
.mkset .status-pill .d{width:7px;height:7px;border-radius:50%;background:currentColor}
.mkset .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px 22px}
.mkset .field{display:flex;flex-direction:column;gap:5px}
.mkset .field .k{font-size:11.5px;color:#7C8092;font-weight:600;letter-spacing:.2px;text-transform:uppercase}
.mkset .field .v{font-size:13.5px;color:#23252F;font-weight:700}
.mkset .field .v.muted{color:#9A9EAE;font-weight:600}
.mkset .form-field{display:flex;flex-direction:column;gap:6px}
.mkset .form-field label{font-size:12.5px;font-weight:600;color:#3C3F4E}
.mkset .form-field input,.mkset .form-field select,.mkset .form-field textarea{font-size:13.5px;border:1px solid #ECECF3;border-radius:10px;padding:10px 12px;color:#23252F;background:#fff;outline:none;font-family:inherit;font-weight:600}
.mkset .form-field input:focus,.mkset .form-field select:focus,.mkset .form-field textarea:focus{border-color:#6C4FE0;box-shadow:0 0 0 3px #F1EEFF}
.mkset .form-field .hint{font-size:11px;color:#9A9EAE}
.mkset .balance-big{font-family:'Plus Jakarta Sans';font-weight:800;font-size:36px;color:#23252F;letter-spacing:-.5px}
.mkset .balance-big small{font-size:14px;color:#9A9EAE;font-weight:700}
.mkset .bar-row{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.mkset .bar{display:grid;grid-template-columns:110px 1fr 100px;gap:10px;align-items:center;font-size:12.5px}
.mkset .bar b{color:#3C3F4E;font-weight:700;display:flex;align-items:center;gap:6px}
.mkset .bar b svg{width:14px;height:14px}
.mkset .bar .track{background:#F3F3F8;border-radius:10px;height:10px;position:relative;overflow:hidden}
.mkset .bar .fill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#6C4FE0,#8A73F0);border-radius:10px;transition:.35s}
.mkset .bar .fill.wa{background:linear-gradient(90deg,#25D366,#4ED88A)}
.mkset .bar .fill.sms{background:linear-gradient(90deg,#3E93E8,#6BB0F0)}
.mkset .bar .fill.email{background:linear-gradient(90deg,#E8952B,#F5B958)}
.mkset .bar .amt{text-align:right;font-weight:700;color:#23252F}
.mkset .txn-table{width:100%;border-collapse:separate;border-spacing:0}
.mkset .txn-table th,.mkset .txn-table td{padding:12px 10px;text-align:left;font-size:12.5px;border-bottom:1px solid #F3F3F8}
.mkset .txn-table th{font-size:11px;font-weight:700;color:#9A9EAE;text-transform:uppercase;letter-spacing:.3px}
.mkset .txn-table td .b-name{display:flex;align-items:center;gap:10px;font-weight:600;color:#23252F}
.mkset .txn-table td .b-name .cico{width:32px;height:32px;border-radius:9px;background:#F1EEFF;color:#6C4FE0;display:grid;place-items:center;flex:none}
.mkset .txn-table td .b-name .cico svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.mkset .txn-table td .b-name .cico.wa{background:#E7F9EF;color:#25D366}
.mkset .txn-table td .b-name .cico.sms{background:#E9F2FD;color:#3E93E8}
.mkset .txn-table td .b-name .cico.mail{background:#FDF3E4;color:#E8952B}
.mkset .amount.up{color:#2FA96A;font-weight:800}
.mkset .amount.down{color:#E45C86;font-weight:700}
.mkset .card-foot{margin-top:14px;padding-top:14px;border-top:1px solid #F3F3F8;display:flex;justify-content:space-between;align-items:center;gap:10px}
.mkset .card-foot .note{font-size:11.5px;color:#7C8092}
.mkset .btn-p{background:#6C4FE0;color:#fff;padding:9px 14px;border-radius:11px;font-weight:700;font-size:13px;display:inline-flex;align-items:center;gap:8px;border:none;cursor:pointer}
.mkset .btn-p:hover:not(:disabled){background:#5B3FD1}
.mkset .btn-p:disabled{opacity:.55;cursor:not-allowed}
.mkset .btn-p svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.mkset .btn-g{background:#F3F3F8;color:#3C3F4E;padding:9px 14px;border-radius:11px;font-weight:700;font-size:13px;display:inline-flex;align-items:center;gap:8px;border:1px solid #ECECF3;cursor:pointer}
.mkset .btn-g:hover:not(:disabled){background:#EFEBFE;color:#6C4FE0;border-color:#E7E2FF}
.mkset .btn-g:disabled{opacity:.55;cursor:not-allowed}
.mkset .btn-g svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.mkset .row-toggle{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #F3F3F8}
.mkset .row-toggle:last-child{border:none}
.mkset .switch{position:relative;width:38px;height:22px;background:#ECECF3;border-radius:20px;cursor:pointer;transition:.2s}
.mkset .switch.on{background:#6C4FE0}
.mkset .switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;background:#fff;border-radius:50%;transition:.2s}
.mkset .switch.on::after{left:19px}
.mkset .banner{padding:12px 14px;border-radius:12px;font-size:12.5px;line-height:1.55}
.mkset .banner.info{background:#EFEBFE;color:#5B3FD1;border:1px solid #E7E2FF}
.mkset .banner.warn{background:#FDF3E4;color:#B26A18;border:1px solid #F5C97C}
.mkset .banner.err{background:#FCEAF1;color:#B23A5F;border:1px solid #F5C1D5}
.mkset .preset-row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.mkset .preset-row button{padding:8px 14px;border-radius:10px;background:#F3F3F8;color:#3C3F4E;border:1px solid #ECECF3;font-weight:700;font-size:12.5px;cursor:pointer}
.mkset .preset-row button.on{background:#6C4FE0;color:#fff;border-color:#6C4FE0}
@media(max-width:1150px){ .mkset .row{grid-template-columns:1fr} }
`;

function useLocalStyles() {
  useEffect(() => {
    const id = 'mkset-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

// -------- Cashfree JS SDK loader (v3) --------
let _cashfreeLoadPromise = null;
function loadCashfreeSDK() {
  if (typeof window !== 'undefined' && window.Cashfree) return Promise.resolve(window.Cashfree);
  if (_cashfreeLoadPromise) return _cashfreeLoadPromise;
  _cashfreeLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    s.async = true;
    s.onload = () => resolve(window.Cashfree);
    s.onerror = () => reject(new Error('Cashfree SDK failed to load'));
    document.head.appendChild(s);
  });
  return _cashfreeLoadPromise;
}

// ============================================================
export default function MarketingSettingsPanel({ salonId, authHeaders }) {
  useLocalStyles();

  const authRef = useRef(authHeaders);
  useEffect(() => { authRef.current = authHeaders; }, [authHeaders]);
  const auth = useCallback(() => {
    try { return (authRef.current && authRef.current()) || {}; } catch { return {}; }
  }, []);

  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topupOpen, setTopupOpen] = useState(false);
  const [ledger, setLedger] = useState([]);
  const [syncing, setSyncing] = useState(false);

  const fetchSnap = useCallback(async (opts = { silent: false }) => {
    if (!opts.silent) setLoading(true);
    try {
      const [full, led] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/marketing/settings/full`, { headers: auth() }),
        axios.get(`${API}/salons/${salonId}/wallet/ledger?limit=25`, { headers: auth() }),
      ]);
      setSnap(full.data);
      setLedger(led.data?.entries || []);
    } catch (e) {
      if (!opts.silent) toast.error(e.response?.data?.detail || 'Failed to load settings');
    } finally { if (!opts.silent) setLoading(false); }
  }, [salonId, auth]);

  useEffect(() => { fetchSnap(); }, [fetchSnap]);

  // Silent refresh — keeps balance / status current after webhook credit
  useEffect(() => {
    if (!salonId) return undefined;
    const id = setInterval(() => fetchSnap({ silent: true }), 20000);
    return () => clearInterval(id);
  }, [salonId, fetchSnap]);

  if (loading || !snap) {
    return <div className="mkset"><div className="card" style={{padding:32, textAlign:'center', color:'#9A9EAE'}}>Loading marketing settings…</div></div>;
  }

  const wallet = snap.wallet || {};
  const sub = snap.subaccount || {};
  const dlt = snap.dlt || {};
  const emailCfg = snap.email_sender || {};
  const sendSettings = snap.send_settings || {};
  const spend = snap.spend_month || { total_minor: 0, channels: {} };
  const env = snap.env || {};

  const senderStatus = String(sub.sender_status || 'not_connected').toLowerCase();
  const marketingStatus = String(wallet.marketing_status || 'not_activated').toLowerCase();

  const runUsageSync = async () => {
    setSyncing(true);
    try {
      await axios.post(`${API}/salons/${salonId}/marketing/settings/usage-sync`, {}, { headers: auth() });
      toast.success('Usage synced from Twilio');
      fetchSnap({ silent: true });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Sync failed');
    } finally { setSyncing(false); }
  };

  return (
    <div className="mkset">
      {marketingStatus !== 'active' && (
        <div className="banner warn">
          <b>Marketing is not activated.</b> Add money to the wallet (first recharge ≥ ₹{(env.min_first_recharge_minor / 100).toLocaleString('en-IN')}) to start sending campaigns.
        </div>
      )}
      {marketingStatus === 'paused' && (
        <div className="banner err">
          <b>Marketing is paused.</b> Wallet balance dropped to zero — recharge to resume sends.
        </div>
      )}

      {/* CARD 1 — WhatsApp Sender & Twilio Sub-account (full width) */}
      <div className="row full">
        <div className="card">
          <div className="card__h">
            <div className="t"><Ic.wa /> WhatsApp Sender &amp; Twilio Sub-account</div>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <StatusPill status={senderStatus} />
              <button className="btn-g" onClick={async () => {
                try {
                  await axios.post(`${API}/salons/${salonId}/marketing/settings/waba/sync`, {}, { headers: auth() });
                  toast.success('Synced from Twilio');
                  fetchSnap({ silent: true });
                } catch (e) { toast.error(e.response?.data?.detail || 'Sync failed'); }
              }}><Ic.refresh /> Sync</button>
            </div>
          </div>
          <div className="grid2">
            <ReadField k="Sub-account friendly name" v={sub.friendly_name} />
            <ReadField k="Sub-account SID" v={sub.subaccount_sid} mono />
            <ReadField k="WABA ID" v={sub.waba_id} mono />
            <ReadField k="Sender number" v={sub.sender_phone_e164} subtitle="owned by salon" />
            <ReadField k="Display name" v={sub.display_name} subtitle="Meta approval" />
            <ReadField k="Quality rating" v={sub.quality_rating} />
            <ReadField k="Messaging limit tier" v={sub.messaging_tier} />
            <ReadField k="Messaging Service SID" v={sub.messaging_service_sid} mono />
          </div>
          <div className="card-foot">
              <span className="note">Salons connect their own number via <b>Meta Embedded Signup</b>. The backend then registers the sender under this salon&apos;s Twilio sub-account.</span>
            <div style={{display:'flex', gap:8}}>
              <button className="btn-g" onClick={() => toast.info('Meta Business Manager → opens in a new tab (real link once META_APP_ID configured).')}>
                <Ic.link /> Manage on WhatsApp
              </button>
              <button className="btn-p" onClick={() => window.dispatchEvent(new Event('mkset:open-es'))}>
                <Ic.plus /> Re-connect number
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2 + 3 — Wallet + Spend */}
      <div className="row">
        <WalletCard
          wallet={wallet}
          env={env}
          onTopup={() => setTopupOpen(true)}
          onSaveAutoRecharge={async (payload) => {
            try {
              await axios.post(`${API}/salons/${salonId}/wallet/auto-recharge`, payload, { headers: auth() });
              toast.success('Auto-recharge saved');
              fetchSnap({ silent: true });
            } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
          }}
        />
        <SpendCard spend={spend} syncing={syncing} onSync={runUsageSync} />
      </div>

      {/* CARD 4 — Wallet transactions (full width) */}
      <div className="row full">
        <div className="card">
          <div className="card__h">
            <div className="t"><Ic.file /> Wallet transactions</div>
            <button className="btn-g" onClick={() => {
              const rows = [['Date','Type','Channel','Amount (₹)','Balance (₹)','Ref']];
              ledger.forEach(l => rows.push([l.created_at, l.type, l.channel || '', (l.amount_minor/100).toFixed(2), (l.balance_after_minor/100).toFixed(2), l.ref || '']));
              const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'wallet_statement.csv'; a.click();
              URL.revokeObjectURL(url);
              toast.success('Statement downloaded');
            }}><Ic.down /> Statement</button>
          </div>
          <table className="txn-table">
            <thead>
              <tr>
                <th>Transaction</th><th>Date</th><th style={{textAlign:'right'}}>Amount</th><th style={{textAlign:'right'}}>Running balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 && (
                <tr><td colSpan={4} style={{textAlign:'center', color:'#9A9EAE', padding:24}}>No transactions yet.</td></tr>
              )}
              {ledger.map(l => (
                <tr key={l.id || l.created_at + Math.random()}>
                  <td>
                    <div className="b-name">
                      <span className={`cico ${l.channel === 'whatsapp' ? 'wa' : l.channel === 'sms' ? 'sms' : l.channel === 'email' ? 'mail' : ''}`}>
                        {l.type === 'topup' ? <Ic.wallet /> : l.channel === 'whatsapp' ? <Ic.wa /> : l.channel === 'sms' ? <Ic.chat /> : l.channel === 'email' ? <Ic.mail /> : <Ic.wallet />}
                      </span>
                      <div>
                        <div style={{fontWeight:700}}>{l.type === 'topup' ? 'Wallet top-up' : l.type === 'debit' ? `${(l.channel||'usage').toString().toUpperCase()} usage` : (l.note || l.type)}</div>
                        {l.ref && <div style={{fontSize:10.5, color:'#9A9EAE', fontFamily:'monospace'}}>{l.ref.slice(0, 24)}</div>}
                      </div>
                    </div>
                  </td>
                  <td>{fmtDateTime(l.created_at)}</td>
                  <td style={{textAlign:'right'}}>
                    <span className={l.amount_minor >= 0 ? 'amount up' : 'amount down'}>{l.amount_minor >= 0 ? '+' : ''}{fmtRupees(l.amount_minor)}</span>
                  </td>
                  <td style={{textAlign:'right', fontWeight:700}}>{fmtRupees(l.balance_after_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CARD 5 + 6 — SMS DLT + Email sender */}
      <div className="row">
        <DltCard
          dlt={dlt}
          onSave={async (payload) => {
            try {
              await axios.post(`${API}/salons/${salonId}/marketing/settings/dlt`, payload, { headers: auth() });
              toast.success('DLT config saved');
              fetchSnap({ silent: true });
            } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
          }}
        />
        <EmailCard
          emailCfg={emailCfg}
          onSave={async (payload) => {
            try {
              await axios.post(`${API}/salons/${salonId}/marketing/settings/email`, payload, { headers: auth() });
              toast.success('Email sender saved');
              fetchSnap({ silent: true });
            } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
          }}
        />
      </div>

      {/* CARD 7 — Sending windows & consent */}
      <div className="row full">
        <SendingWindowsCard
          settings={sendSettings}
          onSave={async (payload) => {
            try {
              await axios.post(`${API}/salons/${salonId}/marketing/settings/sending-windows`, payload, { headers: auth() });
              toast.success('Sending windows saved');
              fetchSnap({ silent: true });
            } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
          }}
        />
      </div>

      {/* Top-up drawer */}
      <TopupDrawer
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        salonId={salonId}
        auth={auth}
        env={env}
        wallet={wallet}
        onDone={() => { setTopupOpen(false); fetchSnap({ silent: true }); }}
      />
    </div>
  );
}

// -------- Small sub-components --------

function StatusPill({ status }) {
  const map = {
    online: { cls: 'ok', label: 'Connected' },
    active: { cls: 'ok', label: 'Connected' },
    pending: { cls: 'warn', label: 'Pending' },
    not_connected: { cls: 'err', label: 'Not connected' },
    paused: { cls: 'err', label: 'Paused' },
  };
  const m = map[status] || map.not_connected;
  return <span className={`status-pill ${m.cls}`}><span className="d"></span>{m.label}</span>;
}

function ReadField({ k, v, subtitle, mono }) {
  return (
    <div className="field">
      <span className="k">{k}</span>
      <span className={`v ${!v ? 'muted' : ''}`} style={mono ? { fontFamily:'monospace' } : undefined}>
        {v || '—'}{subtitle ? <span style={{color:'#9A9EAE', fontWeight:500, marginLeft:6, fontSize:12}}>· {subtitle}</span> : null}
      </span>
    </div>
  );
}

function Toggle({ on, onChange }) {
  return <div className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="button" aria-pressed={on} />;
}

function WalletCard({ wallet, env, onTopup, onSaveAutoRecharge }) {
  const [autoOn, setAutoOn] = useState(!!wallet.auto_recharge);
  const [thresh, setThresh] = useState((wallet.recharge_threshold_minor || 0) / 100);
  const [amt, setAmt] = useState((wallet.recharge_amount_minor || 0) / 100);
  const [alertBelow, setAlertBelow] = useState((wallet.low_balance_alert_minor || 30000) / 100);

  useEffect(() => {
    setAutoOn(!!wallet.auto_recharge);
    setThresh((wallet.recharge_threshold_minor || 0) / 100);
    setAmt((wallet.recharge_amount_minor || 0) / 100);
    setAlertBelow((wallet.low_balance_alert_minor || 30000) / 100);
  }, [wallet]);

  const save = () => onSaveAutoRecharge({
    auto_recharge: autoOn,
    recharge_threshold_minor: Math.round((Number(thresh) || 0) * 100),
    recharge_amount_minor: Math.round((Number(amt) || 0) * 100),
    low_balance_alert_minor: Math.round((Number(alertBelow) || 0) * 100),
  });

  return (
    <div className="card">
      <div className="card__h">
        <div className="t"><Ic.wallet /> Prepaid wallet</div>
        <StatusPill status={wallet.marketing_status === 'active' ? 'online' : wallet.marketing_status === 'paused' ? 'paused' : 'not_connected'} />
      </div>
      <div className="balance-big">{fmtRupees(wallet.balance_minor || 0)} <small>{wallet.currency || 'INR'}</small></div>
      <div style={{margin:'10px 0 16px', display:'flex', gap:8}}>
        <button className="btn-p" onClick={onTopup}><Ic.plus /> Add money</button>
        {wallet.first_recharge_at && <span style={{fontSize:11.5, color:'#9A9EAE', alignSelf:'center'}}>First recharge {fmtDateTime(wallet.first_recharge_at)}</span>}
      </div>
      <div className="row-toggle">
        <div>
          <div style={{fontWeight:700, fontSize:13}}>Auto-recharge</div>
          <div style={{fontSize:11, color:'#9A9EAE'}}>Recharge when balance drops below your threshold.</div>
        </div>
        <Toggle on={autoOn} onChange={setAutoOn} />
      </div>
      {autoOn && (
        <div className="grid2" style={{marginTop:8}}>
          <div className="form-field">
            <label>Recharge when below (₹)</label>
            <input type="number" min="0" value={thresh} onChange={(e) => setThresh(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Recharge by (₹)</label>
            <input type="number" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </div>
        </div>
      )}
      <div className="form-field" style={{marginTop:10}}>
        <label>Low-balance alert threshold (₹)</label>
        <input type="number" min="0" value={alertBelow} onChange={(e) => setAlertBelow(e.target.value)} />
        <span className="hint">Owner gets a WhatsApp alert when balance drops below this.</span>
      </div>
      <div className="card-foot">
        <span className="note">Actual-cost pass-through — platform takes no margin.</span>
        <button className="btn-p" onClick={save}><Ic.save /> Save</button>
      </div>
    </div>
  );
}

function SpendCard({ spend, syncing, onSync }) {
  const total = spend.total_minor || 0;
  const channels = spend.channels || {};
  const wa = channels.whatsapp || { count: 0, cost_minor: 0 };
  const sms = channels.sms || { count: 0, cost_minor: 0 };
  const email = channels.email || { count: 0, cost_minor: 0 };
  const max = Math.max(1, wa.cost_minor, sms.cost_minor, email.cost_minor);
  const w = (v) => `${Math.max(4, Math.round((v / max) * 100))}%`;

  return (
    <div className="card">
      <div className="card__h">
        <div className="t"><Ic.chart /> Spend this month</div>
        <button className="btn-g" onClick={onSync} disabled={syncing}>
          <Ic.refresh /> {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>
      <div className="balance-big">{fmtRupees(total)}</div>
      <div style={{fontSize:11.5, color:'#9A9EAE'}}>synced with Twilio · pass-through</div>
      <div className="bar-row">
        <div className="bar">
          <b><Ic.wa /> WhatsApp</b>
          <div className="track"><div className="fill wa" style={{width: w(wa.cost_minor)}} /></div>
          <span className="amt">{fmtRupees(wa.cost_minor)}<div style={{fontSize:10, color:'#9A9EAE', fontWeight:600}}>{wa.count} msg</div></span>
        </div>
        <div className="bar">
          <b><Ic.chat /> SMS (DLT)</b>
          <div className="track"><div className="fill sms" style={{width: w(sms.cost_minor)}} /></div>
          <span className="amt">{fmtRupees(sms.cost_minor)}<div style={{fontSize:10, color:'#9A9EAE', fontWeight:600}}>{sms.count} msg</div></span>
        </div>
        <div className="bar">
          <b><Ic.mail /> Email</b>
          <div className="track"><div className="fill email" style={{width: w(email.cost_minor)}} /></div>
          <span className="amt">{fmtRupees(email.cost_minor)}<div style={{fontSize:10, color:'#9A9EAE', fontWeight:600}}>{email.count} msg</div></span>
        </div>
      </div>
      <div className="card-foot">
        <span className="note">Pulled per-sub-account via Twilio Usage Records API. Prices are actual Twilio cost (no platform margin).</span>
      </div>
    </div>
  );
}

function DltCard({ dlt, onSave }) {
  const [entityId, setEntityId] = useState(dlt.entity_id || '');
  const [senderHeader, setSenderHeader] = useState(dlt.sender_header || '');
  const [provider, setProvider] = useState(dlt.provider || 'twilio');
  useEffect(() => {
    setEntityId(dlt.entity_id || '');
    setSenderHeader(dlt.sender_header || '');
    setProvider(dlt.provider || 'twilio');
  }, [dlt]);
  const registered = !!dlt.entity_id;
  return (
    <div className="card">
      <div className="card__h">
        <div className="t"><Ic.chat /> SMS · DLT (India)</div>
        <StatusPill status={registered ? 'online' : 'not_connected'} />
      </div>
      <div className="grid2">
        <div className="form-field">
          <label>DLT Entity ID (PE)</label>
          <input placeholder="e.g. 1101a0000000000000" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Sender ID / Header</label>
          <input placeholder="TLKSLN" value={senderHeader} onChange={(e) => setSenderHeader(e.target.value.toUpperCase().slice(0, 6))} />
          <span className="hint">6 letters, all caps, TRAI-approved header.</span>
        </div>
        <div className="form-field">
          <label>DLT provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="twilio">Twilio</option>
            <option value="msg91">MSG91</option>
            <option value="jio">Jio</option>
            <option value="airtel">Airtel</option>
          </select>
        </div>
        <div className="form-field">
          <label>Approved template DLT IDs</label>
          <input placeholder="Comma-separated" value={(dlt.template_dlt_ids || []).join(', ')} readOnly />
          <span className="hint">Synced from provider.</span>
        </div>
      </div>
      <div className="card-foot">
        <span className="note">Register your entity on the TRAI DLT portal, then paste the PE ID + Header here.</span>
        <button className="btn-p" onClick={() => onSave({ entity_id: entityId, sender_header: senderHeader, provider })}><Ic.save /> Save</button>
      </div>
    </div>
  );
}

function EmailCard({ emailCfg, onSave }) {
  const [fromName, setFromName] = useState(emailCfg.from_name || '');
  const [fromEmail, setFromEmail] = useState(emailCfg.from_email || '');
  const [replyTo, setReplyTo] = useState(emailCfg.reply_to || '');
  useEffect(() => {
    setFromName(emailCfg.from_name || '');
    setFromEmail(emailCfg.from_email || '');
    setReplyTo(emailCfg.reply_to || '');
  }, [emailCfg]);
  const verified = !!emailCfg.verified;
  return (
    <div className="card">
      <div className="card__h">
        <div className="t"><Ic.mail /> Email sender</div>
        <StatusPill status={verified ? 'online' : 'not_connected'} />
      </div>
      <div className="grid2">
        <div className="form-field">
          <label>From name</label>
          <input placeholder="The Looks Unisex Salon" value={fromName} onChange={(e) => setFromName(e.target.value)} />
        </div>
        <div className="form-field">
          <label>From email</label>
          <input type="email" placeholder="hello@thelooks.in" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Reply-to</label>
          <input type="email" placeholder="care@thelooks.in" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
        </div>
      </div>
      <div className="card-foot">
        <span className="note">DNS records (SPF + DKIM) are verified by your email provider.</span>
        <button className="btn-p" onClick={() => onSave({ from_name: fromName, from_email: fromEmail, reply_to: replyTo })}><Ic.save /> Save</button>
      </div>
    </div>
  );
}

function SendingWindowsCard({ settings, onSave }) {
  const [w, setW] = useState({
    window_start: settings.window_start || '10:00',
    window_end: settings.window_end || '21:00',
    quiet_start: settings.quiet_start || '22:00',
    quiet_end: settings.quiet_end || '09:00',
    optout_keyword: settings.optout_keyword || 'STOP',
    require_optin: settings.require_optin !== false,
    per_guest_cap_per_week: settings.per_guest_cap_per_week || 3,
  });
  useEffect(() => {
    setW({
      window_start: settings.window_start || '10:00',
      window_end: settings.window_end || '21:00',
      quiet_start: settings.quiet_start || '22:00',
      quiet_end: settings.quiet_end || '09:00',
      optout_keyword: settings.optout_keyword || 'STOP',
      require_optin: settings.require_optin !== false,
      per_guest_cap_per_week: settings.per_guest_cap_per_week || 3,
    });
  }, [settings]);
  return (
    <div className="card">
      <div className="card__h">
        <div className="t"><Ic.clock /> Sending windows &amp; consent</div>
      </div>
      <div className="grid2">
        <div className="form-field">
          <label>Marketing send window</label>
          <div style={{display:'flex', gap:8}}>
            <input type="time" value={w.window_start} onChange={(e) => setW(s => ({ ...s, window_start: e.target.value }))} />
            <span style={{alignSelf:'center', color:'#9A9EAE'}}>to</span>
            <input type="time" value={w.window_end} onChange={(e) => setW(s => ({ ...s, window_end: e.target.value }))} />
          </div>
        </div>
        <div className="form-field">
          <label>Quiet hours</label>
          <div style={{display:'flex', gap:8}}>
            <input type="time" value={w.quiet_start} onChange={(e) => setW(s => ({ ...s, quiet_start: e.target.value }))} />
            <span style={{alignSelf:'center', color:'#9A9EAE'}}>to</span>
            <input type="time" value={w.quiet_end} onChange={(e) => setW(s => ({ ...s, quiet_end: e.target.value }))} />
          </div>
        </div>
        <div className="form-field">
          <label>Opt-out keyword</label>
          <input value={w.optout_keyword} onChange={(e) => setW(s => ({ ...s, optout_keyword: e.target.value.toUpperCase() }))} />
        </div>
        <div className="form-field">
          <label>Per-guest marketing cap (per week)</label>
          <input type="number" min="0" value={w.per_guest_cap_per_week} onChange={(e) => setW(s => ({ ...s, per_guest_cap_per_week: Number(e.target.value) || 0 }))} />
          <span className="hint">Meta frequency-capping rule.</span>
        </div>
      </div>
      <div className="row-toggle" style={{marginTop:6}}>
        <div>
          <div style={{fontWeight:700, fontSize:13}}>Require opt-in before marketing</div>
          <div style={{fontSize:11, color:'#9A9EAE'}}>Only guests who opted in receive marketing messages.</div>
        </div>
        <Toggle on={w.require_optin} onChange={(v) => setW(s => ({ ...s, require_optin: v }))} />
      </div>
      <div className="card-foot" style={{justifyContent:'flex-end'}}>
        <button className="btn-p" onClick={() => onSave(w)}><Ic.save /> Save settings</button>
      </div>
    </div>
  );
}

// -------- Top-up drawer (portal, Cashfree JS SDK v3) --------
function TopupDrawer({ open, onClose, salonId, auth, env, wallet, onDone }) {
  const PRESETS = [500, 1000, 2000, 5000];
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [orderInfo, setOrderInfo] = useState(null);

  useEffect(() => { if (!open) { setOrderInfo(null); setAmount(1000); } }, [open]);

  const isFirst = !wallet.first_recharge_at;
  const minMinor = env.min_first_recharge_minor || 50000;

  const pay = async () => {
    const amtMinor = Math.round((Number(amount) || 0) * 100);
    if (amtMinor <= 0) { toast.error('Enter amount'); return; }
    if (isFirst && amtMinor < minMinor) {
      toast.error(`First recharge must be at least ₹${(minMinor / 100).toLocaleString('en-IN')} to activate marketing`);
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post(`${API}/salons/${salonId}/wallet/topup`, {
        amount_minor: amtMinor,
        return_url: window.location.href,
      }, { headers: auth() });
      const data = res.data;
      setOrderInfo(data);

      const isDummySession = String(data.payment_session_id || '').startsWith('session_dummy_');
      if (isDummySession) {
        // Cashfree not configured — offer dev shortcut
        toast.info('Cashfree not configured (DUMMY keys). Use "Simulate credit" to complete flow.');
        return;
      }

      // Live Cashfree flow — load SDK + open checkout modal.
      const Cashfree = await loadCashfreeSDK();
      const cf = Cashfree({ mode: (env.cashfree_env || 'sandbox') });
      cf.checkout({ paymentSessionId: data.payment_session_id, redirectTarget: '_modal' });
      toast.success('Complete payment in the Cashfree modal');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create order');
    } finally { setBusy(false); }
  };

  const simulateCredit = async () => {
    if (!orderInfo?.provider_order_id) return;
    try {
      await axios.post(`${API}/salons/${salonId}/wallet/simulate-credit`, {
        provider_order_id: orderInfo.provider_order_id,
      }, { headers: auth() });
      toast.success('Simulated credit successful — wallet updated');
      onDone?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Simulate failed'); }
  };

  const content = (
    <>
      <div className={`shv2-overlay ${open ? 'open' : ''}`} onClick={onClose} style={{ zIndex: 9060 }} />
      <aside className={`shv2-drawer v2-narrow ${open ? 'open' : ''}`} style={{ zIndex: 9070 }}>
        <div className="v2-dh">
          <div className="tt">
            <div className="ic"><Ic.wallet /></div>
            <div>
              <h3>Add money</h3>
              <p>Cashfree · {env.cashfree_env || 'sandbox'} · UPI · Card · Net-banking</p>
            </div>
          </div>
          <button className="v2-close" onClick={onClose}><Ic.close /></button>
        </div>
        <div className="v2-db">
          {isFirst && (
            <div className="banner info" style={{marginBottom:12}}>
              <b>First recharge:</b> minimum ₹{(minMinor / 100).toLocaleString('en-IN')} to activate marketing.
            </div>
          )}
          <div className="v2-field">
            <label>Amount (₹)</label>
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="preset-row">
            {PRESETS.map(p => (
              <button key={p} className={Number(amount) === p ? 'on' : ''} onClick={() => setAmount(p)}>₹{p.toLocaleString('en-IN')}</button>
            ))}
          </div>

          <div className="banner info" style={{marginTop:10}}>
            <b>Money flow:</b> Cashfree collects ₹{Number(amount || 0).toLocaleString('en-IN')} → webhook credits your wallet 1:1 (no platform margin) → wallet debits by exact Twilio cost as messages send.
          </div>

          {orderInfo && String(orderInfo.payment_session_id || '').startsWith('session_dummy_') && (
            <div className="banner warn" style={{marginTop:12}}>
              <b>DUMMY Cashfree keys detected.</b> Real production flow requires filling CASHFREE_APP_ID / CASHFREE_SECRET_KEY in backend .env.
              <div style={{marginTop:8, display:'flex', gap:8}}>
                <button className="btn-p" onClick={simulateCredit}><Ic.check /> Simulate credit (dev)</button>
                <button className="btn-g" onClick={onClose}>Cancel</button>
              </div>
              <div style={{fontSize:11, marginTop:6, opacity:.8}}>Order: <code>{orderInfo.provider_order_id}</code></div>
            </div>
          )}
        </div>
        {!orderInfo && (
          <div className="v2-df">
            <button className="btn-g" onClick={onClose}>Cancel</button>
            <button className="btn-p" disabled={busy} onClick={pay}>
              <Ic.wallet /> {busy ? 'Creating order…' : `Pay ₹${Number(amount || 0).toLocaleString('en-IN')}`}
            </button>
          </div>
        )}
      </aside>
    </>
  );

  return ReactDOM.createPortal(content, document.body);
}
