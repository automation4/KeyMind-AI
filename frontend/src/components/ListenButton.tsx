import React from "react";
import { TouchableOpacity, Text, ActivityIndicator, Platform } from "react-native";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from "expo-audio";
import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { api } from "@/src/lib/api";

type Props = {
  text: string;
  testID?: string;
  small?: boolean;
};

// Module-level player so only one audio plays at a time across the whole app.
let activePlayer: AudioPlayer | null = null;
let activeStopper: (() => void) | null = null;

async function stopAll() {
  if (activeStopper) {
    try { activeStopper(); } catch {}
    activeStopper = null;
  }
  if (activePlayer) {
    try { activePlayer.pause(); activePlayer.remove(); } catch {}
    activePlayer = null;
  }
  try { Speech.stop(); } catch {}
}

export const ListenButton: React.FC<Props> = ({ text, testID, small }) => {
  const [state, setState] = React.useState<"idle" | "loading" | "playing">("idle");

  const onPress = async () => {
    if (!text?.trim()) return;
    if (state === "playing" || state === "loading") {
      await stopAll();
      setState("idle");
      return;
    }
    setState("loading");
    await stopAll();

    try {
      if (Platform.OS === "web") {
        // Web: use HTMLAudioElement with the MP3 from backend
        const res = await api.tts(text);
        const audioUrl = `data:${res.mime};base64,${res.audio_base64}`;
        const audio = new (window as any).Audio(audioUrl);
        const onEnded = () => setState("idle");
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onEnded);
        activeStopper = () => {
          audio.pause();
          audio.removeEventListener("ended", onEnded);
        };
        await audio.play();
        setState("playing");
        return;
      }

      // Native: fetch base64 audio → play via expo-audio
      try {
        const res = await api.tts(text);
        await setAudioModeAsync({ playsInSilentMode: true });
        const player = createAudioPlayer({ uri: `data:${res.mime};base64,${res.audio_base64}` });
        activePlayer = player;
        const sub = player.addListener("playbackStatusUpdate", (status: any) => {
          if (status?.didJustFinish) {
            setState("idle");
            try { sub.remove(); player.remove(); } catch {}
            if (activePlayer === player) activePlayer = null;
          }
        });
        activeStopper = () => { try { sub.remove(); } catch {} };
        player.play();
        setState("playing");
      } catch (e) {
        // Fallback to on-device TTS if neural TTS fails (offline, etc.)
        Speech.speak(text, {
          rate: 1.0,
          pitch: 1.0,
          onDone: () => setState("idle"),
          onStopped: () => setState("idle"),
          onError: () => setState("idle"),
        });
        setState("playing");
      }
    } catch {
      setState("idle");
    }
  };

  const isBusy = state !== "idle";
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: COLORS.secondary,
        borderRadius: RADIUS.pill,
        borderWidth: 2,
        borderColor: COLORS.border,
        paddingHorizontal: small ? 10 : 12,
        paddingVertical: small ? 6 : 8,
        ...SHADOW.brutalSm,
      }}
      testID={testID || "listen-btn"}
    >
      {state === "loading" ? (
        <ActivityIndicator size="small" color={COLORS.text} />
      ) : (
        <Ionicons
          name={state === "playing" ? "stop" : "volume-high"}
          size={small ? 14 : 16}
          color={COLORS.text}
        />
      )}
      <Text
        style={{
          fontSize: small ? 11 : 12,
          fontWeight: FONT.black,
          color: COLORS.text,
          letterSpacing: 0.5,
        }}
      >
        {state === "playing" ? "STOP" : state === "loading" ? "…" : "LISTEN"}
      </Text>
    </TouchableOpacity>
  );
};
