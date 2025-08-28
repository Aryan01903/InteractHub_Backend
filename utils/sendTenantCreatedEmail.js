const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

exports.sendTenantCreatedEmail = async (email, tenantId) => {
  console.log('sendTenantCreatedEmail called with:', { email, tenantId });

  if (!email || !tenantId) {
    console.error('Missing args in sendTenantCreatedEmail:', { email, tenantId });
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: "Welcome to InteractHub - Your Tenant is Ready",
      text: `Hello,\n\nWe're excited to let you know that your tenant has been successfully created on InteractHub.\n\nTenant Details:\n\nTenant Name: ${tenantName}\nTenant ID: ${tenantId}\n\nYou can now start managing your tenant from your dashboard.\n\nIf you need any assistance or have questions, feel free to reach out to our support team.\n\nThanks for choosing InteractHub!\n\nBest regards,\nThe InteractHub Team`
    });
    console.log('Email sent:', info.response);
  } catch (err) {
    console.error('sendTenantCreatedEmail error:', err);
  }
};
