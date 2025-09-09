const { v4: uuidv4 } = require('uuid');
const videoRoom = require('../models/videoRoom');
const sendInvitationEmails = require('../utils/sendVideoCallInvitation')
require('dotenv').config();

// WebRTC Server Config
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
];

exports.createAndScheduleRoom = async (req, res) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create" });
    }

    const { tenantId, scheduledAt, emails, durationHours } = req.body; 
    const roomId = uuidv4();
    const isScheduled = scheduledAt && new Date(scheduledAt) > Date.now();
    const startTime = isScheduled ? new Date(scheduledAt) : new Date();
    
    // Creating a new room instance
    const newRoom = new videoRoom({
        tenantId,
        roomId,
        createdBy: req.user._id,
        scheduledAt: isScheduled ? startTime : null,
        expiresAt: new Date(startTime.getTime() + 6 * 60 * 60 * 1000)
    });

    try {
        // Save the room to the database
        await newRoom.save();

        // If there are emails, send invitations
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

        // Send response to the client
        res.status(201).json({
            message: isScheduled ? "Room scheduled successfully" : "Room created successfully",
            roomId,
            createdBy: req.user._id,
            scheduledAt: newRoom.scheduledAt,
            signalingData: {
                ice_servers: ICE_SERVERS
            },
            joinLink: `${process.env.FRONTEND_URL}/video-room/${roomId}`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong", error: error.message });
    }
};

exports.getActiveVideoRooms = async (req, res) => {
  try {
    const activeRooms = await videoRoom.find({
      tenantId: req.user.tenantId,
      expiresAt: { $gt: new Date() }
    }).sort({ scheduledAt: 1 });

    res.status(200).json({
      count: activeRooms.length,
      rooms: activeRooms
    });
  } catch (err) {
    console.error("Error fetching active video rooms:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

