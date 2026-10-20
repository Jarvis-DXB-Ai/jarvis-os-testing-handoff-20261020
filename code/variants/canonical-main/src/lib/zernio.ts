export type SocialPlatform =
  | "twitter"
  | "x"
  | "instagram"
  | "whatsapp"
  | "facebook"
  | "linkedin"
  | "tiktok"
  | "youtube"
  | "pinterest"
  | "reddit"
  | "bluesky"
  | "threads"
  | "googlebusiness"
  | "telegram"
  | "snapchat"
  | "discord"

export type ZernioAccountPlatform = SocialPlatform | "metaads"

export type SocialConnectionStatus = "pending" | "connected" | "disconnected" | "expired" | "error"
export type PublishingStatus = "draft" | "awaiting_asset" | "awaiting_caption" | "awaiting_approval" | "approved" | "queued" | "scheduled" | "publishing" | "published" | "failed"
export type AutomationStatus = "draft" | "active" | "paused" | "disabled" | "error"
export type ConversationTag = "reservation" | "menu_question" | "event_inquiry" | "influencer" | "complaint" | "vip" | "booking_intent"

export type ConnectedSocialAccount = {
  id: string
  clientId: string
  platform: ZernioAccountPlatform
  username: string
  displayName: string
  externalAccountId?: string | null
  connectionStatus: SocialConnectionStatus
  tokenHealth: "unknown" | "healthy" | "expiring" | "expired" | "error"
  primary: boolean
  profileId?: string | null
  avatarUrl?: string | null
  bio?: string | null
  website?: string | null
  profileUrl?: string | null
  followers?: number | null
  following?: number | null
  postCount?: number | null
  connectedAt?: string | null
  lastSyncedAt?: string | null
  providerMetadata?: {
    platformStatus?: string | null
    platformUserId?: string | null
    accountType?: string | null
    followers?: number | null
    postCount?: number | null
    metaAds?: {
      enumeratedAdAccountIds: string[]
      scopedAdAccountIds: string[]
      subscribedAdAccountIds: string[]
    }
  }
}

export type SocialProfile = {
  accountId: string
  platform: SocialPlatform
  username: string
  displayName: string
  category?: string | null
  bio?: string | null
  website?: string | null
  followers?: number | null
  following?: number | null
  postCount?: number | null
  profileViews?: number | null
  profileStatus: "unknown" | "healthy" | "needs_attention"
  rawProviderProfile?: Record<string, unknown>
}

export type SocialMetricSnapshot = {
  timestamp: string
  platform: SocialPlatform
  accountId?: string | null
  followers?: number
  followerGrowth?: number
  reach?: number
  impressions?: number
  profileViews?: number
  engagementRate?: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  clicks?: number
  views?: number
  watchTime?: number
  postsThisMonth?: number
  bestPostId?: string | null
}

export type SocialPostPerformance = {
  postId: string
  zernioPostId?: string | null
  platformPostId?: string | null
  platform: SocialPlatform
  postType: "reel" | "post" | "story" | "carousel"
  createdAt: string
  publishedAt?: string | null
  title?: string | null
  caption?: string | null
  mediaType?: string | null
  thumbnailUrl?: string | null
  platformThumbnailUrl?: string | null
  cachedThumbnailUrl?: string | null
  cachedThumbnailPath?: string | null
  thumbnailCacheStatus?: "cached" | "source_unavailable" | "not_configured" | "missing_source" | "error"
  postUrl?: string | null
  platformUrl?: string | null
  accountId?: string | null
  accountUsername?: string | null
  reach?: number
  impressions?: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  clicks?: number
  views?: number
  watchTime?: number
  averageWatchTime?: number
  engagementRate?: number
  lastUpdated?: string | null
  subjectTags?: string[]
}

export type InstagramInsightPeriod = {
  since: string
  until: string
  views?: number | null
  reach?: number | null
  accountsEngaged?: number | null
  totalInteractions?: number | null
  followsAndUnfollows?: number | null
  profileLinkTaps?: number | null
}

export type InstagramAccountInsight = {
  accountId: string
  platform: Extract<SocialPlatform, "instagram">
  current: InstagramInsightPeriod
  previous: InstagramInsightPeriod
  delta: {
    views?: number | null
    reach?: number | null
    accountsEngaged?: number | null
    totalInteractions?: number | null
    followsAndUnfollows?: number | null
    profileLinkTaps?: number | null
  }
  dataDelay?: string | null
}

export type InstagramAudienceRow = {
  label: string
  count: number
  percent: number
}

