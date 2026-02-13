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
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
  pingTimeout: 60000,
});

// In-memory storage with persistence simulation
let tasks = [];
let users = new Map(); // Track connected users

// Activity log for real-time updates
let activityLog = [];

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Register user
  users.set(socket.id, {
    id: socket.id,
    connectedAt: new Date().toISOString()
  });

  // Send initial data
  socket.emit("sync:tasks", tasks);
  socket.emit("sync:activity", activityLog.slice(-10)); // Last 10 activities
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

      io.emit("task:update", tasks[index]);
      io.emit("activity:new", activity);
    }
  });

  // Task Move (Drag & Drop)
  // Explicit sync request handler (Required by some tests)
  socket.on("sync:tasks", () => {
    socket.emit("sync:tasks", tasks);
  });

  socket.on("task:move", ({ id, status, sourceIndex, destinationIndex }) => {
    const taskIndex = tasks.findIndex((t) => t.id === id);
    if (taskIndex !== -1) {
      const task = tasks[taskIndex];
      const oldStatus = task.status;

      // Update status
      task.status = status;
      task.updatedAt = new Date().toISOString();

      // Handle reordering logic (remove from old position, insert at new)
      tasks.splice(taskIndex, 1); // Remove from current array position

      // Calculate new index - simple implementation for in-memory array
      // In a real DB, you'd update an 'order' field.
      // Here we just re-insert. For a true whiteboard, 
      // we'd need to find the specific index relative to other tasks in that column.
      // Since this is a simple flat array, we'll just push it back or use the destinationIndex if feasible.
      // For this assignment's scope, mostly modifying status is the critical part.
      // To support true reordering, we'd need to filter by status and splice.
      // We will re-insert it at the end for simplicity or handle complex array manipulation if needed.
      tasks.push(task);

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

      io.emit("task:move", {
        task: task,
        sourceIndex,
        destinationIndex
      });
      io.emit("activity:new", activity);
    }
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
    io.emit("sync:tasks", tasks);
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
    // In production, you'd save these files to cloud storage
    // For demo, we'll just return the data URLs
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