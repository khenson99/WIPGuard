import { describe, expect, it } from "vitest";
import {
  DESIGN_INTERVIEW_OUTPUT_TEMPLATE,
  DESIGN_INTERVIEW_PROMPTS,
  buildDesignInterviewPrompt,
  personalizeDesignInterviewTemplate,
} from "@/lib/design-interview";

describe("design interview prompt builder", () => {
  it("includes every interview section in the generated prompt", () => {
    const prompt = buildDesignInterviewPrompt();

    expect(DESIGN_INTERVIEW_PROMPTS).toHaveLength(5);

    for (const section of DESIGN_INTERVIEW_PROMPTS) {
      expect(prompt).toContain(section.title);
      expect(prompt).toContain(section.prompt);
    }
  });

  it("includes the structured markdown template", () => {
    const prompt = buildDesignInterviewPrompt();

    expect(prompt).toContain("# Arda - Design Interview");
    expect(prompt).toContain(DESIGN_INTERVIEW_OUTPUT_TEMPLATE);
  });

  it("personalizes the interviewee line when values are provided", () => {
    const template = personalizeDesignInterviewTemplate("Kyle Henson", "Founder");
    expect(template).toContain("**Interviewee:** Kyle Henson, Founder");
  });

  it("keeps visual aesthetics nested under identity in the generated prompt", () => {
    const prompt = buildDesignInterviewPrompt();

    expect(prompt).toContain("## Prompt 2: The Identity");
    expect(prompt).toContain("Then ask specifically about Visual Aesthetics:");
    expect(prompt).toContain("Now let's talk about how Arda should look");
  });

  it("personalizes the generated prompt with the session interviewee", () => {
    const prompt = buildDesignInterviewPrompt({
      intervieweeName: "Kyle Henson",
      intervieweeRole: "Founder",
    });

    expect(prompt).toContain("This session is for: Kyle Henson, Founder");
    expect(prompt).toContain("**Interviewee:** Kyle Henson, Founder");
  });
});
