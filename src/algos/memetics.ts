import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql } from 'kysely'
import { DatabaseSchema, Post } from '../db/schema'

// max 15 chars
export const shortname = 'memetics'

// Drastically simplified keyword list for debugging hang issue
export const keywords = [
  'memetics',
  'memetic',
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
  'universal darwinism'
].map(k => k.toLowerCase())

// Removed noisyKeywordsWithContext for now

// Reinstate lower function
const lower = (col: string) => sql<string>`lower(${sql.ref(col)})`

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid: string) => {
  console.log(`[${shortname}] Handler invoked. Params:`, params)
  try {
    // Remove FTS query construction
    // const ftsQuery = ...
    // console.log(`[${shortname}] FTS Query: ${ftsQuery}`)

    // Remove Step 1 (FTS query)
    // console.log(`[${shortname}] Executing FTS query...`)
    // const ftsResult = ...
    // const uris = ...
    // console.log(`[${shortname}] FTS query returned ...`)
    // if (uris.length === 0) ...

    // Revert Step 2 to query 'post' directly with LIKE
    let builder = ctx.db
      .selectFrom('post')
      .selectAll('post')
      // Use LIKE with lower()
      .where((eb) => eb.or(
        keywords.map(keyword => 
          eb(lower('post.text'), 'like', `%${keyword}%`)
        )
      ))
      .orderBy('post.indexedAt', 'desc')
      .orderBy('post.cid', 'desc')
      .limit(params.limit)

    // Cursor logic remains the same, applied to the main query
    if (params.cursor) {
      console.log(`[${shortname}] Applying cursor:`, params.cursor)
      const indexedAt = new Date(parseInt(params.cursor, 10)).toISOString()
      builder = builder.where('post.indexedAt', '<', indexedAt)
    }

    console.log(`[${shortname}] Executing LIKE query...`) // Update log message
    const res = await builder.execute()
    console.log(`[${shortname}] Query returned ${res.length} results.`) // Update log message

    const feed = res.map((row) => ({
      post: row.uri,
    }))

    // Cursor setting logic remains the same
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
