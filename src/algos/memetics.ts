import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql, Expression, SqlBool } from 'kysely'
import { DatabaseSchema } from '../db/schema'

// max 15 chars
export const shortname = 'memetics'

// Drastically simplified keyword list for debugging hang issue
const keywords = [
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
  'mind virus',
  'universal darwinism'
].map(k => k.toLowerCase())

// Removed noisyKeywordsWithContext for now

const lower = (col: string) => sql<string>`lower(${sql.ref(col)})`

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid: string) => {
  console.log(`[${shortname}] Handler invoked. Params:`, params)
  try {
    let builder = ctx.db
      .selectFrom('post')
      .selectAll()
      // Query using the simplified keywords list
      .where((eb) => eb.or(
        keywords.map(keyword => 
          eb(lower('post.text'), 'like', `%${keyword}%`)
        )
      ))
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
