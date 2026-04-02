"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { topNavLinks } from "@/lib/nav";

export function MainNav() {
  const pathname = usePathname();

  return (
    <div className="dot-pattern border-y border-black/20">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-xs">
        {topNavLinks.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "font-semibold text-red-400" : "text-slate-200"}
            >
              {link.label}
            </Link>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-slate-400">Search</span>
          <span className="h-3.5 w-20 rounded-full bg-slate-200/90" />
        </div>
      </div>
    </div>
  );
}
