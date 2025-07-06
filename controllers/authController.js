const User = require('../models/user.model');
const Tenant = require('../models/Tenant');
const Invite = require('../models/Invite'); // Needed for acceptInvite
const sendOtp = require('../utils/sendOTP');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createAuditLog } = require("../utils/createAuditLog");
const { sendTenantCreatedEmail } = require('../utils/sendTenantCreatedEmail');

// SEND OTP FOR SIGNUP
exports.sendOtpSignup = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ email });
    }

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    await sendOtp(email, otp);

    return res.status(200).json({ message: 'OTP sent to email' });

  } catch (err) {
    console.error('sendOtpSignup Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.verifyOtpSignup = async (req, res) => {
  try {
    const { email, otp, password, role, tenantName, tenantId } = req.body;

    if (!email || !otp || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const user = await User.findOne({ email });
    if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    let finalTenantId;

    if (role === 'admin') {
      if (!tenantName) {
        return res.status(400).json({ error: 'Tenant name is required for admin.' });
      }

      const existingTenant = await Tenant.findOne({ name: tenantName });
      if (existingTenant) {
        return res.status(400).json({ error: 'Tenant already exists.' });
      }

      const newTenant = await Tenant.create({
        name: tenantName,
        adminEmail: email,
      });

      finalTenantId = newTenant._id;
      await sendTenantCreatedEmail(email, finalTenantId);

    } else if (role === 'member') {
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID is required for member.' });
      }

      const existingTenant = await Tenant.findById(tenantId);
      if (!existingTenant) {
        return res.status(400).json({ error: 'Invalid tenant ID.' });
      }

      finalTenantId = tenantId;

    } else {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    user.passwordHash = await bcrypt.hash(password, 8);
    user.tenantId = finalTenantId;
    user.role = role;
    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;

    await user.save();

    const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const token = jwt.sign(tokenPayload, process.env.SECRET, {
      expiresIn: '2h',
    });

    return res.status(200).json({
      message: 'User registered successfully.',
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    });

  } catch (err) {
    console.error('verifyOtpSignup Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// SIGNIN (LOGIN)
exports.signin = async (req, res) => {
  try {
    const { email, password, tenantId } = req.body;

    if (!email || !password || !tenantId) {
      return res.status(400).json({ error: 'Email, password and tenantId required' });
    }

    const user = await User.findOne({ email, tenantId });
    if (!user || !user.isVerified) {
      return res.status(404).json({ error: 'User not found or not verified' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign(
      {
        _id: user._id,
        tenantId: user.tenantId,
        role: user.role
      },
      process.env.SECRET,
      { expiresIn: '2h' }
    );

    res.status(200).json({
      email: user.email,
      token,
      role: user.role
    });

  } catch (err) {
    console.error('signin Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ACCEPT INVITE
exports.acceptInvite = async (req, res) => {
  try {
    const { token, email, password } = req.body;

    if (!token || !email || !password) {
      return res.status(400).json({ error: 'Token, email, and password are required' });
    }

    const invite = await Invite.findOne({ token });

    if (!invite) {
      return res.status(400).json({ error: 'Invalid invite token' });
    }

    if (invite.used) {
      return res.status(400).json({ error: 'Invite has already been used' });
    }

    if (invite.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Invite has expired' });
    }

    if (invite.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ error: 'Email does not match the invite' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase(), tenantId: invite.tenantId });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists in this tenant' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      tenantId: invite.tenantId,
      role: invite.role || 'member',
      isVerified: true
    });

    invite.used = true;
    await invite.save();

    await createAuditLog({
      userId: newUser._id,
      tenantId: invite.tenantId,
      action: 'accept-invite',
      details: { email: newUser.email }
    });

    res.status(201).json({ message: 'User created successfully via invite' });

  } catch (err) {
    console.error('acceptInvite Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
