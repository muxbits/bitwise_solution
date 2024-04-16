import * as wss from "./wss.js";
import * as constants from "./constants.js";
import * as ui from "./ui.js";
import * as store from "./store.js";
/*import { close } from "inspector";*/

let connectedUserDetails;
let peerConnection;
let dataChannel;

const defaultConstraints = {
    audio: true,
    video: true,
};

const configuration = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:13902",
        },
    ],
};

export const getLocalPreview = () => {
    navigator.mediaDevices
    .getUserMedia(defaultConstraints)
    .then((stream) => {
        ui.updateLocalVideo(stream);
        ui.showVideoCallButtons();
        store.setCallState(constants.callState.CALL_AVAILABLE);
        store.setLocalStream(stream);
    }).catch((err) => {
        console.log("Error Occured When Trying To Get An Access To Camera");
        console.log(err);
    });
};

const createPeerConnection = () => {

    peerConnection = new RTCPeerConnection(configuration);

    dataChannel = peerConnection.createDataChannel("chat");
    peerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        dataChannel.onopen = () => {
            console.log("Peer connection Is Ready To Receive Data Channel Messages");
        };
        dataChannel.onmessage = (event) => {
            console.log("Message Came From Data Channel");
            const message = JSON.parse(event.data);
            ui.appendMessage(message);
            console.log(message);
        };
    };

    peerConnection.onicecandidate = (event) => {
        console.log("getting ice candidates from stun server");
        if(event.candidate)
        {
            //send our ice candidates to other peer
            wss.sendDataUsingWebRTCSignaling({
                connectedUserSocketId: connectedUserDetails.socketId,
                type: constants.webRTCSignaling.ICE_CANDIDATE,
                candidate: event.candidate,
            });
        }
    };

    peerConnection.onconnectionstatechange = (event) => {
        if(peerConnection.connectionState === "connected")
        {
            console.log("Successfully Connected With Other Peer");
        }
    };

    //receiving tracks
    const remoteStream = new MediaStream();
    store.setRemoteStream(remoteStream);
    ui.updateRemoteVideo(remoteStream);

    peerConnection.ontrack = (event) => {
        remoteStream.addTrack(event.track)
    };

    //add our stream to peer connection
    if(connectedUserDetails.callType === constants.callType.VIDEO_PERSONAL_CODE || 
        connectedUserDetails.callType === constants.callType.VIDEO_STRANGER)
    {
        const localStream = store.getState().localStream;
        for(const track of localStream.getTracks())
        {
            peerConnection.addTrack(track, localStream);
        }
    }
};

export const sendMessageUsingDataChannel = (message) => {
    const stringifiedMessage = JSON.stringify(message);
    dataChannel.send(stringifiedMessage);
};

export const sendPreOffer = (callType, calleePersonalCode) => {
    /*console.log("pre offer func executed");
    console.log(callType);
    console.log(calleePersonalCode);*/

    connectedUserDetails = {
        callType,
        socketId: calleePersonalCode,
    };

    if(callType === constants.callType.CHAT_PERSONAL_CODE || callType === constants.callType.VIDEO_PERSONAL_CODE)
    {
        const data = {
            callType,
            calleePersonalCode,
        };

        ui.showCallingDialog(callingDialogRejectCallHandler);
        store.setCallState(constants.callState.CALL_UNAVAILABLE);
        wss.sendPreOffer(data);
    }

    if(callType === constants.callType.CHAT_STRANGER ||
       callType === constants.callType.VIDEO_STRANGER)
       {
           const data = {
               callType,
               calleePersonalCode,
           };
           store.setCallState(constants.callState.CALL_UNAVAILABLE);
           wss.sendPreOffer(data);
       }
};

