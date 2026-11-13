const internalReferencePattern = /\b(?:visual|finding|opportunity|strength|context-page)(?:[-\s:]?\d+)\b/i;
const firstPersonSingularPattern = /\b(?:i|me|my|mine|myself)\b/i;
const realisticBenefitPattern =
  /\b(?:clear(?:ly|er)?|professional(?:ly)?|easier|easy|visitors|get in touch|find|navigate|book|contact|access)\b/i;
const requiredFeedbackQuestion = "Could you share what you would like your website to help visitors do?";
const requiredServiceSentence =
  "We design and improve websites to help visitors understand services and get in touch more easily.";
const requiredAttachmentSentence = "We’ve attached the website review PDF for your reference.";
const feedbackRequestPattern =
  /\b(?:feedback|goals?|priorities|thoughts|views|share|tell us|let us know)\b|\b(?:what|how|which|where|when)\b.{0,160}\b(?:website|site|visitors?|customers?|business|help|want|hope|like|need|experience|services?|booking|contact)\b/i;

const htmlEntities: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&[#a-zA-Z0-9]+;/g, (entity) => {
    if (entity in htmlEntities) return htmlEntities[entity as keyof typeof htmlEntities]
    const numericMatch = entity.match(/^#(\d+);$/)
    if (numericMatch) {
      return String.fromCharCode(Number(numericMatch[1]))
    }
    const hexMatch = entity.match(/^#x([0-9a-fA-F]+);$/)
    if (hexMatch) {
      return String.fromCharCode(Number(`0x${hexMatch[1]}`))
    }
    return entity
  })
}

export function normalizeEmailSalutation(body: string, contactName: string): string {
  const signatureStart = body.search(/\n\n(?:kind regards|best regards|regards|sincerely|thanks),?\s*\n/i);
  const content = signatureStart < 0 ? body.trim() : body.slice(0, signatureStart).trim();
  const signature = signatureStart < 0 ? "" : body.slice(signatureStart);
  const remainder = content
    .replace(/^\s*(?:hello|hi|dear)\b[^.!?\n,]*(?:[,!.])?\s*/i, "")
    .trimStart();
  const name = contactName.replace(/[?!\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  const greeting = name ? `Hello ${name},` : "Hello,";
  return `${greeting}${remainder ? `\n\n${remainder}` : ""}${signature}`;
}

export function normalizePersonalizedEmailContent(
  body: string,
  includeReport: boolean,
  contactName = "",
): string {
  const decodedBody = decodeHtmlEntities(body)
  const signatureStart = decodedBody.search(/\n\n(?:kind regards|best regards|regards|sincerely|thanks),?\s*\n/i);
  const content = signatureStart < 0 ? decodedBody : decodedBody.slice(0, signatureStart);
  const signature = signatureStart < 0 ? "" : decodedBody.slice(signatureStart);
  const sentences = content.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [content];
  const statements: string[] = [];
  const feedbackQuestions = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.includes("?") && feedbackRequestPattern.test(sentence));
  const feedbackQuestion = feedbackQuestions.at(-1) || requiredFeedbackQuestion;
  let hasServiceDescription = false;
  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (
      !sentence ||
      sentence.includes("?") ||
      /\b(?:would love to learn|love to learn|look forward to hearing|hear your thoughts|what you would like|what you want|what you hope|website goals|website priorities)\b/i.test(sentence) ||
      /\b(?:we(?:'d| would) (?:like|appreciate)|we welcome|would welcome|would appreciate|share|tell us|let us know)\b.{0,80}\b(?:feedback|thoughts|goals|priorities)\b/i.test(sentence) ||
      (!includeReport && /\b(?:attached|attachment|attaching|attach|pdf|report)\b/i.test(sentence))
    ) {
      continue;
    }
    const isServiceDescription =
      /\b(?:we|our team)\b.{0,80}\b(?:design|build|develop|improve|creat)\w*\b.{0,80}\bwebsites?\b/i.test(sentence);
    if (hasServiceDescription && isServiceDescription) continue;
    statements.push(sentence);
    hasServiceDescription ||= isServiceDescription;
  }
  const statementText = statements.join(" ");
  const describesService =
    /\bwe\b.{0,160}\b(?:design|build|develop|improve)\b.{0,100}\bwebsites?\b/i.test(statementText) ||
    /\b(?:design|build|develop|improve)\b.{0,100}\bwebsites?\b.{0,100}\b(?:we|our)\b/i.test(statementText);
  const hasBenefit = realisticBenefitPattern.test(statementText);
  const hasAttachedReport = /(?:attached pdf|pdf.{0,30}attached|we[’']ve attached|we have attached|please see the attached)/i.test(statementText);
  const requiredStatements = [...statements];
  if (!describesService || !hasBenefit) requiredStatements.push(requiredServiceSentence);
  if (includeReport && !hasAttachedReport) requiredStatements.push(requiredAttachmentSentence);
  return normalizeEmailSalutation(
    `${[...requiredStatements, feedbackQuestion].join(" ")}${signature}`,
    contactName,
  );
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
  if (!realisticBenefitPattern.test(body)) {
    violations.push("Explain a realistic general benefit, such as clearer presentation or easier navigation/contact.");
  }
  if (!feedbackRequestPattern.test(body)) {
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
