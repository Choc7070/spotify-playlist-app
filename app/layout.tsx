export const metadata = {
  title: "Spotify Playlist App",
  description: "Spotify playlist bulk share tool"
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f8f8f8" }}>
        {children}
      </body>
    </html>
  );
}
