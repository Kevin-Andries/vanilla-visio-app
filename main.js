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
			urls: ["stun:stun1.l.google.com:19302"],
		},
		{
			urls: "turn:numb.viagenie.ca:3478",
			username: "kevin.andries@yahoo.fr",
			credential: "azerty",
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
	// When a client joined, we create an offer for him
	socket.on("new-peer-joined", async (peerId) => {
		createRTCOffer(peerId);
	});

	// When a SDP is received, we create an answer
	socket.on("sdp-offer", async (peerId, sdp) => {
		createRTCAnswer(peerId, sdp);
	});

	socket.on("sdp-answer", (peerId, sdp) => {
		const remotePeer = pc.find((peer) => peer.id === peerId);
		remotePeer.connection.setRemoteDescription(sdp);

		remotePeer.isCallAnswered = true;

		remotePeer.iceCandidates.forEach((candidate) => {
			socket.emit("ice-candidate", peerId, candidate);
		});
	});

	socket.on("new-ice-candidate", (peerId, candidate) => {
		const remotePeer = pc.find((peer) => peer.id === peerId);
		remotePeer.connection.addIceCandidate(new RTCIceCandidate(candidate));
	});

	socket.emit("join-room", roomId);
}

function createPeer(peerId) {
	const peer = {
		isCallAnswered: false,
		id: peerId,
		connection: new RTCPeerConnection(RTCConfig),
		stream: new MediaStream(),
		iceCandidates: [],
	};
	pc.push(peer);

	return peer;
}

function setTracks(peer) {
	// give local tracks to remote peer
	localMedia.getTracks().forEach((track) => {
		peer.connection.addTrack(track, localMedia);
	});

	// listen to tracks from remote peer
	peer.connection.ontrack = (e) => {
		e.streams[0].getTracks().forEach((track) => {
			peer.stream.addTrack(track);
		});
	};
}

function handleHangup(peer) {
	peer.connection.onconnectionstatechange = () => {
		const connectionState = peer.connection.connectionState;

		if (
			connectionState === "closed" ||
			connectionState === "disconnected"
		) {
			// remove pc
			const video = document.getElementById(peer.id);
			video.remove();
			pc = pc.filter((p) => p.id !== peer.id);
		} else if (connectionState === "connected") {
		}
	};
}

async function createRTCOffer(peerId) {
	const newPeer = createPeer(peerId);
	setTracks(newPeer);
	handleHangup(newPeer);

	newPeer.connection.onicecandidate = (e) => {
		if (e.candidate) {
			if (!newPeer.isCallAnswered) {
				newPeer.iceCandidates.push(e.candidate);
			} else {
				socket.emit("ice-candidate", peerId, e.candidate);
			}
		}
	};

	const offer = await newPeer.connection.createOffer(peerConfig);
	await newPeer.connection.setLocalDescription(offer);

	socket.emit("offer", peerId, offer);

	createVideo(newPeer);
}

async function createRTCAnswer(peerId, sdp) {
	const newPeer = createPeer(peerId);
	setTracks(newPeer);
	handleHangup(newPeer);

	newPeer.connection.onicecandidate = (e) => {
		if (e.candidate) {
			socket.emit("ice-candidate", peerId, e.candidate);
		}
	};

	await newPeer.connection.setRemoteDescription(sdp);

	const answer = await newPeer.connection.createAnswer(peerConfig);
	await newPeer.connection.setLocalDescription(answer);

	socket.emit("answer", peerId, answer);

	createVideo(newPeer);
}

function createVideo(peer) {
	const newVideo = document.createElement("video");
	newVideo.id = peer.id;
	newVideo.srcObject = peer.stream;
	newVideo.autoplay = true;
	newVideo.playsInline = true;
	remoteVideosBox.appendChild(newVideo);
}
