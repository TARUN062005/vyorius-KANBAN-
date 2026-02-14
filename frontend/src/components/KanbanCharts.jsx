import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { motion } from 'framer-motion';

const KanbanCharts = ({ metrics }) => {
    return (
        <motion.div
            className="charts-row"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
        >
            <div className="chart-card">
                <h3 className="chart-title">Task Distribution</h3>
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={metrics.columnData} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={80} />
                        <Tooltip
                            contentStyle={{ background: 'white', border: 'none', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                        />
                        <Bar dataKey="count">
                            {metrics.columnData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="chart-card">
                <h3 className="chart-title">Priority Breakdown</h3>
                <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                        <Pie
                            data={metrics.priorityData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="count"
                        >
                            {metrics.priorityData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    );
};

export default KanbanCharts;
