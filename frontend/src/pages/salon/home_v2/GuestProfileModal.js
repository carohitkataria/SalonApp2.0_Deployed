/**
 * GuestProfileModal — full-detail popup for an existing customer (Section 1).
 *
 * Opens when a salon clicks a guest. Header (avatar, name, tag, WhatsApp/Book),
 * four stat tiles, a booking-access bar (block online booking), and tabs:
 *   Overview · Visits & history · Family · Messages · Notes
 * Overview shows grouped, editable cards (Contact / Personal / Salon) — a pencil
 * flips the overview into inputs with Save / Cancel and PUTs the customer.
 */
import React, { useEffect, useState, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const REL_OPTIONS = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Sibling', 'Other'];

function fmtDate(iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-IN', opts); } catch { return iso; }
}
function fmtRupee(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }
function digits10(p) { const d = String(p || '').replace(/\D/g, ''); return d.slice(-10); }

// Booking status → visit bucket + chip colour
function bucketOf(status) {
  const s = (status || '').toLowerCase();
  if (s === 'completed' || s === 'complete') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'noshow' || s === 'no_show' || s === 'no-show' || s === 'skipped') return 'noshow';
  return 'other';
}
const CHIP_COLOR = {
  completed: { bg: '#E6F7F2', fg: '#0E9C82' },
  cancelled: { bg: '#FCEAF1', fg: '#E45C86' },
  noshow: { bg: '#FEF3E2', fg: '#C77700' },
  other: { bg: '#EEF0F6', fg: '#5B5F70' },
};

