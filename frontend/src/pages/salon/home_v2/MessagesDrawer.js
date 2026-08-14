/**
 * MessagesDrawer — WhatsApp-style guest conversations for the right ribbon.
 * Aggregates booking activity, stored WhatsApp/in-app messages and marketing
 * sends per customer. Composer has a promotional-template dropdown and every
 * WhatsApp message carries a small "WhatsApp · Twilio" tag.
 *
 * Look & feel mirrors salon_home V.1.html (scoped under .msgdrw).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CSS = `
.msgdrw-ov{position:fixed;inset:0;background:rgba(20,16,40,.45);z-index:4000;backdrop-filter:blur(2px)}
.msgdrw{position:fixed;top:0;right:0;height:100vh;width:min(920px,98vw);background:#fff;z-index:4001;display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(20,16,40,.3);font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.msgdrw__h{display:flex;align-items:center;gap:12px;padding:15px 20px;border-bottom:1px solid #ECE9F5}
.msgdrw__h .ic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:#E4F6EC;color:#25D366;flex:none}
.msgdrw__h .ic svg{fill:currentColor;stroke:none;width:20px;height:20px}
.msgdrw__h h3{margin:0;font-size:16px;font-weight:800;color:#1B1240}
.msgdrw__h p{margin:0;font-size:11.5px;color:#8B84A8;font-weight:600}
.msgdrw__x{margin-left:auto;width:34px;height:34px;border:none;background:#F2F0F8;border-radius:10px;cursor:pointer;color:#4B4468;display:grid;place-items:center}
.msgdrw__x svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}
.msgdrw .chat{display:flex;flex:1;min-height:0}
.msgdrw .chat__list{width:308px;border-right:1px solid #ECE9F5;display:flex;flex-direction:column;flex:none}
.msgdrw .chat__search{padding:12px 14px;border-bottom:1px solid #ECE9F5}
.msgdrw .searchbox{display:flex;align-items:center;gap:8px;border:1px solid #E7E3F2;border-radius:10px;padding:8px 11px;background:#FAF9FD}
.msgdrw .searchbox svg{width:15px;height:15px;fill:none;stroke:#9A93B5;stroke-width:2;flex:none}
.msgdrw .searchbox input{border:none;background:none;outline:none;font-size:13px;width:100%;color:#1B1240}
.msgdrw .chat__convs{flex:1;overflow:auto}
.msgdrw .conv{display:flex;align-items:center;gap:11px;padding:12px 15px;cursor:pointer;border-bottom:1px solid #F4F2FA;transition:.12s}
.msgdrw .conv:hover{background:#F7F6FC}.msgdrw .conv.on{background:#F1EEFF}
.msgdrw .conv .av{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:15px;flex:none}
.msgdrw .conv .cc{flex:1;min-width:0}
.msgdrw .conv .top{display:flex;justify-content:space-between;align-items:center}
.msgdrw .conv .nm{font-size:13.5px;font-weight:700;color:#211A3B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.msgdrw .conv .tm{font-size:10px;color:#A49DBF;flex:none;margin-left:6px}
.msgdrw .conv .last{font-size:12px;color:#8B84A8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.msgdrw .conv .unread{min-width:18px;height:18px;padding:0 5px;border-radius:20px;background:#25D366;color:#fff;font-size:10px;font-weight:800;display:grid;place-items:center;flex:none;margin-left:6px}
.msgdrw .chat__thread{flex:1;display:flex;flex-direction:column;min-width:0}
.msgdrw .thread__h{display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid #ECE9F5}
.msgdrw .thread__h .av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:14px;flex:none}
.msgdrw .thread__h .ti b{font-size:14px;font-weight:800;display:block;color:#1B1240}
.msgdrw .thread__h .ti span{font-size:11.5px;color:#12A594;font-weight:600}
.msgdrw .book-chip{margin-left:auto;font-size:11px;font-weight:700;color:#6C4FE0;background:#F1EEFF;border:1px solid #E0D8FA;padding:6px 11px;border-radius:20px;display:flex;align-items:center;gap:6px}
.msgdrw .book-chip svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2}
.msgdrw .thread__body{flex:1;overflow:auto;padding:18px;background:linear-gradient(180deg,#F8F7FC,#F4F3FA);display:flex;flex-direction:column;gap:9px}
.msgdrw .day-sep{align-self:center;font-size:10.5px;font-weight:700;color:#8B84A8;background:#fff;border:1px solid #ECE9F5;padding:4px 12px;border-radius:20px;margin:4px 0}
.msgdrw .bub{max-width:74%;padding:9px 13px;border-radius:14px;font-size:13px;line-height:1.45;position:relative;box-shadow:0 1px 1px rgba(30,32,50,.05);white-space:pre-wrap;word-break:break-word}
.msgdrw .bub .meta{display:flex;align-items:center;gap:6px;justify-content:flex-end;margin-top:5px}
.msgdrw .bub .t{font-size:9.5px;color:#A49DBF}
.msgdrw .bub.in{align-self:flex-start;background:#fff;border-bottom-left-radius:5px}
.msgdrw .bub.out{align-self:flex-end;background:#E4F6EC;border-bottom-right-radius:5px}
.msgdrw .bub.ref{align-self:center;background:#F1EEFF;border:1px dashed #E0D8FA;color:#5B3FD1;font-weight:600;font-size:11.5px;max-width:88%;text-align:center}
.msgdrw .wa-tag{display:inline-flex;align-items:center;gap:3px;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#128C3E;background:#D7F5E3;padding:1px 5px;border-radius:5px}
.msgdrw .wa-tag svg{width:9px;height:9px;fill:currentColor;stroke:none}
.msgdrw .thread__in{border-top:1px solid #ECE9F5;background:#fff;padding:12px 16px;display:flex;flex-direction:column;gap:9px}
.msgdrw .tmpl-row{display:flex;align-items:center;gap:8px}
.msgdrw .tmpl-row select{flex:1;border:1px solid #E7E3F2;border-radius:10px;padding:8px 10px;font-size:12.5px;color:#4B4468;background:#FAF9FD;outline:none;cursor:pointer}
.msgdrw .tmpl-row .tmpl-lbl{font-size:11px;font-weight:700;color:#8B84A8;white-space:nowrap}
.msgdrw .in-row{display:flex;align-items:center;gap:10px}
.msgdrw .in-row input{flex:1;border:1px solid #E7E3F2;border-radius:22px;padding:11px 16px;font-size:13.5px;outline:none}
.msgdrw .in-row input:focus{border-color:#25D366;box-shadow:0 0 0 3px #E4F6EC}
.msgdrw .snd{width:42px;height:42px;border-radius:50%;background:#25D366;color:#fff;display:grid;place-items:center;flex:none;border:none;cursor:pointer}
.msgdrw .snd:disabled{opacity:.5;cursor:not-allowed}
.msgdrw .snd svg{width:19px;height:19px;fill:currentColor;stroke:none}
.msgdrw .thread__empty{flex:1;display:grid;place-items:center;color:#8B84A8;font-size:13px;text-align:center;padding:40px}
@media(max-width:760px){.msgdrw .chat__list{width:120px}.msgdrw .conv .cc .last,.msgdrw .conv .tm{display:none}}
`;

const WaIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.16c-.24.68-1.42 1.31-1.95 1.35-.5.04-.96.22-3.23-.67-2.73-1.08-4.45-3.86-4.58-4.04-.13-.18-1.1-1.47-1.1-2.8 0-1.33.7-1.98.94-2.25.25-.27.54-.34.72-.34.18 0 .36 0 .52.01.17.01.39-.06.61.47.24.56.79 1.94.86 2.08.07.14.11.31.02.49-.09.18-.13.29-.27.45-.13.15-.28.34-.4.46-.13.13-.27.28-.12.54.15.27.68 1.12 1.46 1.81 1 .89 1.85 1.17 2.11 1.3.26.13.42.11.57-.07.15-.18.66-.77.83-1.03.18-.27.35-.22.59-.13.24.09 1.55.73 1.81.86.27.13.44.2.51.31.07.11.07.65-.17 1.33z" /></svg>
);

const WaTag = () => (
  <span className="wa-tag" title="Sent on WhatsApp via Twilio"><WaIcon /> WhatsApp · Twilio</span>
);

export default function MessagesDrawer({ open, onClose, salonId, getAuthHeaders, onUnreadChange }) {
  const [convos, setConvos] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef(null);
  const activeIdRef = useRef(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const headers = useCallback(() => (getAuthHeaders ? getAuthHeaders() : {}), [getAuthHeaders]);

  const emitUnread = useCallback((list) => {
    if (typeof onUnreadChange === 'function') {
      const total = (list || []).reduce((s, c) => s + (c.unread || 0), 0);
      onUnreadChange(total);
    }
  }, [onUnreadChange]);

  const load = useCallback(async (silent = false) => {
    if (!salonId) return;
    if (!silent) setLoading(true);
    try {
      const reqs = [axios.get(`${API}/salons/${salonId}/conversations`, { headers: headers() })];
      if (!silent) reqs.push(axios.get(`${API}/salons/${salonId}/message-templates`, { headers: headers() }));
      const [c, t] = await Promise.all(reqs);
      const list = c.data?.conversations || [];
      setConvos(list);
      if (t) setTemplates(t.data?.templates || []);
      setActiveId((prev) => prev || (list[0] ? list[0].phone : null));
      emitUnread(list);
    } catch (e) {
      if (!silent) toast.error('Could not load messages');
    } finally { if (!silent) setLoading(false); }
  }, [salonId, headers, emitUnread]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Near-real-time: poll conversations every 4s while the drawer is open.
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => load(true), 4000);
    return () => clearInterval(id);
  }, [open, load]);

  const active = convos.find((c) => c.phone === activeId) || null;

  // Mark a conversation read when it is opened (clears its unread badge).
  const markRead = useCallback(async (phone) => {
    if (!salonId || !phone) return;
    try {
      await axios.post(`${API}/salons/${salonId}/conversations/${phone}/mark-read`, {}, { headers: headers() });
    } catch { /* silent */ }
    setConvos((arr) => {
      const next = arr.map((c) => c.phone === phone ? { ...c, unread: 0 } : c);
      emitUnread(next);
      return next;
    });
  }, [salonId, headers, emitUnread]);

  useEffect(() => {
    const c = convos.find((x) => x.phone === activeId);
    if (activeId && c && c.unread > 0) markRead(activeId);
  }, [activeId, convos, markRead]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [active?.msgs?.length, activeId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !active) return;
    setSending(true);
    // optimistic
    const optimistic = { f: 'out', t: text, tm: 'now', channel: 'whatsapp', provider: 'twilio' };
    setConvos((arr) => arr.map((c) => c.phone === active.phone ? { ...c, msgs: [...c.msgs, optimistic], last: text } : c));
    setDraft('');
    try {
      const { data } = await axios.post(`${API}/salons/${salonId}/conversations/${active.phone}/send`,
        { text, customer_name: active.name }, { headers: headers() });
      if (data?.send_status === 'sent') toast.success('Message sent on WhatsApp');
      else toast.message('Saved to chat — WhatsApp delivery pending (check Twilio setup)');
      load(true);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Send failed');
    } finally { setSending(false); }
  };

  const pickTemplate = (id) => {
    const t = templates.find((x) => x.id === id);
    if (t) setDraft(t.text);
  };

  if (!open) return null;
  const filtered = convos.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search));

  return createPortal(
    <div data-testid="messages-drawer">
      <style>{CSS}</style>
      <div className="msgdrw-ov" onClick={onClose} />
      <aside className="msgdrw" data-testid="messages-drawer-panel">
        <div className="msgdrw__h">
          <div className="ic"><WaIcon /></div>
          <div>
            <h3>Guest Messages</h3>
            <p>WhatsApp conversations · replies via Twilio</p>
          </div>
          <button className="msgdrw__x" onClick={onClose} data-testid="messages-close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="chat">
          <div className="chat__list">
            <div className="chat__search">
              <div className="searchbox">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input placeholder="Search chats…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="messages-search" />
              </div>
            </div>
            <div className="chat__convs" data-testid="messages-conv-list">
              {loading && convos.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#8B84A8', fontSize: 13 }}>Loading…</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#8B84A8', fontSize: 13 }}>No chats yet</div>
              ) : filtered.map((c) => (
                <div key={c.phone} className={`conv ${activeId === c.phone ? 'on' : ''}`} onClick={() => setActiveId(c.phone)} data-testid={`messages-conv-${c.phone}`}>
                  <div className="av" style={{ background: c.color }}>{(c.name || '?')[0].toUpperCase()}</div>
                  <div className="cc">
                    <div className="top"><span className="nm">{c.name}</span><span className="tm">{c.last_tm}</span></div>
                    <div className="top"><span className="last">{c.last}</span>{c.unread ? <span className="unread">{c.unread}</span> : null}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="chat__thread">
            {!active ? (
              <div className="thread__empty">Select a conversation to view messages</div>
            ) : (
              <>
                <div className="thread__h">
                  <div className="av" style={{ background: active.color }}>{(active.name || '?')[0].toUpperCase()}</div>
                  <div className="ti"><b>{active.name}</b><span>● {active.phone}</span></div>
                  {active.booking ? (
                    <div className="book-chip">
                      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      {active.booking}
                    </div>
                  ) : null}
                </div>
                <div className="thread__body" ref={bodyRef} data-testid="messages-thread">
                  <div className="day-sep">Conversation</div>
                  {active.msgs.map((m, i) => m.f === 'ref' ? (
                    <div key={i} className="bub ref">{m.t}</div>
                  ) : (
                    <div key={i} className={`bub ${m.f}`}>
                      {m.t}
                      <div className="meta">
                        {m.channel === 'whatsapp' ? <WaTag /> : null}
                        <span className="t">{m.tm}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="thread__in">
                  <div className="tmpl-row">
                    <span className="tmpl-lbl">Template</span>
                    <select defaultValue="" onChange={(e) => { pickTemplate(e.target.value); e.target.value = ''; }} data-testid="messages-template-select">
                      <option value="">Insert a promotional template…</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="in-row">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                      placeholder="Type a message…"
                      data-testid="messages-input"
                    />
                    <button className="snd" onClick={send} disabled={sending || !draft.trim()} data-testid="messages-send">
                      <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
