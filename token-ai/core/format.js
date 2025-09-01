// token-ai/core/format.js

/**
 * This file contains the format for the token-ai agent's analysis.
 * 
 * The ANALYSIS_SCHEMA is used to validate the agent's analysis.
 * The toMarkdown function converts the agent's analysis to a markdown string.
 * The extractWebSearchCitations function extracts the web search citations from the agent's analysis.
 */

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    tokenType: { type: 'string', enum: ['utility','meme','hybrid'] },
    branchScore: { type: 'integer', minimum: 0, maximum: 100 },
    branchWhy: { type: 'string' },
    communicationAnalysis: {
      type: 'object',
      properties: {
        strategy: { type: 'string' },
        tweetStyle: { type: 'string' },
        raidingBehavior: { type: 'string' },
        engagement: { type: 'string' },
        messaging: { type: 'string' },
      },
      required: ['strategy','tweetStyle','raidingBehavior','engagement','messaging'],
      additionalProperties: false
    },
    currentStatus: { type: 'string' },
    projectSummary: { type: 'string' },
    riskScore: { type: 'integer', minimum: 0, maximum: 10 },
    riskWhy: { type: 'string' },
    redFlags: { type: 'array', items: { type: 'string' } },
    greenFlags: { type: 'array', items: { type: 'string' } },
    explore: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    memeSignals: {
      type: 'object',
      properties: {
        narrativeHeat: { type: 'string' },
        momentumTrend: { type: 'string' },
        coordinationStyle: { type: 'string' },
        vibe: { type: 'string' },
        ctoStatus: { type: 'string' }
      },
      required: ['narrativeHeat','momentumTrend','coordinationStyle','vibe','ctoStatus'],
      additionalProperties: false
    },
    signalsSnapshot: {
      type: 'object',
      properties: {
        tweetStats: {
          type: 'object',
          properties: {
            posts: { type: 'integer', minimum: 0 },
            uniqueAuthors: { type: 'integer', minimum: 0 },
            repliesPerPost: { type: 'number' },
            retweetsPerPost: { type: 'number' },
            memberDelta: { type: 'integer' }
          },
          required: ['posts','uniqueAuthors','repliesPerPost','retweetsPerPost','memberDelta'],
          additionalProperties: false
        },
        priceStats: {
          type: 'object',
          properties: {
            maxRallyPct: { type: 'number' },
            maxDrawdownPct: { type: 'number' },
            peakVolWindows: { type: 'array', items: { type: 'string' } }
          },
          required: ['maxRallyPct','maxDrawdownPct','peakVolWindows'],
          additionalProperties: false
        },
        topTags: { type: 'array', items: { type: 'string' } }
      },
      required: ['tweetStats','priceStats','topTags'],
      additionalProperties: false
    },
    activityPriceTimeline: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          window: { type: 'string' },
          tweets: { type: 'string' },
          ohlcv: { type: 'string' },
          leadLag: { type: 'string' }
        },
        required: ['window','tweets','ohlcv','leadLag'],
        additionalProperties: false
      }
    },
    tweetEvidence: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'tokenType',
    'branchScore',
    'branchWhy',
    'communicationAnalysis',
    'currentStatus',
    'projectSummary',
    'riskScore',
    'riskWhy',
    'redFlags',
    'greenFlags',
    'explore',
    'summary',
    'memeSignals',
    'signalsSnapshot',
    'activityPriceTimeline',
    'tweetEvidence'
  ],
  additionalProperties: false
};

export function toMarkdown(analysis) {
  try {
    return [
      `# Token Analysis`,
      `- Token Type: ${analysis.tokenType ?? 'unknown'}`,
      `- Branch Score: ${analysis.branchScore ?? 'n/a'}/100`,
      `- Risk: ${analysis.riskScore ?? 'n/a'}/10`,
      analysis.projectSummary ? `\n## Summary\n${analysis.projectSummary}` : '',
      analysis.currentStatus ? `\n## Current Status\n${analysis.currentStatus}` : '',
      analysis.redFlags?.length ? `\n## Red Flags\n${analysis.redFlags.map(f=>`- ${f}`).join('\n')}` : '',
      analysis.greenFlags?.length ? `\n## Green Flags\n${analysis.greenFlags.map(f=>`- ${f}`).join('\n')}` : '',
      analysis.summary ? `\n## Assessment\n${analysis.summary}` : ''
    ].filter(Boolean).join('\n');
  } catch { return ''; }
}

export function extractWebSearchCitations(response) {
  try {
    const output = response?.output || [];
    let used = false;
    const citations = [];
    for (const item of output) {
      if (item.type === 'web_search_call') used = true;
      if (item.type === 'message' && Array.isArray(item.content)) {
        const textContent = item.content.find(c => c.type === 'output_text');
        const anns = textContent?.annotations || [];
        for (const ann of anns) {
          if (ann.type === 'url_citation') {
            citations.push({ url: ann.url, title: ann.title, startIndex: ann.start_index, endIndex: ann.end_index });
          }
        }
      }
    }
    return { used, citations };
  } catch { return { used: false, citations: [] }; }
}