export default function GuestProfileModal({ open, onClose, phone, salonId, getAuthHeaders, onEdit, onBook }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [barbers, setBarbers] = useState([]);
  const [visitFilter, setVisitFilter] = useState('all');
  // family
  const [family, setFamily] = useState([]);
  const [fam, setFam] = useState({ name: '', phone: '', relation: 'Spouse' });
  const [famBusy, setFamBusy] = useState(false);
  const [famErr, setFamErr] = useState('');
  // booking access
  const [blocked, setBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  // notes
  const [notes, setNotes] = useState('');
  const [notesBusy, setNotesBusy] = useState(false);

  const authRef = useRef(getAuthHeaders);
  useEffect(() => { authRef.current = getAuthHeaders; }, [getAuthHeaders]);

  const loadProfile = async () => {
    try {
      const res = await axios.get(`${API}/salons/${salonId}/customers/profile?phone=${encodeURIComponent(phone)}`, { headers: authRef.current() });
      setProfile(res.data);
      setBlocked(!!res.data?.online_booking_blocked);
      setFamily(res.data?.family_members || []);
      setNotes(res.data?.notes || '');
    } catch (_) { setProfile(null); }
  };
  useEffect(() => {
    if (!open || !phone) return;
    setLoading(true); setProfile(null); setTab('overview'); setEditing(false); setVisitFilter('all');
    (async () => {
      await loadProfile();
      try {
        const rb = await axios.get(`${API}/salons/${salonId}/barbers`, { headers: authRef.current() });
        const list = Array.isArray(rb.data) ? rb.data : (rb.data?.barbers || []);
        setBarbers(list.filter(b => b.is_active !== false));
      } catch (_) { setBarbers([]); }
      setLoading(false);
    })();
  }, [open, phone, salonId]);

  const p = profile || {};
  const initial = ((p.name || 'G')[0] || 'G').toUpperCase();
  const bgStyle = p.photo_url ? { backgroundImage: `url(${p.photo_url})` } : {};
  const barberName = (id) => barbers.find(b => b.id === id)?.name || (id ? id.slice(0, 8) + '…' : '—');

  // ----- Visits filter -----
  const history = p.history_tokens || [];
  const counts = useMemo(() => {
    const c = { all: history.length, completed: 0, cancelled: 0, noshow: 0 };
    history.forEach(t => { const b = bucketOf(t.status); if (c[b] !== undefined) c[b] += 1; });
    return c;
  }, [history]);
  const shownVisits = history.filter(t => visitFilter === 'all' ? true : bucketOf(t.status) === visitFilter);

  // ----- Edit mode -----
  const startEdit = () => {
    setEdit({
      email: p.email || '', address: p.address || '', city: p.city || '', pincode: p.pincode || '',
      gender: p.gender || '', dob: p.dob || '', anniversary: p.anniversary || '',
      preferred_barber_id: p.preferred_barber_id || '', source: p.source || '',
      tag: p.tag || (Array.isArray(p.tags) && p.tags[0]) || '',
    });
    setEditing(true);
  };
  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const putPhone = digits10(p.phone || phone);
      await axios.put(`${API}/salons/${salonId}/customers/${encodeURIComponent(putPhone)}`, {
        email: edit.email, address: edit.address, city: edit.city, pincode: edit.pincode,
        gender: edit.gender, date_of_birth: edit.dob, anniversary: edit.anniversary,
        preferred_barber_id: edit.preferred_barber_id, source: edit.source, tag: edit.tag,
      }, { headers: authRef.current() });
      setEditing(false);
      await loadProfile();
    } catch (e) { /* keep editing on failure */ }
    finally { setSavingEdit(false); }
  };

  // ----- Booking access toggle -----
  const toggleBlock = async () => {
    setBlockBusy(true);
    const next = !blocked;
    try {
      const putPhone = digits10(p.phone || phone);
      await axios.put(`${API}/salons/${salonId}/customers/${encodeURIComponent(putPhone)}/online-booking?blocked=${next}`, {}, { headers: authRef.current() });
      setBlocked(next);
    } catch (_) { /* noop */ }
    finally { setBlockBusy(false); }
  };

  // ----- Family CRUD -----
  const addFamily = async () => {
    setFamErr('');
    if (!fam.name.trim()) { setFamErr('Name required'); return; }
    if (digits10(fam.phone).length !== 10) { setFamErr('Enter a valid 10-digit mobile'); return; }
    setFamBusy(true);
    try {
      const putPhone = digits10(p.phone || phone);
      const res = await axios.post(`${API}/salons/${salonId}/customers/${encodeURIComponent(putPhone)}/family`,
        { name: fam.name.trim(), phone: fam.phone, relation: fam.relation }, { headers: authRef.current() });
      setFamily(f => [...f, res.data?.member || { name: fam.name.trim(), phone: digits10(fam.phone), relation: fam.relation }]);
      setFam({ name: '', phone: '', relation: 'Spouse' });
    } catch (e) { setFamErr(e?.response?.data?.detail || 'Could not add'); }
    finally { setFamBusy(false); }
  };
  const removeFamily = async (mp) => {
    setFamBusy(true);
    try {
      const putPhone = digits10(p.phone || phone);
      await axios.delete(`${API}/salons/${salonId}/customers/${encodeURIComponent(putPhone)}/family/${encodeURIComponent(digits10(mp))}`, { headers: authRef.current() });
      setFamily(f => f.filter(m => digits10(m.phone) !== digits10(mp)));
    } catch (_) { /* noop */ }
    finally { setFamBusy(false); }
  };

  // ----- Notes save -----
  const saveNotes = async () => {
    setNotesBusy(true);
    try {
      const putPhone = digits10(p.phone || phone);
      await axios.put(`${API}/salons/${salonId}/customers/${encodeURIComponent(putPhone)}`, { notes }, { headers: authRef.current() });
    } catch (_) { /* noop */ }
    finally { setNotesBusy(false); }
  };

  const tagText = p.tag || (Array.isArray(p.tags) && p.tags.length ? p.tags.join(', ') : '');

  const inputCss = { width: '100%', padding: '8px 10px', border: '1px solid #E4E4EF', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' };
  const kvRow = (k, v) => (<div><div className="k">{k}</div><div className="v">{v || '—'}</div></div>);

  const Card = ({ title, children }) => (
    <div style={{ border: '1px solid #EEF0F6', borderRadius: 12, padding: '12px 14px', marginBottom: 12, background: '#fff' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#6C4FE0', letterSpacing: .3, textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );

  const tabs = [
    ['overview', 'Overview'],
    ['visits', 'Visits & history'],
    ['family', `Family${family.length ? ` · ${family.length}` : ''}`],
    ['messages', 'Messages'],
    ['notes', 'Notes'],
  ];

  return ReactDOM.createPortal(
    <>
      <div className={`shv2-overlay ${open ? 'open' : ''}`} onClick={onClose} style={{ zIndex: 9075 }} />
      <aside className={`shv2-drawer profile ${open ? 'open' : ''}`} style={{ zIndex: 9080 }}>
        <div className="shv2-profile__h">
          <div className="av" style={bgStyle}>{!p.photo_url && initial}</div>
          <div className="who">
            <h3>{loading ? 'Loading…' : (p.name || '—')}</h3>
            <p>{p.phone || phone || '—'} {p.gender ? `· ${p.gender}` : ''} {tagText ? `· ${tagText}` : ''}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <a href={`https://wa.me/${digits10(p.phone || phone) ? '91' + digits10(p.phone || phone) : ''}`} target="_blank" rel="noreferrer"
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#0E9C82', background: '#E6F7F2', padding: '5px 10px', borderRadius: 8, textDecoration: 'none' }}>WhatsApp</a>
              {onBook && (
                <button onClick={() => onBook(p)} style={{ fontSize: 12, fontWeight: 700, color: '#6C4FE0', background: '#F1EEFF', padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>Book</button>
              )}
              {onEdit && p.phone && (
                <button onClick={() => onEdit(p)} style={{ fontSize: 12, fontWeight: 700, color: '#5B5F70', background: '#EEF0F6', padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>Edit</button>
              )}
            </div>
          </div>
          <button className="shv2-profile__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="shv2-profile__body">
          {!loading && (
            <>
              {/* Four stat tiles */}
              <div className="p-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                <div className="p-card"><div className="lb">Lifetime spend</div><div className="val" style={{ fontSize: 15 }}>{fmtRupee(p.total_spend)}</div></div>
                <div className="p-card"><div className="lb">Visits</div><div className="val" style={{ fontSize: 15 }}>{p.total_visits || 0}</div></div>
                <div className="p-card"><div className="lb">Wallet</div><div className="val" style={{ color: '#12A594', fontSize: 15 }}>{fmtRupee(p.wallet_balance)}</div></div>
                <div className="p-card"><div className="lb">Membership</div><div className="val" style={{ color: p.membership_active ? '#6C4FE0' : '#9A9EAE', fontSize: 13 }}>{p.membership_active ? (p.membership_name || 'Active') : 'None'}</div></div>
              </div>

              {/* Booking-access bar */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                marginTop: 12, padding: '10px 12px', borderRadius: 10,
                background: blocked ? '#FEF3E2' : '#F4F5F9', border: `1px solid ${blocked ? '#F5D08A' : '#EEF0F6'}`,
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: blocked ? '#C77700' : '#5B5F70' }}>
                  {blocked ? 'Salon-only — only the salon can create bookings for this guest' : 'Online booking allowed'}
                </div>
                <button onClick={toggleBlock} disabled={blockBusy} style={{
                  fontSize: 12, fontWeight: 800, border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                  background: blocked ? '#C77700' : '#EEE9FF', color: blocked ? '#fff' : '#6C4FE0',
                }}>{blockBusy ? '…' : (blocked ? 'Unblock' : 'Block online')}</button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 6, marginTop: 14, borderBottom: '1px solid #EEF0F6', flexWrap: 'wrap' }}>
                {tabs.map(([k, label]) => (
                  <button key={k} onClick={() => setTab(k)} style={{
                    fontSize: 12.5, fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer',
                    padding: '8px 10px', color: tab === k ? '#6C4FE0' : '#8A8EA0',
                    borderBottom: tab === k ? '2px solid #6C4FE0' : '2px solid transparent',
                  }}>{label}</button>
                ))}
              </div>

              {/* OVERVIEW */}
              {tab === 'overview' && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
                    {!editing ? (
                      <button onClick={startEdit} style={{ fontSize: 12, fontWeight: 700, color: '#6C4FE0', background: '#F1EEFF', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>✎ Edit</button>
                    ) : (
                      <>
                        <button onClick={() => setEditing(false)} style={{ fontSize: 12, fontWeight: 700, color: '#5B5F70', background: '#EEF0F6', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={saveEdit} disabled={savingEdit} style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#6C4FE0', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>{savingEdit ? 'Saving…' : 'Save'}</button>
                      </>
                    )}
                  </div>

                  <Card title="Contact">
                    {!editing ? (
                      <div className="p-details">
                        {kvRow('Mobile', p.phone)}
                        {kvRow('Email', p.email)}
                        {kvRow('Address', p.address)}
                        {kvRow('City / PIN', [p.city, p.pincode].filter(Boolean).join(' · '))}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ gridColumn: '1 / -1' }}><div className="k">Email</div><input style={inputCss} value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} /></div>
                        <div style={{ gridColumn: '1 / -1' }}><div className="k">Address</div><input style={inputCss} value={edit.address} onChange={e => setEdit({ ...edit, address: e.target.value })} /></div>
                        <div><div className="k">City</div><input style={inputCss} value={edit.city} onChange={e => setEdit({ ...edit, city: e.target.value })} /></div>
                        <div><div className="k">PIN</div><input style={inputCss} value={edit.pincode} onChange={e => setEdit({ ...edit, pincode: e.target.value })} /></div>
                      </div>
                    )}
                  </Card>

                  <Card title="Personal">
                    {!editing ? (
                      <div className="p-details">
                        {kvRow('Gender', p.gender)}
                        {kvRow('Date of birth', fmtDate(p.dob))}
                        {kvRow('Anniversary', fmtDate(p.anniversary))}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div><div className="k">Gender</div>
                          <select style={inputCss} value={edit.gender} onChange={e => setEdit({ ...edit, gender: e.target.value })}>
                            <option value="">—</option><option>Female</option><option>Male</option><option>Other</option>
                          </select>
                        </div>
                        <div><div className="k">Date of birth</div><input type="date" style={inputCss} value={edit.dob || ''} onChange={e => setEdit({ ...edit, dob: e.target.value })} /></div>
                        <div><div className="k">Anniversary</div><input type="date" style={inputCss} value={edit.anniversary || ''} onChange={e => setEdit({ ...edit, anniversary: e.target.value })} /></div>
                      </div>
                    )}
                  </Card>

                  <Card title="Salon">
                    {!editing ? (
                      <div className="p-details">
                        {kvRow('Membership', p.membership_active ? (p.membership_name || 'Active') : 'None (from sales)')}
                        {kvRow('Preferred staff', barberName(p.preferred_barber_id))}
                        {kvRow('Source', (p.source || '—').toString().toUpperCase())}
                        {kvRow('Tag', tagText)}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ gridColumn: '1 / -1' }}><div className="k">Membership</div><div className="v" style={{ color: '#9A9EAE' }}>{p.membership_active ? (p.membership_name || 'Active') : 'None'} · read-only (from sales)</div></div>
                        <div><div className="k">Preferred staff</div>
                          <select style={inputCss} value={edit.preferred_barber_id} onChange={e => setEdit({ ...edit, preferred_barber_id: e.target.value })}>
                            <option value="">— No preference —</option>
                            {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </div>
                        <div><div className="k">Source</div><input style={inputCss} value={edit.source} onChange={e => setEdit({ ...edit, source: e.target.value })} /></div>
                        <div><div className="k">Tag</div><input style={inputCss} value={edit.tag} onChange={e => setEdit({ ...edit, tag: e.target.value })} placeholder="VIP / Regular / New" /></div>
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* VISITS */}
              {tab === 'visits' && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                    {[['all', 'All'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['noshow', 'No-show']].map(([k, l]) => (
                      <button key={k} onClick={() => setVisitFilter(k)} style={{
                        fontSize: 11.5, fontWeight: 700, borderRadius: 20, padding: '5px 11px', cursor: 'pointer',
                        border: `1px solid ${visitFilter === k ? '#6C4FE0' : '#E4E4EF'}`,
                        background: visitFilter === k ? '#6C4FE0' : '#fff', color: visitFilter === k ? '#fff' : '#5B5F70',
                      }}>{l} · {counts[k] ?? 0}</button>
                    ))}
                  </div>
                  {shownVisits.length === 0 ? (
                    <div className="hist"><div className="row" style={{ justifyContent: 'center', color: '#9A9EAE', fontWeight: 600 }}>No visits in this filter.</div></div>
                  ) : (
                    <div className="hist">
                      <div className="row head"><div>Date</div><div>Stylist</div><div>Services</div><div>Status</div><div>Total</div></div>
                      {shownVisits.map(t => {
                        const b = bucketOf(t.status); const cc = CHIP_COLOR[b];
                        const struck = b === 'cancelled';
                        return (
                          <div key={t.id} className="row" style={struck ? { opacity: .8 } : {}}>
                            <div style={struck ? { textDecoration: 'line-through' } : {}}>{fmtDate(t.date, { day: '2-digit', month: 'short' })}</div>
                            <div>{t.barber_name || '—'}</div>
                            <div>{t.services_count}</div>
                            <div><span style={{ fontSize: 11, fontWeight: 800, borderRadius: 6, padding: '2px 8px', background: cc.bg, color: cc.fg }}>{b === 'noshow' ? 'No-show ⚑' : (t.status || '—')}</span></div>
                            <div className="money" style={struck ? { textDecoration: 'line-through' } : {}}>{fmtRupee(t.total)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* FAMILY */}
              {tab === 'family' && (
                <div style={{ marginTop: 14 }}>
                  <Card title="Add family member">
                    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                      <div><div className="k">Name</div><input style={inputCss} value={fam.name} onChange={e => setFam({ ...fam, name: e.target.value })} placeholder="Full name" /></div>
                      <div><div className="k">Mobile</div><input style={inputCss} value={fam.phone} onChange={e => setFam({ ...fam, phone: e.target.value })} placeholder="10-digit" /></div>
                      <div><div className="k">Relation</div>
                        <select style={inputCss} value={fam.relation} onChange={e => setFam({ ...fam, relation: e.target.value })}>
                          {REL_OPTIONS.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </div>
                      <button onClick={addFamily} disabled={famBusy} style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#6C4FE0', border: 'none', borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>Add</button>
                    </div>
                    {famErr && <div style={{ color: '#E45C86', fontSize: 12, marginTop: 6, fontWeight: 600 }}>{famErr}</div>}
                  </Card>
                  {family.length === 0 ? (
                    <div className="hist"><div className="row" style={{ justifyContent: 'center', color: '#9A9EAE', fontWeight: 600 }}>No family members yet.</div></div>
                  ) : (
                    <div className="hist">
                      {family.map((m, i) => (
                        <div key={`${m.phone}-${i}`} className="row" style={{ gridTemplateColumns: '1.3fr 1fr 1fr auto', display: 'grid', alignItems: 'center' }}>
                          <div style={{ fontWeight: 700 }}>{m.name}</div>
                          <div>{m.phone}</div>
                          <div><span style={{ fontSize: 11, fontWeight: 700, background: '#F1EEFF', color: '#6C4FE0', borderRadius: 6, padding: '2px 8px' }}>{m.relation}</span></div>
                          <div style={{ textAlign: 'right' }}><button onClick={() => removeFamily(m.phone)} disabled={famBusy} style={{ fontSize: 11.5, fontWeight: 700, color: '#E45C86', background: '#FCEAF1', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Remove</button></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* MESSAGES */}
              {tab === 'messages' && (
                <div style={{ marginTop: 14 }}>
                  <div className="hist"><div className="row" style={{ justifyContent: 'center', color: '#9A9EAE', fontWeight: 600, textAlign: 'center', display: 'block', padding: '18px 12px' }}>
                    Open the Messages drawer from the top bar to chat with this guest on WhatsApp.
                  </div></div>
                </div>
              )}

              {/* NOTES */}
              {tab === 'notes' && (
                <div style={{ marginTop: 14 }}>
                  <div className="k" style={{ marginBottom: 6 }}>Internal notes</div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputCss, minHeight: 120, resize: 'vertical' }} placeholder="Preferences, allergies, reminders…" />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button onClick={saveNotes} disabled={notesBusy} style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#6C4FE0', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>{notesBusy ? 'Saving…' : 'Save notes'}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="shv2-profile__f">
          <button className="btn-ghost" style={{ border: '1px solid #ECECF3', padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, color: '#3C3F4E', background: '#FFFFFF' }} onClick={onClose}>Close</button>
        </div>
      </aside>
    </>,
    document.body
  );
}
