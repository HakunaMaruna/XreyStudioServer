import type { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DOC_SECTIONS } from '../../lib/docs-content';
import { siteUrl } from '../../lib/seo';

export const metadata: Metadata = {
  title: 'Documentation: installation, nodes, subscriptions and backups',
  description:
    'Step-by-step XreyStudio Server documentation: Docker installation, node onboarding, HWID device limits, subscription formats, encrypted backups, health checks and recovery tools.',
  alternates: { canonical: '/docs' },
  openGraph: {
    title: 'XreyStudio Server documentation',
    description: 'Guides and operational procedures for the self-hosted VPN control panel.',
    type: 'article',
    url: '/docs',
  },
  keywords: [
    'XreyStudio Server documentation',
    'self-hosted VPN panel',
    'Xray control panel',
    'node onboarding',
    'subscription formats',
    'encrypted backups',
  ],
};

export default function PublicDocsPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'XreyStudio Server documentation',
    description: 'Guides and operational procedures for the self-hosted VPN control panel.',
    inLanguage: 'en',
    about: {
      '@type': 'SoftwareApplication',
      name: 'XreyStudio Server',
      applicationCategory: 'NetworkApplication',
    },
    url: `${siteUrl()}/docs`,
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <script type="application/ld+json">
        {JSON.stringify(jsonLd).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}
      </script>
      <header className="mb-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">XreyStudio Server</p>
        <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Self-hosted VPN control panel — documentation
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
          Install the panel, connect Xray nodes, issue subscriptions with device (HWID) limits,
          monitor health, and restore from encrypted backups. Every guide below is written for
          operators who run the service on their own infrastructure.
        </p>
        <nav aria-label="Documentation chapters" className="mt-6 flex flex-wrap gap-2">
          {DOC_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand hover:text-brand"
            >
              {section.title}
            </a>
          ))}
        </nav>
      </header>

      <div className="space-y-8">
        {DOC_SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-6 rounded-2xl border border-line bg-surface-1 p-5 sm:p-7"
          >
            <h2 className="mb-4 text-xl font-semibold text-fg">{section.title}</h2>
            <div className="doc-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.markdown}</ReactMarkdown>
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-line pt-6 text-xs text-subtle">
        <p>
          Full API reference, runbooks and release notes live in the project repository under
          <code className="mx-1">docs/</code>.
        </p>
      </footer>
    </main>
  );
}
