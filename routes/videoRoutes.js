const router=require('express').Router();

const {createAndScheduleRoom} = require('../controllers/roomController')
const authMW = require('../middlewares/authMW')
const isAdmin=require('../middlewares/isAdminMW')


router.post('/create',authMW,isAdmin,createAndScheduleRoom)

module.exports=router;