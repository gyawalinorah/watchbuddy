const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
const server = http.createServer(app);

// Configure CORS for Socket.io
const io = new Server(server, {
    cors: {
        origin: '*', // Replace with your frontend URL in production
        methods: ['GET', 'POST']
    }
});

// Initialize Supabase client with the correct key
const supabaseUrl = 'https://qyvqsuwtvqrcjcvqigdl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5dnFzdXd0dnFyY2pjdnFpZ2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0Mzc3MjMsImV4cCI6MjA2NTAxMzcyM30.rbQsNrfmhHjXnnOc8UAFTrknEKYkXDuKcP-IMPm5TdI';
const supabase = createClient(supabaseUrl, supabaseKey);

// Room management
const rooms = {};

// Socket.io connection
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User authentication
    socket.on('authenticate', async (token) => {
        try {
            // Verify token with Supabase
            const { data, error } = await supabase.auth.getUser(token);

            if (error || !data.user) {
                socket.emit('auth_error', 'Authentication failed');
                return;
            }

            // Store user info in socket
            socket.user = {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata?.full_name || data.user.user_metadata?.username || data.user.email.split('@')[0]
            };

            socket.emit('authenticated', { user: socket.user });

        } catch (error) {
            console.error('Auth error:', error);
            socket.emit('auth_error', 'Authentication failed');
        }
    });

    // Join room
    socket.on('join_room', async ({ roomCode, password }) => {
        try {
            if (!socket.user) {
                socket.emit('error', 'Authentication required');
                return;
            }

            // Get room from Supabase
            const { data: room, error } = await supabase
                .from('rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (error || !room) {
                socket.emit('error', 'Room not found');
                return;
            }

            // Check password if room is private
            if (room.is_private && room.password !== password) {
                socket.emit('error', 'Incorrect password');
                return;
            }

            // Add user to room participants
            const { error: participantError } = await supabase
                .from('room_participants')
                .upsert({
                    room_id: room.id,
                    user_id: socket.user.id,
                    is_present: true,
                    last_active_at: new Date().toISOString()
                });

            if (participantError) {
                console.error('Error adding participant:', participantError);
                socket.emit('error', 'Failed to join room');
                return;
            }

            // Join socket room
            socket.join(room.id);

            // Initialize room in memory if not exists
            if (!rooms[room.id]) {
                rooms[room.id] = {
                    id: room.id,
                    videoId: room.video_id,
                    videoType: room.video_type,
                    participants: {}
                };
            }

            // Add user to room participants
            rooms[room.id].participants[socket.user.id] = {
                id: socket.user.id,
                name: socket.user.name,
                socketId: socket.id
            };

            // Send room info and current participants
            socket.emit('room_joined', {
                roomId: room.id,
                roomCode: room.room_code,
                videoId: room.video_id,
                isHost: room.host_id === socket.user.id
            });

            // Notify other participants
            io.to(room.id).emit('user_joined', {
                userId: socket.user.id,
                name: socket.user.name
            });

            // Send current participant list
            io.to(room.id).emit('participants_updated', Object.values(rooms[room.id].participants));

            // Store room ID in socket for disconnection handling
            socket.roomId = room.id;

        } catch (error) {
            console.error('Join room error:', error);
            socket.emit('error', 'Failed to join room');
        }
    });

    // Video control events
    socket.on('video_event', async (data) => {
        try {
            const { type, time, videoId } = data;

            if (!socket.user || !socket.roomId) {
                socket.emit('error', 'Not in a room');
                return;
            }

            const roomId = socket.roomId;

            // Save event to database
            await supabase.from('room_events').insert({
                room_id: roomId,
                user_id: socket.user.id,
                event_type: type,
                video_time: time,
                video_id: videoId
            });

            // Update room if video is changed
            if (type === 'change_video' && videoId) {
                await supabase
                    .from('rooms')
                    .update({ video_id: videoId })
                    .eq('id', roomId);

                if (rooms[roomId]) {
                    rooms[roomId].videoId = videoId;
                }
            }

            // Broadcast to all users in room except sender
            socket.to(roomId).emit('video_event', {
                type,
                time,
                videoId,
                userId: socket.user.id
            });

        } catch (error) {
            console.error('Video event error:', error);
        }
    });

    // Chat message
    socket.on('chat_message', async (message) => {
        try {
            if (!socket.user || !socket.roomId) {
                socket.emit('error', 'Not in a room');
                return;
            }

            // Save message to database
            const { data, error } = await supabase
                .from('chat_messages')
                .insert({
                    room_id: socket.roomId,
                    user_id: socket.user.id,
                    message: message
                })
                .select()
                .single();

            if (error) {
                console.error('Chat message error:', error);
                socket.emit('error', 'Failed to send message');
                return;
            }

            // Broadcast message to room
            io.to(socket.roomId).emit('chat_message', {
                id: data.id,
                userId: socket.user.id,
                name: socket.user.name,
                message: message,
                createdAt: data.created_at
            });

        } catch (error) {
            console.error('Chat message error:', error);
        }
    });

    // Disconnection
    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);

        try {
            if (socket.roomId && socket.user) {
                // Update participant status in database
                await supabase
                    .from('room_participants')
                    .update({
                        is_present: false,
                        last_active_at: new Date().toISOString()
                    })
                    .eq('room_id', socket.roomId)
                    .eq('user_id', socket.user.id);

                // Remove from memory
                if (rooms[socket.roomId]?.participants?.[socket.user.id]) {
                    delete rooms[socket.roomId].participants[socket.user.id];

                    // Notify others
                    io.to(socket.roomId).emit('user_left', {
                        userId: socket.user.id
                    });

                    // Update participant list
                    io.to(socket.roomId).emit('participants_updated',
                        Object.values(rooms[socket.roomId].participants));
                }
            }
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Socket.io server running on port ${PORT}`);
});