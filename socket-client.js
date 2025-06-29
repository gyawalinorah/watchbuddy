import { io } from "socket.io-client";

class SocketService {
    constructor() {
        this.socket = null;
        this.serverUrl = "http://localhost:3001"; // Change to your server URL in production
    }

    connect(token) {
        if (this.socket) return;

        this.socket = io(this.serverUrl);

        // Setup connection events
        this.socket.on("connect", () => {
            console.log("Connected to Socket.io server");
            this.authenticate(token);
        });

        this.socket.on("connect_error", (error) => {
            console.error("Socket connection error:", error);
        });
    }

    authenticate(token) {
        this.socket.emit("authenticate", token);
    }

    joinRoom(roomCode, password = "") {
        return new Promise((resolve, reject) => {
            this.socket.emit("join_room", { roomCode, password });

            this.socket.once("room_joined", (data) => {
                resolve(data);
            });

            this.socket.once("error", (error) => {
                reject(error);
            });
        });
    }

    onUserJoined(callback) {
        this.socket.on("user_joined", callback);
    }

    onUserLeft(callback) {
        this.socket.on("user_left", callback);
    }

    onParticipantsUpdated(callback) {
        this.socket.on("participants_updated", callback);
    }

    sendVideoEvent(eventType, time, videoId) {
        this.socket.emit("video_event", {
            type: eventType,
            time,
            videoId
        });
    }

    onVideoEvent(callback) {
        this.socket.on("video_event", callback);
    }

    sendChatMessage(message) {
        this.socket.emit("chat_message", message);
    }

    onChatMessage(callback) {
        this.socket.on("chat_message", callback);
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

// Export as singleton
const socketService = new SocketService();
export default socketService;