const nodemailer=require('nodemailer')
require('dotenv').config();

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

    console.log("Invite SMTP Ready");
  } catch (err) {
    console.error("Invite SMTP Error:", err);
  }
};
verifyTransporter();

const sendInviteEmail = async ( email, token, tenantId, tenantName ) => {
  const link = `${process.env.FRONTEND_URL}/accept-invite?token=${token}`;
  try {
    const info = await transporter.sendMail({
      from: `"InteractHub" <${process.env.MAIL_USER}>`,
      to: email,
      subject: `You're invited to join ${tenantName} on InteractHub`,
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
                          You've been invited to join <strong style="color:#3AABB7;">${tenantName}</strong> on InteractHub — your workspace for real-time collaboration, whiteboarding, and team management.
                        </p>
 
                        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fbfc; border-left: 4px solid #3AABB7; border-radius:6px; margin-bottom:28px;">
                          <tr>
                            <td style="padding: 16px 20px;">
                              <p style="margin:0 0 8px; font-size:13px; color:#888; text-transform:uppercase; letter-spacing:0.5px;">Invitation Details</p>
                              <p style="margin:4px 0; font-size:14px; color:#444;"><strong>Workspace:</strong> ${tenantName}</p>
                              <p style="margin:4px 0; font-size:14px; color:#444;"><strong>Tenant ID:</strong> ${tenantId}</p>
                              <p style="margin:4px 0; font-size:14px; color:#444;"><strong>Expires in:</strong> 24 hours</p>
                            </td>
                          </tr>
                        </table>
 
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" style="padding-bottom:28px;">
                              <a href="${link}" style="display:inline-block; background: linear-gradient(135deg, #3AABB7, #2e8992); color:#ffffff; text-decoration:none; font-size:15px; font-weight:bold; padding:14px 36px; border-radius:50px; letter-spacing:0.5px;">
                                Accept Invitation →
                              </a>
                            </td>
                          </tr>
                        </table>
 
                        <p style="margin:0 0 8px; font-size:13px; color:#999; text-align:center;">Button not working? Copy and paste this link:</p>
                        <p style="margin:0 0 24px; font-size:12px; color:#3AABB7; text-align:center; word-break:break-all;">${link}</p>
 
                        <p style="margin:0; font-size:14px; color:#888; line-height:1.6;">
                          If you didn't expect this invitation, you can safely ignore this email. Need help? Reply to this email and our team will assist you.
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

    console.log("OTP sent:", info.messageId);
    return info;

  } catch (err) {
    console.error(
      "Failed to send OTP:",
      err instanceof Error ? err.message : err
    );
    throw err;
  }
};

module.exports=sendInviteEmail;