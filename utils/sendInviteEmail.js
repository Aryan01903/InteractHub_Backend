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

    try{
        await transpoter.sendMail({
        from : process.env.MAIL_USER,
        to : email,
        subject : 'You are invited to join BoardStack',
        text : `You've been invited to join a tenant on BoardStack.\n\nTenant ID: ${tenantId}\nInvite Link: ${link}\n\nThis invite will expire in 24 hours.\n\nThanks,\nBoardStack Team`
        })
    }catch(err){
        console.error("Error Occured ",err.message)
    }

}