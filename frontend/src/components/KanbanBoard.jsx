import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import './KanbanBoard.css';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import io from 'socket.io-client';
import { format } from 'date-fns';

const KanbanCharts = lazy(() => import('./KanbanCharts'));
import {
    Plus, Trash2, Paperclip, MessageCircle, Calendar,
    Users, BarChart3, X, Check,
    AlertCircle, Upload, Filter, Search, MoreVertical
} from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';



const COLUMNS = [
    { id: 'To Do', title: 'To Do', color: '#3b82f6', icon: '📋' },
    { id: 'In Progress', title: 'In Progress', color: '#eab308', icon: '⚡' },
    { id: 'Done', title: 'Done', color: '#22c55e', icon: '✅' }
];

const PRIORITIES = [
    { value: 'Low', label: 'Low', color: '#4caf50', icon: '🟢' },
    { value: 'Medium', label: 'Medium', color: '#ff9800', icon: '🟡' },
    { value: 'High', label: 'High', color: '#f44336', icon: '🔴' },
    { value: 'Critical', label: 'Critical', color: '#9b1d1d', icon: '💀' }
];

const CATEGORIES = [
    { value: 'Bug', label: 'Bug', icon: '🐛' },
    { value: 'Feature', label: 'Feature', icon: '✨' },
    { value: 'Enhancement', label: 'Enhancement', icon: '🚀' },
    { value: 'Documentation', label: 'Documentation', icon: '📄' },
    { value: 'Testing', label: 'Testing', icon: '🧪' }
];

