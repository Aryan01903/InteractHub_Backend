const User = require('../models/user.model');
const Tenant = require('../models/Tenant');
const Invite = require('../models/invite'); // for sendInvite 
const sendOtp = require('../utils/sendOTP');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendTenantCreatedEmail } = require('../utils/sendTenantCreatedEmail');
const {sendInviteEmail} = require('../utils/sendInviteEmail')
const crypto = require('crypto');
const redis=require('redis')

const redisClient=redis.createClient();

// SEND OTP FOR SIGNUP
exports.sendOtpSignup = async (req, res) => {
  try {
    const { name, email, password, role, tenantName, tenantId } = req.body;

    // Base required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "Name, email, password, and role are required",
      });
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=<>?{}[\]~])[A-Za-z\d!@#$%^&*()_\-+=<>?{}[\]~]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long and include at least one uppercase letter, one number, and one special character.",
      });
    }

    // Role-specific required fields
    if (role === 'admin' && !tenantName) {
      return res.status(400).json({
        message: "Tenant name is required for admin",
      });
    }

    if (role === 'member' && !tenantId) {
      return res.status(400).json({
        message: "Tenant ID is required for member",
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      console.log("User found:", user);

      // Log the current date and otpExpires for comparison
      console.log("Current Date: ", new Date());
      console.log("OTP Expires At: ", user.otpExpires);

      // Parse the otpExpires to ensure it's a Date object
      const otpExpiryDate = new Date(user.otpExpires);

      // If the user is unverified and OTP has expired, delete the user
      if (!user.isVerified && new Date() > otpExpiryDate) {
        console.log("Deleting unverified user", email);
        
        // Delete the user based on email
        const deleteResult = await User.deleteOne({ email });
        console.log("Delete result:", deleteResult); // Check if deletion was successful

        // Re-query after deletion to confirm the user was deleted
        user = await User.findOne({ email });
        if (!user) {
          console.log("User deleted successfully, no user found.");
        } else {
          console.log("User still found after deletion", user);
        }
      }

      // If the user still exists or is already verified
      if (user) {
        console.log("User with this email already present");
        return res.status(400).json({
          message: "User present with this email",
        });
      }
    }

    // Determine tenant based on role
    let tenant;
    if (role === 'admin') {
      tenant = tenantName;
    } else if (role === 'member') {
      tenant = tenantId;
    } else {
      return res.status(400).json({
        message: "Invalid role",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Send OTP via email (the sendOtp function should handle the actual sending)
    await sendOtp(email, otp);

    // Save the new user with OTP
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      tenantName: tenantName || undefined,
      tenantId: tenantId || undefined,
      otp,
      otpExpires,
    });

    await newUser.save();

    return res.status(200).json({
      message: "OTP sent successfully to your email",
      userId: newUser._id,
    });

  } catch (error) {
    console.log("Some error occurred :- ", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};



exports.verifyOtp=async(req,res)=>{
  const { email, otp, tenantName, role}=req.body;
  if(!email || !otp ){
    return res.status(400).json({
      message: "All Fields are Required"
    })
  }

  const user=await User.findOne({email})
  if(!user){
    return res.status(400).json({
      message: "User not found with this Email"
    })
  }

  // check otp match
  if(user.otp.toString() !== otp.toString()){
    return res.status(400).json({
      message: "Invalid OTP"
    });
  }

  // check for otp expiration
  if(user.otpExpires<new Date()){
    return res.status(400).json({
      message: "OTP is Expired"
    })
  }

  // Mark User Verified
  user.isVerified=true;
  user.otp=undefined;
  user.otpExpires=undefined;

  // if admin, create Tenant 
  if(user.role=='admin'){
    if(!tenantName){
      return res.status(400).json({
        message: 'tenantName is required to create tenantId'
      })
    }
    const tenantExists=await Tenant.findOne({name: tenantName})
    if(tenantExists){
      return res.status(400).json({
        message: "tenantName already exists"
      })
    }
    const tenant= await Tenant.create({name:tenantName, adminEmail:email})
    await sendTenantCreatedEmail(email,tenant._id)
    user.tenantId=tenant._id
  }

  await user.save()
  const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const token = jwt.sign(tokenPayload, process.env.SECRET, {
      expiresIn: '1d',
    });

  return res.status(200).json({
    message: "User Registered Successfully",
    token,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    },
  })


}

// SIGNIN (LOGIN)
exports.signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const emailNormalized = email.trim().toLowerCase();
    const user = await User.findOne({ email: emailNormalized });

    if (!user || !user.isVerified) {
      return res.status(404).json({ error: 'User not found or not verified' });
    }

    if (!user.password) {
      return res.status(400).json({ error: 'Password not set for this user' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign(
      {
        _id: user._id,
        tenantId: user.tenantId,
        role: user.role,
      },
      process.env.SECRET,
      { expiresIn: '2h' }
    );

    res.status(200).json({
      email: user.email,
      token,
      role: user.role,
      tenantId: user.tenantId,
    });

  } catch (err) {
    console.error('signin Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin-only: Send invite to a new member
exports.sendInvite = async (req, res) => {
  try {
    const currentUser = req.user;

    // Check admin privilege
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can send invites' });
    }

    const { email, role = 'member' } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const now=new Date();
    // Check for existing unused invite
    const existingInvite = await Invite.findOne({
      email: normalizedEmail,
      tenantId: currentUser.tenantId,
      expiresAt: { $gt: now },
      used: false
    });

    if (existingInvite) {
      return res.status(400).json({ message: 'Invite already sent to this email' });
    }

    // Generate secure token
    const token = crypto.randomBytes(20).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const invite = await Invite.create({
      email: normalizedEmail,
      token,
      tenantId: currentUser.tenantId,
      role,
      expiresAt,
      invitedBy: currentUser._id,
    });

    await sendInviteEmail(normalizedEmail, token, currentUser.tenantId);

    return res.status(200).json({ message: 'Invite sent successfully', inviteToken: token });

  } catch (error) {
    console.error('sendInvite Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.acceptInvite = async (req, res) => {
  try {
    const { name, token, email, password } = req.body;

    if (!name || !token || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const invite = await Invite.findOne({ token });

    if (!invite) {
      return res.status(400).json({ error: 'Invalid or missing invite token' });
    }

    // Check if invite is already used or expired
    if (invite.used) {
      return res.status(400).json({ error: 'Invite has already been used' });
    }

    if (invite.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Invite has expired' });
    }

    if (invite.email.toLowerCase() !== normalizedEmail) {
      return res.status(400).json({ error: 'Email does not match the invite' });
    }

    // Check if user already exists in this tenant
    const existingUser = await User.findOne({
      email: normalizedEmail,
      tenantId: invite.tenantId
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists in this tenant' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new user
    const newUser = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      tenantId: invite.tenantId,
      role: invite.role || 'member',
      isVerified: true
    });

    // Mark invite as used
    invite.used = true;
    await invite.save();

    return res.status(201).json({
      message: 'User created successfully via invite',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        tenantId: newUser.tenantId,
        role: newUser.role,
      }
    });

  } catch (err) {
    console.error('acceptInvite Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


exports.getAllMembers = async (req, res) => {
  try {
    const currentUserRole = req.user?.role;

    const members = await User.find({ role: 'member', tenantId: req.user.tenantId});

    if (members.length === 0) {
      return res.status(404).json({ message: 'No members found' });
    }

    const result = members.map((member) => {
      if (currentUserRole === 'admin') {
        return {
          name: member.name,
          email: member.email,
          joinedIn: member.createdAt?.toISOString() || 'Unknown',
        };
      } else {
        return { name: member.name };
      }
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Internal Server Error',
      error,
    });
  }
};

exports.deleteMember = async (req, res) => {
  try {
    const currentUserRole = req.user?.role;
    const tenantId = req.user?.tenantId;

    if (currentUserRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admins only.' });
    }

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID not found in user context' });
    }

    const { name, email } = req.body;

    if (!name && !email) {
      return res.status(400).json({ message: 'Name or email is required to identify the member' });
    }

    const query = { role: 'member', tenantId };

    if (name) query.name = name.trim();
    if (email) query.email = email.toLowerCase().trim();

    const member = await User.findOne(query);

    if (!member) {
      return res.status(404).json({ message: 'Member not found with the provided name or email in your tenant' });
    }

    await User.deleteOne({ _id: member._id });

    return res.status(200).json({
      message: 'Member deleted successfully',
      deletedMember: { name: member.name, email: member.email },
    });

  } catch (error) {
    console.error('deleteMember Error:', error);
    return res.status(500).json({
      message: 'Internal Server Error',
      error,
    });
  }
};


exports.userLogout = async (req,res)=>{
  try {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
      return res.status(400).json({ message: 'No token provided' });
    }

    await redisClient.sadd('blacklist', token);
    redisClient.expire('blacklist', 3600);

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during logout' });
  }
}
