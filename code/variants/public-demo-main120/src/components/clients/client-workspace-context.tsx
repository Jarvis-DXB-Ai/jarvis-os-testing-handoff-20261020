'use client'

import { createContext, useContext } from 'react'

/** Prior-window values ride alongside current ones so each headline metric can state its own 30-day change. */
export type SocialPlatformSummary = {
  followers: number | null
  postReach: number | null
  views: number | null
  engagements: number | null
  trend: number | null
  previous: { followers: number | null; postReach: number | null; views: number | null; engagements: number | null } | null
}

export type TopPost = {
  platform: 'instagram' | 'facebook'
  publishedAt: string | null
  postType: string
  title: string | null
  captionExcerpt: string | null
  thumbnailUrl: string | null
  postUrl: string | null
  reach: number | null
  views: number | null
  interactions: number | null
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reachVsMedian: number | null
}

export type ClientWorkspaceOverview = {
  client: { id: string; name: string; industry: string | null; status: string; website: string | null; logoUrl: string | null; logoName: string | null }
  pulse: { monthStart: string; label: string; formats: Record<'feed' | 'reel' | 'story', number>; statuses: Record<'Ready for Review' | 'Approved' | 'Scheduled' | 'Published', number>; next: { id: string; title: string; date: string | null; time: string | null } | null }
  upcoming: Array<{ id: string; title: string; format: string; status: string; date: string | null; time: string | null; platforms: string[]; thumbnailUrl: string | null }>
  reviewQueue: Array<{ id: string; title: string; format: string; date: string | null; time: string | null; platforms: string[]; thumbnailUrl: string | null }>
  attention: Array<{ id: string; title: string; detail: string; href: string; tone: 'warning' | 'neutral' }>
  content: Array<{ id: string; title: string; contentType: string; mediaType: string; createdAt: string; thumbnailUrl: string | null }>
  brain: { recordCount: number; openGapCount: number; products: number; assets: number; content: number; logins: number; brandGuidelines: number; updatedAt: string | null }
  activity: Array<{ id: string; title: string; detail: string; createdAt: string; href: string }>
  socialPerformance: { lastSyncedAt: string | null; instagram: SocialPlatformSummary | null; facebook: SocialPlatformSummary | null }
  pipeline: {
    planned: { count: number; approvedAt: string | null }
    produced: { count: number; blocked: number; stale: number }
    captioned: { count: number }
    review: { count: number }
    scheduled: { count: number; executionConfirmed: number; missingExecution: number }
    published: { count: number; failed: number; recoveryRequired: number; reach: number | null }
    bottleneck: 'review' | null
    nextStep: string
  }
  performance: {
    topPost: TopPost | null
    topPosts: TopPost[]
    lastPublishedAt: string | null
  }
  brainGaps: Array<{ id: string; title: string; detail: string | null; priority: string | null; href: string }>
}

export type ClientWorkspaceState = { overview: ClientWorkspaceOverview | null; loading: boolean; error: string | null }

export const ClientWorkspaceContext = createContext<ClientWorkspaceState>({ overview: null, loading: true, error: null })

export function useClientWorkspace() { return useContext(ClientWorkspaceContext) }
