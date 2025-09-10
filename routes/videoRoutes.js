const router=require('express').Router();

const {createAndScheduleRoom, getActiveVideoRooms} = require('../controllers/roomController')
const authMW = require('../middlewares/authMW')
const isAdmin=require('../middlewares/isAdminMW')


router.post('/create',authMW,isAdmin,createAndScheduleRoom)
router.post('/get-video',authMW,getActiveVideoRooms)

module.exports=router;