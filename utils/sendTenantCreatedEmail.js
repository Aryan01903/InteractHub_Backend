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
      subject: "Your BoardStack Tenant is Ready",
      text: `Hi,\n\nYour tenant has been created successfully.\nTenant ID: ${tenantId}\n\nThanks,\nBoardStack Team`
    });

    console.log('Email sent:', info.response);
  } catch (err) {
    console.error('sendTenantCreatedEmail error:', err);
  }
};
