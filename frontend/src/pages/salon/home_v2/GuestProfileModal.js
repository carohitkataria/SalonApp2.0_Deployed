/**
 * GuestProfileModal — full-detail popup for an existing customer.
 * Shows: hero (photo, name, phone, tags), 3 metric cards (total spend, total
 * visits, wallet), detail grid (email, dob, anniversary, gender, socials,
 * preferred staff, membership, notes), and full visit history.
 *
 * Opened from AppointmentDrawer's "View full details" button; also accepts an
 * "Edit" action that emits back to caller for opening the edit drawer.
 */
import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function fmtDate(iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-IN', opts); } catch { return iso; }
}
function fmtRupee(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }

export default function GuestProfileModal({ open, onClose, phone, salonId, getAuthHeaders, onEdit }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const authRef = useRef(getAuthHeaders);
  useEffect(() => { authRef.current = getAuthHeaders; }, [getAuthHeaders]);

  useEffect(() => {
    if (!open || !phone) return;
    setLoading(true); setProfile(null);
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/customers/profile?phone=${encodeURIComponent(phone)}`, { headers: authRef.current() });
        setProfile(res.data);
      } catch (_) { setProfile(null); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line
  }, [open, phone, salonId]);

  const p = profile || {};
  const initial = ((p.name || 'G')[0] || 'G').toUpperCase();
  const bgStyle = p.photo_url ? { backgroundImage: `url(${p.photo_url})` } : {};

  return ReactDOM.createPortal(
    <>
      <div className={`shv2-overlay ${open ? 'open' : ''}`} onClick={onClose} style={{ zIndex: 9075 }} />
      <aside className={`shv2-drawer profile ${open ? 'open' : ''}`} style={{ zIndex: 9080 }}>
        <div className="shv2-profile__h">
          <div className="av" style={bgStyle}>{!p.photo_url && initial}</div>
          <div className="who">
            <h3>{loading ? 'Loading…' : (p.name || '—')}</h3>
            <p>{p.phone || phone || '—'} {p.gender ? `· ${p.gender}` : ''} {p.tags?.length ? `· ${p.tags.join(', ')}` : ''}</p>
          </div>
          <button className="shv2-profile__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="shv2-profile__body">
          {!loading && (
            <>
              {/* Metric cards */}
              <div className="p-grid">
                <div className="p-card">
                  <div className="lb">Lifetime spend</div>
                  <div className="val">{fmtRupee(p.total_spend)}</div>
                  <div className="sub">across {p.total_visits || 0} visits</div>
                </div>
                <div className="p-card">
                  <div className="lb">Wallet balance</div>
                  <div className="val" style={{ color: '#12A594' }}>{fmtRupee(p.wallet_balance)}</div>
                  <div className="sub">available to redeem</div>
                </div>
                <div className="p-card">
                  <div className="lb">Membership</div>
                  <div className="val" style={{ color: p.membership_active ? '#6C4FE0' : '#9A9EAE', fontSize: 15 }}>
                    {p.membership_active ? (p.membership_name || 'Active') : 'None'}
                  </div>
                  <div className="sub">{p.membership_active && p.membership_expires ? `Expires ${fmtDate(p.membership_expires)}` : 'No active plan'}</div>
                </div>
              </div>

              {/* Details grid */}
              <h4>Guest details</h4>
              <div className="p-details">
                <div>
                  <div className="k">Email</div>
                  <div className="v">{p.email || '—'}</div>
                </div>
                <div>
                  <div className="k">Date of birth</div>
                  <div className="v">{fmtDate(p.dob)}</div>
                </div>
                <div>
                  <div className="k">Anniversary</div>
                  <div className="v">{fmtDate(p.anniversary)}</div>
                </div>
                <div>
                  <div className="k">Preferred staff</div>
                  <div className="v">{p.preferred_barber_id ? p.preferred_barber_id.slice(0, 8) + '…' : '—'}</div>
                </div>
                <div>
                  <div className="k">Instagram</div>
                  <div className="v">{p.instagram_id || '—'}</div>
                </div>
                <div>
                  <div className="k">Facebook</div>
                  <div className="v">{p.facebook_id || '—'}</div>
                </div>
                <div>
                  <div className="k">Source</div>
                  <div className="v">{(p.source || '—').toString().toUpperCase()}</div>
                </div>
                <div>
                  <div className="k">Last visit</div>
                  <div className="v">{fmtDate(p.last_visit)}{p.last_barber_name ? ` · ${p.last_barber_name}` : ''}</div>
                </div>
                {p.notes && <div style={{ gridColumn: '1 / -1' }}>
                  <div className="k">Notes</div>
                  <div className="v" style={{ whiteSpace: 'normal', overflow: 'visible', maxWidth: '100%' }}>{p.notes}</div>
                </div>}
              </div>

              {/* History */}
              <h4>Visit history · {p.total_visits || 0}</h4>
              {(p.history_tokens || []).length === 0 && (
                <div className="hist"><div className="row" style={{ justifyContent: 'center', color: '#9A9EAE', fontWeight: 600 }}>No visits yet.</div></div>
              )}
              {(p.history_tokens || []).length > 0 && (
                <div className="hist">
                  <div className="row head">
                    <div>Date</div><div>Stylist</div><div>Services</div><div>Status</div><div>Total</div>
                  </div>
                  {p.history_tokens.map(t => (
                    <div key={t.id} className="row">
                      <div>{fmtDate(t.date, { day: '2-digit', month: 'short' })}</div>
                      <div>{t.barber_name || '—'}</div>
                      <div>{t.services_count}</div>
                      <div><span className={`badge ${['cancelled', 'skipped'].includes(t.status) ? 'cancelled' : (t.status === 'completed' ? 'completed' : 'pending')}`}>{t.status || '—'}</span></div>
                      <div className="money">{fmtRupee(t.total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shv2-profile__f">
          <button className="btn-ghost" style={{ border: '1px solid #ECECF3', padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, color: '#3C3F4E', background: '#FFFFFF' }} onClick={onClose}>Close</button>
          {onEdit && p.phone && (
            <button className="btn-primary" style={{ background: '#6C4FE0', color: '#fff', padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }} onClick={() => onEdit(p)}>Edit guest</button>
          )}
        </div>
      </aside>
    </>,
    document.body
  );
}
