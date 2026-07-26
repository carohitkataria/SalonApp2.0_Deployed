import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import PermissionMatrix, { emptyMod } from './PermissionMatrix';
import { apiError } from './useStaffAccess';
import { MODULES } from '@/components/staff/ModulePermissionsConfig';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtDT = (iso) => { if (!iso) return '—'; try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };

function normalize(modules) {
  const base = emptyMod();
  Object.keys(modules || {}).forEach((k) => { if (base[k]) base[k] = { ...base[k], ...modules[k] }; });
  return base;
}
const sameModule = (a = {}, b = {}, mod) => mod.actions.every((ac) => !!a[ac.key] === !!b[ac.key]);

/**
 * Per-staff Access section: credentials, role, branch scope, permission
 * overrides and active devices — everything about ONE person's login.
 */
export default function StaffAccessSection({ salonId, barber, getAuthHeaders, onManageRoles }) {
  const headers = getAuthHeaders?.() || {};
  const barberId = barber?.id;

  const [cred, setCred] = useState(null); // GET credentials response
  const [draft, setDraft] = useState({ login_id: '', password: '' });
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [roleId, setRoleId] = useState('');
  const [assignedBranchIds, setAssignedBranchIds] = useState([]);
  const [modules, setModules] = useState(emptyMod());
  const [history, setHistory] = useState({ history: [], active_devices: [] });
  const [busy, setBusy] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  const selectedRole = roles.find((r) => r.id === roleId);
  const baseline = selectedRole ? normalize(selectedRole.modules) : emptyMod();

  const loadAll = useCallback(async () => {
    if (!barberId || !salonId) return;
    try {
      const [c, r, b, h] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/barbers/${barberId}/credentials`, { headers }),
        axios.get(`${API}/salons/${salonId}/roles`, { headers }),
        axios.get(`${API}/salons/${salonId}/branches`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/salons/${salonId}/barbers/${barberId}/login-history`, { headers }).catch(() => ({ data: {} })),
      ]);
      setCred(c.data);
      setDraft({ login_id: c.data?.login_id || '', password: '' });
      setRoleId(c.data?.role_id || '');
      setAssignedBranchIds(c.data?.assigned_branch_ids || []);
      setModules(normalize(c.data?.permissions?.modules));
      setRoles(r.data?.roles || []);
      setBranches(Array.isArray(b.data) ? b.data : []);
      setHistory({ history: h.data?.history || [], active_devices: h.data?.active_devices || [] });
    } catch (e) {
      toast.error(apiError(e, 'Failed to load access'));
    }
  }, [barberId, salonId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveCredentials = async () => {
    const lid = (draft.login_id || '').trim();
    const pwd = draft.password || '';
    if (!lid && !pwd) return toast.error('Enter a Login ID or Password');
    if (lid && lid.length < 6) return toast.error('Login ID must be at least 6 characters');
    if (pwd && pwd.length < 8) return toast.error('Password must be at least 8 characters');
    setBusy(true);
    try {
      const body = {};
      if (lid) body.login_id = lid;
      if (pwd) body.password = pwd;
      await axios.put(`${API}/salons/${salonId}/barbers/${barberId}/credentials`, body, { headers });
      toast.success('Credentials saved — this staff can now sign in');
      setDraft((d) => ({ ...d, password: '' }));
      loadAll();
    } catch (e) { toast.error(apiError(e, 'Could not save credentials')); }
    finally { setBusy(false); }
  };

  const saveRole = async () => {
    if (!cred?.user_id) return toast.error('Set a login ID & password first');
    setSavingRole(true);
    try {
      // Store only the modules that differ from the role baseline (overrides),
      // so future role edits still propagate to non-overridden modules.
      const overrides = {};
      MODULES.forEach((m) => {
        if (!sameModule(modules[m.key], baseline[m.key] || {}, m)) overrides[m.key] = modules[m.key];
      });
      const body = { role_id: roleId, permissions: { modules: overrides } };
      if (selectedRole?.base_role === 'branch_manager') body.assigned_branch_ids = assignedBranchIds;
      await axios.put(`${API}/salon/users/${cred.user_id}`, body, { headers });
      toast.success('Role & permissions saved');
      loadAll();
    } catch (e) { toast.error(apiError(e, 'Could not save role')); }
    finally { setSavingRole(false); }
  };

  const toggleAccess = async () => {
    if (!cred?.user_id) return;
    const revoking = cred.status === 'active';
    if (!window.confirm(`${revoking ? 'Revoke' : 'Restore'} login access for ${barber?.name}?`)) return;
    try {
      if (revoking) await axios.delete(`${API}/salon/users/${cred.user_id}`, { headers });
      else await axios.put(`${API}/salon/users/${cred.user_id}`, { status: 'active' }, { headers });
      toast.success(revoking ? 'Access revoked' : 'Access restored');
      loadAll();
    } catch (e) { toast.error(apiError(e, 'Could not update access')); }
  };

  const revokeSession = async (sid) => {
    if (!sid || !window.confirm('Revoke this device? The staff will be logged out on it.')) return;
    try {
      await axios.post(`${API}/salons/${salonId}/barbers/${barberId}/revoke-session`, { session_id: sid }, { headers });
      toast.success('Session revoked');
      loadAll();
    } catch (e) { toast.error(apiError(e, 'Could not revoke session')); }
  };

  const statusPill = () => {
    if (!cred?.has_account) return <span className="st-pill st-">No login set</span>;
    if (cred.status === 'active') return <span className="st-pill st-P">Active</span>;
    return <span className="st-pill st-A">Revoked</span>;
  };

  const roleSummary = selectedRole
    ? `${selectedRole.name} · ${MODULES.filter((m) => Object.values((selectedRole.modules || {})[m.key] || {}).some(Boolean)).length} of ${MODULES.length} modules`
    : 'No role assigned';

  const isStaffBase = !selectedRole || selectedRole.base_role === 'staff';

  return (
    <div data-testid="staff-access-section">
      {/* 1 — Login credentials */}
      <div className="secttl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Login credentials {statusPill()}
        {cred?.has_account && (
          <button className="btn-ghost" style={{ marginLeft: 'auto', padding: '6px 11px' }} onClick={toggleAccess} data-testid="staff-toggle-access">
            {cred.status === 'active' ? 'Revoke access' : 'Restore access'}
          </button>
        )}
      </div>
      <div className="grid2" style={{ marginBottom: 8 }}>
        <div className="field"><label>Login ID <span className="req">*</span> <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(min 6 chars, unique)</span></label>
          <input value={draft.login_id} onChange={(e) => setDraft({ ...draft, login_id: e.target.value })} placeholder="e.g. imran.singh" autoComplete="off" data-testid="staff-login-id" />
        </div>
        <div className="field"><label>Password <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(min 8 chars)</span></label>
          <input type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="Leave blank to keep unchanged" autoComplete="new-password" data-testid="staff-login-password" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button className="btn-primary" onClick={saveCredentials} disabled={busy} data-testid="staff-credentials-save">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>{busy ? 'Saving…' : 'Save credentials'}
        </button>
        <span className="idnote"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>Login uses this ID + Password. Contact mobile: {barber?.phone || barber?.mobile || '—'}</span>
      </div>

      {/* 2 — Role */}
      <div className="secttl">Role</div>
      <div className="grid2" style={{ marginBottom: 6 }}>
        <div className="field">
          <label>Assigned role</label>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={!cred?.has_account} data-testid="staff-role-select">
            <option value="">-- Select role --</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_system ? ' (system)' : ''}</option>)}
          </select>
          <span className="idnote">{roleSummary}</span>
        </div>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <label>&nbsp;</label>
          <button className="btn-ghost" onClick={onManageRoles} data-testid="staff-manage-roles">Manage roles →</button>
        </div>
      </div>
      {!cred?.has_account && (
        <div className="idnote" style={{ marginBottom: 14 }}>Set a Login ID & Password above to create the account, then assign a role.</div>
      )}

      {/* 3 — Branch scope */}
      {selectedRole?.base_role === 'branch_manager' && (
        <>
          <div className="secttl">Branch scope</div>
          <div style={{ marginBottom: 14, display: 'grid', gap: 6 }}>
            {branches.map((b) => (
              <label key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }} data-testid={`staff-branch-${b.id}`}>
                <input type="checkbox" checked={assignedBranchIds.includes(b.id)}
                  onChange={(e) => setAssignedBranchIds((prev) => e.target.checked ? [...prev, b.id] : prev.filter((x) => x !== b.id))} />
                {b.branch_name}{b.is_main_branch ? ' • Main' : ''}
              </label>
            ))}
          </div>
        </>
      )}

      {/* 4 — Permission overrides */}
      <div className="secttl">Permission overrides</div>
      {isStaffBase ? (
        <>
          <div className="idnote" style={{ marginBottom: 10 }}>Baseline comes from the role. Change any module to override it for this person only.</div>
          <div style={{ marginBottom: 12 }}>
            <PermissionMatrix value={modules} onChange={setModules} baseline={baseline} readOnly={!cred?.has_account} />
          </div>
        </>
      ) : (
        <div className="idnote" style={{ marginBottom: 14 }}>{selectedRole?.base_role === 'admin' ? 'Admins have full access — no overrides apply.' : 'Branch managers have full access within their branches — no module overrides apply.'}</div>
      )}
      {cred?.has_account && (
        <div style={{ marginBottom: 20 }}>
          <button className="btn-primary" onClick={saveRole} disabled={savingRole} data-testid="staff-save-role">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>{savingRole ? 'Saving…' : 'Save role & permissions'}
          </button>
        </div>
      )}

      {/* 5 — Active devices */}
      <div className="secttl">Active devices
        <button className="btn-ghost" style={{ marginLeft: 'auto', padding: '7px 12px' }} onClick={loadAll}>
          <svg viewBox="0 0 24 24"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>Refresh
        </button>
      </div>
      {(!history.active_devices || history.active_devices.length === 0) ? (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)', textAlign: 'center', border: '1px dashed #E5DDE7', borderRadius: 10, marginBottom: 18 }}>No active device sessions.</div>
      ) : (
        <table className="svc-tbl" data-testid="staff-active-devices" style={{ marginBottom: 18 }}>
          <thead><tr><th>Device</th><th>IP</th><th>Last seen</th><th></th></tr></thead>
          <tbody>
            {history.active_devices.map((d, i) => (
              <tr key={d.id || i}>
                <td className="svc-n"><b>{d.device || 'web'}</b></td>
                <td>{d.ip || '—'}</td>
                <td>{fmtDT(d.last_seen || d.created_at)}</td>
                <td style={{ textAlign: 'right' }}><button className="btn-danger" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => revokeSession(d.id)} data-testid={`revoke-session-${d.id}`}>Revoke</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Login history */}
      <div className="secttl">Login history</div>
      {(!history.history || history.history.length === 0) ? (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--muted)', textAlign: 'center', border: '1px dashed #E5DDE7', borderRadius: 10 }}>No login events recorded yet.</div>
      ) : (
        <table className="svc-tbl" data-testid="staff-login-history">
          <thead><tr><th>When</th><th>Event</th><th>Device / IP</th></tr></thead>
          <tbody>
            {history.history.map((e, i) => (
              <tr key={e.id || i}>
                <td>{fmtDT(e.timestamp || e.created_at)}</td>
                <td><span className={`st-pill st-${e.event === 'login' ? 'P' : (e.event === 'revoked' ? 'A' : 'HO')}`}>{e.event || 'event'}</span></td>
                <td className="svc-n"><b>{e.device || 'web'}</b><span>{e.ip || ''}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