export type InstagramDemographics = {
  accountId: string
  platform: Extract<SocialPlatform, "instagram">
  timeframe: string
  topCities: InstagramAudienceRow[]
  topCountries: InstagramAudienceRow[]
  ageDistribution: InstagramAudienceRow[]
  genderDistribution: InstagramAudienceRow[]
  note?: string | null
}

export type InstagramFollowerObservation = {
  accountId: string
  platform: Extract<SocialPlatform, "instagram">
  date: string
  followers: number
  followersGained: number | null
  followersLost: number | null
  dataDelay?: string | null
}

export type PostingFrequencyObservation = {
  platform: Extract<SocialPlatform, "instagram" | "facebook">
  postsPerWeek: number
  averageEngagementRate: number | null
  averageEngagement: number | null
  weeksCount: number
}

export type SocialAnalyticsRange = "30d" | "90d" | "all"

export type InstagramStoryMedia = {
  id: string
  accountId: string
  platform: Extract<SocialPlatform, "instagram">
  mediaType?: string | null
  mediaUrl?: string | null
  thumbnailUrl?: string | null
  permalink?: string | null
  publishedAt?: string | null
  expiresAt?: string | null
  source: "active_story"
}

export type SocialPost = {
  id: string
  clientId: string
  accountId?: string | null
  platform: SocialPlatform
  title: string
  caption?: string
  hashtags?: string[]
  cta?: string | null
  mediaUrls: string[]
  contentType: "post" | "reel" | "story" | "carousel" | "short"
  campaignId?: string | null
  status: PublishingStatus
  scheduledAt?: string | null
  publishedAt?: string | null
  approvalStatus: "not_required" | "pending" | "approved" | "changes_requested"
  queueItemId?: string | null
  zernioPostId?: string | null
}

export type ScheduledPost = Pick<SocialPost, "id" | "platform" | "title" | "contentType" | "status" | "scheduledAt" | "approvalStatus" | "mediaUrls">

export type QueueItem = {
  id: string
  clientId: string
  postId: string
  platform: SocialPlatform
  queueSlot: string
  status: Extract<PublishingStatus, "queued" | "scheduled" | "publishing" | "published" | "failed">
  retryCount: number
  lastAttemptAt?: string | null
  nextAttemptAt?: string | null
  failureReason?: string | null
}

export type PublishingLog = {
  id: string
  clientId: string
  postId: string
  platform: SocialPlatform
  eventType: "queued" | "scheduled" | "publishing_started" | "published" | "failed" | "retry_scheduled"
  message: string
  occurredAt: string
  providerPayloadId?: string | null
}

export type InboxConversation = {
  id: string
  clientId: string
  accountId: string
  platform: SocialPlatform
  participantName: string
  participantHandle?: string | null
  tags: ConversationTag[]
  priority: "low" | "medium" | "high" | "urgent"
  status: "open" | "pending_reply" | "escalated" | "closed"
  lastMessagePreview: string
  lastMessageAt: string
  assignedTo?: string | null
}

export type SocialComment = {
  id: string
  conversationId?: string | null
  postId?: string | null
  authorHandle: string
  text: string
  tags: ConversationTag[]
  sentiment?: "positive" | "neutral" | "mixed" | "negative"
  createdAt: string
  replied: boolean
}

export type DirectMessage = {
  id: string
  conversationId: string
  sender: "customer" | "brand" | "automation"
  text: string
  createdAt: string
  read: boolean
  automationRuleId?: string | null
}

export type AutomationRule = {
  id: string
  clientId: string
  name: string
  trigger: string
  sourcePlatform: SocialPlatform
  sourceCampaignId?: string | null
  action: "send_dm" | "private_reply" | "send_booking_link" | "create_lead" | "escalate" | "tag_conversation"
  response: string
  destination: "dm" | "comment" | "social_crm" | "internal_review"
  status: AutomationStatus
  safetyMode: "manual_approval" | "draft_only" | "live"
  approvalRequired: boolean
}

export type AutomationEvent = {
  id: string
  clientId: string
  ruleId?: string | null
  eventType:
    | "post_scheduled"
    | "post_published"
    | "post_failed"
    | "post_partial"
    | "post_cancelled"
    | "post_recycled"
    | "post_platform_published"
    | "post_platform_failed"
    | "account_connected"
    | "account_disconnected"
    | "message_received"
    | "message_sent"
    | "message_failed"
    | "reaction_received"
    | "comment_received"
    | "review_new"
    | "review_updated"
    | "automation_trigger"
    | "lead_received"
    | "webhook_test"
  sourcePlatform?: SocialPlatform | null
  payload: Record<string, unknown>
  status: "received" | "ignored" | "queued" | "processed" | "failed"
  occurredAt: string
}

