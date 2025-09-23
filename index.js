import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import io from "socket.io-client";
import {
  MainContainer,
  ChatContainer,
  MessageList,
  MessageInput,
  Message,
  MessageSeparator,
} from "@chatscope/chat-ui-kit-react";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";

const socket = io("https://boardstack.onrender.com", {
  withCredentials: true,
  transports: ["websocket"],
});

export default function VideoConferencePage() {
  const { roomId } = useParams();
  const localVideoRef = useRef(null);
  const localStream = useRef(null);
  const peerConnections = useRef({});
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [started, setStarted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  // Log TURN server configuration
  useEffect(() => {
    if (!import.meta.env.VITE_TURN_URL || !import.meta.env.VITE_TURN_USERNAME || !import.meta.env.VITE_TURN_CREDENTIAL) {
      console.warn(
        "TURN server environment variables (VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL) are not set. Using fallback TURN server."
      );
    } else {
      console.log(
        `Using TURN server: ${import.meta.env.VITE_TURN_URL} with username: ${import.meta.env.VITE_TURN_USERNAME}`
      );
    }
  }, []);

  const replaceVideoTrack = (newTrack) => {
    console.log("Replacing video track:", newTrack ? "New track provided" : "No track (camera off)");
    const audioTracks = localStream.current?.getAudioTracks() || [];
    localVideoRef.current.srcObject = new MediaStream([newTrack, ...audioTracks].filter(Boolean));

    const existingVideoTrack = localStream.current?.getVideoTracks()[0];
    if (existingVideoTrack) {
      localStream.current.removeTrack(existingVideoTrack);
      existingVideoTrack.stop();
    }
    if (newTrack) {
      localStream.current.addTrack(newTrack);
    }

    Object.values(peerConnections.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        sender.replaceTrack(newTrack).catch((err) => console.error("Error replacing track:", err));
      } else if (newTrack) {
        pc.addTrack(newTrack, localStream.current);
      }
    });

    setCameraOn(!!newTrack);
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      console.log("Local stream acquired:", stream);
      localStream.current = stream;
      localVideoRef.current.srcObject = stream;
      setStarted(true);
      setCameraOn(true);
      setMicOn(true);
      socket.emit("joinRoom", roomId);
    } catch (error) {
      console.error("Error accessing media devices:", error);
      alert("Could not start video call. Check your camera and microphone permissions.");
    }
  };

  const createPeerConnection = async (socketId, isInitiator) => {
    console.log(`Creating peer connection for socketId: ${socketId}, isInitiator: ${isInitiator}`);
    if (peerConnections.current[socketId]) {
      console.log(`Peer connection for ${socketId} already exists`);
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: import.meta.env.VITE_TURN_URL || "turn:openrelay.metered.ca:80",
          username: import.meta.env.VITE_TURN_USERNAME || "openrelay",
          credential: import.meta.env.VITE_TURN_CREDENTIAL || "openrelay",
        },
      ],
    });
    peerConnections.current[socketId] = pc;

    if (localStream.current) {
      console.log(`Adding tracks for socketId: ${socketId}`);
      localStream.current.getTracks().forEach((track) => pc.addTrack(track, localStream.current));
    }

    pc.ontrack = (event) => {
      console.log(`Received remote stream for socketId: ${socketId}`, event.streams);
      const stream = event.streams[0];
      if (!stream.getVideoTracks().length) {
        console.warn(`No video track in stream from ${socketId}`);
        setChatMessages((prev) => [
          ...prev,
          { direction: "system", content: `User ${socketId.substring(0, 4)} has no video track.` },
        ]);
      }
      setRemoteStreams((prev) => {
        const isExisting = prev.some((s) => s.id === socketId);
        if (isExisting) return prev;
        return [...prev, { id: socketId, stream }];
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${socketId}: ${event.candidate.candidate}`);
        socket.emit("ice-candidate", { candidate: event.candidate, to: socketId });
      }
    };

    pc.onicecandidateerror = (event) => {
      console.error(`ICE candidate error for ${socketId}:`, event);
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${socketId}: ${pc.connectionState}`);
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        console.error(`Peer connection with ${socketId} failed or disconnected`);
        pc.close();
        delete peerConnections.current[socketId];
        setRemoteStreams((prev) => prev.filter((s) => s.id !== socketId));
        setChatMessages((prev) => [
          ...prev,
          { direction: "system", content: `Connection with user ${socketId.substring(0, 4)} lost.` },
        ]);
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log(`Sending offer to ${socketId}`);
      socket.emit("offer", { offer, to: socketId });
    } else {
      console.log(`Requesting initiation from ${socketId}`);
      socket.emit("initiate", { socketId });
    }
  };

  useEffect(() => {
    if (!roomId) {
      console.error("No roomId provided");
      return;
    }
    console.log(`Joining room: ${roomId}`);

    socket.on("new-user", async ({ socketId }) => {
      console.log(`New user joined: ${socketId}`);
      if (socketId === socket.id || !localStream.current) return;
      await createPeerConnection(socketId, true);
    });

    socket.on("initiate", async ({ socketId }) => {
      console.log(`Received initiate from ${socketId}`);
      if (socketId === socket.id || !localStream.current) return;
      await createPeerConnection(socketId, false);
    });

    socket.on("offer", async ({ offer, from }) => {
      console.log(`Received offer from ${from}`);
      const pc = peerConnections.current[from];
      if (!pc) {
        console.error(`No peer connection found for ${from}`);
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log(`Sending answer to ${from}`);
        socket.emit("answer", { answer, to: from });
      } catch (error) {
        console.error(`Error handling offer from ${from}:`, error);
      }
    });

    socket.on("answer", async ({ answer, from }) => {
      console.log(`Received answer from ${from}`);
      const pc = peerConnections.current[from];
      if (!pc) {
        console.error(`No peer connection found for ${from}`);
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error(`Error handling answer from ${from}:`, error);
      }
    });

    socket.on("ice-candidate", ({ candidate, from }) => {
      console.log(`Received ICE candidate from ${from}`);
      const pc = peerConnections.current[from];
      if (pc && candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) =>
          console.error(`Error adding ICE candidate from ${from}:`, e)
        );
      } else {
        console.error(`No peer connection or candidate for ${from}`);
      }
    });

    socket.on("chat-message", ({ message, sender }) => {
      console.log(`Received chat message from ${sender}: ${message}`);
      setChatMessages((prev) => [...prev, { direction: "incoming", content: message, sender }]);
    });

    socket.on("user-left", ({ socketId }) => {
      console.log(`User ${socketId} left the room`);
      if (peerConnections.current[socketId]) {
        peerConnections.current[socketId].close();
        delete peerConnections.current[socketId];
        setRemoteStreams((prev) => prev.filter((s) => s.id !== socketId));
        setChatMessages((prev) => [
          ...prev,
          { direction: "system", content: `User ${socketId.substring(0, 4)} left the room.` },
        ]);
      }
    });

    return () => {
      console.log("Cleaning up socket and peer connections");
      socket.off("new-user");
      socket.off("initiate");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("chat-message");
      socket.off("user-left");

      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};

      localStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [roomId]);

  const toggleCamera = async () => {
    if (!localStream.current) return;

    if (cameraOn) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        replaceVideoTrack(null);
        console.log("Camera turned off");
      }
    } else {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const camTrack = camStream.getVideoTracks()[0];
        replaceVideoTrack(camTrack);
        console.log("Camera turned on");
      } catch (error) {
        console.error("Could not access camera:", error);
        alert("Camera permission denied or camera is in use.");
      }
    }
    setScreenSharing(false);
  };

  const toggleMic = () => {
    const audioTrack = localStream.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicOn(audioTrack.enabled);
      console.log(`Microphone ${audioTrack.enabled ? "unmuted" : "muted"}`);
    }
  };

  const toggleScreenShare = async () => {
    if (!localStream.current) return;

    if (!screenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        replaceVideoTrack(screenTrack);
        screenTrack.onended = () => {
          if (screenSharing) toggleScreenShare();
        };
        setScreenSharing(true);
        setCameraOn(true);
        console.log("Screen sharing started");
      } catch (error) {
        console.error("Error starting screen share:", error);
        alert("Could not start screen sharing.");
      }
    } else {
      try {
        const currentVideoTrack = localStream.current.getVideoTracks()[0];
        if (currentVideoTrack) currentVideoTrack.stop();
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const camTrack = camStream.getVideoTracks()[0];
        replaceVideoTrack(camTrack);
        setScreenSharing(false);
        setCameraOn(true);
        console.log("Reverted to camera");
      } catch (error) {
        console.error("Error reverting to camera:", error);
        replaceVideoTrack(null);
        setScreenSharing(false);
        setCameraOn(false);
        alert("Could not revert to camera.");
      }
    }
  };

  const sendMessage = () => {
    if (chatInput.trim() !== "") {
      const message = chatInput.trim();
      socket.emit("chat-message", { roomId, message, sender: socket.id });
      setChatMessages((prev) => [...prev, { direction: "outgoing", content: message, sender: socket.id }]);
      setChatInput("");
      console.log("Sent chat message:", message);
    }
  };

  const getGridClasses = (count) => {
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2 md:grid-cols-2";
    if (count <= 9) return "grid-cols-2 md:grid-cols-3";
    return "grid-cols-3 md:grid-cols-4";
  };

  const videoCount = 1 + remoteStreams.length;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <div className="w-3/4 p-4 flex flex-col">
        <div className={`grid ${getGridClasses(videoCount)} gap-4 flex-grow mb-4 overflow-y-auto`}>
          <div className="relative w-full h-full min-h-48 bg-gray-800 rounded-lg shadow-xl overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <span className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-0.5 rounded text-sm">
              You
            </span>
            {!cameraOn && !screenSharing && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-12 w-12 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.555-4.555c.617-.617.202-1.688-.698-1.688H5.143C4.243 3.757 3.828 4.828 4.445 5.445L9 10m6 0v6.75A2.25 2.25 0 0112.75 19h-1.5A2.25 2.25 0 019 16.75V10"
                  />
                </svg>
              </div>
            )}
            {screenSharing && (
              <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-0.5 rounded text-xs font-bold">
                SCREEN SHARING
              </div>
            )}
          </div>
          {console.log("Rendering remote streams:", remoteStreams)}
          {remoteStreams.map((r) => (
            <div
              key={r.id}
              className="relative w-full h-full min-h-48 bg-gray-700 rounded-lg shadow-xl overflow-hidden"
            >
              <video
                autoPlay
                playsInline
                className="w-full h-full object-cover"
                ref={(el) => {
                  if (el) {
                    console.log(`Setting srcObject for remote stream ${r.id}`);
                    el.srcObject = r.stream;
                  }
                }}
              />
              <span className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-0.5 rounded text-sm">
                {r.id.substring(0, 4)}
              </span>
              {!r.stream.getVideoTracks().length && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-12 w-12 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.555-4.555c.617-.617.202-1.688-.698-1.688H5.143C4.243 3.757 3.828 4.828 4.445 5.445L9 10m6 0v6.75A2.25 2.25 0 0112.75 19h-1.5A2.25 2.25 0 019 16.75V10"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-center items-center p-3 bg-white rounded-xl shadow-lg">
          {!started ? (
            <button
              onClick={startCall}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-700 transition-colors shadow-md"
            >
              Start Video Call
            </button>
          ) : (
            <div className="flex gap-4">
              <button
                onClick={toggleCamera}
                className={`p-3 rounded-full ${
                  cameraOn ? "bg-gray-700 hover:bg-gray-600" : "bg-red-500 hover:bg-red-600"
                } text-white transition-colors`}
                title={cameraOn ? "Turn Camera Off" : "Turn Camera On"}
              >
                {cameraOn ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.555-4.555c.617-.617.202-1.688-.698-1.688H5.143C4.243 3.757 3.828 4.828 4.445 5.445L9 10m6 0v6.75A2.25 2.25 0 0112.75 19h-1.5A2.25 2.25 0 019 16.75V10"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.555-4.555c.617-.617.202-1.688-.698-1.688H5.143C4.243 3.757 3.828 4.828 4.445 5.445L9 10m6 0v6.75A2.25 2.25 0 0112.75 19h-1.5A2.25 2.25 0 019 16.75V10m6 0a2.25 2.25 0 10-4.5 0M9 10a2.25 2.25 0 10-4.5 0M6 18L18 6"
                    />
                  </svg>
                )}
              </button>
              <button
                onClick={toggleMic}
                className={`p-3 rounded-full ${
                  micOn ? "bg-gray-700 hover:bg-gray-600" : "bg-red-500 hover:bg-red-600"
                } text-white transition-colors`}
                title={micOn ? "Mute Microphone" : "Unmute Microphone"}
              >
                {micOn ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-14 0v-2a7 7 0 1114 0v2zM12 18a4 4 0 01-4-4V7a4 4 0 018 0v7a4 4 0 01-4 4zM12 21a9 9 0 009-9h-2a7 7 0 01-14 0H3a9 9 0 009 9z"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-14 0v-2a7 7 0 1114 0v2zM12 18a4 4 0 01-4-4V7a4 4 0 018 0v7a4 4 0 01-4 4zM6 18L18 6"
                    />
                  </svg>
                )}
              </button>
              <button
                onClick={toggleScreenShare}
                className={`p-3 rounded-full ${
                  screenSharing ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                } text-white transition-colors`}
                title={screenSharing ? "Stop Sharing Screen" : "Share Screen"}
              >
                {screenSharing ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 16l4-4-4-4m4 8V8M3 17h18M5 3v14h14V3H5z"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.75 17L12 14.75m0 0L14.25 17m-2.25-2.25V5.25M3 17h18M5 3v14h14V3H5z"
                    />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="w-1/4 border-l border-gray-300 h-full flex flex-col bg-white">
        <MainContainer responsive>
          <ChatContainer>
            <MessageList>
              <MessageSeparator content="Room Chat" />
              {chatMessages.map((msg, idx) => (
                <Message
                  key={idx}
                  model={{
                    message: msg.content,
                    direction: msg.direction === "outgoing" ? "outgoing" : "incoming",
                    position: "single",
                    type: "text",
                  }}
                >
                  {msg.direction === "system" && <Message.Header sender="System" />}
                  {msg.direction === "incoming" && (
                    <Message.Header sender={`User ${msg.sender?.substring(0, 4) || "Peer"}`} />
                  )}
                </Message>
              ))}
            </MessageList>
            <MessageInput
              placeholder="Type message here..."
              value={chatInput}
              onChange={(val) => setChatInput(val)}
              onSend={sendMessage}
              attachButton={false}
            />
          </ChatContainer>
        </MainContainer>
      </div>
    </div>
  );
}