const internalReferencePattern = /\b(?:visual|finding|opportunity|strength|context-page)(?:[-\s:]?\d+)\b/i;
const firstPersonSingularPattern = /\b(?:i|me|my|mine|myself)\b/i;

export function getGenericCopyViolation(copy: string): "internal_reference" | "first_person_singular" | null {
  if (internalReferencePattern.test(copy)) return "internal_reference";
  if (firstPersonSingularPattern.test(copy)) return "first_person_singular";
  return null;
}

export function getGenericEmailContentViolations(body: string, includeReport = false): string[] {
  const violations: string[] = [];
  const describesService =
    /\bwe\b.{0,160}\b(?:design|build|develop|improve)\b.{0,100}\bwebsites?\b/i.test(body) ||
    /\b(?:design|build|develop|improve)\b.{0,100}\bwebsites?\b.{0,100}\b(?:we|our)\b/i.test(body);
  if (!describesService) violations.push("Describe what Arlotech does: website design, development, or improvement.");
  if (!/\b(?:clear(?:ly|er)?|professional(?:ly)?|easier|easy|visitors|get in touch)\b/i.test(body)) {
    violations.push("Explain a realistic general benefit, such as clearer presentation or easier navigation/contact.");
  }
  if (
    !/\bfeedback\b/i.test(body) &&
    !/\b(?:share|tell us|let us know)\b.{0,100}\b(?:goals|priorities|thoughts|views|website)\b/i.test(body) &&
    !/\bwhat\b.{0,100}\b(?:like|want|hope)\b.{0,100}\b(?:website|visitors)\b/i.test(body)
  ) {
    violations.push("Ask the recipient for feedback about their website goals or priorities.");
  }
  const mentionsAttachment = /(?:attached pdf|pdf.{0,30}attached|we[’']ve attached|we have attached|please see the attached)/i.test(body);
  if (includeReport && !mentionsAttachment) {
    violations.push("Tell the recipient the website review PDF is attached.");
  }
  if (!includeReport && mentionsAttachment) {
    violations.push("Do not mention an attachment when no website review PDF will be sent.");
  }
  return violations;
}
