import * as Localization from "expo-localization";

/**
 * Returns a writing-input placeholder tailored to the user's device locale.
 * Falls back to English for any locale not in the map.
 *
 * Why per-locale? Users speaking Hindi/Tamil/Bengali/etc. feel the app is
 * "for them" the moment the very first input invites them in their script.
 *
 * Note: the mic / dictation feature was removed (June 2026). Placeholders
 * now refer to the camera / image extraction path instead of "hold the mic".
 */
const PLACEHOLDERS: Record<string, string> = {
  en: "Paste, type, or scan text from a photo…",
  hi: "पेस्ट करें, टाइप करें, या तस्वीर से टेक्स्ट स्कैन करें…",
  bn: "পেস্ট করুন, টাইপ করুন বা ছবি থেকে টেক্সট স্ক্যান করুন…",
  ta: "ஒட்டவும், தட்டச்சு செய்யவும் அல்லது படத்திலிருந்து உரையை ஸ்கேன் செய்யவும்…",
  te: "పేస్ట్ చేయండి, టైప్ చేయండి లేదా చిత్రం నుండి టెక్స్ట్‌ను స్కాన్ చేయండి…",
  mr: "पेस्ट करा, टाइप करा किंवा फोटोमधून मजकूर स्कॅन करा…",
  gu: "પેસ્ટ કરો, ટાઇપ કરો અથવા ફોટોમાંથી ટેક્સ્ટ સ્કેન કરો…",
  kn: "ಪೇಸ್ಟ್ ಮಾಡಿ, ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಚಿತ್ರದಿಂದ ಪಠ್ಯ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ…",
  ml: "പേസ്റ്റ് ചെയ്യൂ, ടൈപ്പ് ചെയ്യൂ അല്ലെങ്കിൽ ചിത്രത്തിൽ നിന്നു ടെക്സ്റ്റ് സ്‌കാൻ ചെയ്യൂ…",
  pa: "ਪੇਸਟ ਕਰੋ, ਟਾਈਪ ਕਰੋ ਜਾਂ ਫੋਟੋ ਤੋਂ ਟੈਕਸਟ ਸਕੈਨ ਕਰੋ…",
  ur: "پیسٹ کریں، ٹائپ کریں یا تصویر سے متن اسکین کریں…",
  or: "ପେଷ୍ଟ କରନ୍ତୁ, ଟାଇପ୍ କରନ୍ତୁ କିମ୍ବା ଫଟୋରୁ ଟେକ୍ସଟ୍ ସ୍କାନ୍ କରନ୍ତୁ…",
  as: "পেষ্ট কৰক, টাইপ কৰক বা ছবিৰ পৰা টেক্সট স্কেন কৰক…",
  es: "Pega, escribe o escanea texto de una foto…",
  fr: "Collez, tapez ou scannez du texte depuis une photo…",
  de: "Einfügen, tippen oder Text aus einem Foto scannen…",
  pt: "Cole, digite ou escaneie texto de uma foto…",
  ar: "ألصق أو اكتب أو امسح النص من صورة…",
  ru: "Вставьте, введите или отсканируйте текст с фото…",
  ja: "貼り付け、入力、または写真からテキストをスキャン…",
  zh: "粘贴、输入或从照片中扫描文本…",
  ko: "붙여넣기, 입력하거나 사진에서 텍스트를 스캔하세요…",
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
