// styles_v2.js — additional .shv2 styles for Marketing V2 and Customers (Guests) V2 pages.
// Extends the tokens defined in salon/home_v2/styles.js (do NOT duplicate them).
// Class names lifted from the design mocks so the JSX from the mocks maps 1:1.

export const V2_PAGES_CSS = `
/* ============ COMMON HEADER + BUTTONS ============ */
.shv2 .phead{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.shv2 .phead h2{font-size:24px;font-weight:800;letter-spacing:-.5px;display:flex;align-items:center;gap:10px;font-family:'Plus Jakarta Sans','Inter',sans-serif}
.shv2 .phead h2 .hic{width:34px;height:34px;border-radius:10px;background:var(--primary-050);color:var(--primary);display:grid;place-items:center}
.shv2 .phead h2 .hic svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2}
.shv2 .phead p{font-size:13px;color:var(--muted);margin-top:4px}
.shv2 .btn-primary{background:var(--primary);color:#fff;font-size:13px;font-weight:700;padding:11px 17px;border-radius:11px;display:inline-flex;align-items:center;gap:8px;transition:.15s;border:none;cursor:pointer;font-family:inherit}
.shv2 .btn-primary:hover{background:var(--primary-600)}
.shv2 .btn-primary:disabled{opacity:.5;cursor:not-allowed}
.shv2 .btn-primary svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.shv2 .btn-ghost{border:1px solid var(--line);color:var(--ink-soft);font-size:13px;font-weight:600;padding:10px 15px;border-radius:11px;display:inline-flex;align-items:center;gap:7px;transition:.15s;background:var(--surface);cursor:pointer;font-family:inherit}
.shv2 .btn-ghost:hover{background:var(--line-2)}
.shv2 .btn-ghost svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.shv2 .btn-wa{background:var(--wa);color:#fff;font-size:12.5px;font-weight:700;padding:9px 14px;border-radius:10px;display:inline-flex;align-items:center;gap:7px;border:none;cursor:pointer;font-family:inherit}
.shv2 .btn-wa svg{width:15px;height:15px;fill:currentColor;stroke:none}

/* ============ MARKETING SUB-TABS ============ */
.shv2 .subtabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px}
.shv2 .subtab{display:flex;align-items:center;gap:8px;padding:9px 15px;border-radius:11px;font-size:13px;font-weight:600;color:var(--muted);border:1px solid var(--line);background:var(--surface);transition:.15s;cursor:pointer;font-family:inherit}
.shv2 .subtab svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}
.shv2 .subtab:hover{border-color:var(--primary-100);color:var(--ink-soft)}
.shv2 .subtab.on{background:var(--primary);color:#fff;border-color:var(--primary)}

/* ============ MARKETING KPIs (row of 6) ============ */
.shv2 .mk-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:18px}
.shv2 .mk-kpi{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:15px}
.shv2 .mk-kpi .chip{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;margin-bottom:11px}
.shv2 .mk-kpi .chip svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}
.shv2 .mk-kpi b{font-family:'Plus Jakarta Sans';font-size:20px;font-weight:800;display:block;letter-spacing:-.5px}
.shv2 .mk-kpi span{font-size:10.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.3px}
.shv2 .mk-kpi small{font-size:11px;font-weight:700;display:block;margin-top:3px}

/* ============ GRID + CARD ============ */
.shv2 .v2-grid2{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;margin-bottom:18px}
.shv2 .v2-grid2b{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}

/* ============ CAMPAIGN LIST ROWS ============ */
.shv2 .clist{display:flex;flex-direction:column;gap:10px}
.shv2 .crow{display:flex;align-items:center;gap:13px;padding:13px 14px;border:1px solid var(--line);border-radius:12px;transition:.14s}
.shv2 .crow:hover{border-color:var(--primary-100);background:var(--primary-050)}
.shv2 .crow .ci{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:none}
.shv2 .crow .ci svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2}
.shv2 .crow .cn{flex:1;min-width:0}
.shv2 .crow .cn b{font-size:13.5px;font-weight:700;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shv2 .crow .cn span{font-size:11.5px;color:var(--muted)}
.shv2 .crow .cstat{font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:20px;text-transform:uppercase;letter-spacing:.2px}
.shv2 .cstat.live,.shv2 .cstat.running{background:var(--green-bg);color:var(--green)}
.shv2 .cstat.sched,.shv2 .cstat.scheduled{background:var(--sky-bg);color:var(--sky)}
.shv2 .cstat.draft{background:var(--line-2);color:var(--muted)}
.shv2 .cstat.done,.shv2 .cstat.completed{background:var(--violet-bg);color:var(--violet)}
.shv2 .cstat.paused{background:var(--amber-bg);color:var(--amber)}
.shv2 .crow .cmet{text-align:right;flex:none}
.shv2 .crow .cmet b{font-family:'Plus Jakarta Sans';font-size:14px;font-weight:800;color:var(--green);display:block}
.shv2 .crow .cmet span{font-size:10.5px;color:var(--muted)}

/* ============ CHANNEL BAR ============ */
.shv2 .chan .cl{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);font-weight:600;margin-bottom:9px}
.shv2 .chan-bar{height:12px;border-radius:20px;overflow:hidden;display:flex;background:var(--line-2)}
.shv2 .chan-bar i{height:100%}
.shv2 .chan-leg{display:flex;flex-direction:column;gap:9px;margin-top:16px}
.shv2 .chan-leg .r{display:flex;align-items:center;gap:9px;font-size:13px}
.shv2 .chan-leg .r i{width:9px;height:9px;border-radius:3px;flex:none}
.shv2 .chan-leg .r .nm{flex:1;font-weight:600}
.shv2 .chan-leg .r .v{font-family:'Plus Jakarta Sans';font-weight:800}

/* ============ SEGMENT CARDS ============ */
.shv2 .seg-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.shv2 .seg-card{border:1px solid var(--line);border-radius:12px;padding:13px 14px;transition:.14s;background:var(--surface)}
.shv2 .seg-card:hover{border-color:var(--primary-100)}
.shv2 .seg-card .st{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;margin-bottom:8px}
.shv2 .seg-card .st .d{width:8px;height:8px;border-radius:50%;flex:none}
.shv2 .seg-card .sc{font-family:'Plus Jakarta Sans';font-size:20px;font-weight:800}
.shv2 .seg-card .sc small{font-size:11px;color:var(--muted);font-weight:600}
.shv2 .seg-card button.seg-send{margin-top:10px;font-size:11.5px;font-weight:700;color:var(--wa);background:var(--wa-bg);padding:6px 11px;border-radius:9px;display:flex;align-items:center;gap:6px;width:100%;justify-content:center;border:none;cursor:pointer}
.shv2 .seg-card button.seg-send svg{width:13px;height:13px;fill:currentColor;stroke:none}

/* ============ AUTOMATIONS ============ */
.shv2 .auto-row{display:flex;align-items:center;gap:13px;padding:13px 4px;border-bottom:1px solid var(--line-2)}
.shv2 .auto-row:last-child{border-bottom:none}
.shv2 .auto-row .ai{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex:none}
.shv2 .auto-row .ai svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2}
.shv2 .auto-row .an{flex:1}
.shv2 .auto-row .an b{font-size:13.5px;font-weight:700;display:block}
.shv2 .auto-row .an span{font-size:11.5px;color:var(--muted)}
.shv2 .toggle{width:42px;height:24px;border-radius:20px;background:var(--line);position:relative;transition:.2s;flex:none;border:none;cursor:pointer}
.shv2 .toggle::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.shv2 .toggle.on{background:var(--wa)}
.shv2 .toggle.on::after{left:21px}

/* ============ COUPONS ============ */
.shv2 .coupon{display:flex;align-items:stretch;gap:0;border:1px dashed var(--primary-100);border-radius:12px;overflow:hidden;background:var(--primary-050)}
.shv2 .coupon .cv{background:var(--primary);color:#fff;padding:16px 14px;text-align:center;flex:none;width:96px;display:flex;flex-direction:column;justify-content:center}
.shv2 .coupon .cv b{font-family:'Plus Jakarta Sans';font-size:22px;font-weight:800;display:block;line-height:1}
.shv2 .coupon .cv span{font-size:10px;opacity:.9}
.shv2 .coupon .cd{padding:12px 15px;flex:1;min-width:0}
.shv2 .coupon .cd b{font-size:13.5px;font-weight:700;display:block}
.shv2 .coupon .cd span{font-size:11.5px;color:var(--muted)}
.shv2 .coupon .code{font-family:'Plus Jakarta Sans';font-weight:800;font-size:12px;color:var(--primary);background:#fff;border:1px solid var(--primary-100);padding:4px 9px;border-radius:7px;margin-top:6px;display:inline-block}

/* ============ TEMPLATES ============ */
.shv2 .tmpl{border:1px solid var(--line);border-radius:12px;padding:14px;position:relative;background:var(--surface)}
.shv2 .tmpl .wa-badge{position:absolute;top:12px;right:12px;font-size:9.5px;font-weight:800;color:var(--wa);background:var(--wa-bg);padding:3px 8px;border-radius:20px;letter-spacing:.2px}
.shv2 .tmpl b{font-size:13px;font-weight:700}
.shv2 .tmpl .bubble{background:var(--wa-bg);border:1px solid #CDEBD9;border-radius:12px;border-top-left-radius:4px;padding:11px 13px;font-size:12.5px;color:var(--ink-soft);margin-top:10px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.shv2 .tmpl .status{font-size:10.5px;font-weight:700;margin-top:10px;display:flex;align-items:center;gap:5px}
.shv2 .tmpl .status.appr,.shv2 .tmpl .status.approved{color:var(--green)}
.shv2 .tmpl .status.pend,.shv2 .tmpl .status.pending{color:var(--amber)}
.shv2 .tmpl .status.reject,.shv2 .tmpl .status.rejected{color:var(--rose)}
.shv2 .tmpl .status svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.5}

.shv2 .placeholder{border:1px dashed var(--line);border-radius:14px;padding:40px;text-align:center;color:var(--muted);background:var(--surface)}
.shv2 .placeholder .pi{width:52px;height:52px;border-radius:14px;background:var(--primary-050);color:var(--primary);display:grid;place-items:center;margin:0 auto 14px}
.shv2 .placeholder .pi svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.8}
.shv2 .placeholder b{font-size:15px;font-weight:700;color:var(--ink);display:block;margin-bottom:5px}
.shv2 .placeholder p{font-size:13px}

/* ============ CUSTOMERS PAGE ============ */
.shv2 .v2-searchbox{display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:9px 14px;width:300px;color:var(--muted)}
.shv2 .v2-searchbox input{border:none;outline:none;background:none;font-size:13.5px;color:var(--ink);width:100%;font-family:inherit}
.shv2 .v2-searchbox svg{width:17px;height:17px;flex:none;fill:none;stroke:currentColor;stroke-width:2}
.shv2 .kstrip{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:18px}
.shv2 .kc{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:15px}
.shv2 .kc .chip{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;margin-bottom:10px}
.shv2 .kc .chip svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}
.shv2 .kc b{font-family:'Plus Jakarta Sans';font-size:20px;font-weight:800;display:block;letter-spacing:-.5px}
.shv2 .kc span{font-size:10.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.3px}
.shv2 .toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.shv2 .filter{display:flex;gap:7px;flex-wrap:wrap}
.shv2 .fchip{font-size:12.5px;font-weight:600;color:var(--muted);border:1px solid var(--line);background:var(--surface);padding:8px 13px;border-radius:20px;transition:.14s;display:flex;align-items:center;gap:6px;cursor:pointer;font-family:inherit}
.shv2 .fchip:hover{border-color:var(--primary-100)}
.shv2 .fchip.on{background:var(--primary);color:#fff;border-color:var(--primary)}
.shv2 .fchip b{font-weight:800}
.shv2 .tbl-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.shv2 .v2-table{width:100%;border-collapse:collapse}
.shv2 .v2-table th{text-align:left;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted-2);padding:14px 16px 12px;background:var(--surface)}
.shv2 .v2-table td{padding:13px 16px;border-top:1px solid var(--line-2);font-size:13px;vertical-align:middle}
.shv2 .v2-table tr.grow:hover td{background:var(--line-2);cursor:pointer}
.shv2 .gname{display:flex;align-items:center;gap:12px;font-weight:600}
.shv2 .g-av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:14px;flex:none;background-size:cover;background-position:center}
.shv2 .pill{font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:20px}
.shv2 .pill.vip{background:var(--amber-bg);color:var(--amber)}
.shv2 .pill.new{background:var(--green-bg);color:var(--green)}
.shv2 .pill.reg{background:var(--sky-bg);color:var(--sky)}
.shv2 .pill.lapsed{background:var(--rose-bg);color:var(--rose)}
.shv2 .pill.mem{background:var(--violet-bg);color:var(--violet)}
.shv2 .g-tags{display:flex;gap:5px;flex-wrap:wrap}
.shv2 .spend{font-family:'Plus Jakarta Sans';font-weight:800}

/* ============ GUEST PROFILE DRAWER (right side) ============ */
.shv2 .gp-head{padding:22px 24px;border-bottom:1px solid var(--line);position:relative}
.shv2 .gp-close{position:absolute;top:18px;right:20px;width:36px;height:36px;border-radius:11px;background:var(--line-2);color:var(--muted);display:grid;place-items:center;border:none;cursor:pointer}
.shv2 .gp-close:hover{background:var(--rose-bg);color:var(--rose)}
.shv2 .gp-close svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2}
.shv2 .gp-top{display:flex;align-items:center;gap:15px}
.shv2 .gp-top .g-av{width:60px;height:60px;font-size:22px}
.shv2 .gp-top h3{font-size:20px;font-family:'Plus Jakarta Sans','Inter',sans-serif;font-weight:800}
.shv2 .gp-top .sub{font-size:13px;color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.shv2 .gp-actions{display:flex;gap:9px;margin-top:16px;flex-wrap:wrap}
.shv2 .gp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}
.shv2 .gp-stat{background:var(--line-2);border-radius:11px;padding:11px 12px;text-align:center}
.shv2 .gp-stat b{font-family:'Plus Jakarta Sans';font-size:16px;font-weight:800;display:block}
.shv2 .gp-stat span{font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.3px}
.shv2 .gp-tabs{display:flex;gap:4px;padding:0 24px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.shv2 .gp-tab{padding:13px 14px;font-size:13px;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;border-left:none;border-right:none;border-top:none;background:none;cursor:pointer;font-family:inherit}
.shv2 .gp-tab.on{color:var(--primary);border-bottom-color:var(--primary)}
.shv2 .gp-body{flex:1;overflow:auto;padding:22px 24px}
.shv2 .row-line{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line-2);font-size:13px;gap:12px}
.shv2 .row-line .k{color:var(--muted);font-weight:600}
.shv2 .row-line .v{font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%}
.shv2 .visit{display:flex;gap:13px;padding:13px 0;border-bottom:1px solid var(--line-2)}
.shv2 .visit .vd{width:44px;text-align:center;flex:none}
.shv2 .visit .vd b{font-family:'Plus Jakarta Sans';font-size:16px;font-weight:800;display:block}
.shv2 .visit .vd span{font-size:10px;color:var(--muted);text-transform:uppercase}
.shv2 .visit .vi{flex:1;min-width:0}
.shv2 .visit .vi b{font-size:13.5px;font-weight:700;display:block}
.shv2 .visit .vi span{font-size:11.5px;color:var(--muted)}
.shv2 .visit .vp{text-align:right}
.shv2 .visit .vp b{font-family:'Plus Jakarta Sans';font-weight:800;font-size:14px;display:block}
.shv2 .visit .vp a{font-size:11px;color:var(--primary);font-weight:700;cursor:pointer}
.shv2 .msg-log{display:flex;flex-direction:column;gap:10px}
.shv2 .ml{display:flex;gap:10px;align-items:flex-start}
.shv2 .ml .mi{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;flex:none;margin-top:2px}
.shv2 .ml .mi svg{width:14px;height:14px}
.shv2 .ml .mb{flex:1;background:var(--line-2);border-radius:11px;padding:10px 12px;font-size:12.5px}
.shv2 .ml .mb .mt{font-size:10.5px;color:var(--muted-2);margin-top:4px}
.shv2 .ml.out .mb{background:var(--wa-bg)}
.shv2 .v2-field,.shv2-drawer .v2-field{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}
.shv2 .v2-field label,.shv2-drawer .v2-field label{font-size:12.5px;font-weight:600;color:#3C3F4E}
.shv2 .v2-field input,.shv2 .v2-field select,.shv2 .v2-field textarea,.shv2-drawer .v2-field input,.shv2-drawer .v2-field select,.shv2-drawer .v2-field textarea{font-size:13.5px;border:1px solid #ECECF3;border-radius:10px;padding:11px 13px;outline:none;width:100%;color:#23252F;background:#fff;font-family:inherit;font-weight:600;box-sizing:border-box}
.shv2 .v2-field textarea,.shv2-drawer .v2-field textarea{resize:vertical;min-height:90px}
.shv2 .v2-field input:focus,.shv2 .v2-field select:focus,.shv2 .v2-field textarea:focus,.shv2-drawer .v2-field input:focus,.shv2-drawer .v2-field select:focus,.shv2-drawer .v2-field textarea:focus{border-color:#6C4FE0;box-shadow:0 0 0 3px #F1EEFF}
.shv2 .ch-pick,.shv2-drawer .ch-pick{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.shv2 .ch-pick button,.shv2-drawer .ch-pick button{border:1px solid #ECECF3;border-radius:10px;padding:11px;font-size:12.5px;font-weight:700;color:#7C8092;display:flex;flex-direction:column;align-items:center;gap:6px;background:#fff;cursor:pointer;font-family:inherit}
.shv2 .ch-pick button svg,.shv2-drawer .ch-pick button svg{width:18px;height:18px}
.shv2 .ch-pick button.on,.shv2-drawer .ch-pick button.on{border-color:#25D366;background:#E7F9EF;color:#25D366}

/* Drawer buttons — reuse the same primary/ghost styling regardless of parent */
.shv2 .btn-primary,.shv2-drawer .btn-primary{background:#6C4FE0;color:#fff;padding:10px 16px;border-radius:11px;font-weight:700;font-size:13.5px;display:inline-flex;align-items:center;gap:8px;border:none;cursor:pointer;font-family:inherit;transition:.15s}
.shv2 .btn-primary:hover:not(:disabled),.shv2-drawer .btn-primary:hover:not(:disabled){background:#5B3FD1}
.shv2 .btn-primary:disabled,.shv2-drawer .btn-primary:disabled{opacity:.55;cursor:not-allowed}
.shv2 .btn-primary svg,.shv2-drawer .btn-primary svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}
.shv2 .btn-ghost,.shv2-drawer .btn-ghost{background:#F3F3F8;color:#3C3F4E;padding:10px 14px;border-radius:11px;font-weight:700;font-size:13.5px;display:inline-flex;align-items:center;gap:8px;border:1px solid #ECECF3;cursor:pointer;font-family:inherit;transition:.15s}
.shv2 .btn-ghost:hover:not(:disabled),.shv2-drawer .btn-ghost:hover:not(:disabled){background:#EFEBFE;color:#6C4FE0;border-color:#E7E2FF}
.shv2 .btn-ghost:disabled,.shv2-drawer .btn-ghost:disabled{opacity:.55;cursor:not-allowed}
.shv2 .btn-ghost svg,.shv2-drawer .btn-ghost svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}

/* Right-side drawers (v2) - reuse the .shv2-drawer / .shv2-overlay from home_v2 styles */
.shv2-drawer.v2-narrow{width:min(600px,95vw)}
.shv2-drawer .v2-dh{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #ECECF3}
.shv2-drawer .v2-dh .tt{display:flex;align-items:center;gap:12px}
.shv2-drawer .v2-dh .ic{width:40px;height:40px;border-radius:12px;background:#F1EEFF;color:#6C4FE0;display:grid;place-items:center}
.shv2-drawer .v2-dh .ic svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2}
.shv2-drawer .v2-dh h3{font-size:18px;font-weight:800;font-family:'Plus Jakarta Sans','Inter',sans-serif}
.shv2-drawer .v2-dh p{font-size:12.5px;color:#7C8092;margin-top:2px}
.shv2-drawer .v2-close{width:38px;height:38px;border-radius:11px;background:#F3F3F8;color:#7C8092;display:grid;place-items:center;transition:.15s;cursor:pointer;border:none}
.shv2-drawer .v2-close:hover{background:#FCEAF1;color:#E45C86}
.shv2-drawer .v2-close svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2.2}
.shv2-drawer .v2-db{flex:1;overflow:auto;padding:22px 24px}
.shv2-drawer .v2-df{padding:16px 24px;border-top:1px solid #ECECF3;display:flex;justify-content:flex-end;gap:10px;background:#fff}

/* Media/Gallery grid */
.shv2 .media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.shv2 .media-tile{position:relative;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:var(--line-2);border:1px solid var(--line)}
.shv2 .media-tile img,.shv2 .media-tile video{width:100%;height:100%;object-fit:cover;display:block}
.shv2 .media-tile .rm{position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:8px;background:rgba(228,92,134,.9);color:#fff;display:grid;place-items:center;border:none;cursor:pointer;opacity:0;transition:.15s}
.shv2 .media-tile:hover .rm{opacity:1}
.shv2 .social-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-top:12px}
.shv2 .social-tile{border-radius:12px;padding:14px;color:#fff;position:relative;cursor:not-allowed;opacity:.9;display:flex;flex-direction:column;gap:6px}
.shv2 .social-tile b{font-size:13px;font-weight:800}
.shv2 .social-tile span{font-size:11px;opacity:.9}
.shv2 .social-tile .soon{position:absolute;top:8px;right:8px;font-size:9px;font-weight:800;letter-spacing:.4px;background:rgba(0,0,0,.35);padding:3px 7px;border-radius:20px;text-transform:uppercase}

/* Reputation review row (reused .crow) */
.shv2 .rev-avatar{width:36px;height:36px;border-radius:10px;background:var(--amber-bg);color:var(--amber);display:grid;place-items:center;font-family:'Plus Jakarta Sans';font-weight:800;font-size:18px;flex:none}

/* Responsive */
@media(max-width:1150px){
  .shv2 .mk-kpis{grid-template-columns:repeat(3,1fr)}
  .shv2 .v2-grid2,.shv2 .v2-grid2b,.shv2 .seg-grid{grid-template-columns:1fr}
  .shv2 .kstrip{grid-template-columns:repeat(3,1fr)}
  .shv2 .gp-stats{grid-template-columns:repeat(2,1fr)}
  .shv2 .v2-searchbox{width:220px}
}
@media(max-width:820px){
  .shv2 .mk-kpis,.shv2 .kstrip{grid-template-columns:1fr 1fr}
  .shv2 .ch-pick{grid-template-columns:1fr}
  .shv2 td.hide,.shv2 th.hide{display:none}
}
`;
