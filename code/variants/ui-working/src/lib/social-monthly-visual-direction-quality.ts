import type { VisualDirectionCameraAngle, VisualDirectionComposition, VisualDirectionHumanPresence, VisualDirectionMotion, VisualDirectionShotScale } from '@/lib/social-monthly-visual-direction-types'

export type VisualDirectionQualityItem = {
  shot_scale: VisualDirectionShotScale
  camera_angle: VisualDirectionCameraAngle
  composition: VisualDirectionComposition
  human_presence: VisualDirectionHumanPresence
  motion: VisualDirectionMotion
}

function longestRun(values: string[]) {
  let longest = 0
  let running = 0
  let previous = ''
  for (const value of values) {
    running = value && value === previous ? running + 1 : 1
    previous = value
    longest = Math.max(longest, running)
  }
  return longest
}

export function visualDirectionWarnings(items: VisualDirectionQualityItem[]) {
  const warnings: string[] = []
  const count = <K extends keyof VisualDirectionQualityItem>(field: K, value: VisualDirectionQualityItem[K]) => items.filter(item => item[field] === value).length
  const centered = count('composition', 'centered_hero')
  const closeMacro = items.filter(item => item.shot_scale === 'close' || item.shot_scale === 'macro' || item.shot_scale === 'extreme_macro').length
  const wide = items.filter(item => item.shot_scale === 'wide' || item.shot_scale === 'environmental_wide').length
  if (centered >= 5) warnings.push(`${centered} of ${items.length} posts use Centered Hero composition.`)
  if (closeMacro >= 6) warnings.push(`${closeMacro} of ${items.length} posts use Close or Macro framing.`)
  if (longestRun(items.map(item => item.human_presence)) >= 4 && items.some(item => item.human_presence === 'none')) warnings.push('Four or more consecutive posts have Human Presence = None.')
  if (!items.some(item => item.camera_angle === 'birds_eye')) warnings.push("No Bird's-Eye / Top-Down composition appears this month.")
  if (longestRun(items.map(item => item.camera_angle)) >= 3 && items.some(item => item.camera_angle === 'eye_level')) warnings.push('Three or more consecutive posts use Eye Level.')
  if (wide <= 1) warnings.push('Only one or no Wide / Environmental Wide composition exists.')
  return [...new Set(warnings)]
}

const centeredClose = (): VisualDirectionQualityItem => ({ shot_scale: 'close', camera_angle: 'eye_level', composition: 'centered_hero', human_presence: 'none', motion: 'static' })

export const VISUAL_DIRECTION_FIXTURES = {
  repetitive: Array.from({ length: 8 }, centeredClose).concat(Array.from({ length: 7 }, () => ({ shot_scale: 'close' as const, camera_angle: 'eye_level' as const, composition: 'centered_hero' as const, human_presence: 'none' as const, motion: 'static' as const }))),
  balanced: [
    { shot_scale: 'wide', camera_angle: 'architectural_straight_on', composition: 'symmetrical', human_presence: 'background_guests', motion: 'static' },
    { shot_scale: 'macro', camera_angle: 'birds_eye', composition: 'asymmetrical', human_presence: 'hands_only', motion: 'subtle' },
    { shot_scale: 'medium', camera_angle: 'three_quarter', composition: 'rule_of_thirds', human_presence: 'single_person', motion: 'subtle' },
    { shot_scale: 'detail', camera_angle: 'table_level', composition: 'layered_foreground', human_presence: 'none', motion: 'static' },
    { shot_scale: 'environmental_wide', camera_angle: 'high_angle', composition: 'environmental', human_presence: 'small_group', motion: 'active' },
    { shot_scale: 'close', camera_angle: 'low_angle', composition: 'negative_space', human_presence: 'staff_service', motion: 'subtle' },
  ] satisfies VisualDirectionQualityItem[],
}

export function runVisualDirectionFixtureChecks() {
  const repetitiveWarnings = visualDirectionWarnings(VISUAL_DIRECTION_FIXTURES.repetitive)
  const balancedWarnings = visualDirectionWarnings(VISUAL_DIRECTION_FIXTURES.balanced)
  return {
    repetitive_detected: repetitiveWarnings.some(warning => warning.includes('Centered Hero')) && repetitiveWarnings.some(warning => warning.includes('Close or Macro')),
    balanced_reduced: balancedWarnings.length < repetitiveWarnings.length,
    repetitiveWarnings,
    balancedWarnings,
  }
}
