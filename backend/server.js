
import express from "express"
import { createServer } from "http"

import { Server } from "socket.io"
import { YSocketIO } from "y-socket.io/dist/server"


const app = express();
const httpServer = createServer(app) 

//socketio server creation
const io = new Server(httpServer, {
    cors: {
        origin:"*",
        methods:["GET", "POST"]
    }
})

//connecting yjs with socketIO and initializ ing yjs
const ySocketIO = new YSocketIO(io)
ySocketIO.initialize()

app.get("/", (req,res) => {
    res.status(200).json({
        success:true,
        message:"Hello "
    })
})

app.get("/health", (req,res) => {
    res.status(200).json({
        success:true,
        message:"Ok"
    })
})


httpServer.listen(3000, () => {
    console.log("Sever is runnig at port 3000")
})