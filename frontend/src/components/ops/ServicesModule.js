/**
 * ServicesModule — Service & Package configuration (redesign 2026).
 *
 * Two-pane layout: a category-grouped list (collapsible, favourite-sorted,
 * per-row enable switch + bulk select) and an INLINE editor (no add-drawer).
 * Services and Packages are separate sections chosen by the top tab.
 *
 * Backed by the existing service API plus the new classification / ops-settings
 * endpoints. Tier × length price matrices persist to `axes` + `price_matrix`;
 * packages persist to `package_items` (service + day-offset + price) +
 * `package_price`.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const isPkg = (s) => (s.category || '') === 'Packages';
/* Flat price-matrix key so the editor + booking page agree. */
const matKey = (tier, length, axes) => {
  const t = (axes || []).includes('tier');
  const l = (axes || []).includes('length');
  if (t && l) return `${tier}__${length}`;
  if (t) return `${tier}`;
  if (l) return `${length}`;
  return 'flat';
};

/* ---------------- injected styles (scoped to .svc2) ---------------- */
let _cssDone = false;
function injectCss() {
  if (_cssDone || typeof document === 'undefined') return;
  _cssDone = true;
  const css = `
.svc2{--p:#6C4FE0;--p6:#5B3FD1;--p05:#F1EEFF;--p1:#E7E2FF;--p2:#D6CBFF;--bg:#F6F6FB;--sf:#fff;--sf2:#FBFBFE;--ink:#23252F;--inks:#3C3F4E;--mut:#7C8092;--mut2:#9A9EAE;--line:#E3E3EC;--lines:#CBD0DE;--ok:#2FA96A;--bad:#E45C86;--badbg:#FCEAF1;--gold:#C9992B;--goldbg:#FBF3DF;font-family:'Inter',system-ui,sans-serif;color:var(--ink);font-size:13px;display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;padding:14px 4px 30px}
.svc2 *{box-sizing:border-box}
.svc2 button{font-family:inherit;cursor:pointer}
.svc2 .num{font-variant-numeric:tabular-nums}
.svc2 .phead{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px;padding:0 6px}
.svc2 .phead h2{font-size:22px;font-weight:800;letter-spacing:-.5px;display:flex;align-items:center;gap:10px;color:var(--ink);margin:0}
.svc2 .phead .hic{width:34px;height:34px;border-radius:10px;background:var(--p05);color:var(--p);display:grid;place-items:center;flex:none}
.svc2 .phead .hic svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2}
.svc2 .phead .psub{font-size:12.5px;color:var(--mut);font-weight:600;margin-top:2px}
.svc2 .main{display:grid;grid-template-columns:290px 1fr;min-height:0;flex:1;border:1.5px solid var(--line);border-radius:14px;overflow:hidden;background:var(--sf)}
.svc2 .listcol{border-right:1.5px solid var(--line);background:var(--sf);display:flex;flex-direction:column;min-height:0}
.svc2 .typetabs{display:flex;gap:4px;padding:8px 8px 0}
.svc2 .typetabs button{flex:1;padding:7px;border:1.5px solid var(--line);background:var(--sf2);border-radius:8px 8px 0 0;font-weight:800;font-size:11.5px;color:var(--mut);border-bottom:0}
.svc2 .typetabs button.on{background:var(--p);color:#fff;border-color:var(--p)}
.svc2 .toolbar{display:flex;align-items:center;gap:5px;padding:8px;border-bottom:1.5px solid var(--line)}
.svc2 .toolbar .search{flex:1;min-width:0;border:1.5px solid var(--lines);border-radius:8px;padding:6px 9px;font-family:inherit;font-size:12px}
.svc2 .tbtn{width:32px;height:32px;border-radius:8px;border:1.5px solid var(--lines);background:var(--sf);color:var(--inks);display:grid;place-items:center;flex:none}
.svc2 .tbtn svg{width:15px;height:15px}
.svc2 .tbtn:hover{border-color:var(--p2);color:var(--p);background:var(--p05)}
.svc2 .tbtn.pri{background:var(--p);border-color:var(--p);color:#fff}
.svc2 .listscroll{overflow:auto;flex:1;min-height:0;padding:6px}
.svc2 .selbar{display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:4px;background:var(--p05);border:1.5px solid var(--p2);border-radius:8px;font-size:11.5px;font-weight:700;color:var(--p6)}
.svc2 .selbar .del{margin-left:auto;color:var(--bad);background:transparent;border:0;font-weight:800;display:inline-flex;align-items:center;gap:4px}
.svc2 .selbar .del svg{width:13px;height:13px}
.svc2 .catblock{margin-bottom:4px}
.svc2 .cathead{display:flex;align-items:center;gap:7px;padding:6px 7px;border-radius:8px;cursor:pointer}
.svc2 .cathead:hover{background:var(--sf2)}
.svc2 .cathead .chev{width:13px;height:13px;color:var(--mut);transition:.15s;flex:none}
.svc2 .cathead.open .chev{transform:rotate(90deg)}
.svc2 .cathead .thumb{width:24px;height:24px;border-radius:6px;background:var(--p05);flex:none;display:grid;place-items:center;color:var(--p);overflow:hidden;font-weight:800;font-size:11px}
.svc2 .cathead .thumb img{width:100%;height:100%;object-fit:cover}
.svc2 .cathead .cn{font-weight:800;font-size:12.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.svc2 .cathead .cc{font-size:10px;font-weight:800;color:var(--mut);background:var(--sf2);border:1px solid var(--line);border-radius:20px;padding:1px 7px}
.svc2 .cathead .catdel{opacity:0;color:var(--mut);background:transparent;border:0;padding:2px}
.svc2 .cathead:hover .catdel{opacity:1}
.svc2 .cathead .catdel:hover{color:var(--bad)}
.svc2 .cathead .catdel svg{width:13px;height:13px}
.svc2 .srow{display:flex;align-items:center;gap:8px;padding:7px 8px 7px 26px;border-radius:8px;cursor:pointer;margin-bottom:1px}
.svc2 .srow:hover{background:var(--sf2)}
.svc2 .srow.sel{background:var(--p);color:#fff}
.svc2 .srow.off{opacity:.5}
.svc2 .srow .chk{width:15px;height:15px;flex:none;accent-color:var(--p)}
.svc2 .srow .star{background:transparent;border:0;padding:0;color:var(--mut2);flex:none;line-height:0}
.svc2 .srow .star svg{width:15px;height:15px}
.svc2 .srow .star.on{color:var(--gold)}
.svc2 .srow.sel .star.on{color:#FFD873}
.svc2 .srow.sel .star{color:rgba(255,255,255,.6)}
.svc2 .srow .sn{flex:1;font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.svc2 .srow .mxi{color:var(--p);flex:none;display:inline-flex}
.svc2 .srow.sel .mxi{color:#fff}
.svc2 .srow .mxi svg{width:12px;height:12px}
.svc2 .msw{position:relative;width:28px;height:16px;flex:none}
.svc2 .msw input{opacity:0;width:0;height:0}
.svc2 .msl{position:absolute;inset:0;background:var(--lines);border-radius:20px;transition:.15s}
.svc2 .msl:before{content:"";position:absolute;width:12px;height:12px;left:2px;top:2px;background:#fff;border-radius:50%;transition:.15s}
.svc2 .msw input:checked+.msl{background:var(--ok)}
.svc2 .msw input:checked+.msl:before{transform:translateX(12px)}
.svc2 .srow.sel .msl{background:rgba(255,255,255,.35)}
.svc2 .srow.sel .msw input:checked+.msl{background:#fff}
.svc2 .srow.sel .msw input:checked+.msl:before{background:var(--p)}
.svc2 .emptylist{padding:20px;color:var(--mut);font-size:12px}
.svc2 .editcol{overflow:auto;min-height:0;padding:14px 18px 40px;background:var(--bg)}
.svc2 .ehead{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.svc2 .ehead input.title{flex:1;border:1.5px solid transparent;border-radius:8px;padding:6px 8px;font-size:16px;font-weight:800;font-family:inherit;background:transparent;min-width:0}
.svc2 .ehead input.title:hover{background:var(--sf2)}
.svc2 .ehead input.title:focus{outline:none;border-color:var(--p);background:#fff}
.svc2 .ehead .badge{font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:6px;background:var(--p05);color:var(--p);text-transform:uppercase;letter-spacing:.05em;flex:none}
.svc2 .ehead .badge.pkg{background:var(--goldbg);color:var(--gold)}
.svc2 .ehead .fav{width:34px;height:34px;border-radius:9px;border:1.5px solid var(--lines);background:var(--sf);color:var(--mut2);display:grid;place-items:center;flex:none}
.svc2 .ehead .fav.on{color:var(--gold);border-color:var(--gold);background:var(--goldbg)}
.svc2 .ehead .fav svg{width:17px;height:17px}
.svc2 .ehead .en{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;color:var(--inks);flex:none}
.svc2 .fcard{background:var(--sf);border:1.5px solid var(--line);border-radius:12px;padding:11px 12px;margin-bottom:10px}
.svc2 .fcard>.cl{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:8px;display:flex;align-items:center;gap:6px}
.svc2 .fcard>.cl svg{width:13px;height:13px;color:var(--p)}
.svc2 .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.svc2 .f label{display:block;font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--mut2);margin-bottom:3px}
.svc2 .f input,.svc2 .f select,.svc2 .f textarea{width:100%;border:1.5px solid var(--lines);border-radius:8px;padding:7px 9px;font-family:inherit;font-size:13px;background:var(--sf2)}
.svc2 .f textarea{resize:vertical;min-height:60px}
.svc2 .f input:focus,.svc2 .f select:focus,.svc2 .f textarea:focus{outline:none;border-color:var(--p);background:#fff;box-shadow:0 0 0 3px var(--p05)}
.svc2 .segtog{display:inline-flex;border:1.5px solid var(--lines);border-radius:9px;overflow:hidden;width:100%}
.svc2 .segtog button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:7px 9px;border:0;border-right:1.5px solid var(--line);background:var(--sf);color:var(--mut);font-weight:700;font-size:12px}
.svc2 .segtog button:last-child{border-right:0}
.svc2 .segtog button.on{background:var(--p);color:#fff}
.svc2 .segtog.pink button.on{background:var(--bad)}
.svc2 .axisbar{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.svc2 .axistog{display:flex;align-items:center;gap:8px}
.svc2 .sw{position:relative;width:33px;height:18px;flex:none}
.svc2 .sw input{opacity:0;width:0;height:0}
.svc2 .sl{position:absolute;inset:0;background:var(--lines);border-radius:20px;transition:.15s}
.svc2 .sl:before{content:"";position:absolute;width:14px;height:14px;left:2px;top:2px;background:#fff;border-radius:50%;transition:.15s}
.svc2 .sw input:checked+.sl{background:var(--p)}
.svc2 .sw input:checked+.sl:before{transform:translateX(15px)}
.svc2 .axistog .t{font-weight:700;font-size:12.5px;color:var(--inks)}
.svc2 table.mx{border-collapse:separate;border-spacing:0;width:100%;font-size:12px;margin-top:10px}
.svc2 table.mx th,.svc2 table.mx td{border:1.5px solid var(--line);padding:0}
.svc2 table.mx th{background:var(--sf2);font-size:9.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--inks);padding:7px 8px;text-align:center}
.svc2 table.mx th.rowh{text-align:left;color:var(--p6)}
.svc2 table.mx td input{width:100%;border:0;background:transparent;padding:9px 8px;font-family:inherit;font-size:13px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums}
.svc2 table.mx td input:focus{outline:none;background:var(--p05)}
.svc2 .flatprice{display:flex;align-items:center;gap:8px;margin-top:10px}
.svc2 .flatprice .cur{font-size:20px;font-weight:800}
.svc2 .flatprice input{width:150px;border:1.5px solid var(--lines);border-radius:8px;padding:8px 10px;font-family:inherit;font-size:15px;font-weight:700}
.svc2 .thumbrow{display:flex;gap:10px;align-items:flex-start}
.svc2 .thumbbox{width:64px;height:64px;border-radius:10px;border:1.5px dashed var(--lines);display:grid;place-items:center;color:var(--mut2);flex:none;background:var(--sf2);cursor:pointer;overflow:hidden}
.svc2 .thumbbox:hover{border-color:var(--p);color:var(--p)}
.svc2 .thumbbox svg{width:20px;height:20px}
.svc2 .thumbbox img{width:100%;height:100%;object-fit:cover}
.svc2 .thumbside{flex:1;min-width:0}
.svc2 .orsplit{display:flex;align-items:center;gap:8px;margin:6px 0;color:var(--mut2);font-size:10px;font-weight:800}
.svc2 .orsplit:before,.svc2 .orsplit:after{content:"";height:1px;background:var(--line);flex:1}
.svc2 .pkgitem{display:flex;align-items:center;gap:9px;padding:8px 9px;border:1.5px solid var(--line);border-radius:9px;margin-bottom:6px;background:var(--sf)}
.svc2 .pkgitem .seq{width:22px;height:22px;border-radius:50%;background:var(--p05);color:var(--p);display:grid;place-items:center;font-weight:800;font-size:11px;flex:none}
.svc2 .pkgitem .pn{flex:1;min-width:0}
.svc2 .pkgitem .pn select{width:100%;border:1.5px solid var(--lines);border-radius:7px;padding:5px 7px;font-family:inherit;font-size:12.5px;font-weight:700}
.svc2 .pkgitem .day{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:var(--mut)}
.svc2 .pkgitem .day input{width:48px;border:1.5px solid var(--lines);border-radius:7px;padding:4px 6px;font-family:inherit;font-size:12px;text-align:center}
.svc2 .pkgitem .price input{width:78px;border:1.5px solid var(--lines);border-radius:7px;padding:5px 7px;font-family:inherit;font-size:12px;text-align:right}
.svc2 .pkgitem .x{color:var(--mut);background:transparent;border:0;padding:2px}
.svc2 .pkgitem .x:hover{color:var(--bad)}
.svc2 .pkgitem .x svg{width:14px;height:14px}
.svc2 .addsvc{width:100%;padding:9px;border:1.5px dashed var(--p2);background:var(--p05);color:var(--p);border-radius:9px;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:2px}
.svc2 .addsvc svg{width:14px;height:14px}
.svc2 .pkgsum{display:flex;justify-content:space-between;align-items:center;padding:9px 2px 2px;font-weight:800;font-size:13px;border-top:1.5px dashed var(--line);margin-top:8px}
.svc2 .pkgsum .strike{color:var(--mut);font-weight:600;text-decoration:line-through;margin-right:8px}
.svc2 .pkgsum input{width:110px;border:1.5px solid var(--lines);border-radius:8px;padding:6px 8px;font-family:inherit;font-size:14px;font-weight:800;text-align:right}
.svc2 details.adv{border:1.5px dashed var(--lines);border-radius:12px;margin-bottom:10px}
.svc2 details.adv summary{list-style:none;padding:9px 12px;font-weight:800;font-size:12px;color:var(--inks);cursor:pointer;display:flex;align-items:center;gap:7px}
.svc2 details.adv summary::-webkit-details-marker{display:none}
.svc2 details.adv summary svg{width:14px;height:14px;transition:.15s}
.svc2 details.adv[open] summary svg{transform:rotate(90deg)}
.svc2 details.adv .in{padding:0 12px 12px}
.svc2 .savebar{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.svc2 .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:9px;font-weight:700;font-size:12.5px;border:1.5px solid transparent}
.svc2 .btn svg{width:15px;height:15px}
.svc2 .btn--pri{background:var(--p);color:#fff}
.svc2 .btn--ghost{background:var(--sf);color:var(--inks);border-color:var(--lines)}
.svc2 .btn--danger{background:var(--badbg);color:var(--bad)}
.svc2 .editempty{color:var(--mut);padding:60px 20px;text-align:center}
/* drawers */
.svc2-scrim{position:fixed;inset:0;background:rgba(30,32,50,.34);z-index:9998;opacity:0;pointer-events:none;transition:.2s}
.svc2-scrim.show{opacity:1;pointer-events:auto}
.svc2-dr{position:fixed;top:0;right:0;height:100%;width:440px;max-width:94vw;background:#fff;box-shadow:0 12px 44px rgba(30,32,50,.18);z-index:9999;transform:translateX(100%);transition:.24s;display:flex;flex-direction:column;font-family:'Inter',system-ui,sans-serif;color:#23252F;font-size:13px}
.svc2-dr.open{transform:none}
.svc2-dr *{box-sizing:border-box}
.svc2-dr .drh{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1.5px solid #E3E3EC;flex:none}
.svc2-dr .drh h3{margin:0;font-size:15px;font-weight:800;flex:1}
.svc2-dr .drh .close{width:32px;height:32px;border-radius:8px;border:1.5px solid #CBD0DE;background:#fff;color:#3C3F4E;display:grid;place-items:center}
.svc2-dr .drh .close svg{width:16px;height:16px}
.svc2-dr .drbody{overflow:auto;padding:14px 16px;flex:1}
.svc2-dr .clstabs{display:flex;gap:4px;margin-bottom:12px;border:1.5px solid #E3E3EC;border-radius:9px;padding:3px;background:#FBFBFE}
.svc2-dr .clstabs button{flex:1;padding:7px;border:0;background:transparent;border-radius:7px;font-weight:800;font-size:11.5px;color:#7C8092}
.svc2-dr .clstabs button.on{background:#6C4FE0;color:#fff}
.svc2-dr .clsrow{display:flex;align-items:center;gap:10px;padding:9px 10px;border:1.5px solid #E3E3EC;border-radius:10px;margin-bottom:7px;background:#fff}
.svc2-dr .clsrow .th{width:40px;height:40px;border-radius:9px;background:#F1EEFF;color:#6C4FE0;display:grid;place-items:center;flex:none;cursor:pointer;border:1.5px dashed transparent;overflow:hidden}
.svc2-dr .clsrow .th img{width:100%;height:100%;object-fit:cover}
.svc2-dr .clsrow .th svg{width:16px;height:16px}
.svc2-dr .clsrow .cinput{flex:1;min-width:0;border:1.5px solid #CBD0DE;border-radius:8px;padding:7px 9px;font-family:inherit;font-size:13px;font-weight:600}
.svc2-dr .clsrow .x{color:#7C8092;background:transparent;border:0;padding:2px}
.svc2-dr .clsrow .x svg{width:15px;height:15px}
.svc2-dr .addcls{width:100%;padding:9px;border:1.5px dashed #D6CBFF;background:#F1EEFF;color:#6C4FE0;border-radius:9px;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px}
.svc2-dr .addcls svg{width:14px;height:14px}
.svc2-dr .clsnote{font-size:10.5px;color:#7C8092;margin:2px 0 10px;display:flex;gap:6px}
.svc2-dr .clsnote svg{width:14px;height:14px;color:#6C4FE0;flex:none}
.svc2-dr .setrow{display:flex;align-items:center;gap:10px;padding:12px;border:1.5px solid #E3E3EC;border-radius:10px;margin-bottom:10px}
.svc2-dr .setrow .info{flex:1}
.svc2-dr .setrow .info .st{font-weight:800;font-size:13px}
.svc2-dr .setrow .info .sd{font-size:11.5px;color:#7C8092;margin-top:2px}
.svc2-dr .msgprev{background:#FDF3E4;border:1.5px solid #F0D9AE;border-radius:10px;padding:11px 12px;font-size:12px;color:#8A5A12;display:flex;gap:8px}
.svc2-dr .msgprev svg{width:15px;height:15px;flex:none;margin-top:1px}
.svc2-dr .drop{border:1.5px dashed #CBD0DE;border-radius:12px;padding:26px;text-align:center;color:#7C8092;background:#FBFBFE;margin-bottom:12px;cursor:pointer}
.svc2-dr .drop svg{width:26px;height:26px;color:#6C4FE0;margin-bottom:6px}
.svc2-dr .drop b{color:#23252F}
.svc2-dr .btnfull{width:100%;justify-content:center;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:9px;font-weight:700;font-size:12.5px;border:1.5px solid #CBD0DE;background:#fff;color:#3C3F4E;margin-bottom:14px}
.svc2-dr .btnfull svg{width:15px;height:15px}
.svc2-dr .steps{font-size:12px;color:#3C3F4E;padding-left:18px}
.svc2-dr .steps li{margin-bottom:6px}
.svc2-dr .codepill{font-family:ui-monospace,monospace;font-size:11px;background:#FBFBFE;border:1px solid #E3E3EC;border-radius:5px;padding:1px 5px}
`;
  const el = document.createElement('style');
  el.id = 'svc2-css';
  el.textContent = css;
  document.head.appendChild(el);
}

