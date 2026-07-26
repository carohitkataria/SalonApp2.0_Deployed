import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Plus, Copy, Trash2, Pencil, ArrowLeft, Users } from 'lucide-react';
import PermissionMatrix, { emptyMod } from './PermissionMatrix';
import { useStaffAccess, apiError } from './useStaffAccess';
import { MODULES } from '@/components/staff/ModulePermissionsConfig';

const BASE_LABEL = { admin: 'Admin', branch_manager: 'Branch Manager', staff: 'Staff' };

// Ensure a modules map has every module/action key present.
function normalize(modules) {
  const base = emptyMod();
  Object.keys(modules || {}).forEach((k) => {
    if (base[k]) base[k] = { ...base[k], ...modules[k] };
  });
  return base;
}

export default function RolesManager({ salonId }) {
  const access = useStaffAccess(salonId);
  const [editing, setEditing] = useState(null); // role obj or 'new'
  const [form, setForm] = useState({ name: '', description: '', base_role: 'staff', modules: emptyMod() });
  const [busy, setBusy] = useState(false);

  const load = () => access.fetchRoles().catch((e) => toast.error(apiError(e, 'Failed to load roles')));
  useEffect(() => { load(); }, [access.sid]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    setForm({ name: '', description: '', base_role: 'staff', modules: emptyMod() });
    setEditing('new');
  };
  const openEdit = (role) => {
    setForm({
      name: role.name, description: role.description || '',
      base_role: role.base_role, modules: normalize(role.modules),
    });
    setEditing(role);
  };
  const duplicate = (role) => {
    setForm({
      name: `${role.name} (copy)`, description: role.description || '',
      base_role: role.base_role, modules: normalize(role.modules),
    });
    setEditing('new');
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Role name is required');
    setBusy(true);
    try {
      if (editing === 'new') {
        await access.createRole({ name: form.name.trim(), description: form.description, base_role: form.base_role, modules: form.modules });
        toast.success('Role created');
      } else {
        await access.updateRole(editing.id, editing.is_system
          ? { modules: form.modules }
          : { name: form.name.trim(), description: form.description, base_role: form.base_role, modules: form.modules });
        toast.success('Role updated');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(apiError(e, 'Failed to save role'));
    } finally { setBusy(false); }
  };

  const remove = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    try {
      await access.deleteRole(role.id);
      toast.success('Role deleted');
      load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (d && typeof d === 'object' && d.code === 'role_in_use') {
        toast.error(`${d.message} (${(d.users || []).join(', ')})`);
      } else {
        toast.error(apiError(e, 'Failed to delete role'));
      }
    }
  };

  if (editing) {
    const isSystem = editing !== 'new' && editing.is_system;
    return (
      <div className="space-y-4" data-testid="role-editor">
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={() => setEditing(null)}>
          <ArrowLeft className="w-4 h-4" /> Back to roles
        </button>
        <h3 className="text-lg font-semibold flex items-center gap-2 flex-wrap min-w-0">
          <Shield className="w-5 h-5 text-gold shrink-0" />
          <span className="min-w-0">{editing === 'new' ? 'New role' : `Edit role — ${editing.name}`}</span>
          {isSystem && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gold/20 text-gold shrink-0 whitespace-nowrap">System role</span>}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Role name *</Label>
            <Input value={form.name} disabled={isSystem} data-testid="role-name-input"
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Receptionist" />
          </div>
          <div>
            <Label>Base role</Label>
            <select value={form.base_role} disabled={isSystem} data-testid="role-base-select"
              onChange={(e) => setForm({ ...form, base_role: e.target.value })}
              className="w-full h-10 px-3 rounded-md border border-input bg-background disabled:opacity-60">
              <option value="staff">Staff</option>
              <option value="branch_manager">Branch Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Description</Label>
            <Input value={form.description} disabled={isSystem}
              onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
          </div>
        </div>
        {form.base_role !== 'staff' && (
          <div className="text-xs rounded-md p-2.5" style={{ background: '#EEF6FF', border: '1px solid #CFE4FA', color: '#334155' }}>
            {form.base_role === 'admin' ? 'Admins bypass all module checks — they always have full access.' : 'Branch managers have full access scoped to their assigned branches.'} Module toggles below are informational for this base role.
          </div>
        )}
        <div>
          <div className="text-sm font-semibold mb-2">Module permissions</div>
          <PermissionMatrix value={form.modules} onChange={(m) => setForm({ ...form, modules: m })} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          <Button onClick={save} disabled={busy} data-testid="role-save-btn" className="bg-gold text-black hover:bg-gold/90">
            {busy ? 'Saving…' : 'Save role'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="roles-manager">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Shield className="w-5 h-5 text-gold" /> Roles</h3>
        <Button onClick={openNew} data-testid="add-role-btn" className="bg-gold text-black hover:bg-gold/90">
          <Plus className="w-4 h-4 mr-1.5" /> New role
        </Button>
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}
      >
        {access.roles.map((role) => {
          const granted = MODULES.filter((m) => Object.values((role.modules || {})[m.key] || {}).some(Boolean)).length;
          return (
            <div key={role.id} className="rounded-lg border border-border bg-card p-4 flex flex-col" data-testid={`role-card-${role.id}`}>
              {/* Title row: name + System chip on the left, actions on the right */}
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold flex items-center gap-2 flex-wrap min-w-0" style={{ wordBreak: 'normal', whiteSpace: 'normal' }}>
                  <span>{role.name}</span>
                  {role.is_system && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/20 text-gold shrink-0 whitespace-nowrap">System</span>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openEdit(role)} title={role.is_system ? 'View / tune' : 'Edit'} data-testid={`edit-role-${role.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => duplicate(role)} title="Duplicate" data-testid={`dup-role-${role.id}`}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  {!role.is_system && (
                    <Button size="sm" variant="outline" className="text-red-500" onClick={() => remove(role)} title="Delete" data-testid={`del-role-${role.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {/* Description — clamped to 2 lines */}
              <div
                className="text-xs text-muted-foreground mt-1"
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {role.description || BASE_LABEL[role.base_role]}
              </div>
              {/* Footer row: modules count (left) · users count (right) */}
              <div className="text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{BASE_LABEL[role.base_role]} · {granted} of {MODULES.length} modules</span>
                <span className="flex items-center gap-1 shrink-0"><Users className="w-3 h-3" />{role.assigned_user_count || 0}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
