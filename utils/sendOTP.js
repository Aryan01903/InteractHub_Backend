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

    console.log("OTP SMTP Ready");
  } catch (err) {
    console.error("OTP SMTP Error:", err);
  }
};
verifyTransporter();

const sendOtp = async ({ email, otp }) => {
  try {
    const info = await transporter.sendMail({
      from: `"InteractHub" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Your OTP for InteractHub Platform",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #f9f9f9; border-radius: 10px;">
          <h2 style="color: #3AABB7;">OTP Verification</h2>
          <p>Dear User,</p>
          <p>Your verification code for <strong>InteractHub</strong> is:</p>
          <h1 style="font-size: 32px; letter-spacing: 5px; color: #3AABB7;">${otp}</h1>
          <p>This OTP is valid for <strong>5 minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr>
          <small>InteractHub Team</small>
        </div>
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

module.exports=sendOtp;