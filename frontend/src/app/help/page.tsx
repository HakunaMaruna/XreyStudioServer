'use client';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, isLoggedIn } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { DOC_SECTIONS } from '../../lib/docs-content';
import { Icon } from '../../components/icons';
import { Card, PageHeader, cn } from '../../components/ui';

export default function DocsPage() {
  const { t } = useLang();
  const [active, setActive] = useState(DOC_SECTIONS[0].id);
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) { window.location.href = '/login'; return; }
    api.get('/api/health').catch(() => undefined);
    fetch('/api/docs-json').then((r) => r.json()).then((d: any) => setVersion(d.info?.version || '')).catch(() => undefined);
  }, []);

  const sections = useMemo(
    () => DOC_SECTIONS.filter((s) =>
      !query || (s.title + s.markdown).toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  const current = DOC_SECTIONS.find((s) => s.id === active) || DOC_SECTIONS[0];

  return (
    <>
      <PageHeader eyebrow={t.system} title={t.docs} subtitle={t.docsSubtitle} icon="file" />

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit p-3" >
          <div className="relative mb-3">
            <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              aria-label={t.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search}
              className="field pl-8 text-xs"
            />
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActive(section.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors lg:w-full',
                  active === section.id
                    ? 'bg-brand-soft font-medium text-brand'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Icon name={section.icon} size={15} />
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
              </button>
            ))}
            {sections.length === 0 && <p className="px-3 py-4 text-xs text-subtle">{t.noData}</p>}
          </nav>
          <div className="mt-3 border-t border-line px-3 pt-3 text-[11px] text-subtle">
            {t.version}{version ? ` v${version}` : ''}
          </div>
        </Card>

        <Card className="min-w-0 p-4 sm:p-5">
          <div className="doc-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.markdown}</ReactMarkdown>
          </div>
        </Card>
      </div>
    </>
  );
}
