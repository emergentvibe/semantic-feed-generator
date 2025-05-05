import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql } from 'kysely'
import { DatabaseSchema, Post } from '../db/schema'

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

export const handler = async (ctx: AppContext, params: QueryParams, requesterDid: string) => {
  console.log(`[${shortname}] Handler invoked. Params:`, params)
  try {
    // Construct the FTS MATCH query string
    // Escape single quotes AND wrap each term/phrase in double quotes
    const ftsQuery = keywords
      .map(k => k.replace(/'/g, "''"))   // Escape single quotes for SQL
      .map(k => `"${k}"`)             // Wrap in double quotes for FTS5 phrase search
      .join(' OR ');
    
    console.log(`[${shortname}] FTS Query: ${ftsQuery}`)

    // Step 1: Find matching URIs using FTS via raw SQL execution
    console.log(`[${shortname}] Executing FTS query...`)
    // Embed the parameter directly; Kysely handles binding
    const ftsResult = await sql<{ uri: string }>` 
      SELECT uri FROM post_fts WHERE post_fts.text MATCH ${ftsQuery}
    `.execute(ctx.db);

    // Assuming execute() result has a 'rows' property
    const uris = ftsResult.rows.map(row => row.uri);
    console.log(`[${shortname}] FTS query returned ${uris.length} matching URIs.`)

    if (uris.length === 0) {
      console.log(`[${shortname}] No matching posts found.`)
      return { cursor: undefined, feed: [] };
    }

    // Step 2: Build the main query using the found URIs
    let builder = ctx.db
      .selectFrom('post')
      .selectAll('post')
      .where('post.uri', 'in', uris)
      .orderBy('post.indexedAt', 'desc')
      .orderBy('post.cid', 'desc')
      .limit(params.limit)

    if (params.cursor) {
      console.log(`[${shortname}] Applying cursor:`, params.cursor)
      const indexedAt = new Date(parseInt(params.cursor, 10)).toISOString()
      builder = builder.where('post.indexedAt', '<', indexedAt)
    }

    console.log(`[${shortname}] Executing final query for ${uris.length} potential posts...`)
    const res = await builder.execute()
    console.log(`[${shortname}] Final query returned ${res.length} results.`)

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
