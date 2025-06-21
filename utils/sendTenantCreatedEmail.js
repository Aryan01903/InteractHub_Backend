const nodemailer=require('nodemailer')
require('dotenv').config()
const transporter=nodemailer.createTransport({
    service : "gmail",
    auth : {
        user : process.env.MAIL_USER,
        pass : process.env.MAIL_PAAS
    }
})

exports.sendTenantCreatedEmail=async(email,tenantId)=>{
    await transporter.sendMail({
        from : process.env.MAIL_USER,
        to : email,
        subject : "Your CollabBoard Tenant is Ready",
        text : `Hi,\n\nYour tenant has been created successfully.\n\nTenant ID: ${tenantId}\n\nUse this Tenant ID when signing up as an admin.\n\nThanks!`
    })
}