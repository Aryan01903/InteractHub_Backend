const nodemailer=require('nodemailer')
require('dotenv').config();

const transpoter=nodemailer.createTransport({
    service : 'gmail',
    auth : {
        user : process.env.MAIL_USER,
        pass : process.env.MAIL_PASS
    }
})

exports.sendInviteEmail=async(email,token,tenantId)=>{
    const link = `https://yourapp.com/signup?token=${token}&tenantId=${tenantId}`;

    await transpoter.sendMail({
        from : process.env.MAIL_USER,
        to : email,
        subject : 'You are invited to join CollabBoard',
        text : `You've been invited to join a tenant on CollabBoard.\n\nTenant ID: ${tenantId}\nInvite Link: ${link}\n\nThis invite will expire in 24 hours.`
    })

}