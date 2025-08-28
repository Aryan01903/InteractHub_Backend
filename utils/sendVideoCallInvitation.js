const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/**
 * Send video invitation emails
 * @param {string[]} emails 
 * @param {string} roomId 
 * @param {string} senderName 
 * @param {Date} startTime 
 * @param {number} durationHours 
 * @param {string} tenantName 
 */
const sendInvitationEmails = async (emails, roomId, senderName, startTime, durationHours, tenantName) => {
  try {
    const inviteLink = `${process.env.FRONTEND_URL}/video-call/${roomId}`;

    const options = { dateStyle: 'medium', timeStyle: 'short' };
    const startStr = new Intl.DateTimeFormat('en-US', options).format(startTime);
    const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);
    const endStr = new Intl.DateTimeFormat('en-US', options).format(endTime);

    const fromDisplay = `${senderName} (${tenantName})`;

    for (const email of emails) {
      await transporter.sendMail({
        from: `"${fromDisplay}" <${process.env.MAIL_USER}>`,
        to: email,
        subject: 'Invitation to Join a Video Conference on InteractHub',
        html: `
          <p>Hi there,</p>
          <p><strong>${senderName}</strong> from <strong>${tenantName}</strong> has invited you to join an exciting video conference!</p>
          <p><strong>Meeting Details:</strong></p>
          <ul>
            <li><strong>When:</strong> ${startStr} to ${endStr} (Duration: ${durationHours} hour${durationHours > 1 ? 's' : ''})</li>
            <li><strong>Location:</strong> Online - <a href="${inviteLink}">Click here to join the call</a></li>
          </ul>
          <p>Please note that the link will expire after the meeting concludes, so be sure to join in time!</p>
          <p>If you have any questions or need help, feel free to reach out.</p>
          <p>Looking forward to seeing you there!</p>
          <p>Thanks and Best Regards,<br/>The InteractHub Team</p>
        `
    })

    }
  } catch (error) {
    console.error('Failed to send invitation emails:', error);
  }
};

module.exports = sendInvitationEmails;
