import path from 'path';
import { sql } from 'kysely'; // Import sql
import { createDb, migrateToLatest } from './db'; // Assuming db index exports these

const run = async () => {
  const dbLocationEnv = process.env.DATABASE_URL;
  if (!dbLocationEnv || !dbLocationEnv.startsWith('file://')) {
    console.error('DATABASE_URL environment variable is not set or invalid (must start with file://)');
    process.exit(1);
  }

  // Extract path from file:// URL
  const dbLocation = dbLocationEnv.substring('file://'.length);

  console.log(`Running migrations for database at: ${dbLocation}`);

  try {
    const db = createDb(dbLocation);
    await migrateToLatest(db);
    console.log('Migrations completed successfully.');

    // --- DIAGNOSTIC: Check original post table count ---
    console.log('Checking ORIGINAL post table count...');
    const postCountResult = await db.selectFrom('post').select(db.fn.count('uri').as('count')).executeTakeFirst();
    const postCount = Number(postCountResult?.count ?? 0);
    console.log(`ORIGINAL post table count: ${postCount} entries.`);
    // --- END DIAGNOSTIC ---

    // Check initial FTS count
    console.log('Checking INITIAL FTS table count...');
    const initialFtsCountResult = await db.selectFrom('post_fts' as any).select(db.fn.count('uri').as('count')).executeTakeFirst();
    const initialFtsCount = Number(initialFtsCountResult?.count ?? 0);
    console.log(`INITIAL FTS table count: ${initialFtsCount} entries.`);

    // Only attempt population if the post table has data AND FTS is empty
    if (postCount > 0 && initialFtsCount === 0) {
      console.log('Populating FTS table from existing posts...');
      await sql`INSERT INTO post_fts (rowid, uri, text) SELECT rowid, uri, text FROM post;`.execute(db);
      console.log('FTS table populated.');
    } else if (initialFtsCount > 0) {
      console.log('FTS table already populated, skipping initial population.');
    } else { // postCount === 0
      console.log('Original post table is empty, skipping FTS population.');
    }

    // --- DIAGNOSTIC QUERIES START ---
    console.log('--- Running Diagnostic Queries ---');

    // Check post-population count
    console.log('Checking POST-POPULATION FTS table count...');
    const finalFtsCountResult = await db.selectFrom('post_fts' as any).select(db.fn.count('uri').as('count')).executeTakeFirst();
    const finalFtsCount = Number(finalFtsCountResult?.count ?? 0);
    console.log(`FINAL FTS table count: ${finalFtsCount} entries.`);

    // Test a specific keyword match count
    const testKeyword = 'memetics'; // Choose a keyword you expect to find
    const testQuery = `"${testKeyword.replace(/'/g, "''")}"`;
    console.log(`Testing FTS MATCH count for keyword: ${testQuery}`);
    const matchCountResult = await sql<{ count: number | string }>`SELECT count(*) as count FROM post_fts WHERE text MATCH ${testQuery}`.execute(db);
    console.log(`MATCH count result: ${JSON.stringify(matchCountResult.rows)}`); // Log the raw result
    const matchCount = Number(matchCountResult.rows?.[0]?.count ?? 0);
    console.log(`MATCH count for ${testQuery}: ${matchCount} entries.`);

    // Select some matching rows (if any)
    if (matchCount > 0) {
      console.log(`Selecting sample rows matching ${testQuery}...`);
      const sampleRowsResult = await sql<{ uri: string; text: string }>`
        SELECT uri, text FROM post_fts WHERE text MATCH ${testQuery} LIMIT 5
      `.execute(db);
      console.log(`Sample matching rows: ${JSON.stringify(sampleRowsResult.rows, null, 2)}`);
    } else {
      console.log(`No rows found matching ${testQuery}, skipping sample selection.`);
    }
    
    // Compare with LIKE on original table (optional, can be slow)
    // console.log(`Comparing with LIKE count for '%${testKeyword}%'...`);
    // const likeCountResult = await db.selectFrom('post').select(db.fn.count('uri').as('count')).where(sql`lower(text)`, 'like', `%${testKeyword}%`).executeTakeFirst();
    // const likeCount = Number(likeCountResult?.count ?? 0);
    // console.log(`LIKE count for '%${testKeyword}%': ${likeCount} entries.`);

    console.log('--- Diagnostic Queries End ---');
    // --- DIAGNOSTIC QUERIES END ---

    process.exit(0); // Success
  } catch (err) {
    console.error('Migration/Diagnostic failed:', err);
    process.exit(1); // Failure
  }
};

run(); 