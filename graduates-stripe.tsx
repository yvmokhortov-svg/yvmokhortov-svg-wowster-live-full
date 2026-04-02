type FeaturedGraduate = {
  id: string;
  slotIndex: number;
  nickname: string;
  avatarUrl: string | null;
  imageUrl: string;
};

type Props = {
  items: FeaturedGraduate[];
};

export function GraduatesStripe({ items }: Props) {
  if (!items.length) return null;

  const loop = [...items, ...items];

  return (
    <section className="rounded-xl border border-[var(--line)] bg-white p-5">
      <h2 className="text-2xl font-semibold">Graduates this month</h2>
      <div className="mt-4 overflow-hidden">
        <div className="graduates-marquee-track flex min-w-max gap-4">
          {loop.map((item, idx) => (
            <article
              key={`${item.id}-${idx}`}
              className="relative h-[220px] w-[120px] shrink-0 overflow-hidden border-[8px] border-[#f3efe5] bg-[#fffaf0] shadow-[0_8px_16px_rgba(0,0,0,0.12)]"
            >
              <img
                src={item.imageUrl}
                alt={`Graduate ${item.nickname}`}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1.5 py-1 text-[10px] text-white">
                <p className="truncate font-semibold">{item.nickname}</p>
                <p className="truncate">Slot {item.slotIndex}</p>
              </div>
              {item.avatarUrl ? (
                <img
                  src={item.avatarUrl}
                  alt={`${item.nickname} avatar`}
                  className="absolute left-1 top-1 h-6 w-6 rounded-full border border-white/70 object-cover"
                />
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
