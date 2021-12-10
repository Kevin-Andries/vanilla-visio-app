import "./style.css";
// Libraries
import { io } from "socket.io-client";

// HTML elements
const localVideo = document.querySelector(".local-video");
const remoteVideosBox = document.querySelector(".remote-videos-box");

// State
const roomId = "1";
let localMedia;
let socket;
let pc = [];
const RTCConfig = {
	iceServers: [
		{
			urls: [
				"stun:stun1.l.google.com:19302",
				"stun:stun2.l.google.com:19302",
			],
		},
	],
	iceCandidatePoolSize: 10,
};
const peerConfig = {
	offerToReceiveAudio: true,
	offerToReceiveVideo: true,
};

/******************** Start the program ********************/
(async () => {
	// Request permission to use webcam/microphone
	localMedia = await navigator.mediaDevices.getUserMedia({
		audio: true,
		video: true,
	});
	localVideo.srcObject = localMedia;

	// Connect to socket server
	socket = io("https://evening-badlands-28979.herokuapp.com/");
	initializeSocket();
})();

/**
 * Function to set up the socket
 */
function initializeSocket() {
	console.log("INITIALIZE SOCKET");

	socket.on("connect", () => {
		console.log("Connected to socket " + socket.id);
	});

	// When a client joined, we create an offer for him
	socket.on("new-peer-joined", async (peerId) => {
		console.log("socket peer joined");
		createRTCConnection(peerId, "creates");
	});

	// When a SDP is received, we create an answer
	socket.on("sdp-offer", async (peerId, sdp) => {
		console.log("sdp-offer received", sdp);
		createRTCConnection(peerId, "answer", sdp);
	});

	socket.on("sdp-answer", (peerId, sdp) => {
		console.log("sdp-answer received");
		const remotePeer = pc.find((peer) => peer.id === peerId);
		remotePeer.connection.setRemoteDescription(sdp);
	});

	socket.on("new-ice-candidate", (peerId, candidate) => {
		console.log("received ice candidate");
		const remotePeer = pc.find((peer) => peer.id === peerId);
		remotePeer.connection.addIceCandidate(new RTCIceCandidate(candidate));
	});

	socket.emit("join-room", roomId, () => {
		console.log("JOINED ROOM SOCKET");
	});
}

/**
 * Function to set up a new peer connection
 */
async function createRTCConnection(peerId, which, sdp) {
	const newPeer = {
		id: peerId,
		connection: new RTCPeerConnection(RTCConfig),
		stream: new MediaStream(),
	};

	pc.push(newPeer);

	console.log("CREATE-RTC-CONNECTION", which, sdp);

	if (which === "creates") {
		// Give its tracks to remote peer
		// if (this.state.localMedia) {
		localMedia.getTracks().forEach((track) => {
			console.log("sending my tracks", track);
			newPeer.connection.addTrack(track, localMedia);
		});
		// }
	}

	if (which !== "creates") {
		// Listen to ice candidate
		newPeer.connection.onicecandidate = (e) => {
			if (e.candidate) {
				console.log("emit ice candidate");
				socket.emit("ice-candidate", peerId, e.candidate);
			}
		};
	}

	// Listen to tracks
	newPeer.connection.ontrack = (e) => {
		console.log("RECEIVED TRACK", e);
		console.log("SETTINGS REMOTE TRACKS", e.streams[0].getTracks());
		e.streams[0].getTracks().forEach((track) => {
			newPeer.stream.addTrack(track);
		});
	};

	newPeer.connection.onconnectionstatechange = () => {
		const connectionState = newPeer.connection.connectionState;
		if (
			connectionState === "closed" ||
			connectionState === "disconnected"
		) {
			console.log("A USER LEFT THE ROOM");

			// remove pc from pc list in state
			pc = pc.filter((peer) => peer.id !== peerId);
		} else if (connectionState === "connected") {
			console.log("CONNECTED TO PEER");
		}
	};

	if (which === "creates") {
		console.log("creating...");

		newPeer.connection.onnegotiationneeded = async () => {
			// Creates offer and responds to other peer
			const offer = await newPeer.connection.createOffer(peerConfig);
			console.log("created...");
			await newPeer.connection.setLocalDescription(offer);

			// Listen to ice candidate
			newPeer.connection.onicecandidate = (e) => {
				if (e.candidate) {
					console.log("emit ice candidate");
					socket.emit("ice-candidate", peerId, e.candidate);
				}
			};

			console.log(offer); // 2x diff !!!
			console.log("emit offer");
			socket.emit("offer", peerId, offer);
		};
	} else if (which === "answer" && sdp) {
		const sdpObj = sdp;
		await newPeer.connection.setRemoteDescription(sdpObj);

		// if (this.state.localMedia) {
		localMedia.getTracks().forEach((track) => {
			console.log("sending my tracks", track);
			newPeer.connection.addTrack(track, localMedia);
		});
		// }

		const answer = await newPeer.connection.createAnswer(peerConfig);
		await newPeer.connection.setLocalDescription(answer);

		socket.emit("answer", peerId, answer);
		console.log("emit answer");
	}

	const newVideo = document.createElement("video");
	newVideo.srcObject = newPeer.stream;
	newVideo.autoplay = true;
	newVideo.playsInline = true;
	remoteVideosBox.appendChild(newVideo);
}
