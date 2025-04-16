import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql, Expression, SqlBool } from 'kysely'
import { DatabaseSchema } from '../db/schema'

// max 15 chars
export const shortname = 'memetics'

// Lowercase keywords for case-insensitive matching
const cleanKeywords = [
  'memetics',
  'mimetics',
  'memetic', // Note: Adding 'meme' below with context check
  'memeplex',
  'meme theory',
  'unit of culture',
  'egregore',
  'cultural evolution',
  'gene-culture coevolution',
  'dual inheritance theory',
  'thought contagion',
  'memetic replicator',
  'cultural replicator',
  'cultural transmission',
  'viruses of the mind',
  'Universal Darwinism',
  'mneme',
  'mnemetics',
  'Susan Blackmore', // Specific enough
  'Darwin\'s Dangerous Idea',
  'The Meme Machine',
].map(k => k.toLowerCase())

const noisyKeywordsWithContext = {
  meme: [
    'theory', 'science', 'evolution', 'cultural', 'transmission', 
    'replicator', 'memetic', 'memetics', 'cognitive', 'philosophy', 
    'blackmore', 'dennett', 'dawkins'
  ],
  replicator: [
    'meme', 'memetic', 'cultural', 'social', 'information'
  ],
  dawkins: [
    'meme', 'memetic', 'memetics', 'cultural evolution', 'replicator'
  ],
  dennett: [
    'meme', 'memetic', 'memetics', 'cultural evolution', 'replicator'
  ],
  imitation: [
    'meme', 'memetic', 'cultural', 'transmission', 'evolution', 
    'replicator', 'social learning'
  ],
  'social learning': [
    'meme', 'memetic', 'cultural', 'transmission', 'evolution', 
    'replicator', 'imitation'
  ],
}

const lower = (col: string) => sql<string>`lower(${sql.ref(col)})`

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid: string) => {
  console.log(`[${shortname}] Handler invoked. Params:`, params)
  try {
    let builder = ctx.db
      .selectFrom('post')
      .selectAll()
      .where((eb) => {
        // Define the type for our conditions array
        const conditions: Expression<SqlBool>[] = []

        // Add simple checks for clean keywords
        for (const keyword of cleanKeywords) {
          conditions.push(eb(lower('post.text'), 'like', `%${keyword}%`))
        }

        // Add complex checks for noisy keywords with context
        for (const noisyKeyword in noisyKeywordsWithContext) {
          const contextKeywords = noisyKeywordsWithContext[noisyKeyword]
          
          const contextOrGroup = eb.or(
            contextKeywords.map(ctxKeyword => 
              eb(lower('post.text'), 'like', `%${ctxKeyword}%`)
            )
          )

          conditions.push(
            eb.and([
              eb(lower('post.text'), 'like', `%${noisyKeyword}%`),
              contextOrGroup
            ])
          )
        }

        // Combine all conditions with OR
        return eb.or(conditions)
      })
      .orderBy('indexedAt', 'desc')
      .orderBy('cid', 'desc')
      .limit(params.limit)

    if (params.cursor) {
      console.log(`[${shortname}] Applying cursor:`, params.cursor)
      const indexedAt = new Date(parseInt(params.cursor, 10)).toISOString()
      builder = builder.where('post.indexedAt', '<', indexedAt)
    }

    console.log(`[${shortname}] Executing query...`)
    const res = await builder.execute()
    console.log(`[${shortname}] Query returned ${res.length} results.`)

    const feed = res.map((row) => ({
      post: row.uri,
    }))

    let cursor: string | undefined
    const last = res.at(-1)
    if (last) {
      cursor = new Date(last.indexedAt).getTime().toString(10)
      console.log(`[${shortname}] Setting cursor to:`, cursor)
    } else {
      console.log(`[${shortname}] No last post found, cursor undefined.`)
    }

    console.log(`[${shortname}] Returning feed.`)    
    return {
      cursor,
      feed,
    }
  } catch (error) {
    console.error(`[${shortname}] Error in handler:`, error)
    throw error 
  }
} 