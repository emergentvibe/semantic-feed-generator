import { Kysely, Migration, MigrationProvider, sql } from 'kysely'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('text', 'text', (col) => col.notNull())
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .execute()
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
  },
}

// Add migration 002 to create post_fts table
migrations['002'] = {
  async up(db: Kysely<any>) {
    // Use 'any' for Kysely<any> or adjust based on actual DatabaseSchema import if needed elsewhere
    // Create the FTS5 virtual table, indexing the 'text' column from 'post'
    // 'content=post' links it to the actual post table
    // 'content_rowid=rowid' links the FTS rowid to the post table's rowid for efficient joins
    // We index 'uri' and 'text'
    // Use sql.raw for the CREATE VIRTUAL TABLE statement
    await sql.raw(
      `CREATE VIRTUAL TABLE post_fts USING fts5(
        uri, 
        text, 
        content='post', 
        content_rowid='rowid'
      )`
    ).execute(db)
    
    // Trigger to automatically update FTS table when 'post' table changes
    // Add row to post_fts when a post is inserted
    await sql.raw(
      `CREATE TRIGGER post_ai AFTER INSERT ON post BEGIN
        INSERT INTO post_fts (rowid, uri, text) VALUES (new.rowid, new.uri, new.text);
      END;`
    ).execute(db)

    // Delete row from post_fts when a post is deleted
    await sql.raw(
      `CREATE TRIGGER post_ad AFTER DELETE ON post BEGIN
        DELETE FROM post_fts WHERE rowid = old.rowid;
      END;`
    ).execute(db)

    // Update row in post_fts when a post is updated
    await sql.raw(
      `CREATE TRIGGER post_au AFTER UPDATE ON post BEGIN
        UPDATE post_fts SET uri = new.uri, text = new.text WHERE rowid = old.rowid;
      END;`
    ).execute(db)
  },
  async down(db: Kysely<any>) {
    // Drop triggers first using sql.raw
    await sql.raw(`DROP TRIGGER IF EXISTS post_ai;`).execute(db)
    await sql.raw(`DROP TRIGGER IF EXISTS post_ad;`).execute(db)
    await sql.raw(`DROP TRIGGER IF EXISTS post_au;`).execute(db)
    // Drop the FTS table using sql.raw
    await sql.raw(`DROP TABLE IF EXISTS post_fts;`).execute(db)
  }
}

migrations['003'] = {
  async up(db: Kysely<any>) {
    console.log('Running migration 003: Rebuild post_fts with unicode61 tokenizer');

    // 1. Drop existing FTS triggers (ignore errors if they don't exist)
    await sql`DROP TRIGGER IF EXISTS post_ai;`.execute(db);
    await sql`DROP TRIGGER IF EXISTS post_ad;`.execute(db);
    await sql`DROP TRIGGER IF EXISTS post_au;`.execute(db);
    console.log('Dropped existing FTS triggers (if any).');

    // 2. Drop existing FTS table (ignore errors if it doesn't exist)
    await sql`DROP TABLE IF EXISTS post_fts;`.execute(db);
    console.log('Dropped existing post_fts table (if any).');

    // 3. Create new post_fts table with explicit unicode61 tokenizer
    await sql.raw(
      `CREATE VIRTUAL TABLE post_fts USING fts5(
        uri, 
        text, 
        content='post', 
        content_rowid='rowid',
        tokenize = 'unicode61 remove_diacritics 0'
      )`
    ).execute(db);
    console.log('Created new post_fts table with unicode61 tokenizer.');

    // 4. Re-create FTS triggers
    await sql.raw(
      `CREATE TRIGGER post_ai AFTER INSERT ON post BEGIN
        INSERT INTO post_fts (rowid, uri, text) VALUES (new.rowid, new.uri, new.text);
      END;`
    ).execute(db);
    await sql.raw(
      `CREATE TRIGGER post_ad AFTER DELETE ON post BEGIN
        DELETE FROM post_fts WHERE rowid = old.rowid;
      END;`
    ).execute(db);
    await sql.raw(
      `CREATE TRIGGER post_au AFTER UPDATE ON post BEGIN
        UPDATE post_fts SET uri = new.uri, text = new.text WHERE rowid = old.rowid;
      END;`
    ).execute(db);
    console.log('Re-created FTS triggers.');
    console.log('Migration 003 UP complete.');
  },

  async down(db: Kysely<any>) {
    console.log('Running migration 003 DOWN: Reverting to default FTS tokenizer');

    // 1. Drop new FTS triggers from this migration
    await sql`DROP TRIGGER IF EXISTS post_ai;`.execute(db);
    await sql`DROP TRIGGER IF EXISTS post_ad;`.execute(db);
    await sql`DROP TRIGGER IF EXISTS post_au;`.execute(db);
    console.log('Dropped FTS triggers (from 003 definition).');

    // 2. Drop new FTS table from this migration
    await sql`DROP TABLE IF EXISTS post_fts;`.execute(db);
    console.log('Dropped post_fts table (from 003 definition).');

    // 3. Re-create post_fts table as defined in migration 002 (default tokenizer)
    await sql.raw(
      `CREATE VIRTUAL TABLE post_fts USING fts5(
        uri, 
        text, 
        content='post', 
        content_rowid='rowid'
      )`
    ).execute(db);
    console.log('Re-created post_fts table with default tokenizer (as in 002).');
    
    // 4. Re-create FTS triggers (same as in 002 and 003 up)
    await sql.raw(
      `CREATE TRIGGER post_ai AFTER INSERT ON post BEGIN
        INSERT INTO post_fts (rowid, uri, text) VALUES (new.rowid, new.uri, new.text);
      END;`
    ).execute(db);
    await sql.raw(
      `CREATE TRIGGER post_ad AFTER DELETE ON post BEGIN
        DELETE FROM post_fts WHERE rowid = old.rowid;
      END;`
    ).execute(db);
    await sql.raw(
      `CREATE TRIGGER post_au AFTER UPDATE ON post BEGIN
        UPDATE post_fts SET uri = new.uri, text = new.text WHERE rowid = old.rowid;
      END;`
    ).execute(db);
    console.log('Re-created FTS triggers for default FTS table.');
    console.log('Migration 003 DOWN complete.');
  }
}
