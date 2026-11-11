import { describe, expect, it } from "vitest";
import {
  getGenericCopyViolation,
  getGenericEmailContentViolations,
  normalizeEmailSalutation,
  normalizePersonalizedEmailContent,
} from "./copyRules.ts";

describe("personalized email copy rules", () => {
  it("rejects internal audit IDs and labels", () => {
    expect(getGenericCopyViolation("We can improve the layout (visual-1).")).toBe("internal_reference");
    expect(getGenericCopyViolation("Finding 2 suggests a clearer call to action.")).toBe("internal_reference");
    expect(getGenericCopyViolation("We offer website design services.")).toBeNull();
  });

  it("requires a collective sender voice", () => {
    expect(getGenericCopyViolation("I reviewed your website.")).toBe("first_person_singular");
    expect(getGenericCopyViolation("Our team can help improve website clarity.")).toBeNull();
  });

  it("requires a service description, a realistic benefit, and recipient feedback", () => {
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

  it("accepts service, benefit, feedback, and report content", () => {
    const body = "We design and improve websites so visitors can understand services clearly and get in touch more easily. We’ve attached the website review PDF for your reference. Could you share what you would like your website to help visitors do?";

    expect(getGenericEmailContentViolations(body, true)).toEqual([]);
    expect(getGenericCopyViolation(body)).toBeNull();
  });

  it("normalizes generated copy while retaining its relevant feedback question", () => {
    const body = normalizePersonalizedEmailContent(
      "Hello. Would you like us to help? What would you like your website to do?",
      false,
    );

    expect(body).toBe(
      "Hello,\n\nWe design and improve websites to help visitors understand services and get in touch more easily. What would you like your website to do?",
    );
    expect((body.match(/\?/g) ?? []).length).toBe(1);
    expect(getGenericEmailContentViolations(body)).toEqual([]);
  });

  it("adds a missing report statement and preserves the sender signature", () => {
    const body = normalizePersonalizedEmailContent(
      "Hello. We design and improve websites. Could you share your website goals?\n\nKind regards,\nArlotech",
      true,
    );

    expect(body).toContain("We’ve attached the website review PDF for your reference.");
    expect(body.endsWith("\n\nKind regards,\nArlotech")).toBe(true);
    expect(getGenericEmailContentViolations(body, true)).toEqual([]);
  });

  it("uses the saved contact name in the greeting and keeps report findings in the body", () => {
    const body = normalizePersonalizedEmailContent(
      "Hello. The mobile navigation menu overlaps page content on smaller screens. Could you share your website goals?",
      true,
      "Ada Lovelace",
    );

    expect(body).toContain("Hello Ada Lovelace,");
    expect(body).toContain("The mobile navigation menu overlaps page content on smaller screens.");
    expect(body).toContain("We’ve attached the website review PDF for your reference.");
    expect((body.match(/\?/g) ?? []).length).toBe(1);
  });

  it("uses a neutral salutation when no saved contact name exists", () => {
    expect(normalizeEmailSalutation("Dear visitor,\n\nWe can help.", "")).toBe(
      "Hello,\n\nWe can help.",
    );
  });

  it("removes attachment claims when no report will be sent", () => {
    const body = normalizePersonalizedEmailContent(
      "Hello. We design and improve websites for clearer information. The website review PDF is attached. Could you share your website goals?",
      false,
    );

    expect(body).not.toMatch(/attached|website review PDF/i);
    expect((body.match(/\?/g) ?? []).length).toBe(1);
  });

  it("removes repeated service pitches and indirect feedback asks", () => {
    const body = normalizePersonalizedEmailContent(
      "Hello. At ARLOTECH Digital Solutions, we design and improve websites so visitors can understand services clearly and get in touch more easily. Our team focuses on creating websites that help businesses present their offerings clearly while making navigation intuitive for visitors. We’ve attached the website review PDF for your reference. We would love to learn what you would like your website to help visitors accomplish. We look forward to hearing your thoughts and exploring how we can assist with your website priorities. Could you share what you would like your website to help visitors do?\n\nKind regards,\nEkundayo Christopher\nARLOTECH",
      true,
    );

    expect(body).toBe(
      "Hello,\n\nAt ARLOTECH Digital Solutions, we design and improve websites so visitors can understand services clearly and get in touch more easily. We’ve attached the website review PDF for your reference. Could you share what you would like your website to help visitors do?\n\nKind regards,\nEkundayo Christopher\nARLOTECH",
    );
    expect((body.match(/\?/g) ?? []).length).toBe(1);
    expect(getGenericEmailContentViolations(body, true)).toEqual([]);
  });

  it("preserves prospect-specific website context and a tailored feedback question", () => {
    const body = normalizePersonalizedEmailContent(
      "Hello. Because your booking page is hard to find, mobile visitors may miss the class schedule. We can develop a website experience that makes class registration easier for new members. Which part of the booking experience would you most like visitors to find?",
      false,
      "Ada Lovelace",
    );

    expect(body).toContain("Hello Ada Lovelace,");
    expect(body).toContain("your booking page is hard to find");
    expect(body).toContain("Which part of the booking experience would you most like visitors to find?");
    expect(body).not.toContain("Could you share what you would like your website to help visitors do?");
    expect((body.match(/\?/g) ?? []).length).toBe(1);
    expect(getGenericEmailContentViolations(body)).toEqual([]);
  });
});
