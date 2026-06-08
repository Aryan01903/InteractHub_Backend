const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",

  port: 587,

  secure: false,

  requireTLS: true,

  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },

  tls: {
    rejectUnauthorized: false,
  },

  family: 4,
});

const verifyTransporter = async () => {
  try {
    await transporter.verify();

    console.log("Call Invitation SMTP Ready");
  } catch (err) {
    console.error("Call Invitation SMTP Error:", err);
  }
};
verifyTransporter();


/**
 * Send video invitation emails
 * @param {string[]} emails 
 * @param {string} roomId 
 * @param {string} senderName 
 * @param {Date} startTime 
 * @param {number} durationHours 
 * @param {string} tenantName 
 */
module.exports = async function sendInvitationEmails(emails, roomId, senderName, startTime, durationHours, tenantName) {
  try {
    const inviteLink = `${process.env.FRONTEND_URL}/video-conference/${roomId}`;
    const options = { dateStyle: 'medium', timeStyle: 'short' };
    const startStr = new Intl.DateTimeFormat('en-US', options).format(startTime);
    const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);
    const endStr = new Intl.DateTimeFormat('en-US', options).format(endTime);

    for (const email of emails) {
      await transporter.sendMail({
        from: `"InteractHub" <${process.env.MAIL_USER}>`,
        to: email,
        subject: `${senderName} has invited you to a video call on InteractHub`,
        html: `
          <!DOCTYPE html>
          <html>
            <body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 0;">
                <tr>
                  <td align="center">
                    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

                      <tr>
                        <td style="background: linear-gradient(135deg, #3AABB7 0%, #2e8992 100%); padding: 36px 40px; text-align:center;">
                          <h1 style="margin:0; color:#ffffff; font-size:26px; letter-spacing:1px;">InteractHub</h1>
                          <p style="margin:8px 0 0; color:#d0f0f3; font-size:14px;">Seamless Collaboration & Management</p>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding: 36px 40px;">
                          <p style="margin:0 0 16px; font-size:16px; color:#333;">Hi there 👋</p>
                          <p style="margin:0 0 24px; font-size:15px; color:#555; line-height:1.6;">
                            <strong style="color:#3AABB7;">${senderName}</strong> from <strong>${tenantName}</strong> has invited you to join a video conference on InteractHub. We'd love to see you there! 🎥
                          </p>

                          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fbfc; border-left: 4px solid #3AABB7; border-radius:6px; margin-bottom:28px;">
                            <tr>
                              <td style="padding: 16px 20px;">
                                <p style="margin:0 0 8px; font-size:13px; color:#888; text-transform:uppercase; letter-spacing:0.5px;">Meeting Details</p>
                                <p style="margin:4px 0; font-size:14px; color:#444;"><strong>Hosted by:</strong> ${senderName} · ${tenantName}</p>
                                <p style="margin:4px 0; font-size:14px; color:#444;"><strong>Starts:</strong> ${startStr}</p>
                                <p style="margin:4px 0; font-size:14px; color:#444;"><strong>Ends:</strong> ${endStr}</p>
                                <p style="margin:4px 0; font-size:14px; color:#444;"><strong>Duration:</strong> ${durationHours} hour${durationHours > 1 ? 's' : ''}</p>
                              </td>
                            </tr>
                          </table>

                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="center" style="padding-bottom:28px;">
                                <a href="${inviteLink}" style="display:inline-block; background: linear-gradient(135deg, #3AABB7, #2e8992); color:#ffffff; text-decoration:none; font-size:15px; font-weight:bold; padding:14px 36px; border-radius:50px; letter-spacing:0.5px;">
                                  Join Video Call →
                                </a>
                              </td>
                            </tr>
                          </table>

                          <p style="margin:0 0 8px; font-size:13px; color:#999; text-align:center;">Button not working? Copy and paste this link:</p>
                          <p style="margin:0 0 24px; font-size:12px; color:#3AABB7; text-align:center; word-break:break-all;">${inviteLink}</p>

                          <p style="margin:0; font-size:14px; color:#888; line-height:1.6;">
                            The link will be active for the duration of the meeting. If you have any questions, simply reply to this email.
                          </p>
                        </td>
                      </tr>

                      <tr>
                        <td style="background:#f9f9f9; padding:20px 40px; text-align:center; border-top:1px solid #eeeeee;">
                          <p style="margin:0; font-size:12px; color:#aaa;">© ${new Date().getFullYear()} InteractHub · All rights reserved</p>
                          <p style="margin:6px 0 0; font-size:12px; color:#aaa;">Made with ❤️ by the InteractHub Team</p>
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });
    }
  } catch (error) {
    console.error('Failed to send invitation emails:', error);
  }
};