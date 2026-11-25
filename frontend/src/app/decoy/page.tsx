import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Welcome',
  description: 'This host is not configured to serve a control panel.',
  robots: { index: false, follow: false },
};

export default function DecoyPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#253046',
        background: '#f5f7fb',
        padding: 24,
      }}
    >
      <section style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Welcome</h1>
        <p style={{ lineHeight: 1.6 }}>
          This host is not configured to serve a control panel. If you are looking for the
          management interface, contact your administrator for the correct address.
        </p>
      </section>
    </main>
  );
}
