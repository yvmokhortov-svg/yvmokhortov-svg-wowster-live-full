import { BrandStrip } from "./brand-strip";
import { Footer } from "./footer";
import { MainNav } from "./main-nav";
import { TopBar } from "./top-bar";

type SiteShellProps = {
  children: React.ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  return (
    <>
      <TopBar />
      <BrandStrip />
      <MainNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      <Footer />
    </>
  );
}
