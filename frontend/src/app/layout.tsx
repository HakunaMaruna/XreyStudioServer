import { Suspense } from 'react';
import './globals.css';
import ClientLayout from '../components/client-layout';

const themeScript = `
try {
  var t = localStorage.getItem('xss_theme');
  if (t === 'light') document.documentElement.classList.add('light');
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-app text-fg antialiased">
        <Suspense fallback={null}>
          <ClientLayout>{children}</ClientLayout>
        </Suspense>
      </body>
    </html>
  );
}
