/**
 * SalonHub Operations & Reports — Zenoti-inspired blue theme.
 * Scoped to `.zen` root so it doesn't affect the rest of the app.
 */
export const ZEN_CSS = `
.zen{--z-primary:#6C4FE0;--z-primary-600:#5B3FD1;--z-primary-700:#4B33B8;
  --z-primary-050:#F1EEFF;--z-primary-100:#E7E2FF;--z-primary-200:#D6CBFF;
  --z-bg:#F6F6FB;--z-surface:#FFFFFF;--z-surface-2:#FBFBFE;
  --z-ink:#23252F;--z-ink-soft:#3C3F4E;--z-muted:#7C8092;--z-muted-2:#9A9EAE;
  --z-line:#ECECF3;--z-line-2:#F3F3F8;
  --z-ok:#2FA96A;--z-ok-bg:#E7F6ED;--z-warn:#E8952B;--z-warn-bg:#FDF3E4;--z-bad:#E45C86;--z-bad-bg:#FCEAF1;
  --z-gold:#E8952B;--z-green:#2FA96A;--z-maroon:#E45C86;--z-pink:#E45C86;--z-sky:#3E93E8;--z-violet:#6C4FE0;--z-teal:#12A594;
  --z-shadow:0 1px 2px rgba(30,32,50,.04),0 6px 20px rgba(30,32,50,.05);
  --z-shadow-lg:0 10px 40px rgba(30,32,50,.14);
  --z-r:16px;--z-r-sm:12px;--z-r-lg:20px;
  color:var(--z-ink);font-family:'Inter','Manrope',system-ui,sans-serif;font-size:14px;line-height:1.45}
.zen .num{font-family:'Bebas Neue',sans-serif;font-weight:400;letter-spacing:.5px;line-height:1}
.zen .eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--z-primary)}
.zen h1,.zen h2,.zen h3,.zen h4{margin:0;font-weight:800;letter-spacing:-.01em}
.zen .z-wrap{padding:22px 20px 60px;max-width:1360px}
.zen .z-phead{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:18px;flex-wrap:wrap}
.zen .z-phead h1{font-size:26px;color:var(--z-ink)}
.zen .z-phead p{color:var(--z-muted);margin:2px 0 0;max-width:520px;font-size:13.5px}
.zen .z-actions{display:flex;gap:10px;flex-wrap:wrap}
.zen .z-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:9px 15px;border-radius:11px;font-weight:700;font-size:13.5px;transition:.15s;white-space:nowrap;border:1px solid transparent;background:transparent;cursor:pointer}
.zen .z-btn:disabled{opacity:.45;cursor:not-allowed}
.zen .z-btn svg{width:16px;height:16px}
.zen .z-btn--pri{background:var(--z-primary);color:#fff;box-shadow:0 6px 16px rgba(108,79,224,.24)}
.zen .z-btn--pri:hover{background:var(--z-primary-600)}
.zen .z-btn--ghost{background:#fff;color:var(--z-ink-soft);border-color:var(--z-line)}
.zen .z-btn--ghost:hover{border-color:var(--z-primary-200);color:var(--z-primary);background:var(--z-primary-050)}
.zen .z-btn--soft{background:var(--z-primary-050);color:var(--z-primary)}
.zen .z-btn--soft:hover{background:var(--z-primary-100)}
.zen .z-btn--danger{background:var(--z-bad-bg);color:var(--z-bad)}
.zen .z-btn--danger:hover{background:#f7d5e2}
.zen .z-btn--ok{background:var(--z-ok);color:#fff}
.zen .z-btn--sm{padding:6px 11px;font-size:12.5px;border-radius:9px}
.zen .z-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
.zen .z-metric{background:var(--z-surface);border:1px solid var(--z-line);border-radius:var(--z-r);padding:9px 13px;box-shadow:var(--z-shadow);position:relative;overflow:hidden;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.zen .z-metric .k{display:flex;align-items:center;gap:6px;color:var(--z-muted);font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:0}
.zen .z-metric .v{font-family:'Bebas Neue',sans-serif;font-size:22px;line-height:1;color:var(--z-ink);margin-left:auto}
.zen .z-metric .v small{font-size:15px;font-family:'Manrope';font-weight:700;color:var(--z-muted)}
.zen .z-metric .sub{font-size:11px;color:var(--z-muted);margin-top:0;flex-basis:100%}
.zen .z-metric.g-blue{background:linear-gradient(135deg,#F1EEFF,#fff)}
.zen .z-metric.g-mint{background:linear-gradient(135deg,#E7F6ED,#fff)}
.zen .z-metric.g-amber{background:linear-gradient(135deg,#FDF3E4,#fff)}
.zen .z-metric.g-rose{background:linear-gradient(135deg,#FCEAF1,#fff)}
/* Compact, clickable metrics + inline Shop action (Aug 2026 edit) */
.zen .z-metrics--compact{display:flex;flex-wrap:wrap;align-items:stretch;gap:10px;grid-template-columns:none}
.zen .z-metrics--compact .z-metric{flex:0 1 190px;min-width:160px}
.zen .z-metric.is-clickable{cursor:pointer;transition:.15s}
.zen .z-metric.is-clickable:hover{border-color:var(--z-primary-200);box-shadow:0 6px 18px rgba(60,40,140,.10);transform:translateY(-1px)}
.zen .z-metric.is-clickable.on{border-color:var(--z-primary);box-shadow:0 0 0 2px var(--z-primary-050)}
.zen .z-metrics-shop{display:flex;align-items:center;margin-left:auto}
.zen .z-metrics-shop .z-btn{height:100%}
.zen .z-trend{font-size:11.5px;font-weight:800;padding:2px 7px;border-radius:20px;display:inline-block}
.zen .z-trend.up{background:var(--z-ok-bg);color:var(--z-ok)} .zen .z-trend.dn{background:var(--z-bad-bg);color:var(--z-bad)}
.zen .z-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11.5px;font-weight:700;background:var(--z-line-2);color:var(--z-ink-soft)}
.zen .z-pill--ok{background:var(--z-ok-bg);color:var(--z-ok)} .zen .z-pill--warn{background:var(--z-warn-bg);color:var(--z-warn)} .zen .z-pill--bad{background:var(--z-bad-bg);color:var(--z-bad)} .zen .z-pill--blue{background:var(--z-primary-050);color:var(--z-primary)}
.zen .z-seg{display:inline-flex;background:var(--z-line-2);border:1px solid var(--z-line);border-radius:10px;padding:3px;gap:1px}
.zen .z-seg button{padding:6px 12px;border-radius:8px;font-weight:700;font-size:12.5px;color:var(--z-muted);background:transparent;border:none;cursor:pointer}
.zen .z-seg button.on{background:#fff;color:var(--z-primary);box-shadow:var(--z-shadow)}
.zen .z-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:20px;border:1px solid var(--z-line);background:#fff;font-weight:700;font-size:12.5px;color:var(--z-ink-soft);white-space:nowrap;transition:.15s;cursor:pointer;line-height:1}
.zen .z-chip svg{flex:none;width:14px;height:14px}
.zen .z-chip:hover{border-color:var(--z-primary-200)}
.zen .z-chip.on{background:var(--z-primary);color:#fff;border-color:var(--z-primary)}
.zen .z-field label{display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--z-muted);margin-bottom:5px}
.zen .z-field input,.zen .z-field select,.zen .z-field textarea{width:100%;padding:9px 12px;border:1px solid var(--z-line);border-radius:10px;background:var(--z-surface-2);font-size:14px;font-family:inherit;color:var(--z-ink)}
.zen .z-field input:focus,.zen .z-field select:focus,.zen .z-field textarea:focus{outline:none;border-color:var(--z-primary);background:#fff;box-shadow:0 0 0 3px var(--z-primary-050)}
.zen .z-field textarea{resize:vertical;min-height:70px}
.zen .z-field+.z-field{margin-top:12px}
.zen .z-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.zen .z-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.zen .z-card{background:var(--z-surface);border:1px solid var(--z-line);border-radius:var(--z-r);box-shadow:var(--z-shadow);overflow:hidden}
.zen .z-cats.z-card{overflow:visible}
.zen .z-split{display:grid;grid-template-columns:290px 1fr;gap:18px;align-items:start}
.zen .z-cats{position:sticky;top:80px;align-self:start;display:flex;flex-direction:column;overflow:visible;max-height:calc(100vh - 96px)}
.zen .z-cats-h{padding:14px 15px 10px;border-bottom:1px solid var(--z-line-2);flex:none}
.zen .z-cat-list{padding:6px 8px;overflow-y:auto;flex:1;min-height:0;max-height:calc(100vh - 190px)}
.zen .z-cat-row{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;cursor:pointer;font-weight:700;margin-bottom:2px;transition:.12s}
.zen .z-cat-row:hover{background:var(--z-primary-050)}
.zen .z-cat-row.sel{background:var(--z-primary);color:#fff}
.zen .z-cat-row.sel .z-cat-count{background:rgba(255,255,255,.25);color:#fff}
.zen .z-cat-row .chev{transition:.15s;flex:none;width:14px;height:14px}
.zen .z-cat-row.open .chev{transform:rotate(90deg)}
.zen .z-cat-ico{width:26px;height:26px;border-radius:7px;background:var(--z-primary-050);color:var(--z-primary);display:grid;place-items:center;flex:none}
.zen .z-cat-row.sel .z-cat-ico{background:rgba(255,255,255,.2);color:#fff}
.zen .z-cat-name{flex:1;font-size:13.5px}
.zen .z-cat-count{margin-left:auto;background:var(--z-line-2);color:var(--z-muted);border-radius:20px;padding:1px 9px;font-size:11.5px;font-weight:800}
.zen .z-subs{padding:2px 0 6px 22px;margin-left:14px;border-left:2px solid var(--z-line-2)}
.zen .z-sub-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:var(--z-ink-soft)}
.zen .z-sub-row:hover{background:var(--z-primary-050)}
.zen .z-sub-row.sel{background:var(--z-primary-100);color:var(--z-primary-700);font-weight:800}
.zen .z-sub-row .cnt{margin-left:auto;font-size:11px;color:var(--z-muted-2);font-weight:700}
.zen .z-sub-add{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;color:var(--z-primary);font-weight:700;font-size:12.5px;cursor:pointer}
.zen .z-sub-add:hover{background:var(--z-primary-050)}
.zen .z-sub-add-field{display:flex;gap:6px;padding:4px 2px}
.zen .z-sub-add-field input{flex:1;padding:7px 10px;border:1px solid var(--z-primary-200);border-radius:8px;font-size:13px;background:#fff}
.zen .z-toolbar{display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
.zen .z-search{flex:1;position:relative;min-width:180px}
.zen .z-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:var(--z-muted-2)}
.zen .z-search input{width:100%;padding:9px 12px 9px 34px;border:1px solid var(--z-line);border-radius:10px;background:#fff}
.zen .z-search input:focus{outline:none;border-color:var(--z-primary-200)}
.zen .z-group-h{display:flex;align-items:center;justify-content:space-between;margin:16px 2px 10px}
.zen .z-group-h:first-child{margin-top:0}
.zen .z-group-h h3{font-size:15px;color:var(--z-ink)}
.zen .z-group-h .cnt{font-size:12px;color:var(--z-muted-2);font-weight:700}
.zen .z-svc-card{background:var(--z-surface);border:1px solid var(--z-line);border-radius:var(--z-r);box-shadow:var(--z-shadow);margin-bottom:12px;overflow:hidden;transition:.15s}
/* Phase 3.12 — 2-up compact service chips */
.zen .z-svc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:6px}
.zen .z-svc-grid .z-svc-card{margin-bottom:0}
.zen .z-svc-grid .z-svc-main{padding:12px 13px;gap:10px}
.zen .z-svc-grid .z-svc-thumb{width:46px;height:46px;font-size:22px}
.zen .z-svc-grid .z-svc-title h4{font-size:13.5px}
.zen .z-svc-grid .z-svc-price{font-size:20px}
.zen .z-svc-grid .z-svc-desc{font-size:12px;margin:3px 0 6px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.zen .z-svc-grid .z-svc-actions{padding:8px 13px}
.zen .z-svc-grid .z-link{padding:5px 8px;font-size:12px}
@media(max-width:900px){.zen .z-svc-grid{grid-template-columns:1fr}}
.zen .z-svc-card:hover{border-color:var(--z-primary-200);box-shadow:var(--z-shadow-lg)}
.zen .z-svc-main{display:flex;gap:14px;padding:15px 16px}
.zen .z-svc-thumb{width:60px;height:60px;border-radius:12px;background:linear-gradient(135deg,var(--z-primary-050),var(--z-line-2));display:grid;place-items:center;font-size:28px;flex:none;overflow:hidden}
.zen .z-svc-thumb img{width:100%;height:100%;object-fit:cover}
.zen .z-svc-body{flex:1;min-width:0}
.zen .z-svc-title{display:flex;align-items:baseline;gap:10px;justify-content:space-between}
.zen .z-svc-title h4{font-size:15px;font-weight:800;color:var(--z-ink)}
.zen .z-svc-price{font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--z-primary);line-height:.9;white-space:nowrap;text-align:right}
.zen .z-svc-price .onwards{font-family:'Manrope';font-size:10px;font-weight:800;color:var(--z-muted-2);letter-spacing:.08em;display:block}
.zen .z-svc-desc{color:var(--z-muted);font-size:13px;margin:4px 0 8px}
.zen .z-svc-tags{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.zen .z-svc-actions{display:flex;gap:8px;padding:10px 16px;border-top:1px solid var(--z-line-2);align-items:center}
.zen .z-svc-actions .sp{flex:1}
.zen .z-link{display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:12.5px;color:var(--z-ink-soft);padding:6px 10px;border-radius:8px;background:transparent;border:none;cursor:pointer}
.zen .z-link:hover{background:var(--z-line-2);color:var(--z-primary)}
.zen .z-link svg{width:15px;height:15px}
.zen .z-link.fav.on{color:var(--z-gold)}
.zen .z-link.danger:hover{background:var(--z-bad-bg);color:var(--z-bad)}
.zen .z-inv-table{background:var(--z-surface);border:1px solid var(--z-line);border-radius:var(--z-r);box-shadow:var(--z-shadow);overflow:hidden}
.zen .z-inv-head,.zen .z-inv-row{display:grid;grid-template-columns:2.4fr 1fr 1fr 1.1fr 1fr 2.4fr;gap:10px;align-items:center;padding:12px 16px}
.zen .z-inv-head{background:var(--z-surface-2);border-bottom:1px solid var(--z-line);font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--z-muted)}
.zen .z-inv-row{border-bottom:1px solid var(--z-line-2);transition:.12s}
.zen .z-inv-row:last-child{border-bottom:none}
.zen .z-inv-row:hover{background:var(--z-surface-2)}
.zen .z-inv-row.low{background:linear-gradient(90deg,var(--z-warn-bg),transparent 55%)}
.zen .z-inv-row.out{background:linear-gradient(90deg,var(--z-bad-bg),transparent 55%)}
.zen .z-inv-prod{display:flex;align-items:center;gap:11px;min-width:0}
.zen .z-inv-ico{width:40px;height:40px;border-radius:10px;background:var(--z-line-2);display:grid;place-items:center;font-size:19px;flex:none}
.zen .z-inv-prod .nm{font-weight:800;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--z-ink)}
.zen .z-inv-prod .br{font-size:11.5px;color:var(--z-muted)}
.zen .z-inv-qty{font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--z-ink)}
.zen .z-inv-money{font-weight:800;font-size:13px}
.zen .z-inv-money small{display:block;font-size:11px;font-weight:600;color:var(--z-muted)}
.zen .z-inv-acts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.zen .z-ibtn{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:8px;font-weight:700;font-size:12px;border:1px solid var(--z-line);background:#fff;color:var(--z-ink-soft);cursor:pointer;transition:.12s}
.zen .z-ibtn svg{width:14px;height:14px}
.zen .z-ibtn:hover{border-color:var(--z-primary-200);color:var(--z-primary);background:var(--z-primary-050)}
.zen .z-ibtn--sell{background:var(--z-ok-bg);color:var(--z-ok);border-color:transparent}
.zen .z-ibtn--sell:hover{background:#d6ecd8}
.zen .z-ibtn--buy{background:var(--z-primary-050);color:var(--z-primary);border-color:transparent}
.zen .z-shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.zen .z-shop-card{background:var(--z-surface);border:1px solid var(--z-line);border-radius:var(--z-r);box-shadow:var(--z-shadow);overflow:hidden;transition:.15s;display:flex;flex-direction:column}
.zen .z-shop-card:hover{border-color:var(--z-primary-200);box-shadow:var(--z-shadow-lg);transform:translateY(-2px)}
.zen .z-shop-img{aspect-ratio:1.35;background:linear-gradient(135deg,var(--z-line-2),#fff);display:grid;place-items:center;font-size:46px;position:relative;cursor:pointer;overflow:hidden}
.zen .z-shop-img img{width:100%;height:100%;object-fit:cover}
.zen .z-shop-badge{position:absolute;top:8px;left:8px;padding:3px 8px;border-radius:7px;font-size:10.5px;font-weight:800;background:var(--z-ink);color:#fff}
.zen .z-shop-rate{position:absolute;top:8px;right:8px;padding:3px 7px;border-radius:7px;font-size:11px;font-weight:800;background:rgba(255,255,255,.94);color:var(--z-ink);display:flex;gap:3px;align-items:center}
.zen .z-shop-info{padding:12px 13px 14px;flex:1;display:flex;flex-direction:column}
.zen .z-shop-brand{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--z-muted-2)}
.zen .z-shop-name{font-weight:800;font-size:14px;margin:2px 0 3px;line-height:1.25;cursor:pointer;color:var(--z-ink)}
.zen .z-shop-name:hover{color:var(--z-primary)}
.zen .z-shop-meta{font-size:11.5px;color:var(--z-muted)}
.zen .z-shop-price{display:flex;align-items:baseline;gap:7px;margin:10px 0 3px}
.zen .z-shop-price .p{font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--z-ink)}
.zen .z-shop-price .mrp{font-size:12px;color:var(--z-muted-2);text-decoration:line-through}
.zen .z-shop-price .off{font-size:11px;font-weight:800;color:var(--z-ok)}
.zen .z-shop-moq{font-size:11px;color:var(--z-muted);margin-bottom:10px}
.zen .z-shop-add{margin-top:auto}
.zen .z-stepper{display:inline-flex;align-items:center;border:1px solid var(--z-primary-200);border-radius:9px;overflow:hidden;background:#fff}
.zen .z-stepper button{width:30px;height:32px;display:grid;place-items:center;color:var(--z-primary);background:var(--z-primary-050);border:none;cursor:pointer}
.zen .z-stepper button:hover{background:var(--z-primary-100)}
.zen .z-stepper input,.zen .z-stepper .q{width:42px;text-align:center;font-weight:800;font-size:14px;border:none;background:#fff;height:32px}
.zen .z-stepper input:focus{outline:none}
.zen .z-overlay{position:fixed;inset:0;background:rgba(20,28,46,.5);backdrop-filter:blur(2px);z-index:1000}
.zen .z-drawer{position:fixed;top:0;right:0;height:100vh;width:460px;max-width:94vw;background:var(--z-surface);box-shadow:var(--z-shadow-lg);z-index:1001;display:flex;flex-direction:column;animation:zSlide .28s ease}
.zen .z-drawer.wide{width:560px}
@keyframes zSlide{from{transform:translateX(100%)}to{transform:none}}
.zen .z-drawer-h{display:flex;align-items:flex-start;gap:12px;padding:20px 22px 16px;border-bottom:1px solid var(--z-line)}
.zen .z-drawer-h .dico{width:40px;height:40px;border-radius:11px;background:var(--z-primary-050);color:var(--z-primary);display:grid;place-items:center;flex:none}
.zen .z-drawer-h h3{font-size:18px;color:var(--z-ink)}
.zen .z-drawer-h p{color:var(--z-muted);font-size:12.5px;margin:2px 0 0}
.zen .z-drawer-close{margin-left:auto;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:var(--z-muted);background:var(--z-line-2);border:none;cursor:pointer;flex:none}
.zen .z-drawer-close:hover{background:var(--z-bad-bg);color:var(--z-bad)}
.zen .z-drawer-tabs{display:flex;gap:6px;padding:14px 22px 0}
.zen .z-drawer-tab{flex:1;padding:11px;border-radius:11px;font-weight:800;font-size:13px;color:var(--z-muted);text-align:center;background:var(--z-line-2);display:flex;align-items:center;justify-content:center;gap:7px;border:none;cursor:pointer}
.zen .z-drawer-tab.on{background:var(--z-primary);color:#fff;box-shadow:var(--z-shadow)}
.zen .z-drawer-body{flex:1;overflow-y:auto;padding:18px 22px}
.zen .z-drawer-foot{border-top:1px solid var(--z-line);padding:14px 22px}
.zen .z-photo-up{border:2px dashed var(--z-line);border-radius:12px;padding:18px;text-align:center;cursor:pointer;transition:.15s;background:var(--z-surface-2)}
.zen .z-photo-up:hover{border-color:var(--z-primary-200);background:var(--z-primary-050)}
.zen .z-photo-preview{display:flex;gap:10px;align-items:center}
.zen .z-photo-preview .pv{width:60px;height:60px;border-radius:11px;background:var(--z-line-2);display:grid;place-items:center;overflow:hidden;flex:none}
.zen .z-photo-preview .pv img{width:100%;height:100%;object-fit:cover}
.zen .z-toggle{position:relative;width:38px;height:22px;border-radius:20px;background:var(--z-line);transition:.2s;flex:none;cursor:pointer;border:none}
.zen .z-toggle.on{background:var(--z-primary)}
.zen .z-toggle::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.zen .z-toggle.on::after{left:18px}
.zen .z-togrow{display:flex;align-items:center;gap:10px;cursor:pointer;padding:5px 0}
.zen .z-togrow span{font-weight:600;font-size:13.5px;color:var(--z-ink)}
.zen .z-dsec{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--z-muted);margin:16px 0 8px}
.zen .z-dsec:first-child{margin-top:0}
.zen .z-empty{text-align:center;padding:50px 20px;color:var(--z-muted)}
.zen .z-empty svg{width:40px;height:40px;color:var(--z-muted-2);margin-bottom:10px}
.zen .z-order-card{background:var(--z-surface);border:1px solid var(--z-line);border-radius:var(--z-r);box-shadow:var(--z-shadow);margin-bottom:14px;overflow:hidden}
.zen .z-order-top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 17px;border-bottom:1px solid var(--z-line-2);flex-wrap:wrap}
.zen .z-order-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 17px;background:var(--z-surface-2);border-top:1px solid var(--z-line-2);flex-wrap:wrap}
.zen .z-track{display:flex;align-items:flex-start;margin:14px 0 6px}
.zen .z-track-step{flex:1;text-align:center;position:relative}
.zen .z-track-step .dot{width:26px;height:26px;border-radius:50%;background:var(--z-line);color:var(--z-muted-2);display:grid;place-items:center;margin:0 auto 6px;position:relative;z-index:2;border:3px solid var(--z-surface)}
.zen .z-track-step.done .dot{background:var(--z-ok);color:#fff}
.zen .z-track-step.active .dot{background:var(--z-primary);color:#fff;box-shadow:0 0 0 4px var(--z-primary-050)}
.zen .z-track-step::before{content:"";position:absolute;top:13px;left:-50%;width:100%;height:3px;background:var(--z-line);z-index:1}
.zen .z-track-step:first-child::before{display:none}
.zen .z-track-step.done::before,.zen .z-track-step.active::before{background:var(--z-ok)}
.zen .z-track-step .lbl{font-size:11px;font-weight:700;color:var(--z-ink-soft)}
.zen .z-cart-badge{position:absolute;top:-3px;right:-3px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--z-maroon);color:#fff;font-size:10px;font-weight:800;display:grid;place-items:center;border:2px solid #fff}
.zen .z-ribbon-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;background:var(--z-primary-050);color:var(--z-primary);border:1px solid var(--z-line);cursor:pointer}
.zen .z-ribbon-btn:hover{background:var(--z-primary-100)}
.zen .z-sumrow{display:flex;justify-content:space-between;padding:6px 0;font-size:13.5px;color:var(--z-ink-soft)}
.zen .z-sumrow.g{color:var(--z-ok);font-weight:700}
.zen .z-sumrow.tot{border-top:1px solid var(--z-line);margin-top:6px;padding-top:11px;font-weight:800;font-size:16px;color:var(--z-ink);align-items:baseline}
.zen .z-sumrow.tot .num{font-family:'Bebas Neue';font-size:26px;color:var(--z-primary)}
.zen .z-pay-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}
.zen .z-pay-opt{display:flex;align-items:center;gap:9px;padding:11px;border:1.5px solid var(--z-line);border-radius:11px;cursor:pointer;transition:.12s;font-weight:700;font-size:13px;color:var(--z-ink)}
.zen .z-pay-opt.on{border-color:var(--z-primary);background:var(--z-primary-050)}
.zen .z-pay-opt svg{width:18px;height:18px;color:var(--z-muted)}
.zen .z-pay-opt.on svg{color:var(--z-primary)}
.zen .z-cline{display:flex;align-items:center;gap:11px;padding:11px 0;border-bottom:1px solid var(--z-line-2)}
.zen .z-cline .ci{width:44px;height:44px;border-radius:10px;background:var(--z-line-2);display:grid;place-items:center;font-size:20px;flex:none;overflow:hidden}
.zen .z-cline .cn{flex:1;min-width:0}
.zen .z-cline .cn .t{font-weight:800;font-size:13.5px;color:var(--z-ink)}
.zen .z-cline .cn .s{font-size:11.5px;color:var(--z-muted)}
.zen .z-cline .cp{font-weight:800;white-space:nowrap;text-align:right;color:var(--z-ink)}
.zen .z-donut{--v:0deg;width:170px;height:170px;border-radius:50%;background:conic-gradient(var(--z-primary) var(--v),var(--z-line-2) 0);display:grid;place-items:center;position:relative}
.zen .z-donut::after{content:"";position:absolute;inset:14px;background:#fff;border-radius:50%}
.zen .z-donut .val{position:relative;z-index:1;font-family:'Bebas Neue';font-size:32px;color:var(--z-ink)}
.zen .z-bar-chart{display:flex;flex-direction:column;gap:6px}
.zen .z-bar-row{display:flex;align-items:center;gap:9px;font-size:12px}
.zen .z-bar-row .lbl{width:70px;color:var(--z-muted);flex:none;font-weight:600}
.zen .z-bar-row .track{flex:1;height:14px;border-radius:8px;background:var(--z-line-2);overflow:hidden;position:relative}
.zen .z-bar-row .fill{height:100%;background:linear-gradient(90deg,var(--z-primary),var(--z-primary-600));border-radius:8px;transition:width .5s ease}
.zen .z-bar-row .v{width:66px;text-align:right;font-weight:800;color:var(--z-ink);flex:none}
@media(max-width:1080px){.zen .z-split{grid-template-columns:1fr}.zen .z-cats{position:static}.zen .z-metrics{grid-template-columns:repeat(2,1fr)}}
@media(max-width:760px){.zen .z-metrics{grid-template-columns:1fr 1fr}.zen .z-inv-head{display:none}.zen .z-inv-row{grid-template-columns:1fr;gap:8px}.zen .z-drawer{width:100vw}}

/* ---------- Menu & Services v2 additions ---------- */
.zen .z-cats-filter{position:relative;margin-top:8px}
.zen .z-cats-filter svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);width:14px;height:14px;color:var(--z-muted-2)}
.zen .z-cats-filter input{width:100%;padding:7px 11px 7px 30px;border:1px solid var(--z-line);border-radius:9px;background:#fff;font-size:12.5px}
.zen .z-cats-filter input:focus{outline:none;border-color:var(--z-primary-200)}
.zen .z-cats-h .cats-lbl{font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--z-muted-2)}
.zen .z-toolbar-2{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.zen .z-toolbar-2 .grow{flex:1;min-width:210px}
.zen .z-toolbar-2 .z-search input{padding:7px 12px 7px 34px}
.zen .z-toolbar-2 .z-seg button{padding:5px 11px}
.zen .z-select{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border:1px solid var(--z-line);border-radius:10px;background:#fff;font-weight:700;font-size:12.5px;color:var(--z-ink-soft);cursor:pointer}
.zen .z-svc-card{position:relative;cursor:pointer}
.zen .z-svc-mets{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:11px 16px 4px;border-top:1px solid var(--z-line-2)}
.zen .z-svc-met{display:flex;flex-direction:column;gap:2px}
.zen .z-svc-met .k{font-size:9.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--z-muted-2)}
.zen .z-svc-met .v{font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--z-ink);line-height:1;letter-spacing:.2px}
.zen .z-svc-met .v small{font-family:'Manrope';font-size:11px;color:var(--z-muted);font-weight:700}
.zen .z-svc-met .tr{display:inline-flex;gap:3px;align-items:center;font-size:11px;font-weight:800;padding:2px 7px;border-radius:20px;background:var(--z-ok-bg);color:var(--z-ok)}
.zen .z-svc-met .tr.dn{background:var(--z-bad-bg);color:var(--z-bad)}
.zen .z-svc-met .tr.flat{background:var(--z-line-2);color:var(--z-muted)}
/* Upload drawer specifics */
.zen .z-up-card{border:1px solid var(--z-line);border-radius:12px;padding:14px;background:var(--z-surface-2);margin-bottom:14px}
.zen .z-up-card h4{font-size:13.5px;color:var(--z-ink);margin-bottom:5px}
.zen .z-up-card p{font-size:12px;color:var(--z-muted);margin-bottom:10px}
.zen .z-drop{border:2px dashed var(--z-primary-200);border-radius:12px;padding:22px 16px;text-align:center;color:var(--z-muted);background:#fff;cursor:pointer;transition:.12s}
.zen .z-drop:hover{background:var(--z-primary-050);border-color:var(--z-primary)}
.zen .z-drop b{color:var(--z-primary);font-weight:800}
.zen .z-hist-row{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px 12px;border:1px solid var(--z-line);border-radius:11px;background:#fff;margin-bottom:8px;align-items:center}
.zen .z-hist-row .nm{font-weight:700;font-size:13px;color:var(--z-ink)}
.zen .z-hist-row .sub{font-size:11.5px;color:var(--z-muted);margin-top:2px}
.zen .z-hist-row .badge{display:inline-block;font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;background:var(--z-ok-bg);color:var(--z-ok);margin-left:6px}
.zen .z-hist-row .badge.rb{background:var(--z-line-2);color:var(--z-muted)}
/* Service metrics drawer */
.zen .z-metgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.zen .z-metbox{border:1px solid var(--z-line);border-radius:12px;padding:12px 13px;background:var(--z-surface-2)}
.zen .z-metbox .k{font-size:10.5px;color:var(--z-muted);font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
.zen .z-metbox .v{font-family:'Bebas Neue';font-size:26px;color:var(--z-ink);line-height:1}
.zen .z-metbox .v small{font-family:'Manrope';font-size:12px;font-weight:700;color:var(--z-muted)}
.zen .z-spark{display:flex;align-items:flex-end;gap:3px;height:60px;padding:8px 0}
.zen .z-spark .b{flex:1;background:linear-gradient(180deg,var(--z-primary) 0,var(--z-primary-600) 100%);border-radius:3px 3px 0 0;min-height:2px}

/* ============ REPORTS SNAPSHOT (Zenoti-style split) ============ */
.zen .z-snap{display:grid;grid-template-columns:340px 1fr;background:var(--z-surface);border:1px solid var(--z-line);border-radius:var(--z-r);box-shadow:var(--z-shadow);overflow:hidden;min-height:560px}
.zen .z-snap-l{border-right:1px solid var(--z-line);background:#FBFBFE;padding:12px;overflow:auto;max-height:calc(100vh - 210px)}
.zen .z-snap-l::-webkit-scrollbar{width:8px}.zen .z-snap-l::-webkit-scrollbar-thumb{background:#D3D3E0;border-radius:20px}
.zen .z-kgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.zen .z-kcard{border:1px solid transparent;border-radius:14px;padding:12px 13px 13px;cursor:pointer;transition:transform .16s,box-shadow .16s;position:relative;text-align:left;overflow:hidden;box-shadow:0 2px 8px rgba(30,32,50,.05);background:linear-gradient(135deg,#EDE9FE 0%,#DCE4FD 100%)}
.zen .z-kcard:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(30,32,50,.13)}
.zen .z-kcard.on{box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(108,79,224,.55),0 8px 20px rgba(30,32,50,.14)}
.zen .z-kcard .kt{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:12px}
.zen .z-kcard .kl{font-size:11px;color:#3A4256;font-weight:800;line-height:1.3;letter-spacing:-.1px}
.zen .z-kcard .kchip{width:28px;height:28px;border-radius:9px;background:rgba(255,255,255,.6);backdrop-filter:blur(2px);display:grid;place-items:center;flex:none;box-shadow:0 1px 3px rgba(30,32,50,.08)}
.zen .z-kcard .kchip svg{width:15px;height:15px}
.zen .z-kcard .kv{font-family:'Bebas Neue';font-size:26px;font-weight:400;letter-spacing:-.4px;color:#161D2E}
.zen .z-kcard .kd{font-size:10px;font-weight:800;margin-top:4px;display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:20px;background:rgba(255,255,255,.55)}
.zen .z-kcard .kd.up{color:#2E7D32}.zen .z-kcard .kd.down{color:#C2255C}.zen .z-kcard .kd.flat{color:var(--z-muted)}
.zen .z-snap-r{padding:18px 20px;display:flex;flex-direction:column;min-width:0}
.zen .z-dtop{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.zen .z-dtop h3{font-size:18px;font-weight:800;display:flex;align-items:center;gap:7px;color:var(--z-ink)}
.zen .z-dtop p{font-size:12px;color:var(--z-muted);margin-top:2px}
.zen .z-tgt{display:flex;align-items:center;gap:20px}
.zen .z-tgt .tc{text-align:right}
.zen .z-tgt .tc .k{font-size:10.5px;color:var(--z-muted);font-weight:700;display:block;margin-bottom:2px;text-transform:uppercase;letter-spacing:.06em}
.zen .z-tgt .tc .v{font-family:'Bebas Neue';font-size:22px;font-weight:400;display:flex;align-items:center;gap:6px;justify-content:flex-end;color:var(--z-ink)}
.zen .z-tgt .tc .v button{background:none;border:none;color:var(--z-muted-2);display:grid;place-items:center;cursor:pointer;padding:0}
.zen .z-tgt .tc .v button:hover{color:var(--z-primary)}
.zen .z-tgt .sep{width:1px;height:34px;background:var(--z-line)}
.zen .z-gauge{position:relative;width:60px;height:60px;flex:none}
.zen .z-gauge svg{transform:rotate(-90deg)}
.zen .z-gauge .gv{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;font-weight:800}
.zen .z-dbody{display:grid;grid-template-columns:1.35fr 1fr;gap:18px;flex:1;align-items:start}
.zen .z-chartbox{border:1px solid var(--z-line);border-radius:12px;padding:14px;min-height:280px}
.zen .z-chart-ttl{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--z-muted-2);margin-bottom:12px}
.zen .z-pieholder{display:flex;justify-content:center;padding:14px 0 6px}
.zen .z-pie{position:relative;width:170px;height:170px;flex:none}
.zen .z-pie svg{width:170px;height:170px;overflow:visible}
.zen .z-pieseg{animation:zenPieGrow 1s cubic-bezier(.34,.85,.32,1) forwards;transition:opacity .15s}
.zen .z-pie svg:hover .z-pieseg{opacity:.35}
.zen .z-pie svg .z-pieseg:hover{opacity:1;filter:drop-shadow(0 2px 5px rgba(30,32,50,.22))}
@keyframes zenPieGrow{to{stroke-dasharray:var(--len) var(--gap)}}
.zen .z-pie-c{position:absolute;inset:0;display:grid;place-items:center;text-align:center;pointer-events:none}
.zen .z-pie-c-v{font-family:'Bebas Neue';font-size:26px;font-weight:400;letter-spacing:-.5px;color:var(--z-ink)}
.zen .z-pie-c-l{font-size:10px;color:var(--z-muted);font-weight:700;margin-top:1px;text-transform:uppercase;letter-spacing:.06em}
.zen .z-bars{display:flex;align-items:flex-end;gap:10px;height:210px;padding-left:32px;position:relative}
.zen .z-bars .yaxis{position:absolute;left:0;top:0;bottom:24px;width:28px;display:flex;flex-direction:column;justify-content:space-between;font-size:9.5px;color:var(--z-muted-2);text-align:right;font-weight:700}
.zen .z-bcol{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px}
.zen .z-bcol .bar{width:100%;max-width:34px;border-radius:4px 4px 2px 2px;min-height:3px;transition:.35s;position:relative}
.zen .z-bcol .bl{font-size:9.5px;color:var(--z-muted);font-weight:700;text-align:center;height:24px;display:flex;align-items:center;justify-content:center;line-height:1.1}
.zen .z-legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:12px;font-size:11.5px;color:var(--z-muted);font-weight:700;justify-content:center}
.zen .z-legend span{display:flex;align-items:center;gap:6px}
.zen .z-legend i{width:9px;height:9px;border-radius:2px}
.zen .z-dtable{border:1px solid var(--z-line);border-radius:12px;overflow:hidden}
.zen .z-dtable table{width:100%;border-collapse:collapse}
.zen .z-dtable th{background:var(--z-line-2);font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--z-muted);text-align:left;padding:10px 13px}
.zen .z-dtable th:last-child,.zen .z-dtable td:last-child{text-align:right}
.zen .z-dtable td{padding:9px 13px;border-top:1px solid var(--z-line-2);font-size:12.5px;color:var(--z-ink-soft)}
.zen .z-dtable td:first-child{display:flex;align-items:center;gap:8px;font-weight:600}
.zen .z-dtable .sw{width:9px;height:9px;border-radius:2px;flex:none}
.zen .z-dtable td:last-child{font-weight:800;font-family:'Bebas Neue';font-size:15px;color:var(--z-ink)}
.zen .z-dfoot{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid var(--z-line-2)}
.zen .z-dfoot a{font-size:12.5px;color:var(--z-primary);font-weight:800;cursor:pointer}
@media(max-width:1080px){.zen .z-snap{grid-template-columns:1fr}.zen .z-dbody{grid-template-columns:1fr}}
`;

