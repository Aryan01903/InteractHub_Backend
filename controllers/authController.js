const User=require('../models/user.model')
const sendOtp=require('../utils/sendOTP')
const jwt=require('jsonwebtoken')
const Tenant=require('../models/Tenant')
const {createAuditLog}=require("../utils/createAuditLog")

exports.sendOtpSignup=async(req,res)=>{
    const {email, tenantId}=req.body;
    const otp = Math.floor(100000+Math.random()*900000).toString();
    const otpExpires=new Date(Date.now()+5*60*1000) // Valid for 5 minutes

    let user=await User.findOne({email,tenantId})
    if(!user) user=new User({email, tenantId})
    user.otp=otp;
    user.otpExpires=otpExpires;

    await user.save();
    await sendOtp(email,otp);

    res.json({
        message : "OTP sent to email"
    })
}

exports.verifyOtpSignup=async(req,res)=>{
    const {email,otp,password,tenantName,tenantId,role}=req.body;
    const user=await User.findOne({email,tenantId})

    if(!user || user.otp!==otp || user.otpExpires<Date.now()){
        return res.json({
            error : "Invaild or expired OTP"
        })
    }

    // if admin, create new tenant
    if(role=='admin'){
        if(!tenantName){
            return res.status(400).json({
                error : "Tenant name required for admin"
            })
        }
        const existing = await Tenant.findOne({name : tenantName});
        if(existing){
            return res.status(400).json({
                error : "Tenant already exists"
            })
        }
        const newTenant=await Tenant.create({name : tenantName})
        finalTenantId=newTenant._id
    }

    const passwordHash=await bcrypt.hash(password,8);
    user.passwordHash=passwordHash
    user.isVerified=true
    user.tenantId=finalTenantId
    user.otp=null
    user.otpExpires=otpExpires
    user.role=role || 'member'

    await user.save();

    res.status(200).send({
        message : "User Registered"
    })
}

exports.signin=async(req,res)=>{
    const {email,password,tenantId}=req.body;
    const user=await User.findOne({email,tenantId})
    if(!user || !user.isVerified){
        return res.status(404).send({
            error : "User not found or not Verified"
        })
    }

    const isMatch=await bcrypt.compare(password,user.passwordHash)
    if(!isMatch){
        return res.status(401).send({
            error : "Invalid password"
        })
    }
    const token=jwt.sign({
        _id : user._id,
        tenantId : user.tenantId,
        role : user.role
    },process.env.Secret,{expiresIn : '2h'})
    res.status(200).json({
        email : user.email,
        token : token,
        role : user.role
    })
}

exports.acceptInvite = async (req, res) => {
  const { token, email, password } = req.body;

  if (!token || !email || !password) {
    return res.status(400).json({ error: 'Token, email, and password are required' });
  }

  try {
    // Find invite by token
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

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase(), tenantId: invite.tenantId });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists in this tenant' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      tenantId: invite.tenantId,
      role: invite.role || 'member',
      isVerified: true
    });

    //Mark invite as used
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
    res.status(500).json({ error: err.message });
  }
};