const express = require("express");
const http = require("http");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
app.use(express.static("public"));


app.get("/", (req, res) =>{
    res.sendFile(__dirname + "/public/index.html");
});

let connectedPeers = [];
let connectedPeersStrangers = [];

const io = require('socket.io')(server);

io.on("connection", (socket) => {
    //console.log('user connected to socket.IO server');
    //console.log(socket.id);
    connectedPeers.push(socket.id);
    console.log(connectedPeers);

    socket.on("pre-offer", (data) => {
        /*console.log("pre-offer-came");
        console.log(data);
        if use {} in filter or somewhere else you should use return or remove {}
        { peerSocketId === calleePersonalCode; } curly barace make problem we removed it is fixed*/
        const {calleePersonalCode, callType} = data;
        const connectedPeer = connectedPeers.find((peerSocketId) => peerSocketId === calleePersonalCode );
        if(connectedPeer)
        {
            const data = {
                callerSocketId: socket.id,
                callType,
            };
            io.to(calleePersonalCode).emit("pre-offer", data);
        }
        else
        {
            const data = {
                //for security we will not use/access to constants file
                preOfferAnswer: "CALLEE_NOT_FOUND",
            };
            io.to(socket.id).emit("pre-offer-answer", data);
        }
    });

    socket.on("pre-offer-answer", (data) => {
        /*console.log("pre offer answer came");
        console.log(data);*/

        const { callerSocketId } = data;

        const connectedPeer = connectedPeers.find(
            (peerSocketId) => peerSocketId === /*data.callerSocketId or */ callerSocketId,
        );
        if(connectedPeer)
        {
            io.to(data.callerSocketId).emit("pre-offer-answer", data);
        }
    });

    socket.on("webRTC-signaling", (data) => {
        const { connectedUserSocketId } = data;
        const connectedPeer = connectedPeers.find((peerSocketId) => peerSocketId === connectedUserSocketId);
        if(connectedPeer)
        {
            io.to(connectedUserSocketId).emit("webRTC-signaling", data);
        }
    });

    socket.on("user-hanged-up", (data) => {
        const {connectedUserSocketId } = data;

        const connectedPeer = connectedPeers.find( (peerSocketId) => peerSocketId === connectedUserSocketId);

        if(connectedPeer)
        {
            io.to(connectedUserSocketId).emit("user-hanged-up");
        }
    });

    socket.on("stranger-connection-status", (data) => {
        const { status } = data;
        if(status)
        {
            connectedPeersStrangers.push(socket.id);
        }
        else
        {
            const newConnectedPeersStrangers = connectedPeersStrangers.filter((peerSocketId) => peerSocketId !== socket.id);
            connectedPeersStrangers = newConnectedPeersStrangers;
        }
        console.log(connectedPeersStrangers);
    });

    socket.on("get-stranger-socket-id", () => {
        let randomStrangerSocketId;
        const filteredConnectedPeersStrangers = connectedPeersStrangers.filter((peerSocketId) => peerSocketId !== socket.id);
        if(filteredConnectedPeersStrangers.length > 0)
        {
            randomStrangerSocketId = filteredConnectedPeersStrangers[ Math.floor(Math.random() * filteredConnectedPeersStrangers.length) ];
    
        }
        else
        {
            randomStrangerSocketId = null;
        }
        const data = {
            randomStrangerSocketId,
        };
        io.to(socket.id).emit("stranger-socket-id", data);//make it in wss
    });

    socket.on("disconnect", () =>{
        console.log("user disconnected");
        const newConnectedPeers = connectedPeers.filter((peerSocketId) => peerSocketId !== socket.id );
        connectedPeers = newConnectedPeers;
        //console.log(connectedPeers);
        const newConnectedPeersStrangers = connectedPeersStrangers.filter((peerSocketId) => peerSocketId !== socket.id);
        connectedPeersStrangers = newConnectedPeersStrangers;
    });
});

server.listen(PORT, () => {
    console.log(`listening on ${PORT}`);
});