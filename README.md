# 🚀 Real-Time Collaborative Kanban Board

A robust, full-stack Kanban task management system designed for seamless real-time collaboration. This application allows multiple users to visualize workflows, track task progress, and receive instant updates across all connected clients without page refreshes.

Built as a modern, real-time collaborative prototype demonstrating production-style architecture, it emphasizes performance, responsiveness, and real-time synchronicity using WebSocket technology.

---

## 🌐 Live Demo

Experience the live application deployed on Vercel (Frontend) and Render (Backend):

**Live Application URL:**  
[https://kanban-9o8c.vercel.app](https://kanban-9o8c.vercel.app)

*(Note: The backend is hosted on Render's free tier. Please allow up to 60 seconds for the initial connection if the server has spun down due to inactivity.)*

---

## 🏗️ System Architecture

The system follows a decoupling **Client-Server architecture** centered around event-driven communication.

### High-Level Data Flow

1.  **User Interaction**: A user performs an action (e.g., drags a task) on the React frontend.
2.  **Optimistic UI Update**: The frontend immediately updates the local state to provide instant feedback, even before the server confirms the action.
3.  **WebSocket Event Emission**: The client emits a socket event (e.g., `task:move`) to the Node.js backend.
4.  **Server Processing**: The backend receives the event, validates the data, updates the in-memory state, and persists changes to the local file system (JSON storage).
5.  **Broadcast**: The server broadcasts the update event to **all other connected clients**.
6.  **Client Synchronization**: Other clients receive the event and update their local state instantly, keeping everyone in sync.

This architecture ensures responsive real-time synchronization across connected clients.

### Collaboration Model
This application provides a shared real-time board visible to all connected users. There are no user accounts or private workspaces in the current version; everyone collaborates on the same dataset.

---

## 📡 Real-Time WebSocket Architecture

The core of the application's real-time capability is built on **Socket.IO**. The connection is robust, handling reconnections automatically and managing network fluctuations.

### Connection Lifecycle

1.  **Initialization**: On load, the client establishes a WebSocket connection to the backend.
2.  **Handshake**: The server accepts the connection, assigns a unique socket ID, and logs the user as "online".
3.  **Synchronization**: The client immediately requests a full state sync (`sync:tasks`) to ensure it has the latest data.
4.  **Heartbeat**: The connection is kept alive with periodic ping/pong packets.

### Event Protocol

The system uses a strict event-driven protocol:

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `task:create` | Client → Server | Task Data | Creates a new task and broadcasts it. |
| `task:update` | Client → Server | Task Data | Updates task details (title, description, etc.). |
| `task:move` | Client → Server | `{ id, status, index }` | Moves a task to a new column/position. |
| `task:delete` | Client → Server | Task ID | Removes a task permanently. |
| `task:comment`| Client → Server | `{ taskId, text }` | Adds a comment to a specific task. |
| `sync:tasks` | Server → Client | Array[Task] | Sends the full list of tasks to a client. |
| `users:count` | Server → Client | Integer | Updates the count of currently active users. |
| `activity:new` | Server → Client | Activity Object | Pushes a new entry to the activity log. |

---

## 🖥️ Frontend Architecture

The frontend is a **Single Page Application (SPA)** built with **React** and **Vite**, focusing on performance and user experience.

### Key Technologies

*   **React 18**: Core framework.
*   **Vite**: Build tool for lightning-fast development and optimized production bundles.
*   **@hello-pangea/dnd**: Provides accessible, physics-based drag-and-drop interactions.
*   **Socket.IO Client**: Manages real-time bi-directional communication.
*   **Framer Motion**: Powers smooth layout transitions and micro-interactions.
*   **Recharts**: Renders data visualization (lazy-loaded for performance).
*   **Custom CSS (via CSS variables)**: Styling approach using modern CSS features and responsive design patterns.

### Component Structure

*   **`KanbanBoard.jsx`**: The monolithic controller component. It manages:
    *   Global application state (tasks, users, connection status).
    *   Socket.IO event listeners and emitters.
    *   Optimistic UI logic for drag-and-drop.
    *   Modal interactions (Create/Edit/Details).
*   **`KanbanCharts.jsx`**: A specialized, lazy-loaded component for visualizing task metrics. It is code-split from the main bundle to improve initial load time.
*   **`KanbanBoard.css`**: Contains all responsive styling, media queries, and component-specific styles, separating concerns from logic.

### Optimization Strategies

*   **Code Splitting**: Heavy charting libraries are loaded only when needed.
*   **Debouncing**: Search input is debounced to prevent excessive state updates.
*   **Memoization**: `useMemo` and `useCallback` are used extensively to prevent unnecessary re-renders of the task list and metrics calculations.

---

## ⚙️ Backend Architecture

The backend is a lightweight Node.js server designed for real-time event handling utilizing **Express** and **Socket.IO**.

### Core Responsibilities

1.  **WebSocket Server**: Designed to support multiple concurrent users on a single server instance.
2.  **Persistence Layer**: Utilizing a **file-based JSON storage system** (`data/tasks.json`, `data/activity.json`). This allows data persistence during runtime without requiring a database.
3.  **Concurrency Management**: Sequential file writes reduce the likelihood of conflicts in low-traffic scenarios.
4.  **Activity Logging**: Automatically generates audit trails for every create, update, move, or delete action.
5.  **CORS Policy**: Configured to allow cross-origin requests from the deployed frontend.

### Data Management

*   **Tasks**: Stored as a flat array of objects with UUIDs.
*   **Activity Log**: A Last-In-First-Out (LIFO) stack of the 50 most recent actions.
*   **Active Users**: In-memory `Map` tracking connected socket IDs.

---

## 📂 Detailed File-by-File Explanation

### Backend (`/backend`)

| File | Description |
| :--- | :--- |
| `server.js` | The application entry point. Initializes the HTTP server, sets up Socket.IO, configures CORS, and defines all event handlers. It also contains the logic for reading/writing to the JSON persistence files. |
| `package.json` | Defines backend dependencies (`express`, `socket.io`, `cors`, `uuid`) and startup scripts. |
| `data/tasks.json` | (Generated) The persistent storage file for all task data. |
| `data/activity.json`| (Generated) The persistent storage file for the activity audit log. |

### Frontend (`/frontend`)

| File | Description |
| :--- | :--- |
| `src/main.jsx` | The React entry point. Mounts the application to the DOM. |
| `src/App.jsx` | The root component wrapper. |
| `src/components/KanbanBoard.jsx` | The core application logic. Handles state, sockets, drag-and-drop, and UI rendering. Primary stateful controller component. |
| `src/components/KanbanBoard.css` | Stylesheet containing CSS variables, layout rules, and responsive media queries. |
| `src/components/KanbanCharts.jsx` | Isolated component for rendering charts. Loaded lazily to reduce bundle size. |
| `src/tests/` | Contains all testing suites (Unit, Integration, E2E). |
| `vite.config.js` | Vite configuration, including proxy settings and build optimizations for chunk splitting. |
| `playwright.config.js` | Configuration for End-to-End testing, defining browser targets and timeouts. |

---

## 📊 Data Flow Walkthrough

### Scenario 1: User Moves a Task
1.  **User** drags "Task A" from *To Do* to *Done*.
2.  **Frontend** immediately updates the UI state (Optimistic Update).
3.  **Frontend** emits `task:move` event with `{ id: "task-a", status: "Done" }`.
4.  **Backend** receives the event, updates `tasks.json`, and logs the move in `activity.json`.
5.  **Backend** broadcasts `task:move` to all **other** clients.
6.  **Other Clients** receive the event and animate "Task A" moving to *Done*.

### Scenario 2: New User Joins
1.  **User** opens the application URL.
2.  **Frontend** connects to the WebSocket server.
3.  **Backend** increments the user count and emits `users:count`.
4.  **Frontend** listens for `sync:tasks` and populates the board with the current state.
5.  **Backend** broadcasts the new user count to everyone.

---

## 🧪 Testing Strategy

The project employs a comprehensive testing pyramid strategy:

1.  **Unit Testing (Vitest + React Testing Library)**
    *   **Focus**: Individual component logic, state updates, and rendering.
    *   **Key Tests**: Verifying the board renders, modal opens/closes, and validation logic works.

2.  **Integration Testing (Vitest)**
    *   **Focus**: Interactions between components and the mocked Socket.IO client.
    *   **Key Tests**: Ensuring `task:create` events actually update the local state and that socket listeners update the UI.

3.  **End-to-End Testing (Playwright)**
    *   **Focus**: Full user journeys in a real browser environment.
    *   **Key Tests**: Simulating a real user creating a task, dragging it across columns, and verifying the persistence.

All provided unit, integration, and E2E tests pass successfully.

---

## 🚀 Deployment Architecture

The application is deployed across two separate cloud providers for optimal performance and separation of concerns.

*   **Frontend**: Hosted on **Vercel** as a static site.
    *   Serves the React application globally via CDN.
*   **Backend**: Hosted on **Render** as a Node.js web service.
    *   Maintains the persistent WebSocket connection.
    *   Stores the JSON data files on the instance.

**Environment Variables:**
*   `VITE_API_URL`: Points the frontend to the Render backend URL.
*   `PORT`: Allows the backend to bind to the dynamic port assigned by Render.

---

## ⚠️ Known Limitations

1.  **Render Free Tier Latency**: The free instance on Render "sleeps" after 15 minutes of inactivity. The first request may take up to 60 seconds to wake the server.
2.  **Ephemeral Storage**: On the free tier, the file system is ephemeral. While the JSON files persist during the runtime, redeploying the server may reset the data (unless persistent disk storage is attached).
3.  **Scalability**: The current in-memory/file-based approach is designed for small-to-medium teams. For enterprise scale, the JSON storage should be replaced with a database like MongoDB or PostgreSQL.
4.  **Shared Board**: The application provides a shared public board with no user authentication or access control.

---

## 🛠️ How to Run Locally

Follow these steps to run the full stack on your local machine.

### Prerequisites
*   Node.js (v18 or higher)
*   npm

### 1. Backend Setup
```bash
cd backend
npm install
node server.js
```
The server will start on `http://localhost:5000`.

### 2. Frontend Setup
Open a new terminal:
```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend` directory:
```
VITE_API_URL=http://localhost:5000
```

Start the development server:
```bash
npm run dev
```
The application will be available at the URL shown in the terminal (typically `http://localhost:5173`).

---

## 📈 Future Improvements

*   **Database Integration**: Migrate from JSON files to MongoDB for robust data persistence.
*   **User Authentication**: Implement JWT-based auth to track individual user actions securely.
*   **Rich Text Editor**: Add a dedicated editor for task descriptions.
*   **Persistent Attachments**: Integrate AWS S3 or Cloudinary for reliable file storage.
*   **Mobile App**: Wrap the responsive web app into a React Native container.

---
*Developed as part of a technical evaluation.*