/* tiny inline icon set */
const I = {
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>,
  list: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/></svg>,
  upload: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15V3M8 7l4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>,
  eye: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>,
  chev: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg>,
  star: (fill) => <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 17l-4.9 2.6.9-5.5-4-3.9L9.5 8z"/></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  box: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8l9-5 9 5-9 5-9-5zM3 8v8l9 5 9-5V8"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  save: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7"/></svg>,
  img: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>,
};

const fileToDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});

export default function ServicesModule({ salonId, getAuthHeaders }) {
  useEffect(injectCss, []);
  const authRef = useRef(getAuthHeaders);
  useEffect(() => { authRef.current = getAuthHeaders; }, [getAuthHeaders]);
  const H = useCallback(() => ({ headers: authRef.current() }), []);

  const [services, setServices] = useState([]);
  const [cls, setCls] = useState({ tiers: ['Basic', 'Standard', 'Premium', 'Ultra'], lengths: ['Short', 'Medium', 'Long', 'XL'], categories: [], package_categories: [] });
  const [ops, setOps] = useState({ show_online_prices: true });
  const [curType, setCurType] = useState('Service'); // Service | Package
  const [sel, setSel] = useState(null);
  const [openCats, setOpenCats] = useState({});
  const [checked, setChecked] = useState(() => new Set());
  const [search, setSearch] = useState('');

  const [classOpen, setClassOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);

  const load = useCallback(async () => {
    if (!salonId) return;
    try {
      const [svc, clr, opr] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/services/all`, H()),
        axios.get(`${API}/salons/${salonId}/classification`).catch(() => ({ data: {} })),
        axios.get(`${API}/salons/${salonId}/ops-settings`).catch(() => ({ data: {} })),
      ]);
      const raw = svc.data;
      const list = Array.isArray(raw) ? raw : (raw?.services || raw?.data || []);
      setServices(list.filter((s) => s.is_active !== false));
      if (clr.data && (clr.data.tiers || clr.data.lengths)) setCls((c) => ({ ...c, ...clr.data }));
      if (opr.data) setOps((o) => ({ ...o, ...opr.data }));
    } catch (e) {
      console.error('load services', e);
      toast.error('Failed to load services');
    }
  }, [salonId, H]);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(
    () => services.filter((s) => (curType === 'Package' ? isPkg(s) : !isPkg(s))),
    [services, curType],
  );
  const groupKey = useCallback(
    (s) => (curType === 'Package' ? (s.sub_category || 'General') : (s.category || 'General')),
    [curType],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => (s.service_name || '').toLowerCase().includes(q) || (groupKey(s) || '').toLowerCase().includes(q));
  }, [items, search, groupKey]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((s) => {
      const k = groupKey(s);
      (g[k] = g[k] || []).push(s);
    });
    Object.values(g).forEach((rows) => rows.sort((a, b) => ((b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0)) || (a.service_name || '').localeCompare(b.service_name || '')));
    return g;
  }, [filtered, groupKey]);

  const catThumb = useCallback((name) => {
    const c = (cls.categories || []).find((x) => x.name === name);
    return c && c.thumbnail_url ? c.thumbnail_url : null;
  }, [cls.categories]);

  /* ------------- row actions ------------- */
  const toggleFav = async (s) => {
    setServices((prev) => prev.map((x) => x.id === s.id ? { ...x, is_favorite: !x.is_favorite } : x));
    try { await axios.put(`${API}/services/${s.id}/favorite?is_favorite=${!s.is_favorite}`, null, H()); }
    catch { toast.error('Could not update favourite'); load(); }
  };
  const toggleEnabled = async (s) => {
    const next = !(s.is_enabled !== false);
    setServices((prev) => prev.map((x) => x.id === s.id ? { ...x, is_enabled: next } : x));
    try { await axios.put(`${API}/salons/${salonId}/services/${s.id}/toggle?is_enabled=${next}`, null, H()); }
    catch { toast.error('Could not toggle'); load(); }
  };
  const delOne = async (id) => {
    try { await axios.delete(`${API}/services/${id}`, H()); toast.success('Deleted'); if (sel === id) setSel(null); load(); }
    catch { toast.error('Delete failed'); }
  };
  const delCategory = async (catName) => {
    const ids = items.filter((s) => groupKey(s) === catName).map((s) => s.id);
    if (!ids.length) return;
    if (!window.confirm(`Delete the entire "${catName}" group and its ${ids.length} ${curType.toLowerCase()}(s)?`)) return;
    try {
      await axios.post(`${API}/salons/${salonId}/services/bulk-delete`, { service_ids: ids }, H());
      toast.success('Group deleted'); load();
    } catch { toast.error('Delete failed'); }
  };
  const bulkDelete = async () => {
    if (!checked.size) return;
    if (!window.confirm(`Delete ${checked.size} selected ${curType.toLowerCase()}(s)?`)) return;
    try {
      await axios.post(`${API}/salons/${salonId}/services/bulk-delete`, { service_ids: [...checked] }, H());
      toast.success('Deleted'); setChecked(new Set()); load();
    } catch { toast.error('Bulk delete failed'); }
  };
  const toggleCheck = (id) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const newRecord = () => {
    if (curType === 'Package') {
      setSel({ __new: true, category: 'Packages', service_name: 'New package', sub_category: (cls.package_categories || [])[0] || 'General', gender_tag: 'Unisex', available_at_home: true, is_favorite: false, is_enabled: true, price_type: 'onwards', description: '', package_items: [], package_price: 0, thumbnail_url: '' });
    } else {
      const firstCat = (cls.categories || [])[0]?.name || [...new Set(items.map((s) => s.category))][0] || 'General';
      setSel({ __new: true, category: firstCat, service_name: 'New service', gender_tag: 'Unisex', default_duration: 30, base_price: 0, price_type: 'fixed', axes: [], price_matrix: {}, is_favorite: false, is_enabled: true, available_at_home: false, description: '', thumbnail_url: '', gst_rate: null, hsn_code: '' });
    }
  };

  const selService = useMemo(() => {
    if (!sel) return null;
    if (typeof sel === 'object') return sel;
    return services.find((s) => s.id === sel) || null;
  }, [sel, services]);

  return (
    <div className="svc2">
      <div className="phead">
        <div>
          <h2>
            <span className="hic">
              <svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.66 5.66l1.06 1.06L4 19.14 4.86 20l6.12-6.12 1.06 1.06a4 4 0 0 0 5.66-5.66"/><circle cx="8" cy="8" r="2.2"/></svg>
            </span>
            Services &amp; Packages
          </h2>
          <div className="psub">Manage your service menu, packages, prices and classifications.</div>
        </div>
      </div>
      <div className="main">
        {/* -------- LIST -------- */}
        <div className="listcol">
          <div className="typetabs">
            {['Service', 'Package'].map((t) => (
              <button key={t} className={curType === t ? 'on' : ''} onClick={() => { setCurType(t); setSel(null); setChecked(new Set()); }} data-testid={`svc-type-${t}`}>
                {t}s
              </button>
            ))}
          </div>
          <div className="toolbar">
            <input className="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="svc-search" />
            <button className="tbtn pri" title="New" onClick={newRecord} data-testid="svc-new">{I.plus}</button>
            <button className="tbtn" title="Manage classification" onClick={() => setClassOpen(true)} data-testid="svc-classify">{I.list}</button>
            <button className="tbtn" title="Bulk upload / template" onClick={() => setUploadOpen(true)}>{I.upload}</button>
            <button className="tbtn" title="Online price visibility" onClick={() => setOnlineOpen(true)}>{I.eye}</button>
          </div>
          <div className="listscroll">
            {checked.size > 0 && (
              <div className="selbar">
                <span>{checked.size} selected</span>
                <button className="del" onClick={bulkDelete} data-testid="svc-bulk-del">{I.trash}Delete selected</button>
              </div>
            )}
            {Object.keys(grouped).length === 0 && (
              <div className="emptylist">No {curType.toLowerCase()}s yet. Press + to add one.</div>
            )}
            {Object.keys(grouped).sort().map((cat) => {
              const rows = grouped[cat];
              const open = openCats[cat] !== false;
              const thumb = catThumb(cat);
              return (
                <div className="catblock" key={cat}>
                  <div className={`cathead ${open ? 'open' : ''}`} onClick={(e) => { if (e.target.closest('[data-catdel]')) return; setOpenCats((o) => ({ ...o, [cat]: !open })); }}>
                    <span className="chev">{I.chev}</span>
                    <span className="thumb">{thumb ? <img src={thumb} alt="" /> : (cat[0] || '?').toUpperCase()}</span>
                    <span className="cn">{cat}</span>
                    <span className="cc">{rows.length}</span>
                    <button className="catdel" data-catdel title="Delete group" onClick={() => delCategory(cat)}>{I.trash}</button>
                  </div>
                  {open && rows.map((s) => {
                    const enabled = s.is_enabled !== false;
                    const on = selService && selService.id === s.id;
                    const hasMatrix = (s.axes || []).length > 0;
                    return (
                      <div key={s.id} className={`srow ${on ? 'sel' : ''} ${!enabled ? 'off' : ''}`} onClick={(e) => { if (e.target.closest('.chk,.star,.msw')) return; setSel(s.id); }} data-testid={`svc-row-${s.id}`}>
                        <input className="chk" type="checkbox" checked={checked.has(s.id)} onChange={() => toggleCheck(s.id)} onClick={(e) => e.stopPropagation()} />
                        <button className={`star ${s.is_favorite ? 'on' : ''}`} title="Favourite" onClick={(e) => { e.stopPropagation(); toggleFav(s); }}>{I.star(s.is_favorite)}</button>
                        <span className="sn">{s.service_name}</span>
                        {isPkg(s) ? <span className="mxi" title="package">{I.box}</span> : (hasMatrix ? <span className="mxi" title="price matrix">{I.grid}</span> : null)}
                        <label className="msw" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={enabled} onChange={() => toggleEnabled(s)} />
                          <span className="msl" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* -------- EDITOR -------- */}
        <div className="editcol">
          {!selService
            ? <div className="editempty">Select an item, or press + to add one.</div>
            : (selService.category === 'Packages'
              ? <PackageEditor key={selService.id || 'new-pkg'} initial={selService} services={services} salonId={salonId} H={H} cls={cls} onDone={(deleted) => { setSel(null); load(); }} />
              : <ServiceEditor key={selService.id || 'new-svc'} initial={selService} salonId={salonId} H={H} cls={cls} onDone={() => { setSel(null); load(); }} />)}
        </div>
      </div>

      <ClassificationDrawer open={classOpen} onClose={() => setClassOpen(false)} salonId={salonId} H={H} cls={cls} setCls={setCls} />
      <UploadDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <OnlinePriceDrawer open={onlineOpen} onClose={() => setOnlineOpen(false)} salonId={salonId} H={H} ops={ops} setOps={setOps} />
    </div>
  );
}

/* ============================ SERVICE EDITOR ============================ */
function ServiceEditor({ initial, salonId, H, cls, onDone }) {
  const [s, setS] = useState(initial);
  useEffect(() => { setS(initial); }, [initial]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const axes = s.axes || [];
  const useTier = axes.includes('tier');
  const useLen = axes.includes('length');
  const catOptions = useMemo(() => {
    const names = (cls.categories || []).map((c) => c.name);
    if (s.category && !names.includes(s.category)) names.push(s.category);
    if (!names.length) names.push('General');
    return names;
  }, [cls.categories, s.category]);

  const toggleAxis = (axis) => {
    setS((p) => {
      const cur = p.axes || [];
      const next = cur.includes(axis) ? cur.filter((a) => a !== axis) : [...cur, axis];
      return { ...p, axes: next };
    });
  };
  const mget = (t, l) => {
    const key = matKey(t, l, axes);
    const v = (s.price_matrix || {})[key];
    return v == null ? '' : v;
  };
  const mset = (t, l, val) => {
    const key = matKey(t, l, axes);
    setS((p) => ({ ...p, price_matrix: { ...(p.price_matrix || {}), [key]: val === '' ? 0 : Number(val) } }));
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { set('thumbnail_url', await fileToDataUrl(f)); } catch { toast.error('Could not read image'); }
  };

  const save = async () => {
    if (!(s.service_name || '').trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    // Derive a representative base_price for lists (min of matrix or flat).
    let base = Number(s.base_price || 0);
    if (axes.length) {
      const vals = Object.values(s.price_matrix || {}).map(Number).filter((n) => n > 0);
      base = vals.length ? Math.min(...vals) : 0;
    }
    const payload = {
      service_name: s.service_name.trim(),
      description: s.description || '',
      category: s.category || 'General',
      sub_category: s.sub_category || '',
      gender_tag: s.gender_tag || 'Unisex',
      default_duration: Number(s.default_duration || 30),
      base_price: base,
      price_type: s.price_type || 'fixed',
      is_favorite: !!s.is_favorite,
      available_at_home: !!s.available_at_home,
      thumbnail_url: s.thumbnail_url || '',
      axes,
      price_matrix: s.price_matrix || {},
      gst_rate: s.gst_rate === '' ? null : (s.gst_rate ?? null),
      hsn_code: s.hsn_code || '',
    };
    try {
      if (s.__new) {
        const res = await axios.post(`${API}/services`, payload, H());
        const saved = res.data;
        if (saved?.id && s.is_enabled !== false) {
          await axios.put(`${API}/salons/${salonId}/services/${saved.id}/toggle?is_enabled=true`, null, H()).catch(() => {});
        }
        toast.success('Service created');
      } else {
        await axios.put(`${API}/services/${s.id}`, payload, H());
        toast.success('Saved');
      }
      onDone();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };
  const del = async () => {
    if (s.__new) { onDone(); return; }
    if (!window.confirm('Delete this service?')) return;
    try { await axios.delete(`${API}/services/${s.id}`, H()); toast.success('Deleted'); onDone(); }
    catch { toast.error('Delete failed'); }
  };

  return (
    <>
      <div className="ehead">
        <input className="title" value={s.service_name} onChange={(e) => set('service_name', e.target.value)} data-testid="svc-ed-name" />
        <span className="badge">Service</span>
        <button className={`fav ${s.is_favorite ? 'on' : ''}`} title="Favourite" onClick={() => set('is_favorite', !s.is_favorite)}>{I.star(s.is_favorite)}</button>
        <span className="en"><label className="sw"><input type="checkbox" checked={s.is_enabled !== false} onChange={(e) => set('is_enabled', e.target.checked)} /><span className="sl" /></label>Enabled</span>
      </div>

      <div className="fcard">
        <div className="cl">{I.list}Basics</div>
        <div className="grid2">
          <div className="f"><label>Category</label>
            <select value={s.category} onChange={(e) => set('category', e.target.value)} data-testid="svc-ed-cat">
              {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="f"><label>Duration (min)</label><input className="num" type="number" value={s.default_duration || ''} onChange={(e) => set('default_duration', e.target.value)} /></div>
        </div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="f"><label>Gender</label>
            <div className="segtog">
              {['Men', 'Women', 'Unisex'].map((g) => <button key={g} className={s.gender_tag === g ? 'on' : ''} onClick={() => set('gender_tag', g)}>{g === 'Unisex' ? 'Both' : g}</button>)}
            </div>
          </div>
          <div className="f"><label>At home</label>
            <div className="segtog pink">
              <button className={s.available_at_home ? 'on' : ''} onClick={() => set('available_at_home', true)}>Yes</button>
              <button className={!s.available_at_home ? 'on' : ''} onClick={() => set('available_at_home', false)}>No</button>
            </div>
          </div>
        </div>
      </div>

      <div className="fcard">
        <div className="cl">{I.list}Description</div>
        <div className="f"><textarea placeholder="What this service includes…" value={s.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
      </div>

      <div className="fcard">
        <div className="cl">{I.grid}Pricing</div>
        <div className="grid2" style={{ marginBottom: 10 }}>
          <div className="f"><label>Price type</label>
            <div className="segtog">
              <button className={s.price_type === 'fixed' ? 'on' : ''} onClick={() => set('price_type', 'fixed')}>Fixed</button>
              <button className={s.price_type === 'onwards' ? 'on' : ''} onClick={() => set('price_type', 'onwards')}>Onwards</button>
            </div>
          </div>
          <div />
        </div>
        <div className="axisbar">
          <div className="axistog"><label className="sw"><input type="checkbox" checked={useTier} onChange={() => toggleAxis('tier')} data-testid="svc-ed-tier" /><span className="sl" /></label><span className="t">Price by tier</span></div>
          <div className="axistog"><label className="sw"><input type="checkbox" checked={useLen} onChange={() => toggleAxis('length')} data-testid="svc-ed-length" /><span className="sl" /></label><span className="t">Price by hair length</span></div>
        </div>
        {!useTier && !useLen && (
          <div className="flatprice"><span className="cur">₹</span><input className="num" type="number" value={s.base_price || ''} onChange={(e) => set('base_price', Number(e.target.value) || 0)} data-testid="svc-ed-price" /></div>
        )}
        {(useTier || useLen) && (
          <table className="mx">
            {useTier && useLen && (
              <tbody>
                <tr><th className="rowh" />{cls.lengths.map((l) => <th key={l}>{l}</th>)}</tr>
                {cls.tiers.map((t) => (
                  <tr key={t}><th className="rowh">{t}</th>{cls.lengths.map((l) => <td key={l}><input className="num" type="number" value={mget(t, l)} onChange={(e) => mset(t, l, e.target.value)} /></td>)}</tr>
                ))}
              </tbody>
            )}
            {useTier && !useLen && (
              <tbody>
                <tr>{cls.tiers.map((t) => <th key={t}>{t}</th>)}</tr>
                <tr>{cls.tiers.map((t) => <td key={t}><input className="num" type="number" value={mget(t, null)} onChange={(e) => mset(t, null, e.target.value)} /></td>)}</tr>
              </tbody>
            )}
            {!useTier && useLen && (
              <tbody>
                <tr>{cls.lengths.map((l) => <th key={l}>{l}</th>)}</tr>
                <tr>{cls.lengths.map((l) => <td key={l}><input className="num" type="number" value={mget(null, l)} onChange={(e) => mset(null, l, e.target.value)} /></td>)}</tr>
              </tbody>
            )}
          </table>
        )}
      </div>

      <ThumbCard value={s.thumbnail_url} onUrl={(v) => set('thumbnail_url', v)} onFile={onFile} />

      <details className="adv">
        <summary>{I.chev}Tax</summary>
        <div className="in"><div className="grid2">
          <div className="f"><label>GST %</label><input className="num" type="number" placeholder="18" value={s.gst_rate ?? ''} onChange={(e) => set('gst_rate', e.target.value === '' ? null : Number(e.target.value))} /></div>
          <div className="f"><label>HSN / SAC</label><input placeholder="999721" value={s.hsn_code || ''} onChange={(e) => set('hsn_code', e.target.value)} /></div>
        </div></div>
      </details>

      <div className="savebar">
        <button className="btn btn--danger" onClick={del}>{I.trash}Delete</button>
        <button className="btn btn--ghost" onClick={onDone}>Cancel</button>
        <button className="btn btn--pri" onClick={save} disabled={saving} data-testid="svc-ed-save">{I.save}{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );
}

/* ============================ PACKAGE EDITOR ============================ */
function PackageEditor({ initial, services, salonId, H, cls, onDone }) {
  const [p, setP] = useState(initial);
  useEffect(() => { setP(initial); }, [initial]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const avail = useMemo(() => services.filter((x) => (x.category || '') !== 'Packages' && x.is_active !== false), [services]);
  const items = p.package_items || [];
  const itemsSum = items.reduce((a, i) => a + (Number(i.price) || 0), 0);
  const catOptions = useMemo(() => {
    const names = [...(cls.package_categories || [])];
    if (p.sub_category && !names.includes(p.sub_category)) names.push(p.sub_category);
    if (!names.length) names.push('General');
    return names;
  }, [cls.package_categories, p.sub_category]);

  const setItem = (i, k, v) => setP((x) => { const arr = [...(x.package_items || [])]; arr[i] = { ...arr[i], [k]: v }; return { ...x, package_items: arr }; });
  const addItem = () => setP((x) => ({ ...x, package_items: [...(x.package_items || []), { service_id: avail[0]?.id || '', day_offset: 0, price: avail[0]?.base_price || 0 }] }));
  const rmItem = (i) => setP((x) => { const arr = [...(x.package_items || [])]; arr.splice(i, 1); return { ...x, package_items: arr }; });

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { set('thumbnail_url', await fileToDataUrl(f)); } catch { toast.error('Could not read image'); }
  };

  const save = async () => {
    if (!(p.service_name || '').trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const price = Number(p.package_price || itemsSum);
    const payload = {
      service_name: p.service_name.trim(),
      description: p.description || '',
      category: 'Packages',
      sub_category: p.sub_category || 'General',
      gender_tag: p.gender_tag || 'Unisex',
      default_duration: 0,
      base_price: price,
      price_type: p.price_type || 'onwards',
      is_favorite: !!p.is_favorite,
      available_at_home: !!p.available_at_home,
      thumbnail_url: p.thumbnail_url || '',
      package_items: items.map((i) => ({ service_id: i.service_id, day_offset: Number(i.day_offset || 0), price: Number(i.price || 0) })),
      package_price: price,
      linked_service_ids: items.map((i) => i.service_id),
      services_subtotal: itemsSum,
    };
    try {
      if (p.__new) {
        const res = await axios.post(`${API}/services`, payload, H());
        const saved = res.data;
        if (saved?.id && p.is_enabled !== false) await axios.put(`${API}/salons/${salonId}/services/${saved.id}/toggle?is_enabled=true`, null, H()).catch(() => {});
        toast.success('Package created');
      } else {
        await axios.put(`${API}/services/${p.id}`, payload, H());
        toast.success('Saved');
      }
      onDone();
    } catch (e2) { toast.error(e2?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };
  const del = async () => {
    if (p.__new) { onDone(); return; }
    if (!window.confirm('Delete this package?')) return;
    try { await axios.delete(`${API}/services/${p.id}`, H()); toast.success('Deleted'); onDone(); }
    catch { toast.error('Delete failed'); }
  };

  return (
    <>
      <div className="ehead">
        <input className="title" value={p.service_name} onChange={(e) => set('service_name', e.target.value)} data-testid="pkg-ed-name" />
        <span className="badge pkg">Package</span>
        <button className={`fav ${p.is_favorite ? 'on' : ''}`} onClick={() => set('is_favorite', !p.is_favorite)}>{I.star(p.is_favorite)}</button>
        <span className="en"><label className="sw"><input type="checkbox" checked={p.is_enabled !== false} onChange={(e) => set('is_enabled', e.target.checked)} /><span className="sl" /></label>Enabled</span>
      </div>

      <div className="fcard">
        <div className="cl">{I.list}Basics</div>
        <div className="grid2">
          <div className="f"><label>Category</label>
            <select value={p.sub_category} onChange={(e) => set('sub_category', e.target.value)}>
              {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="f"><label>Gender</label>
            <div className="segtog">{['Men', 'Women', 'Unisex'].map((g) => <button key={g} className={p.gender_tag === g ? 'on' : ''} onClick={() => set('gender_tag', g)}>{g === 'Unisex' ? 'Both' : g}</button>)}</div>
          </div>
        </div>
        <div className="f" style={{ marginTop: 10 }}><label>Description</label><textarea placeholder="What the package covers…" value={p.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
      </div>

      <div className="fcard">
        <div className="cl">{I.box}Services in this package &amp; schedule</div>
        {items.map((it, i) => (
          <div className="pkgitem" key={i}>
            <span className="seq">{i + 1}</span>
            <div className="pn">
              <select value={it.service_id} onChange={(e) => setItem(i, 'service_id', e.target.value)} data-testid={`pkg-item-svc-${i}`}>
                {avail.map((a) => <option key={a.id} value={a.id}>{a.service_name}</option>)}
              </select>
            </div>
            <span className="day">Day <input className="num" type="number" min="0" value={it.day_offset} onChange={(e) => setItem(i, 'day_offset', Number(e.target.value) || 0)} /></span>
            <span className="price"><input className="num" type="number" value={it.price} onChange={(e) => setItem(i, 'price', Number(e.target.value) || 0)} /></span>
            <button className="x" onClick={() => rmItem(i)}>{I.x}</button>
          </div>
        ))}
        <button className="addsvc" onClick={addItem} data-testid="pkg-add-item">{I.plus}Add service</button>
        <div className="pkgsum">
          <span>Package price</span>
          <span><span className="strike num">{rupee(itemsSum)}</span><input className="num" type="number" value={p.package_price ?? itemsSum} onChange={(e) => set('package_price', Number(e.target.value) || 0)} data-testid="pkg-price" /></span>
        </div>
      </div>

      <div className="fcard">
        <div className="cl">{I.info}Booking &amp; notifications</div>
        <div className="clsnote" style={{ margin: 0 }}>{I.info}On purchase every service is auto-scheduled on Day 0 + its offset; if a sitting lands on a salon holiday it moves to the next open day. The package shows in the customer&rsquo;s profile and reminders fire before each sitting.</div>
      </div>

      <ThumbCard value={p.thumbnail_url} onUrl={(v) => set('thumbnail_url', v)} onFile={onFile} />

      <div className="savebar">
        <button className="btn btn--danger" onClick={del}>{I.trash}Delete</button>
        <button className="btn btn--ghost" onClick={onDone}>Cancel</button>
        <button className="btn btn--pri" onClick={save} disabled={saving} data-testid="pkg-ed-save">{I.save}{saving ? 'Saving…' : 'Save package'}</button>
      </div>
    </>
  );
}

function ThumbCard({ value, onUrl, onFile }) {
  return (
    <div className="fcard">
      <div className="cl">{I.img}Thumbnail <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--mut)' }}>· shown to customers</span></div>
      <div className="thumbrow">
        <label className="thumbbox">{value ? <img src={value} alt="" /> : I.upload}<input type="file" accept="image/*" hidden onChange={onFile} /></label>
        <div className="thumbside">
          <div className="f"><label>Upload image file</label><input type="file" accept="image/*" onChange={onFile} /></div>
          <div className="orsplit">or paste URL</div>
          <div className="f"><input placeholder="https://…" value={value && !String(value).startsWith('data:') ? value : ''} onChange={(e) => onUrl(e.target.value)} /></div>
        </div>
      </div>
    </div>
  );
}

/* ============================ DRAWERS ============================ */
function ClassificationDrawer({ open, onClose, salonId, H, cls, setCls }) {
  const [tab, setTab] = useState('category');
  const [local, setLocal] = useState(cls);
  useEffect(() => { if (open) setLocal(cls); }, [open, cls]);
  const [saving, setSaving] = useState(false);

  const listFor = () => tab === 'category' ? (local.categories || []).map((c) => c.name) : tab === 'tier' ? (local.tiers || []) : (local.lengths || []);
  const setListFor = (arr, catThumbs) => {
    setLocal((l) => {
      if (tab === 'category') return { ...l, categories: arr.map((name, i) => ({ name, thumbnail_url: (catThumbs || (l.categories || []).map((c) => c.thumbnail_url))[i] || '' })) };
      if (tab === 'tier') return { ...l, tiers: arr };
      return { ...l, lengths: arr };
    });
  };
  const rename = (i, v) => { const a = listFor(); a[i] = v; setListFor([...a]); };
  const add = () => { const a = listFor(); a.push(tab === 'category' ? 'New category' : 'New'); setListFor([...a]); };
  const rm = (i) => { const a = listFor(); a.splice(i, 1); setListFor([...a]); };
  const setCatThumb = async (i, e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const url = await fileToDataUrl(f);
    setLocal((l) => { const cats = [...(l.categories || [])]; cats[i] = { ...cats[i], thumbnail_url: url }; return { ...l, categories: cats }; });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`${API}/salons/${salonId}/classification`, {
        tiers: local.tiers, lengths: local.lengths, categories: local.categories, package_categories: local.package_categories,
      }, H());
      setCls((c) => ({ ...c, ...res.data }));
      toast.success('Classification saved');
      onClose();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const note = tab === 'category' ? 'Each category carries a thumbnail shown to customers.' : tab === 'tier' ? 'Tier options used across the price matrix.' : 'Hair-length options used in the price matrix.';
  const arr = listFor();
  return (
    <>
      <div className={`svc2-scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <div className={`svc2-dr ${open ? 'open' : ''}`}>
        <div className="drh"><h3>Manage classification</h3><button className="close" onClick={onClose}>{I.x}</button></div>
        <div className="drbody">
          <div className="clstabs">
            {[['category', 'Category'], ['tier', 'Tier'], ['length', 'Hair length']].map(([k, lbl]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{lbl}</button>
            ))}
          </div>
          <div className="clsnote">{I.info}{note}</div>
          {arr.map((v, i) => (
            <div className="clsrow" key={i}>
              {tab === 'category' && (
                <label className="th">{(local.categories || [])[i]?.thumbnail_url ? <img src={local.categories[i].thumbnail_url} alt="" /> : I.img}<input type="file" accept="image/*" hidden onChange={(e) => setCatThumb(i, e)} /></label>
              )}
              <input className="cinput" value={v} onChange={(e) => rename(i, e.target.value)} />
              <button className="x" onClick={() => rm(i)}>{I.x}</button>
            </div>
          ))}
          <button className="addcls" onClick={add}>{I.plus}Add {tab === 'length' ? 'length' : tab}</button>
          <div className="savebar" style={{ marginTop: 16 }}>
            <button className="btn btn--pri" onClick={save} disabled={saving}>{I.save}{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </>
  );
}

function UploadDrawer({ open, onClose }) {
  const href = `${API}/services/upload-template.csv`;
  return (
    <>
      <div className={`svc2-scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <div className={`svc2-dr ${open ? 'open' : ''}`}>
        <div className="drh"><h3>Bulk upload</h3><button className="close" onClick={onClose}>{I.x}</button></div>
        <div className="drbody">
          <div className="drop">{I.upload}<div><b>Drop a filled CSV</b> or click to browse</div></div>
          <a className="btnfull" href={href} target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M8 11l4 4 4-4M4 21h16" /></svg>Download template (.csv)</a>
          <ol className="steps">
            <li>Includes <span className="codepill">service_code</span> + all fields.</li>
            <li>Blank <span className="codepill">service_code</span> → <b>create</b>.</li>
            <li>Existing <span className="codepill">service_code</span> → <b>update</b> in place.</li>
          </ol>
        </div>
      </div>
    </>
  );
}

function OnlinePriceDrawer({ open, onClose, salonId, H, ops, setOps }) {
  const [on, setOn] = useState(ops.show_online_prices !== false);
  useEffect(() => { if (open) setOn(ops.show_online_prices !== false); }, [open, ops]);
  const save = async (next) => {
    setOn(next);
    try { const res = await axios.put(`${API}/salons/${salonId}/ops-settings`, { show_online_prices: next }, H()); setOps((o) => ({ ...o, ...res.data })); }
    catch { toast.error('Could not update'); }
  };
  return (
    <>
      <div className={`svc2-scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <div className={`svc2-dr ${open ? 'open' : ''}`}>
        <div className="drh"><h3>Online price visibility</h3><button className="close" onClick={onClose}>{I.x}</button></div>
        <div className="drbody">
          <div className="setrow">
            <div className="info"><div className="st">Show prices to online customers</div><div className="sd">When off, customers can still book online — they just won&rsquo;t see prices, and no pre-payment is taken.</div></div>
            <label className="sw"><input type="checkbox" checked={on} onChange={(e) => save(e.target.checked)} /><span className="sl" /></label>
          </div>
          {!on && <div className="msgprev">{I.info}Customer sees: &ldquo;Please check the price with the salon.&rdquo; Booking proceeds without payment.</div>}
        </div>
      </div>
    </>
  );
}
