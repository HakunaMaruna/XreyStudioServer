'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import DataTable from '../../components/data-table';
import { Icon } from '../../components/icons';
import { Badge, Button, Card, Field, PageHeader, Segmented, formatBytes } from '../../components/ui';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  users: number;
  activeUsers: number;
  nodes: number;
  onlineNodes: number;
  bytesUp: string;
  bytesDown: string;
  total: string;
};

type ProtocolRow = {
  protocol: string;
  inbounds: number;
  enabled: number;
  users: number;
  nodes: number;
};

type Tab = 'organizations' | 'protocols';

export default function ReportsPage() {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>('organizations');
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const query = () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params.toString();
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgData, protocolData] = await Promise.all([
        api.get(`/api/reports/organizations?${query()}`),
        api.get('/api/reports/protocols'),
      ]);
      setOrgs(orgData.data || []);
      setProtocols(protocolData.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return;
    }
    load();
  }, [load]);

  const exportCsv = async () => {
    try {
      if (tab === 'organizations') {
        await api.download(`/api/reports/organizations.csv?${query()}`, 'organizations.csv');
      } else {
        await api.download('/api/reports/protocols.csv', 'protocols.csv');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const orgColumns = useMemo<ColumnDef<OrgRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t.organizations,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-brand"><Icon name="shield" size={15} /></div>
            <div>
              <p className="font-medium text-fg">{row.original.name === 'No organization' ? t.noOrganization : row.original.name}</p>
              <p className="mono text-[10px] text-subtle">{row.original.slug}</p>
            </div>
          </div>
        ),
      },
      { accessorKey: 'users', header: t.users, cell: ({ row }) => <span className="text-fg tabular-nums">{row.original.users}</span> },
      { accessorKey: 'activeUsers', header: t.activeUsers, cell: ({ row }) => <span className="text-success tabular-nums">{row.original.activeUsers}</span> },
      { accessorKey: 'nodes', header: t.nodes, cell: ({ row }) => <span className="text-fg tabular-nums">{row.original.nodes}</span> },
      { accessorKey: 'onlineNodes', header: t.onlineNodes, cell: ({ row }) => <span className="text-success tabular-nums">{row.original.onlineNodes}</span> },
      { accessorKey: 'total', header: t.trafficUsed, cell: ({ row }) => <Badge tone="brand">{formatBytes(row.original.total)}</Badge> },
    ],
    [t],
  );

  const protocolColumns = useMemo<ColumnDef<ProtocolRow>[]>(
    () => [
      {
        accessorKey: 'protocol',
        header: t.protocol,
        cell: ({ row }) => <Badge tone="cyan">{row.original.protocol.toUpperCase()}</Badge>,
      },
      { accessorKey: 'inbounds', header: t.inbounds, cell: ({ row }) => <span className="text-fg tabular-nums">{row.original.inbounds}</span> },
      { accessorKey: 'enabled', header: t.enabled, cell: ({ row }) => <span className="text-success tabular-nums">{row.original.enabled}</span> },
      { accessorKey: 'users', header: t.users, cell: ({ row }) => <span className="text-fg tabular-nums">{row.original.users}</span> },
      { accessorKey: 'nodes', header: t.nodes, cell: ({ row }) => <span className="text-fg tabular-nums">{row.original.nodes}</span> },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        eyebrow={t.overview}
        title={t.reports}
        subtitle={t.reportsSubtitle}
        icon="gauge"
        actions={
          <>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'organizations', label: t.byOrganization, icon: 'shield' },
                { value: 'protocols', label: t.byProtocol, icon: 'plug' },
              ]}
            />
            <Button icon="download" onClick={exportCsv}>{t.exportCsv}</Button>
          </>
        }
      />

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs text-danger">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      {tab === 'organizations' && (
        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t.from}><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field w-auto" /></Field>
            <Field label={t.to}><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field w-auto" /></Field>
            <Badge tone="neutral">{t.total}: {orgs.length}</Badge>
          </div>
        </Card>
      )}

      {loading ? (
        <Card className="py-20 text-center text-xs text-muted">{t.loading}</Card>
      ) : tab === 'organizations' ? (
        <DataTable data={orgs} columns={orgColumns} loading={loading} getRowId={(row) => row.id} />
      ) : (
        <DataTable data={protocols} columns={protocolColumns} loading={loading} getRowId={(row) => row.protocol} />
      )}
    </>
  );
}
