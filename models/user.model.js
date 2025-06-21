const mongoose=require("mongoose")


const userSchema=new mongoose.Schema({
    email : {
        type : String,
        lowercase : true,
        match: [/.+@.+\..+/, "Please enter a valid email address"],
        required : true,
        unique : true
    },
    passwordHash : {
        type : String,
        required : true,
    },
    tenantId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Tenant',
        required : true
    },
    role : {
        type : String,
        enum : ['admin', 'member'],
        default : 'member'
    },
    isVerified : {
        type : Boolean,
        default : false
    },
    otp : String,
    otpExpires : String,
    createdAt : {
        type : Date,
        default : Date.now
    }
})


module.exports=mongoose.model('User',userSchema)