export function BackgroundCanvas() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-1/3 left-1/2 h-[120vh] w-[120vh] -translate-x-1/2 rounded-full opacity-[0.7] blur-[100px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(201,153,106,0.22), rgba(201,153,106,0.06) 60%, transparent 80%)",
        }}
      />
      <div
        className="absolute right-[-30vh] bottom-[-40vh] h-[80vh] w-[80vh] rounded-full opacity-40 blur-[120px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(158,116,92,0.14), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.065]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          backgroundSize: "220px 220px",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_-10%,transparent,rgba(0,0,0,0.6))]" />
    </div>
  );
}
