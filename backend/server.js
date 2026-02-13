const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  pingTimeout: 60000,
  transports: ['websocket', 'polling']
});

// In-memory storage with persistence simulation
let tasks = [];
let users = new Map(); // Track connected users

// Activity log for real-time updates
let activityLog = [];

// Helper to maintain column order
const maintainColumnOrder = (tasksArray) => {
  // Sort tasks within each column by creation date or a custom order
  // For simplicity, we'll just return as-is, but you could implement
  // a more sophisticated ordering system here
  return tasksArray;
};

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Register user
  users.set(socket.id, {
    id: socket.id,
    connectedAt: new Date().toISOString()
  });

  // Send initial data
  socket.emit("sync:tasks", maintainColumnOrder(tasks));
  socket.emit("sync:activity", activityLog.slice(-20)); // Last 20 activities
  socket.emit("users:online", Array.from(users.values()));

  // Broadcast updated user count
  io.emit("users:count", users.size);

  // Task Creation
  socket.on("task:create", (taskData) => {
    const newTask = {
      ...taskData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: taskData.attachments || [],
      comments: [],
      assignedTo: taskData.assignedTo || null,
      dueDate: taskData.dueDate || null,
      order: tasks.length // Simple order field
    };
    tasks.push(newTask);

    // Add to activity log
    const activity = {
      id: uuidv4(),
      type: 'create',
      taskId: newTask.id,
      taskTitle: newTask.title,
      userId: socket.id,
      timestamp: new Date().toISOString()
    };
    activityLog.push(activity);
    if (activityLog.length > 100) activityLog.shift(); // Keep last 100

    io.emit("task:create", newTask);
    io.emit("activity:new", activity);
  });

  // Task Update
  socket.on("task:update", (updatedTask) => {
    const index = tasks.findIndex((t) => t.id === updatedTask.id);
    if (index !== -1) {
      tasks[index] = {
        ...tasks[index],
        ...updatedTask,
        updatedAt: new Date().toISOString()
      };

      const activity = {
        id: uuidv4(),
        type: 'update',
        taskId: tasks[index].id,
        taskTitle: tasks[index].title,
        userId: socket.id,
        timestamp: new Date().toISOString()
      };
      activityLog.push(activity);
      if (activityLog.length > 100) activityLog.shift();

      io.emit("task:update", tasks[index]);
      io.emit("activity:new", activity);
    }
  });

  // Explicit sync request handler
  socket.on("sync:tasks", () => {
    socket.emit("sync:tasks", maintainColumnOrder(tasks));
  });

  // Task Move with proper reordering
  socket.on("task:move", ({ id, status, sourceIndex, destinationIndex, sourceColumn, destinationColumn }) => {
    const taskIndex = tasks.findIndex((t) => t.id === id);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];
    const oldStatus = task.status;
    
    // Remove task from array
    tasks.splice(taskIndex, 1);
    
    // Update status
    task.status = status;
    task.updatedAt = new Date().toISOString();
    
    // Find insertion point based on destination column
    if (sourceColumn === destinationColumn) {
      // Reordering within same column
      const columnTasks = tasks.filter(t => t.status === status);
      const insertAtIndex = Math.min(destinationIndex, columnTasks.length);
      
      // Find position in main array
      let insertPos = 0;
      let count = 0;
      for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].status === status) {
          if (count === insertAtIndex) {
            insertPos = i;
            break;
          }
          count++;
        }
        insertPos = i + 1;
      }
      
      tasks.splice(insertPos, 0, task);
    } else {
      // Moving to different column - append at end of destination column
      let insertPos = tasks.length;
      for (let i = tasks.length - 1; i >= 0; i--) {
        if (tasks[i].status === status) {
          insertPos = i + 1;
          break;
        }
      }
      tasks.splice(insertPos, 0, task);
    }

    const activity = {
      id: uuidv4(),
      type: 'move',
      taskId: task.id,
      taskTitle: task.title,
      oldStatus,
      newStatus: status,
      userId: socket.id,
      timestamp: new Date().toISOString()
    };
    activityLog.push(activity);
    if (activityLog.length > 100) activityLog.shift();

    io.emit("task:move", {
      task: task,
      sourceIndex,
      destinationIndex,
      sourceColumn,
      destinationColumn
    });
    io.emit("activity:new", activity);
  });

  // Task Delete
  socket.on("task:delete", (taskId) => {
    const deletedTask = tasks.find(t => t.id === taskId);
    tasks = tasks.filter((t) => t.id !== taskId);

    if (deletedTask) {
      const activity = {
        id: uuidv4(),
        type: 'delete',
        taskId: deletedTask.id,
        taskTitle: deletedTask.title,
        userId: socket.id,
        timestamp: new Date().toISOString()
      };
      activityLog.push(activity);
      if (activityLog.length > 100) activityLog.shift();

      io.emit("task:delete", taskId);
      io.emit("activity:new", activity);
    }
  });

  // Add comment to task
  socket.on("task:comment", ({ taskId, comment }) => {
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index !== -1) {
      const newComment = {
        id: uuidv4(),
        text: comment,
        userId: socket.id,
        createdAt: new Date().toISOString()
      };

      if (!tasks[index].comments) tasks[index].comments = [];
      tasks[index].comments.push(newComment);

      io.emit("task:comment", { taskId, comment: newComment });
    }
  });

  // Bulk operations
  socket.on("tasks:bulk-update", (updatedTasks) => {
    tasks = tasks.map(task => {
      const updated = updatedTasks.find(ut => ut.id === task.id);
      return updated || task;
    });
    io.emit("sync:tasks", maintainColumnOrder(tasks));
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    users.delete(socket.id);
    io.emit("users:count", users.size);
    io.emit("users:online", Array.from(users.values()));
  });
});

// REST API endpoints for file uploads
app.post("/api/upload", (req, res) => {
  try {
    const { files } = req.body;
    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    users: users.size,
    tasks: tasks.length,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 WebSocket server ready for connections`);
});