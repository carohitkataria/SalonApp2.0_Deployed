import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, UserPlus, KeyRound, Ban, RotateCcw, ExternalLink, X } from 'lucide-react';
import { useStaffAccess, apiError } from './useStaffAccess';

const EMPTY = { name: '', mobile: '', login_id: '', password: '', role_id: '', assigned_branch_ids: [] };

export default function UserAccountsList({ salonId, onOpenStaff }) {
  const access = useStaffAccess(salonId);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = () => {
    access.fetchUsers().catch((e) => toast.error(apiError(e, 'Failed to load accounts')));
    access.fetchRoles().catch(() => {});
    access.fetchBranches().catch(() => {});
    access.fetchStaffMembers().catch(() => {});
  };
  useEffect(() => { load(); }, [access.sid]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleById = (id) => access.roles.find((r) => r.id === id);
  const selectedRole = roleById(form.role_id);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.role_id) return toast.error('Pick a role');
    setBusy(true);
    try {
      await access.createUser({
        name: form.name, mobile: form.mobile, login_id: form.login_id, password: form.password,
        role_id: form.role_id,
        assigned_branch_ids: selectedRole?.base_role === 'branch_manager' ? form.assigned_branch_ids : [],
      });
      toast.success('Account created');
      setForm(EMPTY); setShowForm(false); load();
    } catch (err) {
      toast.error(apiError(err, 'Failed to create account'));
    } finally { setBusy(false); }
  };

  const resetPassword = async (u) => {
    const pw = window.prompt(`New password for "${u.name}" (min 6 chars):`);
    if (pw === null) return;
    if (!pw || pw.trim().length < 6) return toast.error('Password must be at least 6 characters');
    try { await access.updateUser(u.id, { password: pw.trim() }); toast.success('Password reset'); }
    catch (e) { toast.error(apiError(e, 'Failed to reset password')); }
  };

  const toggle = async (u) => {
    const revoking = u.status === 'active';
    if (!window.confirm(`${revoking ? 'Revoke' : 'Restore'} access for "${u.name}"?`)) return;
    try { await access.setUserStatus(u.id, !revoking); toast.success(revoking ? 'Access revoked' : 'Access restored'); load(); }
    catch (e) { toast.error(apiError(e, 'Failed to update access')); }
  };

  const badge = (role) => role === 'admin' ? 'bg-gold/20 text-gold' : role === 'branch_manager' ? 'bg-purple-500/20 text-purple-500' : 'bg-blue-500/20 text-blue-500';

  return (
    <div className="space-y-4" data-testid="user-accounts-list">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Users className="w-5 h-5 text-gold" /> User accounts ({access.users.length})</h3>
        <Button onClick={() => setShowForm((v) => !v)} data-testid="add-account-btn" className="bg-gold text-black hover:bg-gold/90">
          {showForm ? <><X className="w-4 h-4 mr-1.5" />Cancel</> : <><UserPlus className="w-4 h-4 mr-1.5" />Add account</>}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4 space-y-3" data-testid="add-account-form">
          <p className="text-xs text-muted-foreground">Use this for non-staff logins (e.g. a receptionist with no HR record). For staff, set their login under Staff → [person] → Access.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Full name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Mobile *</Label><Input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10-digit" /></div>
            <div><Label>Login ID *</Label><Input required value={form.login_id} onChange={(e) => setForm({ ...form, login_id: e.target.value })} /></div>
            <div><Label>Password *</Label><Input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div>
              <Label>Role *</Label>
              <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} data-testid="account-role-select"
                className="w-full h-10 px-3 rounded-md border border-input bg-background">
                <option value="">-- Select role --</option>
                {access.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          {selectedRole?.base_role === 'branch_manager' && (
            <div>
              <Label>Assigned branches *</Label>
              <div className="mt-1 space-y-1.5 max-h-36 overflow-auto border border-input rounded-md p-2">
                {access.branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.assigned_branch_ids.includes(b.id)}
                      onChange={(e) => setForm((p) => {
                        const s = new Set(p.assigned_branch_ids);
                        e.target.checked ? s.add(b.id) : s.delete(b.id);
                        return { ...p, assigned_branch_ids: [...s] };
                      })} />
                    {b.branch_name}{b.is_main_branch ? ' • Main' : ''}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end"><Button type="submit" disabled={busy} className="bg-gold text-black hover:bg-gold/90">{busy ? 'Creating…' : 'Create account'}</Button></div>
        </form>
      )}

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {access.users.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No accounts yet.</div>}
        {access.users.map((u) => {
          const staff = access.staffMembers.find((s) => s.id === u.staff_id);
          const role = access.roles.find((r) => r.id === u.role_id);
          return (
            <div key={u.id} className="p-4 flex items-start justify-between" data-testid={`account-row-${u.id}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{u.name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge(u.role)}`}>{role?.name || u.role}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${u.status === 'active' ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-500'}`}>{u.status}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <div>Login ID: {u.login_id}</div>
                  <div>Mobile: {u.mobile}</div>
                  {u.staff_id && <div className="text-gold">Linked to staff: {staff?.name || 'Staff member'}</div>}
                </div>
              </div>
              <div className="flex gap-1.5">
                {u.staff_id && onOpenStaff && (
                  <Button size="sm" variant="outline" onClick={() => onOpenStaff(u.staff_id)} title="Open staff access" data-testid={`open-staff-${u.id}`}>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                )}
                {u.role !== 'admin' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => resetPassword(u)} title="Reset password"><KeyRound className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(u)} className={u.status === 'active' ? 'text-red-500' : 'text-green-600'} title={u.status === 'active' ? 'Revoke' : 'Restore'}>
                      {u.status === 'active' ? <Ban className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
