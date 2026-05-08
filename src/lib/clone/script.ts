/**
 * Curated reading script for Instant Voice Cloning.
 *
 * Designed for:
 *  - phonetic coverage (every English vowel & consonant cluster appears)
 *  - prosodic range (statements, questions, soft pauses, gentle emphasis)
 *  - emotional breadth without performance — calm, considered, not theatrical
 *  - ~75–90 seconds when read at a natural pace (target: 130–150 wpm)
 *
 * Read slowly. Pause where the line breaks fall. Don't perform — just read.
 */

export interface ScriptStanza {
  id: string;
  lines: string[];
}

export const CLONE_SCRIPT: ScriptStanza[] = [
  {
    id: "open",
    lines: [
      "My name is the one I have always answered to.",
      "I am sitting somewhere quiet, reading these words slowly,",
      "the way I would tell a story to someone I love.",
    ],
  },
  {
    id: "warmth",
    lines: [
      "There are small things I would want remembered.",
      "The sound of a kettle in the morning.",
      "A door closing softly when the house is still asleep.",
      "Six numbers, a song I half knew, a joke that only worked at our table.",
    ],
  },
  {
    id: "range",
    lines: [
      "Some questions are easy. Where did you grow up? What did you have for breakfast?",
      "Other questions take longer. What did your mother sing to you when you were small?",
      "And some questions you carry the rest of your life.",
    ],
  },
  {
    id: "phonetic",
    lines: [
      "The crow flies low. The river bends west. The city hums all night long.",
      "Five young brothers were quietly watching the eclipse from the rooftop.",
      "Judges shape the future. Teachers shape the world. Mothers shape the rest.",
    ],
  },
  {
    id: "close",
    lines: [
      "If you are listening to this, then something I left behind has been kept.",
      "That is enough.",
      "I love you. Take the long road home.",
    ],
  },
];

export const SCRIPT_TARGET_SECONDS = 75;
export const SCRIPT_MAX_SECONDS = 110;
export const SCRIPT_MIN_SECONDS = 45;
