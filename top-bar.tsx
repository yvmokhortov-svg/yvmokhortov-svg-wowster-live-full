export function TopBar() {
  return (
    <div className="h-14 bg-[var(--bg-top)] text-white">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-4">
        <button aria-label="Open menu" className="text-xl leading-none">
          ☰
        </button>
        <p className="text-lg font-medium">Stream</p>
        <div className="w-5" />
      </div>
    </div>
  );
}
