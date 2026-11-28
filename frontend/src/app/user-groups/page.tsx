// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { Icon } from '../../components/icons';
import { Alert, Badge, Button, Card, Field, IconButton, Modal, PageHeader, SectionTitle } from '../../components/ui';

type Group = {
  id: string; name: string; description: string | null; system: boolean;
  permissions: string[]; _count?: { members: number };
};
type Member = { id: string; email: string; role: string };
type GroupDetail = Group & { members: Array<{ userId: string; user: Member }> };
type Catalog = { groups: Array<{ title: string; keys: string[] }>; all: string[] };

export default function UserGroupsPage() {
  const { t, lang } = useLang();
  const [groups, setGroups] = useState<Group[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [editing, setEditing] = useState<GroupDetail | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [membersFor, setMembersFor] = useState<GroupDetail | null>(null);
  const [users, setUsers] = useState<Member[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [draft, setDraft] = useState({ name: '', description: '', permissions: [] as string[] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [list, perms] = await Promise.all([
        api.get<Group[]>('/api/user-groups'),
        api.get<Catalog>('/api/user-groups/permissions'),
      ]);
      setGroups(Array.isArray(list) ? list : (list as any).data || []);
      setCatalog(perms);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    load();
    api.get<Member[]>('/api/users').then((d) => setUsers(Array.isArray(d) ? d : (d as any).data || [])).catch(() => setUsers([]));
  }, [load]);

  const openCreate = () => {
    setEditing(null); setCreateOpen(true);
    setDraft({ name: '', description: '', permissions: [] });
    setModalError(''); setNotice('');
  };

  const openEdit = async (group: Group) => {
    setBusy(true); setError(''); setModalError('');
    try {
      const detail = await api.get<GroupDetail>(`/api/user-groups/${group.id}`);
      setEditing(detail);
      setDraft({ name: detail.name, description: detail.description || '', permissions: detail.permissions.includes('*') ? ['*'] : detail.permissions });
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const openMembers = async (group: Group) => {
    setBusy(true); setError(''); setModalError('');
    try {
      const detail = await api.get<GroupDetail>(`/api/user-groups/${group.id}`);
      setMembersFor(detail);
      setSelectedUsers(detail.members.map((item) => item.userId));
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setModalError(''); setNotice('');
    try {
      const body = { name: draft.name, description: draft.description, permissions: draft.permissions };
      if (editing) await api.patch(`/api/user-groups/${editing.id}`, body);
      else await api.post('/api/user-groups', body);
      setEditing(null); setCreateOpen(false);
      setNotice(lang === 'ru' ? 'Группа сохранена' : 'Group saved');
      await load();
    } catch (e: any) { setModalError(e.message); }
    finally { setBusy(false); }
  };

  const saveMembers = async () => {
    if (!membersFor) return;
    setBusy(true); setModalError(''); setNotice('');
    try {
      await api.post(`/api/user-groups/${membersFor.id}/members`, { userIds: selectedUsers });
      setMembersFor(null);
      setNotice(lang === 'ru' ? 'Участники обновлены' : 'Members updated');
      await load();
    } catch (e: any) { setModalError(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (group: Group) => {
    if (group.system) return;
    if (!confirm(lang === 'ru' ? `Удалить группу ${group.name}?` : `Delete group ${group.name}?`)) return;
    try { await api.delete(`/api/user-groups/${group.id}`); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const togglePermission = (key: string) => {
    setDraft((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((item) => item !== key)
        : [...prev.permissions, key],
    }));
  };

  return (
    <>
      <PageHeader eyebrow={t.access} title={lang === 'ru' ? 'Группы доступа' : 'User groups'}
        subtitle={lang === 'ru' ? 'Права пользователей поверх ролей панели' : 'Permissions layered on top of panel roles'}
        icon="users"
        actions={<Button icon="plus" variant="primary" onClick={openCreate}>{lang === 'ru' ? 'Новая группа' : 'New group'}</Button>} />
      {error && <Alert className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}
      {!groups.length && !error && <Card className="py-16 text-center text-xs text-subtle">{t.noData}</Card>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {groups.map((group) => (
          <Card key={group.id} className="flex min-w-0 flex-col p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13px] font-semibold text-fg">{group.name}</p>
                  {group.system && <Badge tone="success">{lang === 'ru' ? 'системная' : 'system'}</Badge>}
                </div>
                <p className="mt-1 truncate text-[11px] text-subtle">{group.description || '—'}</p>
              </div>
              <Badge tone="neutral">{group._count?.members ?? 0}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(group.permissions.includes('*') ? ['*'] : group.permissions.slice(0, 4)).map((key) => <Badge key={key} tone="brand">{key}</Badge>)}
              {!group.permissions.includes('*') && group.permissions.length > 4 && <Badge tone="neutral">+{group.permissions.length - 4}</Badge>}
            </div>
            <div className="mt-auto flex flex-wrap gap-1 pt-3">
              <Button size="sm" variant="subtle" icon="sliders" disabled={busy} onClick={() => openEdit(group)}>{lang === 'ru' ? 'Права' : 'Permissions'}</Button>
              <Button size="sm" variant="subtle" icon="users" disabled={busy} onClick={() => openMembers(group)}>{lang === 'ru' ? 'Участники' : 'Members'}</Button>
              {!group.system && <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(group)} />}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={createOpen || Boolean(editing)} onClose={() => { setEditing(null); setCreateOpen(false); setDraft({ name: '', description: '', permissions: [] }); }}
        title={editing ? `${lang === 'ru' ? 'Права' : 'Permissions'}: ${editing.name}` : (lang === 'ru' ? 'Новая группа' : 'New group')}
        size="lg"
        footer={<><Button onClick={() => { setEditing(null); setCreateOpen(false); }}>{t.cancel}</Button><Button variant="primary" icon="check" loading={busy} form="user-group-form">{t.save}</Button></>}>
        <form id="user-group-form" onSubmit={save} className="space-y-4">
          <Alert>{modalError}</Alert>
          {!editing && (
            <>
              <Field label={t.name}><input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></Field>
              <Field label={t.comment}><input className="field" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            </>
          )}
          {catalog?.groups.map((section) => (
            <div key={section.title}>
              <p className="mb-2 text-[11px] font-semibold text-subtle">{section.title}</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {section.keys.map((key) => (
                  <label key={key} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-[11px] text-muted">
                    <input type="checkbox" checked={draft.permissions.includes(key)} onChange={() => togglePermission(key)} />
                    <span className="mono">{key}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </form>
      </Modal>

      <Modal open={Boolean(membersFor)} onClose={() => setMembersFor(null)} title={`${lang === 'ru' ? 'Участники' : 'Members'}: ${membersFor?.name || ''}`} size="lg"
        footer={<><Button onClick={() => setMembersFor(null)}>{t.cancel}</Button><Button variant="primary" icon="check" loading={busy} onClick={saveMembers}>{t.save}</Button></>}>
        <Alert className="mb-3">{modalError}</Alert>
        {!users.length && <p className="py-6 text-center text-xs text-subtle">{t.noData}</p>}
        <div className="grid max-h-[60vh] gap-1 overflow-auto sm:grid-cols-2">
          {users.map((user) => (
            <label key={user.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-2 text-xs text-muted">
              <input type="checkbox" checked={selectedUsers.includes(user.id)}
                onChange={() => setSelectedUsers((prev) => prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id])} />
              <span className="min-w-0 flex-1 truncate">{user.email}</span>
              <Badge tone="neutral">{user.role}</Badge>
            </label>
          ))}
        </div>
      </Modal>
    </>
  );
}
