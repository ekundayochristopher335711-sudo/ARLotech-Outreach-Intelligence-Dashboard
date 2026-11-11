const internalReferencePattern = /\b(?:visual|finding|opportunity|strength|context-page)(?:[-\s:]?\d+)\b/i;
const firstPersonSingularPattern = /\b(?:i|me|my|mine|myself)\b/i;
const requiredFeedbackQuestion = "Could you share what you would like your website to help visitors do?";
const requiredServiceSentence =
  "We design and improve websites so businesses can present their services clearly and make it easier for visitors to find information or get in touch.";
const requiredAttachmentSentence = "We’ve attached the website review PDF for your reference.";

export function normalizeGenericEmailContent(body: string, includeReport: boolean): string {
  const signatureStart = body.search(/\n\n(?:kind regards|best regards|regards|sincerely|thanks),?\s*\n/i);
  const content = signatureStart < 0 ? body : body.slice(0, signatureStart);
  const signature = signatureStart < 0 ? "" : body.slice(signatureStart);
  const sentences = content.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [content];
  const statements: string[] = [];
  let hasServiceBenefit = false;
  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (
      !sentence ||
      sentence.includes("?") ||
      /\b(?:feedback|share|tell us|let us know|would love to learn|love to learn|look forward to hearing|hear your thoughts|website goals|website priorities|what you would like|what you want|what you hope)\b/i.test(sentence) ||
      (!includeReport && /\b(?:attached|attachment|attaching|attach|pdf|report)\b/i.test(sentence))
    ) {
      continue;
    }
    const isServiceBenefit = /\bwebsites?\b/i.test(sentence) &&
      /\b(?:design|build|develop|improve|creat|present|offerings?|services?|navigation|visitors?|information|clear|intuitive|easier|easy|get in touch)\b/i.test(sentence);
    if (hasServiceBenefit && isServiceBenefit) continue;
    statements.push(sentence);
    hasServiceBenefit ||= isServiceBenefit;
  }
  const statementText = statements.join(" ");
  const describesService =
    /\bwe\b.{0,160}\b(?:design|build|develop|improve)\b.{0,100}\bwebsites?\b/i.test(statementText) ||
    /\b(?:design|build|develop|improve)\b.{0,100}\bwebsites?\b.{0,100}\b(?:we|our)\b/i.test(statementText);
  const hasBenefit = /\b(?:clear(?:ly|er)?|professional(?:ly)?|easier|easy|visitors|get in touch)\b/i.test(statementText);
  const hasAttachedReport = /(?:attached pdf|pdf.{0,30}attached|we[’']ve attached|we have attached|please see the attached)/i.test(statementText);
  const requiredStatements = [...statements];
  if (!describesService || !hasBenefit) requiredStatements.push(requiredServiceSentence);
  if (includeReport && !hasAttachedReport) requiredStatements.push(requiredAttachmentSentence);
  return `${[...requiredStatements, requiredFeedbackQuestion].join(" ")}${signature}`;
}

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
