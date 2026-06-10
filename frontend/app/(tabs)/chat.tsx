import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { ListenButton } from "@/src/components/ListenButton";
import { AdBanner } from "@/src/components/AdBanner";
import { MicButton } from "@/src/components/MicButton";
import { DictateLanguagePicker } from "@/src/components/DictateLanguagePicker";
import { ChatResponseLanguagePicker } from "@/src/components/ChatResponseLanguagePicker";
import { MarkdownText, stripMarkdown } from "@/src/components/MarkdownText";
import { VocabCard, VocabData, VocabLanguage } from "@/src/components/VocabCard";
import { useChatResponseLanguage } from "@/src/hooks/useChatResponseLanguage";
import { storage } from "@/src/utils/storage";

const VOCAB_LANG_KEY = "keymind_vocab_lang";

/**
 * Detect when the user is asking us to "describe" a single word or short phrase.
 * If yes, return the extracted target word/phrase. Otherwise return null.
 *
 * Triggers:
 *   - One- or two-token plain input  (e.g. "indifference", "side hustle")
 *   - "what does X mean?" / "what's X mean?" / "meaning of X" / "describe X" /
 *     "define X" / "explain X" — for X up to 4 words
 */
function detectDescribeQuery(raw: string): string | null {
  const text = raw.trim().replace(/[.?!]+$/g, "");
  if (!text) return null;
  // Pure word / two-word lookup (no spaces inside the word). Reject sentences.
  const tokenCount = text.split(/\s+/).length;
  if (tokenCount <= 2 && /^[\p{L}\p{M}'\- ]+$/u.test(text)) {
    return text;
  }
  const patterns: RegExp[] = [
    /^(?:what(?:'s| is| does)?(?: the)?(?: meaning of)?|meaning of|define|describe|explain)\s+["“'']?([\p{L}\p{M}'\- ]{2,40}?)["”'']?(?:\s+(?:mean|means))?$/iu,
    /^([\p{L}\p{M}'\- ]{2,40}?)\s+(?:meaning|definition|means what|in (?:\w+))$/iu,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const w = m[1].trim();
      if (w.split(/\s+/).length <= 4 && w.length >= 2) return w;
    }
  }
  return null;
}

type Msg = {
  role: "user" | "assistant";
  content: string;
  /** Rich Describe card payload (only set when triggered by a describe query). */
  card?: VocabData;
  /** Target language used to render the card; needed for transliteration label. */
  cardLanguage?: VocabLanguage;
};

const QUICK_PROMPTS = [
  "Describe indifference",
  "What does serendipity mean?",
  "Meaning of perseverance",
  "Difference between 'affect' and 'effect'",
  "Explain present perfect tense",
];

export default function ChatScreen() {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [vocabLang, setVocabLang] = useState<VocabLanguage>("Hindi");
  const [chatInterim, setChatInterim] = useState("");
  const [chatListening, setChatListening] = useState(false);
  const { lang: responseLang } = useChatResponseLanguage();
  const scrollRef = useRef<ScrollView>(null);
  // Track whether we should auto-scroll to bottom when ScrollView content size changes.
  // Set to true ONLY right after a new message is added — prevents listen-button taps
  // (or any other in-card state change that resizes content) from yanking the scroll.
  const autoScrollOnce = useRef(false);
  const scrollToBottom = () => {
    autoScrollOnce.current = true;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  useEffect(() => {
    (async () => {
      let sid = await storage.getItem<string>("keymind_chat_session", "");
      if (!sid) {
        sid = `chat-${Date.now()}`;
        await storage.setItem("keymind_chat_session", sid);
      }
      setSessionId(sid);
      const savedLang = await storage.getItem<VocabLanguage>(VOCAB_LANG_KEY, "Hindi");
      if (savedLang) setVocabLang(savedLang);
      try {
        const data = await api.chatHistory(sid);
        setMessages((data.messages || []) as Msg[]);
      } catch {}
    })();
  }, []);

  const send = async (txt?: string) => {
    const message = (txt ?? input).trim();
    if (!message || !sessionId) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    scrollToBottom();
    setBusy(true);

    // Auto-detect: single word / "describe X" → fetch the rich Describe card.
    const target = detectDescribeQuery(message);
    if (target) {
      try {
        const res = await api.tool("vocab_full", target, { target_language: vocabLang });
        const card = (res as any).data as VocabData | undefined;
        if (card && (card.meaning_simple || card.meaning_translated)) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: `Here's a deep breakdown of **${card.word || target}**:`,
              card,
              cardLanguage: vocabLang,
            },
          ]);
          scrollToBottom();
          setBusy(false);
          return;
        }
        // If LLM returned a malformed/empty card, fall through to regular chat.
      } catch {
        // Fall back to a normal chat reply if the vocab call fails.
      }
    }

    try {
      const res = await api.chat(sessionId, message, responseLang);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      scrollToBottom();
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${e?.message || "Try again."}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const sid = `chat-${Date.now()}`;
    await storage.setItem("keymind_chat_session", sid);
    setSessionId(sid);
    setMessages([]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ASK AI</Text>
          <Text style={styles.title}>Ask me anything.</Text>
        </View>
        <TouchableOpacity style={styles.resetBtn} onPress={reset} testID="chat-reset-btn">
          <Ionicons name="refresh" size={18} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <AdBanner placement="top" />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
          onContentSizeChange={() => {
            // Only scroll to the bottom when explicitly requested by the parent
            // (i.e. after a new message was just added). This prevents in-card
            // interactions like LISTEN button taps from jumping the scroll position.
            if (autoScrollOnce.current) {
              autoScrollOnce.current = false;
              scrollRef.current?.scrollToEnd({ animated: true });
            }
          }}
        >
          {messages.length === 0 && (
            <View>
              <Text style={styles.intro}>
                I&apos;m your KeyMind tutor. I can explain grammar, define words, translate, and answer
                language questions in any language you write.
              </Text>
              <Text style={styles.section}>TRY ASKING</Text>
              <View style={{ gap: 8 }}>
                {QUICK_PROMPTS.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={styles.quickChip}
                    onPress={() => send(q)}
                    testID={`chat-quick-${q.slice(0, 10)}`}
                  >
                    <Ionicons name="sparkles" size={14} color={COLORS.text} />
                    <Text style={styles.quickText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === "user" ? styles.userBubble : styles.aiBubble,
                m.card ? styles.cardBubble : null,
              ]}
            >
              {m.role === "user" ? (
                <Text style={[styles.bubbleText, { color: COLORS.text }]}>{m.content}</Text>
              ) : (
                <MarkdownText
                  text={m.content}
                  style={styles.bubbleText}
                  testID={`chat-msg-${i}`}
                  selectable
                />
              )}
              {m.card ? (
                <View style={{ marginTop: 10 }}>
                  <VocabCard
                    data={m.card}
                    language={m.cardLanguage || vocabLang}
                    hideListSections
                    onChangeLanguage={async (lang) => {
                      setVocabLang(lang);
                      await storage.setItem(VOCAB_LANG_KEY, lang);
                      // Refetch the rich card for the same word in the new language.
                      const word = m.card?.word;
                      if (!word) return;
                      setBusy(true);
                      try {
                        const res = await api.tool("vocab_full", word, {
                          target_language: lang,
                        });
                        const newCard = (res as any).data as VocabData | undefined;
                        if (newCard) {
                          setMessages((all) =>
                            all.map((msg, idx) =>
                              idx === i ? { ...msg, card: newCard, cardLanguage: lang } : msg,
                            ),
                          );
                        }
                      } catch {
                      } finally {
                        setBusy(false);
                      }
                    }}
                    onTrickyWordPress={(w) => {
                      setInput(w);
                    }}
                  />
                </View>
              ) : null}
              {m.role === "assistant" && !m.card && (
                <View style={{ marginTop: 8 }}>
                  <ListenButton
                    text={stripMarkdown(m.content)}
                    small
                    testID={`chat-listen-${i}`}
                  />
                </View>
              )}
            </View>
          ))}

          {busy && (
            <View style={[styles.bubble, styles.aiBubble, { flexDirection: "row", gap: 8 }]}>
              <ActivityIndicator size="small" color={COLORS.text} />
              <Text style={styles.bubbleText}>Thinking…</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.composer}>
          <View style={styles.composerLangRow}>
            <DictateLanguagePicker compact />
            <ChatResponseLanguagePicker compact />
          </View>
          <View style={styles.composerRow}>
            <TextInput
              value={chatInterim ? `${input}${input ? " " : ""}${chatInterim}` : input}
              onChangeText={(v) => {
                if (chatListening) return; // ignore manual edits while mic is live
                setInput(v);
              }}
              editable={!chatListening}
              placeholder="Ask about grammar, words, languages…"
              placeholderTextColor={COLORS.textMuted}
              style={styles.composerInput}
              multiline
              testID="chat-input"
            />
            <MicButton
              size={40}
              onFinal={(spoken) => {
                setInput((prev) => {
                  const t = spoken.trim();
                  if (!t) return prev;
                  if (!prev) return t;
                  const sep = /[.!?…\n]\s*$/.test(prev)
                    ? " "
                    : prev.endsWith(" ")
                    ? ""
                    : " ";
                  return prev + sep + t;
                });
              }}
              onInterim={setChatInterim}
              onListeningChange={setChatListening}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.5 }]}
              onPress={() => send()}
              disabled={!input.trim() || busy}
              testID="chat-send-btn"
            >
              <Ionicons name="arrow-up" size={20} color={COLORS.bg} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  eyebrow: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted },
  title: { fontSize: 32, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1.2 },
  resetBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", ...SHADOW.brutalSm,
  },
  intro: { fontSize: 15, color: COLORS.textMuted, lineHeight: 22 },
  section: { marginTop: 24, marginBottom: 12, fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text },
  quickChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 14, borderRadius: RADIUS.md, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, ...SHADOW.brutalSm,
  },
  quickText: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.text },
  bubble: {
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border,
    marginBottom: 10, maxWidth: "92%",
  },
  cardBubble: { maxWidth: "100%", alignSelf: "stretch", padding: 12 },
  userBubble: { alignSelf: "flex-end", backgroundColor: COLORS.secondary },
  aiBubble: { alignSelf: "flex-start", backgroundColor: COLORS.surface, ...SHADOW.brutalSm },
  bubbleText: { fontSize: 14, lineHeight: 22, color: COLORS.text, fontWeight: FONT.regular },
  composer: {
    padding: 12, paddingBottom: 12, paddingTop: 8,
    borderTopWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.bg,
    gap: 6,
  },
  composerLangRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 8,
  },
  composerRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
  },
  composerInput: {
    flex: 1, minHeight: 44, maxHeight: 120,
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, fontSize: 15, lineHeight: 22, color: COLORS.text,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.text, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", ...SHADOW.brutalSm,
  },
});
