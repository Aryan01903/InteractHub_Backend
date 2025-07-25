const mongoose=require('mongoose')
const videoRoomSchema=new mongoose.Schema({
    tenantId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Tenant',
        required : true
    },
    roomId : {
        type : String,
        unique : true,
        required : true
    },
    createdBy : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'User',
        required : true
    },
    endedAt : {
        type : Date
    },
    expiresAt : {
        type : Date,
        index : {
            expires : 21600,                // 6 hours in seconds
        }
    },
    scheduledAt : {
        type : Date,
        default : null
    }
})


module.exports = mongoose.model('VideoRoom', videoRoomSchema);
