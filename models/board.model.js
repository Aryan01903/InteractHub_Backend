const mongoose=require('mongoose')

const boardSchema=new mongoose.Schema({
    name : String,
    tenantId : String,
    createdBy : String,
    canvasData : Object,
    updatedAt : {
        type : Date,
        default : Date.now
    }
})


module.exports=mongoose.model("Board",boardSchema)