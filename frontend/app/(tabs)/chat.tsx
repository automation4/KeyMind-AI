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
import { storage } from "@/src/utils/storage";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "Why is this grammar correct?",
  "Difference between 'affect' and 'effect'",
  "Explain present perfect tense",
  "Examples of Hindi tenses",
  "Make my message sound polite",
];

export default function ChatScreen() {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      let sid = await storage.getItem<string>("keymind_chat_session", "");
      if (!sid) {
        sid = `chat-${Date.now()}`;
        await storage.setItem("keymind_chat_session", sid);
      }
      setSessionId(sid);
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
    setBusy(true);
    try {
      const res = await api.chat(sessionId, message);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
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
          <Text style={styles.eyebrow}>AI TUTOR</Text>
          <Text style={styles.title}>Ask me anything.</Text>
        </View>
        <TouchableOpacity style={styles.resetBtn} onPress={reset} testID="chat-reset-btn">
          <Ionicons name="refresh" size={18} color={COLORS.text} />
        </TouchableOpacity>
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
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
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
            <View key={i} style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}>
              <Text style={[styles.bubbleText, m.role === "user" && { color: COLORS.text }]}>
                {m.content}
              </Text>
              {m.role === "assistant" && (
                <View style={{ marginTop: 8 }}>
                  <ListenButton text={m.content} small testID={`chat-listen-${i}`} />
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
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about grammar, words, languages…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.composerInput}
            multiline
            testID="chat-input"
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
    padding: 14, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border,
    marginBottom: 10, maxWidth: "92%",
  },
  userBubble: { alignSelf: "flex-end", backgroundColor: COLORS.secondary },
  aiBubble: { alignSelf: "flex-start", backgroundColor: COLORS.surface, ...SHADOW.brutalSm },
  bubbleText: { fontSize: 14, lineHeight: 20, color: COLORS.text, fontWeight: FONT.regular },
  composer: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    padding: 12, paddingBottom: 12, paddingTop: 8,
    borderTopWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  composerInput: {
    flex: 1, minHeight: 44, maxHeight: 120,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, fontSize: 15, color: COLORS.text,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.text, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", ...SHADOW.brutalSm,
  },
});
