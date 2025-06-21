const jwt=require('jsonwebtoken')
require('dotenv').config()
module.exports=(req,res,next)=>{
    const token=req.headers.authorization?.split(" ")[1];
    if(!token){
        return res.status(401).json({
            error : "Missing Token"
        })
    }
    try{
        req.user=jwt.verify(token,process.env.Secret)
        next();
    }catch{
        res.status(401).json({
            error : "Invalid token"
        })
    }
}