const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuid } = require('uuid');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const client = new S3Client({ region: env.awsRegion });

const ALLOWED_FOLDERS = new Set(['products', 'variants', 'videos', 'branding', 'banners']);
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'video/mp4',
]);

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
}

async function createUploadUrl({ folder, filename, contentType }) {
  if (!ALLOWED_FOLDERS.has(folder)) {
    throw new AppError('Invalid upload folder.', 400, 'INVALID_FOLDER');
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new AppError('Unsupported file type.', 400, 'INVALID_CONTENT_TYPE');
  }
  if (!env.s3.mediaBucket) {
    throw new AppError('Media storage is not configured.', 500, 'MEDIA_NOT_CONFIGURED');
  }

  const key = `satvex/${folder}/${uuid()}-${sanitizeFilename(filename)}`;

  const command = new PutObjectCommand({
    Bucket: env.s3.mediaBucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  const publicUrl = env.s3.cloudFrontMediaUrl
    ? `${env.s3.cloudFrontMediaUrl.replace(/\/$/, '')}/${key}`
    : null;

  return { uploadUrl, publicUrl, key };
}

module.exports = { createUploadUrl };
