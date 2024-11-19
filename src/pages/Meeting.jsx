import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

export default function Meeting() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [participants, setParticipants] = useState(new Map());
  const [localStream, setLocalStream] = useState(null);
  const socketRef = useRef();
  const peersRef = useRef(new Map());
  const localVideoRef = useRef();

  useEffect(() => {
    // Initialize WebRTC and Socket.io
    const init = async () => {
      try {
        // Get local media stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Connect to signaling server
        socketRef.current = io('http://localhost:3000');
        
        // Join room
        socketRef.current.emit('join-room', {
          roomId,
          userId: user.id,
          username: user.username,
        });

        // Handle new user joined
        socketRef.current.on('user-joined', ({ userId, username, participants: roomParticipants }) => {
          setParticipants(new Map(roomParticipants));
          createPeerConnection(userId, username, stream);
        });

        // Handle user left
        socketRef.current.on('user-left', ({ userId }) => {
          if (peersRef.current.has(userId)) {
            peersRef.current.get(userId).close();
            peersRef.current.delete(userId);
          }
          setParticipants(prev => {
            const next = new Map(prev);
            next.delete(userId);
            return next;
          });
        });

        // Handle WebRTC signaling
        socketRef.current.on('offer', async ({ from, offer }) => {
          const pc = createPeerConnection(from, participants.get(from)?.username, stream);
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketRef.current.emit('answer', { to: from, from: user.id, answer });
        });

        socketRef.current.on('answer', async ({ from, answer }) => {
          const pc = peersRef.current.get(from);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });

        socketRef.current.on('ice-candidate', async ({ from, candidate }) => {
          const pc = peersRef.current.get(from);
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        });
      } catch (error) {
        console.error('Error initializing meeting:', error);
      }
    };

    init();

    return () => {
      localStream?.getTracks().forEach(track => track.stop());
      socketRef.current?.disconnect();
      peersRef.current.forEach(pc => pc.close());
    };
  }, [roomId, user]);

  const createPeerConnection = (userId, username, stream) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // Add local stream
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // Handle ICE candidates
    pc.onicecandidate = event => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          to: userId,
          candidate: event.candidate,
        });
      }
    };

    // Handle incoming stream
    pc.ontrack = event => {
      const videoElement = document.createElement('video');
      videoElement.srcObject = event.streams[0];
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.id = `video-${userId}`;
      document.getElementById('remote-videos').appendChild(videoElement);
    };

    peersRef.current.set(userId, pc);
    return pc;
  };

  const leaveRoom = () => {
    socketRef.current?.emit('leave-room', { roomId, userId: user.id });
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-4 flex justify-between items-center">
          <h1 className="text-white text-xl">Room: {roomId}</h1>
          <button
            onClick={leaveRoom}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Leave Room
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="relative">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-lg"
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">
              You
            </div>
          </div>
          <div id="remote-videos" className="grid gap-4"></div>
        </div>
      </div>
    </div>
  );
}