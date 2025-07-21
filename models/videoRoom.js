const mongoose=require('mongoose')

const videoRoomSchema=new mongoose.Schema({
    tenantId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Tenant',
        required : true
    },
    boardId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Whiteboard',
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
    }
})