function KanbanBoard() {
    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState(0);
    const [activityLog, setActivityLog] = useState([]);
    const [viewMode, setViewMode] = useState('board');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPriority, setFilterPriority] = useState(null);
    const [filterCategory, setFilterCategory] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [isConnected, setIsConnected] = useState(true);

    const searchDebounceRef = useRef(null);
    const socketRef = useRef(null);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        status: 'To Do',
        priority: 'Medium',
        category: 'Feature',
        attachments: [],
        dueDate: null,
        assignedTo: null,
        tags: []
    });

    // Socket event handlers
    useEffect(() => {
        // Initialize socket connection
        const socketUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
        socketRef.current = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });

        const socket = socketRef.current;

        const handleConnect = () => {
            console.log('Connected to server');
            setIsConnected(true);
            toast.success('Connected to server');
            socket.emit('sync:tasks');
        };

        const handleDisconnect = () => {
            setIsConnected(false);
            toast.error('Disconnected from server. Reconnecting...');
        };

        const handleConnectError = (error) => {
            console.error('Connection error:', error);
            setIsConnected(false);
        };

        const handleSyncTasks = (serverTasks) => {
            setTasks(serverTasks);
            setIsLoading(false);
        };

        const handleSyncActivity = (serverActivity) => {
            setActivityLog(serverActivity);
        };

        const handleUsersCount = (count) => {
            setOnlineUsers(count);
        };

        const handleActivityNew = (activity) => {
            setActivityLog(prev => [activity, ...prev].slice(0, 30));
            if (activity.type === 'create') {
                toast.success(`New task: ${activity.taskTitle}`);
            } else if (activity.type === 'move') {
                toast(`${activity.taskTitle} moved`, { icon: '🔄' });
            }
        };

        const handleTaskCreate = (newTask) => {
            setTasks(prev => [...prev, newTask]);
        };

        const handleTaskUpdate = (updatedTask) => {
            setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
        };

        const handleTaskDelete = (taskId) => {
            setTasks(prev => prev.filter(t => t.id !== taskId));
            toast.success('Task deleted');
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);
        socket.on('sync:tasks', handleSyncTasks);
        socket.on('sync:activity', handleSyncActivity);
        socket.on('users:count', handleUsersCount);
        socket.on('activity:new', handleActivityNew);
        socket.on('task:create', handleTaskCreate);
        socket.on('task:update', handleTaskUpdate);
        socket.on('task:delete', handleTaskDelete);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('connect_error', handleConnectError);
            socket.off('sync:tasks', handleSyncTasks);
            socket.off('sync:activity', handleSyncActivity);
            socket.off('users:count', handleUsersCount);
            socket.off('activity:new', handleActivityNew);
            socket.off('task:create', handleTaskCreate);
            socket.off('task:update', handleTaskUpdate);
            socket.off('task:delete', handleTaskDelete);

            socket.disconnect?.();
        };
    }, []);

    // Force disconnection on page unload
    useEffect(() => {
        const handleUnload = () => {
            socketRef.current?.disconnect();
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => {
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, []);

    const handleDragEnd = useCallback((result) => {
        if (!result.destination) return;

        const { source, destination, draggableId } = result;

        // Optimistic update
        setTasks(prev => {
            const newTasks = Array.from(prev);
            const taskIndex = newTasks.findIndex(t => t.id === draggableId);
            if (taskIndex === -1) return prev;

            newTasks[taskIndex] = {
                ...newTasks[taskIndex],
                status: destination.droppableId
            };
            return newTasks;
        });

        socketRef.current?.emit('task:move', {
            id: draggableId,
            status: destination.droppableId,
            sourceIndex: source.index,
            destinationIndex: destination.index,
            sourceColumn: source.droppableId,
            destinationColumn: destination.droppableId
        });
    }, []);

    const onDrop = useCallback(async (acceptedFiles, fileRejections) => {
        if (fileRejections.length > 0) {
            toast.error("Unsupported file type or file too large (max 10MB)");
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        const filePromises = acceptedFiles.map(async (file) => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        url: reader.result,
                        uploadedAt: new Date().toISOString()
                    });
                };
                reader.readAsDataURL(file);
            });
        });

        try {
            const newAttachments = await Promise.all(filePromises);
            setFormData(prev => ({
                ...prev,
                attachments: [...prev.attachments, ...newAttachments]
            }));
            setUploadProgress(100);
            toast.success(`${newAttachments.length} file(s) uploaded`);
        } catch (error) {
            toast.error('Error uploading files');
        } finally {
            setIsUploading(false);
            setTimeout(() => setUploadProgress(0), 1000);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.svg'],
            'application/pdf': ['.pdf'],
            'text/plain': ['.txt'],
            'application/msword': ['.doc'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
        },
        maxSize: 10485760 // 10MB
    });

    const handleSubmit = useCallback((e) => {
        e.preventDefault();

        if (!formData.title.trim()) {
            toast.error('Title is required');
            return;
        }

        const taskData = {
            ...formData,
            updatedAt: new Date().toISOString()
        };

        if (editingTask) {
            socketRef.current?.emit('task:update', { ...editingTask, ...taskData });
            toast.success('Task updated');
        } else {
            socketRef.current?.emit('task:create', taskData);
            toast.success('Task created');
        }

        closeModal();
    }, [editingTask, formData]);

    const handleDelete = useCallback((id) => {
        if (window.confirm('Are you sure you want to delete this task?')) {
            socketRef.current?.emit('task:delete', id);
            closeModal();
        }
    }, []);

    const openModal = useCallback((task = null) => {
        setEditingTask(task);
        setFormData(task ? {
            title: task.title || '',
            description: task.description || '',
            status: task.status || 'To Do',
            priority: task.priority || 'Medium',
            category: task.category || 'Feature',
            attachments: task.attachments || [],
            dueDate: task.dueDate || null,
            assignedTo: task.assignedTo || null,
            tags: task.tags || []
        } : {
            title: '',
            description: '',
            status: 'To Do',
            priority: 'Medium',
            category: 'Feature',
            attachments: [],
            dueDate: null,
            assignedTo: null,
            tags: []
        });
        setIsModalOpen(true);
    }, []);

    const openTaskDetail = useCallback((task) => {
        setSelectedTask(task);
        setComments(task.comments || []);
        setIsDetailModalOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        setIsModalOpen(false);
        setEditingTask(null);
    }, []);

    const handleAddComment = useCallback(() => {
        if (!newComment.trim() || !selectedTask) return;

        const comment = {
            id: Date.now().toString(),
            text: newComment,
            userId: socketRef.current?.id,
            createdAt: new Date().toISOString()
        };

        socketRef.current?.emit('task:comment', {
            taskId: selectedTask.id,
            comment: newComment
        });

        setComments(prev => [...prev, comment]);
        setNewComment('');
        toast.success('Comment added');
    }, [newComment, selectedTask]);

    // Debounced search
    const handleSearchChange = (e) => {
        const value = e.target.value;
        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }
        searchDebounceRef.current = setTimeout(() => {
            setSearchTerm(value);
        }, 300);
    };

    const metrics = useMemo(() => {
        const stats = tasks.reduce((acc, t) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
        }, {});

        const columnData = COLUMNS.map(col => ({
            name: col.title,
            count: stats[col.id] || 0,
            color: col.color
        }));

        const priorityData = PRIORITIES.map(p => ({
            name: p.value,
            count: tasks.filter(t => t.priority === p.value).length,
            color: p.color
        }));

        const completion = tasks.length
            ? Math.round(((stats['Done'] || 0) / tasks.length) * 100)
            : 0;

        const totalAttachments = tasks.reduce((sum, t) => sum + (t.attachments?.length || 0), 0);
        const overdueTasks = tasks.filter(t =>
            t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'Done'
        ).length;

        return {
            columnData,
            priorityData,
            completion,
            totalAttachments,
            overdueTasks,
            totalTasks: tasks.length
        };
    }, [tasks]);

    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                task.description?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesPriority = !filterPriority || task.priority === filterPriority.value;
            const matchesCategory = !filterCategory || task.category === filterCategory.value;
            return matchesSearch && matchesPriority && matchesCategory;
        });
    }, [tasks, searchTerm, filterPriority, filterCategory]);

    if (isLoading) {
        return (
            <div style={styles.loadingContainer}>
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                    <div style={styles.loader} />
                </motion.div>
                <p>Loading your workspace...</p>
            </div>
        );
    }

    return (
        <>
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />

            <div className="kanban-container" style={styles.container}>
                {/* Connection Status */}
                {!isConnected && (
                    <div style={styles.connectionBanner}>
                        Reconnecting to server...
                    </div>
                )}

                {/* Header */}
                <motion.header
                    className="kanban-header"
                    style={styles.header}
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                >
                    <div style={styles.headerLeft}>
                        <h1 style={styles.title}>Real-time Kanban Board</h1>
                        <span className="sr-only">Kanban Board</span>
                        <div style={styles.badge}>
                            <Users size={14} />
                            <span>{onlineUsers} online</span>
                        </div>
                    </div>

                    <div style={styles.headerRight}>
                        <div className="search-container" style={styles.searchContainer}>
                            <Search size={18} style={styles.searchIcon} />
                            <input
                                type="text"
                                className="kanban-input"
                                placeholder="Search tasks..."
                                onChange={handleSearchChange}
                                style={styles.searchInput}
                                aria-label="Search tasks"
                            />
                        </div>

                        <button
                            className="filter-btn"
                            style={styles.filterButton}
                            onClick={() => setShowFilters(!showFilters)}
                            aria-label="Toggle filters"
                        >
                            <Filter size={18} />
                        </button>

                        <div style={styles.viewToggle}>
                            <button
                                style={{ ...styles.viewButton, background: viewMode === 'board' ? '#e0e7ff' : 'transparent' }}
                                onClick={() => setViewMode('board')}
                                aria-label="Board view"
                            >
                                <BarChart3 size={18} />
                            </button>
                        </div>

                        <button
                            className="activity-toggle"
                            style={styles.activityToggle}
                            onClick={() => setIsActivityOpen(!isActivityOpen)}
                            aria-label="Toggle activity feed"
                        >
                            <MessageCircle size={18} />
                            <span style={styles.activityBadge}>{activityLog.length}</span>
                        </button>

                        <motion.button
                            className="add-button"
                            style={styles.addButton}
                            onClick={() => openModal()}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            aria-label="Create new task"
                        >
                            <Plus size={20} />
                            <span className="add-button-text">New Task</span>
                        </motion.button>
                    </div>
                </motion.header>

                {/* Filters Panel */}
                <AnimatePresence>
                    {showFilters && (
                        <motion.div
                            className="filters-panel"
                            style={styles.filtersPanel}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                        >
                            <div className="filters-content" style={styles.filtersContent}>
                                <div className="filter-group" style={styles.filterGroup}>
                                    <label>Priority</label>
                                    <Select
                                        options={PRIORITIES}
                                        value={filterPriority}
                                        onChange={setFilterPriority}
                                        isClearable
                                        placeholder="All Priorities"
                                        styles={selectStyles}
                                    />
                                </div>
                                <div className="filter-group" style={styles.filterGroup}>
                                    <label>Category</label>
                                    <Select
                                        options={CATEGORIES}
                                        value={filterCategory}
                                        onChange={setFilterCategory}
                                        isClearable
                                        placeholder="All Categories"
                                        styles={selectStyles}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Metrics Dashboard */}
                <motion.div
                    className="metrics-container"
                    style={styles.metricsContainer}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                >
                    <div style={styles.metricCard}>
                        <div style={{ ...styles.metricIcon, background: '#e0e7ff' }}>
                            <BarChart3 size={20} color="#4f46e5" />
                        </div>
                        <div>
                            <div style={styles.metricValue}>{metrics.completion}%</div>
                            <div style={styles.metricLabel}>Completion</div>
                        </div>
                    </div>

                    <div style={styles.metricCard}>
                        <div style={{ ...styles.metricIcon, background: '#fee2e2' }}>
                            <AlertCircle size={20} color="#ef4444" />
                        </div>
                        <div>
                            <div style={styles.metricValue}>{metrics.overdueTasks}</div>
                            <div style={styles.metricLabel}>Overdue</div>
                        </div>
                    </div>

                    <div style={styles.metricCard}>
                        <div style={{ ...styles.metricIcon, background: '#dbeafe' }}>
                            <Paperclip size={20} color="#3b82f6" />
                        </div>
                        <div>
                            <div style={styles.metricValue}>{metrics.totalAttachments}</div>
                            <div style={styles.metricLabel}>Attachments</div>
                        </div>
                    </div>

                    <div style={styles.metricCard}>
                        <div style={{ ...styles.metricIcon, background: '#f3e8ff' }}>
                            <Check size={20} color="#a855f7" />
                        </div>
                        <div>
                            <div style={styles.metricValue}>{metrics.totalTasks}</div>
                            <div style={styles.metricLabel}>Total Tasks</div>
                        </div>
                    </div>
                </motion.div>

                {/* Charts */}
                <Suspense fallback={
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                        Loading visualization...
                    </div>
                }>
                    <KanbanCharts metrics={metrics} />
                </Suspense>

                {/* Main Content Area */}
                <div className="main-content" style={styles.mainContent}>
                    {/* Board */}
                    <div className="board-wrapper" style={{ ...styles.boardWrapper, width: isActivityOpen ? 'calc(100% - 320px)' : '100%' }}>
                        {viewMode === 'board' ? (
                            <DragDropContext onDragEnd={handleDragEnd}>
                                <div className="board" style={styles.board}>
                                    {COLUMNS.map(col => (
                                        <Droppable key={col.id} droppableId={col.id}>
                                            {(provided, snapshot) => (
                                                <motion.div
                                                    ref={provided.innerRef}
                                                    {...provided.droppableProps}
                                                    className="kanban-column"
                                                    style={{
                                                        ...styles.column,
                                                        background: snapshot.isDraggingOver ? '#e0e7ff' : '#f8fafc',
                                                        borderColor: snapshot.isDraggingOver ? col.color : '#e2e8f0'
                                                    }}
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: 0.1 * COLUMNS.indexOf(col) }}
                                                >
                                                    <div style={styles.columnHeader}>
                                                        <div style={styles.columnTitle}>
                                                            <span style={styles.columnIcon}>{col.icon}</span>
                                                            <h3>{col.title}</h3>
                                                            <span style={styles.taskCount}>
                                                                {filteredTasks.filter(t => t.status === col.id).length}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div style={styles.taskList}>
                                                        {filteredTasks
                                                            .filter(t => t.status === col.id)
                                                            .map((task, index) => (
                                                                <Draggable key={task.id} draggableId={task.id} index={index}>
                                                                    {(provided, snapshot) => (
                                                                        <motion.div
                                                                            ref={provided.innerRef}
                                                                            {...provided.draggableProps}
                                                                            {...provided.dragHandleProps}
                                                                            className="task-card"
                                                                            style={{
                                                                                ...styles.taskCard,
                                                                                ...provided.draggableProps.style,
                                                                                boxShadow: snapshot.isDragging
                                                                                    ? '0 8px 16px rgba(0,0,0,0.1)'
                                                                                    : '0 1px 3px rgba(0,0,0,0.05)',
                                                                                borderLeft: `4px solid ${PRIORITIES.find(p => p.value === task.priority)?.color || '#94a3b8'
                                                                                    }`
                                                                            }}
                                                                            whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                                            onClick={() => openTaskDetail(task)}
                                                                        >
                                                                            <div style={styles.taskHeader}>
                                                                                <div style={styles.taskBadges}>
                                                                                    <span style={{
                                                                                        ...styles.priorityBadge,
                                                                                        background: PRIORITIES.find(p => p.value === task.priority)?.color
                                                                                    }}>
                                                                                        {PRIORITIES.find(p => p.value === task.priority)?.icon}
                                                                                        {task.priority}
                                                                                    </span>
                                                                                    <span style={styles.categoryBadge}>
                                                                                        {CATEGORIES.find(c => c.value === task.category)?.icon}
                                                                                        {task.category}
                                                                                    </span>
                                                                                </div>
                                                                                <button
                                                                                    className="task-menu-button"
                                                                                    style={styles.taskMenuButton}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        openModal(task);
                                                                                    }}
                                                                                >
                                                                                    <MoreVertical size={16} />
                                                                                </button>
                                                                            </div>

                                                                            <h4 style={styles.taskTitle}>{task.title}</h4>

                                                                            {task.description && (
                                                                                <p style={styles.taskDescription}>
                                                                                    {task.description.substring(0, 60)}
                                                                                    {task.description.length > 60 && '...'}
                                                                                </p>
                                                                            )}

                                                                            <div style={styles.taskMeta}>
                                                                                {task.dueDate && (
                                                                                    <div style={styles.metaItem}>
                                                                                        <Calendar size={14} />
                                                                                        <span>{format(new Date(task.dueDate), 'MMM d')}</span>
                                                                                    </div>
                                                                                )}

                                                                                {task.attachments?.length > 0 && (
                                                                                    <div style={styles.metaItem}>
                                                                                        <Paperclip size={14} />
                                                                                        <span>{task.attachments.length}</span>
                                                                                    </div>
                                                                                )}

                                                                                {task.comments?.length > 0 && (
                                                                                    <div style={styles.metaItem}>
                                                                                        <MessageCircle size={14} />
                                                                                        <span>{task.comments.length}</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </Draggable>
                                                            ))}
                                                        {provided.placeholder}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </Droppable>
                                    ))}
                                </div>
                            </DragDropContext>
                        ) : (
                            // List View
                            <div style={styles.listView}>
                                {filteredTasks.map(task => (
                                    <motion.div
                                        key={task.id}
                                        className="list-item"
                                        style={styles.listItem}
                                        whileHover={{ x: 4 }}
                                        onClick={() => openTaskDetail(task)}
                                    >
                                        <div style={styles.listItemLeft}>
                                            <span style={{
                                                ...styles.listPriorityDot,
                                                background: PRIORITIES.find(p => p.value === task.priority)?.color
                                            }} />
                                            <div>
                                                <h4>{task.title}</h4>
                                                <p>{task.description}</p>
                                            </div>
                                        </div>
                                        <div style={styles.listItemRight}>
                                            <span style={styles.listStatus}>{task.status}</span>
                                            <span style={styles.listCategory}>{task.category}</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Activity Feed - Collapsible */}
                    <AnimatePresence>
                        {isActivityOpen && (
                            <motion.div
                                className="activity-feed"
                                style={styles.activityFeed}
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: 300, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div style={styles.activityHeader}>
                                    <h3 style={styles.activityTitle}>Live Activity</h3>
                                    <button
                                        className="activity-close"
                                        style={styles.activityClose}
                                        onClick={() => setIsActivityOpen(false)}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                <div style={styles.activityList}>
                                    {activityLog.length === 0 ? (
                                        <p style={styles.noActivity}>No recent activity</p>
                                    ) : (
                                        activityLog.map(activity => (
                                            <motion.div
                                                key={activity.id}
                                                style={styles.activityItem}
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                            >
                                                <div style={styles.activityIcon}>
                                                    {activity.type === 'create' && '➕'}
                                                    {activity.type === 'update' && '✏️'}
                                                    {activity.type === 'move' && '🔄'}
                                                    {activity.type === 'delete' && '🗑️'}
                                                </div>
                                                <div style={styles.activityContent}>
                                                    <p style={styles.activityText}>
                                                        <strong>{activity.taskTitle}</strong> {activity.type === 'move'
                                                            ? `moved to ${activity.newStatus}`
                                                            : `${activity.type}d`}
                                                    </p>
                                                    <p style={styles.activityTime}>
                                                        {format(new Date(activity.timestamp), 'HH:mm')}
                                                    </p>
                                                </div>
                                            </motion.div>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Task Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        style={styles.modalOverlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeModal}
                    >
                        <motion.div
                            style={styles.modal}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={styles.modalHeader}>
                                <h2 style={styles.modalTitle}>
                                    {editingTask ? 'Edit Task' : 'Create New Task'}
                                </h2>
                                <button style={styles.closeButton} onClick={closeModal}>
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit}>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Title *</label>
                                    <input
                                        required
                                        className="kanban-input"
                                        style={styles.input}
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="Enter task title"
                                    />
                                </div>

                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Description</label>
                                    <textarea
                                        style={styles.textarea}
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Describe the task..."
                                        rows={4}
                                    />
                                </div>

                                <div className="form-row" style={styles.formRow}>
                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Status</label>
                                        <Select
                                            options={COLUMNS.map(c => ({ value: c.id, label: c.title }))}
                                            value={{ value: formData.status, label: formData.status }}
                                            onChange={opt => setFormData({ ...formData, status: opt.value })}
                                            styles={selectStyles}
                                        />
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Priority</label>
                                        <Select
                                            options={PRIORITIES}
                                            value={PRIORITIES.find(p => p.value === formData.priority)}
                                            onChange={opt => setFormData({ ...formData, priority: opt.value })}
                                            styles={selectStyles}
                                        />
                                    </div>
                                </div>

                                <div style={styles.formRow}>
                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Category</label>
                                        <CreatableSelect
                                            options={CATEGORIES}
                                            value={CATEGORIES.find(c => c.value === formData.category)}
                                            onChange={opt => setFormData({ ...formData, category: opt.value })}
                                            styles={selectStyles}
                                        />
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Due Date</label>
                                        <input
                                            type="date"
                                            style={styles.input}
                                            value={formData.dueDate || ''}
                                            onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Tags</label>
                                    <CreatableSelect
                                        isMulti
                                        options={[]}
                                        value={formData.tags?.map(tag => ({ label: tag, value: tag }))}
                                        onChange={opts => setFormData({
                                            ...formData,
                                            tags: opts?.map(opt => opt.value) || []
                                        })}
                                        placeholder="Add tags..."
                                        styles={selectStyles}
                                    />
                                </div>

                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Attachments</label>
                                    <div
                                        {...getRootProps()}
                                        style={{
                                            ...styles.dropzone,
                                            borderColor: isDragActive ? '#4f46e5' : '#d1d5db',
                                            background: isDragActive ? '#e0e7ff' : '#f9fafb'
                                        }}
                                    >
                                        <input {...getInputProps()} />
                                        <Upload size={24} color="#6b7280" />
                                        {isDragActive ? (
                                            <p>Drop files here...</p>
                                        ) : (
                                            <p>Drag & drop files, or click to select</p>
                                        )}
                                    </div>

                                    {isUploading && (
                                        <div style={styles.progressBar}>
                                            <div style={{ ...styles.progressFill, width: `${uploadProgress}%` }} />
                                        </div>
                                    )}

                                    <div style={styles.previewContainer}>
                                        {formData.attachments.map((file, i) => (
                                            <motion.div
                                                key={i}
                                                style={styles.previewItem}
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                            >
                                                {file.type.startsWith('image/') ? (
                                                    <img src={file.url} alt={file.name} style={styles.thumb} />
                                                ) : (
                                                    <div style={styles.docThumb}>
                                                        {file.name.split('.').pop()}
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({
                                                        ...prev,
                                                        attachments: prev.attachments.filter((_, idx) => idx !== i)
                                                    }))}
                                                    className="remove-btn"
                                                    style={styles.removeBtn}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>

                                <div style={styles.modalFooter}>
                                    {editingTask && (
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(editingTask.id)}
                                            className="button btn-danger"
                                            style={styles.dangerButton}
                                        >
                                            <Trash2 size={18} />
                                            Delete
                                        </button>
                                    )}
                                    <div style={styles.modalFooterRight}>
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className="button btn-cancel"
                                            style={styles.cancelButton}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="button btn-save"
                                            style={styles.saveButton}
                                        >
                                            <Check size={18} />
                                            {editingTask ? 'Update' : 'Create'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Task Detail Modal */}
            <AnimatePresence>
                {isDetailModalOpen && selectedTask && (
                    <motion.div
                        style={styles.modalOverlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsDetailModalOpen(false)}
                    >
                        <motion.div
                            style={{ ...styles.modal, maxWidth: '600px' }}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={styles.modalHeader}>
                                <h2 style={styles.modalTitle}>{selectedTask.title}</h2>
                                <button
                                    style={styles.closeButton}
                                    onClick={() => setIsDetailModalOpen(false)}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={styles.detailContent}>
                                <p style={styles.detailDescription}>{selectedTask.description || 'No description'}</p>

                                <div style={styles.detailMeta}>
                                    <div style={styles.detailMetaItem}>
                                        <strong>Status:</strong> {selectedTask.status}
                                    </div>
                                    <div style={styles.detailMetaItem}>
                                        <strong>Priority:</strong>
                                        <span style={{
                                            ...styles.priorityBadge,
                                            background: PRIORITIES.find(p => p.value === selectedTask.priority)?.color,
                                            marginLeft: '8px'
                                        }}>
                                            {selectedTask.priority}
                                        </span>
                                    </div>
                                    <div style={styles.detailMetaItem}>
                                        <strong>Category:</strong> {selectedTask.category}
                                    </div>
                                    {selectedTask.dueDate && (
                                        <div style={styles.detailMetaItem}>
                                            <strong>Due:</strong> {format(new Date(selectedTask.dueDate), 'PPP')}
                                        </div>
                                    )}
                                </div>

                                {/* Comments Section */}
                                <div style={styles.commentsSection}>
                                    <h3 style={styles.commentsTitle}>Comments</h3>
                                    <div style={styles.commentsList}>
                                        {comments.length === 0 ? (
                                            <p style={styles.noComments}>No comments yet</p>
                                        ) : (
                                            comments.map(comment => (
                                                <div key={comment.id} style={styles.commentItem}>
                                                    <div style={styles.commentHeader}>
                                                        <span style={styles.commentAuthor}>User</span>
                                                        <span style={styles.commentTime}>
                                                            {format(new Date(comment.createdAt), 'MMM d, HH:mm')}
                                                        </span>
                                                    </div>
                                                    <p style={styles.commentText}>{comment.text}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div style={styles.commentInput}>
                                        <input
                                            type="text"
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            placeholder="Add a comment..."
                                            style={styles.commentField}
                                            onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                                        />
                                        <button
                                            onClick={handleAddComment}
                                            style={styles.commentButton}
                                        >
                                            Send
                                        </button>
                                    </div>
                                </div>

                                {/* Attachments Section */}
                                {selectedTask.attachments?.length > 0 && (
                                    <div style={styles.attachmentsSection}>
                                        <h3 style={styles.commentsTitle}>Attachments</h3>
                                        <div style={styles.previewContainer}>
                                            {selectedTask.attachments.map((file, i) => (
                                                <div key={i} style={styles.previewItem}>
                                                    {file.type?.startsWith('image/') ? (
                                                        <img src={file.url} alt={file.name} style={styles.thumb} />
                                                    ) : (
                                                        <div style={styles.docThumb}>
                                                            {file.name?.split('.').pop()}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

const selectStyles = {
    control: (base) => ({
        ...base,
        minHeight: '38px',
        borderColor: '#e2e8f0',
        boxShadow: 'none',
        '&:hover': {
            borderColor: '#cbd5e1'
        }
    }),
    menu: (base) => ({
        ...base,
        zIndex: 100
    })
};

const styles = {
    container: {
        padding: 'clamp(12px, 3vw, 24px)',
        background: '#f8fafc',
        minHeight: '100vh',
        color: '#1e293b',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        position: 'relative'
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: '16px',
        color: '#64748b'
    },
    loader: {
        width: '40px',
        height: '40px',
        border: '3px solid #e2e8f0',
        borderTopColor: '#4f46e5',
        borderRadius: '50%'
    },
    connectionBanner: {
        background: '#f59e0b',
        color: 'white',
        padding: '8px',
        textAlign: 'center',
        borderRadius: '8px',
        marginBottom: '16px',
        fontSize: '14px'
    },
    header: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        padding: '8px 0',
        flexWrap: 'wrap',
        gap: '16px'
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap'
    },
    title: {
        fontSize: 'clamp(1.5rem, 4vw, 1.8rem)',
        fontWeight: '700',
        margin: 0,
        background: 'linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
    },
    badge: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        background: '#f1f5f9',
        borderRadius: '20px',
        fontSize: '0.875rem',
        color: '#475569',
        whiteSpace: 'nowrap'
    },
    headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap'
    },
    searchContainer: {
        position: 'relative',
        width: 'clamp(200px, 30vw, 300px)'
    },
    searchIcon: {
        position: 'absolute',
        left: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#94a3b8'
    },
    searchInput: {
        width: '100%',
        padding: '10px 16px 10px 40px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        fontSize: '0.9rem',
        outline: 'none',
        transition: 'all 0.2s'
    },
    filterButton: {
        padding: '10px',
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        cursor: 'pointer',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s'
    },
    viewToggle: {
        display: 'flex',
        gap: '4px',
        padding: '4px',
        background: '#f1f5f9',
        borderRadius: '8px'
    },
    viewButton: {
        padding: '8px',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s'
    },
    activityToggle: {
        position: 'relative',
        padding: '10px',
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        cursor: 'pointer',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s'
    },
    activityBadge: {
        position: 'absolute',
        top: '-5px',
        right: '-5px',
        background: '#ef4444',
        color: 'white',
        fontSize: '10px',
        padding: '2px 4px',
        borderRadius: '10px',
        minWidth: '16px',
        textAlign: 'center'
    },
    addButton: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        background: '#4f46e5',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap'
    },
    filtersPanel: {
        overflow: 'hidden',
        marginBottom: '20px'
    },
    filtersContent: {
        padding: '16px',
        background: 'white',
        borderRadius: '12px',
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap'
    },
    filterGroup: {
        flex: '1 1 200px',
        minWidth: '200px'
    },
    metricsContainer: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
    },
    metricCard: {
        padding: '16px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    },
    metricIcon: {
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
    },
    metricValue: {
        fontSize: 'clamp(1.2rem, 2vw, 1.5rem)',
        fontWeight: '700',
        color: '#1e293b',
        lineHeight: '1.2'
    },
    metricLabel: {
        fontSize: '0.875rem',
        color: '#64748b'
    },
    chartsRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
    },
    chartCard: {
        padding: '16px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        border: '1px solid #e2e8f0'
    },
    chartTitle: {
        margin: '0 0 16px 0',
        fontSize: '1rem',
        fontWeight: '600',
        color: '#475569'
    },
    mainContent: {
        display: 'flex',
        gap: '20px',
        position: 'relative'
    },
    boardWrapper: {
        transition: 'width 0.3s ease',
        overflowX: 'auto'
    },
    board: {
        display: 'flex',
        gap: '20px',
        padding: '4px 0 20px 0',
        minWidth: 'min-content'
    },
    column: {
        flex: '0 0 300px',
        background: '#f8fafc',
        borderRadius: '12px',
        padding: '16px',
        border: '2px solid #e2e8f0',
        transition: 'border-color 0.2s'
    },
    columnHeader: {
        marginBottom: '16px'
    },
    columnTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    columnIcon: {
        fontSize: '1.2rem'
    },
    taskCount: {
        marginLeft: 'auto',
        padding: '2px 8px',
        background: '#e2e8f0',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: '600',
        color: '#475569'
    },
    taskList: {
        minHeight: '400px'
    },
    taskCard: {
        background: 'white',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
        cursor: 'grab',
        border: '1px solid #e2e8f0',
        transition: 'all 0.2s',
        userSelect: 'none'
    },
    taskHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '8px'
    },
    taskBadges: {
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap'
    },
    priorityBadge: {
        padding: '2px 6px',
        borderRadius: '12px',
        fontSize: '0.65rem',
        fontWeight: '600',
        color: 'white',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px'
    },
    categoryBadge: {
        padding: '2px 6px',
        background: '#e2e8f0',
        borderRadius: '12px',
        fontSize: '0.65rem',
        fontWeight: '600',
        color: '#475569',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px'
    },
    taskMenuButton: {
        padding: '4px',
        background: 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        color: '#94a3b8'
    },
    taskTitle: {
        margin: '0 0 6px 0',
        fontSize: '0.95rem',
        fontWeight: '600',
        color: '#1e293b'
    },
    taskDescription: {
        margin: '0 0 8px 0',
        fontSize: '0.8rem',
        color: '#64748b',
        lineHeight: '1.4'
    },
    taskMeta: {
        display: 'flex',
        gap: '12px',
        fontSize: '0.75rem',
        color: '#94a3b8',
        flexWrap: 'wrap'
    },
    metaItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
    },
    activityFeed: {
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '16px',
        overflow: 'hidden',
        height: 'fit-content',
        position: 'sticky',
        top: '20px'
    },
    activityHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
    },
    activityTitle: {
        margin: 0,
        fontSize: '1rem',
        fontWeight: '600',
        color: '#1e293b'
    },
    activityClose: {
        padding: '4px',
        background: 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        color: '#64748b',
        display: 'none'
    },
    activityList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxHeight: 'calc(100vh - 200px)',
        overflowY: 'auto'
    },
    activityItem: {
        display: 'flex',
        gap: '12px',
        padding: '10px',
        background: '#f8fafc',
        borderRadius: '8px',
        fontSize: '0.85rem'
    },
    activityIcon: {
        fontSize: '1rem'
    },
    activityContent: {
        flex: 1
    },
    activityText: {
        margin: '0 0 2px 0',
        fontSize: '0.85rem',
        color: '#334155'
    },
    activityTime: {
        margin: 0,
        fontSize: '0.7rem',
        color: '#94a3b8'
    },
    noActivity: {
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '0.9rem',
        padding: '20px'
    },
    listView: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    },
    listItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px',
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    listItemLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flex: 1
    },
    listPriorityDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        flexShrink: 0
    },
    listItemRight: {
        display: 'flex',
        gap: '12px',
        alignItems: 'center'
    },
    listStatus: {
        padding: '4px 8px',
        background: '#f1f5f9',
        borderRadius: '12px',
        fontSize: '0.75rem',
        color: '#475569'
    },
    listCategory: {
        padding: '4px 8px',
        background: '#e2e8f0',
        borderRadius: '12px',
        fontSize: '0.75rem',
        color: '#475569'
    },
    modalOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px'
    },
    modal: {
        background: 'white',
        borderRadius: '16px',
        padding: 'clamp(16px, 4vw, 24px)',
        width: '500px',
        maxWidth: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
    },
    modalHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
    },
    modalTitle: {
        margin: 0,
        fontSize: '1.25rem',
        fontWeight: '600'
    },
    closeButton: {
        padding: '8px',
        background: 'transparent',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        color: '#64748b'
    },
    formGroup: {
        marginBottom: '16px'
    },
    formRow: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '16px'
    },
    label: {
        display: 'block',
        marginBottom: '6px',
        fontSize: '0.9rem',
        fontWeight: '500',
        color: '#475569'
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        fontSize: '0.95rem',
        outline: 'none',
        transition: 'all 0.2s'
    },
    textarea: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        fontSize: '0.95rem',
        resize: 'vertical',
        outline: 'none'
    },
    dropzone: {
        border: '2px dashed #e2e8f0',
        borderRadius: '8px',
        padding: '20px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
        marginBottom: '12px'
    },
    progressBar: {
        height: '4px',
        background: '#e2e8f0',
        borderRadius: '2px',
        marginBottom: '12px',
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        background: '#4f46e5',
        transition: 'width 0.3s ease'
    },
    previewContainer: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginTop: '8px'
    },
    previewItem: {
        position: 'relative',
        width: '60px',
        height: '60px'
    },
    thumb: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: '6px'
    },
    docThumb: {
        width: '100%',
        height: '100%',
        background: '#e2e8f0',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.7rem',
        fontWeight: 'bold',
        color: '#475569',
        textTransform: 'uppercase'
    },
    removeBtn: {
        position: 'absolute',
        top: '-6px',
        right: '-6px',
        width: '18px',
        height: '18px',
        background: '#ef4444',
        color: 'white',
        border: 'none',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer'
    },
    modalFooter: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '20px',
        paddingTop: '16px',
        borderTop: '1px solid #e2e8f0',
        flexWrap: 'wrap',
        gap: '12px'
    },
    modalFooterRight: {
        display: 'flex',
        gap: '8px',
        marginLeft: 'auto'
    },
    button: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '0.9rem',
        fontWeight: '500',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap'
    },
    saveButton: {
        background: '#4f46e5',
        color: 'white'
    },
    cancelButton: {
        background: '#f1f5f9',
        color: '#475569'
    },
    dangerButton: {
        background: '#fee2e2',
        color: '#ef4444'
    },
    detailContent: {
        padding: '8px 0'
    },
    detailDescription: {
        margin: '0 0 20px 0',
        lineHeight: '1.6',
        color: '#475569'
    },
    detailMeta: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px',
        marginBottom: '20px',
        padding: '12px',
        background: '#f8fafc',
        borderRadius: '8px'
    },
    detailMetaItem: {
        fontSize: '0.9rem',
        color: '#1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap'
    },
    commentsSection: {
        marginTop: '20px'
    },
    commentsTitle: {
        margin: '0 0 12px 0',
        fontSize: '1rem',
        fontWeight: '600',
        color: '#1e293b'
    },
    commentsList: {
        marginBottom: '16px',
        maxHeight: '300px',
        overflowY: 'auto'
    },
    noComments: {
        textAlign: 'center',
        color: '#94a3b8',
        padding: '20px'
    },
    commentItem: {
        padding: '10px',
        background: '#f8fafc',
        borderRadius: '8px',
        marginBottom: '8px'
    },
    commentHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px'
    },
    commentAuthor: {
        fontSize: '0.8rem',
        fontWeight: '600',
        color: '#1e293b'
    },
    commentTime: {
        fontSize: '0.7rem',
        color: '#94a3b8'
    },
    commentText: {
        margin: 0,
        fontSize: '0.85rem',
        color: '#475569'
    },
    commentInput: {
        display: 'flex',
        gap: '8px'
    },
    commentField: {
        flex: 1,
        padding: '8px 12px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        fontSize: '0.9rem',
        outline: 'none'
    },
    commentButton: {
        padding: '8px 16px',
        background: '#4f46e5',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontSize: '0.9rem',
        fontWeight: '500',
        cursor: 'pointer'
    },
    attachmentsSection: {
        marginTop: '20px'
    }
};



export default KanbanBoard;