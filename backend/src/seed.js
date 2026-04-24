const pool = require('./db');
const bcrypt = require('bcryptjs');
const initDatabase = require('./initDb');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const seedData = async () => {
  const client = await pool.connect();

  try {
    // Initialize database tables
    await initDatabase();

    // Clear existing data
    await client.query('TRUNCATE users, equipment, routes, safety_incidents, assembly_lines, supply_chain, notifications, audit_logs, shifts, feedback, file_uploads, user_settings, password_resets RESTART IDENTITY CASCADE');

    // Seed Users
    const hashedPassword = await bcrypt.hash(process.env.DEFAULT_PASSWORD || 'admin123', 10);
    await client.query(`
      INSERT INTO users (email, password, name, role, department, phone, email_verified) VALUES
      ($1, $2, 'Admin User', 'admin', 'IT', '555-0100', true),
      ('operator@manufacturing.com', $2, 'John Operator', 'operator', 'Manufacturing', '555-0101', true),
      ('manager@manufacturing.com', $2, 'Sarah Manager', 'manager', 'Operations', '555-0102', true)
    `, [process.env.DEFAULT_EMAIL || 'admin@manufacturing.com', hashedPassword]);

    // Seed Equipment (16 items)
    await client.query(`
      INSERT INTO equipment (name, type, location, status, last_maintenance, next_maintenance, temperature, vibration, runtime_hours, failure_probability) VALUES
      ('CNC Machine A1', 'CNC Mill', 'Building A - Floor 1', 'operational', '2024-01-15', '2024-04-15', 45.5, 2.3, 12500, 15.2),
      ('CNC Machine A2', 'CNC Mill', 'Building A - Floor 1', 'warning', '2024-01-10', '2024-03-10', 52.8, 4.1, 15200, 35.8),
      ('Hydraulic Press B1', 'Press', 'Building B - Floor 1', 'operational', '2024-02-01', '2024-05-01', 38.2, 1.8, 8900, 8.5),
      ('Assembly Robot R1', 'Robot', 'Building A - Floor 2', 'operational', '2024-01-20', '2024-04-20', 32.1, 0.9, 6500, 5.2),
      ('Assembly Robot R2', 'Robot', 'Building A - Floor 2', 'maintenance', '2023-12-15', '2024-02-15', 28.5, 0.7, 7800, 12.1),
      ('Conveyor Belt C1', 'Conveyor', 'Building A - Floor 1', 'operational', '2024-01-25', '2024-04-25', 28.9, 1.2, 22000, 18.7),
      ('Welding Station W1', 'Welder', 'Building B - Floor 2', 'operational', '2024-02-05', '2024-05-05', 85.3, 3.5, 4500, 22.4),
      ('Packaging Machine P1', 'Packager', 'Building C - Floor 1', 'warning', '2023-11-20', '2024-02-20', 42.1, 5.2, 18500, 45.6),
      ('Laser Cutter L1', 'Cutter', 'Building A - Floor 3', 'operational', '2024-01-30', '2024-04-30', 55.7, 1.5, 9200, 11.3),
      ('3D Printer 3D1', '3D Printer', 'Building D - Lab', 'operational', '2024-02-10', '2024-05-10', 195.0, 0.3, 3200, 7.8),
      ('Injection Molder IM1', 'Molder', 'Building B - Floor 1', 'critical', '2023-10-15', '2024-01-15', 68.4, 6.8, 25000, 72.5),
      ('Quality Scanner QS1', 'Scanner', 'Building A - Floor 1', 'operational', '2024-02-15', '2024-05-15', 25.0, 0.2, 5600, 3.2),
      ('Paint Booth PB1', 'Painter', 'Building C - Floor 2', 'operational', '2024-01-05', '2024-04-05', 22.5, 0.5, 11000, 9.8),
      ('Forklift F1', 'Vehicle', 'Warehouse', 'operational', '2024-02-01', '2024-04-01', 35.0, 2.8, 4800, 14.5),
      ('Compressor CP1', 'Compressor', 'Utility Room', 'warning', '2023-12-01', '2024-03-01', 75.2, 4.5, 32000, 55.3),
      ('HVAC Unit HV1', 'HVAC', 'Building A - Roof', 'operational', '2024-01-15', '2024-07-15', 18.5, 1.1, 45000, 12.8)
    `);

    // Seed Routes (16 items)
    await client.query(`
      INSERT INTO routes (name, origin, destination, distance, estimated_time, vehicle_type, priority, status, waypoints) VALUES
      ('Chicago to Detroit', 'Chicago, IL', 'Detroit, MI', 450.5, 280, 'Semi-Truck', 'high', 'active', 'Gary, Kalamazoo'),
      ('LA to Phoenix', 'Los Angeles, CA', 'Phoenix, AZ', 580.2, 350, 'Semi-Truck', 'normal', 'pending', 'Palm Springs, Blythe'),
      ('NYC to Boston', 'New York, NY', 'Boston, MA', 340.8, 240, 'Van', 'urgent', 'active', 'Hartford'),
      ('Dallas to Houston', 'Dallas, TX', 'Houston, TX', 385.0, 230, 'Semi-Truck', 'normal', 'completed', 'Corsicana, Buffalo'),
      ('Seattle to Portland', 'Seattle, WA', 'Portland, OR', 280.5, 180, 'Van', 'low', 'pending', 'Tacoma, Olympia'),
      ('Miami to Orlando', 'Miami, FL', 'Orlando, FL', 380.0, 220, 'Box Truck', 'high', 'active', 'Fort Lauderdale, West Palm Beach'),
      ('Denver to Salt Lake', 'Denver, CO', 'Salt Lake City, UT', 820.3, 480, 'Semi-Truck', 'normal', 'pending', 'Grand Junction, Green River'),
      ('Atlanta to Nashville', 'Atlanta, GA', 'Nashville, TN', 400.2, 250, 'Van', 'urgent', 'active', 'Chattanooga'),
      ('San Francisco to Sacramento', 'San Francisco, CA', 'Sacramento, CA', 150.5, 90, 'Van', 'low', 'completed', 'Oakland, Fairfield'),
      ('Philadelphia to DC', 'Philadelphia, PA', 'Washington, DC', 220.8, 150, 'Box Truck', 'high', 'active', 'Baltimore'),
      ('Minneapolis to Milwaukee', 'Minneapolis, MN', 'Milwaukee, WI', 540.0, 320, 'Semi-Truck', 'normal', 'pending', 'Madison'),
      ('Las Vegas to San Diego', 'Las Vegas, NV', 'San Diego, CA', 530.5, 310, 'Semi-Truck', 'normal', 'pending', 'Barstow'),
      ('Cleveland to Pittsburgh', 'Cleveland, OH', 'Pittsburgh, PA', 215.2, 140, 'Van', 'high', 'active', 'Youngstown'),
      ('Kansas City to St Louis', 'Kansas City, MO', 'St. Louis, MO', 400.0, 240, 'Box Truck', 'normal', 'pending', 'Columbia'),
      ('Indianapolis to Columbus', 'Indianapolis, IN', 'Columbus, OH', 280.5, 170, 'Van', 'low', 'completed', 'Dayton'),
      ('Charlotte to Raleigh', 'Charlotte, NC', 'Raleigh, NC', 260.0, 160, 'Box Truck', 'urgent', 'active', 'Greensboro')
    `);

    // Seed Safety Incidents (16 items)
    await client.query(`
      INSERT INTO safety_incidents (title, description, location, severity, incident_type, reported_by, status, risk_score) VALUES
      ('Wet Floor Slip Hazard', 'Water leak from cooling system creating slip hazard', 'Building A - Floor 1', 'medium', 'slip_fall', 'John Smith', 'open', 45.5),
      ('Missing Machine Guard', 'Safety guard removed from CNC machine for maintenance not replaced', 'Building A - Floor 1', 'high', 'equipment', 'Mike Johnson', 'investigating', 72.3),
      ('Chemical Spill', 'Minor lubricant spill near hydraulic press', 'Building B - Floor 1', 'medium', 'chemical', 'Sarah Williams', 'resolved', 38.2),
      ('Electrical Hazard', 'Exposed wiring near assembly station', 'Building A - Floor 2', 'critical', 'electrical', 'Tom Brown', 'open', 85.6),
      ('Forklift Near Miss', 'Forklift nearly struck pedestrian in warehouse', 'Warehouse', 'high', 'vehicle', 'Lisa Davis', 'investigating', 68.9),
      ('Noise Level Exceeded', 'Compressor room exceeding safe noise levels', 'Utility Room', 'low', 'environmental', 'Chris Lee', 'open', 25.4),
      ('Fire Extinguisher Expired', 'Multiple fire extinguishers past inspection date', 'Building C - All Floors', 'medium', 'fire_safety', 'Amy Wilson', 'resolved', 42.1),
      ('Blocked Emergency Exit', 'Pallets blocking emergency exit door', 'Building B - Floor 1', 'high', 'egress', 'David Garcia', 'resolved', 65.8),
      ('PPE Non-Compliance', 'Workers not wearing required safety glasses', 'Building A - Floor 3', 'medium', 'ppe', 'Jennifer Martinez', 'open', 35.7),
      ('Ergonomic Issue', 'Repetitive strain injuries reported at packaging station', 'Building C - Floor 1', 'medium', 'ergonomic', 'Robert Anderson', 'investigating', 48.3),
      ('Hot Surface Warning Missing', 'Missing warning signs on welding station', 'Building B - Floor 2', 'medium', 'signage', 'Michelle Taylor', 'open', 40.2),
      ('Ventilation Failure', 'Paint booth ventilation not functioning properly', 'Building C - Floor 2', 'high', 'environmental', 'Kevin Thomas', 'investigating', 71.5),
      ('Ladder Damage', 'Cracked step on rolling ladder', 'Warehouse', 'medium', 'equipment', 'Nancy Jackson', 'resolved', 52.8),
      ('First Aid Kit Empty', 'Station first aid kit supplies depleted', 'Building A - Floor 1', 'low', 'medical', 'Paul White', 'resolved', 22.1),
      ('Crane Inspection Overdue', 'Overhead crane past scheduled inspection', 'Building B - Floor 2', 'critical', 'equipment', 'Linda Harris', 'open', 88.4),
      ('Tripping Hazard', 'Cables running across walkway', 'Building D - Lab', 'medium', 'slip_fall', 'Mark Clark', 'open', 44.6)
    `);

    // Seed Assembly Lines (16 items)
    await client.query(`
      INSERT INTO assembly_lines (name, product, capacity, current_output, efficiency, workers, stations, bottleneck, status) VALUES
      ('Line Alpha', 'Engine Components', 500, 425, 85.0, 12, 8, 'Station 3 - Welding', 'running'),
      ('Line Beta', 'Transmission Parts', 400, 380, 95.0, 10, 6, 'None', 'running'),
      ('Line Gamma', 'Brake Systems', 350, 280, 80.0, 8, 5, 'Station 2 - Assembly', 'running'),
      ('Line Delta', 'Electrical Harnesses', 600, 540, 90.0, 15, 10, 'Station 7 - Testing', 'running'),
      ('Line Epsilon', 'Dashboard Components', 300, 195, 65.0, 9, 7, 'Station 4 - Quality Check', 'warning'),
      ('Line Zeta', 'Seat Assemblies', 250, 230, 92.0, 8, 5, 'None', 'running'),
      ('Line Eta', 'Door Panels', 400, 320, 80.0, 11, 8, 'Station 6 - Finishing', 'running'),
      ('Line Theta', 'Exhaust Systems', 200, 190, 95.0, 6, 4, 'None', 'running'),
      ('Line Iota', 'Steering Columns', 300, 210, 70.0, 9, 6, 'Station 1 - Material Feed', 'warning'),
      ('Line Kappa', 'Fuel Tanks', 350, 315, 90.0, 10, 7, 'None', 'running'),
      ('Line Lambda', 'HVAC Units', 280, 168, 60.0, 8, 6, 'Station 5 - Integration', 'critical'),
      ('Line Mu', 'Suspension Parts', 450, 405, 90.0, 12, 8, 'None', 'running'),
      ('Line Nu', 'Wheel Assemblies', 500, 475, 95.0, 14, 9, 'None', 'running'),
      ('Line Xi', 'Body Panels', 200, 150, 75.0, 7, 5, 'Station 3 - Pressing', 'running'),
      ('Line Omicron', 'Lighting Systems', 600, 510, 85.0, 16, 11, 'Station 8 - Packaging', 'running'),
      ('Line Pi', 'Audio Systems', 350, 0, 0.0, 10, 7, 'All Stations', 'stopped')
    `);

    // Seed Supply Chain (16 items)
    await client.query(`
      INSERT INTO supply_chain (item_name, supplier, origin_location, current_location, destination, quantity, status, estimated_arrival, tracking_number) VALUES
      ('Steel Coils', 'US Steel Corp', 'Pittsburgh, PA', 'Indianapolis, IN', 'Detroit Plant', 5000, 'in_transit', '2024-02-20', 'USC-2024-001234'),
      ('Aluminum Sheets', 'Alcoa Inc', 'Cleveland, OH', 'Cleveland, OH', 'Chicago Plant', 3000, 'processing', '2024-02-22', 'ALC-2024-005678'),
      ('Electronic Components', 'Samsung Electronics', 'Seoul, Korea', 'Los Angeles Port', 'San Jose Plant', 25000, 'customs', '2024-02-25', 'SAM-2024-009012'),
      ('Rubber Gaskets', 'Goodyear', 'Akron, OH', 'Delivered', 'Detroit Plant', 10000, 'delivered', '2024-02-15', 'GDY-2024-003456'),
      ('Plastic Moldings', 'DuPont', 'Wilmington, DE', 'Philadelphia, PA', 'Newark Plant', 8000, 'in_transit', '2024-02-19', 'DUP-2024-007890'),
      ('Copper Wiring', 'Phelps Dodge', 'Phoenix, AZ', 'Albuquerque, NM', 'Dallas Plant', 15000, 'in_transit', '2024-02-21', 'PHD-2024-002345'),
      ('Glass Panels', 'Corning Glass', 'Corning, NY', 'Syracuse, NY', 'Buffalo Plant', 2000, 'in_transit', '2024-02-18', 'CRN-2024-006789'),
      ('Lithium Batteries', 'Panasonic', 'Osaka, Japan', 'San Francisco Port', 'Fremont Plant', 5000, 'customs', '2024-02-28', 'PAN-2024-001234'),
      ('Carbon Fiber', 'Toray Industries', 'Tokyo, Japan', 'Seattle Port', 'Portland Plant', 1500, 'in_transit', '2024-02-24', 'TOR-2024-005678'),
      ('Leather Upholstery', 'Eagle Ottawa', 'Rochester Hills, MI', 'Delivered', 'Detroit Plant', 3500, 'delivered', '2024-02-14', 'EGL-2024-009012'),
      ('Paint Supplies', 'PPG Industries', 'Pittsburgh, PA', 'Columbus, OH', 'Indianapolis Plant', 4000, 'in_transit', '2024-02-17', 'PPG-2024-003456'),
      ('Fasteners', 'Illinois Tool Works', 'Chicago, IL', 'Delivered', 'Detroit Plant', 50000, 'delivered', '2024-02-13', 'ITW-2024-007890'),
      ('Sensors', 'Bosch', 'Stuttgart, Germany', 'New York Port', 'Boston Plant', 8000, 'customs', '2024-02-26', 'BSH-2024-002345'),
      ('Hydraulic Fluid', 'Shell', 'Houston, TX', 'San Antonio, TX', 'Phoenix Plant', 2000, 'in_transit', '2024-02-20', 'SHL-2024-006789'),
      ('Microchips', 'Intel', 'Santa Clara, CA', 'Fresno, CA', 'Los Angeles Plant', 12000, 'in_transit', '2024-02-19', 'INT-2024-001234'),
      ('Foam Padding', '3M Company', 'St. Paul, MN', 'Des Moines, IA', 'Kansas City Plant', 6000, 'in_transit', '2024-02-18', '3MC-2024-005678')
    `);

    // Seed Notifications (16 items)
    await client.query(`
      INSERT INTO notifications (title, message, type, severity, related_entity, related_id, user_id) VALUES
      ('Equipment Critical Alert', 'Injection Molder IM1 failure probability at 72.5%', 'alert', 'critical', 'equipment', 11, 1),
      ('Maintenance Due', 'CNC Machine A2 maintenance overdue by 15 days', 'warning', 'high', 'equipment', 2, 1),
      ('Safety Incident Reported', 'New critical electrical hazard reported in Building A', 'alert', 'critical', 'safety', 4, 1),
      ('Route Completed', 'Dallas to Houston delivery completed successfully', 'info', 'low', 'routes', 4, 1),
      ('Assembly Line Warning', 'Line Lambda efficiency dropped below 65%', 'warning', 'high', 'assembly', 11, 1),
      ('Supply Chain Delay', 'Samsung Electronics shipment delayed at customs', 'warning', 'medium', 'supply_chain', 3, 1),
      ('Shift Change Reminder', 'Night shift starting in 30 minutes', 'info', 'low', 'shifts', 3, 1),
      ('Equipment Temperature Alert', 'Welding Station W1 temperature exceeding normal range', 'alert', 'medium', 'equipment', 7, 1),
      ('Crane Inspection Overdue', 'Building B overhead crane needs immediate inspection', 'alert', 'critical', 'safety', 15, 1),
      ('New Feedback Received', 'User submitted bug report about dashboard loading', 'info', 'low', 'feedback', 1, 1),
      ('Compressor Warning', 'Compressor CP1 vibration levels increasing', 'warning', 'high', 'equipment', 15, 1),
      ('Route Optimization Available', 'AI suggests 15% fuel savings on Chicago-Detroit route', 'info', 'low', 'routes', 1, 1),
      ('PPE Compliance Alert', 'Safety glasses compliance below 80% in Building A', 'warning', 'medium', 'safety', 9, 1),
      ('Packaging Machine Alert', 'Packaging Machine P1 approaching failure threshold', 'alert', 'high', 'equipment', 8, 1),
      ('Supply Delivery Confirmed', 'Rubber Gaskets order delivered to Detroit Plant', 'info', 'low', 'supply_chain', 4, 1),
      ('System Update', 'Platform updated to version 2.1 with new features', 'info', 'low', NULL, NULL, 1)
    `);

    // Seed Shifts (16 items)
    await client.query(`
      INSERT INTO shifts (name, supervisor, start_time, end_time, department, workers_assigned, status, notes) VALUES
      ('Morning Shift A', 'John Smith', '06:00', '14:00', 'Manufacturing', 25, 'active', 'Full crew available'),
      ('Afternoon Shift A', 'Sarah Johnson', '14:00', '22:00', 'Manufacturing', 22, 'scheduled', 'Two workers on leave'),
      ('Night Shift A', 'Mike Brown', '22:00', '06:00', 'Manufacturing', 18, 'scheduled', 'Reduced crew for night ops'),
      ('Morning Shift B', 'Lisa Davis', '06:00', '14:00', 'Assembly', 30, 'active', 'Overtime approved'),
      ('Afternoon Shift B', 'Tom Wilson', '14:00', '22:00', 'Assembly', 28, 'scheduled', 'New trainees starting'),
      ('Night Shift B', 'Amy Chen', '22:00', '06:00', 'Assembly', 15, 'scheduled', 'Maintenance window 2-4 AM'),
      ('Day Shift - QC', 'Robert Taylor', '08:00', '16:00', 'Quality Control', 12, 'active', 'Audit week - extra inspections'),
      ('Evening Shift - QC', 'Karen White', '16:00', '00:00', 'Quality Control', 8, 'scheduled', 'Focus on assembly output'),
      ('Morning Shift - Warehouse', 'David Garcia', '05:00', '13:00', 'Warehouse', 20, 'active', 'Large shipment expected'),
      ('Afternoon Shift - Warehouse', 'Jennifer Martinez', '13:00', '21:00', 'Warehouse', 18, 'scheduled', 'Inventory count scheduled'),
      ('Swing Shift - Maintenance', 'Chris Anderson', '10:00', '18:00', 'Maintenance', 10, 'active', 'Planned equipment repairs'),
      ('Night Shift - Maintenance', 'Paul Robinson', '18:00', '02:00', 'Maintenance', 6, 'scheduled', 'Emergency on-call available'),
      ('Day Shift - Safety', 'Linda Harris', '07:00', '15:00', 'Safety', 8, 'active', 'Safety audit in Building B'),
      ('Morning Shift - Logistics', 'Kevin Thomas', '06:00', '14:00', 'Logistics', 14, 'active', 'Priority shipments pending'),
      ('Afternoon Shift - Logistics', 'Nancy Jackson', '14:00', '22:00', 'Logistics', 12, 'scheduled', 'Route optimization review'),
      ('Weekend Shift', 'Mark Clark', '08:00', '20:00', 'Manufacturing', 15, 'scheduled', 'Saturday overtime crew')
    `);

    // Seed Feedback (16 items)
    await client.query(`
      INSERT INTO feedback (user_id, user_email, type, subject, message, rating, status) VALUES
      (1, 'admin@manufacturing.com', 'bug', 'Dashboard loading slow', 'The dashboard takes too long to load when there are many equipment items', 3, 'pending'),
      (1, 'admin@manufacturing.com', 'feature', 'Export to PDF', 'Would be great to export reports in PDF format', 4, 'pending'),
      (2, 'operator@manufacturing.com', 'general', 'Great platform', 'Really enjoying the AI predictions feature', 5, 'reviewed'),
      (1, 'admin@manufacturing.com', 'bug', 'Search not working for special characters', 'When I search with & symbol, it returns no results', 2, 'in_progress'),
      (3, 'manager@manufacturing.com', 'feature', 'Mobile app', 'A mobile app would be very useful for floor managers', 4, 'pending'),
      (2, 'operator@manufacturing.com', 'general', 'Training materials', 'Need more documentation for new operators', 3, 'reviewed'),
      (1, 'admin@manufacturing.com', 'bug', 'Assembly line chart not rendering', 'The efficiency chart shows blank on Firefox', 2, 'in_progress'),
      (3, 'manager@manufacturing.com', 'feature', 'Slack integration', 'Would like notifications sent to Slack channels', 4, 'pending'),
      (2, 'operator@manufacturing.com', 'general', 'Shift scheduling improvement', 'The shift management feature saves us hours of planning', 5, 'reviewed'),
      (1, 'admin@manufacturing.com', 'bug', 'Date picker timezone issue', 'Maintenance dates showing wrong in Pacific timezone', 3, 'pending'),
      (3, 'manager@manufacturing.com', 'feature', 'Batch equipment updates', 'Ability to update multiple equipment items at once', 4, 'pending'),
      (2, 'operator@manufacturing.com', 'general', 'Safety predictions accurate', 'The AI safety predictions have been very accurate', 5, 'reviewed'),
      (1, 'admin@manufacturing.com', 'bug', 'Notification bell not updating', 'Unread count does not decrease after reading', 2, 'in_progress'),
      (3, 'manager@manufacturing.com', 'feature', 'Custom dashboard widgets', 'Let users customize their dashboard layout', 4, 'pending'),
      (2, 'operator@manufacturing.com', 'general', 'Route optimizer feedback', 'Saved 20% on fuel costs using route optimization', 5, 'reviewed'),
      (3, 'manager@manufacturing.com', 'feature', 'Multi-language support', 'Support for Spanish and Mandarin would be helpful', 3, 'pending')
    `);

    // Seed Audit Logs (16 items)
    await client.query(`
      INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, details, ip_address) VALUES
      (1, 'admin@manufacturing.com', 'LOGIN', 'user', 1, 'Admin logged in successfully', '192.168.1.100'),
      (1, 'admin@manufacturing.com', 'CREATE', 'equipment', 1, 'Created CNC Machine A1', '192.168.1.100'),
      (1, 'admin@manufacturing.com', 'UPDATE', 'equipment', 2, 'Updated CNC Machine A2 status to warning', '192.168.1.100'),
      (1, 'admin@manufacturing.com', 'DELETE', 'route', 5, 'Deleted route Seattle to Portland', '192.168.1.101'),
      (2, 'operator@manufacturing.com', 'CREATE', 'safety', 3, 'Reported chemical spill in Building B', '192.168.1.102'),
      (1, 'admin@manufacturing.com', 'CHANGE_ROLE', 'user', 2, 'Changed operator role to manager', '192.168.1.100'),
      (1, 'admin@manufacturing.com', 'EXPORT', 'equipment', NULL, 'Exported 16 equipment records to CSV', '192.168.1.100'),
      (3, 'manager@manufacturing.com', 'UPDATE', 'assembly', 6, 'Updated Line Zeta efficiency', '192.168.1.103'),
      (1, 'admin@manufacturing.com', 'CREATE', 'shift', 1, 'Created Morning Shift A', '192.168.1.100'),
      (2, 'operator@manufacturing.com', 'LOGIN', 'user', 2, 'Operator logged in', '192.168.1.104'),
      (3, 'manager@manufacturing.com', 'UPDATE', 'supply_chain', 1, 'Updated Steel Coils tracking status', '192.168.1.100'),
      (1, 'admin@manufacturing.com', 'DELETE', 'safety', 14, 'Resolved and archived first aid incident', '192.168.1.100'),
      (2, 'operator@manufacturing.com', 'UPLOAD', 'file', 1, 'Uploaded incident photo for safety report', '192.168.1.102'),
      (1, 'admin@manufacturing.com', 'UPDATE_PROFILE', 'user', 1, 'Admin updated profile information', '192.168.1.100'),
      (1, 'admin@manufacturing.com', 'PASSWORD_RESET', 'user', 3, 'Manager password reset completed', '192.168.1.105'),
      (3, 'manager@manufacturing.com', 'CREATE', 'feedback', 1, 'Submitted feature request for mobile app', '192.168.1.106')
    `);

    // Seed User Settings
    await client.query(`
      INSERT INTO user_settings (user_id, theme, email_notifications, push_notifications, language) VALUES
      (1, 'dark', true, true, 'en'),
      (2, 'dark', true, false, 'en'),
      (3, 'light', true, true, 'en')
    `);

    console.log('All seed data inserted successfully!');
    console.log('Default login: admin@manufacturing.com / admin123');

  } catch (error) {
    console.error('Error seeding data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

seedData().then(() => {
  console.log('Seeding completed');
  process.exit(0);
}).catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
