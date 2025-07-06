const Invite=require('../models/Invite')
const crypto=require('crypto')
const {sendInviteEmail}=require('../utils/sendInviteEmail')
const {createAuditLog}=require("../utils/createAuditLog")

exports.createInvite=async(req,res)=>{
    const {email,role}=req.body;
    const {_id : invitedBy,tenantId,role:userRole}=req.user;

    try{

        if(userRole!=='admin'){
            return res.status(403).json({
                error : 'Only admins can send invites'
            })
        }

        const existingInvite=await Invite.findOne({email,tenantId,used:false})
        if(existingInvite){
            return res.status(400).json({
                error : 'Invite already sent to this email'
            })
        }

        const token=crypto.randomBytes(20).toString('hex');
        const expiresAt=new Date(Date.now()+24*60*60*1000) // vaild till 24 hours
        const invite=await Invite.create({
            email,
            tenantId,
            invitedBy,
            role : role||'member',
            token,
            expiresAt
        })
        await sendInviteEmail(email,token,tenantId);

        res.status(201).json({
            message : 'Invite sent successfully',
            inviteId : invite._id
        })
    }catch(err){
        res.status(500).json({
            error:err.message
        })
    }
}

exports.resendInvite = async (req, res) => {
  const { email } = req.body;
  const { tenantId, role: userRole } = req.user;

  try {
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can resend invites' });
    }

    // Find unused invite
    const invite = await Invite.findOne({ email, tenantId, used: false });

    if (!invite) {
      return res.status(404).json({ error: 'No active invite found for this user' });
    }

    // Update token and expiry
    invite.token = crypto.randomBytes(20).toString('hex');
    invite.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await invite.save();

    // Resend email
    await sendInviteEmail(email, invite.token, tenantId);

    await createAuditLog({
      userId: invitedBy,
      tenantId,
      action: 'create-invite',
      details: { invitedEmail: email, role }
    });

    res.status(200).json({ message: 'Invite resent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};