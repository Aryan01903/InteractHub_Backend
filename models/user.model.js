const mongoose=require("mongoose")


const userSchema=new mongoose.Schema({
    name : {
        type : String,
        required : true
    },
    email : {
        type : String,
        lowercase : true,
        match: [/.+@.+\..+/, "Please enter a valid email address"],
        required : true,
        unique : true
    },
    password : {
        type : String,
        required : true,
        select : false          // ensures no leakage of password
    },
    tenantId : {
        type : String,
        required : true
    },
    Verified : {
        type : Boolean,
        default : false
    }
}, { timestamps : true, versionKey : false})


module.exports=mongoose.model('User',userSchema)