export type SocialContact = {
  id: string
  clientId: string
  displayName: string
  channels: Array<{ platform: SocialPlatform; externalId: string; handle?: string | null }>
  tags: ConversationTag[]
  createdAt: string
  updatedAt?: string | null
}

export type SocialLead = {
  id: string
  clientId: string
  sourcePlatform: SocialPlatform
  source: "dm" | "comment" | "review" | "lead_form" | "manual"
  contactId?: string | null
  status: "new" | "qualified" | "reviewing" | "closed"
  summary: string
  createdAt: string
}

export type SocialReview = {
  id: string
  clientId: string
  platform: Extract<SocialPlatform, "facebook" | "googlebusiness">
  rating: number
  text: string
  reviewerName?: string | null
  hasReply: boolean
  createdAt: string
}

export type SocialCampaign = {
  id: string
  clientId: string
  name: string
  objective: string
  activation?: string
  platforms: SocialPlatform[]
  cadence: string
  deliverables: string[]
  ctaStrategy: string
  automationStrategy: string
  engagementStrategy: string
  bookingFlow?: string | null
  contentPillars: string[]
  approvals: string[]
  startDate?: string | null
  endDate?: string | null
}

export type ContentPipelineItem = {
  id: string
  title: string
  campaign: string
  platform: SocialPlatform
  format: "Post" | "Reel" | "Story" | "Carousel"
  dueDate: string
  owner: string
  status: string
  captionStatus: "missing" | "drafted" | "approved"
  approvalStatus: "pending" | "approved" | "changes_requested"
  thumbnailUrl?: string | null
}

export type SocialAsset = {
  id: string
  clientId: string
  title: string
  source: "ai_photography" | "ai_videography" | "client_brain" | "studio_shot" | "product_photography" | "graphic_design"
  assetType: "food" | "drink" | "lifestyle" | "product" | "studio_shot" | "video_frame" | "creative"
  format: string
  status: "draft" | "approved" | "platform_ready" | "scheduled" | "published"
  platformReady: boolean
  usedInCampaigns: string[]
  scheduledPostIds?: string[]
  thumbnailUrl?: string | null
  metadata?: Record<string, unknown>
}

export type PerformanceInsight = {
  id: string
  clientId: string
  title: string
  detail: string
  impactArea: "post" | "campaign" | "content_type" | "activation" | "audience" | "posting_time" | "profile_action"
  confidence: "directional" | "strong" | "verified"
  source: "zernio" | "jarvis" | "manual"
  createdAt: string
}

export type InboxSummary = {
  accountId: string
  comments: number
  dms: number
  unansweredMessages: number
  urgentReplies: number
  sentiment: "positive" | "neutral" | "mixed" | "negative"
}

export type SocialReadOnlyResource = "accounts" | "account_health" | "profile" | "analytics" | "posts" | "scheduled" | "inbox" | "comments" | "automations" | "highlights" | "pinterest" | "instagram_insights" | "instagram_demographics" | "instagram_follower_history" | "posting_frequency"
export type SocialConnectionState = "connected" | "missing_api_key" | "zernio_error" | "no_data"

export type SocialReadOnlyResponse<T = unknown> = {
  ok: boolean
  resource: SocialReadOnlyResource
  mode: "read_only"
  integration: typeof ZERNIO_INTEGRATION_STATUS
  connectionState: SocialConnectionState
  readOnly: true
  data: T[]
  summary: Record<string, unknown>
  error?: string
  providerStatus?: number
}

export type SocialProfileContainer = {
  id: string
  name: string
  description?: string | null
  color?: string | null
  isDefault?: boolean
  createdAt?: string | null
}

export const ZERNIO_INTEGRATION_STATUS = "pending" as const

export function createZernioReadOnlyPlaceholder<T = unknown>(resource: SocialReadOnlyResource): SocialReadOnlyResponse<T> {
  return {
    ok: false,
    resource,
    mode: "read_only",
    integration: ZERNIO_INTEGRATION_STATUS,
    connectionState: "missing_api_key",
    readOnly: true,
    data: [],
    summary: {},
    error: "Connect Zernio to activate live social operations. No publishing, replies, automations, or ads are executed by this endpoint.",
  }
}
