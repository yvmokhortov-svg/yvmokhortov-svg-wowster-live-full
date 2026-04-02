export default function CountryDeniedPage() {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-[var(--line)] bg-white p-8 text-center">
      <h1 className="text-3xl font-bold">Access unavailable</h1>
      <p className="mt-3 text-[var(--text-soft)]">
        Sorry, the platform is not active in your country.
      </p>
    </div>
  );
}
