const nodemailer=require('nodemailer')
require('dotenv').config();

const transpoter=nodemailer.createTransport({
    service : 'gmail',
    auth : {
        user : process.env.MAIL_USER,
        pass : process.env.MAIL_PASS
    }
})

exports.sendInviteEmail=async(email,token,tenantId,tenantName)=>{
    const link = `${process.env.FRONTEND_URL}/acceptInvite?token=${token}`;

    try{
        await transpoter.sendMail({
        from : process.env.MAIL_USER,
        to : email,
        subject: 'You’re Invited to Join InteractHub!',
        text: `Hello,

        We are excited to invite you to join a tenant on InteractHub, your platform for seamless collaboration and management. 🎉

        Here’s what you need to know:

        - **Tenant ID:** ${tenantId}  
        - **Invite Link:** ${link}  
        - **Tenant Name:** ${tenantName} 
        - **Invitation Token:** ${token}

        This is your exclusive invite to join a community within InteractHub. The link above will give you access to the tenant and enable you to collaborate with others in the workspace.

        Please be aware that this invitation will expire in **24 hours**, so be sure to use it before then to join the team.

        If you experience any issues or need assistance with the sign-up process, our support team is always ready to help. Feel free to reach out to us if you have any questions or need clarification.

        We’re excited to have you join and can’t wait to see the great things we’ll accomplish together!

        Thanks for choosing InteractHub,  
        The InteractHub Team`

    })
    }catch(err){
        console.error("Error Occured ",err.message)
    }

}