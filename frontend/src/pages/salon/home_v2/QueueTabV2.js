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
import React, { useEffect, useMemo, useState } from 'react';
import { useServicesEnabled } from '@/lib/salonQueries';
import QueueCalendarView from './QueueCalendarView';
import GuestProfileModal from './GuestProfileModal';

const QV2_CSS = `
.qv2{font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;color:#23252F}
.qv2 *{box-sizing:border-box}
.qv2 .qv2-topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;background:#fff;border:1px solid #ECECF3;border-radius:14px;padding:10px 14px;box-shadow:0 4px 16px rgba(30,32,50,.04);margin-bottom:14px}
.qv2 .qv2-dates{display:inline-flex;background:#F6F6FA;border-radius:10px;padding:3px;gap:2px}
.qv2 .qv2-dates button{border:none;background:transparent;font-family:inherit;font-size:12.5px;font-weight:700;color:#5A5E70;padding:6px 14px;border-radius:8px;cursor:pointer;transition:.18s;letter-spacing:.2px}
.qv2 .qv2-dates button:hover{color:#23252F}
.qv2 .qv2-dates button.on{background:#fff;color:#6C4FE0;box-shadow:0 2px 6px rgba(108,79,224,.15)}
.qv2 .qv2-viewtoggle{background:#EEF0FF}
.qv2 .qv2-viewtoggle button.on{background:#6C4FE0;color:#fff;box-shadow:0 2px 6px rgba(108,79,224,.25)}
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

/* ---- Compact one-line list (Section 4) ---- */
.qv2 .qv2-lines{background:#fff;border:1px solid #ECECF3;border-radius:14px;overflow:hidden;box-shadow:0 3px 12px rgba(30,32,50,.03)}
.qv2 .qv2-lhead,.qv2 .qv2-line{display:grid;grid-template-columns:92px 54px 1.5fr 1.3fr 1fr 96px 84px 150px;gap:10px;align-items:center;padding:10px 14px}
.qv2 .qv2-lhead{background:#FAFAFD;border-bottom:1px solid #ECECF3;font-size:10.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#9298AA}
.qv2 .qv2-line{border-bottom:1px solid #F2F2F7;cursor:pointer;transition:.12s;border-left:3px solid transparent}
.qv2 .qv2-line:last-child{border-bottom:none}
.qv2 .qv2-line:hover{background:#FAF8FF}
.qv2 .qv2-line.st-waiting{border-left-color:#F0AD4E}
.qv2 .qv2-line.st-called{border-left-color:#4A9BFA}
.qv2 .qv2-line.st-completed{border-left-color:#2FA96A}
.qv2 .qv2-line.st-skipped{border-left-color:#E45C86}
.qv2 .qv2-line.st-cancelled{border-left-color:#C3C6D3;opacity:.72}
.qv2 .qv2-line .tk{font-weight:900;color:#6C4FE0;font-size:14px}
.qv2 .qv2-line .nm{font-weight:800;color:#23252F;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qv2 .qv2-line .sub{font-size:11px;color:#7C8092;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qv2 .qv2-line .money{font-weight:800;color:#23252F;font-size:13px;text-align:right}
.qv2 .qv2-line.st-cancelled .nm{text-decoration:line-through}
.qv2 .qv2-lact{display:flex;gap:4px;justify-content:flex-end}
.qv2 .qv2-lact button{border:1px solid #ECECF3;background:#fff;border-radius:8px;padding:5px 8px;font-size:11px;font-weight:800;cursor:pointer;color:#5A5E70;transition:.12s;font-family:inherit}
.qv2 .qv2-lact button:hover{border-color:#DDDFE9;background:#F6F6FA}
.qv2 .qv2-lact button.call{background:#4A9BFA;color:#fff;border-color:transparent}
.qv2 .qv2-lact button.complete{background:#2FA96A;color:#fff;border-color:transparent}
.qv2 .qv2-lact button.cancel{color:#E45C86}
.qv2 .qv2-lact button.rebook{background:#F1EEFF;color:#6C4FE0;border-color:#E7E2FF}
@media (max-width:820px){
  .qv2 .qv2-lhead{display:none}
  .qv2 .qv2-line{grid-template-columns:44px 1fr auto;grid-template-rows:auto auto;row-gap:4px}
  .qv2 .qv2-line .l-staff,.qv2 .qv2-line .l-svc{grid-column:2}
}

/* ---- Detail drawer ---- */
.qv2 .qvd-ov{position:fixed;inset:0;background:rgba(20,20,40,.35);z-index:9070;opacity:0;pointer-events:none;transition:.2s}
.qv2 .qvd-ov.open{opacity:1;pointer-events:auto}
.qv2 .qvd{position:fixed;top:0;right:0;height:100vh;width:420px;max-width:94vw;background:#fff;z-index:9072;box-shadow:-8px 0 30px rgba(20,20,40,.14);transform:translateX(100%);transition:.24s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column}
.qv2 .qvd.open{transform:translateX(0)}
.qv2 .qvd h3{margin:0;font-size:16px;font-weight:900;color:#23252F}
.qv2 .qvd .qvd-h{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #F0F0F5}
.qv2 .qvd .qvd-b{padding:18px 20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:14px}
.qv2 .qvd .qvd-sec{border:1px solid #EEF0F6;border-radius:12px;padding:12px 14px}
.qv2 .qvd .qvd-sec .t{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#6C4FE0;margin-bottom:8px}
.qv2 .qvd .qvd-kv{display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0}
.qv2 .qvd .qvd-kv .k{color:#8A8EA0;font-weight:600}
.qv2 .qvd .qvd-kv .v{color:#23252F;font-weight:700;text-align:right}
.qv2 .qvd .qvd-f{padding:14px 20px;border-top:1px solid #F0F0F5;display:flex;gap:8px;flex-wrap:wrap}
.qv2 .qvd .qvd-f button{flex:1;min-width:110px;border:none;border-radius:10px;padding:10px 12px;font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit}

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
  handleSkipToken, handleCancelToken, handleSendNotification,
  API, navigate, salonId, getAuthHeaders,
}) {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('qv2_view') || 'compact'; } catch (_) { return 'compact'; }
  }); // 'compact' (List, default) | 'list' (Cards) | 'calendar'
  const [detail, setDetail] = useState(null); // token shown in the detail drawer
  const [profilePhone, setProfilePhone] = useState(null); // customer profile modal
  const changeView = (v) => { setView(v); try { localStorage.setItem('qv2_view', v); } catch (_) { /* ignore */ } };

  // Resolve service IDs -> names for the List view (bookings sometimes store ids).
  const [svcMap, setSvcMap] = useState({});
  const _qHeaders = (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {};
  const { data: _svcData } = useServicesEnabled(salonId, { headers: _qHeaders });
  useEffect(() => {
    if (_svcData == null) return;
    const arr = Array.isArray(_svcData) ? _svcData : (_svcData?.services || []);
    const m = {};
    arr.forEach((s) => { if (s.id) m[s.id] = s.service_name || s.name; });
    setSvcMap(m);
  }, [_svcData]);

  // Resizable columns for the List view (salon can drag column edges).
  const COLS = useMemo(() => ([
    { key: 'date', label: 'Date', def: 92, align: 'left' },
    { key: 'customer', label: 'Customer', def: 200, align: 'left' },
    { key: 'services', label: 'Services', def: 220, align: 'left' },
    { key: 'staff', label: 'Staff', def: 130, align: 'left' },
    { key: 'status', label: 'Status', def: 110, align: 'left' },
    { key: 'amount', label: 'Amount', def: 100, align: 'center' },
    { key: 'actions', label: 'Actions', def: 168, align: 'right' },
  ]), []);
  const [colW, setColW] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem('qv2_colw') || '{}'); return (s && typeof s === 'object') ? s : {}; } catch (_) { return {}; }
  });
  const widthOf = (k) => colW[k] || COLS.find((c) => c.key === k)?.def || 120;
  const gridTemplate = COLS.map((c) => `${widthOf(c.key)}px`).join(' ');
  const startResize = (e, key) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startW = widthOf(key);
    const onMove = (ev) => {
      const next = Math.max(60, startW + (ev.clientX - startX));
      setColW((prev) => ({ ...prev, [key]: next }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setColW((prev) => { try { localStorage.setItem('qv2_colw', JSON.stringify(prev)); } catch (_) { /* ignore */ } return prev; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
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
          <div className="qv2-dates qv2-viewtoggle">
            <button className={view === 'list' ? 'on' : ''} onClick={() => changeView('list')}>Cards</button>
            <button className={view === 'compact' ? 'on' : ''} onClick={() => changeView('compact')}>List</button>
            <button className={view === 'calendar' ? 'on' : ''} onClick={() => changeView('calendar')}>Calendar</button>
          </div>
          {view !== 'calendar' && (
            <div className="qv2-dates">
              <button className={dateMode === 'today' ? 'on' : ''} onClick={() => setDateMode('today')}>Today</button>
              <button className={dateMode === 'yesterday' ? 'on' : ''} onClick={() => setDateMode('yesterday')}>Yesterday</button>
              <button className={dateMode === 'range' ? 'on' : ''} onClick={() => setDateMode('range')}>Range</button>
            </div>
          )}
          {view !== 'calendar' && dateMode === 'range' && (
            <div className="qv2-daterange">
              <input type="date" value={dateFrom || ''} onChange={e => setDateFrom(e.target.value)} />
              <span>→</span>
              <input type="date" value={dateTo || ''} onChange={e => setDateTo(e.target.value)} />
            </div>
          )}
        </div>
        {view !== 'calendar' && (
          <div className="qv2-viewinfo">
            Viewing bookings for <b>{dateMode === 'range'
              ? `${dateFrom || '—'} → ${dateTo || '—'}`
              : new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
          </div>
        )}
      </div>

      {view === 'calendar' && (
        <QueueCalendarView
          salonId={salonId}
          getAuthHeaders={getAuthHeaders}
          API={API}
          barbers={barbers}
          handleCallToken={handleCallToken}
          handleCompleteToken={handleCompleteToken}
          handleCancelToken={handleCancelToken}
          handleSendNotification={handleSendNotification}
        />
      )}

      {view === 'compact' && (() => {
        const nameFor = (v) => {
          if (v == null) return '';
          if (typeof v === 'object') {
            return v.name || v.service_name || svcMap[v.id || v.service_id] || v.id || v.service_id || '';
          }
          // string: could be a name or an id — resolve ids via the services map.
          return svcMap[v] || v;
        };
        const svcNames = (t) => {
          const arr = t.selected_services || t.services || [];
          if (Array.isArray(arr) && arr.length) return arr.map(nameFor).filter(Boolean);
          return [];
        };
        const timeOf = (t) => t.created_at
          ? new Date(t.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : (t.shift || t.time_slot || '—');
        const dateOf = (t) => {
          const d = t.date || t.appointment_date || t.created_at;
          try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); }
          catch (_) { return '—'; }
        };
        return (
          <div className="qv2-lines">
            {tokens.length === 0 && (
              <div className="qv2-empty" style={{ border: 'none', boxShadow: 'none' }}>
                <I.clock /><h4>No bookings {filter !== 'all' ? `(${STATUS_LABEL[filter] || filter})` : 'yet'}</h4>
                <p>New bookings will show up here in real-time.</p>
              </div>
            )}
            {tokens.length > 0 && (
              <div className="qv2-lhead" style={{ gridTemplateColumns: gridTemplate }}>
                {COLS.map((c, i) => (
                  <div key={c.key} style={{ position: 'relative', textAlign: c.align }}>
                    {c.label}
                    {i < COLS.length - 1 && (
                      <span
                        onMouseDown={(e) => startResize(e, c.key)}
                        title="Drag to resize column"
                        style={{ position: 'absolute', top: -6, right: -7, height: 24, width: 12, cursor: 'col-resize', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <span style={{ width: 2, height: 14, background: '#D5D2E2', borderRadius: 2 }} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {tokens.map(t => {
              const st = t.status || 'waiting';
              const names = svcNames(t);
              const extra = names.length > 2 ? names.length - 2 : 0;
              return (
                <div key={t.id} className={`qv2-line st-${st}`} style={{ gridTemplateColumns: gridTemplate }} onClick={() => setDetail(t)} data-testid={`queue-line-${t.id}`}>
                  <div className="sub" style={{ fontWeight: 700, color: '#5A5F72' }}>
                    <div>{dateOf(t)}</div>
                    <div style={{ fontWeight: 500, color: '#8A8F9E', fontSize: 11 }}>{timeOf(t)}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm" role="button" tabIndex={0}
                         onClick={(e) => { e.stopPropagation(); if (t.phone) setProfilePhone(t.phone); }}
                         style={{ cursor: t.phone ? 'pointer' : 'default' }}
                         data-testid={`queue-name-${t.id}`} title="View customer profile">
                      {t.customer_name || 'Unknown'}
                    </div>
                    <div className="sub">{t.phone || '—'}{t.token_number ? ` · #${t.token_number}` : ''}</div>
                  </div>
                  <div className="sub l-svc" style={{ lineHeight: 1.3, whiteSpace: 'normal' }} title={names.join(', ')}>
                    {names.length === 0 ? '—' : (
                      <>
                        {names.slice(0, 2).map((n, i) => <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</div>)}
                        {extra > 0 && <div style={{ color: '#6C4FE0', fontWeight: 700 }}>+{extra} more</div>}
                      </>
                    )}
                  </div>
                  <div className="sub l-staff">{t.barber_name || 'Unassigned'}</div>
                  <div><span className={`qv2-statuspill ${st}`}>{STATUS_LABEL[st] || st}</span></div>
                  <div className="money" style={{ textAlign: 'center' }}>₹{Number(t.total_amount || 0).toLocaleString('en-IN')}</div>
                  <div className="qv2-lact" style={{ justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    {st === 'waiting' && <>
                      <button className="call" onClick={() => handleCallToken(t.id)} title="Call / check-in">Call</button>
                      <button onClick={() => window.dispatchEvent(new CustomEvent('salon:open-new-appointment', { detail: { edit: t } }))} title="Modify booking">Modify</button>
                      <button onClick={() => handleSkipToken(t.id)} title="Skip">Skip</button>
                      <button className="cancel" onClick={() => handleCancelToken(t.id)} title="Cancel">✕</button>
                    </>}
                    {st === 'called' && <>
                      <button className="complete" onClick={() => handleCompleteToken(t.id)} title="Complete">Done</button>
                      <button onClick={() => window.dispatchEvent(new CustomEvent('salon:open-new-appointment', { detail: { edit: t } }))} title="Modify booking">Modify</button>
                      <button onClick={() => handleSkipToken(t.id)} title="Skip">Skip</button>
                    </>}
                    {st === 'skipped' && <>
                      <button onClick={() => handleRecallToken(t.id)} title="Recall">Recall</button>
                      <button className="cancel" onClick={() => handleCancelToken(t.id)} title="Cancel">✕</button>
                    </>}
                    {st === 'completed' && (
                      <button className="rebook" data-testid={`queue-invoice-${t.id}`}
                        onClick={() => { if (t.invoice_id) { window.open(`${API}/invoices/${t.invoice_id}/view`, '_blank'); } else { setDetail(t); } }}
                        title="View invoice">Invoice</button>
                    )}
                    {st === 'cancelled' && (
                      <button className="rebook" onClick={() => { try { window.dispatchEvent(new CustomEvent('salon:open-new-appointment', { detail: { rebook: t } })); } catch (_) { /* ignore */ } }} title="Rebook">Rebook</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {view === 'list' && (<React.Fragment>
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
                      <button className="qv2-actbtn modify" onClick={() => window.dispatchEvent(new CustomEvent('salon:open-new-appointment', { detail: { edit: t } }))} title="Modify booking">
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
                      <button className="qv2-actbtn modify" onClick={() => window.dispatchEvent(new CustomEvent('salon:open-new-appointment', { detail: { edit: t } }))} title="Modify">
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
      </React.Fragment>)}

      {/* -------- Detail drawer (Section 4) -------- */}
      <div className={`qvd-ov ${detail ? 'open' : ''}`} onClick={() => setDetail(null)} />
      <aside className={`qvd ${detail ? 'open' : ''}`}>
        {detail && (() => {
          const t = detail; const st = t.status || 'waiting';
          const svc = t.selected_services || t.services || [];
          const asgs = Array.isArray(t.service_assignments) ? t.service_assignments : [];
          const barberNm = (id) => (barbers.find(b => b.id === id)?.name) || 'Staff';
          const svcLines = (Array.isArray(svc) ? svc : []).map((s) => {
            const id = typeof s === 'string' ? s : (s.service_id || s.id);
            const nm = (typeof s === 'string' ? '' : (s.name || s.service_name)) || svcMap[id] || 'Service';
            const a = asgs.find(x => x.service_id === id);
            let barberLabel = t.barber_name || 'Unassigned';
            let multi = false;
            if (a) {
              if (Array.isArray(a.barber_allocations) && a.barber_allocations.length) {
                barberLabel = a.barber_allocations.map(al => `${barberNm(al.barber_id)} (${al.pct}%)`).join(' · ');
                multi = a.barber_allocations.length > 1;
              } else {
                barberLabel = a.barber_name_snapshot || barberNm(a.barber_id);
              }
            }
            return { id, nm, barberLabel, multi, disc: a?.discount_percent, price: a?.service_price };
          });
          const orderDiscPct = Number(t.order_discount_percent || 0);
          const orderDiscAmt = Number(t.order_discount_amount || 0);
          const kv = (k, v) => (<div className="qvd-kv"><span className="k">{k}</span><span className="v">{v || '—'}</span></div>);
          return (
            <>
              <div className="qvd-h">
                <div>
                  <h3>{t.customer_name || 'Unknown'}</h3>
                  <div style={{ fontSize: 12, color: '#7C8092', fontWeight: 600, marginTop: 4 }}>Token #{t.token_number} · <span className={`qv2-statuspill ${st}`} style={{ verticalAlign: 'middle' }}>{STATUS_LABEL[st] || st}</span></div>
                </div>
                <button className="shv2-profile__close" onClick={() => setDetail(null)} aria-label="Close" style={{ background: '#F4F5F9', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              <div className="qvd-b">
                <div className="qvd-sec">
                  <div className="t">Customer</div>
                  {kv('Name', t.customer_name)}
                  {kv('Phone', t.phone && <a href={`tel:${t.phone}`} style={{ color: '#6C4FE0', textDecoration: 'none' }}>{t.phone}</a>)}
                  {t.phone && kv('WhatsApp', <a href={`https://wa.me/91${String(t.phone).replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noreferrer" style={{ color: '#0E9C82', textDecoration: 'none' }}>Open chat</a>)}
                </div>
                <div className="qvd-sec">
                  <div className="t">Booking</div>
                  {kv('Date', new Date(t.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }))}
                  {kv('Time', t.created_at ? new Date(t.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : (t.shift || t.time_slot || '—'))}
                  {(!asgs.length) && kv('Staff', t.barber_name || 'Unassigned')}
                </div>
                <div className="qvd-sec">
                  <div className="t">Services &amp; stylists</div>
                  {svcLines.length === 0 ? kv('Services', t.services_count ? `${t.services_count} service(s)` : '—') : (
                    svcLines.map((l, i) => (
                      <div key={l.id || i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: i < svcLines.length - 1 ? '1px solid #F0F0F6' : 'none' }} data-testid={`qvd-svc-${i}`}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#2A2E3D' }}>{l.nm}</div>
                          <div style={{ fontSize: 11.5, color: '#7C8092', marginTop: 2 }}>
                            {l.multi ? '👥 ' : ''}{l.barberLabel}
                            {l.disc ? <span style={{ color: '#2FA96A', fontWeight: 700 }}> · {l.disc}% off</span> : null}
                          </div>
                        </div>
                        {l.price != null && <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>₹{Number(l.price).toLocaleString('en-IN')}</div>}
                      </div>
                    ))
                  )}
                </div>
                <div className="qvd-sec">
                  <div className="t">Payment</div>
                  {t.subtotal != null && kv('Subtotal', `₹${Number(t.subtotal).toLocaleString('en-IN')}`)}
                  {orderDiscPct > 0 && kv('Discount', `${orderDiscPct}%`)}
                  {orderDiscAmt > 0 && kv('Discount (flat)', `₹${orderDiscAmt.toLocaleString('en-IN')}`)}
                  {Number(t.membership_discount_percent || 0) > 0 && kv('Membership discount', `${t.membership_discount_percent}%`)}
                  {Number(t.tip_amount || 0) > 0 && kv('Tip', `₹${Number(t.tip_amount).toLocaleString('en-IN')}`)}
                  {kv('Total', `₹${Number(t.total_amount || 0).toLocaleString('en-IN')}`)}
                  {kv('Mode', (t.payment_mode || '—').toUpperCase())}
                  {kv('Status', t.payment_confirmed ? 'Paid' : 'Unpaid')}
                  {t.recall_count > 0 && kv('Re-calls', `${t.recall_count}×`)}
                </div>
              </div>
              <div className="qvd-f">
                {st === 'waiting' && <button style={{ background: '#4A9BFA', color: '#fff' }} onClick={() => { handleCallToken(t.id); setDetail(null); }}>Call</button>}
                {st === 'called' && <button style={{ background: '#2FA96A', color: '#fff' }} onClick={() => { handleCompleteToken(t.id); setDetail(null); }}>Complete</button>}
                {(st === 'waiting' || st === 'called') && <button style={{ background: '#F1EEFF', color: '#6C4FE0' }} onClick={() => { window.dispatchEvent(new CustomEvent('salon:open-new-appointment', { detail: { edit: t } })); setDetail(null); }}>Modify</button>}
                {t.invoice_id && <button style={{ background: '#E4F6ED', color: '#1F8F52' }} onClick={() => window.open(`${API}/invoices/${t.invoice_id}/view`, '_blank')}>Invoice</button>}
                {(st === 'completed' || st === 'cancelled' || st === 'skipped') && <button style={{ background: '#F1EEFF', color: '#6C4FE0' }} onClick={() => { try { window.dispatchEvent(new CustomEvent('salon:open-new-appointment', { detail: { rebook: t } })); } catch (_) { /* ignore */ } setDetail(null); }}>Rebook</button>}
                {(st === 'waiting' || st === 'called' || st === 'skipped') && <button style={{ background: '#fff', color: '#E45C86', border: '1px solid #F5C0D0' }} onClick={() => { handleCancelToken(t.id); setDetail(null); }}>Cancel</button>}
              </div>
            </>
          );
        })()}
      </aside>

      {/* Customer profile modal — opens when a customer name is tapped */}
      <GuestProfileModal
        open={!!profilePhone}
        onClose={() => setProfilePhone(null)}
        phone={profilePhone}
        salonId={salonId}
        getAuthHeaders={getAuthHeaders}
      />
    </div>
  );
}
