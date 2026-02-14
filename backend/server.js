const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow connections from Vercel/Render
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  pingTimeout: 60000,
  maxHttpBufferSize: 50 * 1024 * 1024, // 50MB
  transports: ['websocket', 'polling']
});

// Data persistence
const DATA_DIR = path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Helper functions for persistence
const loadData = () => {
  let tasks = [];
  let activityLog = [];

  try {
    if (fs.existsSync(TASKS_FILE)) {
      const data = fs.readFileSync(TASKS_FILE, 'utf8');
      tasks = JSON.parse(data);
    }
    if (fs.existsSync(ACTIVITY_FILE)) {
      const data = fs.readFileSync(ACTIVITY_FILE, 'utf8');
      activityLog = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }

  return { tasks, activityLog };
};

const saveData = (tasks, activityLog) => {
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(activityLog, null, 2));
  } catch (err) {
    console.error('Error saving data:', err);
  }
};

// Initialize data
let { tasks, activityLog } = loadData();
console.log(`Loaded ${tasks.length} tasks and ${activityLog.length} activities from file.`);
let users = new Map();

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  users.set(socket.id, {
    id: socket.id,
    connectedAt: new Date().toISOString()
  });

  // Send initial data
  socket.emit("sync:tasks", tasks);
  socket.emit("sync:activity", activityLog.slice(0, 50)); // Send first 50 (most recent)
  socket.emit("users:online", Array.from(users.values()));
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
      dueDate: taskData.dueDate || null
    };
    tasks.push(newTask);

    const activity = {
      id: uuidv4(),
      type: 'create',
      taskId: newTask.id,
      taskTitle: newTask.title,
      userId: socket.id,
      timestamp: new Date().toISOString()
    };
    activityLog.unshift(activity); // Add to beginning
    if (activityLog.length > 100) activityLog = activityLog.slice(0, 100);

    saveData(tasks, activityLog);

    io.emit("task:create", newTask);
    io.emit("activity:new", activity);
  });

  // Task Update
  socket.on("task:update", (updatedTask) => {
    const index = tasks.findIndex((t) => t.id === updatedTask.id);
    if (index !== -1) {
      tasks[index] = { ...tasks[index], ...updatedTask, updatedAt: new Date().toISOString() };

      const activity = {
        id: uuidv4(),
        type: 'update',
        taskId: tasks[index].id,
        taskTitle: tasks[index].title,
        userId: socket.id,
        timestamp: new Date().toISOString()
      };
      activityLog.unshift(activity);
      if (activityLog.length > 100) activityLog = activityLog.slice(0, 100);

      saveData(tasks, activityLog);

      io.emit("task:update", tasks[index]);
      io.emit("activity:new", activity);
    }
  });

  // Task Move
  socket.on("task:move", ({ id, status, destinationIndex }) => {
    const taskIndex = tasks.findIndex((t) => t.id === id);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];
    const oldStatus = task.status;

    // 1. Remove task from current position logic
    tasks.splice(taskIndex, 1);

    // 2. Update status
    task.status = status;
    task.updatedAt = new Date().toISOString();

    // 3. Find insertion point in main array
    // Filter tasks by the *destination* status to replicate the frontend's visual list
    const destColumnTasks = tasks.filter(t => t.status === status);

    let insertPos = 0;
    if (destColumnTasks.length === 0) {
      insertPos = tasks.length;
    } else if (destinationIndex >= destColumnTasks.length) {
      // Insert after the last task of this status
      const lastTask = destColumnTasks[destColumnTasks.length - 1];
      insertPos = tasks.findIndex(t => t.id === lastTask.id) + 1;
    } else {
      // Insert before the task at destinationIndex
      const refTask = destColumnTasks[destinationIndex];
      insertPos = tasks.findIndex(t => t.id === refTask.id);
    }

    // Handle edge case where findIndex might fail (shouldn't happen but safe to default to end)
    if (insertPos === -1) insertPos = tasks.length;

    tasks.splice(insertPos, 0, task);

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
    activityLog.unshift(activity);
    if (activityLog.length > 100) activityLog = activityLog.slice(0, 100);

    saveData(tasks, activityLog);

    // Emit FULL sync to ensure order consistency across all clients
    io.emit("sync:tasks", tasks);
    io.emit("activity:new", activity);
  });

  // Task Delete
  socket.on("task:delete", (taskId) => {
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (taskToDelete) {
      tasks = tasks.filter(t => t.id !== taskId);

      const activity = {
        id: uuidv4(),
        type: 'delete',
        taskId: taskToDelete.id,
        taskTitle: taskToDelete.title,
        userId: socket.id,
        timestamp: new Date().toISOString()
      };
      activityLog.unshift(activity);
      if (activityLog.length > 100) activityLog = activityLog.slice(0, 100);

      saveData(tasks, activityLog);

      io.emit("task:delete", taskId);
      io.emit("activity:new", activity);
    }
  });

  // Add comment
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

      saveData(tasks, activityLog);

      io.emit("task:comment", { taskId, comment: newComment });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    users.delete(socket.id);
    io.emit("users:count", users.size);
    io.emit("users:online", Array.from(users.values()));
  });
});

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