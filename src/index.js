// require('dotenv').config({path: "./env"})
import dotenv from "dotenv"
import connectDB from "./db/index.js";
import {app} from "./app.js"

dotenv.config({
    path: './env'
})

connectDB()
.then(()=>{
    app.on("error",(error)=>{
        console.log("ERR: ", error);
        throw error
    })
    app.listen(process.env.PORT || 8000 , ()=>{
        console.log(`Server is running at port : ${process.env.PORT}`);
    })
})
.catch((err)=>{
    console.log("MONGO db connection failed !!! ", err);
})













/*
import express from "express"
const app = express()

//it is a good practise to put a semicolon before using iifi(immediately) other wise if the previous statement doesnot have the semicolon the compile may think that it is the part of the same line
;(async ()=>{
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        app.on("error" , (error)=>{
            console.log("ERROR : " , error);
        })

        app.listen(process.env.PORT,()=>{
            console.log(`App is listening on port ${process.env.PORT}`);
        })
    } catch (error) {
        console.error("ERROR: ", error)
        throw err
    }
})()
*/