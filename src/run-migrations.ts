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

    // Also populate the FTS table with existing data if it's empty
    console.log('Checking FTS table population...');
    const ftsCountResult = await db.selectFrom('post_fts' as any).select(db.fn.count('uri').as('count')).executeTakeFirst();
    const ftsCount = Number(ftsCountResult?.count ?? 0);
    console.log(`FTS table currently has ${ftsCount} entries.`);

    if (ftsCount === 0) {
      console.log('Populating FTS table from existing posts...');
      // Using raw SQL for the population as it's simpler here
      await sql`INSERT INTO post_fts (rowid, uri, text) SELECT rowid, uri, text FROM post;`.execute(db);
      console.log('FTS table populated.');
    } else {
      console.log('FTS table already populated, skipping initial population.');
    }

    process.exit(0); // Success
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1); // Failure
  }
};

run(); 