"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Field";
import type { PersonaConfig } from "@/lib/types";

interface PersonaFormProps {
  initialName: string;
  initialRelationship: string;
  initialPersona: PersonaConfig;
  /** Persist the merged result. Throwing shows an inline error. */
  onSave: (next: { name: string; relationship: string; persona: PersonaConfig }) => Promise<void>;
}

const DEFAULT_STYLE = {
  warmth: 6,
  directness: 5,
  expressiveness: 4,
  humor: 3,
  talkativeness: 3,
};

/**
 * The single persona editor. Every field that shapes how a person speaks —
 * identity, description, phrases, and speech style — lives here, and the
 * result is written to one place (the subject's persona).
 */
export function PersonaForm({
  initialName,
  initialRelationship,
  initialPersona,
  onSave,
}: PersonaFormProps) {
  const [name, setName] = useState(initialName);
  const [relationship, setRelationship] = useState(initialRelationship);
  const [description, setDescription] = useState(initialPersona.description ?? "");
  const [catchphrases, setCatchphrases] = useState(initialPersona.catchphrases ?? "");
  const [avoidPhrases, setAvoidPhrases] = useState(initialPersona.avoidPhrases ?? "");
  const [speechStyle, setSpeechStyle] = useState(initialPersona.speechStyle ?? DEFAULT_STYLE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError("A name is needed.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        relationship: relationship.trim(),
        persona: {
          ...initialPersona,
          mode: initialPersona.mode ?? "persona",
          name: name.trim(),
          relationship: relationship.trim() || undefined,
          description: description.trim() || undefined,
          catchphrases: catchphrases.trim() || undefined,
          avoidPhrases: avoidPhrases.trim() || undefined,
          speechStyle,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="pf-name">Name</Label>
          <Input
            id="pf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </div>
        <div>
          <Label htmlFor="pf-rel" hint="optional">
            Relationship to you
          </Label>
          <Input
            id="pf-rel"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="My father · My grandmother · A friend"
            maxLength={120}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="pf-desc" hint="specifics beat adjectives">
          How they spoke. Who they were.
        </Label>
        <Textarea
          id="pf-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            "Dry humour. Loved Leeds United. Said \"go on then\" more than anyone should. Hardly ever asked questions, but listened to everything."
          }
          rows={5}
          maxLength={2000}
        />
        <p className="mt-2 text-[12px] leading-[1.6] text-[var(--color-text-tertiary)]">
          One real quirk is worth ten &ldquo;kind, caring, loving&rdquo;.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="pf-catch" hint="one per line">
            Things they said
          </Label>
          <Textarea
            id="pf-catch"
            value={catchphrases}
            onChange={(e) => setCatchphrases(e.target.value)}
            placeholder={"go on then\nlisten, love\nsame as ever"}
            rows={3}
            maxLength={500}
          />
        </div>
        <div>
          <Label htmlFor="pf-avoid" hint="optional">
            Things they&apos;d never say
          </Label>
          <Textarea
            id="pf-avoid"
            value={avoidPhrases}
            onChange={(e) => setAvoidPhrases(e.target.value)}
            placeholder={"therapy phrases\ncorporate words\nanything too cheerful"}
            rows={3}
            maxLength={500}
          />
        </div>
      </div>

      <div className="space-y-4">
        <Label>How they talk</Label>
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

      <div className="flex items-center gap-4 border-t border-[var(--color-rule)] pt-5">
        <Button variant="primary" size="md" onClick={() => void save()} loading={saving} disabled={saving}>
          Save changes
        </Button>
        <AnimatePresence>
          {saved ? (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5 text-[13px] text-[var(--color-sage)]"
              role="status"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeOpacity="0.3" />
                <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Saved
            </motion.span>
          ) : null}
        </AnimatePresence>
        {error ? (
          <p className="text-[13px] text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="text-[var(--color-bone)]/85">{label}</span>
        <span className="tabular-nums text-[var(--color-text-secondary)]">{value}/10</span>
      </div>
      <div className="relative">
        {/* Filled portion of the track, painted under the native input */}
        <div className="pointer-events-none absolute top-1/2 h-[3px] w-full -translate-y-1/2 overflow-hidden rounded-full">
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
          className="range-ember relative"
          aria-label={label}
          aria-valuetext={`${label}: ${value} of 10`}
        />
      </div>
      <div className="flex justify-between text-[11px] text-[var(--color-text-tertiary)]">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
