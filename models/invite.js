const mongoose=require('mongoose')

const inviteSchema=new mongoose.Schema({
    email : {
        type : String,
        required : true,
        match :  [/.+@.+\..+/, "Please enter a valid email address"]
    },
    tenantId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Tenant',
        required : true
    },
    invitedBy : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'User',
        required : true
    },
    role : {
        type : String,
        enum : ['admin','member'],
        default : 'member'
    },
    token : {
        type : String,
        required : true
    },
    used : {
        type : Boolean,
        default : false
    },
    createdAt : {
        type : Date,
        default : Date.now
    },
    expiresAt : {
        type : Date,
        required : true
    }
})


module.exports=new mongoose.model('Invite','inviteSchema')