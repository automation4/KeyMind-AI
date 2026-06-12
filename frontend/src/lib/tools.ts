import { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

export type ToolDef = {
  id: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  description: string;
  accent: "orange" | "yellow" | "mint" | "peach" | "sky" | "lilac";
  multi?: boolean;
  options?: { key: string; label: string; choices: string[] }[];
};

export const TOOLS: ToolDef[] = [
  { id: "grammar", label: "Grammar", icon: "checkmark-circle", description: "Fix grammar & spelling in any language", accent: "mint" },
  {
    id: "tone",
    label: "Tone",
    icon: "color-palette",
    description: "Change the tone of your text",
    accent: "lilac",
    options: [{ key: "tone", label: "Tone", choices: ["Professional", "Casual", "Formal", "Friendly", "Assertive", "Polite", "Humorous"] }],
  },
  { id: "smart_reply", label: "Reply", icon: "chatbubble-ellipses", description: "4 contextual reply options", accent: "yellow", multi: true },
  { id: "vocab", label: "Describe & Translate", icon: "book", description: "Explain & translate a word, phrase, or sentence with pronunciation", accent: "sky" },
  { id: "paraphrase", label: "Paraphrase", icon: "shuffle", description: "Rewrite differently (3 options)", accent: "mint", multi: true },
  { id: "longer", label: "Make Longer", icon: "expand", description: "Expand short text", accent: "sky" },
  { id: "summarize", label: "Summarize", icon: "list", description: "Condense to key points", accent: "peach", multi: true },
  { id: "synonyms", label: "Synonyms", icon: "swap-horizontal", description: "Context-aware synonyms", accent: "mint", multi: true },
  { id: "antonyms", label: "Antonyms", icon: "git-compare", description: "Opposite words for any term", accent: "peach", multi: true },
  { id: "idioms", label: "Idioms", icon: "language-outline", description: "Real-life native-English sentences using the idiom", accent: "sky", multi: true },
  {
    id: "email",
    label: "Email Writer",
    icon: "mail",
    description: "Draft professional emails",
    accent: "orange",
    options: [{ key: "tone", label: "Tone", choices: ["Formal", "Friendly", "Urgent"] }],
  },
  { id: "shorter", label: "Make Shorter", icon: "contract", description: "Trim to concise version", accent: "yellow" },
  {
    id: "versify",
    label: "Versify",
    icon: "musical-notes",
    description: "Turn text into poem or shayari",
    accent: "lilac",
    options: [{ key: "style", label: "Style", choices: ["Poem", "Shayari", "Kavithai", "Ghazal", "Rhyming verse"] }],
  },
];

export const TOOL_BY_ID: Record<string, ToolDef> = TOOLS.reduce((acc, t) => {
  acc[t.id] = t;
  return acc;
}, {} as Record<string, ToolDef>);
