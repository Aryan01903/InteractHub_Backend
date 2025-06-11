const express = require('express')
const app=express();
require('dotenv').config();
const mongoose=require('mongoose')


mongoose.connect(process.env.DB_URL)
.then(()=>{
    console.log("Successfully Connected to database")
}).catch((err)=>{
    console.log("Some error occured in Connecting to Database : ",err)
})





app.listen(process.env.PORT,()=>{
    console.log("Successfully connected to PORT : ",process.env.PORT)
})