// Copies EXTERNAL_SUBMISSIONS from the primary Supabase project to a second one.
//
// Source: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (primary project — read only)
// Target: EXT_SUPABASE_URL + EXT_SUPABASE_SERVICE_ROLE_KEY  (second project — write)
//
// Run via: npm run seed-external-submissions  (from gwire/server/)
// Destructive: clears the target table before inserting — always reflects source exactly.

import { createClient } from '@supabase/supabase-js';

const TABLE = 'EXTERNAL_SUBMISSIONS';

// ── Source (primary project) ──────────────────────────────────────────────────

const SRC_URL = process.env.SUPABASE_URL;
const SRC_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SRC_URL || !SRC_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (source project).');
  process.exit(1);
}

// ── Target (second project) ───────────────────────────────────────────────────

const TGT_URL = process.env.EXT_SUPABASE_URL;
const TGT_KEY = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;

if (!TGT_URL || !TGT_KEY) {
  console.error('ERROR: EXT_SUPABASE_URL and EXT_SUPABASE_SERVICE_ROLE_KEY must be set (target project).');
  process.exit(1);
}

const src = createClient(SRC_URL, SRC_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tgt = createClient(TGT_URL, TGT_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Reading "${TABLE}" from source project...`);

  const { data, error: readError } = await src
    .from(TABLE)
    .select('*')
    .order('submission_id');

  if (readError) throw new Error(`Failed to read source: ${readError.message}`);
  if (!data || data.length === 0) {
    console.log('No rows found in source. Nothing to copy.');
    return;
  }

  console.log(`  ${data.length} rows fetched.\n`);
  console.log(`Clearing target table "${TABLE}"...`);

  const { error: deleteError } = await tgt
    .from(TABLE)
    .delete()
    .gte('submission_id', '');

  if (deleteError) throw new Error(`Failed to clear target: ${deleteError.message}`);
  console.log('  ✓ target cleared.\n');

  console.log(`Writing ${data.length} rows to target project...`);

  const { error: writeError } = await tgt
    .from(TABLE)
    .insert(data);

  if (writeError) throw new Error(`Failed to write to target: ${writeError.message}`);

  console.log(`  ✓ ${data.length} rows inserted into "${TABLE}".`);
}

main().catch((err: unknown) => {
  console.error('Copy failed:', err);
  process.exit(1);
});
