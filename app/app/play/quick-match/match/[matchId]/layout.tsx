export default function MatchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-dvh w-screen overflow-hidden">
      {children}
    </div>
  );
}
