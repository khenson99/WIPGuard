export interface DesignInterviewPrompt {
  id: string;
  title: string;
  prompt: string;
  example: string;
  probes: string[];
  followupTitle?: string;
  followupPrompt?: string;
  followupProbes?: string[];
}

export interface DesignInterviewDraft {
  intervieweeName: string;
  intervieweeRole: string;
  transcript: string;
  structuredOutput: string;
  promptNotes: Record<string, string>;
  completedPromptIds: string[];
}

export const DESIGN_INTERVIEW_STORAGE_KEY = "wipguard:design-interview:draft";

export const DESIGN_INTERVIEW_CONTEXT = [
  "Stack: React 19, TypeScript, Tailwind CSS v4, shadcn/ui, AG Grid, Storybook 10",
  "Brand color: #FC5A29 (orange), dark sidebar (#0A0A0A), Geist font",
  "Two user types: shop floor workers (scan QR codes, wear gloves, safety glasses) and operations managers (configure items/suppliers/thresholds)",
  "Physical-digital bridge: printed kanban cards with QR codes placed in inventory bins",
];

export const DESIGN_INTERVIEW_RULES = [
  "Ask one prompt at a time and wait for the answer before moving on.",
  "After each answer, ask 1-2 follow-up probes based on what they actually said.",
  "Dig into vague adjectives until they become concrete examples.",
  "Follow the energy when they care deeply about something.",
  "Capture contradictions instead of resolving them.",
  "Keep pushing from abstract to specific.",
  "Show the example answer to calibrate the depth expected.",
  "Allow skip on anything and note the skip in the final output.",
  "Optimize for depth over coverage in a 15-20 minute conversation.",
  "After all prompts, compile the output into the structured format at the bottom.",
];

export const DESIGN_INTERVIEW_PROMPTS: DesignInterviewPrompt[] = [
  {
    id: "problem",
    title: "The Problem",
    prompt: "What's the core problem Imladris is solving, and how do you want people to feel after using it?",
    example:
      "We're solving the morning chaos. Developers start their day scattered across Slack, email, and todos. After using Dawn, they should feel oriented and calm. Like they know exactly what matters today.",
    probes: [
      "What does the world look like if Imladris works perfectly five years from now?",
      "What's the one thing users must be able to do effortlessly?",
      "The shop floor worker scanning a card versus the manager setting things up: whose experience matters more?",
      "What were people doing before Imladris? What's the old way you're replacing?",
    ],
  },
  {
    id: "identity",
    title: "The Identity",
    prompt:
      "Describe Imladris's personality like you'd describe a person. What products or objects do you admire that capture what you're going for? What do you explicitly reject?",
    example:
      "Dawn is like a thoughtful friend who's annoyingly well organized but never judgmental. I admire Linear's speed and Apple Notes' invisibility. I reject anything that feels corporate, cluttered, or like a generic AI chat.",
    probes: [
      "Give me three words for how it should feel to use Imladris.",
      "What should Imladris never feel like? What would make you cringe?",
      "The products you admire: what specifically? Speed? Aesthetics? Philosophy?",
      "Are there physical objects, spaces, or non-digital things that capture the feeling?",
    ],
    followupTitle: "Visual Aesthetics",
    followupPrompt:
      "Now let's talk about how Imladris should look, not just feel, but actually look. Think about colors, density, whitespace, typography. Is it bold and industrial? Clean and airy? Dense and information rich like a Bloomberg terminal? Dark mode or light? When you imagine the ideal Imladris screen, what do you see?",
    followupProbes: [
      "Show me a website, app, or physical dashboard that looks like what you imagine.",
      "Is it more Apple clean or more McMaster-Carr dense? Or something else entirely?",
      "Does the current orange with a dark sidebar feel right? What would you change?",
      "How much whitespace should there be: calm and spacious, or packed and efficient?",
      "Are there specific visual trends you want to avoid?",
    ],
  },
  {
    id: "reality",
    title: "The Reality",
    prompt:
      "What's working today and what's broken? What do users or people who've seen Imladris actually say, both the compliments and the complaints?",
    example:
      "People love the morning briefing. They say it's the first thing that actually made their mornings feel structured. But the chat feels generic, like every other AI interface. And people can't tell if it's thinking or stuck.",
    probes: [
      "What's the most common complaint or friction point?",
      "What do people love that you didn't expect them to love?",
      "If you could fix one UX problem tomorrow, what would it be?",
      "Are there things users do that surprise you, using Imladris in ways you didn't intend?",
    ],
  },
  {
    id: "user",
    title: "The User",
    prompt:
      "Tell me about the people using Imladris. Walk me through their day. What's their environment like? What frustrates them about their current tools?",
    example:
      "Our users are engineering managers at mid-size companies. They're in meetings half the day, context switching constantly. They're frustrated by Jira's complexity. They just want to know what their team shipped this week.",
    probes: [
      "How tech-savvy are they? Would they be comfortable with a complex UI or does it need to be dead simple?",
      "What's the physical environment like where they use Imladris? Desk? Shop floor? Both?",
      "Are there accessibility constraints you think about? Screen size, lighting, gloves, noise?",
      "What other tools do they use daily? What does Imladris need to play nicely with?",
    ],
  },
  {
    id: "voice",
    title: "The Voice",
    prompt:
      "Show me how Imladris talks. If Imladris had to send a message for each of these situations, what would it say: a welcome message, an error, a confirmation that something worked, and an empty screen with no data yet?",
    example:
      "Good morning. You've got 3 things on deck today. We say check in, not session. We never say syncing or processing. We say what's actually happening.",
    probes: [
      "How formal or casual? Would Imladris use contractions, emoji, or exclamation marks?",
      "When something goes wrong, what's the tone? Clinical, reassuring, apologetic?",
      "Are there words Imladris should never use?",
      "Is the voice the same everywhere, management UI and scan flow, or does it change?",
    ],
  },
];

