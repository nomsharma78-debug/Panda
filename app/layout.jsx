import './globals.css';
import { ToastProvider } from '@/components/context/ToastContext';
import { AuthProvider } from '@/components/context/AuthContext';
import { ContentProtection } from '@/components/security/ContentProtection';

export const metadata = {
  title: 'Panda — Secure Personal Digital Vault',
  description: 'Your private digital space for passwords, cards, notes, photos, videos, and documents.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon.jpg', type: 'image/jpeg' },
      { url: '/favicon.ico' },
    ],
    apple: [
      { url: '/icon.jpg' },
    ],
    shortcut: '/icon.jpg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        <ContentProtection />
        <ToastProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
