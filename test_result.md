#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Complete the "Describe" tool (renamed from "Vocab") with deep word breakdown:
  - synonyms, antonyms, native alternate, spoken usage (English + translated),
    memory tip, all rendered safely in the result card.
  - Listen button on the relevant text fields so users can hear pronunciation.

backend:
  - task: "Synonyms / Antonyms — return word + short definition"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Prompt now asks for `word | short definition` (≤ 9 words) — one per line. Existing comma-split fallback still applies if model returns a single line. Verified manually for `resilient` and `replicate`."

  - task: "Idioms tool — list real-life native English usage sentences"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "New tool id `idioms`. Returns 6 short native-speaker sentences (≤18 words) USING the input word/idiom across casual/professional/headline registers. Added to multi_tools dispatch."

  - task: "Grammar tool — JSON with explanation + 3 native examples"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Prompt now outputs `{corrected, explanation, examples[3]}` JSON. Dispatch parses JSON and returns suggestions=[corrected] plus data={explanation, examples}. Graceful fallback if model returns plain text. Verified manually with `She dont knows the answer.`"

frontend:
  - task: "Write tab — Antonyms / Idioms tools added to picker"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/lib/tools.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added new tool definitions: `antonyms` (icon: git-compare, accent: peach) and `idioms` (icon: language-outline, accent: sky). Both are `multi: true`."

  - task: "Write tab — Synonym / Antonym cards show meaning + LISTEN"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Suggestion cards for synonyms/antonyms now split each `word | meaning` into a bold word header (with LISTEN button) + a subtle definition below. APPLY/COPY use just the word. Idioms suggestions get a LISTEN button on the actions row."

  - task: "Write tab — Grammar result shows WHY + native examples"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Below the DiffView card, a new lilac meta-card renders. Sections: 'WHY THIS CHANGE' (explanation paragraph), 'HOW NATIVE SPEAKERS USE IT' (3 example rows each with compact LISTEN). Hidden if result.tool != grammar or data is missing."

  - task: "Chat — hide Synonyms / Antonyms in rich Describe card"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/VocabCard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "VocabCard now accepts `hideListSections` prop. Chat.tsx passes hideListSections to the embedded card so SYNONYMS and ANTONYMS sections do not render in Chat (they remain in the Write tab as dedicated tools). Write-tab VocabCard usage is unaffected (default false)."

metadata:
  created_by: "main_agent"
  version: "1.3"
  test_sequence: 4
  run_ui: true

