// ============================================
// SOCKET SERVICE
// ============================================
// File: utils/socketService.js
// Description: Socket.io service for real-time order updates
// ============================================

let io = null;
const SOCKET_LOG_EMITS = String(process.env.SOCKET_LOG_EMITS || '').toLowerCase() === 'true';
const SOCKET_LOG_CONNECTIONS = String(process.env.SOCKET_LOG_CONNECTIONS || '').toLowerCase() !== 'false';

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
    if (SOCKET_LOG_CONNECTIONS) {
      console.log(`[SOCKET] Client connected: ${socket.id}`);
    }

    // Handle order room joining
    socket.on('join_order', (orderId) => {
      const room = `order_${orderId}`;
      socket.join(room);
      if (SOCKET_LOG_CONNECTIONS) {
        console.log(`[SOCKET] Client ${socket.id} joined room: ${room}`);
      }
    });

    // Handle order room leaving
    socket.on('leave_order', (orderId) => {
      const room = `order_${orderId}`;
      socket.leave(room);
      if (SOCKET_LOG_CONNECTIONS) {
        console.log(`[SOCKET] Client ${socket.id} left room: ${room}`);
      }
    });

    // Handle kitchen room joining
    socket.on('join_kitchen', () => {
      socket.join('kitchen');
      if (SOCKET_LOG_CONNECTIONS) {
        console.log(`[SOCKET] Client ${socket.id} joined kitchen room`);
      }
    });

    // Handle cashier room joining
    socket.on('join_cashier', () => {
      socket.join('cashier');
      if (SOCKET_LOG_CONNECTIONS) {
        console.log(`[SOCKET] Client ${socket.id} joined cashier room`);
      }
    });

    socket.on('leave_cashier', () => {
      socket.leave('cashier');
      if (SOCKET_LOG_CONNECTIONS) {
        console.log(`[SOCKET] Client ${socket.id} left cashier room`);
      }
    });

    // Handle waiter room joining
    socket.on('join_waiter', () => {
      socket.join('waiter');
      if (SOCKET_LOG_CONNECTIONS) {
        console.log(`[SOCKET] Client ${socket.id} joined waiter room`);
      }
    });

    socket.on('leave_waiter', () => {
      socket.leave('waiter');
      if (SOCKET_LOG_CONNECTIONS) {
        console.log(`[SOCKET] Client ${socket.id} left waiter room`);
      }
    });

    // Handle user room joining (for real-time notifications)
    socket.on('join_user', (userId) => {
      if (userId != null && userId !== '') {
        const room = `user_${userId}`;
        socket.join(room);
        if (SOCKET_LOG_CONNECTIONS) {
          console.log(`[SOCKET] Client ${socket.id} joined user room: ${room}`);
        }
      }
    });

    socket.on('disconnect', () => {
      if (SOCKET_LOG_CONNECTIONS) {
        console.log(`[SOCKET] Client disconnected: ${socket.id}`);
      }
    });
  });

  if (SOCKET_LOG_CONNECTIONS) {
    console.log('[SOCKET] Socket.io server initialized');
  }
  return io;
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
  
  // Emit to order room, kitchen, cashier, waiter, and broadcast globally
  io.to(room).emit('order_updated', payload);
  io.to('kitchen').emit('order_updated', payload);
  io.to('cashier').emit('order_updated', payload);
  io.to('waiter').emit('order_updated', payload);
  io.emit('order_updated', payload);

  if (SOCKET_LOG_EMITS) {
    console.log(`[SOCKET] Emitted order_updated to room: ${room}, kitchen, cashier, waiter, and global`);
  }
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

  // Emit to order room, kitchen, cashier, waiter, and broadcast globally
  io.to(room).emit('order_created', payload);
  io.to('kitchen').emit('order_created', payload);
  io.to('cashier').emit('order_created', payload);
  io.to('waiter').emit('order_created', payload);
  io.emit('order_created', payload);

  if (SOCKET_LOG_EMITS) {
    console.log(`[SOCKET] Emitted order_created to room: ${room}, kitchen, cashier, waiter, and global`);
  }
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

  // Emit to order room, kitchen, cashier, waiter, and broadcast globally
  io.to(room).emit('order_items_added', payload);
  io.to('kitchen').emit('order_items_added', payload);
  io.to('cashier').emit('order_items_added', payload);
  io.to('waiter').emit('order_items_added', payload);
  io.emit('order_items_added', payload);

  if (SOCKET_LOG_EMITS) {
    console.log(`[SOCKET] Emitted order_items_added to room: ${room}, kitchen, cashier, waiter, and global`);
  }
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
  if (SOCKET_LOG_EMITS) {
    console.log(`[SOCKET] Emitted table_updated (${action}) for table: ${tableId}`);
  }
}

// Emit new notification to a specific user (restoadmin bell)
function emitNotificationCreated(userId, notification) {
  if (!io) {
    console.warn('[SOCKET] Socket.io not initialized');
    return;
  }
  const room = `user_${userId}`;
  io.to(room).emit('notification_new', notification);
  if (SOCKET_LOG_EMITS) {
    console.log(`[SOCKET] Emitted notification_new to room: ${room}`);
  }
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

