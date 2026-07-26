/**
 * TabHeaderV3.js — Shared "phead" header used by every legacy tab so that
 * Queue / Guests / Marketing / Inventory / Shop / Analytics / Finance visually
 * match the pink Staff and gold Settings headers.
 *
 * Props:
 *   icon      — element/SVG paths OR one of the built-in icon keys below
 *   title     — string title (rendered inside <h2>)
 *   subtitle  — optional string
 *   accent    — 'gold' | 'pink' | 'sky' | 'teal' | 'violet' | 'coral' | 'green'
 *   rightSlot — optional React node rendered on the right (buttons, search…)
 */
import React, { useEffect } from 'react';

const HEADER_CSS = `
.tabhdrv3{--h-tint:#A67C1A;--h-tint-050:#FBF3E0;--h-tint-100:#F2E3C2;
  display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;
  margin:0 0 18px;padding:0}
.tabhdrv3.acc-gold  {--h-tint:#A67C1A;--h-tint-050:#FBF3E0;--h-tint-100:#F2E3C2}
.tabhdrv3.acc-pink  {--h-tint:#C6389E;--h-tint-050:#FCEAF5;--h-tint-100:#F6D4EA}
.tabhdrv3.acc-sky   {--h-tint:#3E93E8;--h-tint-050:#E9F2FD;--h-tint-100:#CFE4FA}
.tabhdrv3.acc-teal  {--h-tint:#12A594;--h-tint-050:#E4F6F3;--h-tint-100:#B7EAE0}
.tabhdrv3.acc-violet{--h-tint:#8A5CD1;--h-tint-050:#F0E9FB;--h-tint-100:#DACAF4}
.tabhdrv3.acc-coral {--h-tint:#E8952B;--h-tint-050:#FDF3E4;--h-tint-100:#F6D9A8}
.tabhdrv3.acc-green {--h-tint:#2FA96A;--h-tint-050:#E7F6ED;--h-tint-100:#B7E5CB}
.tabhdrv3 .th-left{min-width:0;flex:1}
.tabhdrv3 h2{margin:0;font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;font-size:24px;font-weight:800;letter-spacing:-.5px;display:flex;align-items:center;gap:11px;color:#2A2317}
.tabhdrv3 h2 .hic{width:36px;height:36px;border-radius:11px;background:var(--h-tint-050);color:var(--h-tint);display:grid;place-items:center;flex:none}
.tabhdrv3 h2 .hic svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2}
.tabhdrv3 p{font-size:13px;color:#8B8069;margin:5px 0 0 47px;font-family:'Inter',system-ui,sans-serif}
.tabhdrv3 .th-right{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
@media(max-width:640px){
  .tabhdrv3 h2{font-size:20px}
  .tabhdrv3 p{margin-left:0}
}
/* When any inner tab already prints its own .phead heading, hide it in favour of ours */
.tab-hdr-scope > .shv2 > .phead:first-child,
.tab-hdr-scope > .shv2 .phead.duplicate-hide,
.tab-hdr-scope > .phead:first-child{display:none !important}

/* Per-tab accent for the existing .shv2 .phead (used by Guests/Marketing/etc.) */
.shv2 .tab-hue-teal .phead h2 .hic,.tab-hue-teal .shv2 .phead h2 .hic,.tab-hdr-scope.tab-hue-teal .phead h2 .hic{background:#E4F6F3 !important;color:#12A594 !important}
.shv2 .tab-hue-violet .phead h2 .hic,.tab-hue-violet .shv2 .phead h2 .hic,.tab-hdr-scope.tab-hue-violet .phead h2 .hic{background:#F0E9FB !important;color:#8A5CD1 !important}
.shv2 .tab-hue-sky .phead h2 .hic,.tab-hue-sky .shv2 .phead h2 .hic,.tab-hdr-scope.tab-hue-sky .phead h2 .hic{background:#E9F2FD !important;color:#3E93E8 !important}
.shv2 .tab-hue-coral .phead h2 .hic,.tab-hue-coral .shv2 .phead h2 .hic,.tab-hdr-scope.tab-hue-coral .phead h2 .hic{background:#FDF3E4 !important;color:#E8952B !important}
.shv2 .tab-hue-green .phead h2 .hic,.tab-hue-green .shv2 .phead h2 .hic,.tab-hdr-scope.tab-hue-green .phead h2 .hic{background:#E7F6ED !important;color:#2FA96A !important}
/* Also recolor Marketing "New campaign" style .btn-primary within the violet scope so the whole header reads violet */
.tab-hue-violet .shv2 .phead .btn-primary{background:#8A5CD1 !important;color:#fff !important}
.tab-hue-violet .shv2 .phead .btn-primary:hover{background:#6E44B0 !important}
.tab-hue-teal .shv2 .phead .btn-primary{background:#12A594 !important;color:#fff !important}
.tab-hue-teal .shv2 .phead .btn-primary:hover{background:#0E8579 !important}
`;

const ICONS = {
  queue: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></>,
  guests: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  marketing: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  inventory: <><path d="M21 8V21H3V8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
  shop: <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
  analytics: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  finance: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
};

export default function TabHeaderV3({ icon, title, subtitle, accent = 'gold', rightSlot }) {
  useEffect(() => {
    const id = 'tab-hdr-v3-css';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = HEADER_CSS;
    document.head.appendChild(el);
  }, []);

  const iconEl = typeof icon === 'string' ? ICONS[icon] : icon;

  return (
    <div className={`tabhdrv3 acc-${accent}`} data-testid={`tab-header-${accent}`}>
      <div className="th-left">
        <h2>
          <span className="hic">
            <svg viewBox="0 0 24 24">{iconEl}</svg>
          </span>
          {title}
        </h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {rightSlot && <div className="th-right">{rightSlot}</div>}
    </div>
  );
}
