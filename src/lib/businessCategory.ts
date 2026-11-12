export interface BusinessCategoryWebsiteContent {
  title?: string | null
  metaDescription?: string | null
  headings?: Record<string, string[]>
  textExcerpt?: string
  schema?: string[]
}

export interface BusinessCategoryInference {
  category: string
  confidence: 'medium' | 'high'
  evidence: string[]
}

interface CategoryRule {
  category: string
  phrases: RegExp[]
  schemaTypes?: string[]
}

const categoryRules: CategoryRule[] = [
  {
    category: 'Plumbing and Heating',
    phrases: [/\bplumb(?:er|ers|ing)\b/i, /\bheating (?:engineer|services|contractor)\b/i, /\bhvac\b/i, /\bboiler (?:repair|installation|service)\b/i, /\bgas engineer(?:s)?\b/i],
    schemaTypes: ['Plumber'],
  },
  {
    category: 'Electrical Services',
    phrases: [/\belectrician(?:s)?\b/i, /\belectrical (?:contractor|services|installation)\b/i],
    schemaTypes: ['Electrician'],
  },
  {
    category: 'Roofing',
    phrases: [/\broof(?:er|ers|ing)\b/i, /\broof repairs?\b/i],
    schemaTypes: ['RoofingContractor'],
  },
  {
    category: 'Landscaping and Gardening',
    phrases: [/\blandscap(?:e|ing|er|ers)\b/i, /\blawn care\b/i, /\bgarden(?:ing|er|ers)\b/i, /\btree surgery\b/i],
    schemaTypes: ['LandscapingBusiness'],
  },
  {
    category: 'Cleaning Services',
    phrases: [/\bcleaning (?:company|services|business)\b/i, /\bcommercial cleaners?\b/i, /\bcarpet cleaning\b/i, /\bjanitorial\b/i],
    schemaTypes: ['Housekeeping'],
  },
  {
    category: 'Dental Care',
    phrases: [/\bdent(?:ist|al|istry)\b/i, /\borthodont(?:ist|ics)\b/i],
    schemaTypes: ['Dentist'],
  },
  {
    category: 'Veterinary Care',
    phrases: [/\bveterinar(?:y|ian)\b/i, /\bvet clinic\b/i, /\banimal hospital\b/i],
    schemaTypes: ['VeterinaryCare', 'VeterinaryClinic'],
  },
  {
    category: 'Healthcare',
    phrases: [/\bhealthcare\b/i, /\bmedical (?:clinic|centre|center|practice|services)\b/i, /\bdoctor(?:s)?\b/i, /\bphysician(?:s)?\b/i, /\bphysiotherap(?:y|ist)\b/i, /\bchiropractor(?:s)?\b/i, /\bmental health\b/i],
    schemaTypes: ['Physician', 'MedicalClinic', 'MedicalOrganization', 'Hospital', 'Pharmacy'],
  },
  {
    category: 'Legal Services',
    phrases: [/\blaw firm\b/i, /\bsolicitor(?:s)?\b/i, /\battorney(?:s)?\b/i, /\blawyer(?:s)?\b/i, /\blegal services\b/i],
    schemaTypes: ['Attorney'],
  },
  {
    category: 'Real Estate',
    phrases: [/\breal estate\b/i, /\bestate agents?\b/i, /\bletting agents?\b/i, /\bproperty management\b/i, /\brealtors?\b/i],
    schemaTypes: ['RealEstateAgent'],
  },
  {
    category: 'Restaurant and Food',
    phrases: [/\brestaurant(?:s)?\b/i, /\bcaf[eé]s?\b/i, /\bbak(?:ery|er|ers)\b/i, /\bcater(?:ing|erers?)\b/i, /\bfood truck\b/i, /\btakeaway\b/i],
    schemaTypes: ['Restaurant', 'CafeOrCoffeeShop', 'Bakery', 'FoodEstablishment', 'FastFoodRestaurant'],
  },
  {
    category: 'Automotive',
    phrases: [/\bauto repair\b/i, /\bcar repair\b/i, /\bmechanic(?:s)?\b/i, /\bcar dealership\b/i, /\bvehicle servicing\b/i],
    schemaTypes: ['AutoRepair', 'AutoDealer', 'AutomotiveBusiness', 'AutoPartsStore'],
  },
  {
    category: 'Beauty and Wellness',
    phrases: [/\bhair salon\b/i, /\bbeauty salon\b/i, /\bbarber(?:s|shop)?\b/i, /\bspa treatments?\b/i, /\bnail salon\b/i, /\bbeauty (?:clinic|therapist)\b/i],
    schemaTypes: ['BeautySalon', 'HairSalon', 'NailSalon', 'DaySpa', 'BarberShop'],
  },
  {
    category: 'Education',
    phrases: [/\bschool(?:s)?\b/i, /\bcollege(?:s)?\b/i, /\btutoring\b/i, /\btraining (?:centre|center|provider)\b/i, /\bdriving instructor\b/i, /\bpreschool\b/i],
    schemaTypes: ['School', 'CollegeOrUniversity', 'EducationalOrganization', 'DrivingSchool'],
  },
  {
    category: 'Finance and Accounting',
    phrases: [/\baccount(?:ant|ancy|ing)\b/i, /\bbookkeeping\b/i, /\btax (?:advice|preparation|services)\b/i, /\bfinancial advisor\b/i, /\binsurance broker\b/i],
    schemaTypes: ['AccountingService', 'FinancialService', 'InsuranceAgency'],
  },
  {
    category: 'Construction',
    phrases: [/\bconstruction (?:company|services|contractor)\b/i, /\bbuilding contractor\b/i, /\bhome renovations?\b/i, /\bremodel(?:ing|ling)\b/i],
    schemaTypes: ['GeneralContractor', 'HomeAndConstructionBusiness'],
  },
  {
    category: 'Retail',
    phrases: [/\bretail store\b/i, /\bonline shop\b/i, /\be-?commerce\b/i, /\bwe sell\b/i],
    schemaTypes: ['Store', 'OnlineStore', 'ClothingStore', 'ElectronicsStore', 'FurnitureStore', 'GroceryStore'],
  },
  {
    category: 'Hospitality',
    phrases: [/\bhotel(?:s)?\b/i, /\bguest house\b/i, /\bbed and breakfast\b/i, /\bholiday rental\b/i, /\btravel agency\b/i],
    schemaTypes: ['Hotel', 'LodgingBusiness', 'TravelAgency'],
  },
  {
    category: 'Fitness and Sports',
    phrases: [/\bfitness (?:studio|centre|center|club)\b/i, /\bgym(?:nasium)?\b/i, /\bpersonal training\b/i, /\byoga studio\b/i, /\bmartial arts\b/i],
    schemaTypes: ['ExerciseGym', 'SportsActivityLocation'],
  },
  {
    category: 'Technology',
    phrases: [/\bsoftware (?:company|development|developer)\b/i, /\bit support\b/i, /\btechnology consultancy\b/i, /\bweb development agency\b/i, /\bsaas\b/i],
    schemaTypes: ['ITService', 'SoftwareApplication'],
  },
  {
    category: 'Photography and Media',
    phrases: [/\bphotograph(?:er|ers|y)\b/i, /\bvideo production\b/i, /\bmedia production\b/i],
    schemaTypes: ['PhotographyBusiness'],
  },
  {
    category: 'Nonprofit',
    phrases: [/\bnon-?profit\b/i, /\bcharit(?:y|able)\b/i, /\bfoundation\b/i],
    schemaTypes: ['NGO', 'Nonprofit501c3'],
  },
]