export const DESIGN_INTERVIEW_OUTPUT_TEMPLATE = `# Imladris - Design Interview

**Date:** [today's date]
**Interviewee:** [name, role]

---

## Product

- **One-liner:** [one sentence describing Imladris]
- **Core job:** [the one thing users must do effortlessly]
- **Intended feeling:** [how users should feel]
- **If Imladris works perfectly:** [their vision]

---

## Design values

**Three words:** [word], [word], [word]

**Admired products/things:**
- [product] - [what specifically they admire]

**Rejections:**
- [what Imladris should never feel like]

## Visual aesthetics

**Overall vibe:** [their description]
**Density:** [spacious / balanced / dense / very dense]
**Color direction:** [how they feel about the current orange + dark sidebar, any changes they'd make]
**Reference visuals:** [websites, apps, physical things they pointed to as looking right]
**Visual trends to avoid:** [specific aesthetic choices they reject]

---

## User reality

**What's working:**
- [strength]

**What's broken:**
- [pain point]

**Top priority fix:** [the one thing they'd fix tomorrow]

**Surprising user behavior:** [anything unexpected]

---

## Users

**Who they are:** [description]
**Their environment:** [physical context, constraints]
**Their tech level:** [low / medium / high]
**Their frustrations with current tools:** [list]
**Other tools they use:** [list]

---

## Voice

**Formality:** [formal / casual / between]

**Example messages:**
- Welcome: "[their example]"
- Error: "[their example]"
- Confirmation: "[their example]"
- Empty state: "[their example]"

**Words to use:** [list]
**Words to avoid:** [list]

---

## Notes

[Anything that didn't fit above. Contradictions, things they emphasized, things they skipped. What they talked about longest vs. shortest.]`;

