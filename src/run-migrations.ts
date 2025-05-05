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
    console.log('(DIAG) Checking ORIGINAL post table count...');
    const postCountResult = await db.selectFrom('post').select(db.fn.count('uri').as('count')).executeTakeFirst();
    const postCount = Number(postCountResult?.count ?? -1); // Use -1 to indicate potential error during check
    console.log(`(DIAG) ORIGINAL post table count reported during migration: ${postCount} entries.`);
    // --- END DIAGNOSTIC ---

    // Check initial FTS count
    console.log('Checking INITIAL FTS table count...');
    const initialFtsCountResult = await db.selectFrom('post_fts' as any).select(db.fn.count('uri').as('count')).executeTakeFirst();
    const initialFtsCount = Number(initialFtsCountResult?.count ?? 0);
    console.log(`INITIAL FTS table count: ${initialFtsCount} entries.`);

    // --- MODIFIED POPULATION LOGIC ---
    // Always attempt to populate if the FTS table is empty, 
    // trusting that the main 'post' table *should* have data even if the count check failed.
    if (initialFtsCount === 0) {
      console.log('FTS table is empty. Attempting population from existing posts...');
      try {
        // Using raw SQL for the population as it's simpler here
        await sql`INSERT INTO post_fts (rowid, uri, text) SELECT rowid, uri, text FROM post;`.execute(db);
        console.log('FTS table population command executed.');
      } catch (popErr) {
        console.error('Error during FTS population attempt:', popErr);
        // Don't necessarily exit(1), allow diagnostics to run, but log the error
      }
    } else {
      console.log('FTS table already populated, skipping population attempt.');
    }
    // --- END MODIFIED POPULATION LOGIC ---

    // --- DIAGNOSTIC QUERIES START ---
    console.log('--- Running Diagnostic Queries ---');

    // Check post-population count
    console.log('Checking POST-POPULATION FTS table count...');
    const finalFtsCountResult = await db.selectFrom('post_fts' as any).select(db.fn.count('uri').as('count')).executeTakeFirst();
    const finalFtsCount = Number(finalFtsCountResult?.count ?? 0);
    console.log(`FINAL FTS table count: ${finalFtsCount} entries.`);

    // Test MATCH count for a few specific keywords individually
    const keywordsToTest = [
      'memetics', 
      'memetic',
      'meme theory', 
      'unit of culture',
      'cultural evolution'
    ]; // Define test keywords directly
    console.log(`Testing FTS MATCH for keywords: ${JSON.stringify(keywordsToTest)}`);
    
    let firstKeywordMatchCount = 0; // Keep track if the first one matched
    for (let i = 0; i < keywordsToTest.length; i++) {
      const keyword = keywordsToTest[i];
      const testQuery = `"${keyword.replace(/'/g, "''")}"`;
      try {
        const matchCountResult = await sql<{ count: number | string }>`SELECT count(*) as count FROM post_fts WHERE text MATCH ${testQuery}`.execute(db);
        const matchCount = Number(matchCountResult.rows?.[0]?.count ?? -1);
        console.log(`  -> MATCH count for ${testQuery}: ${matchCount} entries.`);
        if (i === 0) { // Check if it's the first keyword
          firstKeywordMatchCount = matchCount;
        }
      } catch (matchErr) {
         console.error(`  -> Error testing MATCH for ${testQuery}:`, matchErr);
      }
    }

    // Select some matching rows for the *first* keyword if it had matches
    const firstKeywordTestQuery = `"${keywordsToTest[0].replace(/'/g, "''")}"`;
    if (firstKeywordMatchCount > 0) {
      console.log(`Selecting sample rows matching ${firstKeywordTestQuery}...`);
      const sampleRowsResult = await sql<{ uri: string; text: string }>`
        SELECT uri, text FROM post_fts WHERE text MATCH ${firstKeywordTestQuery} LIMIT 3
      `.execute(db);
      console.log(`Sample matching rows: ${JSON.stringify(sampleRowsResult.rows, null, 2)}`);
    } else {
      console.log(`No rows found matching ${firstKeywordTestQuery}, skipping sample selection.`);
    }
    
    // Compare with LIKE on original table (optional, can be slow)
    // console.log(`Comparing with LIKE count for '%${testKeyword}%'...`);
    // const likeCountResult = await db.selectFrom('post').select(db.fn.count('uri').as('count')).where(sql`lower(text)`, 'like', `%${testKeyword}%`).executeTakeFirst();
    // const likeCount = Number(likeCountResult?.count ?? 0);
    // console.log(`LIKE count for '%${testKeyword}%': ${likeCount} entries.`);

    console.log('--- Diagnostic Queries End ---');
    // --- DIAGNOSTIC QUERIES END ---

    process.exit(0); // Success (even if population had error, log shows it)
  } catch (err) {
    console.error('Migration/Diagnostic failed:', err);
    process.exit(1); // Failure
  }
};

run(); 