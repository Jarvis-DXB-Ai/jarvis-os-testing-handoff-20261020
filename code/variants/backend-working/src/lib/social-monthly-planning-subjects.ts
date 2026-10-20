export const MONTHLY_PLANNING_SUBJECT_TYPES = [
  'menu_item',
  'activation',
  'venue',
  'person',
  'animal',
  'service',
  'lifestyle',
  'brand',
  'other',
] as const

export type MonthlyPlanningSubjectType = typeof MONTHLY_PLANNING_SUBJECT_TYPES[number]

export type MonthlyPlanningSubjectMenu = {
  key: string
  id: string
  name: string
  menu_record_id: string
}

export type MonthlyPlanningSubjectActivation = {
  key: string
  id: string
  name: string
}

export type MonthlyPlanningSubjectPerson = {
  key: string
  id: string
  name: string
  kind: 'person' | 'animal'
}

export type MonthlyPlanningSubjectInput = {
  pillar: string
  subject_type: string
  subject_ref: string | null
  subject_label: string
  activation_ref: string | null
}

export type ResolvedMonthlyPlanningSubject = {
  type: MonthlyPlanningSubjectType
  ref: string | null
  label: string
  canonical_id: string | null
  canonical_name: string | null
  menu_record_id: string | null
  activation_record_id: string | null
}

export type MonthlyPlanningSubjectResolution =
  | { ok: true; subject: ResolvedMonthlyPlanningSubject }
  | { ok: false; field: 'subject_type' | 'subject_ref' | 'subject_label' | 'activation_ref'; value: string | null; message: string }