test_plan:
  current_focus:
    - "Synonyms / Antonyms — return word + short definition"
    - "Idioms tool — list real-life native English usage sentences"
    - "Grammar tool — JSON with explanation + 3 native examples"
    - "Write tab — Antonyms / Idioms tools added to picker"
    - "Write tab — Synonym / Antonym cards show meaning + LISTEN"
    - "Write tab — Grammar result shows WHY + native examples"
    - "Chat — hide Synonyms / Antonyms in rich Describe card"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Validate the three new improvements:

      BACKEND (use {EXPO_BACKEND_URL}/api/ai/tool):
        B1. POST {"tool":"synonyms","text":"resilient"}
            Expect data.suggestions = list of strings each containing " | " (word + meaning).
        B2. POST {"tool":"antonyms","text":"resilient"} — same shape.
        B3. POST {"tool":"idioms","text":"piece of cake"}
            Expect suggestions = list of native-style English sentences containing the input phrase.
        B4. POST {"tool":"grammar","text":"She dont knows the answer."}
            Expect response 200; suggestions = [corrected sentence]; data = {explanation: non-empty,
            examples: array length 3}. Each example should be a natural English sentence.
        B5. POST {"tool":"grammar","text":"I went to the store yesterday."}
            (Already correct.) Expect corrected ≈ input verbatim, explanation explains why it's already correct.

      FRONTEND (http://localhost:3000):
        F1. WRITE tab — Tool picker now includes new chips: "Antonyms" and "Idioms".
        F2. Type "resilient", pick "Synonyms" → run.
            • Each result card shows the synonym in bold (large), a LISTEN button on the right, and a
              shorter grey definition below.
            • APPLY / COPY at the bottom of each card.
        F3. Type "resilient", pick "Antonyms" → run.
            • Same structure as Synonyms; 6 antonyms with meanings.
        F4. Type "piece of cake", pick "Idioms" → run.
            • Each card shows a full real-life sentence + APPLY / COPY + a LISTEN button.
        F5. Type "She dont knows the answer.", pick "Grammar" → run.
            • First card: DiffView (original → corrected) + APPLY/COPY (existing UX).
            • Below the card, a new lilac meta-card appears with two labelled sections:
                ─ "WHY THIS CHANGE": explanation text
                ─ "HOW NATIVE SPEAKERS USE IT": 3 example rows, each with the sentence + a compact circular LISTEN button
        F6. CHAT tab — Tap "Describe indifference" quick prompt.
            • Rich card appears. Confirm that "SYNONYMS" and "ANTONYMS" sections are NOT rendered
              anywhere in the chat card (they were before — now hidden by `hideListSections`).
            • All other sections (SIMPLE MEANING, WHEN SPEAKING, NATIVE SPEAKER WOULD SAY,
              HOW TO REMEMBER, IN HINDI, USAGE IN TENSES, IDIOMS & PHRASES) must STILL appear.

      Reference files:
        - /app/backend/server.py (synonyms/antonyms/idioms/grammar prompts; dispatch around line 870–910)
        - /app/frontend/src/lib/tools.ts (new entries)
        - /app/frontend/app/(tabs)/index.tsx (suggestion render block ~435–540, styles ~750–820)
        - /app/frontend/src/components/VocabCard.tsx (hideListSections prop, lines 103–120, 171–207)
        - /app/frontend/app/(tabs)/chat.tsx (passes hideListSections)

      Mocked APIs: None. Gemini 3 Flash + OpenAI TTS via Emergent LLM Key.
      Credentials: guest path is fine. /app/memory/test_credentials.md.

      Do not modify the JSON parsing in dispatch or the `word | meaning` split logic. Report findings with file+line.
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/ai/tool with tool=vocab now returns ONLY {word, part_of_speech, meaning_simple, meaning_translated, meaning_transliterated}. Used by the simplified Describe Write tab. Faster + cheaper than vocab_full. Script-validation retry still applies. Verified manually for Hindi."

  - task: "vocab_full tool: rich schema + idioms_phrases for Chat"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/ai/tool with tool=vocab_full returns the previous rich payload (synonyms, antonyms, native_alternative, native_alternative_why, memory_tip, spoken_usage*, tenses) PLUS a NEW idioms_phrases array [{english, translated, transliterated}] with 3 entries covering formal/casual/idiomatic registers. Verified manually with target_language=Hindi (idioms in Devanagari + Hinglish populated)."

frontend:
  - task: "Write tab Describe — slim card only"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/SimpleDescribeCard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New SimpleDescribeCard component renders ONLY the word + part-of-speech pill + SIMPLE EXPLANATION + IN <LANG> translated meaning + romanized transliteration block + LISTEN buttons. Language picker chevron toggles a horizontal scroll chip row. (tabs)/index.tsx now imports SimpleDescribeCard and uses it for tool='vocab'; the old rich VocabCard is no longer imported there."

  - task: "Chat tab — auto-detect describe queries and render rich VocabCard inline"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/chat.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added detectDescribeQuery() heuristic: triggers on (a) 1–2 token plain inputs that contain only letters (e.g. 'indifference', 'side hustle') OR (b) patterns like 'what does X mean', 'meaning of X', 'describe X', 'define X', 'explain X' where X is up to 4 words. When matched, send() calls POST /api/ai/tool with tool=vocab_full instead of /api/ai/chat. The resulting Msg carries a card:VocabData and renders the full VocabCard (synonyms, antonyms, native alternative, memory tip, spoken_usage, tenses, idioms_phrases) INSIDE the assistant bubble — language picker, LISTEN buttons, and transliteration all work. Quick-prompt chips updated to surface the new flow ('Describe indifference', 'What does serendipity mean?', 'Meaning of perseverance'). Card bubble uses maxWidth: '100%' to give the full-width grid more room."

  - task: "VocabCard idioms_phrases section"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/VocabCard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New IDIOMS & PHRASES section renders below the tenses table. Up to 5 entries shown, each in a sky-coloured card with English (italic) + native-script translation + Latin transliteration. Compact LISTEN buttons on both English and translated lines. Hidden if idioms_phrases is empty or undefined."

metadata:
  created_by: "main_agent"
  version: "1.2"
  test_sequence: 3
  run_ui: true

test_plan:
  current_focus:
    - "Write tab Describe — slim card only"
    - "Chat tab — auto-detect describe queries and render rich VocabCard inline"
    - "VocabCard idioms_phrases section"
    - "vocab_full tool: rich schema + idioms_phrases for Chat"
    - "vocab tool: SLIM schema for Describe Write tab"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Validate the Describe-into-Chat transfer + slim Describe Write tab.

      BACKEND:
        1) POST /api/ai/tool body {"tool":"vocab","text":"resilient","options":{"target_language":"Hindi"}}
           → response.data MUST contain ONLY: word, part_of_speech, meaning_simple, meaning_translated (Devanagari), meaning_transliterated (Hinglish).
           → response.data MUST NOT contain: synonyms, antonyms, tenses, idioms_phrases, native_alternative.
        2) POST /api/ai/tool body {"tool":"vocab_full","text":"indifference","options":{"target_language":"Hindi"}}
           → response.data MUST contain all the previous rich keys PLUS idioms_phrases (array length >= 1) where each item has english/translated/transliterated.
        3) Repeat (2) with target_language=Telugu — idioms_phrases.translated must be Telugu script and transliterated must be Tenglish (Latin only).

      FRONTEND:
        WRITE TAB (Describe tool):
          - Open the Describe tool, type "resilient", run. Confirm the new SimpleDescribeCard renders ONLY: word, part-of-speech pill, SIMPLE EXPLANATION (with LISTEN), IN HINDI section (with translated + LISTEN + HINGLISH italic line). Confirm there is NO synonyms / antonyms / tenses / idioms / memory tip section anywhere on this card.
          - Tap the chevron next to "IN HINDI" → language picker chip row expands. Tap "Telugu" → card reloads, IN TELUGU + TENGLISH appear; no synonyms etc.

        CHAT TAB (auto-detect):
          - Open the Chat tab. The quick-prompt chips should now include "Describe indifference", "What does serendipity mean?", "Meaning of perseverance".
          - Tap "Describe indifference" → an assistant bubble appears containing a SHORT text intro plus the full VocabCard inline. Card MUST include: word + LISTEN, part-of-speech, SIMPLE MEANING + LISTEN, SYNONYMS chips, ANTONYMS chips, WHEN SPEAKING (EN + translated + transliteration), NATIVE SPEAKER WOULD SAY, HOW TO REMEMBER, IN HINDI + transliteration, USAGE IN TENSES grid, and a NEW "IDIOMS & PHRASES" section with sky-blue cards each having English italic + Devanagari + Hinglish + LISTEN buttons.
          - Type "indifference" alone (no command) and send → same rich card appears (single-word auto-detect).
          - Type "Difference between affect and effect" → this is a sentence — regular chat reply (no card).
          - Inside the chat card, tap the language picker, switch to Telugu → card refetches; everything (including idioms) re-renders in Telugu + Tenglish.

      Files to skim:
        - /app/backend/server.py (vocab + vocab_full prompts around lines 562–680)
        - /app/frontend/src/components/SimpleDescribeCard.tsx (new)
        - /app/frontend/src/components/VocabCard.tsx (idioms section at the end)
        - /app/frontend/app/(tabs)/chat.tsx (detectDescribeQuery + send + render)
        - /app/frontend/app/(tabs)/index.tsx (now imports SimpleDescribeCard for the vocab branch)

      Mocked APIs: None. Gemini 3 Flash + OpenAI TTS via Emergent LLM Key.
      Credentials: guest path OK. /app/memory/test_credentials.md exists.

