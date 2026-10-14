/*
 * Copies the application data of one SATVEX stack into another stack's tables
 * (e.g. satvex_*_dev -> satvex_*_prod). READ-ONLY on the source.
 *
 *   node src/scripts/migrateStage.js --from dev --to prod --dry-run
 *   node src/scripts/migrateStage.js --from dev --to prod \
 *        --replace https://OLD-MEDIA.cloudfront.net=https://NEW-MEDIA.cloudfront.net
 *
 * Safe to run more than once: every item is written with the same primary key,
 * so a second run just brings the target up to date (use it for the final
 * "delta" copy right before switching traffic over).
 *
 * --replace old=new   (repeatable) rewrites that text inside every string
 *                     value, e.g. the media CDN domain stored in product
 *                     image/video URLs.
 * --include-sessions  also copy otp_codes + refresh_tokens (off by default:
 *                     they're short-lived and tied to the old API's cookies).
 */
const { BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../config/dynamo');
const { scanAll } = require('../utils/listQuery');

const DATA_TABLES = [
  'users',
  'addresses',
  'products',
  'settings',
  'coupons',
  'coupon_redemptions',
  'reviews',
  'orders',
  'shipment_jobs',
  'carts',
  'wishlists',
  'contacts',
];
const SESSION_TABLES = ['otp_codes', 'refresh_tokens'];

const tableName = (name, stage) => `satvex_${name}_${stage}`;

// Applies [from, to] text replacements to every string anywhere in `value`.
// Returns { value, count } so the report can say how many strings changed.
function deepReplace(value, replacements) {
  let count = 0;
  function walk(v) {
    if (typeof v === 'string') {
      let out = v;
      for (const [from, to] of replacements) {
        if (from && out.includes(from)) out = out.split(from).join(to);
      }
      if (out !== v) count += 1;
      return out;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[k] = walk(val);
      return o;
    }
    return v;
  }
  return { value: walk(value), count };
}

function parseArgs(argv) {
  const args = { replace: [], dryRun: false, includeSessions: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--from') args.from = argv[(i += 1)];
    else if (a === '--to') args.to = argv[(i += 1)];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--include-sessions') args.includeSessions = true;
    else if (a === '--replace') {
      const [from, ...rest] = String(argv[(i += 1)] || '').split('=');
      const to = rest.join('=');
      if (!from || !to) throw new Error('--replace needs old=new');
      args.replace.push([from, to]);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

// BatchWrite is capped at 25 items and may return UnprocessedItems (throttling)
// — retry those with a growing pause instead of silently dropping them.
async function batchPut(table, items) {
  for (let i = 0; i < items.length; i += 25) {
    let request = { [table]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) };
    let attempt = 0;
    while (request && Object.keys(request).length > 0) {
      const res = await docClient.send(new BatchWriteCommand({ RequestItems: request }));
      const left = res.UnprocessedItems && res.UnprocessedItems[table];
      if (!left || left.length === 0) break;
      attempt += 1;
      if (attempt > 8) throw new Error(`Gave up writing to ${table}: ${left.length} item(s) kept being throttled`);
      await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
      request = { [table]: left };
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.from || !args.to) throw new Error('Usage: --from <stage> --to <stage> [--dry-run] [--replace old=new]');
  if (args.from === args.to) throw new Error('--from and --to must differ.');
  if (args.to === 'dev') throw new Error('Refusing to write into the dev tables.');

  const names = [...DATA_TABLES, ...(args.includeSessions ? SESSION_TABLES : [])];
  console.log(`${args.dryRun ? 'DRY RUN — ' : ''}copying ${args.from} -> ${args.to} (${names.length} tables)`);
  if (args.replace.length) console.log(`text replacements: ${args.replace.map(([f, t]) => `${f} => ${t}`).join(' | ')}`);

  const summary = [];
  for (const name of names) {
    const src = tableName(name, args.from);
    const dst = tableName(name, args.to);
    const rows = await scanAll(docClient, src);
    let replaced = 0;
    const out = rows.map((row) => {
      const r = deepReplace(row, args.replace);
      replaced += r.count;
      return r.value;
    });
    if (!args.dryRun && out.length > 0) await batchPut(dst, out);
    summary.push({ table: name, read: rows.length, written: args.dryRun ? 0 : out.length, rewrittenStrings: replaced });
    console.log(`  ${name.padEnd(20)} read ${String(rows.length).padStart(4)}  ${args.dryRun ? 'would write' : 'wrote'} ${String(out.length).padStart(4)}  rewritten strings ${replaced}`);
  }

  if (!args.dryRun) {
    console.log('verifying target row counts…');
    let bad = 0;
    for (const name of names) {
      const dst = await scanAll(docClient, tableName(name, args.to));
      const s = summary.find((x) => x.table === name);
      const ok = dst.length >= s.read; // target may legitimately hold newer rows
      if (!ok) bad += 1;
      console.log(`  ${name.padEnd(20)} source ${String(s.read).padStart(4)}  target ${String(dst.length).padStart(4)}  ${ok ? 'OK' : 'MISSING ROWS'}`);
    }
    if (bad) process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`FAILED: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { deepReplace, parseArgs, DATA_TABLES, SESSION_TABLES, tableName };
