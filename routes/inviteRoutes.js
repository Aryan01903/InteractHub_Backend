const express=require('express')
const router=express.Router()
const authMW=require("../middlewares/authMW")
const isAdmin=require('../middlewares/isAdminMW')
const {createInvite,resendInvite}=require("../controllers/inviteController")


router.post('/send',authMW,isAdmin,createInvite)
router.post('/resend',authMW,isAdmin,resendInvite)

module.exports=router;