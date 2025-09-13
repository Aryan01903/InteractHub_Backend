const nodemailer=require('nodemailer')
require('dotenv').config();

const transpoter=nodemailer.createTransport({
    service : 'gmail',
    auth : {
        user : process.env.MAIL_USER,
        pass : process.env.MAIL_PASS
    }
})

module.exports=async function sendInviteEmail(email,token,tenantId,tenantName){
    const link = `${process.env.FRONTEND_URL}/acceptInvite?token=${token}`;

    try{
        await transpoter.sendMail({
        from : process.env.MAIL_USER,
        to : email,
        subject: 'You’re Invited to Join InteractHub!',
        text: `Dear User,\nWe are excited to invite you to join a tenant on InteractHub, your platform for seamless collaboration and management. 🎉\n\nHere’s what you need to know:\n- **Tenant ID:** ${tenantId}\n- **Invite Link:** ${link}\n- **Tenant Name:** ${tenantName}\n- **Invitation Token:** ${token}\n\nThis is your exclusive invite to join a community within InteractHub. The link above will give you access to the tenant and enable you to collaborate with others in the workspace.\n\nPlease be aware that this invitation will expire in **24 hours**, so be sure to use it before then to join the team.\n\nIf you experience any issues or need assistance with the sign-up process, our support team is always ready to help. Feel free to reach out to us if you have any questions or need clarification.\n\nWe’re excited to have you join and can’t wait to see the great things we’ll accomplish together!\n\nThanks for choosing InteractHub,\nThe InteractHub Team`
    })
    }catch(err){
        console.error("Error Occured ",err.message)
    }

}