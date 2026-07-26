/**
 * QueueTabV2 — re-skinned Queue tab matching the Home v2 / .shv2 design
 * language (Zenoti-style purple accents, soft neutrals, rounded cards).
 *
 * Props (all inherited from EnhancedSalonDashboard):
 *   date, dateMode, setDateMode, dateFrom, setDateFrom, dateTo, setDateTo
 *   barbers, selectedBarber, setSelectedBarber
 *   tokens, filter, setFilter
 *   handleCallNext, handleCallToken, handleCompleteToken, handleRecallToken,
 *   handleSkipToken, handleCancelToken, handleSendNotification, handleOpenAddServices
 *   API, navigate
 *
 * Notes:
 *   • Self-contained; injects its own scoped styles under `.qv2`.
 *   • Only the visual layer changes — every handler and prop is passed through
 *     from the parent, so behaviour is identical.
 */
import React, { useEffect, useMemo } from 'react';

const QV2_CSS = `
.qv2{font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;color:#23252F}
.qv2 *{box-sizing:border-box}
.qv2 .qv2-topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;background:#fff;border:1px solid #ECECF3;border-radius:14px;padding:10px 14px;box-shadow:0 4px 16px rgba(30,32,50,.04);margin-bottom:14px}
.qv2 .qv2-dates{display:inline-flex;background:#F6F6FA;border-radius:10px;padding:3px;gap:2px}
.qv2 .qv2-dates button{border:none;background:transparent;font-family:inherit;font-size:12.5px;font-weight:700;color:#5A5E70;padding:6px 14px;border-radius:8px;cursor:pointer;transition:.18s;letter-spacing:.2px}
.qv2 .qv2-dates button:hover{color:#23252F}
.qv2 .qv2-dates button.on{background:#fff;color:#6C4FE0;box-shadow:0 2px 6px rgba(108,79,224,.15)}
.qv2 .qv2-daterange{display:inline-flex;gap:6px;align-items:center;font-size:12px;color:#7C8092;font-weight:600}
.qv2 .qv2-daterange input{border:1px solid #ECECF3;border-radius:8px;padding:6px 8px;font-size:12px;font-family:inherit;color:#23252F;outline:none;background:#fff}
.qv2 .qv2-daterange input:focus{border-color:#6C4FE0;box-shadow:0 0 0 3px rgba(108,79,224,.1)}
.qv2 .qv2-viewinfo{font-size:12px;color:#7C8092;font-weight:600}
.qv2 .qv2-viewinfo b{color:#23252F;font-weight:800}

.qv2 .qv2-actions{display:grid;grid-template-columns:1fr auto;gap:10px;margin-bottom:14px}
.qv2 .qv2-btn{border:none;font-family:inherit;font-size:13.5px;font-weight:800;padding:11px 22px;border-radius:11px;cursor:pointer;transition:.2s;display:inline-flex;align-items:center;justify-content:center;gap:6px;letter-spacing:.15px}
.qv2 .qv2-btn:disabled{opacity:.5;cursor:not-allowed}
.qv2 .qv2-btn.primary{background:linear-gradient(135deg,#6C4FE0,#8464F5);color:#fff;box-shadow:0 6px 18px rgba(108,79,224,.28)}
.qv2 .qv2-btn.primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 24px rgba(108,79,224,.36)}
.qv2 .qv2-btn.ghost{background:#F1EEFF;color:#6C4FE0;border:1px solid #E7E2FF}
.qv2 .qv2-btn.ghost:hover{background:#E7E2FF}
.qv2 .qv2-btn svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}

.qv2 .qv2-filter{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.qv2 .qv2-filter-group{display:inline-flex;background:#fff;border:1px solid #ECECF3;border-radius:12px;padding:4px;gap:2px;box-shadow:0 3px 12px rgba(30,32,50,.03)}
.qv2 .qv2-chip{border:none;background:transparent;font-family:inherit;font-size:11.5px;font-weight:800;color:#5A5E70;padding:6px 12px;border-radius:8px;cursor:pointer;transition:.15s;letter-spacing:.4px;text-transform:uppercase;display:inline-flex;align-items:center;gap:4px}
.qv2 .qv2-chip:hover{background:#F6F6FA;color:#23252F}
.qv2 .qv2-chip.on{background:#6C4FE0;color:#fff}
.qv2 .qv2-chip .qv2-count{background:rgba(255,255,255,.25);padding:1px 6px;border-radius:8px;font-size:10.5px;font-weight:900}
.qv2 .qv2-chip:not(.on) .qv2-count{background:#ECECF3;color:#7C8092}
.qv2 .qv2-barbers{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.qv2 .qv2-barber{border:1px solid #ECECF3;background:#fff;font-family:inherit;font-size:12px;font-weight:700;color:#5A5E70;padding:6px 12px;border-radius:20px;cursor:pointer;transition:.15s}
.qv2 .qv2-barber:hover{border-color:#6C4FE0;color:#6C4FE0}
.qv2 .qv2-barber.on{background:#6C4FE0;border-color:#6C4FE0;color:#fff}

.qv2 .qv2-list{display:flex;flex-direction:column;gap:10px}
.qv2 .qv2-card{background:#fff;border:1px solid #ECECF3;border-radius:14px;padding:14px 16px;display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;box-shadow:0 3px 12px rgba(30,32,50,.03);transition:.2s;position:relative;overflow:hidden}
.qv2 .qv2-card:hover{box-shadow:0 8px 24px rgba(30,32,50,.08);transform:translateY(-1px)}
.qv2 .qv2-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:#ECECF3;transition:.2s}
.qv2 .qv2-card.st-waiting::before{background:#F0AD4E}
.qv2 .qv2-card.st-called::before{background:#4A9BFA}
.qv2 .qv2-card.st-completed::before{background:#2FA96A}
.qv2 .qv2-card.st-skipped::before{background:#E45C86}
.qv2 .qv2-card.st-cancelled::before{background:#A3A6B4}

.qv2 .qv2-tokenchip{min-width:64px;height:64px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#F1EEFF,#FAF8FF);border:1.5px solid #E7E2FF;color:#6C4FE0}
.qv2 .qv2-card.st-waiting .qv2-tokenchip{background:linear-gradient(135deg,#FFF3DC,#FFF9EC);border-color:#FFE5B2;color:#B87A0A}
.qv2 .qv2-card.st-called .qv2-tokenchip{background:linear-gradient(135deg,#E4F0FE,#F1F7FF);border-color:#B7D5F9;color:#256FCE}
.qv2 .qv2-card.st-completed .qv2-tokenchip{background:linear-gradient(135deg,#E4F6ED,#F0FAF4);border-color:#B9E5C8;color:#1F8F52}
.qv2 .qv2-card.st-skipped .qv2-tokenchip{background:linear-gradient(135deg,#FCE4EC,#FEEFF3);border-color:#F5C0D0;color:#C33C5F}
.qv2 .qv2-card.st-cancelled .qv2-tokenchip{background:#F6F6FA;border-color:#ECECF3;color:#7C8092}
.qv2 .qv2-tokenchip .n{font-size:20px;font-weight:900;letter-spacing:.5px;line-height:1}
.qv2 .qv2-tokenchip .lb{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;margin-top:2px;opacity:.7}

.qv2 .qv2-info{min-width:0;display:flex;flex-direction:column;gap:2px}
.qv2 .qv2-info .name{font-size:14.5px;font-weight:800;color:#23252F;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qv2 .qv2-info .name svg{width:12px;height:12px;fill:none;stroke:#7C8092;stroke-width:2.2;flex:none}
.qv2 .qv2-info .row{font-size:11.5px;color:#5A5E70;display:flex;align-items:center;gap:6px;font-weight:600}
.qv2 .qv2-info .row svg{width:11px;height:11px;fill:none;stroke:#9A9EAE;stroke-width:2;flex:none}
.qv2 .qv2-info .row a{color:#5A5E70;text-decoration:none;transition:.15s}
.qv2 .qv2-info .row a:hover{color:#6C4FE0}
.qv2 .qv2-info .row .dot{color:#C3C6D3;margin:0 3px}
.qv2 .qv2-info .amt{color:#23252F;font-weight:800}
.qv2 .qv2-info .paid{color:#2FA96A;font-weight:800}
.qv2 .qv2-info .unpaid{color:#B87A0A;font-weight:800}

.qv2 .qv2-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.qv2 .qv2-statuspill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:14px;font-size:10.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;border:1px solid transparent}
.qv2 .qv2-statuspill.waiting{background:#FFF3DC;color:#B87A0A;border-color:#FFE5B2}
.qv2 .qv2-statuspill.called{background:#E4F0FE;color:#256FCE;border-color:#B7D5F9}
.qv2 .qv2-statuspill.completed{background:#E4F6ED;color:#1F8F52;border-color:#B9E5C8}
.qv2 .qv2-statuspill.skipped{background:#FCE4EC;color:#C33C5F;border-color:#F5C0D0}
.qv2 .qv2-statuspill.cancelled{background:#F6F6FA;color:#7C8092;border-color:#ECECF3}
.qv2 .qv2-statuspill svg{width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:2.5}
.qv2 .qv2-recallcount{font-size:9.5px;color:#7C8092;font-weight:700;margin-left:2px}
.qv2 .qv2-actrow{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}

.qv2 .qv2-actbtn{border:1px solid #ECECF3;background:#fff;font-family:inherit;font-size:11.5px;font-weight:800;color:#5A5E70;padding:6px 10px;border-radius:9px;cursor:pointer;transition:.15s;display:inline-flex;align-items:center;gap:4px;letter-spacing:.15px}
.qv2 .qv2-actbtn:hover{background:#F6F6FA;color:#23252F;border-color:#DDDFE9}
.qv2 .qv2-actbtn svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2.4}
.qv2 .qv2-actbtn.icon-only{padding:6px 8px}
.qv2 .qv2-actbtn.call{background:linear-gradient(135deg,#4A9BFA,#66B0FC);color:#fff;border-color:transparent}
.qv2 .qv2-actbtn.call:hover{background:linear-gradient(135deg,#3A88E5,#4A9BFA);color:#fff}
.qv2 .qv2-actbtn.complete{background:linear-gradient(135deg,#2FA96A,#3EBD7D);color:#fff;border-color:transparent}
.qv2 .qv2-actbtn.complete:hover{background:linear-gradient(135deg,#248757,#2FA96A);color:#fff}
.qv2 .qv2-actbtn.modify{background:#F1EEFF;color:#6C4FE0;border-color:#E7E2FF}
.qv2 .qv2-actbtn.modify:hover{background:#E7E2FF;color:#6C4FE0}
.qv2 .qv2-actbtn.recall{background:#E4F0FE;color:#256FCE;border-color:#B7D5F9}
.qv2 .qv2-actbtn.skip{background:#FFF0DC;color:#B87A0A;border-color:#FFDDA6}
.qv2 .qv2-actbtn.cancel{background:#fff;color:#E45C86;border-color:#F5C0D0}
.qv2 .qv2-actbtn.cancel:hover{background:#FCE4EC}
.qv2 .qv2-actbtn.invoice{background:#F1EEFF;color:#6C4FE0;border-color:#E7E2FF}
.qv2 .qv2-actbtn.download{background:#E4F6ED;color:#1F8F52;border-color:#B9E5C8}
.qv2 .qv2-actbtn.dial{background:#E4F6ED;color:#1F8F52;border-color:#B9E5C8;padding:6px 8px}
.qv2 .qv2-actbtn.dial:hover{background:linear-gradient(135deg,#2FA96A,#3EBD7D);color:#fff}
.qv2 .qv2-noact{font-size:11px;color:#9A9EAE;font-style:italic;font-weight:600}

.qv2 .qv2-empty{text-align:center;padding:70px 20px;background:#fff;border:2px dashed #ECECF3;border-radius:16px}
.qv2 .qv2-empty svg{width:56px;height:56px;color:#C3C6D3;stroke:currentColor;stroke-width:1.6;fill:none;margin-bottom:14px}
.qv2 .qv2-empty h4{font-size:15.5px;font-weight:800;color:#23252F;margin:0 0 6px}
.qv2 .qv2-empty p{font-size:12.5px;color:#7C8092;margin:0;font-weight:600}

@media (max-width:680px){
  .qv2 .qv2-card{grid-template-columns:auto 1fr;grid-template-rows:auto auto}
  .qv2 .qv2-right{grid-column:1/-1;flex-direction:row;align-items:center;justify-content:space-between}
}
`;

