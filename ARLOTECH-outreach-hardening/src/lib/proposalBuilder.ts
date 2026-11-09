export interface ProposalDraftInput {
  prospectName: string
  prospectEmail?: string
  senderBusinessName: string
  senderName: string
  senderEmail: string
  senderAddress: string
  senderWebsite: string
  service: string
  currency: string
  price: string
  timeline: string
  scope: string
  milestones: string
  paymentTerms: string
  exclusions: string
  assumptions: string
  validUntil: string
  acceptance: string
  detailsConfirmed: boolean
}

export function validateProposalDraft(input: ProposalDraftInput, today = new Date()) {
  const required: Array<[keyof ProposalDraftInput, string]> = [
    ['prospectName', 'Select a prospect.'],
    ['senderBusinessName', 'Enter the proposing business name.'],
    ['senderName', 'Enter the proposal contact name.'],
    ['senderEmail', 'Enter a valid proposal contact email.'],
    ['service', 'Enter the proposed service.'],
    ['currency', 'Enter a three-letter currency code.'],
    ['price', 'Enter a positive price amount.'],
    ['timeline', 'Enter a confirmed timeline.'],
    ['scope', 'Enter the confirmed scope and deliverables.'],
    ['milestones', 'Enter the confirmed milestones.'],
    ['paymentTerms', 'Enter the confirmed payment terms.'],
    ['exclusions', 'Enter exclusions or explicitly write “None”.'],
    ['assumptions', 'Enter assumptions or explicitly write “None”.'],
    ['validUntil', 'Choose a proposal validity date.'],
    ['acceptance', 'Enter the acceptance block.'],
  ]
  const errors = required.flatMap(([field, message]) =>
    typeof input[field] !== 'string' || !input[field].trim() ? [message] : [],
  )

  if (input.senderEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.senderEmail.trim())) {
    errors.push('Enter a valid proposal contact email.')
  }
  if (input.currency.trim() && !/^[A-Za-z]{3}$/.test(input.currency.trim())) {
    errors.push('Currency must be a three-letter ISO code such as GBP, USD, or NGN.')
  }
  if (input.price.trim() && !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input.price.trim())) {
    errors.push('Price must be a positive numeric amount without a currency symbol.')
  } else if (input.price.trim() && Number(input.price.replace(/,/g, '')) <= 0) {
    errors.push('Price must be greater than zero.')
  }
  if (input.validUntil.trim()) {
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(input.validUntil) ? new Date(`${input.validUntil}T00:00:00`) : null
    if (!validDate || Number.isNaN(validDate.getTime()) || validDate < new Date(today.toDateString())) {
      errors.push('Validity date must be today or a future date.')
    }
  }
  if (!input.detailsConfirmed) errors.push('Confirm that every proposal detail has been reviewed and approved.')
  return { valid: errors.length === 0, errors }
}