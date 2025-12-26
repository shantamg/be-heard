# **Conflict Resolution  — MVP Spec (Engineer-Ready)**

AI-Facilitated Conflict Metabolism System

---

## **1\. Core Concept**

* Problem: Conflict escalates because humans try to solve problems under physiological and emotional threat.

* Solution: The system acts as an External Prefrontal Cortex:

  * Maintains regulation, memory, and pacing

  * Buffers conflict

  * Teaches listening, reflection, and needs-based understanding

* Primary Users: 2-person conflicts (MVP)

---

## **2\. Architectural Pillars**

| Pillar | Description | Notes |
| ----- | ----- | ----- |
| Asynchronous Processing | Users interact with AI, not each other by default | Reduces escalation |
| Vessel Privacy Model | User Vessel: raw venting, documents  AI Synthesis: internal mapping of needs/values  Shared Vessel: content explicitly consented for sharing | Ensures attribution and separation |
| Non-Linear Pacing | AI can force cooling periods based on emotional intensity | See Emotional Barometer triggers |

---

## **3\. State Machine / Stages**

| Stage | Name | AI Goal | Advancement Gate |
| ----- | ----- | ----- | ----- |
| 0 | Onboarding | Establish Process Guardian authority; explain stages | Both users sign Curiosity Compact |
| 1 | The Witness | Deep reflection (parallel) | User confirms: “I feel fully heard by the AI” |
| 2 | Perspective Stretch | Empathy training (parallel) | User can accurately state the other’s needs without judgment |
| 3 | Need Mapping | Transition from stories → universal needs | Identification of at least one common-ground need (e.g., “Safety”) |
| 4 | Strategic Repair | Propose small, reversible actions | Mutual agreement on one Micro-Experiment |

---

## **4\. Key Behavioral Mechanics**

### **A. Mirror Intervention (Stage 2\)**

* Trigger: User expresses judgment, attack, or sarcasm

* Behavior: Recursive reflection

user\_input \= "I bet they're just happy I'm miserable"  
AI\_response \= "That sounds like a thought born of your own hurt. If you look past your pain for a moment, what fear might be driving their behavior?"

### **B. Emotional Barometer (Governor)**

* Input: User rates emotion 1–10 (periodic)

* Trigger: Intensity \> 8

* Behavior:

if user\_emotion \> 8:  
    disable\_advance\_button()  
    send\_message("High emotional intensity detected. Cooling period recommended. Return when ready.")

* 

* Optional Multi-Session Persistence: Tracks trends across sessions

* Disclosure: Private by default; AI may ask consent to share if it helps clarify disconnect

### **C. Consensual Bridge (Data Sharing)**

* Mechanic: AI never auto-summarizes user input

* Behavior:

"You mentioned \[Event X\] felt like betrayal. Would you like me to highlight 'Trust' as a core need for the other person to reflect on?"  
---

## **5\. System Guardrails**

| Guardrail | Mechanic |
| ----- | ----- |
| No-Side Rule | AI refuses to determine “right/wrong”: “I am not here to determine truth, only to help find a path forward honoring needs.” |
| Accusation Filtering | AI reframes “You” statements → “I/Needs” during Stage 2 & 3 |
| Stage Enforcement | AI disables stage progression until gate conditions are met |

---

## **6\. Memory Model**

* User Memory Object:

  * Events (attributed)

  * Emotions

  * Needs / Values

  * Document references / interpretations

  * Boundaries / micro-experiments

* AI Synthesis Map:

  * Cross-user mapping of needs & conflicts

  * Only accessible internally for reflection & stage facilitation

* Shared Vessel:

  * Holds only content consented to share

  * Supports perspective stretch & common-ground identification

---

## **7\. Technical MVP Scope**

| Component | Description / Implementation Notes |
| ----- | ----- |
| LLM | Claude 3.5 Sonnet (via AWS Bedrock) with long context window |
| Memory | Vector DB storing per-user and cross-user objects; strict attribution |
| UI | Minimalist chat; no typing indicators; stage-controlled interface |
| Document Upload | Optional attachment support; AI references in reflections |
| Emotional Barometer | Slider 1–10; triggers pacing interventions |
| Stage Control | Buttons or prompts disabled until advancement gate satisfied |

---

## **8\. MVP Behavioral Flow (Engineer Quick Reference)**

1. Stage 0: Onboarding → Curiosity Compact signed

2. Stage 1: Private AI reflection → wait for “fully heard” confirmation

3. Stage 2: AI presents curated reflection of other → monitors empathy accuracy → mirror intervention if needed

4. Stage 3: AI synthesizes needs → flags common-ground → reframes accusations

5. Stage 4: Users propose micro-experiments → AI stores plan → tracks progress optionally across sessions

Dynamic pacing enforced by Emotional Barometer at all stages.

---

## **9\. Optional / Future Enhancements**

* Multi-party conflict (\>2 users)

* Voice / video integration

* AI suggestion ranking for micro-experiments

* Research dashboards (aggregate, anonymized trends)

---