function collectSchemaTypes(value: unknown, types: Set<string>, depth = 0) {
  if (depth > 8 || types.size >= 100) return
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, types, depth + 1)
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, item] of Object.entries(value)) {
    if (key === '@type') {
      for (const type of Array.isArray(item) ? item : [item]) {
        if (typeof type === 'string') types.add(type.split(/[/:]/).pop() || type)
      }
    } else {
      collectSchemaTypes(item, types, depth + 1)
    }
  }
}

function getTextSources(content: BusinessCategoryWebsiteContent) {
  const sources: Array<{ text: string; weight: number }> = []
  if (content.title?.trim()) sources.push({ text: content.title.trim(), weight: 4 })
  if (content.metaDescription?.trim()) sources.push({ text: content.metaDescription.trim(), weight: 2 })
  for (const [tag, headings] of Object.entries(content.headings ?? {})) {
    const weight = tag.toLowerCase() === 'h1' ? 4 : tag.toLowerCase() === 'h2' ? 3 : 2
    for (const heading of headings.slice(0, 20)) {
      if (heading.trim()) sources.push({ text: heading.trim(), weight })
    }
  }
  if (content.textExcerpt?.trim()) sources.push({ text: content.textExcerpt.slice(0, 3000), weight: 1 })
  return sources
}

export function inferBusinessCategory(
  content: BusinessCategoryWebsiteContent,
): BusinessCategoryInference | null {
  const schemaTypes = new Set<string>()
  for (const schema of content.schema ?? []) {
    try {
      collectSchemaTypes(JSON.parse(schema), schemaTypes)
    } catch {
      continue
    }
  }

  const textSources = getTextSources(content)
  const scores = categoryRules.map((rule) => {
    let score = 0
    const evidence = new Set<string>()
    for (const phrase of rule.phrases) {
      for (const source of textSources) {
        if (phrase.test(source.text)) {
          score += source.weight
          evidence.add(source.text.slice(0, 140))
        }
      }
    }
    if (rule.schemaTypes?.some((type) => schemaTypes.has(type))) {
      score += 6
      evidence.add(`Structured business type: ${rule.schemaTypes.find((type) => schemaTypes.has(type))}`)
    }
    return { category: rule.category, score, evidence: [...evidence] }
  }).sort((left, right) => right.score - left.score)

  const best = scores[0]
  const runnerUp = scores[1]
  if (!best || best.score < 4 || (runnerUp && best.score - runnerUp.score < 2)) return null

  return {
    category: best.category,
    confidence: best.score >= 8 ? 'high' : 'medium',
    evidence: best.evidence.slice(0, 4),
  }
}