frontend:
  - task: "DescribeCard renders transliteration + fixes tense alignment"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/VocabCard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "ListenButton now supports compact (icon-only circle) mode. Tense rows and translated meaning row use compact LISTEN so the native-script text no longer gets squeezed into one-word-per-line vertical wrap. Added transliteration block below native script: shows label (HINGLISH / TANGLISH / TENGLISH / BANGLISH / GUJLISH / KANGLISH / MANGLISH / PUNGLISH / ROMAN URDU / ROMAN ARABIC / ROMAJI / PINYIN / ROMAN) + the Latin-script reading in italic. Block hidden when target_language is already Latin (English/Spanish/French/German) or when transliterated is empty."

  - task: "Chat renders **bold** markdown (no more raw asterisks)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/chat.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added /app/frontend/src/components/MarkdownText.tsx — a lightweight inline markdown renderer for **bold**, *italic*, and `code`. Chat assistant bubbles now use MarkdownText instead of plain Text. ListenButton uses stripMarkdown(content) so TTS doesn't read out 'asterisk asterisk'. Backend prompt unchanged (LLM legitimately emits markdown). User bubbles still use plain Text since the user types plain text. Headings (### ...) and bullets (- ...) are stripped for TTS as well. Lint clean."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 2
  run_ui: true

test_plan:
  current_focus:
    - "DescribeCard (VocabCard) renders new fields with ListenButton"
    - "Describe (vocab) AI tool returns rich JSON schema"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Please validate the Describe tool end-to-end.
      Backend: POST /api/ai/tool with body
        {"tool":"vocab","text":"resilient","options":{"target_language":"Telugu"}}
      Confirm response.data contains keys: word, part_of_speech, meaning_simple, meaning_translated (Telugu script), synonyms (array), antonyms (array), spoken_usage, spoken_usage_translated (Telugu script), native_alternative, native_alternative_why, memory_tip, tenses.{past,present,future}.{english,translated}. Also test with target_language=Tamil and Hindi to confirm script switching works.
      Frontend: Login as guest, skip onboarding/setup, on Write screen pick the "Describe" tool (book icon), type "resilient", run it. Confirm card shows: word + LISTEN, SIMPLE MEANING + LISTEN, SYNONYMS chips, ANTONYMS chips, WHEN SPEAKING + LISTEN (English) and translated line with its own LISTEN button (NEW), NATIVE SPEAKER WOULD SAY + LISTEN, HOW TO REMEMBER + LISTEN, IN <language> + LISTEN, USAGE IN TENSES rows with LISTEN per row. Then switch language via the picker and verify translated fields re-render with the new script (no Devanagari fallback for Telugu/Tamil).
      Credentials: /app/memory/test_credentials.md (guest path is fine).