function text(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function failure(field: 'subject_type' | 'subject_ref' | 'subject_label' | 'activation_ref', value: string | null, message: string): MonthlyPlanningSubjectResolution {
  return { ok: false, field, value, message }
}

export function resolveMonthlyPlanningSubject(
  input: MonthlyPlanningSubjectInput,
  catalog: { menus: MonthlyPlanningSubjectMenu[]; activations: MonthlyPlanningSubjectActivation[]; people?: MonthlyPlanningSubjectPerson[] },
): MonthlyPlanningSubjectResolution {
  const type = text(input.subject_type)
  const ref = text(input.subject_ref) || null
  const label = text(input.subject_label)
  const activationRef = text(input.activation_ref) || null

  if (!MONTHLY_PLANNING_SUBJECT_TYPES.includes(type as MonthlyPlanningSubjectType)) {
    return failure('subject_type', type || null, 'Planning AI returned an unsupported subject type.')
  }
  if (!label) return failure('subject_label', null, 'Planning AI returned an empty subject label.')

  const isMenuPillar = input.pillar === 'food' || input.pillar === 'drinks'
  if (isMenuPillar) {
    if (type !== 'menu_item') return failure('subject_type', type, 'Food or Drink concepts must use subject_type menu_item.')
    if (!ref) return failure('subject_ref', null, 'A Food or Drink concept requires one current Menu reference.')
    const menu = catalog.menus.find(candidate => candidate.key === ref)
    if (!menu) return failure('subject_ref', ref, `Menu reference ${ref} does not exist in this planning snapshot.`)
    return {
      ok: true,
      subject: {
        type: 'menu_item', ref, label: menu.name, canonical_id: menu.id, canonical_name: menu.name,
        menu_record_id: menu.menu_record_id, activation_record_id: null,
      },
    }
  }

  if (input.pillar === 'events') {
    if (type !== 'activation') return failure('subject_type', type, 'Event concepts must use subject_type activation.')
    if (!ref) return failure('subject_ref', null, 'An Event concept requires one current Activation reference.')
    const activation = catalog.activations.find(candidate => candidate.key === ref)
    if (!activation) return failure('subject_ref', ref, `Activation reference ${ref} does not exist in this planning snapshot.`)
    if (activationRef !== ref) return failure('activation_ref', activationRef, 'An Event concept activation_ref must match subject_ref.')
    return {
      ok: true,
      subject: {
        type: 'activation', ref, label: activation.name, canonical_id: activation.id, canonical_name: activation.name,
        menu_record_id: null, activation_record_id: activation.id,
      },
    }
  }

  if (type === 'person' || type === 'animal') {
    if (!ref) return failure('subject_ref', null, `A named ${type} concept requires one approved ${type} reference.`)
    const person = (catalog.people ?? []).find(candidate => candidate.key === ref && candidate.kind === type)
    if (!person) return failure('subject_ref', ref, `${type === 'person' ? 'Person' : 'Animal'} reference ${ref} does not exist in this production capability snapshot.`)
    return {
      ok: true,
      subject: {
        type: type as 'person' | 'animal', ref, label: person.name, canonical_id: person.id, canonical_name: person.name,
        menu_record_id: null, activation_record_id: null,
      },
    }
  }

  if (type === 'menu_item') return failure('subject_type', type, 'Only Food or Drink concepts may use subject_type menu_item.')
  if (type === 'activation') return failure('subject_type', type, 'Only Event concepts may use subject_type activation.')
  if (ref) return failure('subject_ref', ref, 'This subject type must not use a controlled reference.')

  return {
    ok: true,
    subject: {
      type: type as Exclude<MonthlyPlanningSubjectType, 'menu_item' | 'activation' | 'person' | 'animal'>,
      ref: null,
      label,
      canonical_id: null,
      canonical_name: null,
      menu_record_id: null,
      activation_record_id: null,
    },
  }
}

export function runMonthlyPlanningSubjectFixtures() {
  const catalog = {
    menus: [
      { key: 'M01', id: '78318818-be00-5c23-9203-64c36a6ca24b', name: 'Burratina con pomodorini', menu_record_id: '911f4013-319b-506a-969b-ed6d24f381a8' },
      { key: 'M02', id: '4ffdee95-7335-50e0-bfdb-f6e569a4b6ee', name: 'Burratina con pomodorini', menu_record_id: 'ec1e57b1-e0cd-5d22-bcb7-9db6097643fb' },
    ],
    activations: [{ key: 'A01', id: '73a8f016-b8a9-5099-a787-78f87f524777', name: 'Pizza Senza Fine' }],
  }
  const inspect = (name: string, input: MonthlyPlanningSubjectInput, expected: 'succeeded' | 'reference_failed') => {
    const result = resolveMonthlyPlanningSubject(input, catalog)
    if (result.ok === false) {
      return { name, expected, outcome: 'reference_failed', subject: null, failure: { field: result.field, value: result.value } }
    }
    return { name, expected, outcome: 'succeeded', subject: result.subject, failure: null }
  }
  const mixed = Array.from({ length: 15 }, (_, index) => resolveMonthlyPlanningSubject(
    index % 3 === 0
      ? { pillar: 'food', subject_type: 'menu_item', subject_ref: index % 2 ? 'M01' : 'M02', subject_label: 'Creative menu close-up', activation_ref: null }
      : index % 3 === 1
        ? { pillar: 'lifestyle', subject_type: 'lifestyle', subject_ref: null, subject_label: 'Relaxed terrace lunch', activation_ref: null }
        : { pillar: 'events', subject_type: 'activation', subject_ref: 'A01', subject_label: 'Pizza event', activation_ref: 'A01' },
    catalog,
  ))
  return [
    inspect('A: M01 canonical menu item with creative concept', { pillar: 'food', subject_type: 'menu_item', subject_ref: 'M01', subject_label: 'Burratina close-up hero', activation_ref: null }, 'succeeded'),
    inspect('B: unknown M99 menu reference', { pillar: 'food', subject_type: 'menu_item', subject_ref: 'M99', subject_label: 'Unknown dish', activation_ref: null }, 'reference_failed'),
    inspect('C: creative label canonicalizes from M01', { pillar: 'food', subject_type: 'menu_item', subject_ref: 'M01', subject_label: 'Burratina close-up hero', activation_ref: null }, 'succeeded'),
    inspect('D: duplicate display names remain distinct through M02', { pillar: 'food', subject_type: 'menu_item', subject_ref: 'M02', subject_label: 'Second Burratina framing', activation_ref: null }, 'succeeded'),
    inspect('E: non-menu lifestyle needs only type and concise label', { pillar: 'lifestyle', subject_type: 'lifestyle', subject_ref: null, subject_label: 'Relaxed terrace lunch', activation_ref: null }, 'succeeded'),
    inspect('F: activation resolves through A01', { pillar: 'events', subject_type: 'activation', subject_ref: 'A01', subject_label: 'Pizza event', activation_ref: 'A01' }, 'succeeded'),
    {
      name: 'G: 15 mixed subject identities resolve before an atomic plan apply',
      expected: 'succeeded',
      outcome: mixed.every(result => result.ok) ? 'succeeded' : 'reference_failed',
      subject: null,
      failure: mixed.every(result => result.ok) ? null : { field: 'subject_ref', value: null },
    },
  ]
}
