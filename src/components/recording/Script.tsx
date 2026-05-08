import { CLONE_SCRIPT } from "@/lib/clone/script";

export function Script({ active }: { active: boolean }) {
  return (
    <div className="font-serif relative space-y-7 text-[20px] leading-[1.55] tracking-[-0.005em] text-[var(--color-bone)]/85 sm:text-[24px] sm:leading-[1.5]">
      {CLONE_SCRIPT.map((stanza, idx) => (
        <div
          key={stanza.id}
          className="space-y-1.5 transition-opacity duration-500"
          style={{
            opacity: active ? Math.max(0.35, 1 - idx * 0.08) : 1,
          }}
        >
          {stanza.lines.map((line, i) => (
            <p key={i} className="text-pretty">
              {line}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
