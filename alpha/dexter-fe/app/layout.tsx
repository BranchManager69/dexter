import { AuthProvider } from './auth-context';
import { Header } from './header';

export const metadata = { title: 'Dexter Alpha' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{margin:0, fontFamily:'system-ui, sans-serif', color:'#e6edf3', background:'#0b0c10'}}>
        <AuthProvider>
          <Header />
          <main style={{padding:16}}>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
