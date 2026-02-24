// ============================================
// SOCKET SERVICE
// ============================================
// File: utils/socketService.js
// Description: Socket.io service for real-time order updates
// ============================================

let io = null;

// Initialize socket.io
function initializeSocket(server) {
  const { Server } = require('socket.io');
  
  io = new Server(server, {
    cors: {
      origin: "*", // Allow all origins for now (can be restricted in production)
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // Handle order room joining
    socket.on('join_order', (orderId) => {
      const room = `order_${orderId}`;
      socket.join(room);
      console.log(`[SOCKET] Client ${socket.id} joined room: ${room}`);
    });

    // Handle order room leaving
    socket.on('leave_order', (orderId) => {
      const room = `order_${orderId}`;
      socket.leave(room);
      console.log(`[SOCKET] Client ${socket.id} left room: ${room}`);
    });

    // Handle kitchen room joining
    socket.on('join_kitchen', () => {
      socket.join('kitchen');
      console.log(`[SOCKET] Client ${socket.id} joined kitchen room`);
    });

    // Handle user room joining (for real-time notifications)
    socket.on('join_user', (userId) => {
      if (userId != null && userId !== '') {
        const room = `user_${userId}`;
        socket.join(room);
        console.log(`[SOCKET] Client ${socket.id} joined user room: ${room}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[SOCKET] Socket.io server initialized');
  return io;
}

function isConfirmedStatus(orderData) {
  const rawStatus = orderData?.status ?? orderData?.STATUS;
  if (rawStatus == null) return false;
  const status = typeof rawStatus === 'string' ? parseInt(rawStatus, 10) : rawStatus;
  return status === 2;
}

// Emit order update event
function emitOrderUpdate(orderId, orderData) {
  if (!io) {
    console.warn('[SOCKET] Socket.io not initialized');
    return;
  }

  const room = `order_${orderId}`;
  const payload = {
    order_id: orderId,
    order: orderData,
    timestamp: new Date().toISOString()
  };
  
  // Emit to order room unless status is CONFIRMED (2)
  if (!isConfirmedStatus(orderData)) {
    io.to(room).emit('order_updated', payload);
  }
  // Also emit to kitchen room
  io.to('kitchen').emit('order_updated', payload);

  console.log(`[SOCKET] Emitted order_updated to room: ${room} and kitchen`);
}

// Emit order created event
function emitOrderCreated(orderId, orderData) {
  if (!io) {
    console.warn('[SOCKET] Socket.io not initialized');
    return;
  }

  const room = `order_${orderId}`;
  const payload = {
    order_id: orderId,
    order: orderData,
    timestamp: new Date().toISOString()
  };

  // Emit to order room unless status is CONFIRMED (2)
  if (!isConfirmedStatus(orderData)) {
    io.to(room).emit('order_created', payload);
  }
  // Also emit to kitchen room (NEW ORDERS)
  io.to('kitchen').emit('order_created', payload);
  // Also emit globally for safety
  io.emit('order_created', payload);

  console.log(`[SOCKET] Emitted order_created to room: ${room} and kitchen`);
}

// Emit order items added event
function emitOrderItemsAdded(orderId, orderData) {
  if (!io) {
    console.warn('[SOCKET] Socket.io not initialized');
    return;
  }

  const room = `order_${orderId}`;
  const payload = {
    order_id: orderId,
    order: orderData,
    timestamp: new Date().toISOString()
  };

  // Emit to order room unless status is CONFIRMED (2)
  if (!isConfirmedStatus(orderData)) {
    io.to(room).emit('order_items_added', payload);
  }
  // Also emit to kitchen room
  io.to('kitchen').emit('order_items_added', payload);

  console.log(`[SOCKET] Emitted order_items_added to room: ${room} and kitchen`);
}

// Emit table updated event
function emitTableUpdated(tableData, action = 'updated') {
  if (!io) {
    console.warn('[SOCKET] Socket.io not initialized');
    return;
  }

  const tableId = tableData.id || tableData.table_id || tableData.IDNo;
  const payload = {
    table_id: tableId,
    table: tableData,
    action,
    timestamp: new Date().toISOString()
  };

  io.emit('table_updated', payload);
  console.log(`[SOCKET] Emitted table_updated (${action}) for table: ${tableId}`);
}

// Emit new notification to a specific user (restoadmin bell)
function emitNotificationCreated(userId, notification) {
  if (!io) {
    console.warn('[SOCKET] Socket.io not initialized');
    return;
  }
  const room = `user_${userId}`;
  io.to(room).emit('notification_new', notification);
  console.log(`[SOCKET] Emitted notification_new to room: ${room}`);
}

// Get socket.io instance
function getIO() {
  return io;
}

module.exports = {
  initializeSocket,
  emitOrderUpdate,
  emitOrderCreated,
  emitOrderItemsAdded,
  emitTableUpdated,
  emitNotificationCreated,
  getIO
};