export const handlePreOffer = (data) => {
    /*console.log('pre offer came');
    console.log(data);*/
    const { callType, callerSocketId } = data;

    
    if(!checkCallPossibility())
    {
        // path extra data to fix below bug
        return sendPreOfferAnswer(constants.preOfferAnswer.CALL_UNAVAILABLE, callerSocketId);
    }

    /*this is bug if third user try to connect its data would be saved here and used for disconnecting
    to fix it should go below !checkCallPossibility()*/
    connectedUserDetails = {
        socketId: callerSocketId,
        callType,
    };

    store.setCallState(constants.callState.CALL_UNAVAILABLE);
    
    if(callType === constants.callType.CHAT_PERSONAL_CODE ||
       callType === constants.callType.VIDEO_PERSONAL_CODE)
       {
           console.log("showing call dialog");
           ui.showIncomingCallDialog(callType, acceptCallHandler, rejectCallHandler);
       }

       if(callType === constants.callType.CHAT_STRANGER ||
        callType === constants.callType.VIDEO_STRANGER)
        {
            createPeerConnection();//cause already tick that box
            sendPreOfferAnswer(constants.preOfferAnswer.CALL_ACCEPTED);
            ui.showCallElements(connectedUserDetails.callType);
        }
};

const acceptCallHandler = () => {
    //console.log("call accepted");
    createPeerConnection();
    sendPreOfferAnswer(constants.preOfferAnswer.CALL_ACCEPTED);
    ui.showCallElements(connectedUserDetails.callType);
};

//callee side
const rejectCallHandler = () => {
    //console.log("call rejected");
    sendPreOfferAnswer();
    setIncomingCallsAvailable();
    sendPreOfferAnswer(constants.preOfferAnswer.CALL_REJECTED);
};

//caller side
const callingDialogRejectCallHandler = () => {
    //console.log("rejecting the call");
    const data = {
        connectedUserSocketId: connectedUserDetails.socketId,
    };
    closePeerConnectionAndResetState();
    wss.sendUserHangedUp(data);
};

const sendPreOfferAnswer = (preOfferAnswer, callerSocketId = null) => {
    const socketId = callerSocketId ? callerSocketId : connectedUserDetails.socketId;

    const data = {
        callerSocketId: socketId,
        preOfferAnswer,
    };
    ui.removeAllDialogs();
    wss.sendPreOfferAnswer(data);
};

export const handlePreOfferAnswer = (data) => {
    const { preOfferAnswer } = data;

    ui.removeAllDialogs();

    /*console.log("pre offer answer came");
    console.log(data);*/

    if(preOfferAnswer === constants.preOfferAnswer.CALLEE_NOT_FOUND)
    {
        //store.setCallState(constants.callState.CALL_AVAILABLE);
        //we made below function instead
        setIncomingCallsAvailable();
        ui.showInfoDialog(preOfferAnswer);
        //show dialog that callee has not been found
    }

    if(preOfferAnswer === constants.preOfferAnswer.CALL_UNAVAILABLE)
    {
         //store.setCallState(constants.callState.CALL_AVAILABLE);
        //we made below function instead
        setIncomingCallsAvailable();
        ui.showInfoDialog(preOfferAnswer);
        //show dialog that callee not able to connect
    }

    if(preOfferAnswer === constants.preOfferAnswer.CALL_REJECTED)
    {
         //store.setCallState(constants.callState.CALL_AVAILABLE);
        //we made below function instead
        setIncomingCallsAvailable();
        ui.showInfoDialog(preOfferAnswer);
        //show dialog that call is rejected by the callee
    }

    if(preOfferAnswer === constants.preOfferAnswer.CALL_ACCEPTED)
    {
        ui.showCallElements(connectedUserDetails.callType);
        createPeerConnection();
        sendWebRTCOffer();
    }
    // another is base on chat/video to show relevent elements
};

//we are in caller side and send to callee (send in caller side)
const sendWebRTCOffer = async () => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    wss.sendDataUsingWebRTCSignaling({
        connectedUserSocketId: connectedUserDetails.socketId,
        type: constants.webRTCSignaling.OFFER,
        offer: offer,
    });
};

