import { describe, expect, it } from "vitest";
import { getGenericCopyViolation, getGenericEmailContentViolations } from "./copyRules.ts";

describe("generic email copy rules", () => {
  it("rejects internal audit IDs and labels", () => {
    expect(getGenericCopyViolation("We can improve the layout (visual-1).")).toBe("internal_reference");
    expect(getGenericCopyViolation("Finding 2 suggests a clearer call to action.")).toBe("internal_reference");
    expect(getGenericCopyViolation("We offer website design services.")).toBeNull();
  });

  it("requires a collective sender voice", () => {
    expect(getGenericCopyViolation("I reviewed your website.")).toBe("first_person_singular");
    expect(getGenericCopyViolation("Our team can help improve website clarity.")).toBeNull();
  });

  it("requires a general service description, a realistic benefit, and recipient feedback", () => {
    const body = "At Arlotech Digital Solutions, we design, build, and improve websites so businesses can present their services clearly and make it easier for visitors to find information and get in touch. Would you be open to sharing your feedback on what you would most like your website to help visitors do?";

    expect(getGenericEmailContentViolations(body)).toEqual([]);
    expect(getGenericEmailContentViolations("We would love to talk.")).toHaveLength(3);
  });

  it("mentions the PDF only when a report is available to attach", () => {
    const body = "We design and improve websites to make information easier to find. Would you share feedback about your website goals? We’ve attached the website review PDF.";

    expect(getGenericEmailContentViolations(body, true)).toEqual([]);
    expect(getGenericEmailContentViolations(body, false)).toContain(
      "Do not mention an attachment when no website review PDF will be sent.",
    );
    expect(getGenericEmailContentViolations(
      "We design and improve websites to make information easier to find. Would you share feedback about your website goals?",
      true,
    )).toContain("Tell the recipient the website review PDF is attached.");
  });

  it("accepts the exact service, benefit, feedback, and report sentences required by the generator", () => {
    const body = "We design and improve websites so visitors can understand services clearly and get in touch more easily. We’ve attached the website review PDF for your reference. Could you share what you would like your website to help visitors do?";

    expect(getGenericEmailContentViolations(body, true)).toEqual([]);
    expect(getGenericCopyViolation(body)).toBeNull();
  });
});
