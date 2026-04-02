import { footerLinks } from "@/lib/nav";

export function Footer() {
  return (
    <footer className="dot-pattern mt-10 border-t border-black/20">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3 text-xs text-slate-200">
        {footerLinks.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </footer>
  );
}
