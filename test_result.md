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
  - task: "Describe (vocab) AI tool returns rich JSON schema"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Schema now also includes meaning_transliterated, spoken_usage_transliterated, and tenses.{past,present,future}.transliterated — Latin-alphabet phonetic readings (Hinglish/Tanglish/Tenglish/Banglish/Romaji/Pinyin/etc.). For Latin-script targets (English/Spanish/French/German) these MUST be empty strings. Verified manually with target_language=Hindi (Hinglish populated) and target_language=Telugu (Tenglish populated)."

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
