"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Input, Label, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/session";
import type { PersonaConfig } from "@/lib/types";
import { fadeUp, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function PersonaSetup() {
  const router = useRouter();
  const voiceId = useSession((s) => s.voiceId);
  const voiceName = useSession((s) => s.voiceName);
  const setPersona = useSession((s) => s.setPersona);
  const persona = useSession((s) => s.persona);

  const [mode, setMode] = useState<PersonaConfig["mode"]>(persona.mode);
  const [name, setName] = useState(persona.name || voiceName || "");
  const [relationship, setRelationship] = useState(persona.relationship ?? "");
  const [description, setDescription] = useState(persona.description ?? "");
  const [catchphrases, setCatchphrases] = useState(persona.catchphrases ?? "");
  const [avoidPhrases, setAvoidPhrases] = useState(persona.avoidPhrases ?? "");
  const [speechStyle, setSpeechStyle] = useState(
    persona.speechStyle ?? {
      warmth: 6,
      directness: 5,
      expressiveness: 4,
      humor: 3,
      talkativeness: 3,
    },
  );

  useEffect(() => {
    if (!voiceId) router.replace("/record");
  }, [voiceId, router]);

  const begin = () => {
    setPersona({
      mode,
      name: name.trim(),
      relationship: relationship.trim() || undefined,
      description: description.trim() || undefined,
      catchphrases: catchphrases.trim() || undefined,
      avoidPhrases: avoidPhrases.trim() || undefined,
      speechStyle,
      calibration: persona.calibration,
    });
    router.push("/conversation");
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pt-4 pb-16 sm:px-8">
      <motion.header
        initial={false}
        animate="enter"
        variants={stagger(0.05)}
        className="flex flex-col gap-3"
      >
        <motion.p
          variants={fadeUp}
          className="text-[12px] tracking-[0.22em] text-[var(--color-bone-dim)] uppercase"
        >
          Step three · Who
        </motion.p>
        <motion.h1
          variants={fadeUp}
          className="font-serif text-[34px] leading-[1.08] tracking-[-0.02em] text-balance text-[var(--color-bone)] sm:text-[44px]"
        >
          Who is this voice?
        </motion.h1>
        <motion.p
          variants={fadeUp}
          className="max-w-xl text-[15px] leading-[1.7] text-[var(--color-bone)]/65"
        >
          You can speak with a clone of yourself, or set it up as someone
          specific. Either way takes about thirty seconds.
        </motion.p>
      </motion.header>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 grid grid-cols-2 gap-3 sm:max-w-md"
      >
        <ModeCard
          active={mode === "self"}
          onClick={() => setMode("self")}
          label="A clone of you"
          hint="No setup. Just begin."
        />
        <ModeCard
          active={mode === "persona"}
          onClick={() => setMode("persona")}
          label="Someone specific"
          hint="Name them. Describe them."
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="hairline mt-8 rounded-2xl bg-white/[0.015] p-7 sm:p-9"
      >
        <div className="space-y-6">
          <div>
            <Label htmlFor="p-name" hint={mode === "self" ? "optional" : "required"}>
              Name
            </Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === "self" ? "Yours, or whoever this voice is" : "Their name"}
              maxLength={80}
              autoFocus
            />
          </div>

          {mode === "persona" ? (
            <>
              <div>
                <Label htmlFor="p-rel" hint="optional">
                  Relationship to you
                </Label>
                <Input
                  id="p-rel"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="My father · My grandmother · A friend I lost"
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="p-desc" hint="3 to 5 lines">
                  How they spoke. Who they were.
                </Label>
                <Textarea
                  id="p-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    "Dry humour. Loved Leeds United. Said \"go on then\" more than anyone\nshould. Hardly ever asked questions, but listened to everything.\nNever raised his voice."
                  }
                  rows={6}
                  maxLength={1200}
                />
                <p className="mt-2 text-[12px] text-[var(--color-bone-dim)]">
                  Specifics outperform adjectives. One quirk is worth ten "kind, caring, loving".
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="p-catch" hint="optional">
                    Things they said
                  </Label>
                  <Textarea
                    id="p-catch"
                    value={catchphrases}
                    onChange={(e) => setCatchphrases(e.target.value)}
                    placeholder={"go on then\nlisten, love\nsame as ever"}
                    rows={4}
                    maxLength={500}
                  />
                </div>
                <div>
                  <Label htmlFor="p-avoid" hint="optional">
                    Things they&apos;d never say
                  </Label>
                  <Textarea
                    id="p-avoid"
                    value={avoidPhrases}
                    onChange={(e) => setAvoidPhrases(e.target.value)}
                    placeholder={"therapy phrases\ncorporate words\nanything too cheerful"}
                    rows={4}
                    maxLength={500}
                  />
                </div>
              </div>
            </>
          ) : null}

          <div className="space-y-5">
            <Label>How should they talk?</Label>
            <div className="space-y-4">
              <StyleSlider
                label="Warmth"
                low="Reserved"
                high="Tender"
                value={speechStyle.warmth}
                onChange={(warmth) => setSpeechStyle((s) => ({ ...s, warmth }))}
              />
              <StyleSlider
                label="Directness"
                low="Gentle"
                high="Plain"
                value={speechStyle.directness}
                onChange={(directness) => setSpeechStyle((s) => ({ ...s, directness }))}
              />
              <StyleSlider
                label="Expressiveness"
                low="Quiet"
                high="Expressive"
                value={speechStyle.expressiveness}
                onChange={(expressiveness) => setSpeechStyle((s) => ({ ...s, expressiveness }))}
              />
              <StyleSlider
                label="Humor"
                low="Serious"
                high="Dry"
                value={speechStyle.humor}
                onChange={(humor) => setSpeechStyle((s) => ({ ...s, humor }))}
              />
              <StyleSlider
                label="Talkativeness"
                low="Few words"
                high="More words"
                value={speechStyle.talkativeness}
                onChange={(talkativeness) => setSpeechStyle((s) => ({ ...s, talkativeness }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-rule)] pt-6">
            <p className="text-[12px] text-[var(--color-bone-dim)]">
              {voiceName ? (
                <>
                  Voice:
                  <span className="ml-1 text-[var(--color-bone)]/70">{voiceName}</span>
                </>
              ) : (
                "Using the voice you just made"
              )}
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={begin}
              disabled={mode === "persona" && !name.trim()}
            >
              Begin the conversation
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function StyleSlider({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const pct = ((value - 1) / 9) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="text-[var(--color-bone)]/82">{label}</span>
        <span className="tabular-nums text-[var(--color-bone-dim)]">{value}/10</span>
      </div>
      <div className="relative">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-[var(--color-ember)] transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={label}
        />
      </div>
      <div className="flex justify-between text-[11px] text-[var(--color-bone-dim)]/55">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start gap-2 rounded-2xl p-5 text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        active
          ? "border border-[var(--color-ember)]/40 bg-[var(--color-ember)]/[0.08] shadow-[0_0_0_1px_rgba(199,162,124,0.18)_inset,0_20px_60px_-30px_rgba(199,162,124,0.5)]"
          : "border border-[var(--color-rule-strong)] bg-white/[0.02] hover:border-[var(--color-ember)]/30 hover:bg-white/[0.04]",
      )}
    >
      <span
        className={cn(
          "inline-flex h-2 w-2 rounded-full transition-colors duration-300",
          active ? "bg-[var(--color-ember)]" : "bg-[var(--color-bone-dim)]/50",
        )}
      />
      <span className="text-[15px] text-[var(--color-bone)]">{label}</span>
      <span className="text-[12px] text-[var(--color-bone-dim)]">{hint}</span>
    </button>
  );
}