// Simple SVG icon set (React-friendly) — subset used across modules.
export const Icon = ({ name, className = '', size = 16 }) => {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="M14 6l4 4" /></>,
    trash: <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />,
    star: <path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17.8 6.6 19.6l1-6L3.3 9.4l6-.9L12 3Z" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    check: <path d="m5 12 5 5L20 6" />,
    chevR: <path d="m9 6 6 6-6 6" />,
    chevD: <path d="m6 9 6 6 6-6" />,
    chevL: <path d="m15 6-6 6 6 6" />,
    scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" /></>,
    box: <><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
    cart: <><path d="M4 5h2l1.5 9.5a1.5 1.5 0 0 0 1.5 1.3h7.2a1.5 1.5 0 0 0 1.5-1.2L20 8H7" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /></>,
    bag: <><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
    truck: <><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></>,
    restock: <><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></>,
    alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17.5v.1" /></>,
    tag: <><path d="M3 3h8l10 10-8 8L3 11V3Z" /><circle cx="7.5" cy="7.5" r="1.4" /></>,
    home: <><path d="M3 9.5 12 3l9 6.5V21H3z" /><path d="M9 21v-6h6v6" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 21c0-3.5 3-5 7-5s7 1.5 7 5" /><path d="M16 5a3.5 3.5 0 0 1 0 7M18 21c0-3-1.5-4.5-3-5" /></>,
    camera: <><path d="M4 8h3l2-2h6l2 2h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></>,
    wallet: <><path d="M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 7V5h13M17 13h.01" /></>,
    cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
    phone: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>,
    building: <><path d="M4 21V4h12v17M16 9h4v12M8 8h1M12 8h1M8 12h1M12 12h1M8 16h1M12 16h1" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    save: <><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v6h7V3M8 21v-7h8v7" /></>,
    filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
    chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    gauge: <><path d="M12 21a9 9 0 1 0-9-9" /><path d="M12 12l4-3" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4.9a7 7 0 0 0-1.7-1L14.4 3h-4l-.4 2a7 7 0 0 0-1.7 1l-2.4-.9-2 3.4L6 10a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-.9a7 7 0 0 0 1.7 1l.4 2h4l.4-2a7 7 0 0 0 1.7-1l2.4.9 2-3.4L19 13a7 7 0 0 0 .1-1Z" /></>,
    pin: <><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="9" r="2.4" /></>,
    ret: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.6" /></>,
    trendup: <><path d="m3 17 6-6 4 4 8-8" /><path d="M17 7h4v4" /></>,
    money: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /><circle cx="12" cy="12" r="2" /></>,
    layers: <><path d="M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 18l10 5 10-5" /></>,
    gift: <><rect x="3" y="9" width="18" height="12" rx="1.5" /><path d="M3 9V7h18v2M12 9v12" /></>,
    download: <><path d="M12 3v13" /><path d="m6 11 6 6 6-6" /><path d="M4 21h16" /></>,
    upload: <><path d="M12 21V8" /><path d="m6 13 6-6 6 6" /><path d="M4 3h16" /></>,
    undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v1" /></>,
    trendUp: <><path d="m3 17 6-6 4 4 8-8" /><path d="M17 7h4v4" /></>,
    trendDn: <><path d="m3 7 6 6 4-4 8 8" /><path d="M17 17h4v-4" /></>,
    file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
    users2: <><circle cx="9" cy="8" r="3.5" /><path d="M2 21c0-3.5 3-5 7-5s7 1.5 7 5" /><circle cx="17" cy="8" r="3" /><path d="M22 21c0-3-1.5-4.5-3-5" /></>,
  };
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || null}
    </svg>
  );
};

export const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export const injectZenCss = (() => {
  let injected = false;
  return () => {
    if (injected || typeof document === 'undefined') return;
    injected = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(link);
    const s = document.createElement('style');
    s.setAttribute('data-zen-ops', '1');
    s.textContent = ZEN_CSS;
    document.head.appendChild(s);
  };
})();
