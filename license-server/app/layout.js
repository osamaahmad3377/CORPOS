import './globals.css';

export const metadata = {
  title: 'CorePOS License Server',
  description: 'Product key management for CorePOS',
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
