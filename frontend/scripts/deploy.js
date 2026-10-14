/*
 * Builds the frontend against the deployed API and syncs it to S3 + CloudFront.
 * Reads frontend/deploy.config.json (gitignored — copy deploy.config.example.json
 * and fill in your real values). A plain Node script so it runs identically
 * from PowerShell, Bash, or cmd — no shell-specific env var syntax needed.
 *
 * Usage: npm run deploy
 */
import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
// DEPLOY_CONFIG=deploy.config.prod.json npm run deploy  -> deploy to another stack.
const configPath = path.join(root, process.env.DEPLOY_CONFIG || 'deploy.config.json');

// Windows installers (winget/MSI) update the persistent PATH, but a terminal
// that was already open won't see it until restarted. Rather than make that
// the user's problem, fall back to the AWS CLI's default install location.
function resolveAwsCommand() {
  const probe = spawnSync('aws', ['--version'], { shell: true, stdio: 'ignore' });
  if (probe.status === 0) return 'aws';

  const fallback = 'C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe';
  if (existsSync(fallback)) return `"${fallback}"`;

  console.error(
    "Can't find the AWS CLI (`aws`) on PATH or at its default install location.\n" +
      'Install it (winget install -e --id Amazon.AWSCLI) or restart your terminal if you just installed it.'
  );
  process.exit(1);
}

if (!existsSync(configPath)) {
  console.error(
    'Missing frontend/deploy.config.json.\n' +
      'Copy deploy.config.example.json to deploy.config.json and fill in your real values.'
  );
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const required = ['awsProfile', 'awsRegion', 'apiUrl', 'siteUrl', 's3Bucket', 'cloudfrontDistributionId'];
const missing = required.filter((key) => !config[key] || config[key].includes('REPLACE_ME'));
if (missing.length > 0) {
  console.error(`deploy.config.json is missing/unfilled values for: ${missing.join(', ')}`);
  process.exit(1);
}

function run(command, args, extraEnv) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`\nCommand failed: ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

console.log('Building frontend against:', config.apiUrl);
run('npm', ['run', 'build'], {
  VITE_API_URL: config.apiUrl,
  SITE_URL: config.siteUrl,
});

const awsCmd = resolveAwsCommand();

console.log('\nSyncing to S3:', config.s3Bucket);
run(awsCmd, [
  's3',
  'sync',
  'dist/',
  `s3://${config.s3Bucket}`,
  '--delete',
  '--profile',
  config.awsProfile,
  '--region',
  config.awsRegion,
]);

console.log('\nInvalidating CloudFront:', config.cloudfrontDistributionId);
run(awsCmd, [
  'cloudfront',
  'create-invalidation',
  '--distribution-id',
  config.cloudfrontDistributionId,
  '--paths',
  '/*',
  '--profile',
  config.awsProfile,
]);

console.log(`\nDeployed: ${config.siteUrl}`);
