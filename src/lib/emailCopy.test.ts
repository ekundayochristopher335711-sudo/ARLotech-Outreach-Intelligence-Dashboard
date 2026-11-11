import { describe, expect, it } from 'vitest'
import { emailFindingImpact, emailFindingTitle } from './emailCopy'

describe('evidence-aware email finding copy', () => {
  it('does not describe an image aspect-ratio issue as a loading problem', () => {
    const finding = { audit_id: 'image-aspect-ratio', title: 'Image elements have explicit width and height' }
    expect(emailFindingTitle(finding)).toContain('stretched or compressed')
    expect(emailFindingImpact(finding)).toContain('does not indicate a loading delay')
  })

  it('does not describe heading order as unclear business messaging', () => {
    const finding = { audit_id: 'heading-order', title: 'Heading elements are not in a sequentially-descending order' }
    expect(emailFindingTitle(finding)).toContain('out of sequence')
    expect(emailFindingImpact(finding)).not.toContain('business message itself is unclear')
  })

  it('uses cautious language for doctype findings', () => {
    const finding = { audit_id: 'doctype', title: 'Page has the HTML doctype' }
    expect(emailFindingTitle(finding)).toContain('older browser display rules')
    expect(emailFindingImpact(finding)).toContain('checked visually')
  })
})