//we get sdp info from caller (receive in callee and handle it)
export const handleWebRTCOffer = async (data) => {
    /*console.log("Web RTC Offer Came");
    console.log(data);*/
    await peerConnection.setRemoteDescription(data.offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    wss.sendDataUsingWebRTCSignaling({
        connectedUserSocketId: connectedUserDetails.socketId,
        type: constants.webRTCSignaling.ANSWER,
        answer: answer,
    });
};

export const handleWebRTCAnswer = async (data) => {
    console.log("Handling webRTC Answer");
    await peerConnection.setRemoteDescription(data.answer);
};

export const handleWebRTCCandidate = async (data) => {
    console.log("handling incoming webrtc candidate");
    try
    {
        await peerConnection.addIceCandidate(data.candidate);
    }
    catch(err)
    {
        console.error("Error Occured When Trying To Add Received Ice Candidate", err);
    }
};

let screenSharingStream;

export const switchBetweenCameraAndScreenSharing = async (screenSharingActive) => {
    if(screenSharingActive)
    {
        const localStream = store.getState().localStream;
        const senders = peerConnection.getSenders();
        const sender = senders.find((sender) => {
            return (sender.track.kind === localStream.getVideoTracks()[0].kind);
        }); 
        if(sender)
        {
            sender.replaceTrack(localStream.getVideoTracks()[0]);
        }  
        //stop screen sharing stream
        store.getState().screenSharingStream.getTracks().forEach((track) => track.stop());

        store.setScreenSharingActive(!screenSharingActive);
        ui.updateLocalVideo(localStream);
    }
    else 
    {
        console.log("Switching For Screen Sharing");
        try {
            screenSharingStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
            });      
            store.setScreenSharingStream(screenSharingStream);  
            //replace track which sender is sending
            const senders = peerConnection.getSenders();//senders are specific peer connection object used to send audio/video one for audio and one for video
            const sender = senders.find((sender) => {
                return sender.track.kind === screenSharingStream.getVideoTracks()[0].kind;
            }); 
            if(sender)
            {
                sender.replaceTrack(screenSharingStream.getVideoTracks()[0]);
                ui.updateLocalVideo(screenSharingStream);
            }  
            store.setScreenSharingActive(!screenSharingActive); 
        } catch (err) {
            console.error("Error Occured When Trying To Get Screen Sharing Stream", err);            
        }
    }
};

//hang up
export const handleHangUp = () => {
    console.log("Finishing The Call");
    const data = {
        connectedUserSocketId: connectedUserDetails.socketId,
    };
    wss.sendUserHangedUp(data);
    closePeerConnectionAndResetState();
};

export const handleConnectedUserHangedUp = () => {
    //console.log("Connected Peer Hanged Up");
    closePeerConnectionAndResetState();
};

const closePeerConnectionAndResetState = () => {
    if(peerConnection)
    {
        peerConnection.close();
        peerConnection = null;
    }
    //active mic & camera
    if(connectedUserDetails.callType === constants.callType.VIDEO_PERSONAL_CODE || 
       connectedUserDetails.callType === constants.callType.VIDEO_STRANGER)
       {
           //start mic/cam enable at new begining
           store.getState().localStream.getVideoTracks()[0].enabled = true;
           store.getState().localStream.getAudioTracks()[0].enabled = true;
           
           /*ui.updateUIAfterHangUp(connectedUserDetails.callType); it made problem in chat part and no hang up and it
           connectedUserDetails = null;should be written out of if statement*/
       }
        ui.updateUIAfterHangUp(connectedUserDetails.callType);
         //store.setCallState(constants.callState.CALL_AVAILABLE);
        //we made below function instead
        setIncomingCallsAvailable();
        connectedUserDetails = null;
};

const checkCallPossibility = (callType) => {
    const callState = store.getState().callState;
    if(callState === constants.callState.CALL_AVAILABLE)
    {
        return true;
    }
    if((callType === constants.callType.VIDEO_PERSONAL_CODE || callType === constants.callType.VIDEO_STRANGER) &&
       (callState === constants.callState.CALL_AVAILABLE_ONLY_CHAT))
       {
           return false;
       }
       return false;
};

const setIncomingCallsAvailable = () => {
    const localStream = store.getState().localStream;

    if(localStream)
    {
        store.setCallState(constants.callState.CALL_AVAILABLE);
    }
    else
    {
        store.setCallState(constants.callState.CALL_AVAILABLE_ONLY_CHAT);
    }
};