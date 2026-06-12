import * as Localization from "expo-localization";

/**
 * Returns a writing-input placeholder tailored to the user's device locale.
 * Falls back to English for any locale not in the map.
 *
 * Why per-locale? Users speaking Hindi/Tamil/Bengali/etc. feel the app is
 * "for them" the moment the very first input invites them in their script.
 */
const PLACEHOLDERS: Record<string, string> = {
  en: "Paste, type, or hold the mic to dictate…",
  hi: "पेस्ट करें, टाइप करें, या बोलने के लिए माइक दबाएँ…",
  bn: "পেস্ট, টাইপ, বা ডিকটেট করতে মাইক ধরে রাখুন…",
  ta: "ஒட்டவும், தட்டச்சு செய்யவும், அல்லது மைக்கைப் பிடித்துப் பேசவும்…",
  te: "పేస్ట్, టైప్, లేదా మాట్లాడేందుకు మైక్ నొక్కి పట్టుకోండి…",
  mr: "पेस्ट करा, टाइप करा, किंवा बोलण्यासाठी माईक दाबा…",
  gu: "પેસ્ટ, ટાઇપ કરો, અથવા બોલવા માટે માઇક પકડી રાખો…",
  kn: "ಪೇಸ್ಟ್, ಟೈಪ್, ಅಥವಾ ಮಾತಾಡಲು ಮೈಕ್ ಹಿಡಿಯಿರಿ…",
  ml: "പേസ്റ്റ്, ടൈപ്പ്, അല്ലെങ്കിൽ സംസാരിക്കാൻ മൈക്ക് അമർത്തിപ്പിടിക്കുക…",
  pa: "ਪੇਸਟ ਕਰੋ, ਟਾਈਪ ਕਰੋ, ਜਾਂ ਬੋਲਣ ਲਈ ਮਾਈਕ ਦਬਾ ਕੇ ਰੱਖੋ…",
  ur: "پیسٹ، ٹائپ، یا بولنے کے لیے مائیک دبائے رکھیں…",
  or: "ପେଷ୍ଟ, ଟାଇପ୍, କିମ୍ବା କହିବାକୁ ମାଇକ୍ ଧର…",
  as: "পেষ্ট কৰক, টাইপ কৰক বা কোৱাৰ বাবে মাইক ধৰি ৰাখক…",
  es: "Pega, escribe o mantén el micrófono para dictar…",
  fr: "Collez, tapez ou maintenez le micro pour dicter…",
  de: "Einfügen, tippen oder Mikrofon halten zum Diktieren…",
  pt: "Cole, digite ou segure o microfone para ditar…",
  ar: "ألصق أو اكتب أو اضغط المايك للتلقين…",
  ru: "Вставьте, введите или удерживайте микрофон для диктовки…",
  ja: "貼り付け、入力、またはマイクを長押しして話してください…",
  zh: "粘贴、输入或长按麦克风进行听写…",
  ko: "붙여넣기, 입력하거나 마이크를 길게 눌러 받아쓰세요…",
};

export function getWritePlaceholder(): string {
  try {
    const locales = Localization.getLocales();
    const code = (locales?.[0]?.languageCode || "en").toLowerCase();
    return PLACEHOLDERS[code] || PLACEHOLDERS.en;
  } catch {
    return PLACEHOLDERS.en;
  }
}
