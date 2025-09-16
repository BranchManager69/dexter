export const metadata = { title: 'Dexter Alpha' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{margin:0, fontFamily:'system-ui, sans-serif', color:'#e6edf3', background:'#0b0c10'}}>
        <header style={{position:'sticky', top:0, background:'#11131a', borderBottom:'1px solid #222633', padding:'10px 16px'}}>
          <nav style={{display:'flex', gap:12}}>
            <a href="/voice" style={{color:'#e6edf3'}}>Voice</a>
            <a href="/chat" style={{color:'#e6edf3'}}>Chat</a>
            <a href="/tools" style={{color:'#e6edf3'}}>Tools</a>
          </nav>
        </header>
        <main style={{padding:16}}>{children}</main>
      </body>
    </html>
  );
}
