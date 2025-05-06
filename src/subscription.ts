import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
// Define keywords directly to avoid import issues
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
].map(k => k.toLowerCase());

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)

    // This logs the text of every post off the firehose.
    // Just for fun :)
    // Delete before actually using
    for (const post of ops.posts.creates) {
      // console.log(post.record.text) // Commented out to reduce noise
    }

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    
    // Filter posts *before* mapping them for creation
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        // Pre-filter: Only keep posts matching keywords
        const postText = (create.record?.text?.toLowerCase() || '');
        if (!postText) return false; // Skip posts with no text
        const matchesKeywords = keywords.some(k => postText.includes(k));
        // if (matchesKeywords) { // Optional: Log matches for debugging
        //   console.log(`Matched Post: ${create.uri} for keywords`);
        // }
        return matchesKeywords;
      })
      .map((create) => {
        // map matched posts to a db row
        return {
          uri: create.uri,
          cid: create.cid,
          text: create.record.text as string, 
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      console.log(`[Subscription] Inserting ${postsToCreate.length} matched posts...`); // Add log
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
