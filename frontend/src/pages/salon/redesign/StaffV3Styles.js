// Pink-theme scoped stylesheet for the redesigned Staff page.
// Namespaced under `.staffv3` so it never leaks into the rest of the app
// (which uses the golden `.shv2` theme).
export const STAFF_V3_CSS = `
.staffv3{--bg:#F9F5F8;--surface:#FFFFFF;
  --primary:#C6389E;--primary-600:#A82D86;--primary-050:#FCEAF5;--primary-100:#F6D4EA;
  --ink:#241E27;--ink-soft:#4A4150;--muted:#8A7F90;--muted-2:#A99FB0;--line:#EFE8EF;--line-2:#F6F1F6;
  --amber:#E8952B;--amber-bg:#FDF3E4;--teal:#12A594;--teal-bg:#E4F6F3;--red:#E5484D;--red-bg:#FDECEC;
  --sky:#3E93E8;--sky-bg:#E9F2FD;--green:#2FA96A;--green-bg:#E7F6ED;--violet:#8A5CD1;--violet-bg:#F0E9FB;
  --shadow:0 1px 2px rgba(40,26,44,.04),0 6px 20px rgba(40,26,44,.06);--shadow-lg:0 10px 40px rgba(40,26,44,.16);
  --radius:16px;--radius-sm:12px;
  font-family:'Inter',system-ui,sans-serif;color:var(--ink);line-height:1.45;background:var(--bg);
  padding:14px 4px 30px}
.staffv3 h2,.staffv3 h3,.staffv3 h4{font-family:'Plus Jakarta Sans','Inter',sans-serif;font-weight:800;letter-spacing:-.2px;color:var(--ink)}
.staffv3 button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
.staffv3 svg{display:block}
.staffv3 input,.staffv3 select,.staffv3 textarea{font-family:inherit}
.staffv3 .phead{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.staffv3 .phead h2{font-size:22px;font-weight:800;letter-spacing:-.5px;display:flex;align-items:center;gap:10px}
.staffv3 .phead h2 .hic{width:34px;height:34px;border-radius:10px;background:var(--primary-050);color:var(--primary);display:grid;place-items:center}
.staffv3 .phead h2 .hic svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .btn-primary{background:var(--primary);color:#fff;font-size:13px;font-weight:700;padding:11px 17px;border-radius:11px;display:inline-flex;align-items:center;gap:8px;transition:.15s;border:none;cursor:pointer}
.staffv3 .btn-primary:hover{background:var(--primary-600)}
.staffv3 .btn-primary svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .btn-primary:disabled{opacity:.55;cursor:not-allowed}
.staffv3 .btn-ghost{border:1px solid var(--line);color:var(--ink-soft);font-size:13px;font-weight:600;padding:10px 14px;border-radius:11px;display:inline-flex;align-items:center;gap:7px;transition:.15s;background:var(--surface);cursor:pointer}
.staffv3 .btn-ghost:hover{background:var(--line-2)}
.staffv3 .btn-ghost svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .btn-danger{border:1px solid var(--red-bg);color:var(--red);font-size:13px;font-weight:700;padding:9px 13px;border-radius:11px;display:inline-flex;align-items:center;gap:7px;background:var(--red-bg);cursor:pointer}
.staffv3 .btn-danger svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .workspace{display:grid;grid-template-columns:290px 1fr;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;height:calc(100vh - 140px);min-height:520px}
.staffv3 .workspace--full{grid-template-columns:1fr}
.staffv3 .pane-l{border-right:1px solid var(--line);background:#FDFAFC;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.staffv3 .pane-r{min-width:0;display:flex;flex-direction:column;background:#fff;min-height:0;overflow-y:auto}
.staffv3 .list-head{padding:14px 13px 10px;border-bottom:1px solid var(--line)}
.staffv3 .list-head .lt{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.staffv3 .list-head .lt .lt-actions{margin-left:auto;display:flex;align-items:center;gap:6px}
.staffv3 .sq-btn{width:30px;height:30px;border-radius:9px;border:1px solid var(--line);background:var(--surface,#fff);color:var(--muted);display:grid;place-items:center;cursor:pointer;transition:.15s;padding:0}
.staffv3 .sq-btn svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .sq-btn:hover{border-color:var(--primary);color:var(--primary)}
.staffv3 .sq-btn.on{border-color:var(--primary);background:var(--primary-050);color:var(--primary)}
.staffv3 .sq-btn--pri{background:var(--primary);border-color:var(--primary);color:#fff}
.staffv3 .sq-btn--pri:hover{background:var(--primary-600,#5B3FD1);color:#fff}
/* Collapsible Documents section under the staff profile (Aug 2026) */
.staffv3 .doc-collapse{margin-top:18px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface,#fff)}
.staffv3 .doc-collapse-h{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 15px;background:var(--surface,#fff);border:none;cursor:pointer;font-family:inherit}
.staffv3 .doc-collapse-h:hover{background:var(--line-2,#F7F5FA)}
.staffv3 .doc-collapse-h .dch-l{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:800;color:var(--ink)}
.staffv3 .doc-collapse-h .dch-ic{width:17px;height:17px;fill:none;stroke:var(--primary);stroke-width:2}
.staffv3 .doc-collapse-h .dch-ct{font-size:11.5px;font-weight:700;color:var(--muted);background:var(--line-2,#F1EEFA);padding:1px 8px;border-radius:20px}
.staffv3 .doc-collapse-h .dch-chev{width:18px;height:18px;fill:none;stroke:var(--muted);stroke-width:2;transition:transform .18s}
.staffv3 .doc-collapse.open .doc-collapse-h .dch-chev{transform:rotate(180deg)}
.staffv3 .doc-collapse-b{padding:6px 15px 15px;border-top:1px solid var(--line)}
.staffv3 .doc-collapse-b .secttl:first-child{margin-top:8px}
.staffv3 .list-head .lt b{font-size:13.5px;font-weight:800;display:flex;align-items:center;gap:8px;color:var(--ink)}
.staffv3 .list-head .lt b .dotg{width:8px;height:8px;border-radius:50%;background:var(--green)}
.staffv3 .list-head .lt .ct{font-size:12px;color:var(--muted);font-weight:600}
.staffv3 .searchbox{display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:9px 12px;color:var(--muted)}
.staffv3 .searchbox input{border:none;outline:none;background:none;font-size:13px;color:var(--ink);width:100%}
.staffv3 .searchbox svg{width:15px;height:15px;flex:none;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .staff-list{padding:7px;display:flex;flex-direction:column;gap:3px;flex:1;overflow:auto;min-height:0}
.staffv3 .sgroup{border-radius:12px;transition:.14s}
.staffv3 .sgroup.on{background:var(--primary-050);border:1px solid var(--primary-100)}
.staffv3 .sc{display:flex;align-items:center;gap:11px;padding:10px 11px;cursor:pointer;border-radius:12px;transition:.14s}
.staffv3 .sgroup:not(.on) .sc:hover{background:var(--line-2)}
.staffv3 .sc .av{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:14px;flex:none}
.staffv3 .sc .si{flex:1;min-width:0}
.staffv3 .sc .si b{font-size:13.5px;font-weight:700;display:block;color:var(--ink)}
.staffv3 .sc .si span{font-size:11.5px;color:var(--muted);text-transform:capitalize}
.staffv3 .sc .chev{width:15px;height:15px;color:var(--muted-2);fill:none;stroke:currentColor;stroke-width:2.2;transition:.2s;flex:none}
.staffv3 .sgroup.on .sc .chev{transform:rotate(90deg);color:var(--primary)}
.staffv3 .subnav{display:none;padding:1px 8px 8px 11px;flex-direction:column;gap:2px}
.staffv3 .sgroup.on .subnav{display:flex}
.staffv3 .subitem{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:9px;font-size:12.5px;font-weight:600;color:var(--ink-soft);text-align:left;width:100%;transition:.13s;border:none;background:none;cursor:pointer}
.staffv3 .subitem svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;color:var(--muted);flex:none}
.staffv3 .subitem:hover{background:#fff}
.staffv3 .subitem.on{background:var(--primary);color:#fff}
.staffv3 .subitem.on svg{color:#fff}
.staffv3 .dhead{display:flex;align-items:center;gap:14px;padding:15px 20px;border-bottom:1px solid var(--line)}
.staffv3 .dhead .av{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:17px;flex:none}
.staffv3 .dhead .dn{flex:1;min-width:0}
.staffv3 .dhead .dn h3{font-size:17px;font-weight:800;color:var(--ink)}
.staffv3 .dhead .dn .meta{display:flex;gap:11px;margin-top:3px;font-size:11.5px;color:var(--muted);flex-wrap:wrap}
.staffv3 .dhead .dn .meta span{display:flex;align-items:center;gap:5px}
.staffv3 .dhead .dn .meta svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .pane-body{flex:1;overflow:auto;padding:18px 20px}
.staffv3 .secttl{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted-2);margin:6px 0 13px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.staffv3 .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:15px}
.staffv3 .metric{border:1px solid var(--line);border-radius:12px;padding:13px;background:#fff}
.staffv3 .metric .mi{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;margin-bottom:9px}
.staffv3 .metric .mi svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .metric b{font-family:'Plus Jakarta Sans';font-size:19px;font-weight:800;display:block;letter-spacing:-.5px;color:var(--ink)}
.staffv3 .metric span{font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.3px}
.staffv3 .payline{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 15px;background:var(--primary-050);border:1px solid var(--primary-100);border-radius:12px;margin-bottom:18px;flex-wrap:wrap}
.staffv3 .payline .pl b{font-family:'Plus Jakarta Sans';font-size:15px;font-weight:800;color:var(--primary-600);display:block}
.staffv3 .payline .pl span{font-size:11.5px;color:var(--primary-600);opacity:.85;display:block}
.staffv3 .grid2{display:grid;grid-template-columns:1fr 1fr;gap:15px 18px}
.staffv3 .field{display:flex;flex-direction:column;gap:6px}
.staffv3 .field.full{grid-column:1/-1}
.staffv3 .field label{font-size:12.5px;font-weight:600;color:var(--ink-soft)}
.staffv3 .field label .req{color:var(--red)}
.staffv3 .field input,.staffv3 .field select,.staffv3 .field textarea{font-size:13.5px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;outline:none;width:100%;color:var(--ink);background:var(--surface);transition:.15s;font-family:inherit}
.staffv3 .field textarea{min-height:64px;resize:vertical}
.staffv3 .field input:disabled,.staffv3 .field select:disabled,.staffv3 .field textarea:disabled{background:var(--line-2);color:var(--muted);cursor:not-allowed}
.staffv3 .field input:focus,.staffv3 .field select:focus,.staffv3 .field textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-050)}
.staffv3 .idnote{font-size:11.5px;color:var(--primary);font-weight:600;display:flex;align-items:center;gap:5px}
.staffv3 .idnote svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .att-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-bottom:16px}
.staffv3 .att-s{border:1px solid var(--line);border-radius:11px;padding:11px;text-align:center;background:#fff}
.staffv3 .att-s b{font-family:'Plus Jakarta Sans';font-size:17px;font-weight:800;display:block}
.staffv3 .att-s span{font-size:9.5px;color:var(--muted);font-weight:600;text-transform:uppercase}
.staffv3 .att-cal{border:1px solid var(--line);border-radius:12px;padding:10px;background:#fff;margin-bottom:14px;max-width:340px}
.staffv3 .att-cal__dow{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px}
.staffv3 .att-cal__dow span{text-align:center;font-size:9px;font-weight:800;color:var(--muted-2);text-transform:uppercase}
.staffv3 .att-cal__grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.staffv3 .att-cal__cell{border:1px solid var(--line-2);border-radius:7px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;background:var(--line-2);min-height:30px;padding:2px 0}
.staffv3 .att-cal__cell--empty{background:transparent;border:none}
.staffv3 .att-cal__cell b{font-size:11px;font-weight:700;line-height:1.05}
.staffv3 .att-cal__cell em{font-size:7.5px;font-weight:800;font-style:normal;letter-spacing:.2px}
.staffv3 .att-cal__cell[data-status="none"]{color:var(--muted-2)}
.staffv3 .att-cal__legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:9px;padding-top:8px;border-top:1px solid var(--line-2)}
.staffv3 .att-cal__legend span{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:var(--muted)}
.staffv3 .att-cal__legend i{width:9px;height:9px;border-radius:3px;display:inline-block}

.staffv3 .method-note{display:flex;align-items:center;gap:9px;background:var(--sky-bg);border:1px solid #CFE4FA;border-radius:11px;padding:10px 13px;font-size:12px;color:var(--ink-soft);margin-bottom:14px;flex-wrap:wrap}
.staffv3 .method-note svg{width:15px;height:15px;color:var(--sky);fill:none;stroke:currentColor;stroke-width:2;flex:none}
.staffv3 .shift-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:16px}
.staffv3 .shift-c{border:1px solid var(--line);border-radius:11px;padding:10px 12px;background:#fff}
.staffv3 .shift-c .k{font-size:9.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.3px;display:block;margin-bottom:3px}
.staffv3 .shift-c .v{font-size:12.5px;font-weight:700;color:var(--ink)}
.staffv3 .svc-tbl{width:100%;border-collapse:collapse}
.staffv3 .svc-tbl th{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted-2);text-align:left;padding:0 8px 9px}
.staffv3 .svc-tbl td{padding:9px 8px;border-top:1px solid var(--line-2);vertical-align:middle}
.staffv3 .svc-tbl.compact th{padding:0 8px 5px}
.staffv3 .svc-tbl.compact td{padding:5px 8px}
.staffv3 .svc-tbl.compact .svc-n span{font-size:10.5px}
.staffv3 .svc-tbl tr.off td{opacity:.5}
.staffv3 .cbx{width:18px;height:18px;border-radius:6px;border:2px solid var(--line);display:grid;place-items:center;cursor:pointer;transition:.14s;flex:none}
.staffv3 .cbx.on{background:var(--primary);border-color:var(--primary)}
.staffv3 .cbx svg{width:11px;height:11px;fill:none;stroke:#fff;stroke-width:3;opacity:0}
.staffv3 .cbx.on svg{opacity:1}
.staffv3 .svc-n b{font-size:13px;font-weight:700;display:block;color:var(--ink)}
.staffv3 .svc-n span{font-size:11px;color:var(--muted)}
.staffv3 .price-in{border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:12.5px;outline:none;width:96px;text-align:right;font-weight:600;background:#fff;color:var(--ink)}
.staffv3 .price-in:focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-050)}
.staffv3 .price-in:disabled{background:var(--line-2);color:var(--muted-2)}
.staffv3 .base-p{font-size:12.5px;color:var(--muted);font-weight:600}
.staffv3 .ovr{font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:20px;background:var(--amber-bg);color:var(--amber);text-transform:uppercase}
.staffv3 .toggle{width:42px;height:24px;border-radius:20px;background:var(--line);position:relative;transition:.2s;flex:none;cursor:pointer;border:none}
.staffv3 .toggle::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.staffv3 .toggle.on{background:var(--primary)}
.staffv3 .toggle.on::after{left:21px}
.staffv3 .toggle:disabled{opacity:.5;cursor:not-allowed}
.staffv3 .perm-row{display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line-2);gap:12px}
.staffv3 .perm-row:last-child{border-bottom:none}
.staffv3 .perm-row .pn{font-size:13.5px;font-weight:600;color:var(--ink)}
.staffv3 .perm-row .pd{font-size:11px;color:var(--muted);margin-top:2px}
.staffv3 .doc-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line-2)}
.staffv3 .doc-row .di{width:34px;height:34px;border-radius:9px;background:var(--line-2);color:var(--muted);display:grid;place-items:center;flex:none}
.staffv3 .doc-row .di svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .doc-row .dd{flex:1}
.staffv3 .doc-row .dd b{font-size:13px;font-weight:600;display:block;color:var(--ink)}
.staffv3 .doc-row .dd span{font-size:11.5px;color:var(--muted)}
.staffv3-ov{position:fixed;inset:0;background:rgba(36,20,38,.44);opacity:0;visibility:hidden;transition:.28s;z-index:60}
.staffv3-ov.open{opacity:1;visibility:visible}
.staffv3-drawer{position:fixed;top:0;right:0;bottom:0;width:min(500px,95vw);background:#fff;z-index:70;box-shadow:-20px 0 60px rgba(36,20,38,.22);transform:translateX(100%);transition:transform .32s cubic-bezier(.22,.61,.36,1);display:flex;flex-direction:column;font-family:'Inter',sans-serif}
.staffv3-drawer.wide{width:min(760px,96vw)}
.staffv3-drawer.open{transform:translateX(0)}
.staffv3-drawer h3{font-family:'Plus Jakarta Sans';font-size:18px;font-weight:800;color:#241E27}
.staffv3-drawer .dh{display:flex;align-items:center;justify-content:space-between;padding:19px 22px;border-bottom:1px solid #EFE8EF}
.staffv3-drawer .dh .tt{display:flex;align-items:center;gap:12px}
.staffv3-drawer .dh .ic{width:40px;height:40px;border-radius:12px;background:#FCEAF5;color:#C6389E;display:grid;place-items:center}
.staffv3-drawer .dh .ic svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3-drawer .dh p{font-size:12.5px;color:#8A7F90}
.staffv3-drawer .close{width:38px;height:38px;border-radius:11px;background:#F6F1F6;color:#8A7F90;display:grid;place-items:center;border:none;cursor:pointer}
.staffv3-drawer .close:hover{background:#FDECEC;color:#E5484D}
.staffv3-drawer .close svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2.2}
.staffv3-drawer .db{flex:1;overflow:auto;padding:20px 22px}
.staffv3-drawer .df{padding:15px 22px;border-top:1px solid #EFE8EF;display:flex;align-items:center;justify-content:flex-end;gap:10px}
.staffv3-drawer .grid2{display:grid;grid-template-columns:1fr 1fr;gap:15px 18px}
.staffv3-drawer .grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 14px}
.staffv3-drawer .grid3 .field.span2{grid-column:span 2}
.staffv3-drawer .grid3 .field.span3{grid-column:span 3}
@media (max-width: 720px){
  .staffv3-drawer .grid3{grid-template-columns:1fr 1fr}
  .staffv3-drawer .grid3 .field.span2,.staffv3-drawer .grid3 .field.span3{grid-column:1/-1}
}
.staffv3-drawer .dsec-title{font-size:11.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#A99FB0;margin:18px 0 10px;display:flex;align-items:center;gap:8px}
.staffv3-drawer .dsec-title:first-child{margin-top:0}
.staffv3-drawer .dsec-title .dsec-sub{font-size:10.5px;font-weight:600;color:#C1B6C5;text-transform:none;letter-spacing:0}
.staffv3-drawer .doc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
@media (max-width: 720px){.staffv3-drawer .doc-grid{grid-template-columns:1fr 1fr}}
.staffv3-drawer .doc-slot{position:relative;display:flex;align-items:center;gap:10px;padding:11px 12px;border:1.5px dashed #EFE8EF;border-radius:12px;background:#FDFAFC;cursor:pointer;transition:.15s;min-height:58px}
.staffv3-drawer .doc-slot:hover{border-color:#C6389E;background:#FCEAF5}
.staffv3-drawer .doc-slot.has{border-style:solid;border-color:#12A594;background:#E4F6F3}
.staffv3-drawer .doc-slot .ds-ic{width:32px;height:32px;border-radius:10px;background:#fff;color:#C6389E;display:grid;place-items:center;flex:none;box-shadow:0 1px 2px rgba(40,26,44,.04)}
.staffv3-drawer .doc-slot.has .ds-ic{color:#12A594}
.staffv3-drawer .doc-slot .ds-ic svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3-drawer .doc-slot .ds-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.staffv3-drawer .doc-slot .ds-tx b{font-size:12.5px;font-weight:700;color:#241E27;line-height:1.2}
.staffv3-drawer .doc-slot .ds-tx span{font-size:11px;color:#8A7F90;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}
.staffv3-drawer .doc-slot .ds-rm{width:22px;height:22px;border-radius:7px;background:#fff;color:#E5484D;display:grid;place-items:center;border:1px solid #FDECEC;cursor:pointer;flex:none}
.staffv3-drawer .doc-slot .ds-rm svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2.4}
.staffv3-drawer .field{display:flex;flex-direction:column;gap:6px}
.staffv3-drawer .field.full{grid-column:1/-1}
.staffv3-drawer .field label{font-size:12.5px;font-weight:600;color:#4A4150}
.staffv3-drawer .field label .req{color:#E5484D}
.staffv3-drawer .field input,.staffv3-drawer .field select{font-size:13.5px;border:1px solid #EFE8EF;border-radius:10px;padding:10px 12px;outline:none;width:100%;color:#241E27;background:#fff}
.staffv3-drawer .field input:focus,.staffv3-drawer .field select:focus{border-color:#C6389E;box-shadow:0 0 0 3px #FCEAF5}
.staffv3-drawer .idnote{font-size:11.5px;color:#C6389E;font-weight:600;display:flex;align-items:center;gap:5px}
.staffv3-drawer .idnote svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3-drawer .btn-primary{background:#C6389E;color:#fff;font-size:13px;font-weight:700;padding:11px 17px;border-radius:11px;display:inline-flex;align-items:center;gap:8px;border:none;cursor:pointer}
.staffv3-drawer .btn-primary:hover{background:#A82D86}
.staffv3-drawer .btn-primary svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3-drawer .btn-ghost{border:1px solid #EFE8EF;color:#4A4150;font-size:13px;font-weight:600;padding:10px 14px;border-radius:11px;background:#fff;cursor:pointer}
/* Attendance drawer */
.staffv3-drawer .range-row{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;margin-bottom:14px}
.staffv3-drawer .range-row .field{gap:5px}
.staffv3-drawer .range-row .field label{font-size:11.5px}
.staffv3-drawer .range-row .field input{padding:9px 11px;font-size:13px}
.staffv3-drawer .range-row .btn-ghost{padding:9px 12px;height:37px;background:#fff;border:1px solid #EFE8EF;color:#4A4150;font-size:12.5px;font-weight:600;border-radius:10px;display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.staffv3-drawer .range-row .btn-ghost svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3-drawer .bulkbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:#FCEAF5;border:1px solid #F6D4EA;border-radius:11px;padding:9px 10px;margin-bottom:10px}
.staffv3-drawer .bulkbar .bt{font-size:11.5px;font-weight:700;color:#A82D86;margin-right:4px}
.staffv3-drawer .bulkbar .btn-ghost{padding:6px 10px !important;font-size:11.5px;background:#fff;border:1px solid #F6D4EA;color:#A82D86;font-weight:700;border-radius:8px;cursor:pointer}
.staffv3-drawer .bulkbar .btn-ghost:hover{background:#F6D4EA}
.staffv3-drawer .bulkbar .time-in{border:1px solid #EFE8EF;border-radius:7px;padding:4px 7px;font-size:11.5px;width:82px;background:#fff}
.staffv3-drawer .att-table{width:100%;border-collapse:collapse}
.staffv3-drawer .att-table th{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#A99FB0;text-align:left;padding:0 6px 8px;background:#FDFAFC;position:sticky;top:0;z-index:1}
.staffv3-drawer .att-table td{padding:7px 6px;border-top:1px solid #F6F1F6;vertical-align:middle;font-size:12.5px;color:#241E27}
.staffv3-drawer .att-table td .cbx{width:16px;height:16px;border-radius:5px;border:2px solid #EFE8EF;display:grid;place-items:center;cursor:pointer}
.staffv3-drawer .att-table td .cbx.on{background:#C6389E;border-color:#C6389E}
.staffv3-drawer .att-table td .cbx svg{width:10px;height:10px;fill:none;stroke:#fff;stroke-width:3;opacity:0}
.staffv3-drawer .att-table td .cbx.on svg{opacity:1}
.staffv3-drawer .att-table td .time-in{border:1px solid #EFE8EF;border-radius:7px;padding:4px 7px;font-size:11.5px;width:82px;background:#fff}
.staffv3-drawer .att-table td .time-in:disabled{background:#F6F1F6;color:#A99FB0}
.staffv3-drawer .att-table .st-pill{font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.3px}
.staffv3-drawer .att-table .st-P{background:#E7F6ED;color:#2FA96A}
.staffv3-drawer .att-table .st-A{background:#FDECEC;color:#E5484D}
.staffv3-drawer .att-table .st-H{background:#FDF3E4;color:#E8952B}
.staffv3-drawer .att-table .st-HO{background:#E9F2FD;color:#3E93E8}
.staffv3-drawer .att-table .st-L{background:#F0E9FB;color:#8A5CD1}
.staffv3-drawer .att-table .st-{background:#F6F1F6;color:#8A7F90}
.staffv3-drawer.wide{width:min(720px,95vw)}
.staffv3-drawer .db-scroll{flex:1;overflow:auto;padding:18px 22px}
.staffv3-drawer .payline{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 15px;background:#FCEAF5;border:1px solid #F6D4EA;border-radius:12px;margin-top:16px}
.staffv3-drawer .payline .pl{display:flex;flex-direction:column}
.staffv3-drawer .payline .pl span{font-size:11.5px;color:#A82D86;opacity:.85}
.staffv3-drawer .payline .pl b{font-family:'Plus Jakarta Sans';font-size:17px;font-weight:800;color:#A82D86}
.staffv3 .rbac-lock{padding:32px;text-align:center;color:var(--muted);font-size:14px}
.staffv3 .rbac-lock svg{width:44px;height:44px;color:var(--muted-2);margin:0 auto 10px;fill:none;stroke:currentColor;stroke-width:2}
/* Monthly attendance calendar */
.staffv3 .att-cal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.staffv3 .att-cal-head .mm{display:flex;align-items:center;gap:8px}
.staffv3 .att-cal-head .mm b{font-family:'Plus Jakarta Sans';font-size:15px;font-weight:800;color:var(--ink);min-width:150px;text-align:center}
.staffv3 .att-cal-head .mm button{width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink-soft);display:grid;place-items:center;cursor:pointer;transition:.14s}
.staffv3 .att-cal-head .mm button:hover{background:var(--line-2)}
.staffv3 .att-cal-head .mm button:disabled{opacity:.4;cursor:not-allowed}
.staffv3 .att-cal-head .mm button svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.4}
.staffv3 .att-legend{display:flex;flex-wrap:wrap;gap:8px 12px;font-size:11px;color:var(--muted);font-weight:600;margin-top:2px}
.staffv3 .att-legend .lg{display:flex;align-items:center;gap:5px}
.staffv3 .att-legend .lg .sw{width:10px;height:10px;border-radius:3px}
.staffv3 .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:12px}
.staffv3 .cal-dow{font-size:10px;font-weight:700;color:var(--muted-2);text-transform:uppercase;letter-spacing:.5px;text-align:center;padding:4px 0}
.staffv3 .cal-cell{aspect-ratio:1;min-height:44px;border-radius:9px;border:1px solid var(--line);background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;transition:.13s;font-weight:600;color:var(--ink);position:relative;padding:3px;user-select:none}
.staffv3 .cal-cell:hover{border-color:var(--primary-100);transform:translateY(-1px);box-shadow:0 3px 10px rgba(198,56,158,.10)}
.staffv3 .cal-cell.disabled{opacity:.35;cursor:not-allowed;background:var(--line-2)}
.staffv3 .cal-cell.disabled:hover{transform:none;box-shadow:none;border-color:var(--line)}
.staffv3 .cal-cell.other{opacity:.28;pointer-events:none}
.staffv3 .cal-cell .dnum{font-size:13.5px;font-weight:700;line-height:1}
.staffv3 .cal-cell .stag{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;padding:1px 5px;border-radius:6px}
.staffv3 .cal-cell.today{outline:2px solid var(--primary);outline-offset:1px}
.staffv3 .cal-cell.st-present{background:var(--green-bg);border-color:#B7E5CB}
.staffv3 .cal-cell.st-present .stag{background:var(--green);color:#fff}
.staffv3 .cal-cell.st-half_day{background:var(--amber-bg);border-color:#F6D9A8}
.staffv3 .cal-cell.st-half_day .stag{background:var(--amber);color:#fff}
.staffv3 .cal-cell.st-absent{background:var(--red-bg);border-color:#F6C6C8}
.staffv3 .cal-cell.st-absent .stag{background:var(--red);color:#fff}
.staffv3 .cal-cell.st-holiday{background:var(--sky-bg);border-color:#CFE4FA}
.staffv3 .cal-cell.st-holiday .stag{background:var(--sky);color:#fff}
.staffv3 .cal-cell.st-on_leave,.staffv3 .cal-cell.st-leave{background:var(--violet-bg);border-color:#DACAF4}
.staffv3 .cal-cell.st-on_leave .stag,.staffv3 .cal-cell.st-leave .stag{background:var(--violet);color:#fff}
.staffv3 .cal-hint{font-size:11.5px;color:var(--muted);margin-top:8px;display:flex;align-items:center;gap:6px}
.staffv3 .cal-hint svg{width:13px;height:13px;color:var(--primary);fill:none;stroke:currentColor;stroke-width:2}
/* Documents upload */
.staffv3 .doc-row .actions{display:flex;align-items:center;gap:6px}
.staffv3 .doc-row .actions button{border:1px solid var(--line);background:#fff;color:var(--ink-soft);width:32px;height:32px;border-radius:9px;display:grid;place-items:center;cursor:pointer;transition:.13s}
.staffv3 .doc-row .actions button:hover{background:var(--line-2)}
.staffv3 .doc-row .actions button.danger{color:var(--red);border-color:var(--red-bg)}
.staffv3 .doc-row .actions button.danger:hover{background:var(--red-bg)}
.staffv3 .doc-row .actions button svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.staffv3 .doc-row .di.done{background:var(--green-bg);color:var(--green)}
.staffv3 .doc-row .di.pending{background:var(--amber-bg);color:var(--amber)}
.staffv3 .doc-row .di.empty{background:var(--line-2);color:var(--muted)}
.staffv3 .doc-preview-ov{position:fixed;inset:0;background:rgba(36,20,38,.68);z-index:80;display:flex;align-items:center;justify-content:center;padding:24px}
.staffv3 .doc-preview{background:#fff;border-radius:16px;max-width:800px;max-height:90vh;width:100%;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow-lg)}
.staffv3 .doc-preview .ph{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line)}
.staffv3 .doc-preview .ph b{font-family:'Plus Jakarta Sans';font-size:15px;font-weight:800;color:var(--ink)}
.staffv3 .doc-preview .ph .close{width:34px;height:34px;border-radius:10px;background:var(--line-2);color:var(--muted);display:grid;place-items:center;cursor:pointer;border:none}
.staffv3 .doc-preview .ph .close svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2}
.staffv3 .doc-preview .pb{flex:1;overflow:auto;padding:18px;background:var(--line-2);display:flex;align-items:center;justify-content:center;min-height:280px}
.staffv3 .doc-preview .pb img{max-width:100%;max-height:70vh;border-radius:10px;box-shadow:var(--shadow)}
.staffv3 .doc-preview .pb iframe{width:100%;height:70vh;border:none;border-radius:10px;background:#fff}
.staffv3 .doc-preview .pb .empty{color:var(--muted);font-size:13px;text-align:center;padding:40px}
@media(max-width:1050px){
  .staffv3 .workspace{grid-template-columns:1fr}
  .staffv3 .pane-l{border-right:none;border-bottom:1px solid var(--line)}
  .staffv3 .metrics{grid-template-columns:1fr 1fr}
  .staffv3 .shift-grid{grid-template-columns:1fr 1fr}
  .staffv3 .att-summary{grid-template-columns:repeat(3,1fr)}
}
/* Payment type pills inside the salary drawer */
.staffv3-drawer .paytype-row{display:flex;gap:8px;background:#F6F1F6;border:1px solid #EFE8EF;padding:5px;border-radius:12px;margin-bottom:16px}
.staffv3-drawer .paytype-pill{flex:1;padding:9px 12px;border-radius:9px;background:transparent;border:none;font-size:13px;font-weight:700;color:#8A7F90;cursor:pointer;transition:.15s;letter-spacing:.2px}
.staffv3-drawer .paytype-pill:hover{color:#4A4150}
.staffv3-drawer .paytype-pill.on{background:#fff;color:#C6389E;box-shadow:0 1px 2px rgba(40,26,44,.04),0 3px 10px rgba(40,26,44,.05)}
/* Payment history table inside Attendance body */
.staffv3 .pay-history{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff;margin-top:6px}
.staffv3 .pay-history .pay-tbl{width:100%;border-collapse:collapse}
.staffv3 .pay-history .pay-tbl th{background:#FDFAFC;padding:9px 12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted-2);text-align:left;border-bottom:1px solid var(--line)}
.staffv3 .pay-history .pay-tbl td{padding:10px 12px;border-top:1px solid var(--line-2);font-size:12.5px;color:var(--ink)}
.staffv3 .pay-history .pay-tbl tr:first-child td{border-top:none}
.staffv3 .pay-badge{display:inline-block;font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.3px}
.staffv3 .pay-badge.pay-salary{background:var(--green-bg);color:var(--green)}
.staffv3 .pay-badge.pay-advance{background:var(--amber-bg);color:var(--amber)}
.staffv3 .pay-badge.pay-ff{background:var(--violet-bg);color:var(--violet)}
/* Profile photo upload */
.staffv3 .profile-photo-row{display:flex;align-items:center;gap:14px;padding:12px 14px;background:#FDFAFC;border:1px solid var(--line);border-radius:12px;margin:6px 0 14px}
.staffv3 .pp-thumb{width:64px;height:64px;border-radius:50%;background:#F0E7EF center/cover no-repeat;display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden;color:#C6389E;font-family:'Plus Jakarta Sans';font-size:22px;font-weight:800}
.staffv3 .pp-title{font-size:13px;font-weight:800;color:var(--ink)}
.staffv3 .pp-sub{font-size:11.5px;color:var(--muted);margin:2px 0 8px}
/* Clickable phone number */
.staffv3 .tel-link{display:inline-flex;align-items:center;text-decoration:none;font-size:13px;font-weight:700;color:#C6389E;padding:9px 12px;border:1px solid #EFE1EB;border-radius:8px;background:#FDF7FB;height:38px;box-sizing:border-box}
.staffv3 .tel-link:hover{background:#F8ECF3;text-decoration:none}
`;
