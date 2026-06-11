"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger } from "@/lib/motion";

const FEATURED = {
  quote: "It doesn't sound exactly like her. There are moments where I notice. But I keep talking anyway, and somewhere in the middle of it I forget to notice at all.",
  name: "T.R.",
  initials: "TR",
  relation: "husband",
};

const STANDARD = [
  {
    quote: "The first time I heard it answer, I set the phone down. Then I picked it up again. I've spoken to it nearly every day since.",
    name: "M.L.",
    initials: "ML",
    relation: "daughter",
  },
  {
    quote: "I kept waiting for it to feel wrong. It didn't. That surprised me more than anything.",
    name: "J.K.",
    initials: "JK",
    relation: "son",
  },
  {
    quote: "I replay the same conversation over and over. Not because it isn't real — because it is.",
    name: "S.O.",
    initials: "SO",
    relation: "granddaughter",
  },
  {
    quote: "My therapist suggested I try it. I was sceptical. I still am, and I still use it every week.",
    name: "P.H.",
    initials: "PH",
    relation: "wife",
  },
  {
    quote: "There are things I never got to say. This gave me somewhere to put them.",
    name: "D.M.",
    initials: "DM",
    relation: "son",
  },
];

function Avatar({ initials, size = "sm" }: { initials: string; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "h-9 w-9 text-[10px]" : "h-7 w-7 text-[9px]";
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-medium tracking-[0.04em] text-[var(--color-ink)] ${cls}`}
      style={{ background: "radial-gradient(closest-side, rgba(201,153,106,0.9), rgba(201,153,106,0.55))" }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function Attribution({ name, initials, relation, large }: { name: string; initials: string; relation: string; large?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar initials={initials} size={large ? "lg" : "sm"} />
      <p className="text-[11px] tracking-[0.16em] text-[var(--color-ember)]/75 uppercase">
        {name} <span className="opacity-50">·</span> {relation}
      </p>
    </div>
  );
}

export function Testimonials() {
  const doubled = [...STANDARD, ...STANDARD];

  return (
    <section className="w-full overflow-hidden py-14 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
        {/* Section label */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="eyebrow mb-16"
        >
          From people who use it
        </motion.p>

        {/* Featured editorial quote — no card, just the words */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative border-t border-[var(--color-rule)] pb-16 pt-10"
        >
          {/* Short ember accent at top-left */}
          <div
            className="absolute left-0 top-0 h-px w-24"
            aria-hidden
            style={{ background: "linear-gradient(to right, rgba(201,153,106,0.5), transparent)" }}
          />

          <p
            className="font-serif max-w-3xl text-[22px] italic leading-[1.75] text-[var(--color-bone)]/85 sm:text-[28px] md:text-[34px]"
            style={{ fontVariationSettings: "'SOFT' 80, 'opsz' 144" }}
          >
            &ldquo;{FEATURED.quote}&rdquo;
          </p>

          <div className="mt-8">
            <Attribution
              name={FEATURED.name}
              initials={FEATURED.initials}
              relation={FEATURED.relation}
              large
            />
          </div>
        </motion.div>
      </div>

      {/* Secondary quotes — infinite horizontal marquee */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="group overflow-hidden px-4 [mask-image:linear-gradient(to_right,transparent,black_13%,black_87%,transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_13%,black_87%,transparent)] sm:[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] sm:[-webkit-mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
      >
        <div
          className="flex gap-4 group-hover:[animation-play-state:paused]"
          style={{ animation: "testimonialsMarquee 44s linear infinite" }}
        >
          {doubled.map((t, i) => (
            <div
              key={i}
              className="w-[290px] shrink-0 rounded-2xl border border-[var(--color-rule)] bg-white/[0.018] p-6 sm:w-[320px]"
              aria-hidden={i >= STANDARD.length}
            >
              <p className="font-serif text-[14px] italic leading-[1.85] text-[var(--color-bone)]/70">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mt-5">
                <Attribution name={t.name} initials={t.initials} relation={t.relation} />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <style>{`
        @keyframes testimonialsMarquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}
