import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql } from 'kysely'

// max 15 chars
export const shortname = 'memetics'

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid: string) => {
  console.log(`[${shortname}] Handler invoked. Params:`, params)
  try {
    let builder = ctx.db
      .selectFrom('post')
      .selectAll()
      // Match posts containing the word "memetics", case-insensitive
      .where(sql<string>`lower(post.text)`, 'like', '%memetics%')
      .orderBy('indexedAt', 'desc')
      .orderBy('cid', 'desc')
      .limit(params.limit)

    if (params.cursor) {
      console.log(`[${shortname}] Applying cursor:`, params.cursor)
      // Using a simple timestamp cursor for this example
      const indexedAt = new Date(parseInt(params.cursor, 10)).toISOString()
      // Select posts indexed *before* the cursor timestamp
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
      // Use the timestamp of the last post as the cursor
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
    // Re-throw the error to ensure it triggers a 500, 
    // but we should now see the log above.
    throw error 
  }
} 