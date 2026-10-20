export const VISUAL_DIRECTION_SHOT_SCALES = ['extreme_macro', 'macro', 'close', 'medium', 'wide', 'environmental_wide', 'detail', 'graphic', 'not_applicable', 'other'] as const
export const VISUAL_DIRECTION_CAMERA_ANGLES = ['birds_eye', 'high_angle', 'eye_level', 'table_level', 'low_angle', 'three_quarter', 'pov', 'over_the_shoulder', 'architectural_straight_on', 'not_applicable', 'other'] as const
export const VISUAL_DIRECTION_COMPOSITIONS = ['centered_hero', 'asymmetrical', 'rule_of_thirds', 'negative_space', 'layered_foreground', 'frame_within_frame', 'diagonal', 'symmetrical', 'edge_crop', 'immersive_crop', 'editorial_still_life', 'environmental', 'graphic', 'other'] as const
export const VISUAL_DIRECTION_HUMAN_PRESENCE = ['none', 'hands_only', 'partial_figure', 'single_person', 'couple', 'small_group', 'background_guests', 'staff_service', 'mixed_foreground_background', 'not_applicable', 'other'] as const
export const VISUAL_DIRECTION_INTERACTIONS = ['none', 'passing_food', 'sharing_dish', 'serving', 'pouring', 'cutting', 'picking_up', 'taking_a_bite', 'cooking', 'plating', 'garnishing', 'utensil_interaction', 'carrying', 'toasting_raising_glasses', 'conversation', 'walking_through_frame', 'pet_interaction', 'staff_interaction', 'not_applicable', 'other'] as const
export const VISUAL_DIRECTION_MOTIONS = ['static', 'subtle', 'active', 'dynamic', 'not_applicable', 'other'] as const
export const VISUAL_DIRECTION_GRID_CROPS = ['safe', 'edge_aware', 'intentional_crop'] as const

export type VisualDirectionShotScale = typeof VISUAL_DIRECTION_SHOT_SCALES[number]
export type VisualDirectionCameraAngle = typeof VISUAL_DIRECTION_CAMERA_ANGLES[number]
export type VisualDirectionComposition = typeof VISUAL_DIRECTION_COMPOSITIONS[number]
export type VisualDirectionHumanPresence = typeof VISUAL_DIRECTION_HUMAN_PRESENCE[number]
export type VisualDirectionInteraction = typeof VISUAL_DIRECTION_INTERACTIONS[number]
export type VisualDirectionMotion = typeof VISUAL_DIRECTION_MOTIONS[number]
export type VisualDirectionGridCrop = typeof VISUAL_DIRECTION_GRID_CROPS[number]

export type VisualDirectionFields = {
  shot_scale: VisualDirectionShotScale
  camera_angle: VisualDirectionCameraAngle
  composition: VisualDirectionComposition
  human_presence: VisualDirectionHumanPresence
  interaction: VisualDirectionInteraction
  motion: VisualDirectionMotion
  visual_direction: string
  production_aspect_ratio: '4:5'
  grid_crop_behavior: VisualDirectionGridCrop
  visual_direction_source?: 'unassigned' | 'ai' | 'manual'
  visual_direction_prompt_version?: string | null
  visual_direction_execution_id?: string | null
  visual_direction_generated_at?: string | null
}

export const VISUAL_DIRECTION_OPTIONS = {
  shot_scale: [
    ['extreme_macro', 'Extreme Macro'], ['macro', 'Macro'], ['close', 'Close'], ['medium', 'Medium'], ['wide', 'Wide'], ['environmental_wide', 'Environmental Wide'], ['detail', 'Detail'], ['graphic', 'Graphic'], ['not_applicable', 'Not Applicable'], ['other', 'Other'],
  ],
  camera_angle: [
    ['birds_eye', "Bird's-Eye / Top-Down"], ['high_angle', 'High Angle'], ['eye_level', 'Eye Level'], ['table_level', 'Table Level'], ['low_angle', 'Low Angle'], ['three_quarter', 'Three-Quarter'], ['pov', 'POV'], ['over_the_shoulder', 'Over-the-Shoulder'], ['architectural_straight_on', 'Architectural / Straight-On'], ['not_applicable', 'Not Applicable'], ['other', 'Other'],
  ],
  composition: [
    ['centered_hero', 'Centered Hero'], ['asymmetrical', 'Asymmetrical'], ['rule_of_thirds', 'Rule of Thirds'], ['negative_space', 'Negative Space'], ['layered_foreground', 'Layered Foreground'], ['frame_within_frame', 'Frame Within Frame'], ['diagonal', 'Diagonal'], ['symmetrical', 'Symmetrical'], ['edge_crop', 'Edge Crop'], ['immersive_crop', 'Immersive Crop'], ['editorial_still_life', 'Editorial Still Life'], ['environmental', 'Environmental'], ['graphic', 'Graphic'], ['other', 'Other'],
  ],
  human_presence: [
    ['none', 'None'], ['hands_only', 'Hands Only'], ['partial_figure', 'Partial Figure'], ['single_person', 'Single Person'], ['couple', 'Couple'], ['small_group', 'Small Group'], ['background_guests', 'Background Guests'], ['staff_service', 'Staff / Service'], ['mixed_foreground_background', 'Mixed Foreground + Background'], ['not_applicable', 'Not Applicable'], ['other', 'Other'],
  ],
  interaction: [
    ['none', 'None'], ['passing_food', 'Passing Food'], ['sharing_dish', 'Sharing Dish'], ['serving', 'Serving'], ['pouring', 'Pouring'], ['cutting', 'Cutting'], ['picking_up', 'Picking Up'], ['taking_a_bite', 'Taking a Bite'], ['cooking', 'Cooking'], ['plating', 'Plating'], ['garnishing', 'Garnishing'], ['utensil_interaction', 'Utensil Interaction'], ['carrying', 'Carrying'], ['toasting_raising_glasses', 'Toasting / Raising Glasses'], ['conversation', 'Conversation'], ['walking_through_frame', 'Walking Through Frame'], ['pet_interaction', 'Pet Interaction'], ['staff_interaction', 'Staff Interaction'], ['not_applicable', 'Not Applicable'], ['other', 'Other'],
  ],
  motion: [
    ['static', 'Static'], ['subtle', 'Subtle'], ['active', 'Active'], ['dynamic', 'Dynamic'], ['not_applicable', 'Not Applicable'], ['other', 'Other'],
  ],
  grid_crop_behavior: [
    ['safe', 'Safe'], ['edge_aware', 'Edge-Aware'], ['intentional_crop', 'Intentional Crop'],
  ],
} as const

export function visualDirectionGridCropForComposition(composition: VisualDirectionComposition): VisualDirectionGridCrop {
  return composition === 'edge_crop' || composition === 'immersive_crop' ? 'edge_aware' : 'safe'
}

export function visualDirectionLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
}
