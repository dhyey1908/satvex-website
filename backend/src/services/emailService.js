const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const env = require('../config/env');
const logger = require('../utils/logger');

const client = new SESv2Client({ region: env.awsRegion });

async function sendPasswordResetEmail({ toEmail, resetLink }) {
  if (!env.ses.senderEmail) {
    logger.warn('SES_SENDER_EMAIL not configured; skipping password reset email send', { toEmail });
    return;
  }

  const command = new SendEmailCommand({
    FromEmailAddress: env.ses.senderEmail,
    Destination: { ToAddresses: [toEmail] },
    Content: {
      Simple: {
        Subject: { Data: 'Reset your Satvex password' },
        Body: {
          Html: {
            Data: `<p>We received a request to reset your Satvex password.</p>
                   <p><a href="${resetLink}">Click here to reset your password</a></p>
                   <p>This link expires in ${env.resetTokenExpiresMin} minutes. If you did not request this, you can ignore this email.</p>`,
          },
          Text: {
            Data: `Reset your Satvex password: ${resetLink} (expires in ${env.resetTokenExpiresMin} minutes)`,
          },
        },
      },
    },
  });

  await client.send(command);
}

module.exports = { sendPasswordResetEmail };
