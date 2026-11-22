'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useLang } from '../../../lib/i18n';
import { Icon } from '../../../components/icons';
import { Badge, Card, CodeBlock, IconButton, SectionTitle, cn, formatBytes } from '../../../components/ui';

type SubNode = { id: string; name: string; address: string };
type SubLink = { id: string; tag: string; protocol: string; link: string };
type SubData = {
  status: string;
  expiresAt: string | null;
  trafficUsed: number;
  trafficLimit: number;
  nodes?: SubNode[];
  links?: SubLink[];
};

const formats = ['raw', 'base64', 'clash', 'singbox', 'json'];

export default function SubscriptionPage() {
  const { t } = useLang();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SubData | null>(null);
  const [error, setError] = useState(false);
  const [format, setFormat] = useState('json');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    fetch(`${apiBase}/api/subscriptions/${token}?format=json`)
      .then((r) => { if (!r.ok) throw new Error('failed'); return r.json(); })
      .then(setData)
      .catch(() => setError(true));
  }, [token, apiBase]);

  const loadFormat = async (value: string) => {
    setFormat(value);
    const res = await fetch(`${apiBase}/api/subscriptions/${token}?format=${value}`);
    setOutput(await res.text());
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (error || !data) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-danger/25 bg-danger/10 text-danger">
            <Icon name="alert" size={20} />
          </div>
          <p className="text-sm font-medium text-fg">Subscription unavailable</p>
          <p className="mt-1 text-xs text-muted">The link is invalid, expired or revoked.</p>
        </Card>
      </main>
    );
  }

  const active = data.status.toLowerCase() === 'active';
  const subscriptionUrl = `${apiBase}/api/subscriptions/${token}?format=base64`;
  const used = Number(data.trafficUsed || 0);
  const limit = Number(data.trafficLimit || 0);
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  return (
    <main className="relative mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-[0_8px_24px_-8px_var(--brand)]">
            <Icon name="zap" size={19} />
          </div>
          <div>
            <p className="text-sm font-semibold text-fg">XreyStudio</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-subtle">{t.subscriptionPage}</p>
          </div>
        </div>
        <Badge tone={active ? 'success' : 'danger'} dot>{data.status.toUpperCase()}</Badge>
      </div>

      <Card>
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-subtle">{t.status}</p>
            <p className={cn('mt-2 text-lg font-semibold', active ? 'text-success' : 'text-danger')}>{data.status}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-subtle">{t.expiry}</p>
            <p className="mt-2 text-sm font-medium text-fg">{data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-subtle">{t.traffic}</p>
            <p className="mt-2 text-sm font-medium text-fg tabular-nums">{formatBytes(used)} <span className="text-subtle">/ {limit ? formatBytes(limit) : '∞'}</span></p>
            {limit > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className={cn('h-full rounded-full', percent > 85 ? 'bg-danger' : 'bg-brand')} style={{ width: `${percent}%` }} />
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle title={t.qrCode} subtitle="Scan with your preferred client app" />
        <div className="flex flex-wrap items-center gap-5">
          <div className="rounded-xl border border-line bg-white p-3">
            <QRCodeSVG value={subscriptionUrl} size={140} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-subtle">Subscription URL</p>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-2">
              <code className="mono min-w-0 flex-1 truncate text-[11px] text-muted">{subscriptionUrl}</code>
              <IconButton icon={copied ? 'check' : 'copy'} label={t.copy} tone={copied ? 'brand' : 'default'} onClick={() => copy(subscriptionUrl)} />
            </div>
            <p className="mt-2 text-[11px] text-subtle">Keep this link private — it grants access to your subscription.</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title={t.availableFormats} subtitle="Choose the config format for your client" />
          <div className="flex flex-wrap gap-2">
            {formats.map((item) => (
              <button
                key={item}
                onClick={() => loadFormat(item)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  format === item ? 'border-brand/40 bg-brand-soft text-brand' : 'border-line bg-surface-2 text-muted hover:text-fg',
                )}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          {output && <CodeBlock className="mt-4">{output}</CodeBlock>}
        </Card>

        <Card>
          <SectionTitle title={t.connections} subtitle="Available locations" />
          {data.nodes?.length ? (
            <div className="space-y-2">
              {data.nodes.map((node) => (
                <div key={node.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/50 p-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg border border-cyan/25 bg-cyan/10 text-cyan"><Icon name="server" size={15} /></div>
                  <div>
                    <p className="text-xs font-medium text-fg">{node.name}</p>
                    <p className="mono text-[10px] text-subtle">{node.address}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-subtle">No nodes assigned</p>
          )}
        </Card>
      </div>

      {data.links?.length ? (
        <Card>
          <SectionTitle title={t.links} subtitle="Individual connection links" />
          <div className="space-y-2">
            {data.links.map((link) => (
              <div key={link.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/50 p-3">
                <Badge tone="brand">{link.protocol.toUpperCase()}</Badge>
                <span className="text-xs font-medium text-fg">{link.tag}</span>
                <code className="mono ml-auto min-w-0 max-w-[60%] truncate text-[10px] text-subtle">{link.link}</code>
                <IconButton icon="copy" label={t.copy} onClick={() => copy(link.link)} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className="pb-6 text-center text-[10px] text-subtle">Powered by XreyStudioServer · v1.3.0</p>
    </main>
  );
}
