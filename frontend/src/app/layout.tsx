import ClientLayout from '../components/client-layout';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
