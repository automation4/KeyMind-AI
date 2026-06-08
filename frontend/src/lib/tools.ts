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
    accent: "orange",
    options: [{ key: "tone", label: "Tone", choices: ["Professional", "Casual", "Formal", "Friendly", "Assertive", "Polite", "Humorous"] }],
  },
  { id: "smart_reply", label: "Smart Reply", icon: "chatbubble-ellipses", description: "3 contextual reply options", accent: "yellow", multi: true },
  { id: "vocab", label: "Describe", icon: "book", description: "Deep word breakdown · synonyms, antonyms, memory tips & more", accent: "sky" },
  {
    id: "translate",
    label: "Translate",
    icon: "language",
    description: "Translate to 100+ languages",
    accent: "lilac",
    options: [
      {
        key: "target_language",
        label: "Target Language",
        choices: ["English", "Hindi", "Sanskrit", "Bengali", "Tamil", "Telugu", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Urdu", "Spanish", "French", "German", "Arabic", "Japanese", "Chinese"],
      },
    ],
  },
  { id: "enhance", label: "Enhance", icon: "sparkles", description: "Improve vocabulary & flow", accent: "peach" },
  { id: "paraphrase", label: "Paraphrase", icon: "shuffle", description: "Rewrite differently (3 options)", accent: "mint", multi: true },
  { id: "longer", label: "Make Longer", icon: "expand", description: "Expand short text", accent: "sky" },
  { id: "continue", label: "Continue", icon: "arrow-forward", description: "Continue writing naturally", accent: "lilac", multi: true },
  { id: "summarize", label: "Summarize", icon: "list", description: "Condense to key points", accent: "peach", multi: true },
  { id: "synonyms", label: "Synonyms", icon: "swap-horizontal", description: "Context-aware synonyms", accent: "mint", multi: true },
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
