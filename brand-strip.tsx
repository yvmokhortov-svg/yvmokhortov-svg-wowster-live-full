export function BrandStrip() {
  return (
    <div className="border-b border-black/10 bg-white">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 md:grid-cols-[1.2fr_1fr]">
        <div className="px-6 py-5">
          <p className="text-4xl font-bold leading-none">
            <span className="text-[var(--brand-blue)]">Wowster</span>
            <span className="text-[var(--brand-red)]">live</span>
          </p>
          <p className="mt-1 text-3xl font-semibold leading-none">
            <span className="text-[var(--brand-blue)]">World Live Art</span>{" "}
            <span className="text-[var(--brand-red)]">Space</span>
          </p>
        </div>
        <div className="min-h-24 bg-gradient-to-r from-[#d3b085] via-[#bb8a53] to-[#8f6338]" />
      </div>
    </div>
  );
}
