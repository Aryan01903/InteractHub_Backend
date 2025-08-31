const videoRoom=require('../models/videoRoom')
const sendVideoCallInvitation=require('../utils/sendVideoCallInvitation')
require('dotenv').config();

const {uuidv4} = require('uuid')
//WebRTC Server Config
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    // Add TURN server credentials if needed
];
exports.createAndScheduleRoom = async(req,res)=>{
    if(!req.user || req.user.role!=='admin'){
        return res.status(403).json({message: "Only admins can create"})
    }

    const { tenantId, scheduledAt, emails, durationHours } = req.body; 
    const roomId=uuidv4();
    const isScheduled = scheduledAt && new Date(scheduledAt) > Date.now();
    const startTime = isScheduled ? new Date(scheduledAt) : new Date();
    const newRoom=new videoRoom({
        tenantId,
        roomId,
        createdBy: req.user._id,
        scheduledAt: isScheduled ? startTime : null,
        expiresAt: new Date(startTime.getTime()+6*60*60*1000)
    })

    await newRoom.save();

    if (emails?.length > 0) {
      await sendInvitationEmails(
        emails,
        roomId,
        req.user.name || 'Admin',
        startTime,
        durationHours,
        req.user.tenantName,
      );
    }

    res.status(201).json({
        message: isScheduled ? "Room scheduled successfully" : "Room created successfully",
        roomId,
        createdBy: req.user._id,
        scheduledAt: newRoom.scheduledAt,
        signalingData: {
            ice_servers: ICE_SERVERS
        },
        joinLink: `${process.env.FRONTEND_URL}/video-call/${roomId}`
    })
}
