import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  LogIn, LogOut, Clock, Users, Scissors, RefreshCw, LayoutDashboard,
  CheckCircle2, Timer, CalendarClock,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtTime = (iso) => { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

const STATUS_TONE = {
  waiting: { bg: '#FEF3C7', fg: '#92400E', label: 'Waiting' },
  in_progress: { bg: '#DBEAFE', fg: '#1E40AF', label: 'In chair' },
  completed: { bg: '#DCFCE7', fg: '#166534', label: 'Done' },
  cancelled: { bg: '#FEE2E2', fg: '#991B1B', label: 'Cancelled' },
  no_show: { bg: '#F3F4F6', fg: '#6B7280', label: 'No show' },
};

export default function StaffPortal() {
  const navigate = useNavigate();
  const { salonUser, getSalonUserHeaders, logoutSalonUser } = useAuth();

  const [salon, setSalon] = useState(null);
  const [me, setMe] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const salonId = salonUser?.salonId || localStorage.getItem('salon_id');
  const staffId = salonUser?.staffId;
  const headers = getSalonUserHeaders?.() || {};

  const anyPermission = useMemo(() => {
    const p = salonUser?.permissions || {};
    if (Object.keys(p).some((k) => k !== 'modules' && p[k] === true)) return true;
    const mods = p.modules || {};
    return Object.values(mods).some((actions) => actions && Object.values(actions).some(Boolean));
  }, [salonUser]);

  useEffect(() => {
    if (!salonUser && !localStorage.getItem('salon_user_auth')) {
      navigate('/salon/login');
    }
  }, [salonUser, navigate]);

  const loadAll = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [s, b] = await Promise.all([
        axios.get(`${API}/salons/${salonId}`).catch(() => ({ data: null })),
        axios.get(`${API}/salons/${salonId}/barbers`).catch(() => ({ data: [] })),
      ]);
      setSalon(s.data);
      const list = Array.isArray(b.data) ? b.data : (b.data?.barbers || []);
      setMe(list.find((x) => x.id === staffId) || null);
      if (staffId) {
        const [a, q] = await Promise.all([
          axios.get(`${API}/salons/${salonId}/barbers/${staffId}/attendance/today`, { headers }).catch(() => ({ data: null })),
          axios.get(`${API}/salons/${salonId}/barbers/${staffId}/queue?date=${today}`).catch(() => ({ data: [] })),
        ]);
        setAttendance(a.data);
        setQueue(Array.isArray(q.data) ? q.data : []);
      }
    } catch (e) {
      toast.error('Could not load your portal');
    } finally { setLoading(false); }
  }, [salonId, staffId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleAttendance = async () => {
    if (!staffId) return toast.error('No staff record is linked to your login');
    const action = attendance?.is_checked_in ? 'out' : 'in';
    setToggling(true);
    try {
      await axios.post(`${API}/salons/${salonId}/home/staff-attendance/toggle`, { barber_id: staffId, action }, { headers });
      toast.success(action === 'in' ? 'Checked in — have a great shift!' : 'Checked out — see you next time!');
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not update attendance');
    } finally { setToggling(false); }
  };

  const logout = () => { logoutSalonUser(); navigate('/salon/login'); };

  const upNext = queue.filter((t) => ['waiting', 'in_progress'].includes((t.status || '').toLowerCase()));
  const doneToday = queue.filter((t) => (t.status || '').toLowerCase() === 'completed').length;
  const checkedIn = attendance?.is_checked_in;
  const firstName = (me?.name || 'there').split(' ')[0];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#1a1420 0%,#241a2e 100%)' }} data-testid="staff-portal">
      {/* Header */}
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }} className="px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#E8B923,#C99700)' }}>
            <Scissors className="w-5 h-5 text-black" />
          </div>
          <div className="min-w-0">
            <div className="text-white font-semibold truncate">{salon?.name || 'Salon'}</div>
            <div className="text-[11px] uppercase tracking-wider" style={{ color: '#E8B923' }}>Staff Portal</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {anyPermission && (
            <Button variant="outline" size="sm" onClick={() => navigate('/salon/dashboard')} data-testid="open-dashboard-btn"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10">
              <LayoutDashboard className="w-4 h-4 mr-1.5" /> Dashboard
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={logout} data-testid="staff-logout-btn"
            className="border-white/20 bg-white/5 text-white hover:bg-white/10">
            <LogOut className="w-4 h-4 mr-1.5" /> Logout
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-white text-2xl md:text-3xl font-semibold" data-testid="staff-greeting">
            {greeting()}, {firstName}
          </h1>
          <p className="text-white/50 text-sm mt-1 flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4" />
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Attendance card */}
        <div className="rounded-2xl p-5 md:p-6" style={{ background: checkedIn ? 'linear-gradient(135deg,#0f3d2e,#14532d)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} data-testid="attendance-card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-white/60 text-xs uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5" /> Attendance
              </div>
              <div className="mt-1.5 text-white text-lg font-semibold flex items-center gap-2" data-testid="attendance-status">
                {checkedIn ? (
                  <><CheckCircle2 className="w-5 h-5 text-green-400" /> Checked in since {fmtTime(attendance?.check_in_at)}</>
                ) : attendance?.status === 'out' ? (
                  <><Timer className="w-5 h-5 text-white/50" /> Checked out for today</>
                ) : (
                  <><Timer className="w-5 h-5 text-white/50" /> Not checked in yet</>
                )}
              </div>
              {staffId ? (
                (attendance?.sessions?.length > 0) && (
                  <div className="text-white/40 text-xs mt-1.5">
                    {attendance.sessions.length} session{attendance.sessions.length > 1 ? 's' : ''} today · latest {fmtTime(attendance.sessions[attendance.sessions.length - 1]?.ci)}
                    {attendance.sessions[attendance.sessions.length - 1]?.co ? ` – ${fmtTime(attendance.sessions[attendance.sessions.length - 1]?.co)}` : ''}
                  </div>
                )
              ) : (
                <div className="text-amber-300/80 text-xs mt-1.5">No staff record linked to your login — ask your manager.</div>
              )}
            </div>
            <button
              onClick={toggleAttendance}
              disabled={toggling || !staffId}
              data-testid="check-in-out-btn"
              className="px-6 py-3 rounded-xl font-semibold text-base transition disabled:opacity-50 flex items-center gap-2"
              style={checkedIn
                ? { background: '#fff', color: '#991B1B' }
                : { background: 'linear-gradient(135deg,#E8B923,#C99700)', color: '#000' }}
            >
              {checkedIn ? <LogOut className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
              {toggling ? 'Please wait…' : (checkedIn ? 'Check out' : 'Check in')}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} data-testid="stat-upnext">
            <div className="text-white/50 text-xs flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> In your queue</div>
            <div className="text-white text-2xl font-semibold mt-1">{upNext.length}</div>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} data-testid="stat-done">
            <div className="text-white/50 text-xs flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Done today</div>
            <div className="text-white text-2xl font-semibold mt-1">{doneToday}</div>
          </div>
        </div>

        {/* Queue */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold flex items-center gap-2"><Users className="w-4 h-4" style={{ color: '#E8B923' }} /> Today's queue</h2>
            <button onClick={loadAll} className="text-white/50 hover:text-white text-sm flex items-center gap-1.5" data-testid="refresh-queue-btn">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          {!staffId ? (
            <div className="rounded-xl p-8 text-center text-white/40" style={{ border: '1px dashed rgba(255,255,255,0.12)' }}>No queue — no staff record linked.</div>
          ) : queue.length === 0 ? (
            <div className="rounded-xl p-8 text-center text-white/40" style={{ border: '1px dashed rgba(255,255,255,0.12)' }} data-testid="queue-empty">
              {loading ? 'Loading…' : 'No appointments yet today. Enjoy the calm! ☕'}
            </div>
          ) : (
            <div className="space-y-2" data-testid="staff-queue-list">
              {queue.map((t) => {
                const tone = STATUS_TONE[(t.status || '').toLowerCase()] || STATUS_TONE.waiting;
                return (
                  <div key={t.id} className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} data-testid={`queue-item-${t.id}`}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center font-semibold text-sm shrink-0" style={{ background: 'rgba(232,185,35,0.15)', color: '#E8B923' }}>
                      {t.token_number != null ? `#${t.token_number}` : (t.customer_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium truncate">{t.customer_name || 'Walk-in'}</div>
                      <div className="text-white/45 text-xs truncate">
                        {(Array.isArray(t.services) ? t.services.map((s) => s.name || s).join(', ') : (t.service_name || 'Service'))}
                        {t.appointment_time ? ` · ${t.appointment_time}` : ''}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
