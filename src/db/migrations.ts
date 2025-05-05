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
