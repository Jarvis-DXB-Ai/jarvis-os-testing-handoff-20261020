/** Organic analytics for the currently supported Instagram/Facebook connections. */
export type AnalyticsResource = { key:string; title:string; scope:string; status:'available'|'unavailable'|'error'; data:unknown; fetchedAt:string; reason?:string };
export const IG_ACCOUNT_METRICS='reach,views,accounts_engaged,total_interactions,comments,likes,saves,shares,replies,reposts,follows_and_unfollows,profile_links_taps';
export const FB_ACCOUNT_METRICS='page_media_view,page_views_total,page_post_engagements,page_video_views,page_video_view_time,page_follows,followers_gained,followers_lost';
export function analyticsRequests(platform:'instagram'|'facebook',accountId:string,since:string,until:string) {
 const account={accountId,platform};const range={since,until};const dates={fromDate:since,toDate:until};const dailyDates={fromDate:`${since}T00:00:00Z`,toDate:`${until}T23:59:59Z`};
 const list:Array<{key:string;title:string;scope:string;path:string;query:Record<string,string>}>=[
  {key:'account',title:'Account totals',scope:'Account-wide totals; separate from post lifetime totals.',path:`/analytics/${platform}/${platform==='instagram'?'account-insights':'page-insights'}`,query:{accountId,...range,metrics:platform==='instagram'?IG_ACCOUNT_METRICS:FB_ACCOUNT_METRICS,metricType:'total_value'}},
  {key:'daily_account',title:'Daily account metrics',scope:platform==='instagram'?'Daily unique account reach. Other Instagram account totals do not support daily series.':'Daily Page metrics; follower gains/losses are derived by Zernio from snapshots.',path:`/analytics/${platform}/${platform==='instagram'?'account-insights':'page-insights'}`,query:{accountId,...range,metrics:platform==='instagram'?'reach':FB_ACCOUNT_METRICS,metricType:'time_series'}},
  {key:'daily_received',title:'Engagement received each day',scope:'Daily increases, including engagement on older posts.',path:'/analytics/daily-metrics',query:{...account,...dailyDates,source:'all',attribution:'received'}},
  {key:'daily_published',title:'Lifetime totals by publish date',scope:'Lifetime post totals grouped by publication date; not engagement received that day.',path:'/analytics/daily-metrics',query:{...account,...dailyDates,source:'all',attribution:'publish'}},
  {key:'follower_stats',title:'Follower growth',scope:'Provider daily snapshots; counts are not live.',path:'/accounts/follower-stats',query:{accountIds:accountId,...dates,granularity:'daily'}},
  {key:'best_time',title:'Best posting times',scope:'Historical correlation, not guaranteed results. Day 0 is Monday; hours are UTC.',path:'/analytics/best-time',query:{...account,source:'all'}},
  {key:'content_decay',title:'Engagement over a post’s lifetime',scope:'Provider time buckets and sample sizes; not a forecast.',path:'/analytics/content-decay',query:{...account,source:'all'}},
  {key:'posting_frequency',title:'Posting frequency and engagement',scope:'Historical cadence correlation, not proof of causation.',path:'/analytics/posting-frequency',query:{...account,source:'all'}},
 ];
 if(platform==='facebook')list.push({key:'monetization',title:'Page monetization (raw provider amounts)',scope:'Approximate daily raw amounts, with original unit and currency. Zero does not establish enrollment. No conversion or Finance totals.',path:'/analytics/facebook/page-insights',query:{accountId,...range,metrics:'content_monetization_earnings,monetization_approximate_earnings',metricType:'total_value'}});
 if(platform==='instagram')list.push(
  {key:'follower_demographics',title:'Follower demographics',scope:'This month. Provider-returned counts; percentages cover returned categories only.',path:'/analytics/instagram/demographics',query:{accountId,metric:'follower_demographics',breakdown:'age,city,country,gender',timeframe:'this_month'}},
  {key:'engaged_demographics',title:'Engaged audience demographics',scope:'This month. People who engaged, a different population from followers.',path:'/analytics/instagram/demographics',query:{accountId,metric:'engaged_audience_demographics',breakdown:'age,city,country,gender',timeframe:'this_month'}},
  {key:'reach_by_surface',title:'Reach by content surface',scope:'Account reach split by media product type. Categories can overlap.',path:'/analytics/instagram/account-insights',query:{accountId,...range,metrics:'reach',metricType:'total_value',breakdown:'media_product_type'}},
 );
 return list;
}
/** Preserve metrics and their dimensions, including nulls. Strip transport URLs/secrets. */
export function safeAnalyticsData(value:unknown):unknown {
 if(Array.isArray(value))return value.map(safeAnalyticsData);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/(token|secret|authorization|password|url|thumbnail|avatar|picture)/i.test(key)).map(([key,item])=>[key,safeAnalyticsData(item)]));
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string')return /^https?:\/\//i.test(value)?null:value;
 return typeof value==='boolean'||value===null?value:null;
}
export function analyticsMetricLabel(key:string) {
 const names:Record<string,string>={igReelsAvgWatchTime:'Reel average watch time (ms)',igReelsVideoViewTotalTime:'Reel total watch time (ms)',videoDurationSeconds:'Video duration (seconds)',reelsSkipRate:'Reel skip rate (%, estimated)',engagementRate:'Engagement rate (%)',follows:'Follows attributed to this post',reposts:'Reposts (login-dependent availability)',avg_pct_of_final:'Average share of final engagement (%)',growthPercentage:'Growth (%)',day_of_week:'Weekday (0 = Monday)',hour:'Hour (UTC)',watch_time:'Watch time (provider units)',average_watch_time:'Average watch time (provider units)'};
 return names[key]??key.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ');
}