export const DEFAULT_DESIGN_INTERVIEW_DRAFT: DesignInterviewDraft = {
  intervieweeName: "",
  intervieweeRole: "",
  transcript: "",
  structuredOutput: DESIGN_INTERVIEW_OUTPUT_TEMPLATE,
  promptNotes: {},
  completedPromptIds: [],
};

export function buildDesignInterviewPrompt(input?: {
  intervieweeName?: string;
  intervieweeRole?: string;
}): string {
  const intervieweeName = input?.intervieweeName?.trim() ?? "";
  const intervieweeRole = input?.intervieweeRole?.trim() ?? "";
  const interviewee = [intervieweeName, intervieweeRole].filter(Boolean).join(", ");
  const outputTemplate = personalizeDesignInterviewTemplate(intervieweeName, intervieweeRole);
  const promptSections = DESIGN_INTERVIEW_PROMPTS.map((section, index) => {
    const sectionLines = [
      `## Prompt ${index + 1}: ${section.title}`,
      "",
      "Ask:",
      `> ${section.prompt}`,
      "",
      `Example to share: "${section.example}"`,
      "",
      "Follow-up probes:",
      ...section.probes.map((probe) => `- ${probe}`),
    ];

    if (section.followupPrompt) {
      sectionLines.push(
        "",
        `Then ask specifically about ${section.followupTitle ?? "this area"}:`,
        `> ${section.followupPrompt}`,
        "",
        "Follow-up probes:",
        ...(section.followupProbes ?? []).map((probe) => `- ${probe}`),
      );
    }

    return sectionLines.join("\n");
  });

  return [
    "You are running a design interview for Imladris, a lean manufacturing tool that helps small manufacturers manage inventory through physical kanban cards, QR scanning, and automated reordering. The interview captures design intent to generate a company design skill that AI agents will use when building Imladris's UI.",
    "",
    ...(interviewee
      ? [`This session is for: ${interviewee}`, ""]
      : []),
    "Here's what we already know from the codebase:",
    ...DESIGN_INTERVIEW_CONTEXT.map((line) => `- ${line}`),
    "",
    "You don't need to re-ask about the stack or technical details. Focus on product vision, design values, visual aesthetics, user reality, and voice.",
    "",
    "IMPORTANT: This person may have very different opinions than what's been captured so far. Don't lead them toward the existing answers. Ask open-ended questions and let them express their own perspective. If their answer contradicts the pre-filled context, that's valuable. Capture it. Each team member's unique point of view matters.",
    "",
    "## Rules",
    ...DESIGN_INTERVIEW_RULES.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    "## Voice dictation note",
    "The person will likely be dictating their answers. Their responses may be long, rambly, have filler words, go on tangents, or circle back. This is great. It means they're thinking out loud. Don't ask them to be more concise. Your job is to pull the signal out of the noise when you compile the output at the end. During the conversation, just keep them talking.",
    "",
    "## Start by introducing yourself:",
    "",
    "\"Hi! I'm going to ask you 5 questions about Imladris - how it should feel, who it's for, what's working, what's broken, and how it talks. There are no wrong answers. Just tell me what comes to mind. I'll organize everything afterward.\n\nLet's start. What's your name and role at Imladris?\"",
    "",
    "[Wait for answer, then proceed with prompts in order.]",
    "",
    ...promptSections,
    "",
    "## After all prompts, compile into this format:",
    "",
    "```markdown",
    outputTemplate,
    "```",
    "",
    "Present the compiled output and ask: \"Does this capture what you said? Anything I got wrong or missed?\" Let them correct before finalizing.",
  ].join("\n");
}

export function personalizeDesignInterviewTemplate(name: string, role: string): string {
  const interviewee = [name.trim(), role.trim()].filter(Boolean).join(", ");
  if (!interviewee) return DESIGN_INTERVIEW_OUTPUT_TEMPLATE;

  return DESIGN_INTERVIEW_OUTPUT_TEMPLATE.replace("[name, role]", interviewee);
}
