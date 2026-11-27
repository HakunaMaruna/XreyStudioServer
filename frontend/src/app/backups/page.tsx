// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, IconButton, PageHeader, SectionTitle, Toggle, formatBytes } from '../../components/ui';

type BackupFile = { name: string; size: number; createdAt: string };
type BackupSettings = {
  id: string;
  enabled: boolean;
  intervalHours: number;
  retention: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

export default function BackupsPage() {
  const { t } = useLang();
  const [items, setItems] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/backups');
      setItems(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
    api.get('/api/backups/settings').then(setSettings).catch(() => undefined);
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    setError('');
    setNotice('');
    try {
      const data = await api.patch('/api/backups/settings', {
        enabled: settings.enabled,
        intervalHours: settings.intervalHours,
        retention: settings.retention,
      });
      setSettings(data);
      setNotice(t.save);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post('/api/backups', {});
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (name: string) => {
    try {
      await api.download(`/api/backups/${encodeURIComponent(name)}/download`, name);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (name: string) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/api/backups/${encodeURIComponent(name)}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const restore = async (name: string) => {
    if (!confirm(t.confirmRestore)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/api/backups/${encodeURIComponent(name)}/restore`, { confirm: true });
      setNotice(t.restored);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo<ColumnDef<BackupFile>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-brand/25 bg-brand-soft text-brand"><Icon name="file" size={15} /></div>
            <code className="mono text-xs text-fg">{row.original.name}</code>
          </div>
        ),
      },
      { accessorKey: 'size', header: t.size, cell: ({ row }) => <Badge tone="neutral">{formatBytes(row.original.size)}</Badge> },
      {
        accessorKey: 'createdAt',
        header: t.createdAt,
        cell: ({ row }) => <span className="text-xs text-muted">{new Date(row.original.createdAt).toLocaleString()}</span>,
      },
      {
        id: 'actions',
        header: t.actions,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <IconButton icon="download" label={t.download} onClick={() => download(row.original.name)} />
            <IconButton icon="upload" label={t.restore} onClick={() => restore(row.original.name)} />
            <IconButton icon="trash" label={t.delete} tone="danger" onClick={() => remove(row.original.name)} />
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        eyebrow={t.system}
        title={t.backups}
        subtitle={t.backupsSubtitle}
        icon="database"
        actions={<Button icon="plus" variant="primary" onClick={create} loading={busy}>{t.createBackup}</Button>}
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">
          <Icon name="checkCircle" size={15} /> {notice}
        </div>
      )}

      <Card className="mb-5">
        <SectionTitle
          title={t.schedule}
          subtitle={t.scheduleSubtitle}
          action={<Button size="sm" icon="check" onClick={saveSettings} loading={savingSettings}>{t.save}</Button>}
        />
        {settings ? (
          <div className="grid gap-5 lg:grid-cols-4">
            <div className="space-y-3">
              <Toggle
                checked={settings.enabled}
                onChange={(value) => setSettings({ ...settings, enabled: value })}
                label={t.autoBackup}
              />
              <p className="text-[11px] text-subtle">
                {settings.nextRunAt ? `${t.nextRun}: ${new Date(settings.nextRunAt).toLocaleString()}` : '—'}
              </p>
              <p className="text-[11px] text-subtle">
                {settings.lastRunAt ? `${t.lastRun}: ${new Date(settings.lastRunAt).toLocaleString()}` : '—'}
              </p>
            </div>
            <Field label={t.intervalHours}>
              <input
                type="number"
                min={1}
                max={720}
                value={settings.intervalHours}
                onChange={(e) => setSettings({ ...settings, intervalHours: Number(e.target.value) })}
                className="field"
              />
            </Field>
            <Field label={t.retention}>
              <input
                type="number"
                min={1}
                max={100}
                value={settings.retention}
                onChange={(e) => setSettings({ ...settings, retention: Number(e.target.value) })}
                className="field"
              />
            </Field>
            <div className="rounded-lg border border-line bg-surface-2/50 p-3 text-[11px] leading-relaxed text-muted">
              {t.backupsSubtitle}
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-subtle">{t.loading}</div>
        )}
      </Card>

      {loading ? (
        <Card className="py-20 text-center text-xs text-muted">{t.loading}</Card>
      ) : items.length === 0 ? (
        <Card className="py-20 text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-lg border border-line bg-surface-2 text-subtle"><Icon name="database" size={20} /></div>
          <p className="text-sm font-medium text-fg">{t.noBackups}</p>
          <p className="mt-1 text-xs text-muted">{t.backupsSubtitle}</p>
        </Card>
      ) : (
        <DataTable data={items} columns={columns} loading={loading} getRowId={(row) => row.name} />
      )}
    </>
  );
}
