const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const env = require('../config/env');
const logger = require('../utils/logger');

const client = new SNSClient({ region: env.awsRegion });

// IMPORTANT: this only covers the AWS/IAM side. SMS to Indian mobile
// numbers additionally requires DLT (Distributed Ledger Technology)
// registration with an Indian telecom DLT platform — a Principal Entity ID
// and an approved message template — per TRAI regulation. Without that,
// Indian carriers reject the message even though this call succeeds at the
// AWS API level. See template.yaml's SnsSenderId parameter.
async function sendSms({ phoneNumber, message }) {
  const command = new PublishCommand({
    PhoneNumber: `+91${phoneNumber}`,
    Message: message,
    MessageAttributes: {
      'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
      ...(env.sns.senderId
        ? { 'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: env.sns.senderId } }
        : {}),
    },
  });

  try {
    await client.send(command);
  } catch (err) {
    // Logged without the message body (OTP code) or full phone number —
    // last 4 digits are enough to correlate in logs without exposing the
    // number itself.
    logger.error('SMS send failed', { phoneSuffix: phoneNumber.slice(-4), message: err.message });
    throw err;
  }
}

module.exports = { sendSms };