const I = {
  chevRight: () => <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>,
  plus:      () => <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  user:      () => <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  phone:     () => <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.95.37 1.88.72 2.77a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.31-1.31a2 2 0 0 1 2.11-.45c.89.35 1.82.59 2.77.72A2 2 0 0 1 22 16.92z"/></svg>,
  cal:       () => <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  clock:     () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  check:     () => <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  cross:     () => <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  skip:      () => <svg viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>,
  rotate:    () => <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  edit:      () => <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  bell:      () => <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  doc:       () => <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  download:  () => <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
};

const STATUS_LABEL = {
  waiting: 'Waiting', called: 'Called', completed: 'Done',
  skipped: 'Skipped', cancelled: 'Cancelled', future: 'Future',
};

export default function QueueTabV2({
  date, dateMode, setDateMode, dateFrom, setDateFrom, dateTo, setDateTo,
  barbers, selectedBarber, setSelectedBarber,
  tokens, filter, setFilter,
  handleCallNext, handleCallToken, handleCompleteToken, handleRecallToken,
  handleSkipToken, handleCancelToken, handleSendNotification, handleOpenAddServices,
  API, navigate,
}) {
  useEffect(() => {
    const id = 'qv2-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = QV2_CSS;
    document.head.appendChild(el);
  }, []);

  // Count of tokens per status (uses the *pre-filter* list length by status
  // if backend already returned filtered data; else derive from tokens array).
  const counts = useMemo(() => {
    const c = { all: tokens.length, waiting: 0, called: 0, completed: 0, skipped: 0, cancelled: 0 };
    tokens.forEach(t => { if (c[t.status] !== undefined) c[t.status] += 1; });
    return c;
  }, [tokens]);

  const currentBarberName = selectedBarber === 'all'
    ? null
    : (barbers.find(b => b.id === selectedBarber)?.name || '');

  const anyWaiting = tokens.some(t => t.status === 'waiting');

  return (
    <div className="qv2">
      {/* -------- Top bar: date mode + view label -------- */}
      <div className="qv2-topbar">
        <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="qv2-dates">
            <button className={dateMode === 'today' ? 'on' : ''} onClick={() => setDateMode('today')}>Today</button>
            <button className={dateMode === 'yesterday' ? 'on' : ''} onClick={() => setDateMode('yesterday')}>Yesterday</button>
            <button className={dateMode === 'range' ? 'on' : ''} onClick={() => setDateMode('range')}>Range</button>
          </div>
          {dateMode === 'range' && (
            <div className="qv2-daterange">
              <input type="date" value={dateFrom || ''} onChange={e => setDateFrom(e.target.value)} />
              <span>→</span>
              <input type="date" value={dateTo || ''} onChange={e => setDateTo(e.target.value)} />
            </div>
          )}
        </div>
        <div className="qv2-viewinfo">
          Viewing bookings for <b>{dateMode === 'range'
            ? `${dateFrom || '—'} → ${dateTo || '—'}`
            : new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
        </div>
      </div>

      {/* -------- Primary actions: Call Next + Add Booking -------- */}
      <div className="qv2-actions">
        <button
          className="qv2-btn primary"
          disabled={!anyWaiting}
          onClick={() => handleCallNext(selectedBarber === 'all' ? null : selectedBarber)}
        >
          <I.chevRight />
          Call Next {currentBarberName ? `· ${currentBarberName}` : ''}
        </button>
        <button
          className="qv2-btn ghost"
          onClick={() => {
            try { window.dispatchEvent(new CustomEvent('salon:open-new-appointment')); } catch (_) { /* ignore */ }
          }}
          data-testid="queue-add-booking-btn"
        >
          <I.plus />
          Add Booking
        </button>
      </div>

      {/* -------- Filters: status + barbers -------- */}
      <div className="qv2-filter">
        <div className="qv2-filter-group">
          {['all', 'waiting', 'called', 'completed', 'skipped', 'cancelled'].map(f => (
            <button key={f} className={`qv2-chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : (STATUS_LABEL[f] || f)}
              {counts[f] > 0 && <span className="qv2-count">{counts[f]}</span>}
            </button>
          ))}
        </div>
        <div className="qv2-barbers">
          <button className={`qv2-barber ${selectedBarber === 'all' ? 'on' : ''}`} onClick={() => setSelectedBarber('all')}>All Barbers</button>
          {barbers.map(b => (
            <button key={b.id} className={`qv2-barber ${selectedBarber === b.id ? 'on' : ''}`} onClick={() => setSelectedBarber(b.id)}>{b.name}</button>
          ))}
        </div>
      </div>

      {/* -------- Token list -------- */}
      <div className="qv2-list">
        {tokens.length === 0 && (
          <div className="qv2-empty">
            <I.clock />
            <h4>No tokens {filter !== 'all' ? `with status "${STATUS_LABEL[filter] || filter}"` : 'yet'}</h4>
            <p>New bookings will show up here in real-time.</p>
          </div>
        )}

        {tokens.map(t => {
          const st = t.status || 'waiting';
          return (
            <div key={t.id} className={`qv2-card st-${st}`}>
              {/* Left: token chip */}
              <div className="qv2-tokenchip">
                <div className="n">{t.token_number || '—'}</div>
                <div className="lb">Token</div>
              </div>

              {/* Middle: info */}
              <div className="qv2-info">
                <div className="name"><I.user /> {t.customer_name || 'Unknown'}</div>
                <div className="row">
                  <I.phone />
                  <a href={`tel:${t.phone}`}>{t.phone}</a>
                </div>
                <div className="row">
                  <span>{t.barber_name || 'Unassigned'}</span>
                  <span className="dot">·</span>
                  <span>{t.shift || t.time_slot || '—'}</span>
                  <span className="dot">·</span>
                  <span className="amt">₹{Number(t.total_amount || 0).toLocaleString('en-IN')}</span>
                  {t.payment_confirmed
                    ? <span className="paid">· ✓ {(t.payment_mode || 'paid').toUpperCase()}</span>
                    : (st !== 'completed' && st !== 'cancelled' &&
                       <span className="unpaid">· ⏳ Unpaid</span>)}
                </div>
                <div className="row">
                  <I.cal />
                  <span>
                    {new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    {' · '}
                    {t.created_at
                      ? new Date(t.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                      : (t.shift || t.time_slot || '—')}
                  </span>
                </div>
              </div>

              {/* Right: status pill + actions */}
              <div className="qv2-right">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {t.phone && (
                    <a
                      className="qv2-actbtn dial"
                      href={`tel:${t.phone}`}
                      onClick={e => e.stopPropagation()}
                      title={`Call ${t.customer_name || 'customer'}`}
                      data-testid={`token-call-customer-${t.id}`}
                    >
                      <I.phone />
                    </a>
                  )}
                  <span className={`qv2-statuspill ${st}`}>
                    <I.check style={{ opacity: st === 'completed' ? 1 : 0 }} />
                    {STATUS_LABEL[st] || st}
                    {t.recall_count > 0 && <span className="qv2-recallcount">({t.recall_count}x)</span>}
                  </span>
                </div>

                <div className="qv2-actrow">
                  {st === 'waiting' && (
                    <>
                      <button className="qv2-actbtn call" onClick={() => handleCallToken(t.id)} title="Call this customer">
                        <I.chevRight /> Call
                      </button>
                      <button className="qv2-actbtn modify" onClick={() => handleOpenAddServices(t)} title="Modify booking">
                        <I.edit /> Modify
                      </button>
                      <button className="qv2-actbtn icon-only" onClick={() => handleSendNotification(t.id)} title="Send notification">
                        <I.bell />
                      </button>
                      <button className="qv2-actbtn skip" onClick={() => handleSkipToken(t.id)} title="Skip">
                        <I.skip />
                      </button>
                      <button className="qv2-actbtn cancel" onClick={() => handleCancelToken(t.id)} title="Cancel">
                        <I.cross />
                      </button>
                    </>
                  )}
                  {st === 'called' && (
                    <>
                      <button className="qv2-actbtn complete" onClick={() => handleCompleteToken(t.id)} title="Complete">
                        <I.check /> Complete
                      </button>
                      <button className="qv2-actbtn modify" onClick={() => handleOpenAddServices(t)} title="Modify">
                        <I.edit /> Modify
                      </button>
                      <button className="qv2-actbtn recall" onClick={() => handleRecallToken(t.id)} title="Re-call">
                        <I.rotate /> Re-call
                      </button>
                      <button className="qv2-actbtn skip" onClick={() => handleSkipToken(t.id)} title="Skip">
                        <I.skip />
                      </button>
                    </>
                  )}
                  {st === 'skipped' && (
                    <>
                      <button className="qv2-actbtn recall" onClick={() => handleRecallToken(t.id)} title="Recall">
                        <I.rotate /> Recall
                      </button>
                      <button className="qv2-actbtn cancel" onClick={() => handleCancelToken(t.id)} title="Cancel">
                        <I.cross /> Cancel
                      </button>
                    </>
                  )}
                  {st === 'completed' && t.invoice_id && (
                    <>
                      <button className="qv2-actbtn invoice" onClick={() => window.open(`${API}/invoices/${t.invoice_id}/view`, '_blank')} title="View invoice">
                        <I.doc /> Invoice
                      </button>
                      <button
                        className="qv2-actbtn download"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = `${API}/invoices/${t.invoice_id}/download`;
                          link.download = `invoice_${t.token_number}.pdf`;
                          link.click();
                        }}
                        title="Download invoice"
                      >
                        <I.download /> PDF
                      </button>
                    </>
                  )}
                  {['cancelled', 'future'].includes(st) && (
                    <span className="qv2-noact">No actions</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
