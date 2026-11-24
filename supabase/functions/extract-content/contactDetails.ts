import { extractEmailAddresses } from './emailAddresses.ts'
import { extractPhoneNumbers } from './phoneNumbers.ts'

export function extractContactDetails(
  htmlSources: string[],
  scriptSources: string[],
  pageUrl: string,
  language: string | null,
) {
  const htmlEmails = extractEmailAddresses(htmlSources)
  return {
    emails: htmlEmails.length > 0 ? htmlEmails : extractEmailAddresses(scriptSources),
    phones: extractPhoneNumbers(htmlSources, pageUrl, language),
  }
}
