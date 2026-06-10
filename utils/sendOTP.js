const { Resend } = require("resend");
require("dotenv").config();

const resend = new Resend(process.env.RESEND_API_KEY);

console.log("Resend initialized");

const sendOtp = async (email, otp) => {
  console.log("Email:", email);
  console.log("OTP:", otp);

  try {
    const response = await resend.emails.send({
      from: "InteractHub <onboarding@resend.dev>",
      to: email,
      subject: "Your OTP for InteractHub Platform",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #f9f9f9; border-radius: 10px;">
          <h2 style="color: #3AABB7;">OTP Verification</h2>

          <p>Dear User,</p>

          <p>
            Your verification code for
            <strong>InteractHub</strong>
            is:
          </p>

          <h1
            style="
              font-size:32px;
              letter-spacing:5px;
              color:#3AABB7;
            "
          >
            ${otp}
          </h1>

          <p>
            This OTP is valid for
            <strong>5 minutes</strong>.
          </p>

          <p>
            If you didn't request this,
            please ignore this email.
          </p>

          <hr />

          <small>InteractHub Team</small>
        </div>
      `,
    });

    console.log("OTP sent successfully");
    console.log(response);

    return response;
  } catch (err) {
    console.error("Failed to send OTP:", err);
    throw err;
  }
};

module.exports = sendOtp;